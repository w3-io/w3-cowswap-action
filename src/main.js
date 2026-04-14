import * as core from '@actions/core'
import { createCommandRouter, setJsonOutput, handleError } from '@w3-io/action-core'
import { quote, signAndSubmitOrder, getOrder, getTrades, CowSwapError } from './cowswap.js'

/**
 * W3 CoW Swap Action — command dispatch.
 *
 * Commands:
 *   - quote: Get a swap quote from CoW Protocol
 *   - submit-order: Sign and submit a quoted order
 *   - get-order: Check order status by UID
 *   - get-trades: Get fills for an order
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

  'submit-order': async () => {
    const chain = core.getInput('chain', { required: true })
    const quoteJson = core.getInput('quote', { required: true })
    const quoteResponse = JSON.parse(quoteJson)
    const result = await signAndSubmitOrder(chain, quoteResponse)
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
