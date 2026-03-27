from app.core.cache import delete_pattern, get_json, set_json


def eligible_users_cache_key(task_id: int, limit: int, offset: int) -> str:
    return f"task:{task_id}:eligible-users:{limit}:{offset}"


def my_eligible_tasks_cache_key(user_id: int, limit: int, offset: int) -> str:
    return f"user:{user_id}:my-eligible-tasks:{limit}:{offset}"


def my_assigned_tasks_cache_key(user_id: int, limit: int, offset: int) -> str:
    return f"user:{user_id}:my-assigned-tasks:{limit}:{offset}"


def get_cached_payload(key: str):
    return get_json(key)


def set_cached_payload(key: str, value, ttl: int | None = None) -> None:
    set_json(key, value, ttl)


def invalidate_task_caches(task_id: int) -> None:
    delete_pattern(f"task:{task_id}:eligible-users:*")


def invalidate_user_caches(user_id: int) -> None:
    delete_pattern(f"user:{user_id}:my-eligible-tasks:*")
    delete_pattern(f"user:{user_id}:my-assigned-tasks:*")

