from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import RequireRoles, get_current_user
from app.core.database import get_db
from app.models.enums import RoleEnum
from app.models.user import User
from app.schemas.user import AdminUserUpdate, UserRead, UserUpdate
from app.workers.assignment_tasks import recompute_tasks_for_user_job


router = APIRouter()


@router.get(
    "/",
    response_model=list[UserRead],
    dependencies=[Depends(RequireRoles(RoleEnum.ADMIN, RoleEnum.MANAGER))],
)
def list_users(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(RequireRoles(RoleEnum.ADMIN, RoleEnum.MANAGER)),
) -> list[UserRead]:
    users = (
        db.execute(select(User).order_by(User.active_task_count.asc(), User.id.asc()).limit(limit).offset(offset))
        .scalars()
        .all()
    )
    return [UserRead.model_validate(user) for user in users]


@router.get("/me", response_model=UserRead)
def get_me(current_user: User = Depends(get_current_user)) -> UserRead:
    return UserRead.model_validate(current_user)


@router.put("/me", response_model=UserRead)
def update_me(
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserRead:
    recompute_needed = False
    for field in ("full_name", "department", "experience_years", "location"):
        value = getattr(payload, field)
        if value is not None and getattr(current_user, field) != value:
            setattr(current_user, field, value)
            if field != "full_name":
                recompute_needed = True

    db.add(current_user)
    db.commit()
    db.refresh(current_user)

    if recompute_needed:
        recompute_tasks_for_user_job.delay(current_user.id, "user-profile-updated")

    return UserRead.model_validate(current_user)


@router.put(
    "/{user_id}",
    response_model=UserRead,
    dependencies=[Depends(RequireRoles(RoleEnum.ADMIN, RoleEnum.MANAGER))],
)
def admin_update_user(
    user_id: int,
    payload: AdminUserUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(RequireRoles(RoleEnum.ADMIN, RoleEnum.MANAGER)),
) -> UserRead:
    user = db.get(User, user_id)
    if not user:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    recompute_needed = False
    for field in ("full_name", "department", "experience_years", "location", "role", "is_active"):
        value = getattr(payload, field)
        if value is not None and getattr(user, field) != value:
            setattr(user, field, value)
            if field in {"department", "experience_years", "location", "is_active"}:
                recompute_needed = True

    db.add(user)
    db.commit()
    db.refresh(user)

    if recompute_needed:
        recompute_tasks_for_user_job.delay(user.id, "admin-user-update")

    return UserRead.model_validate(user)
