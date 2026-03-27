from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import RequireRoles, get_current_user
from app.core.database import get_db
from app.models.enums import RoleEnum, TaskStatusEnum
from app.models.task import Task
from app.models.task_eligible_user import TaskEligibleUser
from app.models.user import User
from app.schemas.task import (
    EligibleUserRead,
    RecomputeEligibilityRequest,
    RecomputeEligibilityResponse,
    TaskCreate,
    TaskRead,
    TaskUpdate,
)
from app.services.assignment_service import list_eligible_users
from app.services.cache_service import (
    eligible_users_cache_key,
    get_cached_payload,
    invalidate_task_caches,
    invalidate_user_caches,
    my_assigned_tasks_cache_key,
    my_eligible_tasks_cache_key,
    set_cached_payload,
)
from app.services.task_service import apply_task_update, create_task, delete_task, get_task_or_404
from app.workers.assignment_tasks import (
    recompute_full_scan_job,
    recompute_task_assignment_job,
    recompute_tasks_for_user_job,
)


router = APIRouter()
standalone_router = APIRouter()


@router.get(
    "/my-eligible-tasks",
    response_model=list[TaskRead],
)
@standalone_router.get(
    "/my-eligible-tasks",
    response_model=list[TaskRead],
)
def get_my_eligible_tasks(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TaskRead]:
    cache_key = my_eligible_tasks_cache_key(current_user.id, limit, offset)
    cached = get_cached_payload(cache_key)
    if cached is not None:
        return [TaskRead.model_validate(item) for item in cached]

    tasks = (
        db.execute(
            select(Task)
            .join(TaskEligibleUser, TaskEligibleUser.task_id == Task.id)
            .where(TaskEligibleUser.user_id == current_user.id)
            .order_by(Task.due_date.asc().nullslast(), Task.priority.desc(), Task.id.desc())
            .limit(limit)
            .offset(offset)
        )
        .scalars()
        .all()
    )
    payload = [TaskRead.model_validate(task).model_dump(mode="json") for task in tasks]
    set_cached_payload(cache_key, payload)
    return [TaskRead.model_validate(item) for item in payload]


@router.get(
    "/my-assigned-tasks",
    response_model=list[TaskRead],
)
@standalone_router.get(
    "/my-assigned-tasks",
    response_model=list[TaskRead],
)
def get_my_assigned_tasks(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TaskRead]:
    cache_key = my_assigned_tasks_cache_key(current_user.id, limit, offset)
    cached = get_cached_payload(cache_key)
    if cached is not None:
        return [TaskRead.model_validate(item) for item in cached]

    tasks = (
        db.execute(
            select(Task)
            .where(Task.assigned_user_id == current_user.id)
            .order_by(Task.due_date.asc().nullslast(), Task.priority.desc(), Task.id.desc())
            .limit(limit)
            .offset(offset)
        )
        .scalars()
        .all()
    )
    payload = [TaskRead.model_validate(task).model_dump(mode="json") for task in tasks]
    set_cached_payload(cache_key, payload)
    return [TaskRead.model_validate(item) for item in payload]


@router.post(
    "/recompute-eligibility",
    response_model=RecomputeEligibilityResponse,
    dependencies=[Depends(RequireRoles(RoleEnum.ADMIN, RoleEnum.MANAGER))],
)
def recompute_eligibility(
    payload: RecomputeEligibilityRequest,
    _: User = Depends(RequireRoles(RoleEnum.ADMIN, RoleEnum.MANAGER)),
) -> RecomputeEligibilityResponse:
    if payload.task_id:
        recompute_task_assignment_job.delay(payload.task_id, "manual-recompute")
        return RecomputeEligibilityResponse(queued=True, message=f"Queued recompute for task {payload.task_id}")
    if payload.user_id:
        recompute_tasks_for_user_job.delay(payload.user_id, "manual-user-recompute")
        return RecomputeEligibilityResponse(queued=True, message=f"Queued recompute for user {payload.user_id}")
    if payload.full_scan:
        recompute_full_scan_job.delay()
        return RecomputeEligibilityResponse(queued=True, message="Queued full eligibility recompute")
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide task_id, user_id, or full_scan=true")


