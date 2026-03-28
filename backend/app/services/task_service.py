from dataclasses import dataclass

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, selectinload

from app.models.enums import AssignmentStateEnum, TaskStatusEnum
from app.models.task import Task
from app.models.task_rule import TaskRule
from app.models.user import User
from app.schemas.task import TaskCreate, TaskUpdate


ACTIVE_STATUSES = {TaskStatusEnum.TODO, TaskStatusEnum.IN_PROGRESS}


def is_active_task(status: TaskStatusEnum) -> bool:
    return status in ACTIVE_STATUSES


def adjust_user_active_task_count(db: Session, user_id: int, delta: int) -> None:
    if delta == 0:
        return
    db.execute(
        update(User)
        .where(User.id == user_id)
        .values(
            active_task_count=func.greatest(User.active_task_count + delta, 0),
            updated_at=func.now(),
        )
    )


def _serialize_task_rules(task: Task) -> list[TaskRule]:
    rule_specs: list[tuple[str, str, str]] = []
    if task.rule_department is not None:
        rule_specs.append(("department", "=", task.rule_department.value))
    if task.rule_min_experience_years is not None:
        rule_specs.append(("experience", ">=", str(task.rule_min_experience_years)))
    if task.rule_location is not None:
        rule_specs.append(("location", "=", task.rule_location))
    if task.rule_max_active_tasks is not None:
        rule_specs.append(("active_tasks", "<", str(task.rule_max_active_tasks)))
    return [
        TaskRule(task_id=task.id, field=field, operator=operator, value=value)
        for field, operator, value in rule_specs
    ]


def sync_task_rules(db: Session, task: Task) -> None:
    task.task_rules.clear()
    task.task_rules.extend(_serialize_task_rules(task))
    db.add(task)


def create_task(db: Session, payload: TaskCreate, creator_id: int) -> Task:
    task = Task(
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        due_date=payload.due_date,
        created_by_id=creator_id,
        assignment_state=AssignmentStateEnum.PENDING,
        assignment_reason="Task queued for background eligibility computation.",
        rule_department=payload.rules.department,
        rule_min_experience_years=payload.rules.min_experience_years,
        rule_location=payload.rules.location,
        rule_max_active_tasks=payload.rules.max_active_tasks,
    )
    db.add(task)
    db.flush()
    sync_task_rules(db, task)
    db.commit()
    db.refresh(task)
    return task


@dataclass
class TaskUpdateResult:
    task: Task
    rules_changed: bool
    status_changed: bool
    active_count_changed_user_ids: set[int]


def apply_task_update(db: Session, task: Task, payload: TaskUpdate) -> TaskUpdateResult:
    rules_changed = False
    status_changed = False
    active_count_changed_user_ids: set[int] = set()
    provided_fields = payload.model_fields_set

    if "title" in provided_fields:
        task.title = payload.title
    if "description" in provided_fields:
        task.description = payload.description
    if "priority" in provided_fields:
        task.priority = payload.priority
    if "due_date" in provided_fields:
        task.due_date = payload.due_date

    if "status" in provided_fields and payload.status is not None and payload.status != task.status:
        previous_active = is_active_task(task.status)
        next_active = is_active_task(payload.status)
        if task.assigned_user_id and previous_active != next_active:
            adjust_user_active_task_count(
                db,
                task.assigned_user_id,
                1 if next_active else -1,
            )
            active_count_changed_user_ids.add(task.assigned_user_id)
        task.status = payload.status
        status_changed = True

    if "rules" in provided_fields and payload.rules is not None:
        comparisons = {
            "rule_department": payload.rules.department,
            "rule_min_experience_years": payload.rules.min_experience_years,
            "rule_location": payload.rules.location,
            "rule_max_active_tasks": payload.rules.max_active_tasks,
        }
        for field_name, incoming_value in comparisons.items():
            if getattr(task, field_name) != incoming_value:
                setattr(task, field_name, incoming_value)
                rules_changed = True
        if rules_changed:
            task.rules_version += 1
            task.assignment_state = AssignmentStateEnum.PENDING
            task.assignment_reason = "Rule change queued for eligibility recomputation."

    if rules_changed:
        sync_task_rules(db, task)

    db.add(task)
    db.commit()
    db.refresh(task)
    return TaskUpdateResult(
        task=task,
        rules_changed=rules_changed,
        status_changed=status_changed,
        active_count_changed_user_ids=active_count_changed_user_ids,
    )


def delete_task(db: Session, task: Task) -> set[int]:
    impacted_user_ids: set[int] = set()
    if task.assigned_user_id and is_active_task(task.status):
        adjust_user_active_task_count(db, task.assigned_user_id, -1)
        impacted_user_ids.add(task.assigned_user_id)
    db.delete(task)
    db.commit()
    return impacted_user_ids


def get_task_or_404(db: Session, task_id: int) -> Task:
    task = db.execute(
        select(Task)
        .options(selectinload(Task.task_rules))
        .where(Task.id == task_id)
    ).scalar_one_or_none()
    if not task:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task
