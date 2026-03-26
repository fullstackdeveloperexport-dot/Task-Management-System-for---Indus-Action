import logging

from sqlalchemy import select

from app.core.celery_app import celery_app
from app.core.database import SessionLocal
from app.models.task import Task
from app.models.user import User
from app.services.assignment_service import find_candidate_task_ids_for_user, recompute_task_assignment


logger = logging.getLogger(__name__)


@celery_app.task(name="assignment.recompute_task_assignment")
def recompute_task_assignment_job(task_id: int, reason: str = "task-change", depth: int = 0) -> None:
    db = SessionLocal()
    try:
        result = recompute_task_assignment(db, task_id, reason)
        if depth < 2:
            for user_id in result.impacted_user_ids:
                recompute_tasks_for_user_job.delay(user_id, f"cascade-from-task:{task_id}", depth + 1)
    finally:
        db.close()


@celery_app.task(name="assignment.recompute_tasks_for_user")
def recompute_tasks_for_user_job(user_id: int, reason: str = "user-change", depth: int = 0) -> None:
    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        if not user:
            return

        impacted_users: set[int] = set()
        last_task_id = 0
        while True:
            task_ids = find_candidate_task_ids_for_user(db, user, batch_size=1000, after_task_id=last_task_id)
            if not task_ids:
                break
            for task_id in task_ids:
                result = recompute_task_assignment(db, task_id, reason)
                impacted_users.update(result.impacted_user_ids)
            last_task_id = task_ids[-1]

        impacted_users.discard(user_id)
        if depth < 2:
            for impacted_user_id in impacted_users:
                recompute_tasks_for_user_job.delay(impacted_user_id, f"cascade-from-user:{user_id}", depth + 1)
    finally:
        db.close()


@celery_app.task(name="assignment.recompute_full_scan")
def recompute_full_scan_job(batch_size: int = 500) -> None:
    db = SessionLocal()
    try:
        last_task_id = 0
        while True:
            task_ids = (
                db.execute(
                    select(Task.id).where(Task.id > last_task_id).order_by(Task.id.asc()).limit(batch_size)
                )
                .scalars()
                .all()
            )
            if not task_ids:
                break
            for task_id in task_ids:
                recompute_task_assignment(db, task_id, "full-scan")
            last_task_id = task_ids[-1]
    finally:
        db.close()
