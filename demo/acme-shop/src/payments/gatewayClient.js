// Thin client for the card gateway. Non-2xx responses throw a GatewayError
// carrying the HTTP status and the gateway's error code from the body.
export class GatewayError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

export async function charge(fetchImpl, { cardId, amountCents }) {
  const res = await fetchImpl('/gateway/charges', {
    method: 'POST',
    body: JSON.stringify({ card_id: cardId, amount: amountCents }),
  })
  const body = await res.json()
  if (!res.ok) throw new GatewayError(res.status, body.error?.code, body.error?.message ?? '')
  return body
}
