# backend/app/api/routes/users.py - COMPLETE FIX
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.api.deps import get_current_user, get_db
from app.schemas.schemas import UserOut
from app.models.models import User
import json

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me")
def get_my_profile(current_user: User = Depends(get_current_user)):
    """Get current user profile with computed fields"""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "bio": current_user.bio,
        "role": current_user.role,
        "skills": current_user.skills,
        "google_id": current_user.google_id,
        "is_verified": current_user.is_verified,
        "has_password": bool(current_user.hashed_password),
    }


@router.patch("/me")
def update_my_profile(
    payload: dict = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update current user's profile (skills, bio, name, role).
    
    Expects JSON body like:
    {
        "skills": ["Python", "React", "FastAPI"],
        "bio": "Full-stack developer",
        "name": "John Doe",
        "role": "Backend Engineer"
    }
    
    ✅ COMPLETE FIX: Uses raw SQL to avoid both datetime parsing AND detached object issues
    """
    user_id = current_user.id
    
    # Build update query dynamically based on payload
    updates = []
    params = {"user_id": user_id}
    
    if "skills" in payload:
        skills = payload["skills"]
        if not isinstance(skills, list):
            raise HTTPException(status_code=400, detail="Skills must be a list")
        updates.append("skills = :skills")
        params["skills"] = json.dumps(skills)
    
    if "bio" in payload:
        updates.append("bio = :bio")
        params["bio"] = payload["bio"]
    
    if "name" in payload:
        updates.append("name = :name")
        params["name"] = payload["name"]
    
    if "role" in payload:
        updates.append("role = :role")
        params["role"] = payload["role"]
    
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    # Add updated_at timestamp
    updates.append("updated_at = datetime('now')")
    
    # Execute raw SQL update
    update_query = f"UPDATE users SET {', '.join(updates)} WHERE id = :user_id"
    db.execute(text(update_query), params)
    db.commit()
    
    # Fetch updated user data using raw SQL (avoid datetime parsing)
    result = db.execute(
        text("SELECT id, email, name, google_id, is_verified, hashed_password, bio, role, skills FROM users WHERE id = :user_id"),
        {"user_id": user_id}
    ).fetchone()
    
    if not result:
        raise HTTPException(status_code=404, detail="User not found after update")
    
    # Return updated user data
    skills_data = result[8]
    if isinstance(skills_data, str):
        try:
            skills_parsed = json.loads(skills_data)
        except:
            skills_parsed = []
    else:
        skills_parsed = skills_data or []
    
    return {
        "id": result[0],
        "email": result[1],
        "name": result[2],
        "google_id": result[3],
        "is_verified": bool(result[4]),
        "has_password": bool(result[5]),
        "bio": result[6],
        "role": result[7],
        "skills": skills_parsed,
    }