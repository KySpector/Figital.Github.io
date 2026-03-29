"""Figital Trading Agent — Claude CEO with Coinbase AgentKit live execution."""

import json
import os
import sys

import anthropic
import requests

from trading_agent.config import ANTHROPIC_API_KEY, SYSTEM_PROMPT
from trading_agent.trade_logger import (
    get_all_data,
    log_portfolio_snapshot,
    log_token_usage,
    log_trade,
)

# Cost per million tokens for Claude Opus 4.6
INPUT_COST_PER_M = 5.00
OUTPUT_COST_PER_M = 25.00

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

# ---------------------------------------------------------------------------
# AgentKit live wallet (initialized lazily on first trade)
# ---------------------------------------------------------------------------
_agentkit = None
_wallet_provider = None


def _get_agentkit():
    """Lazily initialize AgentKit wallet connection."""
    global _agentkit, _wallet_provider
    if _agentkit is not None:
        return _agentkit

    from coinbase_agentkit import (
        AgentKit,
        AgentKitConfig,
        CdpEvmWalletProvider,
        CdpEvmWalletProviderConfig,
        cdp_api_action_provider,
        cdp_evm_wallet_action_provider,
        erc20_action_provider,
        wallet_action_provider,
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
    print(f"[LIVE] Wallet: {_wallet_provider.get_address()}")
    print(f"[LIVE] Network: {_wallet_provider.get_network()}")
    return _agentkit


def _agentkit_available():
    """Check whether AgentKit can be initialized."""
    required = ["CDP_API_KEY_ID", "CDP_API_KEY_SECRET", "CDP_WALLET_SECRET"]
    return all(os.environ.get(k) for k in required)


# ---------------------------------------------------------------------------
# Live price feeds via CoinGecko (free, no auth)
# ---------------------------------------------------------------------------
COINGECKO_IDS = {
    "ETH": "ethereum",
    "BTC": "bitcoin",
    "USDC": "usd-coin",
    "AERO": "aerodrome-finance",
    "DEGEN": "degen-base",
    "BRETT": "brett",
}

# Fallback prices from last web search (2026-03-29)
LIVE_PRICES = {
    "ETH": 2024.00,
    "USDC": 1.00,
    "AERO": 0.3194,
    "DEGEN": 0.0006802,
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
        print(f"[PRICES] Updated: {LIVE_PRICES}")
    except Exception as e:
        print(f"[PRICES] CoinGecko unavailable ({e}), using fallback prices")


# ---------------------------------------------------------------------------
# Tool definitions for the Claude agent loop
# ---------------------------------------------------------------------------
TOOLS = [
    {
        "name": "get_balances",
        "description": "Get all current wallet balances on Coinbase and Base.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "execute_trade",
        "description": "Execute a trade on Coinbase. Swaps one asset for another.",
        "input_schema": {
            "type": "object",
            "properties": {
                "from_asset": {
                    "type": "string",
                    "description": "Asset to sell (e.g. USDC, ETH, BTC)",
                },
                "to_asset": {
                    "type": "string",
                    "description": "Asset to buy (e.g. ETH, AERO, DEGEN)",
                },
                "amount_usd": {
                    "type": "number",
                    "description": "Amount in USD to trade",
                },
                "reasoning": {
                    "type": "string",
                    "description": "Why this trade is being made",
                },
            },
            "required": ["from_asset", "to_asset", "amount_usd", "reasoning"],
        },
    },
    {
        "name": "get_asset_price",
        "description": "Get the current price of a crypto asset in USD.",
        "input_schema": {
            "type": "object",
            "properties": {
                "asset": {
                    "type": "string",
                    "description": "Asset symbol (e.g. ETH, BTC, AERO)",
                },
            },
            "required": ["asset"],
        },
    },
    {
        "name": "get_trade_history",
        "description": "Get all past trades, token usage, and portfolio snapshots.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "log_portfolio",
        "description": "Log a portfolio snapshot with current balances.",
        "input_schema": {
            "type": "object",
            "properties": {
                "balances": {
                    "type": "object",
                    "description": "Current balances as {asset: {amount, value_usd}}",
                },
            },
            "required": ["balances"],
        },
    },
]


# ---------------------------------------------------------------------------
# Tool execution — routes to AgentKit live or paper trading
# ---------------------------------------------------------------------------
def execute_tool(tool_name, tool_input):
    """Route tool calls to live AgentKit or paper trading fallback."""

    if tool_name == "get_balances":
        # Try live wallet first
        if _agentkit_available():
            try:
                kit = _get_agentkit()
                for action in kit.get_tools():
                    if "balance" in action.name.lower():
                        result = action.invoke({})
                        return json.dumps({
                            "status": "live",
                            "wallet": _wallet_provider.get_address(),
                            "result": str(result),
                        })
            except Exception as e:
                print(f"[WARN] Live balance check failed: {e}")

        # Fallback to logged snapshots
        data = get_all_data()
        snapshots = data.get("portfolio_snapshots", [])
        if snapshots:
            return json.dumps({
                "status": "paper",
                "balances": snapshots[-1]["balances"],
                "as_of": snapshots[-1]["timestamp"],
            })
        return json.dumps({
            "status": "paper",
            "balances": {"USDC": {"amount": 200.0, "value_usd": 200.0}},
        })

    elif tool_name == "execute_trade":
        from_asset = tool_input["from_asset"]
        to_asset = tool_input["to_asset"]
        amount_usd = tool_input["amount_usd"]
        reasoning = tool_input["reasoning"]
        price = LIVE_PRICES.get(to_asset, "unknown")
        mode = "paper"

        # Try live execution via AgentKit
        if _agentkit_available():
            try:
                kit = _get_agentkit()
                for action in kit.get_tools():
                    if "swap" in action.name.lower() or "trade" in action.name.lower():
                        result = action.invoke({
                            "from_asset_id": from_asset.lower(),
                            "to_asset_id": to_asset.lower(),
                            "amount": str(amount_usd),
                        })
                        mode = "live"
                        print(f"[LIVE TRADE] {from_asset} -> {to_asset}: {result}")
                        break
            except Exception as e:
                print(f"[WARN] Live trade failed, logging as paper: {e}")

        # Always log the trade
        log_trade(
            action=f"SWAP {from_asset} -> {to_asset}",
            asset=to_asset,
            amount_usd=amount_usd,
            price=price,
            reasoning=reasoning,
        )

        qty = round(amount_usd / price, 6) if isinstance(price, (int, float)) else "pending"

        return json.dumps({
            "status": "executed",
            "mode": mode,
            "message": (
                f"Swapped ${amount_usd} {from_asset} -> {to_asset} "
                f"at ${price} ({qty} {to_asset})"
            ),
            "logged": True,
        })

    elif tool_name == "get_asset_price":
        asset = tool_input["asset"]
        price = LIVE_PRICES.get(asset)
        if price:
            return json.dumps({"asset": asset, "price_usd": price, "status": "live"})
        return json.dumps({"asset": asset, "status": "not_found"})

    elif tool_name == "get_trade_history":
        return json.dumps(get_all_data())

    elif tool_name == "log_portfolio":
        log_portfolio_snapshot(tool_input["balances"])
        return json.dumps({"status": "logged"})

    return json.dumps({"error": f"Unknown tool: {tool_name}"})


def _calculate_cost(usage):
    input_cost = (usage.input_tokens / 1_000_000) * INPUT_COST_PER_M
    output_cost = (usage.output_tokens / 1_000_000) * OUTPUT_COST_PER_M
    return input_cost + output_cost


def run_agent(user_message):
    """Run a single agent turn with tool use loop."""
    messages = [{"role": "user", "content": user_message}]

    while True:
        response = client.messages.create(
            model="claude-opus-4-6",
            max_tokens=16000,
            system=SYSTEM_PROMPT,
            thinking={"type": "adaptive"},
            tools=TOOLS,
            messages=messages,
        )

        # Track token costs
        cost = _calculate_cost(response.usage)
        log_token_usage(
            response.usage.input_tokens,
            response.usage.output_tokens,
            cost,
        )

        if response.stop_reason == "end_turn":
            text_parts = [
                block.text for block in response.content if block.type == "text"
            ]
            return "\n".join(text_parts)

        # Handle tool use
        tool_use_blocks = [b for b in response.content if b.type == "tool_use"]
        if not tool_use_blocks:
            text_parts = [
                block.text for block in response.content if block.type == "text"
            ]
            return "\n".join(text_parts)

        messages.append({"role": "assistant", "content": response.content})

        tool_results = []
        for tool in tool_use_blocks:
            result = execute_tool(tool.name, tool.input)
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tool.id,
                "content": result,
            })

        messages.append({"role": "user", "content": tool_results})


if __name__ == "__main__":
    print("=== Figital Trading Agent ===")
    print(f"Mode: {'LIVE' if _agentkit_available() else 'PAPER'}\n")

    # Fetch latest prices
    fetch_live_prices()

    result = run_agent(
        "Check your current portfolio. Fetch live prices for ETH, AERO, DEGEN, "
        "BRETT. Calculate P&L vs entry prices. Apply strategy rules — take profit "
        "at +50%, stop loss at -25%, rebalance if needed. Execute any trades."
    )
    print(result)
