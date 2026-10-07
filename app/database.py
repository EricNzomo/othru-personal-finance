from sqlalchemy import URL, create_engine
from sqlalchemy.orm import sessionmaker

DATABASE_URL = URL.create(
    "postgresql+psycopg",
    username="postgres",
    password="Polkmn@#12",
    host="localhost",
    port=5432,
    database="personal_finance",
)

engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)