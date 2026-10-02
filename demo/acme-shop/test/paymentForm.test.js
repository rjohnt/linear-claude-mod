import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PaymentForm } from '../src/payments/PaymentForm.js'
import { createCart } from '../src/payments/cart.js'

const respond = (status, body) => async () => ({ ok: status < 300, status, json: async () => body })

function fakeUi() {
  const calls = []
  return {
    calls,
    showToast: m => calls.push(['toast', m]),
    promptForNewCard: c => calls.push(['prompt', c]),
    goToConfirmation: r => calls.push(['confirm', r]),
  }
}

test('a successful charge clears the cart and confirms', async () => {
  const ui = fakeUi()
  const cart = createCart([{ priceCents: 1200, qty: 2 }])
  await new PaymentForm({ fetchImpl: respond(200, { id: 'ch_1' }), ui, cart }).submit({ id: 'card_1' })
  assert.deepEqual(ui.calls, [['confirm', { id: 'ch_1' }]])
  assert.equal(cart.items.length, 0)
})
