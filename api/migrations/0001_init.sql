-- Migration 0001_init.sql
-- Schema with named constraints for homes, members, bills, and shares

CREATE TABLE IF NOT EXISTS homes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT chk_homes_name_non_empty CHECK (length(trim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  home_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT fk_members_home_id FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE,
  CONSTRAINT chk_members_name_non_empty CHECK (length(trim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  home_id TEXT NOT NULL,
  title TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT fk_bills_home_id FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE,
  CONSTRAINT chk_bills_total_cents_positive CHECK (total_cents > 0),
  CONSTRAINT chk_bills_title_non_empty CHECK (length(trim(title)) > 0)
);

CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  bill_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  paid_at TEXT DEFAULT NULL,
  idempotency_key TEXT DEFAULT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT fk_shares_bill_id FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE,
  CONSTRAINT fk_shares_member_id FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  CONSTRAINT chk_shares_amount_cents_positive CHECK (amount_cents > 0),
  CONSTRAINT uq_shares_bill_member UNIQUE (bill_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_members_home_order ON members(home_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_bills_home ON bills(home_id);
CREATE INDEX IF NOT EXISTS idx_shares_bill ON shares(bill_id);
CREATE INDEX IF NOT EXISTS idx_shares_member ON shares(member_id);
CREATE INDEX IF NOT EXISTS idx_shares_idempotency ON shares(idempotency_key);
