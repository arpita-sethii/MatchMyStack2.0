import logging
import requests
from app.core.config import EMAIL_FROM, BREVO_API_KEY  # ✅ use values from config

logger = logging.getLogger(__name__)

BREVO_URL = "https://api.brevo.com/v3/smtp/email"


class EmailService:
    """Service for sending emails via Brevo API"""

    def __init__(self):
        self.api_key = BREVO_API_KEY
        self.email_from = EMAIL_FROM
        self.enabled = bool(self.api_key)

        if self.enabled:
            logger.info("✅ Brevo email service enabled")
        else:
            logger.warning("⚠️ BREVO_API_KEY missing — fallback to console logging")

    def _send_via_brevo(self, to_email: str, subject: str, body: str) -> bool:
        headers = {
            "api-key": self.api_key,
            "Content-Type": "application/json"
        }

        payload = {
            "sender": {"name": "MatchMyStack", "email": self.email_from},
            "to": [{"email": to_email}],
            "subject": subject,
            "textContent": body,
        }

        try:
            resp = requests.post(BREVO_URL, json=payload, headers=headers, timeout=15)
            if resp.status_code in (200, 201):
                logger.info(f"✅ Email sent to {to_email}")
                return True

            logger.error(f"❌ Brevo error {resp.status_code}: {resp.text}")
            return False

        except Exception as e:
            logger.exception(f"❌ Brevo send failed: {e}")
            return False

    def send_email(self, to_email: str, subject: str, body: str) -> bool:
        """Send via Brevo or log if disabled (dev mode)"""
        if not self.enabled:
            logger.info("\n✉️  Email (DEV mode)")
            logger.info(f"To: {to_email}\nSubject: {subject}\n\n{body}")
            return True

        return self._send_via_brevo(to_email, subject, body)

    def send_otp_email(self, to_email: str, otp_code: str) -> bool:
        subject = "Your MatchMyStack Verification Code"
        body = f"""
Hello,

Your verification code is: {otp_code}

It will expire in 10 minutes.

If you did not request this, ignore this email.

— MatchMyStack Team
"""
        return self.send_email(to_email, subject, body)


# Backward compatibility for old calls
def send_email(to_email: str, subject: str, body: str) -> bool:
    return EmailService().send_email(to_email, subject, body)
