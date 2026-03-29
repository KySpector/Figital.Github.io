#!/bin/bash
# Figital Trading Agent — One-command deploy
# Usage: ./deploy.sh [--live | --paper | --dashboard]

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Figital Trading Agent — Deploy     ║${NC}"
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
    echo -e "${RED}.env file not found!${NC}"
    echo "Create .env with:"
    echo "  ANTHROPIC_API_KEY=sk-ant-..."
    echo "  CDP_API_KEY_ID=..."
    echo "  CDP_API_KEY_SECRET=-----BEGIN EC PRIVATE KEY-----..."
    echo "  CDP_WALLET_SECRET=..."
    echo "  NETWORK_ID=base-mainnet"
    exit 1
fi

# Source .env for checks
set -a
source .env
set +a

# Determine mode
MODE="${1:---live}"

case "$MODE" in
    --live)
        echo -e "\n${GREEN}=== LIVE TRADING MODE ===${NC}"
        if [ -z "$ANTHROPIC_API_KEY" ]; then
            echo -e "${RED}ANTHROPIC_API_KEY not set in .env${NC}"
            echo "Get one at https://console.anthropic.com/api-keys"
            exit 1
        fi
        if [ -z "$CDP_API_KEY_ID" ] || [ -z "$CDP_API_KEY_SECRET" ] || [ -z "$CDP_WALLET_SECRET" ]; then
            echo -e "${YELLOW}CDP credentials incomplete — will run in paper mode with live prices${NC}"
        else
            echo -e "${GREEN}CDP credentials found — live wallet trading enabled${NC}"
        fi
        echo
        python3 -m trading_agent.agent
        ;;

    --paper)
        echo -e "\n${YELLOW}=== PAPER TRADING MODE ===${NC}"
        if [ -z "$ANTHROPIC_API_KEY" ]; then
            echo -e "${RED}ANTHROPIC_API_KEY not set in .env${NC}"
            exit 1
        fi
        # Unset CDP vars to force paper mode
        unset CDP_API_KEY_ID CDP_API_KEY_SECRET CDP_WALLET_SECRET
        python3 -m trading_agent.agent
        ;;

    --dashboard)
        echo -e "\n${BLUE}=== DASHBOARD MODE ===${NC}"
        echo -e "Starting dashboard at ${GREEN}http://localhost:5000${NC}"
        python3 dashboard/app.py
        ;;

    --both)
        echo -e "\n${GREEN}=== AGENT + DASHBOARD ===${NC}"
        echo -e "Dashboard: ${GREEN}http://localhost:5000${NC}"
        python3 dashboard/app.py &
        DASH_PID=$!
        sleep 1
        python3 -m trading_agent.agent
        kill $DASH_PID 2>/dev/null
        ;;

    *)
        echo "Usage: ./deploy.sh [--live | --paper | --dashboard | --both]"
        echo
        echo "  --live       Run agent with live Coinbase wallet (default)"
        echo "  --paper      Run agent in paper trading mode"
        echo "  --dashboard  Start the Flask dashboard only"
        echo "  --both       Run agent + dashboard together"
        exit 0
        ;;
esac
