import { Hono } from 'hono'

const app = new Hono<{ Bindings: Env }>()

app.get('/api/health', (c) => c.json({ status: 'ok' }))

// Create a new home
app.post('/api/homes', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (typeof body !== 'object' || body === null || !('name' in body)) {
    return c.json({ error: 'Name is required' }, 400)
  }

  const { name } = body as { name: unknown }
  if (typeof name !== 'string' || name.trim().length === 0) {
    return c.json({ error: 'Name must be a non-empty string' }, 400)
  }

  const id = crypto.randomUUID()
  const trimmedName = name.trim()
  const createdAt = new Date().toISOString()

  await c.env.DB.prepare('INSERT INTO homes (id, name, created_at) VALUES (?, ?, ?)')
    .bind(id, trimmedName, createdAt)
    .run()

  return c.json({ id, name: trimmedName }, 201)
})

export default app
