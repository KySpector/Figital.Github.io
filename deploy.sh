#!/bin/bash
# Figital Trading Agent — One-command deploy
# No Anthropic API key needed — runs autonomous rule-based strategy
# Usage: ./deploy.sh [--live | --paper | --dashboard | --loop]

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Figital Trading Agent — Deploy     ║${NC}"
echo -e "${BLUE}║   Zero API costs • Rule-based        ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════╝${NC}"
echo

# Check Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Python 3 not found. Install it first.${NC}"
    exit 1
fi

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
pip install -q -r requirements.txt
echo -e "${GREEN}Dependencies installed.${NC}"

# Check .env
if [ ! -f .env ]; then
    echo -e "${YELLOW}No .env found. Creating minimal config...${NC}"
    cat > .env << 'ENVEOF'
# Coinbase Developer Platform credentials (for live trading)
CDP_API_KEY_ID=
CDP_API_KEY_SECRET=
CDP_WALLET_SECRET=
NETWORK_ID=base-mainnet
ENVEOF
    echo -e "${GREEN}.env created. Add CDP credentials for live trading.${NC}"
fi

MODE="${1:---paper}"

case "$MODE" in
    --live)
        echo -e "\n${GREEN}=== LIVE TRADING ===${NC}"
        echo "Connecting to Coinbase wallet..."
        python3 -m trading_agent.agent
        ;;

    --paper)
        echo -e "\n${YELLOW}=== PAPER TRADING ===${NC}"
        echo "Live prices, simulated execution."
        python3 -m trading_agent.agent
        ;;

    --loop)
        INTERVAL="${2:-60}"
        echo -e "\n${GREEN}=== TRADING LOOP (every ${INTERVAL}m) ===${NC}"
        python3 -m trading_agent.agent --loop --interval="$INTERVAL"
        ;;

    --dashboard)
        echo -e "\n${BLUE}=== DASHBOARD ===${NC}"
        echo -e "Starting at ${GREEN}http://localhost:5000${NC}"
        python3 dashboard/app.py
        ;;

    --both)
        echo -e "\n${GREEN}=== AGENT + DASHBOARD ===${NC}"
        echo -e "Dashboard: ${GREEN}http://localhost:5000${NC}"
        python3 dashboard/app.py &
        DASH_PID=$!
        sleep 1
        python3 -m trading_agent.agent --loop
        kill $DASH_PID 2>/dev/null
        ;;

    *)
        echo "Usage: ./deploy.sh [MODE] [OPTIONS]"
        echo
        echo "  --paper           Paper trading with live prices (default)"
        echo "  --live            Live trading via Coinbase AgentKit"
        echo "  --loop [MIN]      Continuous trading loop (default: 60 min)"
        echo "  --dashboard       Flask dashboard at localhost:5000"
        echo "  --both            Dashboard + trading loop together"
        echo
        echo "No Anthropic API key needed. Zero API costs."
        exit 0
        ;;
esac
