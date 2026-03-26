# Task Management System

Scalable task management system with dynamic rule-based task assignment built with FastAPI, PostgreSQL, Redis, Celery, React, and Docker Compose.

## Architecture Decisions

- FastAPI is used for the API layer and SQLAlchemy/Alembic handle persistence and migrations.
- PostgreSQL is the source of truth for users, tasks, and refresh tokens.
- Redis is used for cache keys on the hot read endpoints and as the Celery broker/result backend.
- Celery handles background eligibility recomputation so task create and update requests stay fast.
- Tasks are never manually assigned. The worker selects the assignee from eligible users.

## Where Records Are Saved

- User records: PostgreSQL `users` table
- Task records: PostgreSQL `tasks` table
- Refresh token records: PostgreSQL `refresh_tokens` table
- Eligible-user and my-task cached payloads: Redis

## Rule Engine Design

Each task stores compiled rule fields on the task row:

- `rule_department`
- `rule_min_experience_years`
- `rule_location`
- `rule_max_active_tasks`

Each user stores the assignment attributes used by the rule engine:

- `department`
- `experience_years`
- `location`
- `active_task_count`
- `is_active`

Assignment selection order:

1. Lowest `active_task_count`
2. Highest `experience_years`
3. Lowest `user.id`

If no user matches, the task remains unassigned with `assignment_state = "no_match"`.

## Recompute Strategy

- Task created: task row is saved, then Celery recomputes eligibility.
- Task updated: if rules change, Celery recomputes that task again.
- User profile updated: Celery scans only compatible tasks plus tasks already assigned to that user.
- Manual recompute: `POST /tasks/recompute-eligibility` queues task, user, or full-scan recomputation.

## Indexing Strategy

- `ix_users_eligibility_lookup (is_active, department, location, experience_years, active_task_count)`
- `ix_tasks_assigned_status_due (assigned_user_id, status, due_date)`
- `ix_tasks_rule_compiled (rule_department, rule_location, rule_min_experience_years, rule_max_active_tasks)`
- `ix_tasks_recompute_lookup (status, rule_department, rule_location, rule_min_experience_years, assigned_user_id)`
- `ix_tasks_assignment_state_status (assignment_state, status)`

## Caching Strategy

- `GET /my-eligible-tasks` uses Redis cache by user and pagination window.
- `GET /tasks/{id}/eligible-users` uses Redis cache by task and pagination window.
- Task change, assignment change, or user profile change invalidates the affected cache keys.

## Required APIs

- `POST /tasks/`
- `GET /tasks/{id}/eligible-users`
- `GET /my-eligible-tasks`
- `POST /tasks/recompute-eligibility`

Additional support endpoints are available for auth, user updates, task list/detail, task update, and task delete.

## Seed Data

Run after the stack is up:

```bash
docker compose exec backend python -m app.db.seed --users 200 --tasks 500
```

Seeded credentials:

- Admin: `admin@example.com` / `admin12345`
- Manager: `manager@example.com` / `manager12345`
- Sample user password: `user12345`

## Docker Run

```bash
docker compose up --build
```

Apps:

- Frontend: `http://localhost:5173`
- Swagger: `http://localhost:8000/docs`

## Migrations

```bash
cd backend
alembic upgrade head
```

## API Documentation

- [docs/API.md](docs/API.md)
