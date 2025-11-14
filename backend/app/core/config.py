import os
from dotenv import load_dotenv
from pathlib import Path

# Load .env
load_dotenv()

# --- BASE & DATABASE ---
BASE_DIR = Path(__file__).resolve().parents[2]
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'app.db'}")

# --- JWT CONFIG ---
JWT_SECRET = os.getenv("JWT_SECRET_KEY", os.getenv("JWT_SECRET", "super-secret-change-me"))
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 1440))

# --- BREVO EMAIL CONFIG ---
BREVO_API_KEY = os.getenv("BREVO_API_KEY")
EMAIL_FROM = os.getenv("EMAIL_FROM", "no-reply@example.com")

# --- OTP CONFIG ---
OTP_LENGTH = int(os.getenv("OTP_LENGTH", 6))
OTP_EXPIRY_MINUTES = int(os.getenv("OTP_EXPIRY_MINUTES", 10))
OTP_MAX_RESEND_ATTEMPTS = int(os.getenv("OTP_MAX_RESEND_ATTEMPTS", 5))

# --- GOOGLE OAUTH ---
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")