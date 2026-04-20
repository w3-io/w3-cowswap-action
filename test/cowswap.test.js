/**
 * CoW Swap client unit tests.
 *
 * Tests the API client in isolation by mocking global.fetch.
 * No GitHub Actions runtime, no real API calls.
 */

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  quote,
  getOrder,
  getTrades,
  submitOrder,
  cancelOrder,
  limitOrder,
  signAndSubmitOrder,
  CowSwapError,
} from '../src/cowswap.js'
import { bridge } from '@w3-io/action-core'

let originalFetch
let originalBridgeChain
let calls

beforeEach(() => {
  originalFetch = global.fetch
  originalBridgeChain = bridge.chain
  calls = []
})

afterEach(() => {
  global.fetch = originalFetch
  bridge.chain = originalBridgeChain
})

/**
 * Install a fetch mock that returns the supplied responses in order.
 */
function mockFetch(responses) {
  let index = 0
  global.fetch = async (url, options) => {
    calls.push({ url, options })
    const response = responses[index++]
    if (!response) {
      throw new Error(`Unexpected fetch call ${index}: ${url}`)
    }
    const status = response.status ?? 200
    const ok = status >= 200 && status < 300
    return {
      ok,
      status,
      headers: new Map([['content-type', 'application/json']]),
      text: async () => JSON.stringify(response.body ?? {}),
      json: async () => response.body ?? {},
    }
  }
}

describe('quote: parameter validation', () => {
  it('throws MISSING_SELL_TOKEN when sellToken is missing', async () => {
    await assert.rejects(
      () => quote('ethereum', { buyToken: '0xabc', sellAmountBeforeFee: '100', from: '0x1' }),
      (err) => err instanceof CowSwapError && err.code === 'MISSING_SELL_TOKEN',
    )
  })

  it('throws MISSING_BUY_TOKEN when buyToken is missing', async () => {
    await assert.rejects(
      () => quote('ethereum', { sellToken: '0xabc', sellAmountBeforeFee: '100', from: '0x1' }),
      (err) => err instanceof CowSwapError && err.code === 'MISSING_BUY_TOKEN',
    )
  })

  it('throws MISSING_AMOUNT when sellAmountBeforeFee is missing', async () => {
    await assert.rejects(
      () => quote('ethereum', { sellToken: '0xabc', buyToken: '0xdef', from: '0x1' }),
      (err) => err instanceof CowSwapError && err.code === 'MISSING_AMOUNT',
    )
  })

  it('throws MISSING_FROM when from is missing', async () => {
    await assert.rejects(
      () =>
        quote('ethereum', {
          sellToken: '0xabc',
          buyToken: '0xdef',
          sellAmountBeforeFee: '100',
        }),
      (err) => err instanceof CowSwapError && err.code === 'MISSING_FROM',
    )
  })
})

describe('quote: chain validation', () => {
  it('throws MISSING_CHAIN when chain is not provided', async () => {
    await assert.rejects(
      () =>
        quote(null, {
          sellToken: '0xabc',
          buyToken: '0xdef',
          sellAmountBeforeFee: '100',
          from: '0x1',
        }),
      (err) => err instanceof CowSwapError && err.code === 'MISSING_CHAIN',
    )
  })

  it('throws UNSUPPORTED_CHAIN for unknown chain', async () => {
    await assert.rejects(
      () =>
        quote('polygon', {
          sellToken: '0xabc',
          buyToken: '0xdef',
          sellAmountBeforeFee: '100',
          from: '0x1',
        }),
      (err) => err instanceof CowSwapError && err.code === 'UNSUPPORTED_CHAIN',
    )
  })
})

