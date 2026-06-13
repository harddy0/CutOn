from datetime import datetime

from pydantic import BaseModel, EmailStr


class CreateUserRequest(BaseModel):
    email: EmailStr
    username: str
    password: str
    display_name: str | None = None


class UpdateUserRequest(BaseModel):
    email: EmailStr | None = None
    username: str | None = None
    display_name: str | None = None


class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    display_name: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
