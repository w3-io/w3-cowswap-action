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

| Input      | Type   | Required | Description |
| ---------- | ------ | -------- | ----------- |
| `chain`    | string | Yes      | Target chain |
| `order-id` | string | Yes      | Order UID   |

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

| Input      | Type   | Required | Description |
| ---------- | ------ | -------- | ----------- |
| `chain`    | string | Yes      | Target chain |
| `order-id` | string | Yes      | Order UID   |

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

## Error Codes

| Code                  | Meaning                                    |
| --------------------- | ------------------------------------------ |
| `MISSING_CHAIN`       | No chain specified                         |
| `UNSUPPORTED_CHAIN`   | Chain not supported by CoW Protocol        |
| `MISSING_SELL_TOKEN`  | sell-token input missing                   |
| `MISSING_BUY_TOKEN`   | buy-token input missing                    |
| `MISSING_AMOUNT`      | amount input missing                       |
| `MISSING_FROM`        | from address missing                       |
| `MISSING_ORDER_ID`    | order-id input missing                     |
| `QUOTE_FAILED`        | CoW API rejected the quote request         |
| `ORDER_FETCH_FAILED`  | Failed to fetch order details              |
| `TRADES_FETCH_FAILED` | Failed to fetch trades                     |

## Supported Chains

| Chain      | API Base URL                        |
| ---------- | ----------------------------------- |
| ethereum   | https://api.cow.fi/mainnet          |
| gnosis     | https://api.cow.fi/xdai             |
| arbitrum   | https://api.cow.fi/arbitrum_one     |
| base       | https://api.cow.fi/base             |
| sepolia    | https://api.cow.fi/sepolia          |

## Native Token Alias

Use `"ETH"` or `"native"` as a token address shortcut. The action resolves it to `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE` (the canonical native token wrapper used by CoW Protocol).

## Limitations (v0.1.0)

Order submission (`submit-order`) is not exposed as a command. CoW Protocol requires EIP-712 typed data signatures for order submission. The W3 bridge currently signs raw transactions only, not typed data. This means:

- **Works now**: quoting, order tracking, trade history
- **Requires external signing**: order submission

To submit an order, get a quote via this action, sign the quote externally using an EIP-712-capable signer, then POST to the CoW API directly. Full EIP-712 bridge support is planned for a future release.
