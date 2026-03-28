from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import and_, delete, or_, select
from sqlalchemy.orm import Session

from app.models.enums import AssignmentStateEnum, TaskStatusEnum
from app.models.task import Task
from app.models.task_eligible_user import TaskEligibleUser
from app.models.user import User
from app.services.cache_service import invalidate_task_caches, invalidate_user_caches
from app.services.task_service import adjust_user_active_task_count, is_active_task


@dataclass
class AssignmentResult:
    task_id: int
    previous_assignee_id: int | None
    new_assignee_id: int | None
    impacted_user_ids: set[int]
    eligible_user_count: int


def _eligible_user_filters(task: Task):
    filters = [User.is_active.is_(True)]
    if task.rule_department is not None:
        filters.append(User.department == task.rule_department)
    if task.rule_location is not None:
        filters.append(User.location == task.rule_location)
    if task.rule_min_experience_years is not None:
        filters.append(User.experience_years >= task.rule_min_experience_years)
    if task.rule_max_active_tasks is not None:
        filters.append(User.active_task_count < task.rule_max_active_tasks)
    return filters


def _eligible_users_query(task: Task):
    return (
        select(User)
        .where(*_eligible_user_filters(task))
        .order_by(User.active_task_count.asc(), User.experience_years.desc(), User.id.asc())
    )


def list_eligible_users(db: Session, task: Task, limit: int = 50, offset: int = 0) -> list[User]:
    return db.execute(_eligible_users_query(task).limit(limit).offset(offset)).scalars().all()


def _iter_eligible_user_ids(db: Session, task: Task, batch_size: int = 5000):
    last_user_id = 0
    filters = _eligible_user_filters(task)
    while True:
        user_ids = list(
            db.execute(
                select(User.id)
                .where(*filters, User.id > last_user_id)
                .order_by(User.id.asc())
                .limit(batch_size)
            )
            .scalars()
            .all()
        )
        if not user_ids:
            break
        yield user_ids
        last_user_id = user_ids[-1]


def recompute_task_assignment(db: Session, task_id: int, reason: str) -> AssignmentResult:
    task = db.execute(
        select(Task).where(Task.id == task_id).with_for_update()
    ).scalar_one_or_none()
    if not task:
        return AssignmentResult(
            task_id=task_id,
            previous_assignee_id=None,
            new_assignee_id=None,
            impacted_user_ids=set(),
            eligible_user_count=0,
        )

    previous_assignee_id = task.assigned_user_id
    impacted_user_ids: set[int] = set()

    if task.status == TaskStatusEnum.DONE:
        task.last_eligibility_recomputed_at = datetime.now(UTC)
        db.add(task)
        db.commit()
        invalidate_task_caches(task.id)
        if previous_assignee_id:
            invalidate_user_caches(previous_assignee_id)
        return AssignmentResult(
            task_id=task.id,
            previous_assignee_id=previous_assignee_id,
            new_assignee_id=previous_assignee_id,
            impacted_user_ids=set(),
            eligible_user_count=0,
        )

    selected_user = db.execute(_eligible_users_query(task).limit(1)).scalar_one_or_none()
    eligible_user_count = 0
    new_assignee_id = selected_user.id if selected_user else None

    db.execute(
        delete(TaskEligibleUser).where(TaskEligibleUser.task_id == task.id)
    )
    for user_ids in _iter_eligible_user_ids(db, task):
        eligible_user_count += len(user_ids)
        db.add_all([TaskEligibleUser(task_id=task.id, user_id=user_id) for user_id in user_ids])
        db.flush()

    if previous_assignee_id != new_assignee_id:
        if previous_assignee_id and is_active_task(task.status):
            adjust_user_active_task_count(db, previous_assignee_id, -1)
            impacted_user_ids.add(previous_assignee_id)
        if new_assignee_id and is_active_task(task.status):
            adjust_user_active_task_count(db, new_assignee_id, 1)
            impacted_user_ids.add(new_assignee_id)

    task.assigned_user_id = new_assignee_id
    task.last_eligibility_recomputed_at = datetime.now(UTC)
    if new_assignee_id is None:
        task.assignment_state = AssignmentStateEnum.NO_MATCH
        task.assignment_reason = "No eligible user matched the current rule set."
    else:
        task.assignment_state = AssignmentStateEnum.ASSIGNED
        task.assignment_reason = (
            f"Assigned automatically after {reason}. "
            "Tie-breaker: lowest active load, then highest experience, then smallest user id."
        )

    db.add(task)
    db.commit()

    invalidate_task_caches(task.id)
    if previous_assignee_id:
        invalidate_user_caches(previous_assignee_id)
    if new_assignee_id:
        invalidate_user_caches(new_assignee_id)

    return AssignmentResult(
        task_id=task.id,
        previous_assignee_id=previous_assignee_id,
        new_assignee_id=new_assignee_id,
        impacted_user_ids=impacted_user_ids,
        eligible_user_count=eligible_user_count,
    )


def find_candidate_task_ids_for_user(
    db: Session,
    user: User,
    batch_size: int = 1000,
    after_task_id: int = 0,
) -> list[int]:
    filters = [Task.status != TaskStatusEnum.DONE]
    static_match_clauses = [
        or_(Task.rule_department.is_(None), Task.rule_department == user.department),
        or_(Task.rule_location.is_(None), Task.rule_location == user.location),
        or_(Task.rule_min_experience_years.is_(None), Task.rule_min_experience_years <= user.experience_years),
    ]

    query = (
        select(Task.id)
        .where(
            and_(
                *filters,
                Task.id > after_task_id,
                or_(Task.assigned_user_id == user.id, and_(*static_match_clauses)),
            )
        )
        .order_by(Task.id.asc())
        .limit(batch_size)
    )
    return list(db.execute(query).scalars().all())
