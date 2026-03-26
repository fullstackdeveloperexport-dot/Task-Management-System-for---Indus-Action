from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, DateTime, Enum, ForeignKey, Index, Integer, SmallInteger, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import AssignmentStateEnum, DepartmentEnum, PriorityEnum, TaskStatusEnum, enum_values

if TYPE_CHECKING:
    from app.models.user import User


class Task(TimestampMixin, Base):
    __tablename__ = "tasks"
    __table_args__ = (
        Index("ix_tasks_assigned_status_due", "assigned_user_id", "status", "due_date"),
        Index("ix_tasks_assignment_state_status", "assignment_state", "status"),
        Index(
            "ix_tasks_recompute_lookup",
            "status",
            "rule_department",
            "rule_location",
            "rule_min_experience_years",
            "assigned_user_id",
        ),
        Index(
            "ix_tasks_rule_compiled",
            "rule_department",
            "rule_location",
            "rule_min_experience_years",
            "rule_max_active_tasks",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[TaskStatusEnum] = mapped_column(
        Enum(TaskStatusEnum, name="task_status_enum", values_callable=enum_values),
        default=TaskStatusEnum.TODO,
        nullable=False,
        index=True,
    )
    priority: Mapped[PriorityEnum] = mapped_column(
        Enum(PriorityEnum, name="priority_enum", values_callable=enum_values),
        default=PriorityEnum.MEDIUM,
        nullable=False,
        index=True,
    )
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_by_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    assigned_user_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    assignment_state: Mapped[AssignmentStateEnum] = mapped_column(
        Enum(AssignmentStateEnum, name="assignment_state_enum", values_callable=enum_values),
        default=AssignmentStateEnum.PENDING,
        nullable=False,
    )
    assignment_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rule_department: Mapped[DepartmentEnum | None] = mapped_column(
        Enum(DepartmentEnum, name="department_enum", values_callable=enum_values),
        nullable=True,
    )
    rule_min_experience_years: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    rule_location: Mapped[str | None] = mapped_column(String(120), nullable=True)
    rule_max_active_tasks: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rules_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    last_eligibility_recomputed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    creator: Mapped["User"] = relationship(
        "User",
        back_populates="created_tasks",
        foreign_keys=[created_by_id],
    )
    assignee: Mapped["User | None"] = relationship(
        "User",
        back_populates="assigned_tasks",
        foreign_keys=[assigned_user_id],
    )
