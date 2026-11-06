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

// Add a member to a home
app.post('/api/homes/:homeId/members', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?')
    .bind(homeId)
    .first<{ id: string }>()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

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

  const nextOrderResult = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM members WHERE home_id = ?',
  )
    .bind(homeId)
    .first<{ next_order: number }>()

  const sortOrder = nextOrderResult?.next_order ?? 1
  const id = crypto.randomUUID()
  const trimmedName = name.trim()
  const createdAt = new Date().toISOString()

  await c.env.DB.prepare(
    'INSERT INTO members (id, home_id, name, sort_order, created_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(id, homeId, trimmedName, sortOrder, createdAt)
    .run()

  return c.json({ id, homeId, name: trimmedName }, 201)
})

export default app
