from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class CreateTopicRequest(BaseModel):
    name: str
    description: Optional[str] = None


class UpdateTopicRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class TopicResponse(BaseModel):
    id: str
    user_id: str
    name: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime
