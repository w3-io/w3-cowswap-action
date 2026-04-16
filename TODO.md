# TODO

## Current state: all commands exercised in E2E

The action covers CoW Protocol's full order lifecycle: quote, sign
(EIP-712), submit, poll status, cancel. All paths are in the E2E YAML.

## Potential additions

- [ ] Limit orders — CoW supports limit orders with `validTo` far in
      the future. Our current E2E is happy-path market orders only.
      Add a limit-order path to cover the different quote shape.
- [ ] Partially-fillable orders — surface `partiallyFillable` in the
      order submission flow. CoW auctions support this but our
      workflow treats it as implicit.
- [ ] MEV-protected swap report — CoW emits a receipt that includes
      the solver, price improvement vs AMM, etc. Useful to expose as
      a post-fill read command for workflow logic that wants to
      verify the trade quality.
- [ ] Meta-transaction pre-signed order — CoW lets a relayer submit
      a pre-signed order on behalf of the signer. Relevant for
      workflows that sign off-chain then hand off to a third party.

## Docs

- [ ] `docs/guide.md` covers the single-step swap happy path but
      doesn't walk through the `getQuote → signOrder → submitOrder →
  waitForFill` pattern for reusable workflow authors. Add a
      worked example using the chain-step outputs pattern.
