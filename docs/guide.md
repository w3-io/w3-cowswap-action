# CoW Swap Integration Guide

## What is CoW Protocol?

CoW Protocol (Coincidence of Wants) is a DEX aggregation protocol that batches swap orders and settles them via competitive solvers. Unlike traditional AMM swaps, orders never hit the public mempool, eliminating MEV extraction (frontrunning, sandwich attacks). Solvers compete to find the best execution path across all DEXes, and surplus above the quoted price goes back to the trader.

## Quick Start

```yaml
- uses: w3-io/w3-cowswap-action@v0
  with:
    command: quote
    chain: ethereum
    sell-token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
    buy-token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
    amount: '1000000000'
    from: '0xYourAddress'
```

## Commands

### quote

Get a swap quote from CoW Protocol. Returns pricing, estimated fees, and the quote object needed for order submission.

**Inputs:**

| Input        | Type   | Required | Description                            |
| ------------ | ------ | -------- | -------------------------------------- |
| `chain`      | string | Yes      | Target chain                           |
| `sell-token` | string | Yes      | Token to sell (address or "ETH")       |
| `buy-token`  | string | Yes      | Token to buy (address or "ETH")        |
| `amount`     | string | Yes      | Sell amount in base units (before fee) |
| `from`       | string | Yes      | Sender address                         |

**Output:**

```json
{
  "quote": {
    "sellToken": "0xa0b8...eb48",
    "buyToken": "0xc02a...6cc2",
    "sellAmount": "999500000",
    "buyAmount": "450000000000000000",
    "feeAmount": "500000",
    "kind": "sell",
    "partiallyFillable": false,
    "validTo": 1700000000
  },
  "id": 12345,
  "from": "0x..."
}
```

**Example:**

```yaml
- id: cowswap-quote
  uses: w3-io/w3-cowswap-action@v0
  with:
    command: quote
    chain: ethereum
    sell-token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
    buy-token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
    amount: '1000000000'
    from: '0xSenderAddress'

- run: |
    echo "Buy amount: ${{ fromJSON(steps.cowswap-quote.outputs.result).quote.buyAmount }}"
    echo "Fee: ${{ fromJSON(steps.cowswap-quote.outputs.result).quote.feeAmount }}"
```

### get-order

Check the status of an existing order by its UID.

**Inputs:**

| Input      | Type   | Required | Description  |
| ---------- | ------ | -------- | ------------ |
| `chain`    | string | Yes      | Target chain |
| `order-id` | string | Yes      | Order UID    |

**Output:**

```json
{
  "uid": "0x...",
  "status": "fulfilled",
  "sellToken": "0x...",
  "buyToken": "0x...",
  "sellAmount": "999500000",
  "buyAmount": "450000000000000000",
  "executedSellAmount": "999500000",
  "executedBuyAmount": "455000000000000000",
  "creationDate": "2024-01-15T10:30:00Z"
}
```

**Example:**

```yaml
- id: order-status
  uses: w3-io/w3-cowswap-action@v0
  with:
    command: get-order
    chain: ethereum
    order-id: '0xOrderUidHere'

- run: |
    echo "Status: ${{ fromJSON(steps.order-status.outputs.result).status }}"
```

### get-trades

Get the executed trades (fills) for an order. An order may have multiple fills if it was partially fillable.

**Inputs:**

| Input      | Type   | Required | Description  |
| ---------- | ------ | -------- | ------------ |
| `chain`    | string | Yes      | Target chain |
| `order-id` | string | Yes      | Order UID    |

**Output:**

```json
[
  {
    "blockNumber": 18500000,
    "logIndex": 42,
    "orderUid": "0x...",
    "sellAmount": "999500000",
    "buyAmount": "455000000000000000",
    "sellToken": "0x...",
    "buyToken": "0x...",
    "txHash": "0x..."
  }
]
```

**Example:**

```yaml
- id: trades
  uses: w3-io/w3-cowswap-action@v0
  with:
    command: get-trades
    chain: ethereum
    order-id: '0xOrderUidHere'

- run: |
    echo "Trades: ${{ steps.trades.outputs.result }}"
```

### cancel-order

