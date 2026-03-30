"""Figital Trading Agent — Autonomous rule-based trader with live execution.

No Anthropic API needed. Executes the trading strategy algorithmically:
- Fetch live prices
- Calculate P&L vs entry prices
- Apply rules: take profit +50%, stop loss -25%, rebalance on >20% move
- Execute trades via AgentKit (or log as paper trades)
"""

import json
import os
import sys
import time
from datetime import datetime, timezone

import requests

from trading_agent.trade_logger import (
    get_all_data,
    log_portfolio_snapshot,
    log_trade,
)

# ---------------------------------------------------------------------------
# Strategy constants
# ---------------------------------------------------------------------------
TAKE_PROFIT = 0.50   # +50%
STOP_LOSS = -0.25    # -25%
REBALANCE_THRESHOLD = 0.20  # >20% drift triggers rebalance
MIN_STABLE_PCT = 0.10  # Keep at least 10% in stables
PORTFOLIO_START_USD = 200.0

# Target allocation weights
TARGET_ALLOC = {
    "ETH": 0.40,
    "AERO": 0.25,
    "DEGEN": 0.15,
    "BRETT": 0.10,
    "USDC": 0.10,
}

# Entry prices from initial allocation (2026-03-29)
ENTRY_PRICES = {
    "ETH": 2024.00,
    "AERO": 0.3194,
    "DEGEN": 0.0006802,
    "BRETT": 0.006233,
}

# ---------------------------------------------------------------------------
# CoinGecko price feeds (free, no auth)
# ---------------------------------------------------------------------------
COINGECKO_IDS = {
    "ETH": "ethereum",
    "BTC": "bitcoin",
    "USDC": "usd-coin",
    "AERO": "aerodrome-finance",
    "DEGEN": "degen-base",
    "BRETT": "brett",
}

# Fallback prices from last web search (2026-03-30 12:45 UTC)
LIVE_PRICES = {
    "ETH": 2003.85,
    "USDC": 1.00,
    "AERO": 0.3162,
    "DEGEN": 0.0006677,
    "BRETT": 0.006233,
    "BTC": 87500.00,
}


def fetch_live_prices():
    """Fetch live prices from CoinGecko. Updates LIVE_PRICES in place."""
    ids = ",".join(COINGECKO_IDS.values())
    url = f"https://api.coingecko.com/api/v3/simple/price?ids={ids}&vs_currencies=usd"
    try:
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        data = r.json()
        reverse_map = {v: k for k, v in COINGECKO_IDS.items()}
        for gecko_id, price_data in data.items():
            symbol = reverse_map.get(gecko_id)
            if symbol and "usd" in price_data:
                LIVE_PRICES[symbol] = price_data["usd"]
        print(f"  [OK] Prices updated from CoinGecko")
        return True
    except Exception as e:
        print(f"  [WARN] CoinGecko unavailable ({e}), using fallback prices")
        return False


# ---------------------------------------------------------------------------
# AgentKit live wallet (initialized lazily)
# ---------------------------------------------------------------------------
_agentkit = None
_wallet_provider = None


def _get_agentkit():
    global _agentkit, _wallet_provider
    if _agentkit is not None:
        return _agentkit

    from coinbase_agentkit import (
        AgentKit, AgentKitConfig,
        CdpEvmWalletProvider, CdpEvmWalletProviderConfig,
        cdp_api_action_provider, cdp_evm_wallet_action_provider,
        erc20_action_provider, wallet_action_provider,
    )

    wallet_config = CdpEvmWalletProviderConfig(
        api_key_id=os.environ.get("CDP_API_KEY_ID"),
        api_key_secret=os.environ.get("CDP_API_KEY_SECRET"),
        wallet_secret=os.environ.get("CDP_WALLET_SECRET"),
        network_id=os.environ.get("NETWORK_ID", "base-mainnet"),
    )

    _wallet_provider = CdpEvmWalletProvider(wallet_config)
    _agentkit = AgentKit(AgentKitConfig(
        wallet_provider=_wallet_provider,
        action_providers=[
            cdp_api_action_provider(),
            cdp_evm_wallet_action_provider(),
            erc20_action_provider(),
            wallet_action_provider(),
        ],
    ))
    return _agentkit


def agentkit_available():
    required = ["CDP_API_KEY_ID", "CDP_API_KEY_SECRET", "CDP_WALLET_SECRET"]
    return all(os.environ.get(k) for k in required)


