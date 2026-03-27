from sqlalchemy import BigInteger, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class TaskEligibleUser(Base):
    __tablename__ = "task_eligible_users"
    __table_args__ = (
        Index("ix_task_eligible_users_task_id", "task_id"),
        Index("ix_task_eligible_users_user_id", "user_id"),
        Index("ix_task_eligible_users_task_user", "task_id", "user_id", unique=True),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )