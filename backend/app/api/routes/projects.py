# backend/app/api/routes/projects.py - COMPLETE FINAL FIX
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List
from pydantic import BaseModel
from app.api.deps import get_db, get_current_user
from app.models.models import Project, User, Resume, Match
from app.schemas.schemas import ProjectCreate, ProjectOut, ProjectUpdate, MatchesOut, MatchItem, InterestedUser
from app.services.embedding_engine import EmbeddingEngine
from app.services.matching_engine import MatchingEngineWrapper
import logging
import json

router = APIRouter(prefix="/projects", tags=["projects"])
matcher = MatchingEngineWrapper()
logger = logging.getLogger(__name__)


# Action request model
class ActionRequest(BaseModel):
    action: str  # "match" or "pass"


@router.get("")
def get_all_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100,
):
    """Get all projects for the current user - FIXED with raw SQL"""
    # ✅ Use raw SQL to avoid datetime parsing
    results = db.execute(
        text("""
            SELECT id, owner_id, title, description, required_skills, required_roles,
                   min_experience, max_experience, timezone, embedding
            FROM projects 
            WHERE owner_id = :owner_id 
            ORDER BY created_at DESC 
            LIMIT :limit OFFSET :skip
        """),
        {"owner_id": current_user.id, "limit": limit, "skip": skip}
    ).fetchall()
    
    projects = []
    for r in results:
        projects.append({
            "id": r[0],
            "owner_id": r[1],
            "title": r[2],
            "description": r[3],
            "required_skills": json.loads(r[4]) if isinstance(r[4], str) else (r[4] or []),
            "required_roles": json.loads(r[5]) if isinstance(r[5], str) else (r[5] or []),
            "min_experience": r[6],
            "max_experience": r[7],
            "timezone": r[8],
        })
    
    logger.info(f"User {current_user.id} fetched {len(projects)} projects")
    return projects


@router.get("/{project_id}")
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a specific project by ID - FIXED with raw SQL"""
    result = db.execute(
        text("""
            SELECT id, owner_id, title, description, required_skills, required_roles,
                   min_experience, max_experience, timezone, embedding
            FROM projects WHERE id = :project_id
        """),
        {"project_id": project_id}
    ).fetchone()
    
    if not result:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return {
        "id": result[0],
        "owner_id": result[1],
        "title": result[2],
        "description": result[3],
        "required_skills": json.loads(result[4]) if isinstance(result[4], str) else (result[4] or []),
        "required_roles": json.loads(result[5]) if isinstance(result[5], str) else (result[5] or []),
        "min_experience": result[6],
        "max_experience": result[7],
        "timezone": result[8],
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new project - FIXED with raw SQL"""
    # Generate embedding
    embedder = EmbeddingEngine()
    embedding = None
    try:
        emb = embedder.embed_project({
            "title": payload.title,
            "description": payload.description,
            "required_skills": payload.required_skills or []
        })
        embedding = list(emb) if emb else None
    except Exception as e:
        logger.warning(f"Failed to generate embedding for project: {e}")
        embedding = None

    # ✅ Use raw SQL to insert project (no updated_at column)
    db.execute(
        text("""
            INSERT INTO projects (
                owner_id, title, description, required_skills, required_roles,
                min_experience, max_experience, timezone, embedding, created_at
            ) VALUES (
                :owner_id, :title, :description, :required_skills, :required_roles,
                :min_experience, :max_experience, :timezone, :embedding, datetime('now')
            )
        """),
        {
            "owner_id": current_user.id,
            "title": payload.title,
            "description": payload.description,
            "required_skills": json.dumps(payload.required_skills or []),
            "required_roles": json.dumps(payload.required_roles or []),
            "min_experience": payload.min_experience,
            "max_experience": payload.max_experience,
            "timezone": payload.timezone,
            "embedding": json.dumps(embedding) if embedding else None,
        }
    )
    db.commit()
    
    # Get the created project ID
    result = db.execute(
        text("SELECT id FROM projects WHERE owner_id = :owner_id ORDER BY created_at DESC LIMIT 1"),
        {"owner_id": current_user.id}
    ).fetchone()
    
    project_id = result[0] if result else None
    
    logger.info(f"User {current_user.id} created project {project_id}: {payload.title}")
    
    return {
        "id": project_id,
        "owner_id": current_user.id,
        "title": payload.title,
        "description": payload.description,
        "required_skills": payload.required_skills or [],
        "required_roles": payload.required_roles or [],
        "min_experience": payload.min_experience,
        "max_experience": payload.max_experience,
        "timezone": payload.timezone,
    }


