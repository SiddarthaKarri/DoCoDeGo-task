import { describe, expect, it } from 'vitest'
import { type Balance, call, createBill, createHome, type Share } from './helpers'

describe('edge cases and robustness', () => {
  it('handles concurrent payments on the same share with different keys', async () => {
    const { homeId } = await createHome(['Asha', 'Ben'])
    const bill = await createBill(homeId, 1000)
    const share = bill.body.shares[0]
    if (!share) throw new Error('missing share')

    const key1 = crypto.randomUUID()
    const key2 = crypto.randomUUID()

    // Dispatch two payments simultaneously
    const [res1, res2] = await Promise.all([
      call<Share>('POST', `/api/bills/${bill.body.id}/shares/${share.id}/pay`, {
        headers: { 'Idempotency-Key': key1 },
      }),
      call<Share>('POST', `/api/bills/${bill.body.id}/shares/${share.id}/pay`, {
        headers: { 'Idempotency-Key': key2 },
      }),
    ])

    const statuses = [res1.status, res2.status].sort()
    // Exactly one should succeed with 200, the other must conflict with 409
    expect(statuses).toEqual([200, 409])
  })

  it('handles concurrent payments on the same share with identical keys', async () => {
    const { homeId } = await createHome(['Asha', 'Ben'])
    const bill = await createBill(homeId, 1000)
    const share = bill.body.shares[0]
    if (!share) throw new Error('missing share')

    const key = crypto.randomUUID()

    // Dispatch two payments simultaneously with the same idempotency key
    const [res1, res2] = await Promise.all([
      call<Share>('POST', `/api/bills/${bill.body.id}/shares/${share.id}/pay`, {
        headers: { 'Idempotency-Key': key },
      }),
      call<Share>('POST', `/api/bills/${bill.body.id}/shares/${share.id}/pay`, {
        headers: { 'Idempotency-Key': key },
      }),
    ])

    // Both should receive 200 with the exact same paidAt timestamp
    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    expect(res1.body.paidAt).toBe(res2.body.paidAt)
  })

  it('correctly splits when totalCents is smaller than member count', async () => {
    const { homeId } = await createHome(['Asha', 'Ben', 'Chitra'])
    // 2 cents between 3 members: Asha gets 1, Ben gets 1, Chitra gets 0
    const bill = await createBill(homeId, 2)

    expect(bill.status).toBe(201)
    expect(bill.body.shares.map((s) => s.amountCents)).toEqual([1, 1, 0])
    expect(bill.body.shares.reduce((acc, s) => acc + s.amountCents, 0)).toBe(2)
  })

  it('rejects share payment if share does not belong to the requested bill', async () => {
    const { homeId } = await createHome(['Asha', 'Ben'])
    const bill1 = await createBill(homeId, 1000)
    const bill2 = await createBill(homeId, 2000)

    const shareFromBill1 = bill1.body.shares[0]
    if (!shareFromBill1) throw new Error('missing share')

    // Call payment on bill2 using shareFromBill1's id
    const res = await call('POST', `/api/bills/${bill2.body.id}/shares/${shareFromBill1.id}/pay`, {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    })

    expect(res.status).toBe(404)
  })

  it('calculates zero outstanding balance when all member shares are paid', async () => {
    const { homeId, members } = await createHome(['Asha', 'Ben'])
    const bill = await createBill(homeId, 600)

    for (const share of bill.body.shares) {
      const payRes = await call('POST', `/api/bills/${bill.body.id}/shares/${share.id}/pay`, {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      })
      expect(payRes.status).toBe(200)
    }

    const balances = await call<{ balances: Balance[] }>('GET', `/api/homes/${homeId}/balances`)
    expect(balances.status).toBe(200)
    expect(balances.body.balances).toEqual([
      { memberId: members[0]?.id, name: 'Asha', outstandingCents: 0 },
      { memberId: members[1]?.id, name: 'Ben', outstandingCents: 0 },
    ])
  })

  it('handles empty balances when home has no members', async () => {
    const home = await call<{ id: string }>('POST', '/api/homes', {
      body: { name: 'Empty Home' },
    })

    const balances = await call<{ balances: Balance[] }>(
      'GET',
      `/api/homes/${home.body.id}/balances`,
    )
    expect(balances.status).toBe(200)
    expect(balances.body.balances).toEqual([])
  })
})
