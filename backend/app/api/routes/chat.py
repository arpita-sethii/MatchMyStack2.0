# backend/app/api/routes/chat.py - COMPLETE WITH FILE UPLOAD
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import text, or_, and_
from app.db.session import get_db
from app.models.models import ChatRoom, Message, User, Project, Match
from app.api.deps import get_current_user
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import logging

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)


class SendMessageRequest(BaseModel):
    content: str
    message_type: str = "text"


class MessageOut(BaseModel):
    id: int
    room_id: int
    sender_id: int
    sender_name: Optional[str]
    content: str
    message_type: str
    is_read: bool
    created_at: Optional[str]

    class Config:
        from_attributes = True


class ChatRoomOut(BaseModel):
    id: int
    project_id: int
    project_title: Optional[str]
    other_user_id: int
    other_user_name: Optional[str]
    last_message_preview: Optional[str]
    last_message_at: Optional[str]
    unread_count: int

    class Config:
        from_attributes = True


@router.get("/rooms")
def get_chat_rooms(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all chat rooms for current user - FIXED with raw SQL"""
    try:
        results = db.execute(
            text("""
                SELECT DISTINCT
                    cr.id,
                    cr.project_id,
                    cr.user_id,
                    cr.last_message_preview,
                    cr.unread_count_user,
                    cr.unread_count_owner,
                    p.title as project_title,
                    p.owner_id as project_owner_id,
                    u.name as user_name
                FROM chat_rooms cr
                LEFT JOIN projects p ON cr.project_id = p.id
                LEFT JOIN users u ON cr.user_id = u.id
                WHERE cr.user_id = :current_user_id 
                   OR p.owner_id = :current_user_id
                ORDER BY cr.id DESC
            """),
            {"current_user_id": current_user.id}
        ).fetchall()
        
        chat_rooms = []
        for r in results:
            room_id = r[0]
            project_id = r[1]
            room_user_id = r[2]
            last_message_preview = r[3]
            unread_count_user = r[4]
            unread_count_owner = r[5]
            project_title = r[6]
            project_owner_id = r[7]
            user_name = r[8]
            
            is_owner = project_owner_id == current_user.id
            
            if is_owner:
                other_user_id = room_user_id
                other_user_name = user_name
                unread_count = unread_count_owner or 0
            else:
                other_user_id = project_owner_id
                owner_result = db.execute(
                    text("SELECT name FROM users WHERE id = :owner_id"),
                    {"owner_id": project_owner_id}
                ).fetchone()
                other_user_name = owner_result[0] if owner_result else "Unknown User"
                unread_count = unread_count_user or 0
            
            chat_rooms.append({
                "id": room_id,
                "project_id": project_id,
                "project_title": project_title or "Unknown Project",
                "other_user_id": other_user_id or 0,
                "other_user_name": other_user_name or "Unknown User",
                "last_message_preview": last_message_preview,
                "last_message_at": None,
                "unread_count": unread_count
            })
        
        return chat_rooms
    
    except Exception as e:
        logger.exception(f"Failed to get chat rooms: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get chat rooms: {str(e)}")


@router.post("/rooms/{project_id}")
def create_or_get_chat_room(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a chat room when user matches with a project"""
    try:
        project_result = db.execute(
            text("SELECT id FROM projects WHERE id = :project_id"),
            {"project_id": project_id}
        ).fetchone()
        
        if not project_result:
            raise HTTPException(status_code=404, detail="Project not found")
        
        existing_room = db.execute(
            text("SELECT id FROM chat_rooms WHERE user_id = :user_id AND project_id = :project_id"),
            {"user_id": current_user.id, "project_id": project_id}
        ).fetchone()
        
        if existing_room:
            return {
                "room_id": existing_room[0],
                "project_id": project_id,
                "message": "Chat room already exists"
            }
        
        match_result = db.execute(
            text("SELECT id FROM matches WHERE user_id = :user_id AND project_id = :project_id AND action = 'match'"),
            {"user_id": current_user.id, "project_id": project_id}
        ).fetchone()
        
        match_id = match_result[0] if match_result else None
        
        db.execute(
            text("""
                INSERT INTO chat_rooms (user_id, project_id, match_id, unread_count_user, unread_count_owner, created_at)
                VALUES (:user_id, :project_id, :match_id, 0, 0, datetime('now'))
            """),
            {"user_id": current_user.id, "project_id": project_id, "match_id": match_id}
        )
        db.commit()
        
        new_room = db.execute(
            text("SELECT id FROM chat_rooms WHERE user_id = :user_id AND project_id = :project_id ORDER BY created_at DESC LIMIT 1"),
            {"user_id": current_user.id, "project_id": project_id}
        ).fetchone()
        
        room_id = new_room[0] if new_room else None
        
        logger.info(f"Created chat room {room_id} for user {current_user.id} and project {project_id}")
        
        return {
            "room_id": room_id,
            "project_id": project_id,
            "message": "Chat room created successfully"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.exception(f"Failed to create chat room: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create chat room: {str(e)}")


@router.get("/rooms/{room_id}/messages")
def get_messages(
    room_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = 50
):
    """Get messages in a chat room - FIXED with raw SQL"""
    try:
        room_result = db.execute(
            text("""
                SELECT cr.id, cr.user_id, p.owner_id 
                FROM chat_rooms cr
                LEFT JOIN projects p ON cr.project_id = p.id
                WHERE cr.id = :room_id
            """),
            {"room_id": room_id}
        ).fetchone()
        
        if not room_result:
            raise HTTPException(status_code=404, detail="Chat room not found")
        
        room_user_id = room_result[1]
        project_owner_id = room_result[2]
        
        is_owner = project_owner_id == current_user.id
        is_user = room_user_id == current_user.id
        
        if not (is_owner or is_user):
            raise HTTPException(status_code=403, detail="Not authorized to access this chat room")
        
        messages_result = db.execute(
            text("""
                SELECT m.id, m.room_id, m.sender_id, m.content, m.message_type, m.is_read, u.name
                FROM messages m
                LEFT JOIN users u ON m.sender_id = u.id
                WHERE m.room_id = :room_id
                ORDER BY m.id ASC
                LIMIT :limit
            """),
            {"room_id": room_id, "limit": limit}
        ).fetchall()
        
        result = []
        for msg in messages_result:
            result.append({
                "id": msg[0],
                "room_id": msg[1],
                "sender_id": msg[2],
                "sender_name": msg[6] or "Unknown",
                "content": msg[3],
                "message_type": msg[4],
                "is_read": bool(msg[5]),
                "created_at": None
            })
        
        if is_owner:
            db.execute(
                text("UPDATE chat_rooms SET unread_count_owner = 0 WHERE id = :room_id"),
                {"room_id": room_id}
            )
        else:
            db.execute(
                text("UPDATE chat_rooms SET unread_count_user = 0 WHERE id = :room_id"),
                {"room_id": room_id}
            )
        db.commit()
        
        return result
    
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to get messages: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get messages: {str(e)}")


@router.post("/rooms/{room_id}/messages")
def send_message(
    room_id: int,
    request: SendMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Send a message in a chat room - FIXED to return complete message data"""
    try:
        room_result = db.execute(
            text("""
                SELECT cr.id, cr.user_id, p.owner_id 
                FROM chat_rooms cr
                LEFT JOIN projects p ON cr.project_id = p.id
                WHERE cr.id = :room_id
            """),
            {"room_id": room_id}
        ).fetchone()
        
        if not room_result:
            raise HTTPException(status_code=404, detail="Chat room not found")
        
        room_user_id = room_result[1]
        project_owner_id = room_result[2]
        
        is_owner = project_owner_id == current_user.id
        is_user = room_user_id == current_user.id
        
        if not (is_owner or is_user):
            raise HTTPException(status_code=403, detail="Not authorized")
        
        db.execute(
            text("""
                INSERT INTO messages (room_id, sender_id, content, message_type, is_read, created_at)
                VALUES (:room_id, :sender_id, :content, :message_type, 0, datetime('now'))
            """),
            {
                "room_id": room_id,
                "sender_id": current_user.id,
                "content": request.content,
                "message_type": request.message_type
            }
        )
        
        preview = request.content[:200] if len(request.content) > 200 else request.content
        
        if is_owner:
            db.execute(
                text("""
                    UPDATE chat_rooms 
                    SET last_message_preview = :preview,
                        last_message_at = datetime('now'),
                        unread_count_user = unread_count_user + 1
                    WHERE id = :room_id
                """),
                {"preview": preview, "room_id": room_id}
            )
        else:
            db.execute(
                text("""
                    UPDATE chat_rooms 
                    SET last_message_preview = :preview,
                        last_message_at = datetime('now'),
                        unread_count_owner = unread_count_owner + 1
                    WHERE id = :room_id
                """),
                {"preview": preview, "room_id": room_id}
            )
        
        db.commit()
        
        # ✅ FIX: Return complete message with sender_id and sender_name
        message_result = db.execute(
            text("""
                SELECT m.id, m.room_id, m.sender_id, m.content, m.message_type, m.is_read, u.name
                FROM messages m
                LEFT JOIN users u ON m.sender_id = u.id
                WHERE m.room_id = :room_id AND m.sender_id = :sender_id
                ORDER BY m.created_at DESC 
                LIMIT 1
            """),
            {"room_id": room_id, "sender_id": current_user.id}
        ).fetchone()
        
        if message_result:
            return {
                "id": message_result[0],
                "room_id": message_result[1],
                "sender_id": message_result[2],
                "sender_name": message_result[6] or "Unknown",
                "content": message_result[3],
                "message_type": message_result[4],
                "is_read": bool(message_result[5]),
                "created_at": None
            }
        
        return {
            "content": request.content,
            "created_at": None
        }
    
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.exception(f"Failed to send message: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to send message: {str(e)}")


@router.post("/rooms/{room_id}/read")
def mark_room_as_read(
    room_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mark all messages in a room as read"""
    try:
        room_result = db.execute(
            text("""
                SELECT cr.user_id, p.owner_id 
                FROM chat_rooms cr
                LEFT JOIN projects p ON cr.project_id = p.id
                WHERE cr.id = :room_id
            """),
            {"room_id": room_id}
        ).fetchone()
        
        if not room_result:
            raise HTTPException(status_code=404, detail="Chat room not found")
        
        is_owner = room_result[1] == current_user.id
        
        if is_owner:
            db.execute(
                text("UPDATE chat_rooms SET unread_count_owner = 0 WHERE id = :room_id"),
                {"room_id": room_id}
            )
        else:
            db.execute(
                text("UPDATE chat_rooms SET unread_count_user = 0 WHERE id = :room_id"),
                {"room_id": room_id}
            )
        
        db.commit()
        return {"success": True}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to mark room as read: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/icebreakers")
def get_icebreakers():
    """Get conversation starter suggestions"""
    return [
        "What's your experience with this tech stack?",
        "What role are you looking for in this project?",
        "Tell me about your background",
        "What interests you about this project?",
        "What's your availability like?"
    ]


@router.post("/upload")
async def upload_chat_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Upload a file in chat"""
    import os
    from pathlib import Path
    
    try:
        # Create uploads directory if it doesn't exist
        upload_dir = Path("app/uploads/chat")
        upload_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate unique filename
        import uuid
        file_ext = os.path.splitext(file.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = upload_dir / unique_filename
        
        # Save file
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Return file URL
        file_url = f"/uploads/chat/{unique_filename}"
        
        logger.info(f"User {current_user.id} uploaded file: {unique_filename}")
        
        return {
            "success": True,
            "file_url": file_url,
            "filename": file.filename
        }
    
    except Exception as e:
        logger.exception(f"Failed to upload file: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")