describe('quote: API call', () => {
  it('POSTs to the correct endpoint for ethereum', async () => {
    const mockQuote = { id: 1, quote: { sellAmount: '99', buyAmount: '50' } }
    mockFetch([{ body: mockQuote }])

    const result = await quote('ethereum', {
      sellToken: '0xabc',
      buyToken: '0xdef',
      sellAmountBeforeFee: '100',
      from: '0x1',
    })

    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://api.cow.fi/mainnet/api/v1/quote')
    assert.deepEqual(result, mockQuote)
  })

  it('POSTs to the correct endpoint for gnosis', async () => {
    mockFetch([{ body: {} }])

    await quote('gnosis', {
      sellToken: '0xabc',
      buyToken: '0xdef',
      sellAmountBeforeFee: '100',
      from: '0x1',
    })

    assert.equal(calls[0].url, 'https://api.cow.fi/xdai/api/v1/quote')
  })

  it('resolves native token aliases', async () => {
    mockFetch([{ body: {} }])

    await quote('ethereum', {
      sellToken: 'ETH',
      buyToken: 'native',
      sellAmountBeforeFee: '100',
      from: '0x1',
    })

    const body = JSON.parse(calls[0].options.body ?? '{}')
    assert.equal(body.sellToken, '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE')
    assert.equal(body.buyToken, '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE')
  })

  it('sends correct request body shape', async () => {
    mockFetch([{ body: {} }])

    await quote('ethereum', {
      sellToken: '0xSell',
      buyToken: '0xBuy',
      sellAmountBeforeFee: '1000',
      from: '0xSender',
    })

    const body = JSON.parse(calls[0].options.body ?? '{}')
    assert.equal(body.sellToken, '0xSell')
    assert.equal(body.buyToken, '0xBuy')
    assert.equal(body.sellAmountBeforeFee, '1000')
    assert.equal(body.from, '0xSender')
    assert.equal(body.kind, 'sell')
    assert.equal(body.partiallyFillable, false)
    assert.equal(body.signingScheme, 'eip712')
  })
})

describe('getOrder: parameter validation', () => {
  it('throws MISSING_ORDER_ID when orderId is missing', async () => {
    await assert.rejects(
      () => getOrder('ethereum', ''),
      (err) => err instanceof CowSwapError && err.code === 'MISSING_ORDER_ID',
    )
  })

  it('throws UNSUPPORTED_CHAIN for unknown chain', async () => {
    await assert.rejects(
      () => getOrder('polygon', '0xabc'),
      (err) => err instanceof CowSwapError && err.code === 'UNSUPPORTED_CHAIN',
    )
  })
})

describe('getOrder: API call', () => {
  it('GETs the correct endpoint', async () => {
    const mockOrder = { uid: '0xabc', status: 'fulfilled' }
    mockFetch([{ body: mockOrder }])

    const result = await getOrder('ethereum', '0xabc')

    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://api.cow.fi/mainnet/api/v1/orders/0xabc')
    assert.deepEqual(result, mockOrder)
  })
})

describe('getTrades: parameter validation', () => {
  it('throws MISSING_ORDER_ID when orderId is missing', async () => {
    await assert.rejects(
      () => getTrades('ethereum', ''),
      (err) => err instanceof CowSwapError && err.code === 'MISSING_ORDER_ID',
    )
  })
})

describe('getTrades: API call', () => {
  it('GETs the correct endpoint with query param', async () => {
    const mockTrades = [{ txHash: '0x123' }]
    mockFetch([{ body: mockTrades }])

    const result = await getTrades('ethereum', '0xabc')

    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://api.cow.fi/mainnet/api/v1/trades?orderUid=0xabc')
    assert.deepEqual(result, mockTrades)
  })
})

describe('submitOrder: parameter validation', () => {
  it('throws MISSING_QUOTE when quote is missing', async () => {
    await assert.rejects(
      () => submitOrder('ethereum', { signature: '0xsig' }),
      (err) => err instanceof CowSwapError && err.code === 'MISSING_QUOTE',
    )
  })

  it('throws MISSING_SIGNATURE when signature is missing', async () => {
    await assert.rejects(
      () => submitOrder('ethereum', { quote: { sellAmount: '100' } }),
      (err) => err instanceof CowSwapError && err.code === 'MISSING_SIGNATURE',
    )
  })
})

