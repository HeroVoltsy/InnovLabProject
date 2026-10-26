
import uuid
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AppUser,
    AuditEvent,
    Expense,
    ExpenseCategory,
    ExpenseDocument,
    ExpenseStatus,
    FundAllocation,
    FundReceipt,
    FundStatus,
    GeneratedReport,
    Organization,
    OrganizationMember,
    Project,
    RestrictionType,
)


async def create_user(
    session: AsyncSession,
    *,
    email: str,
    full_name: str,
) -> AppUser:
    user = AppUser(
        email=email.strip().lower(),
        full_name=full_name.strip(),
    )
    session.add(user)
    await session.flush()
    return user


async def create_organization(
    session: AsyncSession,
    *,
    name: str,
    owner_user_id: uuid.UUID,
) -> Organization:
    organization = Organization(name=name.strip())
    session.add(organization)
    await session.flush()

    session.add(
        OrganizationMember(
            organization_id=organization.id,
            user_id=owner_user_id,
            role="owner",
        )
    )
    await session.flush()

    return organization


async def create_project(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    name: str,
    description: str | None = None,
) -> Project:
    project = Project(
        organization_id=organization_id,
        name=name.strip(),
        description=description,
    )
    session.add(project)
    await session.flush()
    return project


async def create_expense(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    project_id: uuid.UUID,
    submitted_by: uuid.UUID,
    submitter_name: str,
    transaction_date: date,
    vendor_name: str | None,
    description: str,
    category: ExpenseCategory,
    total_amount: Decimal,
    document_ids: list[uuid.UUID] | None = None,
) -> Expense:
    if total_amount <= 0:
        raise ValueError("Expense amount must be greater than zero.")

    expense = Expense(
        organization_id=organization_id,
        project_id=project_id,
        submitted_by=submitted_by,
        submitter_name=submitter_name.strip(),
        transaction_date=transaction_date,
        vendor_name=vendor_name,
        description=description.strip(),
        category=category,
        total_amount=total_amount,
        status=ExpenseStatus.SUBMITTED,
    )

    session.add(expense)
    await session.flush()

    for document_id in document_ids or []:
        session.add(
            ExpenseDocument(
                organization_id=organization_id,
                expense_id=expense.id,
                document_id=document_id,
                evidence_role="receipt",
            )
        )

    await session.flush()
    return expense


async def create_fund_receipt(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    recorded_by: uuid.UUID,
    received_date: date,
    source_name: str,
    amount: Decimal,
    restriction_type: RestrictionType,
    restricted_project_id: uuid.UUID | None = None,
    reference_number: str | None = None,
) -> FundReceipt:
    if amount <= 0:
        raise ValueError("Fund amount must be greater than zero.")

    if (
        restriction_type == RestrictionType.RESTRICTED
        and restricted_project_id is None
    ):
        raise ValueError(
            "Restricted funds must specify their designated project."
        )

    if restriction_type == RestrictionType.UNRESTRICTED:
        restricted_project_id = None

    receipt = FundReceipt(
        organization_id=organization_id,
        recorded_by=recorded_by,
        received_date=received_date,
        source_name=source_name.strip(),
        amount=amount,
        restriction_type=restriction_type,
        restricted_project_id=restricted_project_id,
        reference_number=reference_number,
        status=FundStatus.CONFIRMED,
    )

    session.add(receipt)
    await session.flush()
    return receipt


