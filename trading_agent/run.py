"""Connect to Coinbase via AgentKit and check wallet status."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

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

print("=== Figital Trading - Wallet Check ===\n")

# Set up CDP wallet provider
wallet_config = CdpEvmWalletProviderConfig(
    api_key_id=os.environ.get("CDP_API_KEY_ID"),
    api_key_secret=os.environ.get("CDP_API_KEY_SECRET"),
    network_id=os.environ.get("NETWORK_ID", "base-mainnet"),
)

wallet_provider = CdpEvmWalletProvider(wallet_config)
print(f"Wallet Address: {wallet_provider.get_address()}")
print(f"Network: {wallet_provider.get_network()}")

# Set up AgentKit with action providers
kit = AgentKit(AgentKitConfig(
    wallet_provider=wallet_provider,
    action_providers=[
        cdp_api_action_provider(),
        cdp_evm_wallet_action_provider(),
        erc20_action_provider(),
        wallet_action_provider(),
    ],
))

print("\nAvailable actions:")
for action in kit.get_tools():
    print(f"  - {action.name}: {action.description[:80]}")

# Check balance
print("\n--- Checking Balances ---")
for action in kit.get_tools():
    if "balance" in action.name.lower():
        print(f"\nRunning: {action.name}")
        try:
            result = action.invoke({})
            print(f"Result: {result}")
        except Exception as e:
            print(f"Error: {e}")
