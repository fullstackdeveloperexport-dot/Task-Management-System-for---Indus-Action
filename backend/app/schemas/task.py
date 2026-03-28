from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import AssignmentStateEnum, DepartmentEnum, PriorityEnum, TaskStatusEnum


class TaskRuleInput(BaseModel):
    department: DepartmentEnum | None = None
    min_experience_years: int | None = Field(default=None, ge=0, le=60)
    location: str | None = Field(default=None, min_length=2, max_length=120)
    max_active_tasks: int | None = Field(default=None, ge=1, le=1000)


class TaskRuleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    field: str
    operator: str
    value: str


class TaskCreate(BaseModel):
    title: str = Field(min_length=3, max_length=255)
    description: str | None = None
    priority: PriorityEnum = PriorityEnum.MEDIUM
    due_date: datetime | None = None
    rules: TaskRuleInput


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=255)
    description: str | None = None
    priority: PriorityEnum | None = None
    due_date: datetime | None = None
    status: TaskStatusEnum | None = None
    rules: TaskRuleInput | None = None


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    status: TaskStatusEnum
    priority: PriorityEnum
    due_date: datetime | None
    created_by_id: int
    assigned_user_id: int | None
    assignment_state: AssignmentStateEnum
    assignment_reason: str | None
    rule_department: DepartmentEnum | None
    rule_min_experience_years: int | None
    rule_location: str | None
    rule_max_active_tasks: int | None
    task_rules: list[TaskRuleRead]
    rules_version: int
    last_eligibility_recomputed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class EligibleUserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str
    department: DepartmentEnum
    experience_years: int
    location: str
    active_task_count: int


class RecomputeEligibilityRequest(BaseModel):
    task_id: int | None = None
    user_id: int | None = None
    full_scan: bool = False


class RecomputeEligibilityResponse(BaseModel):
    queued: bool
    message: str

