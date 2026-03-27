from alembic import op
import sqlalchemy as sa


revision = "0002_task_eligible_users"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_eligible_users",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("task_id", sa.BigInteger(), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    )
    op.create_index("ix_task_eligible_users_task_id", "task_eligible_users", ["task_id"], unique=False)
    op.create_index("ix_task_eligible_users_user_id", "task_eligible_users", ["user_id"], unique=False)
    op.create_index("ix_task_eligible_users_task_user", "task_eligible_users", ["task_id", "user_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_task_eligible_users_task_user", table_name="task_eligible_users")
    op.drop_index("ix_task_eligible_users_user_id", table_name="task_eligible_users")
    op.drop_index("ix_task_eligible_users_task_id", table_name="task_eligible_users")
    op.drop_table("task_eligible_users")