from alembic import op
import sqlalchemy as sa


revision = "0003_add_task_rules_table"
down_revision = "0002_task_eligible_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_rules",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("task_id", sa.BigInteger(), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("field", sa.String(length=64), nullable=False),
        sa.Column("operator", sa.String(length=16), nullable=False),
        sa.Column("value", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_task_rules_task_id", "task_rules", ["task_id"], unique=False)
    op.create_index("ix_task_rules_field_operator", "task_rules", ["field", "operator"], unique=False)

    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            """
            SELECT id, rule_department, rule_min_experience_years, rule_location, rule_max_active_tasks
            FROM tasks
            """
        )
    ).mappings()
    inserts = []
    for row in rows:
        if row["rule_department"] is not None:
            inserts.append({"task_id": row["id"], "field": "department", "operator": "=", "value": str(row["rule_department"])})
        if row["rule_min_experience_years"] is not None:
            inserts.append({"task_id": row["id"], "field": "experience", "operator": ">=", "value": str(row["rule_min_experience_years"])})
        if row["rule_location"] is not None:
            inserts.append({"task_id": row["id"], "field": "location", "operator": "=", "value": str(row["rule_location"])})
        if row["rule_max_active_tasks"] is not None:
            inserts.append({"task_id": row["id"], "field": "active_tasks", "operator": "<", "value": str(row["rule_max_active_tasks"])})

    if inserts:
        task_rules = sa.table(
            "task_rules",
            sa.column("task_id", sa.BigInteger()),
            sa.column("field", sa.String()),
            sa.column("operator", sa.String()),
            sa.column("value", sa.String()),
        )
        op.bulk_insert(task_rules, inserts)


def downgrade() -> None:
    op.drop_index("ix_task_rules_field_operator", table_name="task_rules")
    op.drop_index("ix_task_rules_task_id", table_name="task_rules")
    op.drop_table("task_rules")