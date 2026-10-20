import os

from dotenv import load_dotenv
from google.auth.exceptions import GoogleAuthError
from google.auth.transport import requests
from google.oauth2 import id_token

load_dotenv()


def verify_google_id_token(token: str) -> dict:
    """
    Verify a Google ID token and return trusted identity claims.

    The token audience must match OTHRU's configured Web Client ID.
    """

    client_id = os.getenv("GOOGLE_CLIENT_ID")

    if not client_id:
        raise RuntimeError(
            "Google Sign-In is not configured. "
            "GOOGLE_CLIENT_ID is missing."
        )

    if not token or len(token) > 10000:
        raise ValueError("Invalid Google ID token.")

    try:
        claims = id_token.verify_oauth2_token(
            token,
            requests.Request(),
            audience=client_id,
        )
    except (ValueError, GoogleAuthError) as exc:
        raise ValueError(
            "Google authentication failed. Please try again."
        ) from exc

    issuer = claims.get("iss")

    if issuer not in (
        "accounts.google.com",
        "https://accounts.google.com",
    ):
        raise ValueError("Invalid Google token issuer.")

    subject = claims.get("sub")
    email = claims.get("email")
    email_verified = claims.get("email_verified", False)

    if not subject or not email or not email_verified:
        raise ValueError(
            "Google must provide a verified email address."
        )

    return {
        "google_sub": subject,
        "email": email.strip().lower(),
        "email_verified": True,
        "full_name": claims.get("name"),
    }