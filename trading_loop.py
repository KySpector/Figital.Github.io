"""Figital Trading Loop — runs strategy checks using WebSearch-sourced prices."""

import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
from trading_agent.trade_logger import log_portfolio_snapshot, log_trade, get_all_data

ENTRY = {"ETH": 2024.00, "AERO": 0.3194, "DEGEN": 0.0006802, "BRETT": 0.006233}
HOLDINGS = {"ETH": 0.039526, "AERO": 156.543519, "DEGEN": 44104.68, "BRETT": 3208.73, "USDC": 20.00}
TARGET = {"ETH": 0.40, "AERO": 0.25, "DEGEN": 0.15, "BRETT": 0.10, "USDC": 0.10}

# Latest known prices (updated each cycle by parent process)
PRICES_FILE = os.path.join(os.path.dirname(__file__), ".live_prices.json")

def load_prices():
    if os.path.exists(PRICES_FILE):
        with open(PRICES_FILE) as f:
            return json.load(f)
    return {"ETH": 2069.93, "USDC": 1.00, "AERO": 0.3162, "DEGEN": 0.000668, "BRETT": 0.006182}

def get_holdings():
    """Get latest holdings from last snapshot, or use defaults."""
    data = get_all_data()
    snaps = data.get("portfolio_snapshots", [])
    if snaps:
        last = snaps[-1]["balances"]
        return {k: v["amount"] for k, v in last.items()}
    return HOLDINGS.copy()

def run_strategy():
    prices = load_prices()
    holdings = get_holdings()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    print(f"\n{'='*50}")
    print(f"  FIGITAL TRADING — {now}")
    print(f"{'='*50}")

    total = 0
    print(f"\n  {'Asset':<8} {'Price':>10} {'Value':>10} {'P&L':>8}")
    print(f"  {'-'*40}")
    for asset, qty in holdings.items():
        price = prices.get(asset, 1.0)
        val = qty * price
        total += val
        entry = ENTRY.get(asset)
        pnl = f"{(price-entry)/entry:+.1%}" if entry else "---"
        print(f"  {asset:<8} ${price:>9.4f} ${val:>9.2f} {pnl:>8}")
    print(f"  {'-'*40}")
    pnl_total = total - 200
    print(f"  {'TOTAL':<8} {'':>10} ${total:>9.2f} {pnl_total/200*100:+.1f}%")

    # Check triggers
    trades = []
    for asset in ["ETH", "AERO", "DEGEN", "BRETT"]:
        if asset not in prices or asset not in ENTRY:
            continue
        pnl = (prices[asset] - ENTRY[asset]) / ENTRY[asset]
        if pnl >= 0.50:
            val = holdings.get(asset, 0) * prices[asset]
            sell = round(val * 0.5, 2)
            trades.append((asset, sell, f"TAKE PROFIT {asset} {pnl:+.1%}, sell 50%"))
            print(f"  >>> TAKE PROFIT: {asset} {pnl:+.1%}")
        elif pnl <= -0.25:
            val = holdings.get(asset, 0) * prices[asset]
            trades.append((asset, round(val, 2), f"STOP LOSS {asset} {pnl:+.1%}, sell 100%"))
            print(f"  >>> STOP LOSS: {asset} {pnl:+.1%}")
        else:
            print(f"  {asset}: {pnl:+.1%} — HOLD")

    for asset, amt, reason in trades:
        log_trade(f"SWAP {asset} -> USDC", "USDC", amt, prices.get(asset, 0), reason)
        print(f"  TRADE LOGGED: {reason}")

    # Save snapshot
    snap = {}
    for asset, qty in holdings.items():
        p = prices.get(asset, 1.0)
        snap[asset] = {"amount": round(qty, 6), "value_usd": round(qty * p, 2)}
    log_portfolio_snapshot(snap)

    verdict = "HOLD" if not trades else f"{len(trades)} TRADE(S)"
    print(f"\n  {verdict} — ${total:.2f} ({pnl_total:+.2f})")
    print(f"{'='*50}")
    return total, trades

if __name__ == "__main__":
    run_strategy()
