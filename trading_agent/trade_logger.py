import json
import os
from datetime import datetime, timezone

TRADES_FILE = os.path.join(os.path.dirname(__file__), "..", "trades.json")


def _load_trades():
    if os.path.exists(TRADES_FILE):
        with open(TRADES_FILE) as f:
            return json.load(f)
    return {"trades": [], "token_usage": [], "portfolio_snapshots": []}


def _save_trades(data):
    with open(TRADES_FILE, "w") as f:
        json.dump(data, f, indent=2)


def log_trade(action, asset, amount_usd, price, reasoning):
    data = _load_trades()
    data["trades"].append({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "asset": asset,
        "amount_usd": round(amount_usd, 2),
        "price": price,
        "reasoning": reasoning,
    })
    _save_trades(data)


def log_token_usage(input_tokens, output_tokens, cost_usd):
    data = _load_trades()
    data["token_usage"].append({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cost_usd": round(cost_usd, 6),
    })
    _save_trades(data)


def log_portfolio_snapshot(balances):
    data = _load_trades()
    data["portfolio_snapshots"].append({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "balances": balances,
    })
    _save_trades(data)


def get_all_data():
    return _load_trades()
