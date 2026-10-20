import os

from dotenv import load_dotenv
from sqlalchemy import URL, create_engine
from sqlalchemy.orm import sessionmaker

load_dotenv()

# Prefer DATABASE_URL for hosted deployment.
# Otherwise, use the separate variables for local development.
DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    # Normalize PostgreSQL URLs for the psycopg driver.
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace(
            "postgres://",
            "postgresql+psycopg://",
            1,
        )
    elif DATABASE_URL.startswith("postgresql://"):
        DATABASE_URL = DATABASE_URL.replace(
            "postgresql://",
            "postgresql+psycopg://",
            1,
        )

    engine = create_engine(DATABASE_URL)

else:
    DATABASE_URL = URL.create(
        "postgresql+psycopg",
        username=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        host=os.getenv("DB_HOST"),
        port=int(os.getenv("DB_PORT", "5432")),
        database=os.getenv("DB_NAME"),
    )

    engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)