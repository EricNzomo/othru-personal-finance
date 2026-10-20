from datetime import date, datetime
from calendar import monthrange
from typing import Optional
from app.auth_routes import router as auth_router
from app.auth_dependency import get_current_user

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import text

from .database import SessionLocal

app = FastAPI(title="Personal Finance API")
app = FastAPI()
app.include_router(auth_router)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://othru-personal-finance.vercel.app",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost",
        "https://localhost",
        "capacitor://localhost",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# PYDANTIC MODELS
# ============================================================

class Expense(BaseModel):
    transaction_date: date
    amount: float = Field(gt=0)
    transaction_type: str = "expense"
    category_id: int
    description: Optional[str] = None
    source: str = "manual"
    notes: Optional[str] = None
    transaction_code: Optional[str] = Field(
        default=None,
        max_length=20,
    )


class Income(BaseModel):
    income_date: date
    amount: float = Field(gt=0)
    source: str
    description: Optional[str] = None
    notes: Optional[str] = None
    transaction_code: Optional[str] = Field(
        default=None,
        max_length=20,
    )


class BudgetCreate(BaseModel):
    budget_month: date
    category_id: int
    budget_amount: float = Field(ge=0)


class BudgetUpdate(BaseModel):
    budget_amount: float = Field(ge=0)

class SavingsGoalCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    target_amount: float = Field(gt=0)
    target_date: Optional[date] = None
    description: Optional[str] = None


class SavingsGoalUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    target_amount: float = Field(gt=0)
    target_date: Optional[date] = None
    description: Optional[str] = None


class SavingsContributionCreate(BaseModel):
    amount: float = Field(gt=0)
    contribution_date: date = Field(default_factory=date.today)
    notes: Optional[str] = None

# ============================================================
# HELPER FUNCTIONS
# ============================================================

def get_month_dates(month: str):
    try:
        year, month_number = map(int, month.split("-"))

        if month_number < 1 or month_number > 12:
            raise ValueError

        first_day = date(year, month_number, 1)
        last_day = date(
            year,
            month_number,
            monthrange(year, month_number)[1],
        )

        return first_day, last_day

    except (ValueError, TypeError):
        raise HTTPException(
            status_code=400,
            detail="Month must use YYYY-MM format.",
        )


def calculate_percentage(part, whole):
    if not whole:
        return 0

    return round((float(part) / float(whole)) * 100, 2)


# ============================================================
# BASIC ROUTES
# ============================================================

@app.get("/")
def root():
    return {
        "message": "Personal Finance API is running."
    }


@app.get("/db-test")
def db_test():
    db = SessionLocal()

    try:
        result = db.execute(text("SELECT current_database()"))
        database_name = result.scalar()

        return {
            "status": "connected",
            "database": database_name,
        }

    finally:
        db.close()


# ============================================================
# CATEGORIES
# ============================================================

@app.get("/categories")
def get_categories():
    db = SessionLocal()

    try:
        result = db.execute(
            text(
                """
                SELECT
                    id,
                    name,
                    type,
                    created_at
                FROM categories
                ORDER BY id
                """
            )
        )

        return [dict(row._mapping) for row in result]

    finally:
        db.close()


# ============================================================
# EXPENSES
# ============================================================

@app.get("/transactions")
def get_transactions(
    current_user=Depends(get_current_user),
):
    db = SessionLocal()

    try:
        result = db.execute(
            text(
                """
                SELECT
                    id,
                    transaction_date,
                    amount,
                    transaction_type,
                    category_id,
                    description,
                    source,
                    notes,
                    created_at
                FROM transactions
                WHERE transaction_type = 'expense'
                  AND user_id = :user_id
                ORDER BY transaction_date DESC, id DESC
                """
            ),
            {
                "user_id": current_user["id"],
            },
        )

        return [dict(row._mapping) for row in result]

    finally:
        db.close()