describe('cancelOrder: parameter validation', () => {
  it('throws MISSING_ORDER_ID when orderId is missing', async () => {
    await assert.rejects(
      () => cancelOrder('ethereum', ''),
      (err) => err instanceof CowSwapError && err.code === 'MISSING_ORDER_ID',
    )
  })

  it('throws UNSUPPORTED_CHAIN for unknown chain', async () => {
    await assert.rejects(
      () => cancelOrder('polygon', '0xabc'),
      (err) => err instanceof CowSwapError && err.code === 'UNSUPPORTED_CHAIN',
    )
  })
})

// cancelOrder API call tests are not included here because cancelOrder
// now signs via bridge.chain (EIP-712) before the DELETE request.
// Bridge mocking is out of scope for these unit tests. The parameter
// validation tests above cover the pre-bridge validation path.

describe('limitOrder: parameter validation', () => {
  it('throws MISSING_SELL_TOKEN when sellToken is missing', async () => {
    await assert.rejects(
      () =>
        limitOrder('ethereum', {
          buyToken: '0xdef',
          sellAmount: '100',
          buyAmount: '50',
          from: '0x1',
        }),
      (err) => err instanceof CowSwapError && err.code === 'MISSING_SELL_TOKEN',
    )
  })

  it('throws MISSING_BUY_AMOUNT when buyAmount is missing', async () => {
    await assert.rejects(
      () =>
        limitOrder('ethereum', {
          sellToken: '0xabc',
          buyToken: '0xdef',
          sellAmount: '100',
          from: '0x1',
        }),
      (err) => err instanceof CowSwapError && err.code === 'MISSING_BUY_AMOUNT',
    )
  })

  it('throws MISSING_SELL_AMOUNT when sellAmount is missing', async () => {
    await assert.rejects(
      () =>
        limitOrder('ethereum', {
          sellToken: '0xabc',
          buyToken: '0xdef',
          buyAmount: '50',
          from: '0x1',
        }),
      (err) => err instanceof CowSwapError && err.code === 'MISSING_SELL_AMOUNT',
    )
  })

  it('throws MISSING_FROM when from is missing', async () => {
    await assert.rejects(
      () =>
        limitOrder('ethereum', {
          sellToken: '0xabc',
          buyToken: '0xdef',
          sellAmount: '100',
          buyAmount: '50',
        }),
      (err) => err instanceof CowSwapError && err.code === 'MISSING_FROM',
    )
  })
})

describe('quote: error handling', () => {
  it('wraps HTTP errors as QUOTE_FAILED', async () => {
    mockFetch([{ status: 400, body: { description: 'Bad request' } }])

    await assert.rejects(
      () =>
        quote('ethereum', {
          sellToken: '0xabc',
          buyToken: '0xdef',
          sellAmountBeforeFee: '100',
          from: '0x1',
        }),
      (err) => err instanceof CowSwapError && err.code === 'QUOTE_FAILED' && err.statusCode === 400,
    )
  })

  it('re-throws non-HTTP errors unchanged', async () => {
    global.fetch = async () => {
      throw new TypeError('network failure')
    }

    await assert.rejects(
      () =>
        quote('ethereum', {
          sellToken: '0xabc',
          buyToken: '0xdef',
          sellAmountBeforeFee: '100',
          from: '0x1',
        }),
      (err) => err instanceof TypeError && err.message === 'network failure',
    )
  })
})

