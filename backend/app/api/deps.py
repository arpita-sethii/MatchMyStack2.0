# app/api/deps.py
from typing import Generator
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.db.session import SessionLocal
from app.models.models import User
from app.core.security import oauth2_scheme, verify_token

def get_db() -> Generator[Session, None, None]:
    """Database session dependency."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_user(
    token: str = Depends(oauth2_scheme), 
    db: Session = Depends(get_db)
) -> User:
    """
    Validate JWT token and return current user.
    COMPLETELY AVOIDS ORM QUERIES to prevent datetime parsing errors.
    Returns a detached User object with all necessary fields.
    """
    # verify_token already raises HTTPException with 401 if invalid
    payload = verify_token(token)

    # Get user identifier from token payload (could be ID or email)
    user_identifier = payload.get("sub")
    if not user_identifier:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject (sub claim)",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # ✅ COMPLETE FIX: Use ONLY raw SQL, never query with ORM
    result = None
    
    try:
        # Try to parse as integer (legacy token with user ID)
        user_id = int(user_identifier)
        result = db.execute(
            text("SELECT id, email, name, google_id, is_verified, hashed_password, bio, role, skills FROM users WHERE id = :user_id"),
            {"user_id": user_id}
        ).fetchone()
            
    except (ValueError, TypeError):
        # It's an email (OAuth token)
        result = db.execute(
            text("SELECT id, email, name, google_id, is_verified, hashed_password, bio, role, skills FROM users WHERE email = :email"),
            {"email": user_identifier}
        ).fetchone()

    if not result:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # ✅ Create a detached User object manually (NOT added to session)
    # This User object can be read but won't cause datetime errors
    user = User()
    user.id = result[0]
    user.email = result[1]
    user.name = result[2]
    user.google_id = result[3]
    user.is_verified = bool(result[4])
    user.hashed_password = result[5]
    user.bio = result[6]
    user.role = result[7]
    
    # Parse skills JSON if it's a string
    skills_data = result[8]
    if isinstance(skills_data, str):
        import json
        try:
            user.skills = json.loads(skills_data)
        except:
            user.skills = []
    else:
        user.skills = skills_data or []

    return user