@app.post("/expenses")
def create_expense(
    expense: Expense,
    current_user=Depends(get_current_user),
):
    db = SessionLocal()

    try:
        user_id = current_user["id"]

        # Check whether this M-PESA transaction code
        # already exists in either income or expenses.
        if expense.transaction_code:
            duplicate = db.execute(
                text(
                    """
                    SELECT transaction_code
                    FROM transactions
                    WHERE user_id = :user_id
                      AND transaction_code = :transaction_code

                    UNION ALL

                    SELECT transaction_code
                    FROM income
                    WHERE user_id = :user_id
                      AND transaction_code = :transaction_code

                    LIMIT 1
                    """
                ),
                {
                    "user_id": user_id,
                    "transaction_code": expense.transaction_code,
                },
            ).first()

            if duplicate:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "This M-PESA transaction has already been "
                        "recorded. Duplicate transaction codes are "
                        "not allowed."
                    ),
                )

        # Validate the expense category.
        category_check = db.execute(
            text(
                """
                SELECT id
                FROM categories
                WHERE id = :category_id
                  AND type = 'expense'
                """
            ),
            {
                "category_id": expense.category_id,
            },
        ).first()

        if not category_check:
            raise HTTPException(
                status_code=400,
                detail="Invalid expense category.",
            )

        # Save the expense, including its transaction code.
        result = db.execute(
            text(
                """
                INSERT INTO transactions (
                    user_id,
                    transaction_date,
                    amount,
                    transaction_type,
                    category_id,
                    description,
                    source,
                    notes,
                    transaction_code
                )
                VALUES (
                    :user_id,
                    :transaction_date,
                    :amount,
                    :transaction_type,
                    :category_id,
                    :description,
                    :source,
                    :notes,
                    :transaction_code
                )
                RETURNING
                    id,
                    user_id,
                    transaction_date,
                    amount,
                    transaction_type,
                    category_id,
                    description,
                    source,
                    notes,
                    transaction_code,
                    created_at
                """
            ),
            {
                "user_id": user_id,
                "transaction_date": expense.transaction_date,
                "amount": expense.amount,
                "transaction_type": expense.transaction_type,
                "category_id": expense.category_id,
                "description": expense.description,
                "source": expense.source,
                "notes": expense.notes,
                "transaction_code": expense.transaction_code,
            },
        )

        db.commit()

        return dict(result.first()._mapping)

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


@app.put("/expenses/{expense_id}")
def update_expense(
    expense_id: int,
    expense: Expense,
    current_user=Depends(get_current_user),
):
    db = SessionLocal()

    try:
        category_check = db.execute(
            text(
                """
                SELECT id
                FROM categories
                WHERE id = :category_id
                  AND type = 'expense'
                """
            ),
            {
                "category_id": expense.category_id
            },
        ).first()

        if not category_check:
            raise HTTPException(
                status_code=400,
                detail="Invalid expense category.",
            )

        result = db.execute(
            text(
                """
                UPDATE transactions
                SET
                    transaction_date = :transaction_date,
                    amount = :amount,
                    transaction_type = :transaction_type,
                    category_id = :category_id,
                    description = :description,
                    source = :source,
                    notes = :notes
                WHERE id = :expense_id
                  AND transaction_type = 'expense'
                  AND user_id = :user_id
                RETURNING
                    id,
                    user_id,
                    transaction_date,
                    amount,
                    transaction_type,
                    category_id,
                    description,
                    source,
                    notes,
                    created_at
                """
            ),
            {
                "expense_id": expense_id,
                "user_id": current_user["id"],
                "transaction_date": expense.transaction_date,
                "amount": expense.amount,
                "transaction_type": expense.transaction_type,
                "category_id": expense.category_id,
                "description": expense.description,
                "source": expense.source,
                "notes": expense.notes,
            },
        )

        updated = result.first()

        if not updated:
            raise HTTPException(
                status_code=404,
                detail="Expense not found.",
            )

        db.commit()

        return dict(updated._mapping)

    finally:
        db.close()


@app.delete("/expenses/{expense_id}")
def delete_expense(
    expense_id: int,
    current_user=Depends(get_current_user),
):
    db = SessionLocal()

    try:
        result = db.execute(
            text(
                """
                DELETE FROM transactions
                WHERE id = :expense_id
                  AND transaction_type = 'expense'
                  AND user_id = :user_id
                RETURNING id
                """
            ),
            {
                "expense_id": expense_id,
                "user_id": current_user["id"],
            },
        )

        deleted = result.first()

        if not deleted:
            raise HTTPException(
                status_code=404,
                detail="Expense not found.",
            )

        db.commit()

        return {
            "message": "Expense deleted successfully.",
            "id": deleted.id,
        }

    finally:
        db.close()


# ============================================================
# INCOME
# ============================================================

@app.get("/income")
def get_income(
    current_user=Depends(get_current_user),
):
    db = SessionLocal()

    try:
        result = db.execute(
            text(
                """
                SELECT
                    id,
                    user_id,
                    income_date,
                    amount,
                    source,
                    description,
                    notes,
                    created_at
                FROM income
                WHERE user_id = :user_id
                ORDER BY income_date DESC, id DESC
                """
            ),
            {
                "user_id": current_user["id"],
            },
        )

        return [dict(row._mapping) for row in result]

    finally:
        db.close()