def execute_live_trade(from_asset, to_asset, amount_usd):
    """Try to execute a trade via AgentKit. Returns True if successful."""
    if not agentkit_available():
        return False
    try:
        kit = _get_agentkit()
        for action in kit.get_tools():
            if "swap" in action.name.lower() or "trade" in action.name.lower():
                result = action.invoke({
                    "from_asset_id": from_asset.lower(),
                    "to_asset_id": to_asset.lower(),
                    "amount": str(amount_usd),
                })
                print(f"  [LIVE] {from_asset} -> {to_asset}: {result}")
                return True
    except Exception as e:
        print(f"  [WARN] Live trade failed: {e}")
    return False


# ---------------------------------------------------------------------------
# Portfolio tracking
# ---------------------------------------------------------------------------
def get_current_portfolio():
    """Get current portfolio from latest snapshot, or build from trades."""
    data = get_all_data()
    snapshots = data.get("portfolio_snapshots", [])
    if snapshots:
        return snapshots[-1]["balances"]

    # Default initial portfolio
    return {
        "ETH": {"amount": 0.039526, "value_usd": 80.0},
        "AERO": {"amount": 156.543519, "value_usd": 50.0},
        "DEGEN": {"amount": 44104.68, "value_usd": 30.0},
        "BRETT": {"amount": 3208.73, "value_usd": 20.0},
        "USDC": {"amount": 20.0, "value_usd": 20.0},
    }


def calculate_pnl(portfolio):
    """Calculate P&L for each position using live prices."""
    results = {}
    total_value = 0
    for asset, holding in portfolio.items():
        amount = holding["amount"]
        price = LIVE_PRICES.get(asset, 0)
        current_value = amount * price
        entry_price = ENTRY_PRICES.get(asset)

        if entry_price and entry_price > 0:
            pnl_pct = (price - entry_price) / entry_price
        else:
            pnl_pct = 0.0

        results[asset] = {
            "amount": amount,
            "price": price,
            "value_usd": round(current_value, 2),
            "entry_price": entry_price,
            "pnl_pct": round(pnl_pct, 4),
        }
        total_value += current_value

    return results, round(total_value, 2)


# ---------------------------------------------------------------------------
# Strategy engine
# ---------------------------------------------------------------------------
def check_strategy(portfolio):
    """Apply trading rules. Returns list of actions to take."""
    pnl_data, total_value = calculate_pnl(portfolio)
    actions = []

    print(f"\n  Portfolio value: ${total_value:.2f}")
    print(f"  {'Asset':<8} {'Price':>12} {'Value':>10} {'P&L':>8}")
    print(f"  {'-'*42}")

    for asset, info in pnl_data.items():
        pnl_str = f"{info['pnl_pct']:+.1%}" if info["entry_price"] else "n/a"
        print(f"  {asset:<8} ${info['price']:>11.4f} ${info['value_usd']:>9.2f} {pnl_str:>8}")

        # Skip stablecoins
        if asset == "USDC":
            continue

        # Take profit: +50%
        if info["pnl_pct"] >= TAKE_PROFIT:
            sell_value = info["value_usd"] * 0.5  # Sell half
            actions.append({
                "type": "take_profit",
                "from_asset": asset,
                "to_asset": "USDC",
                "amount_usd": round(sell_value, 2),
                "reasoning": (
                    f"TAKE PROFIT: {asset} is up {info['pnl_pct']:+.1%} "
                    f"(${info['entry_price']} -> ${info['price']}). "
                    f"Selling 50% (${sell_value:.2f}) to lock gains."
                ),
            })

        # Stop loss: -25%
        elif info["pnl_pct"] <= STOP_LOSS:
            actions.append({
                "type": "stop_loss",
                "from_asset": asset,
                "to_asset": "USDC",
                "amount_usd": round(info["value_usd"], 2),
                "reasoning": (
                    f"STOP LOSS: {asset} is down {info['pnl_pct']:+.1%} "
                    f"(${info['entry_price']} -> ${info['price']}). "
                    f"Cutting position to preserve capital."
                ),
            })

    # Check allocation drift for rebalancing
    if total_value > 0:
        for asset, info in pnl_data.items():
            current_alloc = info["value_usd"] / total_value
            target_alloc = TARGET_ALLOC.get(asset, 0)
            drift = abs(current_alloc - target_alloc)
            if drift > REBALANCE_THRESHOLD and asset != "USDC":
                if current_alloc > target_alloc:
                    trim = round((current_alloc - target_alloc) * total_value, 2)
                    actions.append({
                        "type": "rebalance",
                        "from_asset": asset,
                        "to_asset": "USDC",
                        "amount_usd": trim,
                        "reasoning": (
                            f"REBALANCE: {asset} drifted to {current_alloc:.0%} "
                            f"(target {target_alloc:.0%}). Trimming ${trim}."
                        ),
                    })

    if not actions:
        print("\n  [OK] No trades needed — all positions within strategy bounds.")

    return actions, pnl_data, total_value


