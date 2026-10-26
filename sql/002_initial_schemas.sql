
-- 002_ngo_financial_workflow.sql

-- =====================================================
-- A. EXPENSE FORM
-- =====================================================

ALTER TABLE expenses
    ADD COLUMN IF NOT EXISTS transaction_date DATE,
    ADD COLUMN IF NOT EXISTS submitter_name TEXT,
    ADD COLUMN IF NOT EXISTS category TEXT;

-- Backfill transaction_date from the existing expense_date.
UPDATE expenses
SET transaction_date = expense_date
WHERE transaction_date IS NULL;

-- Keep the old column synchronized during migration.
-- After updating the backend, you can migrate all queries
-- to transaction_date and remove expense_date.

ALTER TABLE expenses
    ALTER COLUMN transaction_date SET NOT NULL;

ALTER TABLE expenses
    ADD CONSTRAINT expenses_category_check
    CHECK (
        category IS NULL OR category IN (
            'Program Supplies',
            'Transportation',
            'Administrative',
            'Equipment'
        )
    );

CREATE INDEX IF NOT EXISTS idx_expenses_org_transaction_date
    ON expenses(organization_id, transaction_date);

-- =====================================================
-- B. FUNDS RECEIVED
-- One row per actual incoming funding transaction.
-- =====================================================

CREATE TABLE fund_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organization_id UUID NOT NULL
        REFERENCES organizations(id),

    received_date DATE NOT NULL,
    source_name TEXT NOT NULL,

    amount NUMERIC(14,2) NOT NULL
        CHECK (amount > 0),

    currency CHAR(3) NOT NULL DEFAULT 'PHP',

    restriction_type TEXT NOT NULL
        CHECK (restriction_type IN (
            'restricted',
            'unrestricted'
        )),

    reference_number TEXT,
    description TEXT,

    recorded_by UUID NOT NULL
        REFERENCES app_users(id),

    status TEXT NOT NULL DEFAULT 'confirmed'
        CHECK (status IN (
            'pending', 'confirmed', 'void'
        )),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (organization_id, id)
);

CREATE INDEX idx_fund_receipts_org_date
    ON fund_receipts(organization_id, received_date);

-- =====================================================
-- C. PROJECT ALLOCATIONS
-- Link received money to the projects it can fund.
-- =====================================================

CREATE TABLE fund_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organization_id UUID NOT NULL,
    fund_receipt_id UUID NOT NULL,
    project_id UUID NOT NULL,

    allocated_amount NUMERIC(14,2) NOT NULL
        CHECK (allocated_amount > 0),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    FOREIGN KEY (organization_id, fund_receipt_id)
        REFERENCES fund_receipts(organization_id, id),

    FOREIGN KEY (organization_id, project_id)
        REFERENCES projects(organization_id, id),

    UNIQUE (organization_id, id)
);

CREATE INDEX idx_fund_allocations_project
    ON fund_allocations(organization_id, project_id);

CREATE INDEX idx_fund_allocations_receipt
    ON fund_allocations(organization_id, fund_receipt_id);

-- Enforce allocation totals in a transaction-safe
-- database function/trigger or application service:
-- total allocations cannot exceed the received amount.
-- Also validate project restrictions before allocation.

-- =====================================================
-- D. FUND RECEIPT SUPPORTING DOCUMENTS
-- =====================================================

CREATE TABLE fund_receipt_documents (
    organization_id UUID NOT NULL,
    fund_receipt_id UUID NOT NULL,
    document_id UUID NOT NULL,

    PRIMARY KEY (fund_receipt_id, document_id),

    FOREIGN KEY (organization_id, fund_receipt_id)
        REFERENCES fund_receipts(organization_id, id),

    FOREIGN KEY (organization_id, document_id)
        REFERENCES documents(organization_id, id)
);

-- =====================================================
-- E. LINK EXPENSES TO RECEIPTS AND DOCUMENTS
-- Use the existing expense_documents table.
-- Every expense should have at least one receipt before
-- approval, unless a documented exception is authorized.
-- =====================================================

-- The existing expense_documents table supports multiple
-- documents per expense. No additional receipt column
-- is necessary.

-- =====================================================
-- F. REPORT METADATA
-- Store generated PDF references separately from totals.
-- =====================================================

CREATE TABLE generated_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organization_id UUID NOT NULL
        REFERENCES organizations(id),

    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    generated_by UUID NOT NULL
        REFERENCES app_users(id),

    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    storage_key TEXT,
    report_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,

    CHECK (period_end >= period_start)
);

CREATE INDEX idx_generated_reports_org_date
    ON generated_reports(
        organization_id, generated_at DESC
    );
