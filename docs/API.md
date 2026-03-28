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
  "email": "admin@indusaction.org",
  "password": "indusaction.org"
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

Task responses include both:

- compiled rule columns on the task record for fast reads
- `task_rules` as normalized rows with `field`, `operator`, and `value`

### `GET /tasks/`

Admin or manager list endpoint.

### `GET /tasks/{id}`

Task detail endpoint.

Example rule output fragment:

```json
{
  "rule_department": "finance",
  "rule_min_experience_years": 4,
  "rule_location": "Mumbai",
  "rule_max_active_tasks": 5,
  "task_rules": [
    {"field": "department", "operator": "=", "value": "finance"},
    {"field": "experience", "operator": ">=", "value": "4"},
    {"field": "location", "operator": "=", "value": "Mumbai"},
    {"field": "active_tasks", "operator": "<", "value": "5"}
  ]
}
```

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

Returns tasks where the current user is in the precomputed eligibility mapping.

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
