# backend/app/api/routes/match.py
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Request
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.models import Project, User, Match
from app.api.deps import get_current_user
from app.services.matching_engine import MatchingEngineWrapper
from app.services.resume_parser import ImprovedResumeParser, MAX_PDF_BYTES
import json
import logging
from typing import List, Any

router = APIRouter(prefix="/match", tags=["matching"])
logger = logging.getLogger(__name__)

_matcher = None
_parser = None

def get_matcher():
    global _matcher
    if _matcher is None:
        logger.info("🔄 Initializing MatchingEngineWrapper...")
        _matcher = MatchingEngineWrapper()
        logger.info("✅ MatchingEngineWrapper ready")
    return _matcher

def get_parser():
    global _parser
    if _parser is None:
        logger.info("🔄 Initializing ImprovedResumeParser...")
        _parser = ImprovedResumeParser()
        logger.info("✅ ImprovedResumeParser ready")
    return _parser


@router.get("/ping")
async def ping(request: Request):
    return {"ok": True, "origin": request.headers.get("origin"), "service": "match"}


@router.post("/upload_and_match")
async def upload_and_match_resume(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    top_k: int = 10
):
    """Upload resume, parse it, and return matching projects."""
    
    parser = get_parser()
    matcher = get_matcher()

    # Read file
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if MAX_PDF_BYTES and len(content) > MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail=f"File too large")

    # Parse resume
    parsed = parser.parse_resume(pdf_bytes=content)
    if "error" in parsed:
        raise HTTPException(status_code=422, detail=parsed["error"])

    all_skills = parsed.get("all_skills", []) or []
    logger.info(f"✓ Parsed resume -> {len(all_skills)} skills")

    # Build user profile
    user_profile = {
        "id": "user_resume",
        "user_id": "user_resume",
        "name": parsed.get("name", "Resume User"),
        "email": parsed.get("contact", {}).get("email"),
        "roles": [str(r).strip().lower() for r in (parsed.get("roles", []) or ["developer"])],
        "skills": [str(s).strip().lower() for s in all_skills],
        "experience_years": parsed.get("experience_years", 0) or 0,
        "bio": f"Resume with {len(all_skills)} skills",
        "timezone": parsed.get("timezone", None),
        "embedding": [0.1] * 384
    }

    # Get embedding
    try:
        user_emb = matcher.ensure_embedding(user_profile, kind="profile")
        if user_emb and isinstance(user_emb, list):
            user_profile["embedding"] = user_emb
    except Exception as e:
        logger.warning(f"Embedding failed: {e}")

    # ✅ FETCH PROJECTS - Exclude own projects AND already-swiped projects
    try:
        # Get projects user already swiped on
        swiped_project_ids = [
            m.project_id for m in db.query(Match)
            .filter(Match.user_id == current_user.id)
            .all()
        ]
        
        logger.info(f"User has swiped on {len(swiped_project_ids)} projects")
        
        # Exclude own projects and swiped projects
        query = db.query(Project).filter(
            Project.owner_id != current_user.id
        )
        
        if swiped_project_ids:
            query = query.filter(Project.id.notin_(swiped_project_ids))
        
        projects = query.all()
    except Exception as e:
        logger.error(f"Failed to query projects: {e}")
        projects = []
    
    if not projects:
        logger.info("No new projects found for matching")
        return {
            "parsed_resume": parsed,
            "matches": []
        }
    
    logger.info(f"✓ Found {len(projects)} new projects (excluding own and swiped)")

    # Build candidates
    candidates = []
    project_map = {}
    
    for p in projects:
        try:
            req_skills = p.required_skills
            if isinstance(req_skills, str):
                req_skills = json.loads(req_skills) if req_skills else []
            req_skills = [str(s).strip().lower() for s in (req_skills or [])]
        except:
            req_skills = []

        try:
            req_roles = p.required_roles
            if isinstance(req_roles, str):
                req_roles = json.loads(req_roles) if req_roles else []
            req_roles = [str(r).strip().lower() for r in (req_roles or [])]
        except:
            req_roles = []

        try:
            embedding = p.embedding
            if isinstance(embedding, str):
                embedding = json.loads(embedding)
            if not isinstance(embedding, list):
                embedding = [0.1] * 384
        except:
            embedding = [0.1] * 384

        candidate = {
            "id": p.id,
            "user_id": p.id,
            "name": p.title or f"Project-{p.id}",
            "email": None,
            "roles": req_roles,
            "skills": req_skills,
            "experience_years": 0,
            "embedding": embedding,
        }
        
        candidates.append(candidate)
        project_map[p.id] = p

    # Match
    try:
        matches_list = []
        for candidate in candidates:
            res = matcher.matcher.match_user_to_project(user_profile, candidate)
            matches_list.append(res)
        
        matches_list.sort(key=lambda m: (m.score, len(m.shared_skills or [])), reverse=True)
        ranked_matches = matches_list[:top_k]
    except Exception as e:
        logger.exception(f"Matching failed: {e}")
        raise HTTPException(status_code=500, detail=f"Matching failed: {str(e)}")

    # Build response
    final_matches = []
    for match in ranked_matches:
        match_dict = match.to_dict() if hasattr(match, "to_dict") else dict(match)
        project_id = match_dict.get("target_id")
        
        try:
            if isinstance(project_id, str) and project_id.isdigit():
                project_id = int(project_id)
        except:
            pass

        if project_id and project_id in project_map:
            p = project_map[project_id]
            
            # Parse skills from DB
            try:
                req_skills = p.required_skills
                if isinstance(req_skills, str):
                    req_skills = json.loads(req_skills) if req_skills else []
            except:
                req_skills = []
            
            try:
                req_roles = p.required_roles
                if isinstance(req_roles, str):
                    req_roles = json.loads(req_roles) if req_roles else []
            except:
                req_roles = []
            
            final_match = {
                "project_id": p.id,
                "project_title": p.title,
                "project_description": p.description,
                "required_skills": req_skills,
                "required_roles": req_roles,
                "score": float(match_dict.get("score", 0)),
                "reasons": match_dict.get("reasons", []),
                "shared_skills": match_dict.get("shared_skills", []),
                "complementary_skills": match_dict.get("complementary_skills", []),
                "created_at": None,
            }
            
            # Get owner safely
            try:
                owner = db.query(User).filter(User.id == p.owner_id).first()
                if owner:
                    final_match["owner"] = {
                        "id": owner.id,
                        "name": owner.name,
                        "email": owner.email,
                    }
            except Exception as e:
                logger.debug(f"Could not load owner: {e}")
            
            final_matches.append(final_match)

    logger.info(f"✓ Returning {len(final_matches)} matches")

    return {
        "parsed_resume": parsed,
        "matches": final_matches
    }


