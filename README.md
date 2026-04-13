# W3 CoW Swap Action

MEV-protected token swaps via [CoW Protocol](https://cow.fi/) batch auctions. No API key required.

## How it works

CoW Protocol collects swap intents (orders) into batches and settles them off-chain via competitive solvers. This provides:

- **MEV protection** -- orders are not visible in the public mempool
- **Surplus capture** -- solvers compete, so traders often get better-than-quoted prices
- **Coincidence of Wants** -- matching orders are settled peer-to-peer with zero slippage
- **Gasless orders** -- fees are taken from the sell token, no ETH needed for gas

## Quick Start

```yaml
- uses: w3-io/w3-cowswap-action@v0
  with:
    command: quote
    chain: ethereum
    sell-token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' # USDC
    buy-token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'  # WETH
    amount: '1000000000'  # 1000 USDC (6 decimals)
    from: '0xYourAddress'
```

## Commands

| Command      | Description                        |
| ------------ | ---------------------------------- |
| `quote`      | Get a swap quote                   |
| `get-order`  | Check order status by UID          |
| `get-trades` | Get trade fills for an order       |

## Inputs

| Input        | Required | Description                                          |
| ------------ | -------- | ---------------------------------------------------- |
| `command`    | Yes      | Operation to perform                                 |
| `chain`      | Yes      | Target chain (ethereum, gnosis, arbitrum, base, sepolia) |
| `sell-token` | No       | Token to sell (address or "ETH"/"native")            |
| `buy-token`  | No       | Token to buy (address or "ETH"/"native")             |
| `amount`     | No       | Amount to sell in base units (before fees)            |
| `from`       | No       | Sender wallet address                                |
| `receiver`   | No       | Receiver wallet address (defaults to from)           |
| `order-id`   | No       | Order UID (for get-order, get-trades)                |

## Outputs

| Output   | Description               |
| -------- | ------------------------- |
| `result` | JSON result of the operation |

## Supported Chains

| Chain    | Network    |
| -------- | ---------- |
| ethereum | Mainnet    |
| gnosis   | Gnosis Chain |
| arbitrum | Arbitrum One |
| base     | Base       |
| sepolia  | Sepolia testnet |

## Authentication

No API key is needed. The CoW Protocol API is public.

## Limitations (v0.1.0)

**Order submission is not supported.** CoW Protocol requires EIP-712 typed data signatures to submit orders. The W3 bridge currently signs raw transactions, not typed data. This action can:

- Get quotes (pricing, fee estimation)
- Track existing orders (status, fills)

To submit orders, produce the EIP-712 signature externally and call the CoW API directly. Full bridge support for EIP-712 is planned.

## Native Token

Use `"ETH"` or `"native"` as a token address alias. The action resolves it to the canonical native token wrapper address (`0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE`).
