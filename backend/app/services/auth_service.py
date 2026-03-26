from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    get_password_hash,
    hash_token,
    verify_password,
)
from app.models.enums import RoleEnum
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.schemas.auth import LoginRequest, SignupRequest, TokenPair


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.execute(select(User).where(User.email == email.lower())).scalar_one_or_none()


def register_user(db: Session, payload: SignupRequest) -> User:
    existing_user = get_user_by_email(db, payload.email)
    if existing_user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        email=payload.email.lower(),
        full_name=payload.full_name,
        password_hash=get_password_hash(payload.password),
        role=RoleEnum.USER,
        department=payload.department,
        experience_years=payload.experience_years,
        location=payload.location,
        active_task_count=0,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, payload: LoginRequest) -> User:
    user = get_user_by_email(db, payload.email)
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is inactive")
    return user


def revoke_refresh_token(db: Session, token_value: str) -> None:
    token = db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == hash_token(token_value))
    ).scalar_one_or_none()
    if token and token.revoked_at is None:
        token.revoked_at = datetime.now(UTC)
        db.add(token)
        db.commit()


def _create_refresh_token_record(db: Session, user: User) -> str:
    raw_token = generate_refresh_token()
    refresh_record = RefreshToken(
        user_id=user.id,
        token_hash=hash_token(raw_token),
        expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days),
    )
    db.add(refresh_record)
    db.commit()
    return raw_token


def issue_token_pair(db: Session, user: User) -> TokenPair:
    access_token = create_access_token(subject=str(user.id), role=user.role.value)
    refresh_token = _create_refresh_token_record(db, user)
    return TokenPair(access_token=access_token, refresh_token=refresh_token)


def rotate_refresh_token(db: Session, refresh_token: str) -> TokenPair:
    token_hash = hash_token(refresh_token)
    token_record = db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    ).scalar_one_or_none()

    if (
        not token_record
        or token_record.revoked_at is not None
        or token_record.expires_at <= datetime.now(UTC)
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token is invalid")

    token_record.revoked_at = datetime.now(UTC)
    token_record.last_used_at = datetime.now(UTC)
    user = token_record.user
    db.add(token_record)
    db.commit()
    return issue_token_pair(db, user)