@router.post("/match_from_profile")
async def match_from_profile(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    top_k: int = 10
):
    """Match from JSON profile"""
    matcher = get_matcher()

    skills = payload.get("skills") or []
    if isinstance(skills, str):
        skills = [s.strip() for s in skills.split(",") if s.strip()]

    user_profile = {
        "id": "profile_user",
        "user_id": "profile_user",
        "name": payload.get("name", "Profile User"),
        "email": payload.get("email"),
        "roles": [],
        "skills": [str(s).strip().lower() for s in skills],
        "experience_years": 0,
        "bio": f"Profile with {len(skills)} skills",
        "timezone": None,
        "embedding": [0.1] * 384
    }

    try:
        emb = matcher.ensure_embedding(user_profile, kind="profile")
        if emb and isinstance(emb, list):
            user_profile["embedding"] = emb
    except:
        pass

    # ✅ Fetch projects - exclude swiped
    try:
        swiped_project_ids = [
            m.project_id for m in db.query(Match)
            .filter(Match.user_id == current_user.id)
            .all()
        ]
        
        query = db.query(Project).filter(
            Project.owner_id != current_user.id
        )
        
        if swiped_project_ids:
            query = query.filter(Project.id.notin_(swiped_project_ids))
        
        projects = query.all()
    except Exception as e:
        logger.error(f"Failed to query projects: {e}")
        projects = []
    
    if not projects:
        return {"parsed_resume": None, "matches": []}

    # Build candidates
    candidates = []
    project_map = {}
    
    for p in projects:
        try:
            req_skills = p.required_skills
            if isinstance(req_skills, str):
                req_skills = json.loads(req_skills) if req_skills else []
            req_skills = [str(s).strip().lower() for s in (req_skills or [])]
        except:
            req_skills = []

        try:
            embedding = p.embedding
            if isinstance(embedding, str):
                embedding = json.loads(embedding)
            if not isinstance(embedding, list):
                embedding = [0.1] * 384
        except:
            embedding = [0.1] * 384

        candidate = {
            "id": p.id,
            "user_id": p.id,
            "name": p.title,
            "skills": req_skills,
            "embedding": embedding
        }
        
        candidates.append(candidate)
        project_map[p.id] = p

    # Match
    matches_list = []
    for candidate in candidates:
        m = matcher.matcher.match_user_to_project(user_profile, candidate)
        matches_list.append(m)
    
    matches_list.sort(key=lambda m: m.score, reverse=True)
    ranked_matches = matches_list[:top_k]

    # Build response
    final_matches = []
    for match in ranked_matches:
        match_dict = match.to_dict() if hasattr(match, "to_dict") else dict(match)
        project_id = match_dict.get("target_id")
        
        if project_id and project_id in project_map:
            p = project_map[project_id]
            
            try:
                req_skills = p.required_skills
                if isinstance(req_skills, str):
                    req_skills = json.loads(req_skills) if req_skills else []
            except:
                req_skills = []
            
            final_matches.append({
                "project_id": p.id,
                "project_title": p.title,
                "project_description": p.description,
                "required_skills": req_skills,
                "score": float(match_dict.get("score", 0)),
                "shared_skills": match_dict.get("shared_skills", []),
            })

    return {"parsed_resume": None, "matches": final_matches}