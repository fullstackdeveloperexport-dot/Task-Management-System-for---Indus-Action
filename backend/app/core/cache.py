import json
import logging
from collections.abc import Iterable

from redis import Redis
from redis.exceptions import RedisError

from app.core.config import settings


logger = logging.getLogger(__name__)
redis_client = Redis.from_url(settings.redis_url, decode_responses=True)


def get_json(key: str):
    try:
        payload = redis_client.get(key)
    except RedisError as exc:
        logger.warning("Redis get failed for key %s: %s", key, exc)
        return None
    return json.loads(payload) if payload else None


def set_json(key: str, value, ttl: int | None = None) -> None:
    try:
        redis_client.set(key, json.dumps(value, default=str), ex=ttl or settings.cache_ttl_seconds)
    except RedisError as exc:
        logger.warning("Redis set failed for key %s: %s", key, exc)


def delete_key(key: str) -> None:
    try:
        redis_client.delete(key)
    except RedisError as exc:
        logger.warning("Redis delete failed for key %s: %s", key, exc)


def delete_pattern(pattern: str) -> None:
    try:
        keys = list(redis_client.scan_iter(match=pattern))
        if keys:
            redis_client.delete(*keys)
    except RedisError as exc:
        logger.warning("Redis delete pattern failed for %s: %s", pattern, exc)


def warm_many(items: Iterable[tuple[str, object, int | None]]) -> None:
    for key, value, ttl in items:
        set_json(key, value, ttl)

