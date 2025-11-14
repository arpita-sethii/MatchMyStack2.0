from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
import logging

from app.core.security import create_access_token
from app.db.session import get_db
from app.models.models import User
from app.core.config import GOOGLE_CLIENT_ID

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/google/token")
def google_token(payload: dict, db: Session = Depends(get_db)):
    """
    Exchange Google OAuth token for JWT access token.
    
    Expects:
    {
        "token": "google_oauth_token_here"
    }
    
    Returns:
    {
        "access_token": "jwt_token",
        "token_type": "bearer",
        "user": {...}
    }
    """
    google_token = payload.get("token")
    
    if not google_token:
        raise HTTPException(status_code=400, detail="Google token is required")
    
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")
    
    try:
        # ✅ Verify the Google token with clock skew tolerance
        idinfo = id_token.verify_oauth2_token(
            google_token, 
            google_requests.Request(), 
            GOOGLE_CLIENT_ID,
            clock_skew_in_seconds=10
        )
        
        # Extract user info from Google
        google_user_id = idinfo.get("sub")
        email = idinfo.get("email")
        name = idinfo.get("name")
        email_verified = idinfo.get("email_verified", False)
        
        if not email:
            raise HTTPException(status_code=400, detail="Email not provided by Google")
        
        logger.info(f"✅ Google token verified for: {email}")
        
        # ✅ Use raw SQL to avoid datetime parsing issues
        # Check if user exists by google_id
        result = db.execute(
            text("SELECT id, email, name, google_id, is_verified, hashed_password FROM users WHERE google_id = :google_id"),
            {"google_id": google_user_id}
        ).fetchone()
        
        if result:
            # User found by google_id
            user_id, user_email, user_name, user_google_id, user_verified, user_password = result
            
            # Update user info if needed
            if name and not user_name:
                db.execute(
                    text("UPDATE users SET name = :name, updated_at = datetime('now') WHERE id = :user_id"),
                    {"name": name, "user_id": user_id}
                )
            if email_verified and not user_verified:
                db.execute(
                    text("UPDATE users SET is_verified = 1, updated_at = datetime('now') WHERE id = :user_id"),
                    {"user_id": user_id}
                )
            db.commit()
            logger.info(f"✅ Existing user logged in via Google: {email}")
            
        else:
            # Check if user exists by email
            result = db.execute(
                text("SELECT id, email, name, google_id, is_verified, hashed_password FROM users WHERE email = :email"),
                {"email": email}
            ).fetchone()
            
            if result:
                # Link Google account to existing user
                user_id, user_email, user_name, user_google_id, user_verified, user_password = result
                
                db.execute(
                    text("""
                        UPDATE users 
                        SET google_id = :google_id, 
                            is_verified = :verified,
                            updated_at = datetime('now')
                        WHERE id = :user_id
                    """),
                    {"google_id": google_user_id, "verified": 1 if email_verified else user_verified, "user_id": user_id}
                )
                db.commit()
                logger.info(f"✅ Linked Google account to existing user: {email}")
                
            else:
                # Create new user
                db.execute(
                    text("""
                        INSERT INTO users (email, name, google_id, is_verified, hashed_password, created_at, updated_at) 
                        VALUES (:email, :name, :google_id, :verified, NULL, datetime('now'), datetime('now'))
                    """),
                    {"email": email, "name": name, "google_id": google_user_id, "verified": 1 if email_verified else 0}
                )
                db.commit()
                logger.info(f"✅ New user created via Google: {email}")
        
        # Fetch final user data
        final_result = db.execute(
            text("SELECT id, email, name, google_id, is_verified, hashed_password FROM users WHERE email = :email"),
            {"email": email}
        ).fetchone()
        
        if not final_result:
            raise HTTPException(status_code=500, detail="Failed to retrieve user after creation")
        
        user_id, user_email, user_name, user_google_id, user_verified, user_password = final_result
        
        # ✅ Create JWT token using the SAME function as auth.py
        access_token = create_access_token(data={"sub": user_email})
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": user_id,
                "email": user_email,
                "name": user_name,
                "google_id": user_google_id,
                "is_verified": bool(user_verified),
                "needs_password": not bool(user_password),
            }
        }
        
    except ValueError as e:
        logger.error(f"❌ Invalid Google token: {e}")
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {str(e)}")
    except Exception as e:
        logger.exception(f"❌ Google OAuth error: {e}")
        raise HTTPException(status_code=500, detail=f"Authentication failed: {str(e)}")