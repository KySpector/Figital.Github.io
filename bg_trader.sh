#!/bin/bash
# Background trading loop — writes prices, runs strategy, commits
cd /home/user/Figital.Github.io

while true; do
    echo "[$(date -u)] Running strategy check..."
    python3 trading_loop.py
    
    # Commit if there are changes
    if ! git diff --quiet trading_agent/agent.py 2>/dev/null; then
        PAT=$(grep -oP 'ghp_[^:@]+' ~/.git-credentials | head -1)
        if [ -n "$PAT" ]; then
            git remote set-url origin "https://${PAT}@github.com/KySpector/Figital.Github.io.git" 2>/dev/null
        fi
        git add -A && git commit -m "Auto: strategy check $(date -u +%Y-%m-%dT%H:%MZ)" && git push -u origin claude/setup-anthropic-client-Soux7 2>&1 || true
    fi
    
    echo "[$(date -u)] Sleeping 60 minutes..."
    sleep 3600
done
