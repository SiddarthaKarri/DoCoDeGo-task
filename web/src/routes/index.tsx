import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'

export const Route = createFileRoute('/')({
  component: BillSplitterApp,
})

interface HomeItem {
  id: string
  name: string
  createdAt: string
}

interface MemberItem {
  id: string
  homeId: string
  name: string
  sortOrder: number
  createdAt: string
}

interface ShareItem {
  id: string
  memberId: string
  memberName: string
  amountCents: number
  paidAt: string | null
}

interface BillItem {
  id: string
  homeId: string
  title: string
  totalCents: number
  createdAt: string
  shares: ShareItem[]
}

interface BalanceItem {
  memberId: string
  name: string
  outstandingCents: number
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export function BillSplitterApp() {
  const [homes, setHomes] = useState<HomeItem[]>([])
  const [selectedHomeId, setSelectedHomeId] = useState<string>('')
  const [members, setMembers] = useState<MemberItem[]>([])
  const [bills, setBills] = useState<BillItem[]>([])
  const [balances, setBalances] = useState<BalanceItem[]>([])

  const [isLoadingHomes, setIsLoadingHomes] = useState<boolean>(true)
  const [isLoadingBills, setIsLoadingBills] = useState<boolean>(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [paymentErrors, setPaymentErrors] = useState<Record<string, string>>({})
  const [payingShareId, setPayingShareId] = useState<string | null>(null)

  // Forms state
  const [newHomeName, setNewHomeName] = useState('')
  const [newMemberName, setNewMemberName] = useState('')
  const [newBillTitle, setNewBillTitle] = useState('')
  const [newBillDollars, setNewBillDollars] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch all homes
  const fetchHomes = useCallback(async () => {
    setIsLoadingHomes(true)
    setGlobalError(null)
    try {
      const res = await fetch('/api/homes')
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? `Failed to fetch homes (status ${res.status})`)
      }
      const data = (await res.json()) as { homes: HomeItem[] }
      setHomes(data.homes)
      if (data.homes.length > 0 && !selectedHomeId) {
        setSelectedHomeId(data.homes[0]?.id ?? '')
      }
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Unknown error loading homes')
    } finally {
      setIsLoadingHomes(false)
    }
  }, [selectedHomeId])

  useEffect(() => {
    fetchHomes()
  }, [fetchHomes])

  // Fetch home details, bills, and balances
  const fetchHomeData = useCallback(async (homeId: string) => {
    if (!homeId) {
      setMembers([])
      setBills([])
      setBalances([])
      return
    }

    setIsLoadingBills(true)
    setGlobalError(null)
    try {
      const [homeRes, billsRes, balancesRes] = await Promise.all([
        fetch(`/api/homes/${homeId}`),
        fetch(`/api/homes/${homeId}/bills`),
        fetch(`/api/homes/${homeId}/balances`),
      ])

      if (!homeRes.ok) {
        const data = await homeRes.json().catch(() => null)
        throw new Error(data?.error ?? `Failed to fetch home details (${homeRes.status})`)
      }
      const homeData = (await homeRes.json()) as { members: MemberItem[] }
      setMembers(homeData.members ?? [])

      if (!billsRes.ok) {
        const data = await billsRes.json().catch(() => null)
        throw new Error(data?.error ?? `Failed to fetch bills (${billsRes.status})`)
      }
      const billsData = (await billsRes.json()) as { bills: BillItem[] }
      setBills(billsData.bills ?? [])

      if (!balancesRes.ok) {
        const data = await balancesRes.json().catch(() => null)
        throw new Error(data?.error ?? `Failed to fetch balances (${balancesRes.status})`)
      }
      const balancesData = (await balancesRes.json()) as { balances: BalanceItem[] }
      setBalances(balancesData.balances ?? [])
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Error loading bills and balances')
    } finally {
      setIsLoadingBills(false)
    }
  }, [])

  useEffect(() => {
    if (selectedHomeId) {
      fetchHomeData(selectedHomeId)
    }
  }, [selectedHomeId, fetchHomeData])

