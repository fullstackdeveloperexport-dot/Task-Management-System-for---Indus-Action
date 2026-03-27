# Task Management System

Scalable task management system with dynamic rule-based task assignment built with FastAPI, PostgreSQL, Redis, Celery, React, and Docker Compose.

## Architecture Overview

This system implements an event-driven, asynchronous task assignment engine designed for high performance and scalability.

### Core Components
- **Backend API**: FastAPI for low-latency API responses (<200ms)
- **Database**: PostgreSQL with optimized indexes for rule-based queries
- **Cache**: Redis for caching precomputed eligible tasks
- **Background Workers**: Celery for heavy computation (eligibility engine)
- **Frontend**: React dashboard for users and admins
- **Containerization**: Docker Compose for easy deployment

### Architecture Pattern: Event-Driven + Async Processing

```
Client → API → DB
         ↓
      Event Queue (Redis)
         ↓
      Worker (Celery)
         ↓
Eligibility Engine + Assignment
```

**Why this design?**
- APIs stay fast by offloading heavy logic to background workers
- System scales independently (API, workers, DB)
- Users get immediate feedback while processing happens async

## Database Design

### Tables

**users**
- `id`, `email`, `full_name`, `password_hash`, `role`, `department` (indexed), `experience_years` (indexed), `location` (indexed), `active_task_count` (indexed, denormalized), `is_active` (indexed)

**tasks**
- `id`, `title`, `status` (indexed), `priority`, `due_date` (indexed), `created_by_id`, `assigned_user_id`, `assignment_state`, `assignment_reason`
- Rule fields: `rule_department`, `rule_min_experience_years`, `rule_location`, `rule_max_active_tasks` (stored as structured data, not JSON)

**task_eligible_users** (precomputed)
- `task_id` (indexed), `user_id` (indexed), composite index `(task_id, user_id)`

**task_assignments** (for history, if needed)

### Performance Optimizations
- **Indexing**: users(department, experience_years), users(active_task_count), tasks(status, due_date)
- **Denormalization**: `active_task_count` avoids COUNT queries
- **Precomputation**: `task_eligible_users` table for fast eligible task queries

## Rule Engine

**DO NOT** loop through users in Python. **DO** convert rules to SQL queries.

Example:
```sql
SELECT id FROM users
WHERE department = 'Finance'
AND experience_years >= 4
AND active_task_count < 5;
```

This leverages PostgreSQL's query optimizer for fast filtering.

### Assignment Strategy
- Select least loaded user (lowest `active_task_count`)
- Tie-breakers: highest `experience_years`, then lowest `user.id`
- No eligible users? Mark as `UNASSIGNED` and retry later via worker

## Background Processing Strategy

Recompute triggers:
- **Task Creation**: Queue job to compute eligible users and assign
- **Rule Update**: Recompute only affected task
- **User Update**: Recompute tasks where user matches rule filters (department, experience threshold, etc.)

Optimization: Track rule filters to recompute only relevant tasks, not all.

## API Optimization

**GET /my-eligible-tasks** (hardest endpoint)

Flow:
1. Check Redis cache
2. Miss → Query `task_eligible_users` table
3. Cache result (TTL: 5-15 minutes)

**GET /my-assigned-tasks**
- Query `tasks` where `assigned_user_id = current_user.id`

## Caching Strategy

Redis keys:
- `user:{id}:eligible-tasks:{limit}:{offset}`
- `user:{id}:assigned-tasks:{limit}:{offset}`
- `task:{id}:eligible-users:{limit}:{offset}`

TTL: 5-15 minutes or event-based invalidation on changes.

## Trade-offs

- **Consistency vs Performance**: Precomputed eligible users may be stale, but fast. Recompute on changes.
- **Caching vs Freshness**: Short TTL balances speed and accuracy.

## Seed Data

Run with: `docker-compose exec backend python -m app.db.seed --users 1000 --tasks 500`

For 100k users: `--users 100000` (may take time due to recomputation).

## Running the System

```bash
docker-compose up --build
```

Access:
- Frontend: http://localhost:5173
- API Docs: http://localhost:8000/docs

## Common Mistakes Avoided

- ❌ Rule engine in Python loops
- ❌ No indexing on rule fields
- ❌ No caching on hot paths
- ❌ Synchronous assignment blocking API
- ❌ Recomputing all tasks on every change

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
