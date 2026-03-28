# Figital Trading

Autonomous cryptocurrency trading agent powered by Claude (Anthropic) as CEO, executing trades via Coinbase AgentKit on the Base blockchain.

## Architecture

- **`trading_agent/agent.py`** — Claude Opus 4.6 agent with tool use loop. Makes trading decisions and calls Coinbase AgentKit to execute.
- **`trading_agent/config.py`** — Configuration and system prompt (aggressive strategy, Base + Coinbase only).
- **`trading_agent/trade_logger.py`** — Logs all trades, token usage, and portfolio snapshots to `trades.json`.
- **`dashboard/app.py`** — Flask dashboard to view trade history, token costs, and portfolio over time.

## Setup

```bash
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your API keys
```

### Required API Keys

1. **Anthropic API Key** — from [console.anthropic.com](https://console.anthropic.com/)
2. **CDP API Key** — from [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com/)
   - Scopes: `trade`, `transfer`, `read` (do NOT enable `withdraw`)

## Usage

### Run the trading agent

```bash
python -m trading_agent.agent
```

### Launch the dashboard

```bash
python dashboard/app.py
# Open http://localhost:5000
```

## Strategy

- **Risk**: Aggressive
- **Network**: Base mainnet (Coinbase)
- **Allocation**: Heavy Base ecosystem tokens, minimal stablecoin reserve
- **Rules**: Take profit at +50%, stop loss at -25%, 10% dry powder in USDC
- **Self-sustaining**: Agent tracks its own API token costs against trading P&L
