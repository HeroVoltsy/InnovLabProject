
-- 001_initial_schema.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================
-- 1. USERS AND ORGANIZATIONS
-- =====================================================

CREATE TABLE app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'PHP',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE organization_members (
    organization_id UUID NOT NULL
        REFERENCES organizations(id),
    user_id UUID NOT NULL REFERENCES app_users(id),
    role TEXT NOT NULL DEFAULT 'member'
        CHECK (role IN ('owner', 'admin', 'treasurer',
                        'reviewer', 'member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (organization_id, user_id)
);

-- =====================================================
-- 2. PROJECTS AND BUDGET ALLOCATIONS
-- =====================================================

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL
        REFERENCES organizations(id),
    name TEXT NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('draft', 'active',
                          'completed', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (organization_id, id),
    CHECK (end_date IS NULL OR start_date IS NULL
           OR end_date >= start_date)
);

CREATE TABLE budget_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL
        REFERENCES organizations(id),
    project_id UUID NOT NULL,
    category TEXT NOT NULL,
    description TEXT,

    allocated_amount NUMERIC(14, 2) NOT NULL
        CHECK (allocated_amount >= 0),
    currency CHAR(3) NOT NULL DEFAULT 'PHP',

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    FOREIGN KEY (organization_id, project_id)
        REFERENCES projects(organization_id, id),

    UNIQUE (organization_id, id)
);

-- =====================================================
-- 3. ORIGINAL FINANCIAL DOCUMENTS
-- Store image/PDF files in object storage, not in SQL.
-- =====================================================

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL
        REFERENCES organizations(id),
    uploaded_by UUID NOT NULL REFERENCES app_users(id),

    document_type TEXT NOT NULL DEFAULT 'receipt'
        CHECK (document_type IN (
            'receipt', 'invoice', 'bank_statement',
            'expense_report', 'purchase_order',
            'other'
        )),

    original_filename TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size_bytes BIGINT
        CHECK (file_size_bytes IS NULL
               OR file_size_bytes >= 0),

    -- SHA-256 of the original file, for integrity checks.
    sha256_hash TEXT CHECK (
        sha256_hash IS NULL
        OR sha256_hash ~ '^[a-f0-9]{64}$'
    ),

    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Use this to detect possible repeated uploads.
    UNIQUE (organization_id, id)
);

CREATE INDEX idx_documents_org_uploaded
    ON documents(organization_id, uploaded_at DESC);

CREATE INDEX idx_documents_hash
    ON documents(organization_id, sha256_hash);

-- =====================================================
-- 4. EXPENSE LEDGER
-- This stores the current structured expense record.
-- =====================================================

CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL
        REFERENCES organizations(id),
    project_id UUID NOT NULL,
    budget_allocation_id UUID,
    submitted_by UUID NOT NULL REFERENCES app_users(id),

    vendor_name TEXT,
    description TEXT NOT NULL,
    expense_date DATE NOT NULL,

    subtotal NUMERIC(14, 2),
    tax_amount NUMERIC(14, 2),
    total_amount NUMERIC(14, 2) NOT NULL
        CHECK (total_amount >= 0),

    currency CHAR(3) NOT NULL DEFAULT 'PHP',

    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN (
            'draft', 'submitted', 'under_review',
            'approved', 'rejected', 'void'
        )),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    FOREIGN KEY (organization_id, project_id)
        REFERENCES projects(organization_id, id),

    FOREIGN KEY (organization_id, budget_allocation_id)
        REFERENCES budget_allocations(organization_id, id),

    UNIQUE (organization_id, id),

    CHECK (subtotal IS NULL OR subtotal >= 0),
    CHECK (tax_amount IS NULL OR tax_amount >= 0)
);

CREATE INDEX idx_expenses_org_date
    ON expenses(organization_id, expense_date DESC);

CREATE INDEX idx_expenses_project_status
    ON expenses(organization_id, project_id, status);

CREATE INDEX idx_expenses_budget
    ON expenses(organization_id, budget_allocation_id);

