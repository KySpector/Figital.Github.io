"""Figital Trading Agent — Claude CEO with Coinbase AgentKit execution."""

import json

import anthropic

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

# Tool definitions for the trading agent
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


def execute_tool(tool_name, tool_input):
    """Route tool calls to the appropriate handler.

    In production, get_balances, execute_trade, and get_asset_price
    will call Coinbase AgentKit. For now they return placeholders
    until CDP API credentials are configured.
    """
    if tool_name == "get_balances":
        # TODO: Replace with AgentKit wallet.get_balances()
        return json.dumps({
            "status": "awaiting_api_credentials",
            "message": (
                "CDP API credentials not yet configured. "
                "Once configured, this will return live Coinbase balances."
            ),
            "mock_balances": {
                "USDC": {"amount": 200.0, "value_usd": 200.0},
            },
        })

    elif tool_name == "execute_trade":
        from_asset = tool_input["from_asset"]
        to_asset = tool_input["to_asset"]
        amount_usd = tool_input["amount_usd"]
        reasoning = tool_input["reasoning"]

        # TODO: Replace with AgentKit wallet.trade()
        log_trade(
            action=f"SWAP {from_asset} -> {to_asset}",
            asset=to_asset,
            amount_usd=amount_usd,
            price="pending_api",
            reasoning=reasoning,
        )

        return json.dumps({
            "status": "awaiting_api_credentials",
            "message": (
                f"Trade logged: {amount_usd} USD from {from_asset} to {to_asset}. "
                "Execution pending CDP API setup."
            ),
            "logged": True,
        })

    elif tool_name == "get_asset_price":
        asset = tool_input["asset"]
        # TODO: Replace with AgentKit or Coinbase price API
        return json.dumps({
            "status": "awaiting_api_credentials",
            "message": f"Price lookup for {asset} pending CDP API setup.",
        })

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
    print("=== Figital Trading Agent ===\n")
    result = run_agent(
        "You have a $200 portfolio on Coinbase. Your parameters are Coinbase "
        "and Base Blockchain only. Risk tolerance is aggressive. Execute your "
        "initial portfolio allocation and explain your strategy."
    )
    print(result)
