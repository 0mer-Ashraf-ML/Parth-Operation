"""
SQLAlchemy models for the AI Chat Assistant module.
Tracks persistent conversation threads, message logs, and tool calls.
"""

from uuid import uuid4
from sqlalchemy import Column, String, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, ENUM as PG_ENUM

from app.models.base import Base, TimestampMixin
from app.models.enums import MessageRole, ChatEntityType

class Conversation(Base, TimestampMixin):
    """
    A single persistent chat thread.
    Belongs to a specific user and can optionally be linked to a business entity
    (like a SalesOrder or Client) to provide immediate context.
    """
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    
    # Optional link to a specific entity
    entity_type: Mapped[ChatEntityType] = mapped_column(
        PG_ENUM(ChatEntityType, name="chat_entity_type", create_type=False),
        nullable=True
    )
    entity_id: Mapped[str] = mapped_column(String(50), nullable=True)

    # Relationships
    user = relationship("User", backref="conversations")
    messages = relationship("Message", back_populates="conversation", order_by="Message.created_at", cascade="all, delete-orphan")


class Message(Base, TimestampMixin):
    """
    A single message within a conversation thread.
    Can be from the user, the AI model, system, or tool execution returns.
    """
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[MessageRole] = mapped_column(
        PG_ENUM(MessageRole, name="message_role", create_type=False),
        nullable=False
    )
    content: Mapped[str] = mapped_column(String, nullable=False)

    # Optional JSON structure tracking which function was called by the LLM
    # E.g., {"name": "get_sales_orders", "arguments": {"status": "pending"}}
    tool_calls: Mapped[list[dict]] = mapped_column(JSON, nullable=True)
    
    # If the message is a tool response, we store the tool call ID here to link it
    tool_call_id: Mapped[str] = mapped_column(String(100), nullable=True)

    # Relationships
    conversation = relationship("Conversation", back_populates="messages")
