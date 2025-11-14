# backend/app/api/routes/auth.py
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.models import User
from app.core.security import verify_password, create_access_token, hash_password
from app.core.config import ACCESS_TOKEN_EXPIRE_MINUTES
from app.api.deps import get_current_user
import logging

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


@router.post("/login")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """
    Login with email and password (OAuth2 compatible).
    Returns JWT access token.
    """
    # Find user by email
    user = db.query(User).filter(User.email == form_data.username).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if user has a password set (might be Google-only user)
    if not user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No password set. Please sign in with Google or set a password first.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Verify password
    if not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Create access token
    access_token = create_access_token(
        data={"sub": user.email},
        expires_minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )
    
    logger.info(f"✅ User logged in: {user.email}")
    
    return {
        "access_token": access_token,
        "token_type": "bearer"
    }


@router.post("/signup")
def signup(
    payload: dict,
    db: Session = Depends(get_db)
):
    """
    Create a new user account with email and password.
    
    Expects:
    {
        "email": "user@example.com",
        "password": "password123",
        "name": "John Doe"
    }
    """
    email = payload.get("email")
    password = payload.get("password")
    name = payload.get("name")
    
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")
    
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Hash password
    hashed = hash_password(password)
    
    # Create new user
    user = User(
        email=email,
        name=name,
        hashed_password=hashed,
        is_verified=False
    )
    
    db.add(user)
    db.commit()
    db.refresh(user)
    
    logger.info(f"✅ New user created: {email}")
    
    return {
        "message": "Account created successfully",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name
        }
    }


@router.post("/set-password")
def set_password(
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Allow Google OAuth users to set a password for email/password login.
    
    Expects:
    {
        "password": "newpassword123"
    }
    """
    new_password = payload.get("password")
    
    if not new_password:
        raise HTTPException(status_code=400, detail="Password is required")
    
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    
    # ✅ FIX: Get user from current session instead of using injected current_user
    user = db.query(User).filter(User.id == current_user.id).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Hash the new password
    hashed = hash_password(new_password)
    
    # Update password
    user.hashed_password = hashed
    db.commit()
    db.refresh(user)
    
    logger.info(f"✅ User {user.email} set a password")
    
    return {
        "message": "Password set successfully! You can now log in with email and password.",
        "success": True
    }


@router.post("/change-password")
def change_password(
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Change password for users who already have one.
    
    Expects:
    {
        "current_password": "oldpassword",
        "new_password": "newpassword123"
    }
    """
    current_password = payload.get("current_password")
    new_password = payload.get("new_password")
    
    if not current_password or not new_password:
        raise HTTPException(status_code=400, detail="Both current and new password are required")
    
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    
    # ✅ FIX: Get user from current session
    user = db.query(User).filter(User.id == current_user.id).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if user has a password
    if not user.hashed_password:
        raise HTTPException(status_code=400, detail="No password set. Use /set-password instead.")
    
    # Verify current password
    if not verify_password(current_password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    
    # Hash and save new password
    hashed = hash_password(new_password)
    user.hashed_password = hashed
    db.commit()
    db.refresh(user)
    
    logger.info(f"✅ User {user.email} changed their password")
    
    return {
        "message": "Password changed successfully",
        "success": True
    }