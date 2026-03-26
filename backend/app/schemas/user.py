from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import DepartmentEnum, RoleEnum


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    full_name: str
    role: RoleEnum
    department: DepartmentEnum
    experience_years: int
    location: str
    active_task_count: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    department: DepartmentEnum | None = None
    experience_years: int | None = Field(default=None, ge=0, le=60)
    location: str | None = Field(default=None, min_length=2, max_length=120)


class AdminUserUpdate(UserUpdate):
    role: RoleEnum | None = None
    is_active: bool | None = None