@router.post(
    "/",
    response_model=TaskRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RequireRoles(RoleEnum.ADMIN, RoleEnum.MANAGER))],
)
def create_task_endpoint(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(RequireRoles(RoleEnum.ADMIN, RoleEnum.MANAGER)),
) -> TaskRead:
    task = create_task(db, payload, creator_id=current_user.id)
    recompute_task_assignment_job.delay(task.id, "task-created")
    return TaskRead.model_validate(task)


@router.get(
    "/",
    response_model=list[TaskRead],
    dependencies=[Depends(RequireRoles(RoleEnum.ADMIN, RoleEnum.MANAGER))],
)
def list_tasks(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(RequireRoles(RoleEnum.ADMIN, RoleEnum.MANAGER)),
) -> list[TaskRead]:
    tasks = (
        db.execute(select(Task).order_by(Task.id.desc()).limit(limit).offset(offset))
        .scalars()
        .all()
    )
    return [TaskRead.model_validate(task) for task in tasks]


@router.get("/{task_id}", response_model=TaskRead)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TaskRead:
    task = get_task_or_404(db, task_id)
    if current_user.role == RoleEnum.USER and task.assigned_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    return TaskRead.model_validate(task)


@router.put("/{task_id}", response_model=TaskRead)
def update_task(
    task_id: int,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TaskRead:
    task = get_task_or_404(db, task_id)
    previous_status = task.status

    if current_user.role == RoleEnum.USER:
        disallowed_changes = any(
            field in payload.model_fields_set
            for field in ("title", "description", "priority", "due_date", "rules")
        )
        if task.assigned_user_id != current_user.id or disallowed_changes:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Users can only update status on assigned tasks")
    elif current_user.role not in {RoleEnum.ADMIN, RoleEnum.MANAGER}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    previous_assignee_id = task.assigned_user_id
    result = apply_task_update(db, task, payload)
    invalidate_task_caches(task_id)
    if previous_assignee_id:
        invalidate_user_caches(previous_assignee_id)

    if result.rules_changed:
        recompute_task_assignment_job.delay(task_id, "task-updated")

    for user_id in result.active_count_changed_user_ids:
        invalidate_user_caches(user_id)
        recompute_tasks_for_user_job.delay(user_id, "task-status-updated")

    if result.status_changed and previous_status == TaskStatusEnum.DONE and result.task.status != TaskStatusEnum.DONE:
        recompute_task_assignment_job.delay(task_id, "task-status-updated")

    return TaskRead.model_validate(result.task)


@router.delete(
    "/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RequireRoles(RoleEnum.ADMIN))],
)
def remove_task(
    task_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(RequireRoles(RoleEnum.ADMIN)),
) -> None:
    task = get_task_or_404(db, task_id)
    impacted_users = delete_task(db, task)
    invalidate_task_caches(task_id)
    for user_id in impacted_users:
        invalidate_user_caches(user_id)
        recompute_tasks_for_user_job.delay(user_id, "task-deleted")


@router.get(
    "/{task_id}/eligible-users",
    response_model=list[EligibleUserRead],
    dependencies=[Depends(RequireRoles(RoleEnum.ADMIN, RoleEnum.MANAGER))],
)
def get_eligible_users(
    task_id: int,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(RequireRoles(RoleEnum.ADMIN, RoleEnum.MANAGER)),
) -> list[EligibleUserRead]:
    cache_key = eligible_users_cache_key(task_id, limit, offset)
    cached = get_cached_payload(cache_key)
    if cached is not None:
        return [EligibleUserRead.model_validate(item) for item in cached]

    task = get_task_or_404(db, task_id)
    users = list_eligible_users(db, task, limit=limit, offset=offset)
    payload = [EligibleUserRead.model_validate(user).model_dump(mode="json") for user in users]
    set_cached_payload(cache_key, payload)
    return [EligibleUserRead.model_validate(item) for item in payload]
