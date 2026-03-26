from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Boolean, Enum, Index, Integer, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import DepartmentEnum, RoleEnum, enum_values

if TYPE_CHECKING:
    from app.models.refresh_token import RefreshToken
    from app.models.task import Task


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        Index(
            "ix_users_eligibility_lookup",
            "is_active",
            "department",
            "location",
            "experience_years",
            "active_task_count",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[RoleEnum] = mapped_column(
        Enum(RoleEnum, name="role_enum", values_callable=enum_values),
        default=RoleEnum.USER,
        nullable=False,
        index=True,
    )
    department: Mapped[DepartmentEnum] = mapped_column(
        Enum(DepartmentEnum, name="department_enum", values_callable=enum_values),
        nullable=False,
        index=True,
    )
    experience_years: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False, index=True)
    location: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    active_task_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)

    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
        "RefreshToken",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    created_tasks: Mapped[list["Task"]] = relationship(
        "Task",
        back_populates="creator",
        foreign_keys="Task.created_by_id",
    )
    assigned_tasks: Mapped[list["Task"]] = relationship(
        "Task",
        back_populates="assignee",
        foreign_keys="Task.assigned_user_id",
    )
