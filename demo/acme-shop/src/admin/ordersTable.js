// Orders table for the merchant dashboard.
export function ordersTable(orders, { filter = () => true, sortBy = 'createdAt' } = {}) {
  return orders.filter(filter).sort((a, b) => (a[sortBy] < b[sortBy] ? 1 : -1))
}
