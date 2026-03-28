# Claude Code Project Instructions

## Repository
- Owner: KySpector
- Repo: Figital.Github.io
- Primary branch: claude/setup-anthropic-client-Soux7

## Git Push Strategy
The local proxy blocks standard `git push`. Use these approaches in order:

1. **Primary: Token-embedded remote URL** - The origin remote is configured with a GitHub PAT embedded in the URL. Run `git push -u origin <branch>` normally.
2. **Fallback: MCP GitHub tools** - Use `mcp__github__push_files` or `mcp__github__create_or_update_file` to push via the GitHub API directly.
3. **If token expires**: Ask the user for a new GitHub PAT, then run:
   ```bash
   git remote set-url origin https://<NEW_TOKEN>@github.com/KySpector/Figital.Github.io.git
   ```

## Project Structure
- `trading_agent/` - Claude-powered autonomous crypto trading agent
  - `agent.py` - Main agent loop with Anthropic API + tool use
  - `config.py` - API keys, system prompt, strategy config
  - `trade_logger.py` - Trade/token usage logging to trades.json
  - `run.py` - Coinbase AgentKit wallet connection script
- `dashboard/` - Flask web dashboard for monitoring trades
  - `app.py` - Flask routes
  - `templates/index.html` - Dashboard UI

## Tech Stack
- Python 3, Anthropic SDK (Claude Opus 4.6), Coinbase AgentKit, Flask
- Base blockchain (Coinbase L2)
