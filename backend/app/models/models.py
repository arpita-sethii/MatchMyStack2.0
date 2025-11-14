from sqlalchemy import Column, Integer, String, DateTime, Boolean, JSON, Text, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=True)
    
    google_id = Column(String, unique=True, nullable=True, index=True)
    is_verified = Column(Boolean, default=False)
    bio = Column(Text, nullable=True)
    role = Column(String, nullable=True)
    skills = Column(JSON, nullable=True)
    embedding = Column(JSON, nullable=True)
    is_active = Column(Boolean, default=True)
    email_verified = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=False), server_default=func.now())  # ✅ FIXED
    resumes = relationship("Resume", back_populates="user")
    projects = relationship("Project", back_populates="owner")

class Resume(Base):
    __tablename__ = "resumes"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    filename = Column(String, nullable=True)
    raw_text = Column(Text, nullable=True)
    parsed_json = Column(JSON, nullable=True)
    embedding = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=False), server_default=func.now())  # ✅ FIXED
    user = relationship("User", back_populates="resumes")

class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(256), nullable=False)
    description = Column(Text, nullable=True)
    required_skills = Column(JSON, nullable=True)
    required_roles = Column(JSON, nullable=True)
    min_experience = Column(Integer, nullable=True)
    max_experience = Column(Integer, nullable=True)
    timezone = Column(String, nullable=True)
    embedding = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=False), server_default=func.now())  # ✅ FIXED
    owner = relationship("User", back_populates="projects")

class Match(Base):
    """Track when a user swipes right (matches) on a project"""
    __tablename__ = "matches"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    action = Column(String, nullable=False)  # "match" or "pass"
    created_at = Column(DateTime(timezone=False), server_default=func.now())  # ✅ FIXED
    user = relationship("User")
    project = relationship("Project")


# Email verification for existing users (post-signup)
class EmailVerification(Base):
    __tablename__ = "email_verifications"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    otp_hash = Column(String, nullable=False)
    expires_at = Column(DateTime(timezone=False), nullable=False)  # ✅ FIXED
    consumed = Column(Boolean, default=False, nullable=False)
    attempts = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=False), server_default=func.now())  # ✅ FIXED
    user = relationship("User", backref="email_verifications")


# Pre-signup email verification (before user account exists)
class PreSignupVerification(Base):
    """Store OTP verifications for emails before user signup"""
    __tablename__ = "presignup_verifications"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, nullable=False, index=True)
    otp_hash = Column(String, nullable=False)
    expires_at = Column(DateTime(timezone=False), nullable=False)  # ✅ FIXED
    consumed = Column(Boolean, default=False, nullable=False)
    attempts = Column(Integer, default=0, nullable=False)
    verified_at = Column(DateTime(timezone=False), nullable=True)  # ✅ FIXED
    created_at = Column(DateTime(timezone=False), server_default=func.now())  # ✅ FIXED


# Password reset tokens
class PasswordReset(Base):
    """Store password reset tokens for forgot password flow"""
    __tablename__ = "password_resets"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token = Column(String, unique=True, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=False), nullable=False)  # ✅ FIXED
    used = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=False), server_default=func.now())  # ✅ FIXED
    user = relationship("User", backref="password_resets")


# ============ NEW: CHAT SYSTEM ============

class ChatRoom(Base):
    """
    Represents a chat between a user and a project owner.
    Created when user swipes right (matches) on a project.
    """
    __tablename__ = "chat_rooms"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    match_id = Column(Integer, ForeignKey("matches.id"), nullable=True)
    
    # Last activity tracking
    last_message_at = Column(DateTime(timezone=False), nullable=True)  # ✅ FIXED
    last_message_preview = Column(String(200), nullable=True)
    
    # Unread counts (denormalized for performance)
    unread_count_user = Column(Integer, default=0)
    unread_count_owner = Column(Integer, default=0)
    
    created_at = Column(DateTime(timezone=False), server_default=func.now())  # ✅ FIXED
    
    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    project = relationship("Project", foreign_keys=[project_id])
    match = relationship("Match", foreign_keys=[match_id])
    messages = relationship("Message", back_populates="room", cascade="all, delete-orphan")
    
    # Unique constraint: one chat room per user-project pair
    __table_args__ = (
        {"sqlite_autoincrement": True},
    )


class Message(Base):
    """
    Individual messages in a chat room.
    Supports text, files, and system messages.
    """
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("chat_rooms.id"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Message content
    message_type = Column(String, default="text")
    content = Column(Text, nullable=False)
    file_url = Column(String, nullable=True)
    file_name = Column(String, nullable=True)
    file_size = Column(Integer, nullable=True)
    
    # Metadata
    is_read = Column(Boolean, default=False)
    read_at = Column(DateTime(timezone=False), nullable=True)  # ✅ FIXED
    edited = Column(Boolean, default=False)
    deleted = Column(Boolean, default=False)
    
    created_at = Column(DateTime(timezone=False), server_default=func.now())  # ✅ FIXED
    updated_at = Column(DateTime(timezone=False), onupdate=func.now())  # ✅ FIXED
    
    # Relationships
    room = relationship("ChatRoom", back_populates="messages")
    sender = relationship("User", foreign_keys=[sender_id])


class Icebreaker(Base):
    """
    Pre-defined conversation starters to help users break the ice.
    """
    __tablename__ = "icebreakers"
    id = Column(Integer, primary_key=True, index=True)
    category = Column(String, nullable=False)
    template_text = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    usage_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=False), server_default=func.now())  # ✅ FIXED


class TypingIndicator(Base):
    """
    Temporary table to track who's typing in real-time.
    Entries auto-expire after a few seconds.
    """
    __tablename__ = "typing_indicators"
    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("chat_rooms.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    expires_at = Column(DateTime(timezone=False), nullable=False)  # ✅ FIXED
    created_at = Column(DateTime(timezone=False), server_default=func.now())  # ✅ FIXED
    
    room = relationship("ChatRoom")
    user = relationship("User")