Cancel an existing order via CoW Protocol's signed off-chain cancellation. Signs the order UID with EIP-712 using the same GPv2Settlement domain as order submission. Requires signer access via `bridge-allow` and `W3_SECRET_ETHEREUM`.

**Inputs:**

| Input      | Type   | Required | Description  |
| ---------- | ------ | -------- | ------------ |
| `chain`    | string | Yes      | Target chain |
| `order-id` | string | Yes      | Order UID    |

**Output:**

```json
{
  "cancelled": true,
  "orderId": "0x..."
}
```

**Example:**

```yaml
- id: cancel
  uses: w3-io/w3-cowswap-action@v0
  with:
    command: cancel-order
    chain: ethereum
    order-id: '0xOrderUidHere'
    bridge-allow: ethereum
  env:
    W3_SECRET_ETHEREUM: ${{ secrets.W3_SECRET_ETHEREUM }}

- run: |
    echo "Cancelled: ${{ fromJSON(steps.cancel.outputs.result).cancelled }}"
```

### limit-order

Submit a limit order in one step. Gets a quote, overrides `buyAmount` with the specified limit price, sets the expiry via `valid-for`, then signs and submits.

**Inputs:**

| Input        | Type   | Required | Description                            |
| ------------ | ------ | -------- | -------------------------------------- |
| `chain`      | string | Yes      | Target chain                           |
| `sell-token` | string | Yes      | Token to sell (address or "ETH")       |
| `buy-token`  | string | Yes      | Token to buy (address or "ETH")        |
| `amount`     | string | Yes      | Sell amount in base units (before fee) |
| `buy-amount` | string | Yes      | Minimum acceptable buy amount          |
| `from`       | string | Yes      | Sender address                         |
| `valid-for`  | string | No       | Seconds until expiry (default 3600)    |

**Output:**

Order UID (string) for tracking the submitted order.

**Example:**

```yaml
- id: limit
  uses: w3-io/w3-cowswap-action@v0
  with:
    command: limit-order
    chain: ethereum
    sell-token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
    buy-token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
    amount: '1000000000'
    buy-amount: '500000000000000000'
    from: '0xSenderAddress'
    valid-for: '7200'

- run: |
    echo "Order UID: ${{ steps.limit.outputs.result }}"
```

## Multi-Step Workflow Pattern

Individual commands compose into a full order lifecycle: get a quote,
submit the signed order, poll for settlement, then read the fill
details. Each step passes its output to the next via
`steps.<id>.outputs.result`.

```yaml
name: CoW Swap — quote, submit, track

on:
  workflow_dispatch:
    inputs:
      sell-amount:
        description: 'USDC amount in base units (6 decimals)'
        required: true
        default: '1000000000' # 1000 USDC

env:
  CHAIN: ethereum
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
  SENDER: '0xYourAddress'

jobs:
  swap:
    runs-on: ubuntu-latest
    steps:
      # ── 1. Quote ───────────────────────────────────────────
      # Ask CoW solvers for the best execution price.
      # No signer needed — this is a read-only API call.
      - id: get-quote
        uses: w3-io/w3-cowswap-action@v0
        with:
          command: quote
          chain: ${{ env.CHAIN }}
          sell-token: ${{ env.USDC }}
          buy-token: ${{ env.WETH }}
          amount: ${{ inputs.sell-amount }}
          from: ${{ env.SENDER }}

      # Inspect the quote before committing funds.
      - name: Log quote details
        run: |
          echo "Buy amount: ${{ fromJSON(steps.get-quote.outputs.result).quote.buyAmount }}"
          echo "Fee: ${{ fromJSON(steps.get-quote.outputs.result).quote.feeAmount }}"

      # ── 2. Submit ──────────────────────────────────────────
      # Pass the full quote JSON to submit-order. The action
      # signs the EIP-712 typed data via the W3 bridge, then
      # POSTs the signed order to the CoW API.
      # Requires bridge-allow and the chain signer secret.
      - id: submit
        uses: w3-io/w3-cowswap-action@v0
        with:
          command: submit-order
          chain: ${{ env.CHAIN }}
          quote: ${{ steps.get-quote.outputs.result }}
          bridge-allow: ethereum
        env:
          W3_SECRET_ETHEREUM: ${{ secrets.W3_SECRET_ETHEREUM }}

      # ── 3. Poll status ────────────────────────────────────
      # CoW orders settle in the next solver batch (≈15 s on
      # mainnet). Poll get-order until status is "fulfilled".
      - id: order-status
        uses: w3-io/w3-cowswap-action@v0
        with:
          command: get-order
          chain: ${{ env.CHAIN }}
          order-id: ${{ steps.submit.outputs.result }}

      - name: Check settlement
        run: |
          STATUS="${{ fromJSON(steps.order-status.outputs.result).status }}"
          echo "Order status: $STATUS"
          if [ "$STATUS" != "fulfilled" ]; then
            echo "::warning::Order not yet filled — status is $STATUS"
          fi

      # ── 4. Read fill details ──────────────────────────────
      # Once filled, get-trades returns the on-chain execution
      # including the actual amounts, tx hash, and block.
      - id: trades
        uses: w3-io/w3-cowswap-action@v0
        with:
          command: get-trades
          chain: ${{ env.CHAIN }}
          order-id: ${{ steps.submit.outputs.result }}

      - name: Report execution
        run: |
          echo "Trades: ${{ steps.trades.outputs.result }}"
```

