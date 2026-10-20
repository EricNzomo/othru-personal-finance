from datetime import datetime

from sqlalchemy import text

from app.database import SessionLocal
from app.auth import get_password_hash, verify_password


def get_user_by_username(username: str):
    db = SessionLocal()
    try:
        result = db.execute(
            text("""
                SELECT
                    id,
                    username,
                    email,
                    full_name,
                    hashed_password,
                    is_active,
                    created_at,
                    email_verified,
                    email_verification_token_hash,
                    email_verification_expires_at,
                    google_sub,
                    auth_provider
                FROM users
                WHERE username = :username
            """),
            {"username": username},
        )
        return result.mappings().first()
    finally:
        db.close()


def get_user_by_email(email: str):
    db = SessionLocal()
    try:
        result = db.execute(
            text("""
                SELECT
                    id,
                    username,
                    email,
                    full_name,
                    hashed_password,
                    is_active,
                    created_at,
                    email_verified,
                    email_verification_token_hash,
                    email_verification_expires_at,
                    google_sub,
                    auth_provider
                FROM users
                WHERE email = :email
            """),
            {"email": email},
        )
        return result.mappings().first()
    finally:
        db.close()


def create_user(
    username: str,
    email: str,
    password: str,
    full_name: str | None = None,
    email_verified: bool = True,
    verification_token_hash: str | None = None,
    verification_expires_at: datetime | None = None,
):
    db = SessionLocal()

    try:
        hashed_password = get_password_hash(password)

        result = db.execute(
            text("""
                INSERT INTO users (
                    username,
                    email,
                    full_name,
                    hashed_password,
                    email_verified,
                    email_verification_token_hash,
                    email_verification_expires_at,
                    auth_provider
                )
                VALUES (
                    :username,
                    :email,
                    :full_name,
                    :hashed_password,
                    :email_verified,
                    :token_hash,
                    :expires_at,
                    'email'
                )
                RETURNING
                    id,
                    username,
                    email,
                    full_name,
                    is_active,
                    created_at,
                    email_verified,
                    auth_provider
            """),
            {
                "username": username,
                "email": email,
                "full_name": full_name,
                "hashed_password": hashed_password,
                "email_verified": email_verified,
                "token_hash": verification_token_hash,
                "expires_at": verification_expires_at,
            },
        )

        user = result.mappings().first()
        db.commit()

        return user

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


def get_user_by_verification_token_hash(token_hash: str):
    db = SessionLocal()

    try:
        result = db.execute(
            text("""
                SELECT
                    id,
                    username,
                    email,
                    full_name,
                    is_active,
                    email_verified,
                    email_verification_token_hash,
                    email_verification_expires_at,
                    auth_provider
                FROM users
                WHERE email_verification_token_hash = :token_hash
            """),
            {"token_hash": token_hash},
        )

        return result.mappings().first()

    finally:
        db.close()


def save_verification_token(
    user_id: int,
    token_hash: str,
    expires_at: datetime,
):
    db = SessionLocal()

    try:
        db.execute(
            text("""
                UPDATE users
                SET
                    email_verified = FALSE,
                    email_verification_token_hash = :token_hash,
                    email_verification_expires_at = :expires_at
                WHERE id = :user_id
            """),
            {
                "user_id": user_id,
                "token_hash": token_hash,
                "expires_at": expires_at,
            },
        )

        db.commit()

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


def mark_email_verified(user_id: int):
    db = SessionLocal()

    try:
        result = db.execute(
            text("""
                UPDATE users
                SET
                    email_verified = TRUE,
                    email_verification_token_hash = NULL,
                    email_verification_expires_at = NULL
                WHERE id = :user_id
                RETURNING id, username, email, email_verified
            """),
            {"user_id": user_id},
        )

        user = result.mappings().first()
        db.commit()

        return user

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


def authenticate_user(username: str, password: str):
    user = get_user_by_username(username)

    if not user:
        return None

    if not user["is_active"]:
        return None

    if not verify_password(password, user["hashed_password"]):
        return None

    return user
def get_user_by_google_sub(google_sub: str):
    db = SessionLocal()

    try:
        result = db.execute(
            text("""
                SELECT
                    id,
                    username,
                    email,
                    full_name,
                    is_active,
                    created_at,
                    email_verified,
                    google_sub,
                    auth_provider
                FROM users
                WHERE google_sub = :google_sub
            """),
            {"google_sub": google_sub},
        )

        return result.mappings().first()

    finally:
        db.close()


def create_google_user(
    username: str,
    email: str,
    full_name: str | None,
    google_sub: str,
):
    import secrets

    db = SessionLocal()

    try:
        # Google users do not use this password to sign in.
        unusable_password = secrets.token_urlsafe(48)
        hashed_password = get_password_hash(unusable_password)

        result = db.execute(
            text("""
                INSERT INTO users (
                    username,
                    email,
                    full_name,
                    hashed_password,
                    email_verified,
                    google_sub,
                    auth_provider
                )
                VALUES (
                    :username,
                    :email,
                    :full_name,
                    :hashed_password,
                    TRUE,
                    :google_sub,
                    'google'
                )
                RETURNING
                    id,
                    username,
                    email,
                    full_name,
                    is_active,
                    created_at,
                    email_verified,
                    google_sub,
                    auth_provider
            """),
            {
                "username": username,
                "email": email,
                "full_name": full_name,
                "hashed_password": hashed_password,
                "google_sub": google_sub,
            },
        )

        user = result.mappings().first()
        db.commit()

        return user

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()

def delete_user_account(user_id: int):
    """
    Permanently delete a user's account and associated financial records.

    All operations run in one transaction. If any operation fails,
    the transaction is rolled back.
    """
    db = SessionLocal()

    try:
        # Delete transactions belonging to the user.
        db.execute(
            text("DELETE FROM transactions WHERE user_id = :user_id"),
            {"user_id": user_id},
        )

        # Delete income records belonging to the user.
        db.execute(
            text("DELETE FROM income WHERE user_id = :user_id"),
            {"user_id": user_id},
        )

        # Delete budgets belonging to the user.
        db.execute(
            text("DELETE FROM budgets WHERE user_id = :user_id"),
            {"user_id": user_id},
        )

        # Delete the user. Savings goals and contributions are
        # automatically deleted by the existing CASCADE constraints.
        result = db.execute(
            text("DELETE FROM users WHERE id = :user_id"),
            {"user_id": user_id},
        )

        if result.rowcount != 1:
            raise ValueError("The account could not be found.")

        db.commit()
        return True

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()