@app.post("/income")
def create_income(
    income: Income,
    current_user=Depends(get_current_user),
):
    db = SessionLocal()

    try:
        user_id = current_user["id"]

        # Check whether this M-PESA transaction code
        # already exists in either income or expenses.
        if income.transaction_code:
            duplicate = db.execute(
                text(
                    """
                    SELECT transaction_code
                    FROM transactions
                    WHERE user_id = :user_id
                      AND transaction_code = :transaction_code

                    UNION ALL

                    SELECT transaction_code
                    FROM income
                    WHERE user_id = :user_id
                      AND transaction_code = :transaction_code

                    LIMIT 1
                    """
                ),
                {
                    "user_id": user_id,
                    "transaction_code": income.transaction_code,
                },
            ).first()

            if duplicate:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "This M-PESA transaction has already been "
                        "recorded. Duplicate transaction codes are "
                        "not allowed."
                    ),
                )

        # Save the income, including its transaction code.
        result = db.execute(
            text(
                """
                INSERT INTO income (
                    user_id,
                    income_date,
                    amount,
                    source,
                    description,
                    notes,
                    transaction_code
                )
                VALUES (
                    :user_id,
                    :income_date,
                    :amount,
                    :source,
                    :description,
                    :notes,
                    :transaction_code
                )
                RETURNING
                    id,
                    user_id,
                    income_date,
                    amount,
                    source,
                    description,
                    notes,
                    transaction_code,
                    created_at
                """
            ),
            {
                "user_id": user_id,
                "income_date": income.income_date,
                "amount": income.amount,
                "source": income.source,
                "description": income.description,
                "notes": income.notes,
                "transaction_code": income.transaction_code,
            },
        )

        db.commit()

        return dict(result.first()._mapping)

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


@app.put("/income/{income_id}")
def update_income(
    income_id: int,
    income: Income,
    current_user=Depends(get_current_user),
):
    db = SessionLocal()

    try:
        result = db.execute(
            text(
                """
                UPDATE income
                SET
                    income_date = :income_date,
                    amount = :amount,
                    source = :source,
                    description = :description,
                    notes = :notes
                WHERE id = :income_id
                  AND user_id = :user_id
                RETURNING
                    id,
                    user_id,
                    income_date,
                    amount,
                    source,
                    description,
                    notes,
                    created_at
                """
            ),
            {
                "income_id": income_id,
                "user_id": current_user["id"],
                "income_date": income.income_date,
                "amount": income.amount,
                "source": income.source,
                "description": income.description,
                "notes": income.notes,
            },
        )

        updated = result.first()

        if not updated:
            raise HTTPException(
                status_code=404,
                detail="Income record not found.",
            )

        db.commit()

        return dict(updated._mapping)

    finally:
        db.close()

@app.delete("/income/{income_id}")
def delete_income(
    income_id: int,
    current_user=Depends(get_current_user),
):
    db = SessionLocal()

    try:
        result = db.execute(
            text(
                """
                DELETE FROM income
                WHERE id = :income_id
                  AND user_id = :user_id
                RETURNING id
                """
            ),
            {
                "income_id": income_id,
                "user_id": current_user["id"],
            },
        )

        deleted = result.first()

        if not deleted:
            raise HTTPException(
                status_code=404,
                detail="Income record not found.",
            )

        db.commit()

        return {
            "message": "Income deleted successfully.",
            "id": deleted.id,
        }

    finally:
        db.close()


# ============================================================
# BUDGETS
# ============================================================

