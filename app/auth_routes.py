import hashlib
import os
import secrets
import logging
from datetime import datetime, timedelta
from urllib.parse import urlencode

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from app.auth import create_access_token
from app.auth_dependency import get_current_user
from app.email_service import send_verification_email
from app.google_auth_service import verify_google_id_token

from app.user_service import (
    authenticate_user,
    create_google_user,
    create_user,
    delete_user_account,
    get_user_by_email,
    get_user_by_google_sub,
    get_user_by_username,
    get_user_by_verification_token_hash,
    mark_email_verified,
)

load_dotenv()

router = APIRouter(prefix="/auth", tags=["Authentication"])


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str | None = Field(default=None, max_length=150)


class LoginRequest(BaseModel):
    username: str
    password: str

class GoogleLoginRequest(BaseModel):
    credential: str = Field(min_length=1, max_length=10000)

def hash_verification_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@router.post("/register", status_code=201)
def register(request: RegisterRequest):
    username = request.username.strip()
    email = str(request.email).strip().lower()
    full_name = (
        request.full_name.strip()
        if request.full_name and request.full_name.strip()
        else None
    )

    if not username:
        raise HTTPException(
            status_code=400,
            detail="Username is required.",
        )

    if get_user_by_username(username):
        raise HTTPException(
            status_code=400,
            detail="Username already exists.",
        )

    if get_user_by_email(email):
        raise HTTPException(
            status_code=400,
            detail="Email already exists.",
        )

    verification_token = secrets.token_urlsafe(32)
    token_hash = hash_verification_token(verification_token)
    expires_at = datetime.utcnow() + timedelta(minutes=30)

    user = create_user(
        username=username,
        email=email,
        password=request.password,
        full_name=full_name,
        email_verified=False,
        verification_token_hash=token_hash,
        verification_expires_at=expires_at,
    )

    base_url = os.getenv("VERIFICATION_BASE_URL")

    if not base_url:
        raise HTTPException(
            status_code=500,
            detail="Email verification is not configured.",
        )

    separator = "&" if "?" in base_url else "?"
    verification_url = (
        f"{base_url}{separator}"
        f"{urlencode({'token': verification_token})}"
    )

    try:
        send_verification_email(email, verification_url)
    except Exception:
        logging.exception("OTHRU verification email delivery failed")
        raise HTTPException(
            status_code=503,
            detail=(
                "Your account was created, but the verification email "
                "could not be sent. Contact the application administrator."
            ),
        )

    return {
        "message": (
            "Account created. Check your email for the verification link. "
            "The link expires in 30 minutes."
        ),
        "user": {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"],
            "full_name": user["full_name"],
            "is_active": user["is_active"],
            "email_verified": user["email_verified"],
        },
    }


@router.get("/verify-email")
def verify_email(token: str):
    if not token or len(token) > 200:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired verification link.",
        )

    user = get_user_by_verification_token_hash(
        hash_verification_token(token)
    )

    if not user:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired verification link.",
        )

    if user["email_verified"]:
        raise HTTPException(
            status_code=400,
            detail="This email address has already been verified.",
        )

    expires_at = user["email_verification_expires_at"]

    if expires_at is None or expires_at <= datetime.utcnow():
        raise HTTPException(
            status_code=400,
            detail="This verification link has expired. Request a new one.",
        )

    verified_user = mark_email_verified(user["id"])

    if not verified_user:
        raise HTTPException(
            status_code=500,
            detail="Email verification could not be completed.",
        )

    return {
        "message": "Email verified successfully. You can now log in.",
        "email_verified": True,
    }


@router.post("/login")
def login(request: LoginRequest):
    user = authenticate_user(
        username=request.username,
        password=request.password,
    )

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password.",
        )

    if not user["email_verified"]:
        raise HTTPException(
            status_code=403,
            detail="Please verify your email address before logging in.",
        )

    access_token = create_access_token(
        data={"sub": user["username"]}
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"],
            "full_name": user["full_name"],
            "email_verified": user["email_verified"],
        },
    }


@router.get("/me")
def get_me(current_user=Depends(get_current_user)):
    return {
        "id": current_user["id"],
        "username": current_user["username"],
        "email": current_user["email"],
        "full_name": current_user["full_name"],
        "is_active": current_user["is_active"],
        "email_verified": current_user["email_verified"],
        "auth_provider": current_user["auth_provider"],
    }

@router.post("/google")
def google_login(request: GoogleLoginRequest):
    # Verify the Google ID token.
    try:
        google_user = verify_google_id_token(request.credential)
    except ValueError:
        raise HTTPException(
            status_code=401,
            detail="Google authentication failed. Please try again.",
        )
    except RuntimeError:
        raise HTTPException(
            status_code=500,
            detail="Google Sign-In is not configured correctly.",
        )

    google_sub = google_user["google_sub"]
    email = google_user["email"]
    full_name = google_user.get("full_name")

    # Look for an existing account linked to this Google identity.
    user = get_user_by_google_sub(google_sub)

    if user:
        if not user["is_active"]:
            raise HTTPException(
                status_code=403,
                detail="This account is disabled.",
            )

    else:
        # Never automatically link Google to an existing email account.
        existing_user = get_user_by_email(email)

        if existing_user:
            raise HTTPException(
                status_code=409,
                detail=(
                    "An account already exists with this email address. "
                    "Sign in using your existing method."
                ),
            )

        # Generate a unique OTHRU username.
        username_base = email.split("@")[0]
        username_base = "".join(
            character
            for character in username_base
            if character.isalnum() or character == "_"
        )
        username_base = username_base[:40] or "googleuser"

        username = username_base

        while get_user_by_username(username):
            username = (
                f"{username_base[:40]}_{secrets.token_hex(3)}"
            )

        # Create the Google-authenticated account.
        try:
            user = create_google_user(
                username=username,
                email=email,
                full_name=full_name,
                google_sub=google_sub,
            )
        except Exception:
            raise HTTPException(
                status_code=500,
                detail="Could not create your Google account.",
            )

    # Issue the same JWT format used by existing OTHRU login.
    access_token = create_access_token(
        data={"sub": user["username"]}
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"],
            "full_name": user["full_name"],
            "email_verified": user["email_verified"],
            "auth_provider": user["auth_provider"],
        },
    }
@router.delete("/account")
def delete_account(
    payload: dict,
    current_user=Depends(get_current_user),
):
    """
    Permanently delete the authenticated user's OTHRU account.

    Requires explicit confirmation from the user.
    """
    confirmation = payload.get("confirmation")

    if confirmation != "DELETE MY ACCOUNT":
        raise HTTPException(
            status_code=400,
            detail="Please confirm deletion by entering DELETE MY ACCOUNT.",
        )

    try:
        delete_user_account(current_user["id"])

        return {
            "message": "Your OTHRU account and associated financial records "
                       "have been permanently deleted."
        }

    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Account deletion failed. No changes were committed.",
        ) from exc