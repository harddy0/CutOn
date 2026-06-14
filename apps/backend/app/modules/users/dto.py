from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr


class CreateUserRequest(BaseModel):
    email: EmailStr
    first_name: str
    last_name: str
    password: str


class UpdateUserRequest(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    is_active: bool | None = None
    role: str | None = None


class UserResponse(BaseModel):
    id: str
    email: str
    first_name: str
    last_name: str
    role: str
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime] = None
