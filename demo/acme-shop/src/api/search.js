// GET /api/search?q=
export function searchHandler(catalog) {
  return (req, res) => {
    const q = String(req.query.q ?? '').toLowerCase()
    res.json({ results: catalog.filter(p => p.name.toLowerCase().includes(q)).slice(0, 20) })
  }
}