async def list_expenses(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    start_date: date | None = None,
    end_date: date | None = None,
    status: ExpenseStatus | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[Expense]:
    if not 1 <= limit <= 500:
        raise ValueError("limit must be between 1 and 500.")

    if start_date and end_date and end_date < start_date:
        raise ValueError("End date cannot precede start date.")

    query = select(Expense).where(
        Expense.organization_id == organization_id
    )

    if start_date is not None:
        query = query.where(Expense.transaction_date >= start_date)

    if end_date is not None:
        query = query.where(Expense.transaction_date <= end_date)

    if status is not None:
        query = query.where(Expense.status == status)

    query = (
        query.order_by(
            Expense.transaction_date.desc(),
            Expense.created_at.desc(),
        )
        .limit(limit)
        .offset(offset)
    )

    result = await session.execute(query)
    return list(result.scalars().all())


async def approve_expense(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    expense_id: uuid.UUID,
    reviewer_user_id: uuid.UUID,
    reason: str | None = None,
) -> Expense:
    """Caller must authorize the reviewer and use a transaction."""

    result = await session.execute(
        select(Expense)
        .where(
            Expense.id == expense_id,
            Expense.organization_id == organization_id,
        )
        .with_for_update()
    )
    expense = result.scalar_one()

    if expense.status not in (
        ExpenseStatus.SUBMITTED,
        ExpenseStatus.UNDER_REVIEW,
    ):
        raise ValueError("Expense is not awaiting approval.")

    receipt_count = await session.scalar(
        select(func.count())
        .select_from(ExpenseDocument)
        .where(
            ExpenseDocument.organization_id == organization_id,
            ExpenseDocument.expense_id == expense_id,
            ExpenseDocument.evidence_role == "receipt",
        )
    )

    if not receipt_count:
        raise ValueError(
            "Cannot approve without a receipt. "
            "Add an authorized exception workflow if necessary."
        )

    previous_status = expense.status.value
    expense.status = ExpenseStatus.APPROVED

    session.add(
        AuditEvent(
            organization_id=organization_id,
            actor_user_id=reviewer_user_id,
            entity_type="expense",
            entity_id=expense.id,
            action="approved",
            before_data={"status": previous_status},
            after_data={"status": "approved"},
            reason=reason,
        )
    )

    await session.flush()
    return expense


async def get_timeframe_summary(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    start_date: date,
    end_date: date,
) -> dict[str, Any]:
    """Compute a simplified cash-basis summary from approved records."""

    if end_date < start_date:
        raise ValueError("Invalid reporting period.")

    funds = await session.scalar(
        select(func.coalesce(func.sum(FundReceipt.amount), 0)).where(
            FundReceipt.organization_id == organization_id,
            FundReceipt.received_date <= end_date,
            FundReceipt.status == FundStatus.CONFIRMED,
        )
    )

    historical_expenses = await session.scalar(
        select(func.coalesce(func.sum(Expense.total_amount), 0)).where(
            Expense.organization_id == organization_id,
            Expense.transaction_date <= end_date,
            Expense.status == ExpenseStatus.APPROVED,
        )
    )

    period_expenses = await session.scalar(
        select(func.coalesce(func.sum(Expense.total_amount), 0)).where(
            Expense.organization_id == organization_id,
            Expense.transaction_date.between(start_date, end_date),
            Expense.status == ExpenseStatus.APPROVED,
        )
    )

    category_query = (
        select(
            Expense.category,
            func.count(Expense.id),
            func.sum(Expense.total_amount),
        )
        .where(
            Expense.organization_id == organization_id,
            Expense.transaction_date.between(start_date, end_date),
            Expense.status == ExpenseStatus.APPROVED,
        )
        .group_by(Expense.category)
        .order_by(func.sum(Expense.total_amount).desc())
    )

    category_rows = (await session.execute(category_query)).all()

    ledger_query = (
        select(Expense)
        .where(
            Expense.organization_id == organization_id,
            Expense.transaction_date.between(start_date, end_date),
            Expense.status == ExpenseStatus.APPROVED,
        )
        .order_by(Expense.transaction_date, Expense.created_at)
    )

    ledger_rows = (await session.execute(ledger_query)).scalars().all()

    funds = Decimal(funds)
    historical_expenses = Decimal(historical_expenses)
    period_expenses = Decimal(period_expenses)

    categories = []

    for category, count, amount in category_rows:
        amount = Decimal(amount)
        percentage = (
            (amount / period_expenses * Decimal("100")).quantize(
                Decimal("0.01")
            )
            if period_expenses
            else Decimal("0.00")
        )

        categories.append({
            "category": category.value,
            "expense_count": count,
            "total_amount": amount,
            "percentage": percentage,
        })

    ledger = [
        {
            "expense_id": str(expense.id),
            "transaction_date": expense.transaction_date.isoformat(),
            "vendor": expense.vendor_name,
            "description": expense.description,
            "category": expense.category.value,
            "submitter": expense.submitter_name,
            "amount": expense.total_amount,
        }
        for expense in ledger_rows
    ]

    return {
        "organization_id": str(organization_id),
        "period_start": start_date.isoformat(),
        "period_end": end_date.isoformat(),
        "currency": "PHP",
        "total_funds_received": funds,
        "period_expenses": period_expenses,
        "historical_expenses": historical_expenses,
        "ending_balance_estimate": funds - historical_expenses,
        "categories": categories,
        "ledger": ledger,
    }


async def save_report_snapshot(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    generated_by: uuid.UUID,
    start_date: date,
    end_date: date,
    report_snapshot: dict[str, Any],
    storage_key: str | None = None,
) -> GeneratedReport:
    report = GeneratedReport(
        organization_id=organization_id,
        generated_by=generated_by,
        period_start=start_date,
        period_end=end_date,
        report_snapshot=report_snapshot,
        storage_key=storage_key,
    )
    session.add(report)
    await session.flush()
    return report
