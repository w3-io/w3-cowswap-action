/**
 * CoW Protocol API client.
 *
 * Provides MEV-protected swaps via CoW Protocol's batch auction mechanism.
 * No API key required. Uses the public CoW Protocol API.
 *
 * Supported chains: ethereum, gnosis, arbitrum, base, sepolia.
 */

import { request, bridge, W3ActionError } from '@w3-io/action-core'

const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

const NATIVE_ALIASES = new Set(['ETH', 'eth', 'native', 'NATIVE'])

const BASE_URLS = {
  ethereum: 'https://api.cow.fi/mainnet',
  gnosis: 'https://api.cow.fi/xdai',
  arbitrum: 'https://api.cow.fi/arbitrum_one',
  base: 'https://api.cow.fi/base',
  sepolia: 'https://api.cow.fi/sepolia',
}

// GPv2Settlement contract address (same on all supported chains)
const GPV2_SETTLEMENT = {
  ethereum: '0x9008D19f58AAbD9eD0D60971565AA8510560ab41',
  gnosis: '0x9008D19f58AAbD9eD0D60971565AA8510560ab41',
  arbitrum: '0x9008D19f58AAbD9eD0D60971565AA8510560ab41',
  base: '0x9008D19f58AAbD9eD0D60971565AA8510560ab41',
  sepolia: '0x9008D19f58AAbD9eD0D60971565AA8510560ab41',
}

// Chain IDs for EIP-712 domain
const CHAIN_IDS = {
  ethereum: 1,
  gnosis: 100,
  arbitrum: 42161,
  base: 8453,
  sepolia: 11155111,
}

// EIP-712 types for CoW Protocol GPv2Order
const ORDER_TYPES = {
  Order: [
    { name: 'sellToken', type: 'address' },
    { name: 'buyToken', type: 'address' },
    { name: 'receiver', type: 'address' },
    { name: 'sellAmount', type: 'uint256' },
    { name: 'buyAmount', type: 'uint256' },
    { name: 'validTo', type: 'uint32' },
    { name: 'appData', type: 'bytes32' },
    { name: 'feeAmount', type: 'uint256' },
    { name: 'kind', type: 'string' },
    { name: 'partiallyFillable', type: 'bool' },
    { name: 'sellTokenBalance', type: 'string' },
    { name: 'buyTokenBalance', type: 'string' },
  ],
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
 * Sign a CoW Protocol order via the W3 bridge and submit it.
 *
 * Constructs the GPv2 EIP-712 typed data from the quote response,
 * signs it via the bridge's sign-typed-data action, and submits the
 * signed order to the CoW Protocol API.
 *
 * @param {string} chain - Network name (ethereum, gnosis, arbitrum, base, sepolia)
 * @param {object} quoteResponse - Full response from the quote() call
 * @returns {Promise<string>} Order UID
 */
export async function signAndSubmitOrder(chain, quoteResponse) {
  if (!quoteResponse?.quote)
    throw new CowSwapError('MISSING_QUOTE', 'quoteResponse.quote is required')

  const { quote: orderParams, from } = quoteResponse
  const chainId = CHAIN_IDS[chain]
  if (!chainId) throw new CowSwapError('INVALID_CHAIN', `Unsupported chain: ${chain}`)

  const domain = {
    name: 'Gnosis Protocol',
    version: 'v2',
    chainId,
    verifyingContract: GPV2_SETTLEMENT[chain],
  }

  const message = {
    sellToken: orderParams.sellToken,
    buyToken: orderParams.buyToken,
    receiver: from || orderParams.receiver,
    sellAmount: orderParams.sellAmount,
    buyAmount: orderParams.buyAmount,
    validTo: orderParams.validTo,
    appData: orderParams.appData,
    feeAmount: orderParams.feeAmount,
    kind: orderParams.kind,
    partiallyFillable: orderParams.partiallyFillable,
    sellTokenBalance: orderParams.sellTokenBalance || 'erc20',
    buyTokenBalance: orderParams.buyTokenBalance || 'erc20',
  }

  // Sign via W3 bridge EIP-712
  const signResult = await bridge.chain('ethereum', 'sign-typed-data', {
    domain,
    types: { Order: ORDER_TYPES.Order },
    primaryType: 'Order',
    message,
  })

  // Submit to CoW API
  return submitOrder(chain, {
    quote: orderParams,
    signature: signResult.signature,
  })
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
    return await request(`${baseUrl}/api/v1/trades?orderUid=${encodeURIComponent(orderId)}`)
  } catch (err) {
    if (err && typeof err === 'object' && 'statusCode' in err) {
      throw new CowSwapError('TRADES_FETCH_FAILED', err.message || `HTTP ${err.statusCode}`, {
        statusCode: err.statusCode,
      })
    }
    throw err
  }
}
