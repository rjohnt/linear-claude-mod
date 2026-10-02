// Token-bucket rate limiter middleware, keyed by client IP.
export function rateLimit({ burst, perSecond, now = () => Date.now() }) {
  const buckets = new Map()
  return (req, res, next) => {
    const t = now()
    const b = buckets.get(req.ip) ?? { tokens: burst, at: t }
    b.tokens = Math.min(burst, b.tokens + ((t - b.at) / 1000) * perSecond)
    b.at = t
    if (b.tokens < 1) {
      res.set('Retry-After', String(Math.ceil((1 - b.tokens) / perSecond)))
      return res.status(429).json({ error: 'rate_limited' })
    }
    b.tokens -= 1
    buckets.set(req.ip, b)
    next()
  }
}
