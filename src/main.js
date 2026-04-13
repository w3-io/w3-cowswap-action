import * as core from '@actions/core'
import { createCommandRouter, setJsonOutput, handleError } from '@w3-io/action-core'
import { quote, getOrder, getTrades, CowSwapError } from './cowswap.js'

/**
 * W3 CoW Swap Action — command dispatch.
 *
 * Commands:
 *   - quote: Get a swap quote from CoW Protocol
 *   - get-order: Check order status by UID
 *   - get-trades: Get fills for an order
 *
 * NOTE: submit-order is not exposed as a command in v0.1.0 because the
 * W3 bridge cannot produce EIP-712 typed data signatures. The quote and
 * tracking commands work fully. See README for details.
 */

const handlers = {
  quote: async () => {
    const chain = core.getInput('chain', { required: true })
    const sellToken = core.getInput('sell-token', { required: true })
    const buyToken = core.getInput('buy-token', { required: true })
    const amount = core.getInput('amount', { required: true })
    const from = core.getInput('from', { required: true })

    const result = await quote(chain, {
      sellToken,
      buyToken,
      sellAmountBeforeFee: amount,
      from,
    })
    setJsonOutput('result', result)
  },

  'get-order': async () => {
    const chain = core.getInput('chain', { required: true })
    const orderId = core.getInput('order-id', { required: true })
    const result = await getOrder(chain, orderId)
    setJsonOutput('result', result)
  },

  'get-trades': async () => {
    const chain = core.getInput('chain', { required: true })
    const orderId = core.getInput('order-id', { required: true })
    const result = await getTrades(chain, orderId)
    setJsonOutput('result', result)
  },
}

const router = createCommandRouter(handlers)

/**
 * Top-level run wrapper. Catches structured CowSwapError separately so
 * the partner-specific error code reaches core.setFailed, falling back
 * to action-core's generic handler for everything else.
 */
export async function run() {
  try {
    await router()
  } catch (error) {
    if (error instanceof CowSwapError) {
      core.setFailed(`${error.code}: ${error.message}`)
    } else {
      handleError(error)
    }
  }
}