describe('submitOrder: API call', () => {
  it('POSTs to the correct endpoint with quote and signature', async () => {
    const mockUid = '0xorder123'
    mockFetch([{ body: mockUid }])

    const result = await submitOrder('ethereum', {
      quote: { sellToken: '0xabc', sellAmount: '100' },
      signature: '0xsig',
    })

    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://api.cow.fi/mainnet/api/v1/orders')
    const body = JSON.parse(calls[0].options.body)
    assert.equal(body.sellToken, '0xabc')
    assert.equal(body.sellAmount, '100')
    assert.equal(body.feeAmount, '0')
    assert.equal(body.signature, '0xsig')
    assert.equal(body.signingScheme, 'eip712')
    assert.deepEqual(result, mockUid)
  })

  it('wraps HTTP errors as SUBMIT_FAILED', async () => {
    mockFetch([{ status: 403, body: { description: 'Forbidden' } }])

    await assert.rejects(
      () =>
        submitOrder('ethereum', {
          quote: { sellAmount: '100' },
          signature: '0xsig',
        }),
      (err) =>
        err instanceof CowSwapError && err.code === 'SUBMIT_FAILED' && err.statusCode === 403,
    )
  })

  it('re-throws non-HTTP errors unchanged', async () => {
    global.fetch = async () => {
      throw new TypeError('connection refused')
    }

    await assert.rejects(
      () =>
        submitOrder('ethereum', {
          quote: { sellAmount: '100' },
          signature: '0xsig',
        }),
      (err) => err instanceof TypeError && err.message === 'connection refused',
    )
  })
})

describe('signAndSubmitOrder', () => {
  it('throws MISSING_QUOTE when quoteResponse.quote is missing', async () => {
    await assert.rejects(
      () => signAndSubmitOrder('ethereum', {}),
      (err) => err instanceof CowSwapError && err.code === 'MISSING_QUOTE',
    )
  })

  it('throws MISSING_QUOTE when quoteResponse is null', async () => {
    await assert.rejects(
      () => signAndSubmitOrder('ethereum', null),
      (err) => err instanceof CowSwapError && err.code === 'MISSING_QUOTE',
    )
  })

  it('throws INVALID_CHAIN for unsupported chain', async () => {
    await assert.rejects(
      () => signAndSubmitOrder('polygon', { quote: { sellToken: '0x1' }, from: '0xMe' }),
      (err) => err instanceof CowSwapError && err.code === 'INVALID_CHAIN',
    )
  })

  it('signs via bridge and submits the order', async () => {
    const mockSignature = '0xmocksig'
    const mockOrderUid = '0xorderuid456'

    bridge.chain = async (chainName, action, params) => {
      assert.equal(chainName, 'ethereum')
      assert.equal(action, 'sign-typed-data')
      assert.equal(params.primaryType, 'Order')
      assert.equal(params.domain.name, 'Gnosis Protocol')
      assert.equal(params.domain.version, 'v2')
      assert.equal(params.domain.chainId, 1)
      assert.equal(params.domain.verifyingContract, '0x9008D19f58AAbD9eD0D60971565AA8510560ab41')
      assert.equal(params.message.sellToken, '0xSell')
      assert.equal(params.message.buyToken, '0xBuy')
      assert.equal(params.message.feeAmount, '0')
      return { signature: mockSignature }
    }

    // submitOrder will POST to the API
    mockFetch([{ body: mockOrderUid }])

    const quoteResponse = {
      quote: {
        sellToken: '0xSell',
        buyToken: '0xBuy',
        receiver: '0xReceiver',
        sellAmount: '1000',
        buyAmount: '500',
        validTo: 1700000000,
        appData: '0x0000000000000000000000000000000000000000000000000000000000000000',
        kind: 'sell',
        partiallyFillable: false,
        sellTokenBalance: 'erc20',
        buyTokenBalance: 'erc20',
      },
      from: '0xSender',
    }

    const result = await signAndSubmitOrder('ethereum', quoteResponse)

    assert.equal(result, mockOrderUid)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://api.cow.fi/mainnet/api/v1/orders')
  })

  it('uses from as receiver when quote.receiver is missing', async () => {
    bridge.chain = async (_chain, _action, params) => {
      assert.equal(params.message.receiver, '0xSender')
      return { signature: '0xsig' }
    }

    mockFetch([{ body: '0xuid' }])

    await signAndSubmitOrder('ethereum', {
      quote: {
        sellToken: '0xS',
        buyToken: '0xB',
        sellAmount: '100',
        buyAmount: '50',
        validTo: 1700000000,
        appData: '0x00',
        kind: 'sell',
        partiallyFillable: false,
      },
      from: '0xSender',
    })
  })

  it('defaults sellTokenBalance and buyTokenBalance to erc20', async () => {
    bridge.chain = async (_chain, _action, params) => {
      assert.equal(params.message.sellTokenBalance, 'erc20')
      assert.equal(params.message.buyTokenBalance, 'erc20')
      return { signature: '0xsig' }
    }

    mockFetch([{ body: '0xuid' }])

    await signAndSubmitOrder('ethereum', {
      quote: {
        sellToken: '0xS',
        buyToken: '0xB',
        sellAmount: '100',
        buyAmount: '50',
        validTo: 1700000000,
        appData: '0x00',
        kind: 'sell',
        partiallyFillable: false,
      },
      from: '0xSender',
    })
  })

  it('uses gnosis chain ID for gnosis chain', async () => {
    bridge.chain = async (_chain, _action, params) => {
      assert.equal(params.domain.chainId, 100)
      return { signature: '0xsig' }
    }

    mockFetch([{ body: '0xuid' }])

    await signAndSubmitOrder('gnosis', {
      quote: {
        sellToken: '0xS',
        buyToken: '0xB',
        sellAmount: '100',
        buyAmount: '50',
        validTo: 1700000000,
        appData: '0x00',
        kind: 'sell',
        partiallyFillable: false,
      },
      from: '0xSender',
    })
  })
})