  // Handle Home creation
  const handleCreateHome = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newHomeName.trim()) return

    setIsSubmitting(true)
    setActionError(null)
    try {
      const res = await fetch('/api/homes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newHomeName.trim() }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error ?? 'Failed to create home')
      }

      setNewHomeName('')
      await fetchHomes()
      if (data?.id) {
        setSelectedHomeId(data.id)
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Error creating home')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle Member creation
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMemberName.trim() || !selectedHomeId) return

    setIsSubmitting(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/homes/${selectedHomeId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newMemberName.trim() }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error ?? 'Failed to add member')
      }

      setNewMemberName('')
      await fetchHomeData(selectedHomeId)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Error adding member')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle Bill creation
  const handleCreateBill = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBillTitle.trim() || !newBillDollars || !selectedHomeId) return

    const dollars = Number.parseFloat(newBillDollars)
    if (Number.isNaN(dollars) || dollars <= 0) {
      setActionError('Please enter a valid positive dollar amount')
      return
    }

    const totalCents = Math.round(dollars * 100)
    if (totalCents <= 0) {
      setActionError('Amount must be at least 1 cent')
      return
    }

    setIsSubmitting(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/homes/${selectedHomeId}/bills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newBillTitle.trim(), totalCents }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error ?? 'Failed to create bill')
      }

      setNewBillTitle('')
      setNewBillDollars('')
      await fetchHomeData(selectedHomeId)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Error creating bill')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle Share Payment with idempotency
  const handlePayShare = async (billId: string, shareId: string) => {
    setPayingShareId(shareId)
    // Clear previous error for this share
    setPaymentErrors((prev) => {
      const next = { ...prev }
      delete next[shareId]
      return next
    })

    const idempotencyKey = crypto.randomUUID()

    try {
      const res = await fetch(`/api/bills/${billId}/shares/${shareId}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
      })

      const data = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(data?.error ?? `Payment failed with status ${res.status}`)
      }

      // Optimistically or state update share to paid
      setBills((prevBills) =>
        prevBills.map((b) => {
          if (b.id !== billId) return b
          return {
            ...b,
            shares: b.shares.map((s) => {
              if (s.id !== shareId) return s
              return { ...s, paidAt: data.paidAt ?? new Date().toISOString() }
            }),
          }
        }),
      )

      // Refresh balances in the background
      if (selectedHomeId) {
        fetch(`/api/homes/${selectedHomeId}/balances`)
          .then((r) => r.json())
          .then((data: { balances: BalanceItem[] }) => {
            if (data.balances) setBalances(data.balances)
          })
          .catch(() => null)
      }
    } catch (err) {
      // Keep share UNPAID and display specific payment error
      const msg = err instanceof Error ? err.message : 'Payment failed'
      setPaymentErrors((prev) => ({ ...prev, [shareId]: msg }))
    } finally {
      setPayingShareId(null)
    }
  }

  const selectedHome = homes.find((h) => h.id === selectedHomeId)

  return (
    <div className="container">
      {/* Header */}
      <header className="header">
        <div className="title-group">
          <h1>Shared Bill Splitter</h1>
          <p>Split bills evenly and track payments fairly</p>
        </div>

        {homes.length > 0 && (
          <div>
            <label
              htmlFor="home-select"
              style={{
                fontSize: '0.85rem',
                fontWeight: 600,
                display: 'block',
                marginBottom: '0.25rem',
              }}
            >
              Select Home
            </label>
            <select
              id="home-select"
              className="form-select"
              value={selectedHomeId}
              onChange={(e) => setSelectedHomeId(e.target.value)}
              style={{ minWidth: 200 }}
            >
              {homes.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </header>

      {/* Global Error Banner with Retry */}
      {globalError && (
        <div className="alert alert-error">
          <div>
            <strong>Error: </strong>
            {globalError}
          </div>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => {
              if (selectedHomeId) fetchHomeData(selectedHomeId)
              else fetchHomes()
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Action Error Banner */}
      {actionError && (
        <div className="alert alert-error">
          <div>
            <strong>Action failed: </strong>
            {actionError}
          </div>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => setActionError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading Homes */}
      {isLoadingHomes ? (
        <div className="loading-container">
          <div className="spinner" />
          <p>Loading homes...</p>
        </div>
      ) : homes.length === 0 ? (
        /* Empty State: No Homes */
        <div className="empty-state">
          <h3>No homes created yet</h3>
          <p>Create your shared apartment or home to get started with bill splitting.</p>
          <form
            onSubmit={handleCreateHome}
            style={{ maxWidth: 400, margin: '0 auto', display: 'flex', gap: '0.5rem' }}
          >
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Flat 4B or Sunny Villa"
              value={newHomeName}
              onChange={(e) => setNewHomeName(e.target.value)}
              required
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting || !newHomeName.trim()}
            >
              {isSubmitting ? 'Creating...' : 'Create Home'}
            </button>
          </form>
        </div>
      ) : (
        <>
          {/* Top Controls Grid: Create Home & Add Member */}
          <div className="grid-2">
            {/* Create Another Home */}
            <div className="card">
              <h2 className="card-title">Create New Home</h2>
              <form onSubmit={handleCreateHome} style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Home name (e.g. Pine St 12)"
                  value={newHomeName}
                  onChange={(e) => setNewHomeName(e.target.value)}
                  required
                />
                <button
                  type="submit"
                  className="btn btn-secondary"
                  disabled={isSubmitting || !newHomeName.trim()}
                >
                  Create
                </button>
              </form>
            </div>

            {/* Add Member to Current Home */}
            <div className="card">
              <h2 className="card-title">Add Member to {selectedHome?.name ?? 'Home'}</h2>
              <form onSubmit={handleAddMember} style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Member name (e.g. Asha)"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  required
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting || !newMemberName.trim()}
                >
                  Add Member
                </button>
              </form>
            </div>
          </div>

          {/* Home Members & Balances Summary */}
          <div className="card">
            <div className="card-title">
              <span>Outstanding Balances ({selectedHome?.name})</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 400, color: 'var(--text-muted)' }}>
                {members.length} {members.length === 1 ? 'member' : 'members'}
              </span>
            </div>

            {members.length === 0 ? (
              <div className="alert alert-warning" style={{ margin: 0 }}>
                This home has no members yet. Add at least one member to split bills!
              </div>
            ) : balances.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                No balances recorded.
              </div>
            ) : (
              <div className="balance-grid">
                {balances.map((b) => (
                  <div key={b.memberId} className="balance-card">
                    <div className="balance-member-name">{b.name}</div>
                    <div
                      className={`balance-amount ${b.outstandingCents === 0 ? 'balance-paid-zero' : ''}`}
                    >
                      {formatCents(b.outstandingCents)}
                    </div>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                        marginTop: '0.2rem',
                      }}
                    >
                      {b.outstandingCents === 0 ? 'All paid up' : 'Owed'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Create Bill Form */}
          <div className="card">
            <h2 className="card-title">Add a New Bill</h2>
            {members.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                You must add members before creating a bill.
              </p>
            ) : (
              <form onSubmit={handleCreateBill}>
                <div className="grid-2">
                  <div className="form-group">
                    <label htmlFor="bill-title" className="form-label">
                      Bill Title
                    </label>
                    <input
                      id="bill-title"
                      type="text"
                      className="form-input"
                      placeholder="e.g. Electricity, Groceries, Internet"
                      value={newBillTitle}
                      onChange={(e) => setNewBillTitle(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="bill-amount" className="form-label">
                      Total Amount ($)
                    </label>
                    <input
                      id="bill-amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="form-input"
                      placeholder="e.g. 30.00"
                      value={newBillDollars}
                      onChange={(e) => setNewBillDollars(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting || !newBillTitle.trim() || !newBillDollars}
                >
                  {isSubmitting ? 'Splitting bill...' : 'Split & Add Bill'}
                </button>
              </form>
            )}
          </div>

          {/* Bills & Shares Section */}
          <div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 600, margin: '0 0 1rem' }}>
              Bills & Shares
            </h2>

            {isLoadingBills ? (
              <div className="loading-container">
                <div className="spinner" />
                <p>Loading bills and shares...</p>
              </div>
            ) : bills.length === 0 ? (
              <div className="empty-state">
                <h3>No bills yet</h3>
                <p>Add a bill above to split it between the members of {selectedHome?.name}.</p>
              </div>
            ) : (
              bills.map((bill) => (
                <article key={bill.id} className="bill-item">
                  <div className="bill-header">
                    <div>
                      <h3 className="bill-title">{bill.title}</h3>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Created on {formatDate(bill.createdAt)}
                      </span>
                    </div>
                    <div className="bill-total">{formatCents(bill.totalCents)}</div>
                  </div>

                  <div className="shares-list">
                    {bill.shares.map((share) => {
                      const isPaying = payingShareId === share.id
                      const shareError = paymentErrors[share.id]

                      return (
                        <div key={share.id}>
                          <div className="share-row">
                            <div className="share-info">
                              <span className="share-member">{share.memberName}</span>
                              <span className="share-amount">{formatCents(share.amountCents)}</span>
                            </div>

                            <div className="share-actions">
                              {share.paidAt ? (
                                <span
                                  className="badge badge-paid"
                                  title={`Paid at ${formatDate(share.paidAt)}`}
                                >
                                  ✓ Paid
                                </span>
                              ) : (
                                <>
                                  <span className="badge badge-unpaid">Unpaid</span>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-pay"
                                    disabled={isPaying}
                                    onClick={() => handlePayShare(bill.id, share.id)}
                                  >
                                    {isPaying ? (
                                      <>
                                        <div className="spinner spinner-sm" /> Paying...
                                      </>
                                    ) : (
                                      'Pay share'
                                    )}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Share Payment Error */}
                          {shareError && (
                            <div
                              className="alert alert-error"
                              style={{
                                margin: '0.35rem 0 0.5rem',
                                padding: '0.5rem 0.75rem',
                                fontSize: '0.85rem',
                              }}
                            >
                              <span>
                                <strong>Payment error: </strong>
                                {shareError}
                              </span>
                              <button
                                type="button"
                                className="btn btn-sm btn-secondary"
                                onClick={() => handlePayShare(bill.id, share.id)}
                                disabled={isPaying}
                              >
                                Retry
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </article>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
