/**
 * CoW Swap client unit tests.
 *
 * Tests the API client in isolation by mocking global.fetch.
 * No GitHub Actions runtime, no real API calls.
 */

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { quote, getOrder, getTrades, submitOrder, CowSwapError } from '../src/cowswap.js'

let originalFetch
let calls

beforeEach(() => {
  originalFetch = global.fetch
  calls = []
})

afterEach(() => {
  global.fetch = originalFetch
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
})