def execute_actions(actions, portfolio):
    """Execute trading actions and update portfolio."""
    for action in actions:
        from_asset = action["from_asset"]
        to_asset = action["to_asset"]
        amount_usd = action["amount_usd"]
        reasoning = action["reasoning"]

        print(f"\n  >>> {action['type'].upper()}: {from_asset} -> {to_asset} (${amount_usd})")
        print(f"      {reasoning}")

        # Try live execution
        mode = "paper"
        if execute_live_trade(from_asset, to_asset, amount_usd):
            mode = "live"

        # Log the trade
        price = LIVE_PRICES.get(to_asset, 1.0)
        log_trade(
            action=f"SWAP {from_asset} -> {to_asset}",
            asset=to_asset,
            amount_usd=amount_usd,
            price=price,
            reasoning=f"[{mode.upper()}] {reasoning}",
        )

        # Update portfolio in memory
        from_price = LIVE_PRICES.get(from_asset, 1.0)
        to_price = LIVE_PRICES.get(to_asset, 1.0)

        if from_asset in portfolio:
            sell_qty = amount_usd / from_price if from_price > 0 else 0
            portfolio[from_asset]["amount"] = max(0, portfolio[from_asset]["amount"] - sell_qty)
            portfolio[from_asset]["value_usd"] = portfolio[from_asset]["amount"] * from_price

        if to_asset in portfolio:
            buy_qty = amount_usd / to_price if to_price > 0 else 0
            portfolio[to_asset]["amount"] += buy_qty
            portfolio[to_asset]["value_usd"] = portfolio[to_asset]["amount"] * to_price
        else:
            buy_qty = amount_usd / to_price if to_price > 0 else 0
            portfolio[to_asset] = {"amount": buy_qty, "value_usd": amount_usd}

    return portfolio


# ---------------------------------------------------------------------------
# Main trading loop
# ---------------------------------------------------------------------------
def run_once():
    """Run one cycle of the trading strategy."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    print(f"\n{'='*50}")
    print(f"  FIGITAL TRADING — Strategy Check")
    print(f"  {now}")
    mode = "LIVE" if agentkit_available() else "PAPER"
    print(f"  Mode: {mode}")
    print(f"{'='*50}")

    # 1. Fetch prices
    print("\n[1] Fetching live prices...")
    fetch_live_prices()
    for asset, price in LIVE_PRICES.items():
        if asset in TARGET_ALLOC:
            print(f"    {asset}: ${price}")

    # 2. Load portfolio
    print("\n[2] Loading portfolio...")
    portfolio = get_current_portfolio()

    # 3. Check strategy rules
    print("\n[3] Analyzing positions...")
    actions, pnl_data, total_value = check_strategy(portfolio)

    # 4. Execute any trades
    if actions:
        print(f"\n[4] Executing {len(actions)} trade(s)...")
        portfolio = execute_actions(actions, portfolio)
    else:
        print("\n[4] No trades to execute.")

    # 5. Save updated portfolio snapshot
    print("\n[5] Saving portfolio snapshot...")
    updated_portfolio = {}
    for asset, holding in portfolio.items():
        price = LIVE_PRICES.get(asset, 0)
        amount = holding["amount"]
        updated_portfolio[asset] = {
            "amount": round(amount, 6),
            "value_usd": round(amount * price, 2),
        }
    log_portfolio_snapshot(updated_portfolio)

    # Summary
    print(f"\n{'='*50}")
    print(f"  SUMMARY")
    overall_pnl = total_value - PORTFOLIO_START_USD
    overall_pct = (overall_pnl / PORTFOLIO_START_USD) * 100
    print(f"  Portfolio: ${total_value:.2f} ({overall_pnl:+.2f}, {overall_pct:+.1f}%)")
    print(f"  Trades executed: {len(actions)}")
    print(f"  Mode: {mode}")
    print(f"{'='*50}\n")

    return total_value, actions


def run_loop(interval_minutes=60):
    """Run the trading strategy on a loop."""
    print(f"Starting trading loop (every {interval_minutes}m)...")
    print(f"Press Ctrl+C to stop.\n")

    while True:
        try:
            run_once()
            print(f"Next check in {interval_minutes} minutes...")
            time.sleep(interval_minutes * 60)
        except KeyboardInterrupt:
            print("\nTrading stopped by user.")
            break
        except Exception as e:
            print(f"\n[ERROR] {e}")
            print(f"Retrying in 5 minutes...")
            time.sleep(300)


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

    if "--loop" in sys.argv:
        interval = 60
        for arg in sys.argv:
            if arg.startswith("--interval="):
                interval = int(arg.split("=")[1])
        run_loop(interval)
    else:
        run_once()
