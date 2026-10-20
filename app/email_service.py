import os
import smtplib
from email.message import EmailMessage

from dotenv import load_dotenv

load_dotenv()


def send_verification_email(
    recipient_email: str,
    verification_url: str,
) -> None:
    """Send an email containing the account verification link."""

    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_username = os.getenv("SMTP_USERNAME")
    smtp_password = os.getenv("SMTP_PASSWORD")
    email_from = os.getenv("EMAIL_FROM") or smtp_username

    if not smtp_username or not smtp_password or not email_from:
        raise RuntimeError(
            "Email service is not configured. Check the SMTP settings "
            "in the backend .env file."
        )

    message = EmailMessage()
    message["Subject"] = "Verify your OTHRU Personal Finance account"
    message["From"] = email_from
    message["To"] = recipient_email

    message.set_content(
        "Welcome to OTHRU Personal Finance!\n\n"
        "Please verify your email address by opening this link:\n\n"
        f"{verification_url}\n\n"
        "If you did not create an OTHRU account, you can ignore this email.\n\n"
        "For your security, do not share this verification link with anyone."
    )

    with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as server:
        server.starttls()
        server.login(smtp_username, smtp_password)
        server.send_message(message)