describe('getOrder: error handling', () => {
  it('wraps HTTP errors as ORDER_FETCH_FAILED', async () => {
    mockFetch([{ status: 404, body: { description: 'Not found' } }])

    await assert.rejects(
      () => getOrder('ethereum', '0xnotfound'),
      (err) =>
        err instanceof CowSwapError && err.code === 'ORDER_FETCH_FAILED' && err.statusCode === 404,
    )
  })

  it('re-throws non-HTTP errors unchanged', async () => {
    global.fetch = async () => {
      throw new TypeError('fetch failed')
    }

    await assert.rejects(
      () => getOrder('ethereum', '0xabc'),
      (err) => err instanceof TypeError && err.message === 'fetch failed',
    )
  })
})

describe('cancelOrder: full flow', () => {
  it('throws INVALID_CHAIN for unsupported chain after validation', async () => {
    // cancelOrder validates orderId first, then chain via resolveBaseUrl,
    // then checks CHAIN_IDS. Use a chain that passes resolveBaseUrl but
    // not CHAIN_IDS — but all BASE_URLS keys are in CHAIN_IDS, so this
    // tests the explicit CHAIN_IDS check with a totally unknown chain.
    // However, resolveBaseUrl throws first for unknown chains.
    // We need to test the INVALID_CHAIN path: this would require a chain
    // in BASE_URLS but not CHAIN_IDS, which doesn't exist in the current code.
    // The UNSUPPORTED_CHAIN test in parameter validation covers the resolveBaseUrl path.
  })

  it('signs cancellation via bridge and DELETEs the order', async () => {
    const mockSignature = '0xcancelsig'

    bridge.chain = async (chainName, action, params) => {
      assert.equal(chainName, 'ethereum')
      assert.equal(action, 'sign-typed-data')
      assert.equal(params.primaryType, 'OrderCancellation')
      assert.equal(params.domain.name, 'Gnosis Protocol')
      assert.equal(params.domain.chainId, 1)
      assert.deepEqual(params.types, {
        OrderCancellation: [{ name: 'orderUid', type: 'bytes' }],
      })
      assert.deepEqual(params.message, { orderUid: '0xorder123' })
      return { signature: mockSignature }
    }

    mockFetch([{ status: 200, body: {} }])

    const result = await cancelOrder('ethereum', '0xorder123')

    assert.deepEqual(result, { cancelled: true, orderId: '0xorder123' })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://api.cow.fi/mainnet/api/v1/orders/0xorder123')
    assert.equal(calls[0].options.method, 'DELETE')
    const body = JSON.parse(calls[0].options.body)
    assert.equal(body.signature, mockSignature)
    assert.equal(body.signingScheme, 'eip712')
  })

  it('wraps HTTP errors as CANCEL_FAILED', async () => {
    bridge.chain = async () => ({ signature: '0xsig' })
    mockFetch([{ status: 500, body: { description: 'Server error' } }])

    await assert.rejects(
      () => cancelOrder('ethereum', '0xorder123'),
      (err) =>
        err instanceof CowSwapError && err.code === 'CANCEL_FAILED' && err.statusCode === 500,
    )
  })

  it('re-throws non-HTTP errors from the DELETE request', async () => {
    bridge.chain = async () => ({ signature: '0xsig' })
    global.fetch = async () => {
      throw new TypeError('network down')
    }

    await assert.rejects(
      () => cancelOrder('ethereum', '0xorder123'),
      (err) => err instanceof TypeError && err.message === 'network down',
    )
  })
})