@app.get("/budgets")
def get_budgets(
    month: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    db = SessionLocal()

    try:
        if month:
            first_day, last_day = get_month_dates(month)

            result = db.execute(
                text(
                    """
                    SELECT
                        b.id,
                        b.budget_month,
                        b.category_id,
                        c.name AS category,
                        c.type AS category_type,
                        b.budget_amount,
                        b.created_at
                    FROM budgets b
                    JOIN categories c
                        ON c.id = b.category_id
                    WHERE b.budget_month = :budget_month
                      AND b.user_id = :user_id
                    ORDER BY c.id
                    """
                ),
                {
                    "budget_month": first_day,
                    "user_id": current_user["id"],
                },
            )
        else:
            result = db.execute(
                text(
                    """
                    SELECT
                        b.id,
                        b.budget_month,
                        b.category_id,
                        c.name AS category,
                        c.type AS category_type,
                        b.budget_amount,
                        b.created_at
                    FROM budgets b
                    JOIN categories c
                        ON c.id = b.category_id
                    WHERE b.user_id = :user_id
                    ORDER BY
                        b.budget_month DESC,
                        c.id
                    """
                ),
                {
                    "user_id": current_user["id"],
                },
            )

        return [dict(row._mapping) for row in result]

    finally:
        db.close()


@app.post("/budgets")
def create_or_update_budget(
    budget: BudgetCreate,
    current_user=Depends(get_current_user),
):
    db = SessionLocal()

    try:
        if budget.budget_month.day != 1:
            raise HTTPException(
                status_code=400,
                detail="budget_month must be the first day of the month.",
            )

        category_check = db.execute(
            text(
                """
                SELECT id
                FROM categories
                WHERE id = :category_id
                  AND type = 'expense'
                """
            ),
            {
                "category_id": budget.category_id
            },
        ).first()

        if not category_check:
            raise HTTPException(
                status_code=400,
                detail="Budget category must be an expense category.",
            )

        existing = db.execute(
            text(
                """
                SELECT id
                FROM budgets
                WHERE budget_month = :budget_month
                  AND category_id = :category_id
                  AND user_id = :user_id
                """
            ),
            {
                "budget_month": budget.budget_month,
                "category_id": budget.category_id,
                "user_id": current_user["id"],
            },
        ).first()

        if existing:
            result = db.execute(
                text(
                    """
                    UPDATE budgets
                    SET budget_amount = :budget_amount
                    WHERE id = :budget_id
                      AND user_id = :user_id
                    RETURNING
                        id,
                        budget_month,
                        category_id,
                        budget_amount,
                        created_at
                    """
                ),
                {
                    "budget_id": existing.id,
                    "user_id": current_user["id"],
                    "budget_amount": budget.budget_amount,
                },
            )
        else:
            result = db.execute(
                text(
                    """
                    INSERT INTO budgets (
                        budget_month,
                        category_id,
                        budget_amount,
                        user_id
                    )
                    VALUES (
                        :budget_month,
                        :category_id,
                        :budget_amount,
                        :user_id
                    )
                    RETURNING
                        id,
                        budget_month,
                        category_id,
                        budget_amount,
                        created_at
                    """
                ),
                {
                    "budget_month": budget.budget_month,
                    "category_id": budget.category_id,
                    "budget_amount": budget.budget_amount,
                    "user_id": current_user["id"],
                },
            )

        db.commit()

        return dict(result.first()._mapping)

    finally:
        db.close()


@app.put("/budgets/{budget_id}")
def update_budget(
    budget_id: int,
    budget: BudgetUpdate,
    current_user=Depends(get_current_user),
):
    db = SessionLocal()

    try:
        result = db.execute(
            text(
                """
                UPDATE budgets
                SET budget_amount = :budget_amount
                WHERE id = :budget_id
                  AND user_id = :user_id
                RETURNING
                    id,
                    budget_month,
                    category_id,
                    budget_amount,
                    created_at
                """
            ),
            {
                "budget_id": budget_id,
                "user_id": current_user["id"],
                "budget_amount": budget.budget_amount,
            },
        )

        updated = result.first()

        if not updated:
            raise HTTPException(
                status_code=404,
                detail="Budget not found.",
            )

        db.commit()

        return dict(updated._mapping)

    finally:
        db.close()


@app.delete("/budgets/{budget_id}")
def delete_budget(
    budget_id: int,
    current_user=Depends(get_current_user),
):
    db = SessionLocal()

    try:
        result = db.execute(
            text(
                """
                DELETE FROM budgets
                WHERE id = :budget_id
                  AND user_id = :user_id
                RETURNING id
                """
            ),
            {
                "budget_id": budget_id,
                "user_id": current_user["id"],
            },
        )

        deleted = result.first()

        if not deleted:
            raise HTTPException(
                status_code=404,
                detail="Budget not found.",
            )

        db.commit()

        return {
            "message": "Budget deleted successfully.",
            "id": deleted.id,
        }

    finally:
        db.close()


# ============================================================
# DASHBOARD
# ============================================================

@app.get("/dashboard")
def get_dashboard(
    month: str,
    current_user=Depends(get_current_user),
):
    first_day, last_day = get_month_dates(month)

    db = SessionLocal()

    try:
        income_result = db.execute(
            text(
                """
                SELECT COALESCE(SUM(amount), 0)
                FROM income
                WHERE income_date BETWEEN :first_day AND :last_day
                  AND user_id = :user_id
                """
            ),
            {
                "first_day": first_day,
                "last_day": last_day,
                "user_id": current_user["id"],
            },
        )

        expense_result = db.execute(
            text(
                """
                SELECT COALESCE(SUM(amount), 0)
                FROM transactions
                WHERE transaction_type = 'expense'
                  AND transaction_date BETWEEN :first_day AND :last_day
                  AND user_id = :user_id
                """
            ),
            {
                "first_day": first_day,
                "last_day": last_day,
                "user_id": current_user["id"],
            },
        )

        budget_result = db.execute(
            text(
                """
                SELECT COALESCE(SUM(budget_amount), 0)
                FROM budgets
                WHERE budget_month = :budget_month
                  AND user_id = :user_id
                """
            ),
            {
                "budget_month": first_day,
                "user_id": current_user["id"],
            },
        )

        total_income = float(income_result.scalar() or 0)
        total_expenses = float(expense_result.scalar() or 0)
        total_budget = float(budget_result.scalar() or 0)

        return {
            "month": month,
            "income": total_income,
            "expenses": total_expenses,
            "cash_remaining": total_income - total_expenses,
            "budget": total_budget,
            "budget_remaining": total_budget - total_expenses,
        }

    finally:
        db.close()

# ============================================================
# ANALYTICS
# ============================================================

@app.get("/analytics")
def get_analytics(
    month: str,
    current_user=Depends(get_current_user),
):
    first_day, last_day = get_month_dates(month)

    db = SessionLocal()

    try:
        user_id = current_user["id"]

        # ----------------------------------------------------
        # INCOME
        # ----------------------------------------------------

        income_result = db.execute(
            text(
                """
                SELECT COALESCE(SUM(amount), 0)
                FROM income
                WHERE income_date BETWEEN :first_day AND :last_day
                  AND user_id = :user_id
                """
            ),
            {
                "first_day": first_day,
                "last_day": last_day,
                "user_id": user_id,
            },
        )

        total_income = float(income_result.scalar() or 0)

        # ----------------------------------------------------
        # EXPENSES
        # ----------------------------------------------------

        expense_result = db.execute(
            text(
                """
                SELECT COALESCE(SUM(amount), 0)
                FROM transactions
                WHERE transaction_type = 'expense'
                  AND transaction_date BETWEEN :first_day AND :last_day
                  AND user_id = :user_id
                """
            ),
            {
                "first_day": first_day,
                "last_day": last_day,
                "user_id": user_id,
            },
        )

        total_expenses = float(expense_result.scalar() or 0)

        # ----------------------------------------------------
        # BUDGET
        # ----------------------------------------------------

        budget_result = db.execute(
            text(
                """
                SELECT COALESCE(SUM(budget_amount), 0)
                FROM budgets
                WHERE budget_month = :budget_month
                  AND user_id = :user_id
                """
            ),
            {
                "budget_month": first_day,
                "user_id": user_id,
            },
        )

        total_budget = float(budget_result.scalar() or 0)

        # ----------------------------------------------------
        # TIME
        # ----------------------------------------------------

        today = date.today()

        if today < first_day:
            days_elapsed = 0
        elif today > last_day:
            days_elapsed = (last_day - first_day).days + 1
        else:
            days_elapsed = (today - first_day).days + 1

        days_in_month = (last_day - first_day).days + 1

        # ----------------------------------------------------
        # SUMMARY
        # ----------------------------------------------------

        cash_remaining = total_income - total_expenses

        if total_income > 0:
            savings_rate = (
                (total_income - total_expenses) / total_income
            ) * 100
        else:
            savings_rate = 0

        average_daily_spending = (
            total_expenses / days_elapsed
            if days_elapsed > 0
            else 0
        )

        # ----------------------------------------------------
        # PROJECTION
        # ----------------------------------------------------

        projected_month_end_spending = (
            average_daily_spending * days_in_month
            if days_elapsed > 0
            else 0
        )

        projected_month_end_cash = (
            total_income - projected_month_end_spending
        )

        # ----------------------------------------------------
        # SPENDING PACE
        # ----------------------------------------------------

        actual_budget_used = calculate_percentage(
            total_expenses,
            total_budget,
        )

        expected_budget_used = (
            (days_elapsed / days_in_month) * 100
            if days_in_month > 0
            else 0
        )

        spending_pace_difference = (
            actual_budget_used - expected_budget_used
        )

        if total_budget <= 0:
            spending_pace_status = "No Budget"
        elif actual_budget_used >= 100:
            spending_pace_status = "Over Budget"
        elif spending_pace_difference > 10:
            spending_pace_status = "Spending Too Fast"
        elif spending_pace_difference > 0:
            spending_pace_status = "Slightly Ahead"
        elif spending_pace_difference < -10:
            spending_pace_status = "Spending Slowly"
        else:
            spending_pace_status = "On Track"

        # ----------------------------------------------------
        # FINANCIAL HEALTH
        # ----------------------------------------------------

        if total_income <= 0 and total_expenses > 0:
            financial_health = "Needs Attention"
        elif total_budget <= 0 and total_income > 0:
            financial_health = "No Budget Set"
        elif total_budget > 0 and total_expenses > total_budget:
            financial_health = "Over Budget"
        elif savings_rate < 0:
            financial_health = "Needs Attention"
        elif spending_pace_status == "Spending Too Fast":
            financial_health = "Watch Spending"
        elif savings_rate >= 20:
            financial_health = "Healthy"
        elif savings_rate >= 10:
            financial_health = "Fair"
        else:
            financial_health = "Watch Spending"

        # ----------------------------------------------------
        # LARGEST EXPENSE
        # ----------------------------------------------------

        largest_expense_result = db.execute(
            text(
                """
                SELECT
                    t.id,
                    t.transaction_date,
                    t.amount,
                    t.description,
                    c.name AS category
                FROM transactions t
                LEFT JOIN categories c
                    ON c.id = t.category_id
                WHERE t.transaction_type = 'expense'
                  AND t.transaction_date BETWEEN :first_day AND :last_day
                  AND t.user_id = :user_id
                ORDER BY t.amount DESC
                LIMIT 1
                """
            ),
            {
                "first_day": first_day,
                "last_day": last_day,
                "user_id": user_id,
            },
        )

        largest_expense_row = largest_expense_result.first()

        largest_expense = (
            dict(largest_expense_row._mapping)
            if largest_expense_row
            else None
        )

        # ----------------------------------------------------
        # CATEGORY SPENDING
        # ----------------------------------------------------

        category_spending_result = db.execute(
            text(
                """
                SELECT
                    c.id AS category_id,
                    c.name AS category,
                    COALESCE(SUM(t.amount), 0) AS amount
                FROM categories c
                LEFT JOIN transactions t
                    ON t.category_id = c.id
                    AND t.transaction_type = 'expense'
                    AND t.transaction_date BETWEEN :first_day AND :last_day
                    AND t.user_id = :user_id
                WHERE c.type = 'expense'
                GROUP BY c.id, c.name
                ORDER BY amount DESC
                """
            ),
            {
                "first_day": first_day,
                "last_day": last_day,
                "user_id": user_id,
            },
        )

        category_spending = [
            dict(row._mapping)
            for row in category_spending_result
        ]

        category_spending = [
            {
                **item,
                "amount": float(item["amount"] or 0),
            }
            for item in category_spending
        ]

        # ----------------------------------------------------
        # BUDGET VS ACTUAL
        # ----------------------------------------------------

        budget_vs_actual_result = db.execute(
            text(
                """
                SELECT
                    c.id AS category_id,
                    c.name AS category,
                    COALESCE(b.budget_amount, 0) AS budget,
                    COALESCE(
                        SUM(
                            CASE
                                WHEN t.transaction_type = 'expense'
                                THEN t.amount
                                ELSE 0
                            END
                        ),
                        0
                    ) AS spent
                FROM categories c
                LEFT JOIN budgets b
                    ON b.category_id = c.id
                    AND b.budget_month = :budget_month
                    AND b.user_id = :user_id
                LEFT JOIN transactions t
                    ON t.category_id = c.id
                    AND t.transaction_type = 'expense'
                    AND t.transaction_date BETWEEN :first_day AND :last_day
                    AND t.user_id = :user_id
                WHERE c.type = 'expense'
                GROUP BY
                    c.id,
                    c.name,
                    b.budget_amount
                ORDER BY c.id
                """
            ),
            {
                "budget_month": first_day,
                "first_day": first_day,
                "last_day": last_day,
                "user_id": user_id,
            },
        )

        budget_vs_actual = []

        for row in budget_vs_actual_result:
            item = dict(row._mapping)

            budget_amount = float(item["budget"] or 0)
            spent_amount = float(item["spent"] or 0)

            budget_vs_actual.append(
                {
                    "category_id": item["category_id"],
                    "category": item["category"],
                    "budget": budget_amount,
                    "spent": spent_amount,
                    "remaining": budget_amount - spent_amount,
                    "percentage_used": calculate_percentage(
                        spent_amount,
                        budget_amount,
                    ),
                }
            )

        # ----------------------------------------------------
        # CATEGORY WARNINGS
        # ----------------------------------------------------

        category_warnings = []

        for item in budget_vs_actual:
            category_budget = item["budget"]
            category_spent = item["spent"]
            category_percentage = item["percentage_used"]

            if category_budget <= 0 and category_spent > 0:
                status = "No Budget"
            elif category_percentage >= 100:
                status = "Over Budget"
            elif category_percentage >= 80:
                status = "Near Limit"
            elif category_percentage > (
                expected_budget_used + 10
            ):
                status = "Spending Fast"
            else:
                status = "On Track"

            category_warnings.append(
                {
                    "category": item["category"],
                    "budget": category_budget,
                    "spent": category_spent,
                    "percentage_used": category_percentage,
                    "status": status,
                }
            )

        # ----------------------------------------------------
        # DAILY SPENDING
        # ----------------------------------------------------

        daily_spending_result = db.execute(
            text(
                """
                SELECT
                    transaction_date AS date,
                    COALESCE(SUM(amount), 0) AS amount
                FROM transactions
                WHERE transaction_type = 'expense'
                  AND transaction_date BETWEEN :first_day AND :last_day
                  AND user_id = :user_id
                GROUP BY transaction_date
                ORDER BY transaction_date
                """
            ),
            {
                "first_day": first_day,
                "last_day": last_day,
                "user_id": user_id,
            },
        )

        daily_spending_rows = {
            row.date: float(row.amount or 0)
            for row in daily_spending_result
        }

        daily_spending = []

        current_day = first_day

        while current_day <= last_day:
            daily_spending.append(
                {
                    "date": current_day.isoformat(),
                    "amount": daily_spending_rows.get(
                        current_day,
                        0,
                    ),
                }
            )

            current_day = date.fromordinal(
                current_day.toordinal() + 1
            )

        # ----------------------------------------------------
        # FINAL RESPONSE
        # ----------------------------------------------------

        return {
            "month": month,

            "summary": {
                "income": total_income,
                "expenses": total_expenses,
                "cash_remaining": cash_remaining,
                "savings_rate": round(savings_rate, 2),
                "days_elapsed": days_elapsed,
                "days_in_month": days_in_month,
                "average_daily_spending": round(
                    average_daily_spending,
                    2,
                ),
            },

            "budget": {
                "total": total_budget,
                "remaining": total_budget - total_expenses,
                "percentage_used": actual_budget_used,
            },

            "projection": {
                "projected_month_end_spending": round(
                    projected_month_end_spending,
                    2,
                ),
                "projected_month_end_cash": round(
                    projected_month_end_cash,
                    2,
                ),
            },

            "spending_pace": {
                "expected_budget_used": round(
                    expected_budget_used,
                    2,
                ),
                "actual_budget_used": round(
                    actual_budget_used,
                    2,
                ),
                "difference": round(
                    spending_pace_difference,
                    2,
                ),
                "status": spending_pace_status,
            },

            "financial_health": financial_health,

            "largest_expense": largest_expense,

            "category_spending": category_spending,

            "category_warnings": category_warnings,

            "daily_spending": daily_spending,

            "budget_vs_actual": budget_vs_actual,
        }

    finally:
        db.close()

# ============================================================
# SAVINGS GOALS
# ============================================================

@app.get("/savings-goals")
def get_savings_goals(
    current_user=Depends(get_current_user),
):
    db = SessionLocal()

    try:
        result = db.execute(
            text(
                """
                SELECT
                    g.id,
                    g.user_id,
                    g.name,
                    g.target_amount,
                    g.target_date,
                    g.description,
                    g.created_at,
                    COALESCE(
                        SUM(sc.amount),
                        0
                    ) AS saved_amount
                FROM savings_goals g
                LEFT JOIN savings_contributions sc
                    ON sc.goal_id = g.id
                    AND sc.user_id = g.user_id
                WHERE g.user_id = :user_id
                GROUP BY
                    g.id,
                    g.user_id,
                    g.name,
                    g.target_amount,
                    g.target_date,
                    g.description,
                    g.created_at
                ORDER BY
                    g.created_at DESC,
                    g.id DESC
                """
            ),
            {
                "user_id": current_user["id"],
            },
        )

        goals = []

        for row in result:
            item = dict(row._mapping)

            target_amount = float(item["target_amount"])
            saved_amount = float(item["saved_amount"] or 0)

            item["target_amount"] = target_amount
            item["saved_amount"] = saved_amount
            item["remaining_amount"] = round(
                max(target_amount - saved_amount, 0),
                2,
            )
            item["progress_percentage"] = round(
                (saved_amount / target_amount) * 100,
                2,
            )

            goals.append(item)

        return goals

    finally:
        db.close()


@app.post("/savings-goals")
def create_savings_goal(
    goal: SavingsGoalCreate,
    current_user=Depends(get_current_user),
):
    db = SessionLocal()

    try:
        goal_name = goal.name.strip()

        if not goal_name:
            raise HTTPException(
                status_code=400,
                detail="Goal name cannot be empty.",
            )

        result = db.execute(
            text(
                """
                INSERT INTO savings_goals (
                    user_id,
                    name,
                    target_amount,
                    target_date,
                    description
                )
                VALUES (
                    :user_id,
                    :name,
                    :target_amount,
                    :target_date,
                    :description
                )
                RETURNING
                    id,
                    user_id,
                    name,
                    target_amount,
                    target_date,
                    description,
                    created_at
                """
            ),
            {
                "user_id": current_user["id"],
                "name": goal_name,
                "target_amount": goal.target_amount,
                "target_date": goal.target_date,
                "description": goal.description,
            },
        )

        created = result.first()

        db.commit()

        item = dict(created._mapping)

        item["target_amount"] = float(item["target_amount"])
        item["saved_amount"] = 0.0
        item["remaining_amount"] = item["target_amount"]
        item["progress_percentage"] = 0.0

        return item

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()

    # ============================================================
# SAVINGS GOAL CONTRIBUTIONS
# ============================================================

@app.get("/savings-goals/{goal_id}/contributions")
def get_savings_contributions(
    goal_id: int,
    current_user=Depends(get_current_user),
):
    db = SessionLocal()

    try:
        goal = db.execute(
            text(
                """
                SELECT id
                FROM savings_goals
                WHERE id = :goal_id
                  AND user_id = :user_id
                """
            ),
            {
                "goal_id": goal_id,
                "user_id": current_user["id"],
            },
        ).first()

        if not goal:
            raise HTTPException(
                status_code=404,
                detail="Savings goal not found.",
            )

        result = db.execute(
            text(
                """
                SELECT
                    id,
                    goal_id,
                    user_id,
                    amount,
                    contribution_date,
                    notes,
                    created_at
                FROM savings_contributions
                WHERE goal_id = :goal_id
                  AND user_id = :user_id
                ORDER BY contribution_date DESC, id DESC
                """
            ),
            {
                "goal_id": goal_id,
                "user_id": current_user["id"],
            },
        )

        contributions = []

        for row in result:
            item = dict(row._mapping)
            item["amount"] = float(item["amount"])
            contributions.append(item)

        return contributions

    finally:
        db.close()


@app.post("/savings-goals/{goal_id}/contributions")
def create_savings_contribution(
    goal_id: int,
    contribution: SavingsContributionCreate,
    current_user=Depends(get_current_user),
):
    db = SessionLocal()

    try:
        user_id = current_user["id"]

        goal = db.execute(
            text(
                """
                SELECT id, target_amount
                FROM savings_goals
                WHERE id = :goal_id
                  AND user_id = :user_id
                """
            ),
            {
                "goal_id": goal_id,
                "user_id": user_id,
            },
        ).first()

        if not goal:
            raise HTTPException(
                status_code=404,
                detail="Savings goal not found.",
            )

        result = db.execute(
            text(
                """
                INSERT INTO savings_contributions (
                    goal_id,
                    user_id,
                    amount,
                    contribution_date,
                    notes
                )
                VALUES (
                    :goal_id,
                    :user_id,
                    :amount,
                    :contribution_date,
                    :notes
                )
                RETURNING
                    id,
                    goal_id,
                    user_id,
                    amount,
                    contribution_date,
                    notes,
                    created_at
                """
            ),
            {
                "goal_id": goal_id,
                "user_id": user_id,
                "amount": contribution.amount,
                "contribution_date": contribution.contribution_date,
                "notes": contribution.notes,
            },
        )

        created = result.first()

        db.commit()

        contribution_data = dict(created._mapping)
        contribution_data["amount"] = float(
            contribution_data["amount"]
        )

        total_result = db.execute(
            text(
                """
                SELECT COALESCE(SUM(amount), 0)
                FROM savings_contributions
                WHERE goal_id = :goal_id
                  AND user_id = :user_id
                """
            ),
            {
                "goal_id": goal_id,
                "user_id": user_id,
            },
        )

        saved_amount = float(total_result.scalar() or 0)
        target_amount = float(goal.target_amount)

        contribution_data["saved_amount"] = saved_amount
        contribution_data["remaining_amount"] = round(
            max(target_amount - saved_amount, 0),
            2,
        )
        contribution_data["progress_percentage"] = round(
            (saved_amount / target_amount) * 100,
            2,
        )

        return contribution_data

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()
    # ============================================================
# UPDATE AND DELETE SAVINGS GOALS
# ============================================================

@app.put("/savings-goals/{goal_id}")
def update_savings_goal(
    goal_id: int,
    goal: SavingsGoalUpdate,
    current_user=Depends(get_current_user),
):
    db = SessionLocal()

    try:
        goal_name = goal.name.strip()

        if not goal_name:
            raise HTTPException(
                status_code=400,
                detail="Goal name cannot be empty.",
            )

        result = db.execute(
            text(
                """
                UPDATE savings_goals
                SET
                    name = :name,
                    target_amount = :target_amount,
                    target_date = :target_date,
                    description = :description
                WHERE id = :goal_id
                  AND user_id = :user_id
                RETURNING
                    id,
                    user_id,
                    name,
                    target_amount,
                    target_date,
                    description,
                    created_at
                """
            ),
            {
                "goal_id": goal_id,
                "user_id": current_user["id"],
                "name": goal_name,
                "target_amount": goal.target_amount,
                "target_date": goal.target_date,
                "description": goal.description,
            },
        )

        updated = result.first()

        if not updated:
            raise HTTPException(
                status_code=404,
                detail="Savings goal not found.",
            )

        db.commit()

        item = dict(updated._mapping)
        item["target_amount"] = float(item["target_amount"])

        total_result = db.execute(
            text(
                """
                SELECT COALESCE(SUM(amount), 0)
                FROM savings_contributions
                WHERE goal_id = :goal_id
                  AND user_id = :user_id
                """
            ),
            {
                "goal_id": goal_id,
                "user_id": current_user["id"],
            },
        )

        saved_amount = float(total_result.scalar() or 0)

        item["saved_amount"] = saved_amount
        item["remaining_amount"] = round(
            max(item["target_amount"] - saved_amount, 0),
            2,
        )
        item["progress_percentage"] = round(
            (saved_amount / item["target_amount"]) * 100,
            2,
        )

        return item

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


@app.delete("/savings-goals/{goal_id}")
def delete_savings_goal(
    goal_id: int,
    current_user=Depends(get_current_user),
):
    db = SessionLocal()

    try:
        result = db.execute(
            text(
                """
                DELETE FROM savings_goals
                WHERE id = :goal_id
                  AND user_id = :user_id
                RETURNING id
                """
            ),
            {
                "goal_id": goal_id,
                "user_id": current_user["id"],
            },
        )

        deleted = result.first()

        if not deleted:
            raise HTTPException(
                status_code=404,
                detail="Savings goal not found.",
            )

        db.commit()

        return {
            "message": "Savings goal and its contributions deleted successfully.",
            "id": deleted.id,
        }

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()