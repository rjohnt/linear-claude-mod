import { charge } from './gatewayClient.js'

// Drives the checkout payment step. `ui` is the view adapter: showToast,
// promptForNewCard, goToConfirmation.
export class PaymentForm {
  constructor({ fetchImpl, ui, cart }) {
    this.fetchImpl = fetchImpl
    this.ui = ui
    this.cart = cart
  }

  async submit(savedCard) {
    try {
      const receipt = await charge(this.fetchImpl, { cardId: savedCard.id, amountCents: this.cart.totalCents })
      this.cart.clear()
      this.ui.goToConfirmation(receipt)
    } catch (err) {
      // TODO: map gateway errors to something useful for the customer
      this.ui.showToast(err.message)
    }
  }
}
