export function createCart(items = []) {
  return {
    items,
    get totalCents() {
      return this.items.reduce((sum, i) => sum + i.priceCents * i.qty, 0)
    },
    clear() {
      this.items = []
    },
  }
}
