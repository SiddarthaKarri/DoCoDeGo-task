import { Hono } from 'hono'

const app = new Hono<{ Bindings: Env }>()

app.onError((err, c) => {
  return c.json({ error: err.message || 'Internal server error' }, 500)
})

app.get('/api/health', (c) => c.json({ status: 'ok' }))

// List homes
app.get('/api/homes', async (c) => {
  const result = await c.env.DB.prepare(
    'SELECT id, name, created_at AS createdAt FROM homes ORDER BY created_at DESC',
  ).all<{ id: string; name: string; createdAt: string }>()

  return c.json({ homes: result.results ?? [] }, 200)
})

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

// Get home details including its members
app.get('/api/homes/:homeId', async (c) => {
  const homeId = c.req.param('homeId')
  const home = await c.env.DB.prepare(
    'SELECT id, name, created_at AS createdAt FROM homes WHERE id = ?',
  )
    .bind(homeId)
    .first<{ id: string; name: string; createdAt: string }>()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const membersResult = await c.env.DB.prepare(
    'SELECT id, home_id AS homeId, name, sort_order AS sortOrder, created_at AS createdAt FROM members WHERE home_id = ? ORDER BY sort_order ASC',
  )
    .bind(homeId)
    .all<{ id: string; homeId: string; name: string; sortOrder: number; createdAt: string }>()

  return c.json({ ...home, members: membersResult.results ?? [] }, 200)
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

// Get bills and their shares for a home
app.get('/api/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?')
    .bind(homeId)
    .first<{ id: string }>()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const billsResult = await c.env.DB.prepare(
    'SELECT id, home_id AS homeId, title, total_cents AS totalCents, created_at AS createdAt FROM bills WHERE home_id = ? ORDER BY created_at DESC',
  )
    .bind(homeId)
    .all<{ id: string; homeId: string; title: string; totalCents: number; createdAt: string }>()

  const bills = billsResult.results ?? []
  if (bills.length === 0) {
    return c.json({ bills: [] }, 200)
  }

  const billIds = bills.map((b) => b.id)
  const placeholders = billIds.map(() => '?').join(',')

  const sharesResult = await c.env.DB.prepare(
    `SELECT
      s.id,
      s.bill_id AS billId,
      s.member_id AS memberId,
      m.name AS memberName,
      s.amount_cents AS amountCents,
      s.paid_at AS paidAt
    FROM shares s
    JOIN members m ON m.id = s.member_id
    WHERE s.bill_id IN (${placeholders})
    ORDER BY m.sort_order ASC`,
  )
    .bind(...billIds)
    .all<{
      id: string
      billId: string
      memberId: string
      memberName: string
      amountCents: number
      paidAt: string | null
    }>()

  const sharesByBill = new Map<
    string,
    Array<{
      id: string
      memberId: string
      memberName: string
      amountCents: number
      paidAt: string | null
    }>
  >()

  for (const share of sharesResult.results ?? []) {
    const list = sharesByBill.get(share.billId) ?? []
    list.push({
      id: share.id,
      memberId: share.memberId,
      memberName: share.memberName,
      amountCents: share.amountCents,
      paidAt: share.paidAt,
    })
    sharesByBill.set(share.billId, list)
  }

  const billsWithShares = bills.map((b) => ({
    ...b,
    shares: sharesByBill.get(b.id) ?? [],
  }))

  return c.json({ bills: billsWithShares }, 200)
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

// Pay a share with idempotency protection
app.post('/api/bills/:billId/shares/:shareId/pay', async (c) => {
  const idempotencyKey = c.req.header('Idempotency-Key')
  if (!idempotencyKey || idempotencyKey.trim().length === 0) {
    return c.json({ error: 'Idempotency-Key header is required' }, 400)
  }

  const billId = c.req.param('billId')
  const shareId = c.req.param('shareId')

  const bill = await c.env.DB.prepare('SELECT id FROM bills WHERE id = ?')
    .bind(billId)
    .first<{ id: string }>()

  if (!bill) {
    return c.json({ error: 'Bill not found' }, 404)
  }

  const share = await c.env.DB.prepare(
    'SELECT id, member_id, amount_cents, paid_at, idempotency_key FROM shares WHERE id = ? AND bill_id = ?',
  )
    .bind(shareId, billId)
    .first<{
      id: string
      member_id: string
      amount_cents: number
      paid_at: string | null
      idempotency_key: string | null
    }>()

  if (!share) {
    return c.json({ error: 'Share not found' }, 404)
  }

  if (share.paid_at !== null) {
    if (share.idempotency_key === idempotencyKey) {
      return c.json(
        {
          id: share.id,
          memberId: share.member_id,
          amountCents: share.amount_cents,
          paidAt: share.paid_at,
        },
        200,
      )
    }
    return c.json({ error: 'Share already paid with a different idempotency key' }, 409)
  }

  const now = new Date().toISOString()
  const result = await c.env.DB.prepare(
    'UPDATE shares SET paid_at = ?, idempotency_key = ? WHERE id = ? AND bill_id = ? AND paid_at IS NULL',
  )
    .bind(now, idempotencyKey, shareId, billId)
    .run()

  if (result.meta.changes === 1) {
    return c.json(
      {
        id: share.id,
        memberId: share.member_id,
        amountCents: share.amount_cents,
        paidAt: now,
      },
      200,
    )
  }

  // If another concurrent request updated it first:
  const currentShare = await c.env.DB.prepare(
    'SELECT id, member_id, amount_cents, paid_at, idempotency_key FROM shares WHERE id = ? AND bill_id = ?',
  )
    .bind(shareId, billId)
    .first<{
      id: string
      member_id: string
      amount_cents: number
      paid_at: string | null
      idempotency_key: string | null
    }>()

  if (currentShare && currentShare.idempotency_key === idempotencyKey) {
    return c.json(
      {
        id: currentShare.id,
        memberId: currentShare.member_id,
        amountCents: currentShare.amount_cents,
        paidAt: currentShare.paid_at,
      },
      200,
    )
  }

  return c.json({ error: 'Share already paid with a different idempotency key' }, 409)
})

// Get balances for all members of a home
app.get('/api/homes/:homeId/balances', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?')
    .bind(homeId)
    .first<{ id: string }>()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const balancesResult = await c.env.DB.prepare(
    `SELECT
      m.id AS memberId,
      m.name AS name,
      COALESCE(
        (
          SELECT SUM(s.amount_cents)
          FROM shares s
          JOIN bills b ON b.id = s.bill_id
          WHERE s.member_id = m.id
            AND b.home_id = m.home_id
            AND s.paid_at IS NULL
        ),
        0
      ) AS outstandingCents
    FROM members m
    WHERE m.home_id = ?
    ORDER BY m.sort_order ASC`,
  )
    .bind(homeId)
    .all<{ memberId: string; name: string; outstandingCents: number }>()

  return c.json(
    {
      balances: balancesResult.results ?? [],
    },
    200,
  )
})

export default app
