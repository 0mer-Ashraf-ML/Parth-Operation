from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List, Any
from datetime import datetime
from app.models.enums import MessageRole, ChatEntityType

class MessageBase(BaseModel):
    role: MessageRole
    content: str
    tool_calls: Optional[List[dict[str, Any]]] = None
    tool_call_id: Optional[str] = None

class MessageCreate(MessageBase):
    pass

class MessageOut(MessageBase):
    id: str
    conversation_id: str
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class ConversationBase(BaseModel):
    title: str
    entity_type: Optional[ChatEntityType] = None
    entity_id: Optional[str] = None

class ConversationCreate(ConversationBase):
    pass

class ConversationOut(ConversationBase):
    id: str
    user_id: int
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class ChatPrompt(BaseModel):
    """Payload received from the frontend when a user sends a message"""
    content: str

class ChatResponseStream(BaseModel):
    """Structure for SSE chunks if needed, or structured chunk dictionary"""
    chunk: str
