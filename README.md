# Indus Action Task Manager

Scalable task management system with dynamic rule-based task assignment.

## Problem Statement

Admin users create tasks with assignment rules instead of assigning tasks manually.
A background worker evaluates users against those rules, stores eligible matches, and assigns the best user automatically.
When user attributes or task rules change, the system recomputes eligibility again.

## Tech Stack

- Backend: FastAPI, SQLAlchemy, Alembic
- Database: PostgreSQL
- Cache and Queue: Redis
- Background Worker: Celery
- Authentication: JWT access token and refresh token rotation
- Frontend: React, Vite, Recharts
- Infrastructure: Docker, Docker Compose

## Quick Start

1. Start all services.

```bash
docker-compose up --build
```

2. Seed sample data.

```bash
docker-compose exec backend python -m app.db.seed --users 1000 --tasks 500
```

3. Open the application.

- Frontend: http://localhost:5173
- API Docs: http://localhost:8000/docs

## Default Credentials

- Admin: admin@indusaction.org / indusaction.org
- Manager: manager@indusaction.org / Nta9931@@
- Demo User: info@indusaction.org / demo12345

## User Model

Each user has the following attributes used in rule matching:

- Department
- Experience in years
- Location
- Current active task count
- Role

These values determine whether a user is eligible for a task.

## Task Model

Each task contains:

- Title
- Description
- Priority
- Due date
- Status: todo, in_progress, done
- Assignment rules
- Assignment state: pending, assigned, no_match

Supported rule fields:

- Department
- Minimum experience years
- Location
- Maximum active tasks

Example task rule:

- Department = Finance
- Experience >= 4
- Active Tasks < 5

## System Flow

### Step 1. Admin Creates Task

Admin creates a task with rule criteria.

Example:

- Task: Audit Review
- Rules:
	- Department = Finance
	- Experience >= 4
	- Active Tasks < 5

The API stores the task and queues background recomputation.

### Step 2. Background Worker Runs

Celery worker loads the task and evaluates user eligibility using SQL filters.

Logical flow:

```text
for each user:
	check rule match
	if match -> eligible
```

In the actual implementation, this is done with indexed database queries rather than Python loops, which is required for scale.

### Step 3. Eligible Users Are Found

Case A. One eligible user:

- Task is assigned directly to that user.

Case B. Multiple eligible users:

- System chooses the best user using deterministic tie-breaking:
	1. Lowest active_task_count
	2. Highest experience_years
	3. Lowest user id

Case C. No eligible users:

- Task remains unassigned
- assignment_state becomes no_match
- Worker can recompute later when data changes

## Recompute Logic

Eligibility is recomputed automatically when:

### 1. User Data Changes

Example:

- Experience changes from 3 to 5 years
- User may now satisfy tasks that previously did not match
- Background worker recomputes impacted tasks

### 2. Task Rules Change

Example:

- Experience rule changes from >= 4 to >= 2
- More users may become eligible
- Background worker recomputes task eligibility again

### 3. Manual Recompute Is Requested

Admin or manager can call the recompute API for:

- A single task
- A single user
- Full scan across tasks

## Data Model

### Users Table

```text
users
-----
id
email
full_name
department
experience_years
location
active_task_count
role
is_active
```

### Tasks Table

```text
tasks
-----
id
title
description
status
priority
due_date
assigned_user_id
assignment_state
assignment_reason
rule_department
rule_min_experience_years
rule_location
rule_max_active_tasks
```

These compiled rule columns are kept on the task row for indexed filtering and fast worker queries.

### Task Rules Table

```text
task_rules
----------
id
task_id
field
operator
value
```

Example rows:

- task_id = 10, field = department, operator = =, value = finance
- task_id = 10, field = experience, operator = >=, value = 4
- task_id = 10, field = active_tasks, operator = <, value = 5

This table stores the normalized rule definition required by the assignment, while the compiled rule columns on tasks are used for performance.

### Eligibility Mapping Table

```text
task_eligible_users
-------------------
task_id
user_id
```

This table stores precomputed task-user eligibility links for fast reads.

## API Endpoints

Required assignment APIs:

- POST /api/v1/tasks/
	Creates task with rules and queues background assignment.

- GET /api/v1/tasks/{id}/eligible-users
	Returns precomputed eligible users for a task.

- GET /api/v1/my-eligible-tasks
	Returns tasks where the current user is eligible.

- POST /api/v1/tasks/recompute-eligibility
	Triggers recomputation for task, user, or full scan.

Additional APIs:

- POST /api/v1/auth/signup
- POST /api/v1/auth/login
- POST /api/v1/auth/refresh
- GET /api/v1/users/me
- PUT /api/v1/users/me
- GET /api/v1/tasks/
- GET /api/v1/tasks/{id}
- PUT /api/v1/tasks/{id}
- DELETE /api/v1/tasks/{id}

See docs/API.md for request and response examples.

## Architecture

```text
React Frontend
			|
			v
FastAPI API
			|
			v
PostgreSQL
			|
			v
Redis Cache
			|
			v
Celery Worker
			|
			v
Rule Engine
```

### Why This Architecture

- Frontend provides task creation, login, and dashboard visibility
- FastAPI handles authentication, CRUD, and recompute triggers
- PostgreSQL stores users, tasks, tokens, and eligibility mappings
- Redis is used for caching and Celery broker/backend
- Celery workers run heavy recomputation outside request time
- Rule engine converts task rules into SQL filters

## Assignment Engine Design

The assignment engine follows this process:

1. Read task rules
2. Build SQL filters for eligible users
3. Query matching users with indexes
4. Sort by active load and experience
5. Assign top candidate
6. Store all eligible users in precomputed mapping table

This makes the read APIs fast and keeps assignment logic deterministic.

## Performance Design

Target system scale:

- 100K users
- 1M tasks
- Fast read APIs

Performance strategy:

- Background worker handles expensive recomputation
- Indexed columns avoid full-table scans where possible
- Redis caching reduces repeated reads
- Precomputed eligibility table speeds up task-user lookups
- Pagination protects heavy endpoints

## Indexing Strategy

Important indexes include:

- users eligibility lookup index across activity, department, location, experience
- task indexes for assignment state, status, due date, and rule fields
- unique task_eligible_users composite index on task_id and user_id

These indexes support fast filtering and fast joins for large datasets.

## Caching Strategy

Cached endpoints include:

- task eligible users
- current user eligible tasks
- current user assigned tasks

Cache is invalidated when:

- task rules change
- assignments change
- user attributes change
- recompute jobs complete

## Background Jobs

Worker jobs include:

- recompute one task
- recompute impacted tasks for one user
- recompute full scan

This keeps task creation and updates responsive while still supporting large-scale eligibility processing.

## Migrations

- 0001_initial creates base tables and indexes
- 0002_task_eligible_users adds precomputed eligibility mapping and indexes

## Seed Data

Seed script:

```bash
python -m app.db.seed
```

Supports configurable user and task volume and creates default admin, manager, and demo accounts.

## Summary

The core idea of the system is simple:

- Admin creates task with rules
- Worker checks eligible users
- System assigns automatically
- If user data changes, recompute again
- If task rules change, recompute again

This matches the assignment requirement for dynamic rule-based task assignment with scalable backend processing.
