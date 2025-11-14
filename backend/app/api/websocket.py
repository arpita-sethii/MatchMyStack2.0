# backend/app/api/websocket.py - COMPLETE FIX
from fastapi import WebSocket, WebSocketDisconnect, Depends
from sqlalchemy import text
from app.core.security import verify_token
from app.services import chat_service
from app.db.session import get_db
import json
import logging

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[int, list[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, room_id: int):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
        self.active_connections[room_id].append(websocket)
    
    def disconnect(self, websocket: WebSocket, room_id: int):
        if room_id in self.active_connections:
            self.active_connections[room_id].remove(websocket)
    
    async def broadcast(self, room_id: int, message: dict):
        if room_id in self.active_connections:
            for connection in self.active_connections[room_id]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.error(f"Error broadcasting: {e}")

manager = ConnectionManager()

async def websocket_endpoint(
    websocket: WebSocket,
    room_id: int,
    token: str
):
    """WebSocket endpoint for real-time chat - FIXED to handle email in JWT"""
    try:
        # Verify token
        payload = verify_token(token)
        user_identifier = payload.get("sub")
        
        # ✅ FIX: Handle both email and user_id in JWT
        # If it's an email, look up the user_id
        if "@" in str(user_identifier):
            # Email in token - need to get user_id from database
            from app.db.session import SessionLocal
            db = SessionLocal()
            try:
                result = db.execute(
                    text("SELECT id FROM users WHERE email = :email"),
                    {"email": user_identifier}
                ).fetchone()
                
                if not result:
                    logger.error(f"User not found for email: {user_identifier}")
                    await websocket.close(code=1008, reason="User not found")
                    return
                
                user_id = result[0]
            finally:
                db.close()
        else:
            # Already a user_id
            user_id = int(user_identifier)
        
        # Connect
        await manager.connect(websocket, room_id)
        logger.info(f"User {user_id} connected to room {room_id}")
        
        try:
            while True:
                # Receive message
                data = await websocket.receive_json()
                event_type = data.get("type")
                
                if event_type == "message":
                    # Broadcast new message
                    await manager.broadcast(room_id, {
                        "type": "message",
                        "data": data.get("data")
                    })
                
                elif event_type == "typing":
                    # Broadcast typing indicator
                    await manager.broadcast(room_id, {
                        "type": "typing",
                        "user_id": user_id
                    })
                
                elif event_type == "read":
                    # Broadcast read receipt
                    await manager.broadcast(room_id, {
                        "type": "read",
                        "user_id": user_id
                    })
        
        except WebSocketDisconnect:
            manager.disconnect(websocket, room_id)
            logger.info(f"User {user_id} disconnected from room {room_id}")
    
    except Exception as e:
        logger.exception(f"WebSocket error: {e}")
        await websocket.close()