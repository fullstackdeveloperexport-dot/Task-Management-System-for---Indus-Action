from fastapi import APIRouter

from app.api.routes import auth, tasks, users


api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(tasks.standalone_router, tags=["tasks"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
