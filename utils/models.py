
import enum
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def enum_column(enum_cls, name: str):
    """Persist enum values such as 'approved' in PostgreSQL."""
    return Enum(
        enum_cls,
        name=name,
        native_enum=False,
        create_constraint=True,
        validate_strings=True,
        values_callable=lambda items: [item.value for item in items],
    )


class ExpenseCategory(str, enum.Enum):
    PROGRAM_SUPPLIES = "Program Supplies"
    TRANSPORTATION = "Transportation"
    ADMINISTRATIVE = "Administrative"
    EQUIPMENT = "Equipment"


class ExpenseStatus(str, enum.Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    VOID = "void"


class RestrictionType(str, enum.Enum):
    RESTRICTED = "restricted"
    UNRESTRICTED = "unrestricted"


class FundStatus(str, enum.Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    VOID = "void"


class MemberRole(str, enum.Enum):
    OWNER = "owner"
    ADMIN = "admin"
    TREASURER = "treasurer"
    REVIEWER = "reviewer"
    MEMBER = "member"


class AppUser(Base):
    __tablename__ = "app_users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(
        String(320), unique=True, index=True
    )
    full_name: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(200))
    currency: Mapped[str] = mapped_column(
        String(3), default="PHP", server_default="PHP"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class OrganizationMember(Base):
    __tablename__ = "organization_members"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("app_users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    role: Mapped[MemberRole] = mapped_column(
        enum_column(MemberRole, "member_role"),
        default=MemberRole.MEMBER,
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        UniqueConstraint("organization_id", "id"),
        CheckConstraint(
            "end_date IS NULL OR start_date IS NULL "
            "OR end_date >= start_date",
            name="ck_project_date_range",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class BudgetAllocation(Base):
    __tablename__ = "budget_allocations"
    __table_args__ = (
        UniqueConstraint("organization_id", "id"),
        ForeignKeyConstraint(
            ["organization_id", "project_id"],
            ["projects.organization_id", "projects.id"],
        ),
        CheckConstraint(
            "allocated_amount >= 0",
            name="ck_budget_nonnegative",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    category: Mapped[str] = mapped_column(String(100))
    allocated_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Document(Base):
    """File metadata only; actual receipt bytes live in private storage."""

    __tablename__ = "documents"
    __table_args__ = (
        UniqueConstraint("organization_id", "id"),
        Index("ix_document_org_hash", "organization_id", "sha256_hash"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )
    uploaded_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("app_users.id")
    )
    original_filename: Mapped[str] = mapped_column(String(500))
    storage_key: Mapped[str] = mapped_column(String(1000))
    mime_type: Mapped[str] = mapped_column(String(150))
    sha256_hash: Mapped[str | None] = mapped_column(String(64))
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = (
        UniqueConstraint("organization_id", "id"),
        ForeignKeyConstraint(
            ["organization_id", "project_id"],
            ["projects.organization_id", "projects.id"],
        ),
        ForeignKeyConstraint(
            ["organization_id", "budget_allocation_id"],
            ["budget_allocations.organization_id", "budget_allocations.id"],
        ),
        CheckConstraint(
            "total_amount >= 0",
            name="ck_expense_nonnegative",
        ),
        Index("ix_expense_org_date", "organization_id", "transaction_date"),
        Index(
            "ix_expense_org_status",
            "organization_id", "status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    budget_allocation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True)
    )
    submitted_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("app_users.id")
    )
    submitter_name: Mapped[str] = mapped_column(String(200))
    transaction_date: Mapped[date] = mapped_column(Date)
    vendor_name: Mapped[str | None] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[ExpenseCategory] = mapped_column(
        enum_column(ExpenseCategory, "expense_category")
    )
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    status: Mapped[ExpenseStatus] = mapped_column(
        enum_column(ExpenseStatus, "expense_status"),
        default=ExpenseStatus.DRAFT,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class ExpenseDocument(Base):
    __tablename__ = "expense_documents"
    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "expense_id"],
            ["expenses.organization_id", "expenses.id"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["organization_id", "document_id"],
            ["documents.organization_id", "documents.id"],
            ondelete="CASCADE",
        ),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    expense_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True
    )
    evidence_role: Mapped[str] = mapped_column(
        String(40), default="receipt"
    )


class FundReceipt(Base):
    """One record for each incoming donation, grant, or other fund receipt."""

    __tablename__ = "fund_receipts"
    __table_args__ = (
        UniqueConstraint("organization_id", "id"),
        CheckConstraint("amount > 0", name="ck_fund_amount_positive"),
        ForeignKeyConstraint(
            ["organization_id", "restricted_project_id"],
            ["projects.organization_id", "projects.id"],
        ),
        Index("ix_fund_org_date", "organization_id", "received_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )
    received_date: Mapped[date] = mapped_column(Date)
    source_name: Mapped[str] = mapped_column(String(300))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    restriction_type: Mapped[RestrictionType] = mapped_column(
        enum_column(RestrictionType, "restriction_type")
    )
    restricted_project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True)
    )
    reference_number: Mapped[str | None] = mapped_column(String(150))
    description: Mapped[str | None] = mapped_column(Text)
    recorded_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("app_users.id")
    )
    status: Mapped[FundStatus] = mapped_column(
        enum_column(FundStatus, "fund_status"),
        default=FundStatus.CONFIRMED,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class FundAllocation(Base):
    __tablename__ = "fund_allocations"
    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "fund_receipt_id"],
            ["fund_receipts.organization_id", "fund_receipts.id"],
        ),
        ForeignKeyConstraint(
            ["organization_id", "project_id"],
            ["projects.organization_id", "projects.id"],
        ),
        CheckConstraint(
            "allocated_amount > 0",
            name="ck_fund_allocation_positive",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    fund_receipt_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    allocated_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class OCRExtraction(Base):
    """Preserve each OCR result; never overwrite approved expense values silently."""

    __tablename__ = "ocr_extractions"
    __table_args__ = (
        UniqueConstraint("document_id", "version"),
        ForeignKeyConstraint(
            ["organization_id", "document_id"],
            ["documents.organization_id", "documents.id"],
            ondelete="CASCADE",
        ),
        CheckConstraint("version > 0", name="ck_ocr_version_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    version: Mapped[int] = mapped_column(default=1)
    engine_name: Mapped[str] = mapped_column(String(100))
    extracted_data: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    field_confidence: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (
        Index(
            "ix_audit_entity",
            "organization_id", "entity_type", "entity_id",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("app_users.id")
    )
    entity_type: Mapped[str] = mapped_column(String(100))
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    action: Mapped[str] = mapped_column(String(100))
    before_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    after_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    reason: Mapped[str | None] = mapped_column(Text)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class GeneratedReport(Base):
    __tablename__ = "generated_reports"
    __table_args__ = (
        CheckConstraint("period_end >= period_start", name="ck_report_period"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    generated_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("app_users.id")
    )
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    storage_key: Mapped[str | None] = mapped_column(String(1000))
    report_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
