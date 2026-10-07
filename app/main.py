from fastapi import FastAPI
from pydantic import BaseModel
from sqlalchemy import text
from app.database import SessionLocal

class Expense(BaseModel):
    transaction_date: str
    amount: float
    category_id: int
    description: str

app = FastAPI(title="Personal Finance App")


@app.get("/")
def read_root():
    return {"message": "Personal Finance API is running"}


@app.get("/db-test")
def database_test():
    db = SessionLocal()
    try:
        return {"message": "Database connection is working"}
    finally:
        db.close()


@app.get("/categories")
def get_categories():
    db = SessionLocal()
    try:
        result = db.execute(
            text("SELECT id, name, type FROM categories ORDER BY id")
        )

        categories = [
            {
                "id": row.id,
                "name": row.name,
                "type": row.type
            }
            for row in result
        ]

        return categories
    finally:
        db.close()

@app.post("/expenses")
def create_expense(expense: Expense):
    db = SessionLocal()

    try:
        query = text("""
            INSERT INTO transactions (
                transaction_date,
                amount,
                transaction_type,
                category_id,
                description,
                source
            )
            VALUES (
                :transaction_date,
                :amount,
                'expense',
                :category_id,
                :description,
                'manual'
            )
            RETURNING id
        """)

        result = db.execute(
            query,
            {
                "transaction_date": expense.transaction_date,
                "amount": expense.amount,
                "category_id": expense.category_id,
                "description": expense.description
            }
        )

        transaction_id = result.scalar_one()
        db.commit()

        return {
            "message": "Expense created successfully",
            "transaction_id": transaction_id
        }

    finally:
        db.close()

@app.get("/transactions")
def get_transactions():
    db = SessionLocal()

    try:
        result = db.execute(text("""
            SELECT
                t.id,
                t.transaction_date,
                t.amount,
                c.name AS category,
                t.description,
                t.source
            FROM transactions t
            LEFT JOIN categories c
                ON t.category_id = c.id
            ORDER BY t.transaction_date DESC, t.id DESC
        """))

        transactions = [
            {
                "id": row.id,
                "date": str(row.transaction_date),
                "amount": float(row.amount),
                "category": row.category,
                "description": row.description,
                "source": row.source
            }
            for row in result
        ]

        return transactions

    finally:
        db.close()