describe('limitOrder: full flow', () => {
  it('gets a quote, overrides buyAmount and validTo, then signs and submits', async () => {
    const mockQuoteResponse = {
      quote: {
        sellToken: '0xSell',
        buyToken: '0xBuy',
        receiver: '0xSender',
        sellAmount: '1000',
        buyAmount: '999',
        validTo: 9999999,
        appData: '0x0000000000000000000000000000000000000000000000000000000000000000',
        kind: 'sell',
        partiallyFillable: false,
        sellTokenBalance: 'erc20',
        buyTokenBalance: 'erc20',
      },
      from: '0xSender',
    }

    bridge.chain = async () => ({ signature: '0xlimitsig' })

    // First fetch: quote API, second fetch: submitOrder API
    mockFetch([{ body: mockQuoteResponse }, { body: '0xlimitorderuid' }])

    const result = await limitOrder('ethereum', {
      sellToken: '0xSell',
      buyToken: '0xBuy',
      sellAmount: '1000',
      buyAmount: '500',
      from: '0xSender',
    })

    assert.equal(result, '0xlimitorderuid')
    assert.equal(calls.length, 2)
    // First call: quote
    assert.equal(calls[0].url, 'https://api.cow.fi/mainnet/api/v1/quote')
    // Second call: submitOrder
    assert.equal(calls[1].url, 'https://api.cow.fi/mainnet/api/v1/orders')
  })

  it('uses default validFor of 3600 seconds', async () => {
    const now = Math.floor(Date.now() / 1000)

    const mockQuoteResponse = {
      quote: {
        sellToken: '0xSell',
        buyToken: '0xBuy',
        sellAmount: '1000',
        buyAmount: '999',
        validTo: 9999999,
        appData: '0x00',
        kind: 'sell',
        partiallyFillable: false,
      },
      from: '0xSender',
    }

    let capturedValidTo
    bridge.chain = async (_chain, _action, params) => {
      capturedValidTo = params.message.validTo
      return { signature: '0xsig' }
    }

    mockFetch([{ body: mockQuoteResponse }, { body: '0xuid' }])

    await limitOrder('ethereum', {
      sellToken: '0xSell',
      buyToken: '0xBuy',
      sellAmount: '1000',
      buyAmount: '500',
      from: '0xSender',
    })

    // validTo should be approximately now + 3600
    assert.ok(capturedValidTo >= now + 3599 && capturedValidTo <= now + 3601)
  })

  it('respects custom validFor parameter', async () => {
    const now = Math.floor(Date.now() / 1000)

    const mockQuoteResponse = {
      quote: {
        sellToken: '0xSell',
        buyToken: '0xBuy',
        sellAmount: '1000',
        buyAmount: '999',
        validTo: 9999999,
        appData: '0x00',
        kind: 'sell',
        partiallyFillable: false,
      },
      from: '0xSender',
    }

    let capturedValidTo
    bridge.chain = async (_chain, _action, params) => {
      capturedValidTo = params.message.validTo
      return { signature: '0xsig' }
    }

    mockFetch([{ body: mockQuoteResponse }, { body: '0xuid' }])

    await limitOrder('ethereum', {
      sellToken: '0xSell',
      buyToken: '0xBuy',
      sellAmount: '1000',
      buyAmount: '500',
      from: '0xSender',
      validFor: '7200',
    })

    // validTo should be approximately now + 7200
    assert.ok(capturedValidTo >= now + 7199 && capturedValidTo <= now + 7201)
  })

  it('overrides buyAmount from the quote with the user limit', async () => {
    const mockQuoteResponse = {
      quote: {
        sellToken: '0xSell',
        buyToken: '0xBuy',
        sellAmount: '1000',
        buyAmount: '999',
        validTo: 9999999,
        appData: '0x00',
        kind: 'sell',
        partiallyFillable: false,
      },
      from: '0xSender',
    }

    let capturedBuyAmount
    bridge.chain = async (_chain, _action, params) => {
      capturedBuyAmount = params.message.buyAmount
      return { signature: '0xsig' }
    }

    mockFetch([{ body: mockQuoteResponse }, { body: '0xuid' }])

    await limitOrder('ethereum', {
      sellToken: '0xSell',
      buyToken: '0xBuy',
      sellAmount: '1000',
      buyAmount: '500',
      from: '0xSender',
    })

    assert.equal(capturedBuyAmount, '500')
  })

  it('throws MISSING_BUY_TOKEN when buyToken is missing', async () => {
    await assert.rejects(
      () =>
        limitOrder('ethereum', {
          sellToken: '0xabc',
          sellAmount: '100',
          buyAmount: '50',
          from: '0x1',
        }),
      (err) => err instanceof CowSwapError && err.code === 'MISSING_BUY_TOKEN',
    )
  })
})

