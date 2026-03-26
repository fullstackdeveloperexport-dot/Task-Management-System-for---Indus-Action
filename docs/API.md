# API Reference

Base URL: `http://localhost:8000/api/v1`

## Auth

### `POST /auth/signup`

```json
{
  "email": "user@example.com",
  "full_name": "Sample User",
  "password": "user12345",
  "department": "finance",
  "experience_years": 5,
  "location": "Mumbai"
}
```

### `POST /auth/login`

```json
{
  "email": "admin@example.com",
  "password": "admin12345"
}
```

### `POST /auth/refresh`

```json
{
  "refresh_token": "opaque-refresh-token"
}
```

## Users

### `GET /users/me`

Returns the authenticated user profile.

### `PUT /users/me`

Updates the current user profile. Changes to `department`, `experience_years`, or `location` queue eligibility recomputation.

### `PUT /users/{user_id}`

Admin or manager update path for role/profile changes.

## Tasks

### `POST /tasks/`

Create task with rules.

```json
{
  "title": "Quarterly compliance review",
  "description": "Review pending finance controls",
  "priority": "high",
  "due_date": "2026-03-30T12:00:00Z",
  "rules": {
    "department": "finance",
    "min_experience_years": 4,
    "location": "Mumbai",
    "max_active_tasks": 5
  }
}
```

### `GET /tasks/`

Admin or manager list endpoint.

### `GET /tasks/{id}`

Task detail endpoint.

### `PUT /tasks/{id}`

Update task metadata, status, or rules.

```json
{
  "title": "Quarterly compliance review",
  "description": "Updated scope",
  "priority": "urgent",
  "status": "in_progress",
  "due_date": "2026-04-02T12:00:00Z",
  "rules": {
    "department": "finance",
    "min_experience_years": 6,
    "location": "Mumbai",
    "max_active_tasks": 4
  }
}
```

### `DELETE /tasks/{id}`

Admin-only delete path.

### `GET /tasks/{id}/eligible-users`

Optimized eligible-user read with pagination.

### `GET /my-eligible-tasks`

Returns only tasks assigned to the current user by the rule engine.

### `GET /tasks/my-eligible-tasks`

Compatibility route for the same payload.

### `POST /tasks/recompute-eligibility`

Task-level recompute:

```json
{
  "task_id": 42
}
```

User-level recompute:

```json
{
  "user_id": 7
}
```

Full scan:

```json
{
  "full_scan": true
}
```

## Assignment Semantics

- Multiple eligible users: lowest `active_task_count`, then highest `experience_years`, then lowest `id`
- No eligible users: task stays unassigned with `assignment_state = "no_match"`
- User attribute change: background recomputation is queued automatically
- Task rule change: background recomputation is queued automatically