**Key points:**

- **Step references** — `submit-order` receives the raw `steps.get-quote.outputs.result` string. The action parses it internally; no `fromJSON` wrapper needed in the `with:` block.
- **Signer access** — Only `submit-order` and `cancel-order` require `bridge-allow` and `W3_SECRET_ETHEREUM`. Read-only commands (`quote`, `get-order`, `get-trades`) work without credentials.
- **Polling** — CoW batches settle roughly every 15 seconds on mainnet. For production workflows, wrap `get-order` in a retry loop or use a matrix strategy with a delay before checking status.

## Error Codes

| Code                  | Meaning                             |
| --------------------- | ----------------------------------- |
| `MISSING_CHAIN`       | No chain specified                  |
| `UNSUPPORTED_CHAIN`   | Chain not supported by CoW Protocol |
| `MISSING_SELL_TOKEN`  | sell-token input missing            |
| `MISSING_BUY_TOKEN`   | buy-token input missing             |
| `MISSING_AMOUNT`      | amount input missing                |
| `MISSING_FROM`        | from address missing                |
| `MISSING_ORDER_ID`    | order-id input missing              |
| `QUOTE_FAILED`        | CoW API rejected the quote request  |
| `ORDER_FETCH_FAILED`  | Failed to fetch order details       |
| `TRADES_FETCH_FAILED` | Failed to fetch trades              |
| `CANCEL_FAILED`       | CoW API rejected the cancellation   |
| `MISSING_SELL_AMOUNT` | sell amount missing (limit-order)   |
| `MISSING_BUY_AMOUNT`  | buy-amount missing (limit-order)    |

## Supported Chains

| Chain    | API Base URL                    |
| -------- | ------------------------------- |
| ethereum | https://api.cow.fi/mainnet      |
| gnosis   | https://api.cow.fi/xdai         |
| arbitrum | https://api.cow.fi/arbitrum_one |
| base     | https://api.cow.fi/base         |
| sepolia  | https://api.cow.fi/sepolia      |

## Native Token Alias

Use `"ETH"` or `"native"` as a token address shortcut. The action resolves it to `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE` (the canonical native token wrapper used by CoW Protocol).

## Limitations (v0.1.0)

Order submission (`submit-order`) is not exposed as a command. CoW Protocol requires EIP-712 typed data signatures for order submission. The W3 bridge currently signs raw transactions only, not typed data. This means:

- **Works now**: quoting, order tracking, trade history
- **Requires external signing**: order submission

To submit an order, get a quote via this action, sign the quote externally using an EIP-712-capable signer, then POST to the CoW API directly. Full EIP-712 bridge support is planned for a future release.

## Future work

Features not included in v0.1.0:

- **TWAP orders** — Time-weighted average price orders via CoW's composable order framework. Requires different smart contracts (ComposableCoW) and a more complex order structure.
- **Programmatic/conditional orders** — Same composable order framework. Enables orders that execute only when on-chain conditions are met (e.g., price thresholds). Niche use case.
- **Buy-side quotes** — Setting `kind: 'buy'` on the quote endpoint to specify exact output amount. Trivial to add when needed.
