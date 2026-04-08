# Figital

**Real World Assets on the Blockchain.**

Figital tokenizes physical luxury assets — jewelry, precious metals, and timepieces — and brings them on-chain. Every asset is purchased, authenticated, and held in our self-custodied vault, then represented as a digital token for verifiable ownership and trading.

---

## Project Checkpoint — April 2026

### Platform Overview

| Component | Status |
|---|---|
| Landing Page (`index.html`) | Live |
| Liquidity Pools Page (`pools.html`) | Live |
| Web3 Wallet Integration | Live |
| $FIGI Token Sale | Live |
| USDC Payments | Live |
| Liquidity Pools (3 pairs) | Ready to Deploy |

### Blockchain Details

| Item | Value |
|---|---|
| **Network** | Base (Chain ID: 8453) |
| **$FIGI Contract** | `0x72d2B2e37134BFa2a36C1014A2264722d9A70dC4` |
| **USDC (Base)** | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| **WETH (Base)** | `0x4200000000000000000000000000000000000006` |
| **cbBTC (Base)** | `0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf` |
| **Token Price** | $0.01 |
| **Available Supply** | 2,000,000,000 |
| **DEX Router** | Uniswap V3 (Base) |

### Vault Assets

| # | Asset | Category | Status |
|---|---|---|---|
| 1 | Lab Diamond Tennis Necklace (Moses NYC) | Jewelry | In Vault |
| 2 | 1 oz Silver Coin #1 (.999 Fine) | Precious Metal | In Vault |
| 3 | 1 oz Silver Coin #2 (.999 Fine) | Precious Metal | In Vault |
| 4 | 1 oz Silver Coin #3 (.999 Fine) | Precious Metal | In Vault |
| 5 | Rolex Timepiece | Timepiece | Acquiring |

### Liquidity Pools

| Pool | Token Pair | Fee Tier | Contract Pairing |
|---|---|---|---|
| FIGI/ETH | $FIGI + WETH | 0.3% | Uniswap V3 on Base |
| FIGI/USDC | $FIGI + USDC | 0.3% | Uniswap V3 on Base |
| FIGI/BTC | $FIGI + cbBTC | 0.3% | Uniswap V3 on Base |

### Wallet Support

| Wallet | Status |
|---|---|
| MetaMask | Supported |
| Coinbase Wallet | Supported (tested & verified) |
| WalletConnect | Placeholder (v2 pending) |
| Rainbow | Supported |

### Payment Methods

| Method | Status |
|---|---|
| ETH (native) | Live |
| USDC (ERC-20) | Live — includes balance check, approval, and transfer |

### File Structure

```
Figital.Github.io/
  index.html      — Main landing page (vault, token info, buy flow)
  pools.html      — Liquidity pools page (3 pools, add liquidity)
  styles.css      — Global styles (dark theme, responsive)
  pools.css       — Pools page styles
  app.js          — Main site logic (wallet, purchase, USDC)
  pools.js        — Pools page logic (Uniswap V3 integration)
  README.md       — This file
```

### What's Been Built

1. **Landing page** — Hero, about, how-it-works, vault with 5 asset cards, $FIGI token section, buy CTA
2. **Web3 wallet integration** — MetaMask, Coinbase Wallet, WalletConnect, Rainbow with auto Base chain switching
3. **Purchase flow** — ETH and USDC payment with contract interaction, balance checks, approval flow
4. **Coinbase Wallet fix** — Provider detection, connection sequence, and error handling for Chrome extension
5. **$FIGI token info** — Contract address display with copy button, sale details (price, supply, status)
6. **Liquidity pools page** — 3 pool cards (FIGI/ETH, FIGI/USDC, FIGI/BTC) with TVL/volume/APR metrics, add liquidity modal, Uniswap V3 NonfungiblePositionManager integration

### Next Steps

- Deploy the 3 liquidity pools on Base mainnet (fund with initial liquidity)
- WalletConnect v2 full integration
- Live price oracle for ETH/USD conversion
- Pool analytics (TVL, volume, APR from on-chain data)
- Asset detail pages with photos and authentication certificates
- Rolex acquisition and listing
