/**
 * CoW Protocol API client.
 *
 * Provides MEV-protected swaps via CoW Protocol's batch auction mechanism.
 * No API key required. Uses the public CoW Protocol API.
 *
 * Supported chains: ethereum, gnosis, arbitrum, base, sepolia.
 */

import { request, W3ActionError } from '@w3-io/action-core'

const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

const NATIVE_ALIASES = new Set(['ETH', 'eth', 'native', 'NATIVE'])

const BASE_URLS = {
  ethereum: 'https://api.cow.fi/mainnet',
  gnosis: 'https://api.cow.fi/xdai',
  arbitrum: 'https://api.cow.fi/arbitrum_one',
  base: 'https://api.cow.fi/base',
  sepolia: 'https://api.cow.fi/sepolia',
}

/**
 * CoW Swap specific error class. Extends W3ActionError so action-core's
 * handleError reports the structured code and downstream consumers can
 * pattern-match on err.code.
 */
export class CowSwapError extends W3ActionError {
  constructor(code, message, { statusCode, details } = {}) {
    super(code, message, { statusCode, details })
    this.name = 'CowSwapError'
  }
}

/**
 * Resolve a chain name to a CoW Protocol API base URL.
 */
function resolveBaseUrl(chain) {
  if (!chain) {
    throw new CowSwapError('MISSING_CHAIN', 'Chain is required')
  }
  const url = BASE_URLS[chain.toLowerCase()]
  if (!url) {
    const supported = Object.keys(BASE_URLS).join(', ')
    throw new CowSwapError(
      'UNSUPPORTED_CHAIN',
      `Unsupported chain "${chain}". Supported: ${supported}`,
    )
  }
  return url
}

/**
 * Normalize a token address, replacing native aliases with the
 * canonical native token address.
 */
function normalizeToken(token) {
  if (!token) return token
  if (NATIVE_ALIASES.has(token)) return NATIVE_TOKEN_ADDRESS
  return token
}

/**
 * Get a swap quote from CoW Protocol.
 *
 * @param {string} chain - Network name (ethereum, gnosis, arbitrum, base, sepolia)
 * @param {object} params - Quote parameters
 * @param {string} params.sellToken - Token to sell (address or "ETH"/"native")
 * @param {string} params.buyToken - Token to buy (address or "ETH"/"native")
 * @param {string} params.sellAmountBeforeFee - Amount to sell in token base units
 * @param {string} params.from - Sender address
 * @param {string} [params.receiver] - Receiver address (defaults to from)
 * @returns {Promise<object>} Quote object with id, sellAmount, buyAmount, feeAmount, etc.
 */
export async function quote(chain, { sellToken, buyToken, sellAmountBeforeFee, from }) {
  if (!sellToken) throw new CowSwapError('MISSING_SELL_TOKEN', 'sellToken is required')
  if (!buyToken) throw new CowSwapError('MISSING_BUY_TOKEN', 'buyToken is required')
  if (!sellAmountBeforeFee)
    throw new CowSwapError('MISSING_AMOUNT', 'sellAmountBeforeFee is required')
  if (!from) throw new CowSwapError('MISSING_FROM', 'from address is required')

  const baseUrl = resolveBaseUrl(chain)

  const body = {
    sellToken: normalizeToken(sellToken),
    buyToken: normalizeToken(buyToken),
    sellAmountBeforeFee: String(sellAmountBeforeFee),
    from,
    kind: 'sell',
    receiver: from,
    appData: '0x0000000000000000000000000000000000000000000000000000000000000000',
    partiallyFillable: false,
    signingScheme: 'eip712',
  }

  try {
    return await request(`${baseUrl}/api/v1/quote`, {
      method: 'POST',
      body,
    })
  } catch (err) {
    if (err && typeof err === 'object' && 'statusCode' in err) {
      throw new CowSwapError('QUOTE_FAILED', err.message || `HTTP ${err.statusCode}`, {
        statusCode: err.statusCode,
      })
    }
    throw err
  }
}

/**
 * Submit a signed order to CoW Protocol.
 *
 * NOTE: v0.1.0 limitation — the W3 bridge signs raw transactions, not
 * EIP-712 typed data. This function is provided for completeness but
 * requires an externally produced EIP-712 signature. See README for details.
 *
 * @param {string} chain - Network name
 * @param {object} params - Order parameters
 * @param {object} params.quote - Quote object from the quote() call
 * @param {string} params.signature - EIP-712 signature
 * @returns {Promise<string>} Order UID
 */
export async function submitOrder(chain, { quote: orderQuote, signature }) {
  if (!orderQuote) throw new CowSwapError('MISSING_QUOTE', 'quote is required')
  if (!signature) throw new CowSwapError('MISSING_SIGNATURE', 'signature is required')

  const baseUrl = resolveBaseUrl(chain)

  const body = {
    ...orderQuote,
    signature,
    signingScheme: 'eip712',
  }

  try {
    return await request(`${baseUrl}/api/v1/orders`, {
      method: 'POST',
      body,
    })
  } catch (err) {
    if (err && typeof err === 'object' && 'statusCode' in err) {
      throw new CowSwapError('SUBMIT_FAILED', err.message || `HTTP ${err.statusCode}`, {
        statusCode: err.statusCode,
      })
    }
    throw err
  }
}

/**
 * Get order details by UID.
 *
 * @param {string} chain - Network name
 * @param {string} orderId - Order UID
 * @returns {Promise<object>} Order object with status, amounts, timestamps
 */
export async function getOrder(chain, orderId) {
  if (!orderId) throw new CowSwapError('MISSING_ORDER_ID', 'orderId is required')

  const baseUrl = resolveBaseUrl(chain)

  try {
    return await request(`${baseUrl}/api/v1/orders/${encodeURIComponent(orderId)}`)
  } catch (err) {
    if (err && typeof err === 'object' && 'statusCode' in err) {
      throw new CowSwapError('ORDER_FETCH_FAILED', err.message || `HTTP ${err.statusCode}`, {
        statusCode: err.statusCode,
      })
    }
    throw err
  }
}

/**
 * Get trades (fills) for an order.
 *
 * @param {string} chain - Network name
 * @param {string} orderId - Order UID
 * @returns {Promise<Array>} Array of trade objects
 */
export async function getTrades(chain, orderId) {
  if (!orderId) throw new CowSwapError('MISSING_ORDER_ID', 'orderId is required')

  const baseUrl = resolveBaseUrl(chain)

  try {
    return await request(
      `${baseUrl}/api/v1/trades?orderUid=${encodeURIComponent(orderId)}`,
    )
  } catch (err) {
    if (err && typeof err === 'object' && 'statusCode' in err) {
      throw new CowSwapError('TRADES_FETCH_FAILED', err.message || `HTTP ${err.statusCode}`, {
        statusCode: err.statusCode,
      })
    }
    throw err
  }
}