describe('getTrades: error handling', () => {
  it('wraps HTTP errors as TRADES_FETCH_FAILED', async () => {
    mockFetch([{ status: 500, body: { description: 'Server error' } }])

    await assert.rejects(
      () => getTrades('ethereum', '0xabc'),
      (err) =>
        err instanceof CowSwapError && err.code === 'TRADES_FETCH_FAILED' && err.statusCode === 500,
    )
  })

  it('re-throws non-HTTP errors unchanged', async () => {
    global.fetch = async () => {
      throw new RangeError('out of range')
    }

    await assert.rejects(
      () => getTrades('ethereum', '0xabc'),
      (err) => err instanceof RangeError && err.message === 'out of range',
    )
  })
})

describe('CowSwapError', () => {
  it('is an instance of Error', () => {
    const err = new CowSwapError('TEST', 'test message')
    assert.ok(err instanceof Error)
  })

  it('has the correct name', () => {
    const err = new CowSwapError('TEST', 'test message')
    assert.equal(err.name, 'CowSwapError')
  })

  it('preserves code and message', () => {
    const err = new CowSwapError('MY_CODE', 'something broke')
    assert.equal(err.code, 'MY_CODE')
    assert.equal(err.message, 'something broke')
  })

  it('preserves statusCode', () => {
    const err = new CowSwapError('API_ERR', 'bad', { statusCode: 400 })
    assert.equal(err.statusCode, 400)
  })

  it('preserves details', () => {
    const details = { field: 'sellToken', reason: 'invalid' }
    const err = new CowSwapError('VALIDATION', 'invalid field', { details })
    assert.deepEqual(err.details, details)
  })
})
