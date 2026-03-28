"""Figital Trading Dashboard — Flask web app to view all trades."""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from flask import Flask, jsonify, render_template

from trading_agent.trade_logger import get_all_data

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/data")
def api_data():
    data = get_all_data()

    # Calculate summary stats
    trades = data.get("trades", [])
    token_usage = data.get("token_usage", [])
    snapshots = data.get("portfolio_snapshots", [])

    total_token_cost = sum(u.get("cost_usd", 0) for u in token_usage)
    total_trades = len(trades)

    return jsonify({
        "trades": trades,
        "token_usage": token_usage,
        "portfolio_snapshots": snapshots,
        "summary": {
            "total_trades": total_trades,
            "total_token_cost_usd": round(total_token_cost, 6),
            "total_input_tokens": sum(u.get("input_tokens", 0) for u in token_usage),
            "total_output_tokens": sum(u.get("output_tokens", 0) for u in token_usage),
        },
    })


if __name__ == "__main__":
    app.run(debug=True, port=5000)
