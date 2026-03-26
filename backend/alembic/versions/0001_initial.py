from alembic import op
import sqlalchemy as sa


revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


role_enum = sa.Enum("admin", "manager", "user", name="role_enum", create_type=False)
department_enum = sa.Enum("finance", "hr", "it", "operations", name="department_enum", create_type=False)
task_status_enum = sa.Enum("todo", "in_progress", "done", name="task_status_enum", create_type=False)
priority_enum = sa.Enum("low", "medium", "high", "urgent", name="priority_enum", create_type=False)
assignment_state_enum = sa.Enum("pending", "assigned", "no_match", name="assignment_state_enum", create_type=False)


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", role_enum, nullable=False),
        sa.Column("department", department_enum, nullable=False),
        sa.Column("experience_years", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("location", sa.String(length=120), nullable=False),
        sa.Column("active_task_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=False)
    op.create_index("ix_users_role", "users", ["role"], unique=False)
    op.create_index("ix_users_department", "users", ["department"], unique=False)
    op.create_index("ix_users_experience_years", "users", ["experience_years"], unique=False)
    op.create_index("ix_users_location", "users", ["location"], unique=False)
    op.create_index("ix_users_active_task_count", "users", ["active_task_count"], unique=False)
    op.create_index("ix_users_is_active", "users", ["is_active"], unique=False)
    op.create_index(
        "ix_users_eligibility_lookup",
        "users",
        ["is_active", "department", "location", "experience_years", "active_task_count"],
        unique=False,
    )

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("token_hash", name="uq_refresh_tokens_token_hash"),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"], unique=False)
    op.create_index("ix_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"], unique=False)
    op.create_index("ix_refresh_tokens_expires_at", "refresh_tokens", ["expires_at"], unique=False)
    op.create_index("ix_refresh_tokens_revoked_at", "refresh_tokens", ["revoked_at"], unique=False)

    op.create_table(
        "tasks",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", task_status_enum, nullable=False, server_default="todo"),
        sa.Column("priority", priority_enum, nullable=False, server_default="medium"),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("assigned_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("assignment_state", assignment_state_enum, nullable=False, server_default="pending"),
        sa.Column("assignment_reason", sa.String(length=255), nullable=True),
        sa.Column("rule_department", department_enum, nullable=True),
        sa.Column("rule_min_experience_years", sa.SmallInteger(), nullable=True),
        sa.Column("rule_location", sa.String(length=120), nullable=True),
        sa.Column("rule_max_active_tasks", sa.Integer(), nullable=True),
        sa.Column("rules_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("last_eligibility_recomputed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_tasks_title", "tasks", ["title"], unique=False)
    op.create_index("ix_tasks_status", "tasks", ["status"], unique=False)
    op.create_index("ix_tasks_priority", "tasks", ["priority"], unique=False)
    op.create_index("ix_tasks_due_date", "tasks", ["due_date"], unique=False)
    op.create_index("ix_tasks_created_by_id", "tasks", ["created_by_id"], unique=False)
    op.create_index("ix_tasks_assigned_user_id", "tasks", ["assigned_user_id"], unique=False)
    op.create_index("ix_tasks_assigned_status_due", "tasks", ["assigned_user_id", "status", "due_date"], unique=False)
    op.create_index("ix_tasks_assignment_state_status", "tasks", ["assignment_state", "status"], unique=False)
    op.create_index(
        "ix_tasks_recompute_lookup",
        "tasks",
        ["status", "rule_department", "rule_location", "rule_min_experience_years", "assigned_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_tasks_rule_compiled",
        "tasks",
        ["rule_department", "rule_location", "rule_min_experience_years", "rule_max_active_tasks"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_tasks_rule_compiled", table_name="tasks")
    op.drop_index("ix_tasks_recompute_lookup", table_name="tasks")
    op.drop_index("ix_tasks_assignment_state_status", table_name="tasks")
    op.drop_index("ix_tasks_assigned_status_due", table_name="tasks")
    op.drop_index("ix_tasks_assigned_user_id", table_name="tasks")
    op.drop_index("ix_tasks_created_by_id", table_name="tasks")
    op.drop_index("ix_tasks_due_date", table_name="tasks")
    op.drop_index("ix_tasks_priority", table_name="tasks")
    op.drop_index("ix_tasks_status", table_name="tasks")
    op.drop_index("ix_tasks_title", table_name="tasks")
    op.drop_table("tasks")

    op.drop_index("ix_refresh_tokens_revoked_at", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_expires_at", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_token_hash", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")

    op.drop_index("ix_users_eligibility_lookup", table_name="users")
    op.drop_index("ix_users_is_active", table_name="users")
    op.drop_index("ix_users_active_task_count", table_name="users")
    op.drop_index("ix_users_location", table_name="users")
    op.drop_index("ix_users_experience_years", table_name="users")
    op.drop_index("ix_users_department", table_name="users")
    op.drop_index("ix_users_role", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