@router.put("/{project_id}")
def update_project(
    project_id: int,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a project (owner only) - FIXED with raw SQL"""
    # Check if project exists and user owns it
    result = db.execute(
        text("SELECT owner_id FROM projects WHERE id = :project_id"),
        {"project_id": project_id}
    ).fetchone()
    
    if not result:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if result[0] != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this project")
    
    # Build update query dynamically
    updates = []
    params = {"project_id": project_id}
    
    if payload.title is not None:
        updates.append("title = :title")
        params["title"] = payload.title
    if payload.description is not None:
        updates.append("description = :description")
        params["description"] = payload.description
    if payload.required_skills is not None:
        updates.append("required_skills = :required_skills")
        params["required_skills"] = json.dumps(payload.required_skills)
    if payload.required_roles is not None:
        updates.append("required_roles = :required_roles")
        params["required_roles"] = json.dumps(payload.required_roles)
    if payload.min_experience is not None:
        updates.append("min_experience = :min_experience")
        params["min_experience"] = payload.min_experience
    if payload.max_experience is not None:
        updates.append("max_experience = :max_experience")
        params["max_experience"] = payload.max_experience
    if payload.timezone is not None:
        updates.append("timezone = :timezone")
        params["timezone"] = payload.timezone
    
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    # Regenerate embedding if content changed
    if payload.title or payload.description or payload.required_skills:
        try:
            embedder = EmbeddingEngine()
            emb = embedder.embed_project({
                "title": params.get("title", ""),
                "description": params.get("description", ""),
                "required_skills": payload.required_skills or []
            })
            if emb:
                updates.append("embedding = :embedding")
                params["embedding"] = json.dumps(list(emb))
        except Exception as e:
            logger.warning(f"Failed to regenerate embedding: {e}")
    
    # Execute update
    update_query = f"UPDATE projects SET {', '.join(updates)} WHERE id = :project_id"
    db.execute(text(update_query), params)
    db.commit()
    
    logger.info(f"User {current_user.id} updated project {project_id}")
    
    # Return updated project
    return get_project(project_id, db, current_user)


@router.delete("/{project_id}")
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a project (owner only)"""
    try:
        # Check ownership
        result = db.execute(
            text("SELECT owner_id FROM projects WHERE id = :project_id"),
            {"project_id": project_id}
        ).fetchone()
        
        if not result:
            raise HTTPException(status_code=404, detail="Project not found")
        
        if result[0] != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to delete this project")
        
        # Delete related matches first
        db.execute(text("DELETE FROM matches WHERE project_id = :project_id"), {"project_id": project_id})
        
        # Delete project
        db.execute(text("DELETE FROM projects WHERE id = :project_id"), {"project_id": project_id})
        db.commit()
        
        logger.info(f"User {current_user.id} deleted project {project_id}")
        return {"success": True, "message": "Project deleted successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting project {project_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete project: {str(e)}")


@router.post("/{project_id}/action")
def handle_project_action(
    project_id: int,
    action_req: ActionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Handle swipe action (match or pass) on a project"""
    action = action_req.action.lower()
    
    if action not in ["match", "pass"]:
        raise HTTPException(status_code=400, detail="Action must be 'match' or 'pass'")
    
    # Verify project exists
    result = db.execute(
        text("SELECT id FROM projects WHERE id = :project_id"),
        {"project_id": project_id}
    ).fetchone()
    
    if not result:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check if action already exists
    existing = db.execute(
        text("SELECT id FROM matches WHERE user_id = :user_id AND project_id = :project_id"),
        {"user_id": current_user.id, "project_id": project_id}
    ).fetchone()
    
    if existing:
        # Update existing
        db.execute(
            text("UPDATE matches SET action = :action WHERE user_id = :user_id AND project_id = :project_id"),
            {"action": action, "user_id": current_user.id, "project_id": project_id}
        )
        logger.info(f"User {current_user.id} updated action to {action} for project {project_id}")
    else:
        # Create new
        db.execute(
            text("""INSERT INTO matches (user_id, project_id, action, created_at) 
                    VALUES (:user_id, :project_id, :action, datetime('now'))"""),
            {"user_id": current_user.id, "project_id": project_id, "action": action}
        )
        logger.info(f"User {current_user.id} {action}ed project {project_id}")
    
    db.commit()
    
    return {
        "success": True,
        "project_id": project_id,
        "action": action,
        "message": f"Successfully {action}ed project"
    }


@router.get("/{project_id}/interested")
def get_interested_users(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all users who matched this project (owner only)"""
    # Check ownership
    result = db.execute(
        text("SELECT owner_id FROM projects WHERE id = :project_id"),
        {"project_id": project_id}
    ).fetchone()
    
    if not result:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if result[0] != current_user.id:
        raise HTTPException(status_code=403, detail="Only project owner can view interested users")
    
    # Get interested users using raw SQL
    results = db.execute(
        text("""
            SELECT u.id, u.name, u.email, u.bio, u.skills, u.role, m.created_at
            FROM matches m
            JOIN users u ON m.user_id = u.id
            WHERE m.project_id = :project_id AND m.action = 'match'
            ORDER BY m.created_at DESC
        """),
        {"project_id": project_id}
    ).fetchall()
    
    interested_users = []
    for r in results:
        skills = r[4]
        if isinstance(skills, str):
            try:
                skills = json.loads(skills)
            except:
                skills = []
        
        interested_users.append({
            "id": r[0],
            "name": r[1],
            "email": r[2],
            "bio": r[3],
            "skills": skills or [],
            "role": r[5],
            "matched_at": None  # Skip datetime to avoid parsing errors
        })
    
    logger.info(f"Project {project_id} has {len(interested_users)} interested users")
    return interested_users


@router.get("/{project_id}/matches", response_model=MatchesOut)
def get_project_matches(
    project_id: int,
    top_k: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get matching users for a project"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    project_emb = project.embedding
    if not project_emb:
        raise HTTPException(status_code=400, detail="Project has no embedding")

    users = db.query(User).filter(User.embedding != None).all()
    candidates = []
    for u in users:
        latest_resume = db.query(Resume).filter(Resume.user_id == u.id).order_by(Resume.created_at.desc()).first()
        candidates.append({
            "user_id": u.id,
            "embedding": u.embedding,
            "parsed_json": latest_resume.parsed_json if latest_resume else None,
            "user": {"id": u.id, "email": u.email, "name": u.name}
        })

    ranked = matcher.rank_candidates(project_emb, candidates, top_k=top_k)
    items = []
    for r in ranked:
        items.append(MatchItem(user_id=r["user_id"], score=float(r["score"]), reason=r.get("reason"), user=r.get("user")))
    return MatchesOut(project_id=project_id, matches=items)