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

// Create a bill in a home and split it among members
app.post('/api/homes/:homeId/bills', async (c) => {
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

  if (typeof body !== 'object' || body === null) {
    return c.json({ error: 'Request body must be an object' }, 422)
  }

  const { title, totalCents } = body as { title?: unknown; totalCents?: unknown }

  if (typeof totalCents !== 'number' || !Number.isInteger(totalCents) || totalCents <= 0) {
    return c.json({ error: 'Total cents must be a positive integer' }, 422)
  }

  if (typeof title !== 'string' || title.trim().length === 0) {
    return c.json({ error: 'Title must be a non-empty string' }, 422)
  }

  const membersResult = await c.env.DB.prepare(
    'SELECT id, name FROM members WHERE home_id = ? ORDER BY sort_order ASC',
  )
    .bind(homeId)
    .all<{ id: string; name: string }>()

  const members = membersResult.results
  if (!members || members.length === 0) {
    return c.json({ error: 'Home has no members' }, 422)
  }

  const billId = crypto.randomUUID()
  const trimmedTitle = title.trim()
  const createdAt = new Date().toISOString()

  const memberCount = members.length
  const baseShare = Math.floor(totalCents / memberCount)
  const remainder = totalCents % memberCount

  const shares: Array<{
    id: string
    memberId: string
    amountCents: number
    paidAt: string | null
  }> = []
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(
      'INSERT INTO bills (id, home_id, title, total_cents, created_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(billId, homeId, trimmedTitle, totalCents, createdAt),
  ]

  for (let i = 0; i < memberCount; i++) {
    const member = members[i]
    if (!member) continue
    const amountCents = baseShare + (i < remainder ? 1 : 0)
    const shareId = crypto.randomUUID()

    shares.push({
      id: shareId,
      memberId: member.id,
      amountCents,
      paidAt: null,
    })

    statements.push(
      c.env.DB.prepare(
        'INSERT INTO shares (id, bill_id, member_id, amount_cents, paid_at, idempotency_key, created_at) VALUES (?, ?, ?, ?, NULL, NULL, ?)',
      ).bind(shareId, billId, member.id, amountCents, createdAt),
    )
  }

  await c.env.DB.batch(statements)

  return c.json(
    {
      id: billId,
      homeId,
      title: trimmedTitle,
      totalCents,
      shares,
    },
    201,
  )
})

export default app