-- Many-to-many: one expense may have several documents,
-- and a document may support more than one expense.
CREATE TABLE expense_documents (
    organization_id UUID NOT NULL,
    expense_id UUID NOT NULL,
    document_id UUID NOT NULL,
    evidence_role TEXT NOT NULL DEFAULT 'receipt'
        CHECK (evidence_role IN (
            'receipt', 'invoice', 'payment_proof',
            'other'
        )),
    linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (expense_id, document_id),

    FOREIGN KEY (organization_id, expense_id)
        REFERENCES expenses(organization_id, id),

    FOREIGN KEY (organization_id, document_id)
        REFERENCES documents(organization_id, id)
);

-- =====================================================
-- 5. VERSIONED OCR EXTRACTIONS
-- Never overwrite the original document when OCR changes.
-- =====================================================

CREATE TABLE ocr_extractions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    document_id UUID NOT NULL,

    extraction_version INTEGER NOT NULL DEFAULT 1
        CHECK (extraction_version > 0),

    engine_name TEXT NOT NULL,
    engine_version TEXT,

    -- Extracted vendor, totals, line items, dates, etc.
    extracted_data JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Per-field confidence, bounding boxes, and diagnostics.
    field_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN (
            'pending', 'completed', 'failed',
            'needs_review'
        )),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    FOREIGN KEY (organization_id, document_id)
        REFERENCES documents(organization_id, id),

    UNIQUE (document_id, extraction_version),
    UNIQUE (organization_id, id)
);

CREATE INDEX idx_ocr_data_gin
    ON ocr_extractions USING GIN (extracted_data);

-- =====================================================
-- 6. AUDIT EVENTS
-- Append events instead of silently overwriting history.
-- =====================================================

CREATE TABLE audit_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id UUID NOT NULL
        REFERENCES organizations(id),
    actor_user_id UUID REFERENCES app_users(id),

    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    action TEXT NOT NULL,

    -- Record only the relevant before/after fields.
    before_data JSONB,
    after_data JSONB,

    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    request_id UUID,
    reason TEXT
);

CREATE INDEX idx_audit_entity
    ON audit_events(
        organization_id, entity_type,
        entity_id, occurred_at DESC
    );

-- =====================================================
-- 7. DISCREPANCY CASES
-- A flag is an issue to investigate, not proof of fraud.
-- =====================================================

CREATE TABLE discrepancy_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL
        REFERENCES organizations(id),
    expense_id UUID NOT NULL,

    discrepancy_type TEXT NOT NULL
        CHECK (discrepancy_type IN (
            'amount_mismatch', 'duplicate_suspected',
            'missing_document', 'budget_exceeded',
            'date_mismatch', 'vendor_mismatch',
            'other'
        )),

    severity TEXT NOT NULL DEFAULT 'medium'
        CHECK (severity IN ('low', 'medium',
                            'high', 'critical')),

    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN (
            'open', 'investigating',
            'resolved', 'dismissed'
        )),

    explanation TEXT NOT NULL,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,

    detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_by UUID REFERENCES app_users(id),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,

    FOREIGN KEY (organization_id, expense_id)
        REFERENCES expenses(organization_id, id),

    UNIQUE (organization_id, id)
);

CREATE INDEX idx_discrepancies_open
    ON discrepancy_cases(organization_id, status, severity);

-- =====================================================
-- 8. SUMMARY GENERATION HISTORY
-- Preserve the exact report version and its sources.
-- =====================================================

CREATE TABLE report_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL
        REFERENCES organizations(id),
    project_id UUID NOT NULL,

    report_type TEXT NOT NULL DEFAULT 'budget_summary'
        CHECK (report_type IN (
            'budget_summary', 'expense_report',
            'audit_package'
        )),

    period_start DATE,
    period_end DATE,

    generator_name TEXT NOT NULL,
    generator_version TEXT,
    prompt_version TEXT,

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN (
            'pending', 'completed', 'failed'
        )),

    summary_text TEXT,
    calculation_data JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Identifies the evidence set used for this report.
    source_manifest JSONB NOT NULL DEFAULT '[]'::jsonb,

    generated_by UUID REFERENCES app_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    FOREIGN KEY (organization_id, project_id)
        REFERENCES projects(organization_id, id),

    UNIQUE (organization_id, id),

    CHECK (period_end IS NULL OR period_start IS NULL
           OR period_end >= period_start)
);

CREATE INDEX idx_reports_project_date
    ON report_runs(
        organization_id, project_id, created_at DESC
    );
