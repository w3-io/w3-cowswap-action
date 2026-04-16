# E2E Test Results

> Last verified: 2026-04-15

## Prerequisites

| Credential           | Env var              | Source        |
| -------------------- | -------------------- | ------------- |
| Ethereum private key | `W3_SECRET_ETHEREUM` | Bridge signer |

### On-chain requirements

Funded EVM wallet on Ethereum mainnet with ETH + WETH (for order submission).

## Results

| #   | Step                 | Command        | Status | Notes                             |
| --- | -------------------- | -------------- | ------ | --------------------------------- |
| 1   | Quote WETH to USDC   | `quote`        | PASS   | Read-only                         |
| 2   | Print quote results  | (run step)     | PASS   |                                   |
| 3   | Quote for order flow | `quote`        | PASS   |                                   |
| 4   | Submit order         | `submit-order` | SKIP   | Requires funded wallet on mainnet |
| 5   | Get order status     | `get-order`    | SKIP   | Depends on submit                 |
| 6   | Get trades           | `get-trades`   | SKIP   | Depends on submit                 |
| 7   | Cancel order         | `cancel-order` | SKIP   | Depends on submit                 |
| 8   | Print order results  | (run step)     | PASS   |                                   |
| 9   | Place limit order    | `limit-order`  | PASS   |                                   |
| 10  | Cancel limit order   | `cancel-order` | PASS   | Recovery                          |
| 11  | Print limit results  | (run step)     | PASS   |                                   |

**Summary: 7/7 active steps pass (4 skipped, require funded mainnet wallet).**

## Skipped Commands

| Command | Reason                         |
| ------- | ------------------------------ |
| N/A     | All commands exercised in YAML |

## How to run

```bash
# Export credentials
export W3_SECRET_ETHEREUM="..."

# Start bridge (on-chain)
w3 bridge serve --port 8232 --signer-ethereum "$W3_SECRET_ETHEREUM" --allow "*" &
export W3_BRIDGE_URL="http://host.docker.internal:8232"

# Run
w3 workflow test --execute test/workflows/e2e.yaml
```
