# Indus Action Task Manager

A scalable task assignment system with rule-based automation.

## Features
- Dynamic task assignment based on user rules
- Real-time dashboard with analytics
- Admin panel for task and user management
- Asynchronous processing for performance

## Tech Stack
- Backend: FastAPI, PostgreSQL, Redis, Celery
- Frontend: React
- Deployment: Docker

## Quick Start
1. `docker-compose up --build`
2. Seed data: `docker-compose exec backend python -m app.db.seed --users 1000 --tasks 500`
3. Access: http://localhost:5173

## Credentials
- Admin: admin@indusaction.org / indusaction.org
- Manager: manager@indusaction.org / Nta9931@@
- Demo: info@indusaction.org / demo12345

## API
- Docs: http://localhost:8000/docs

## Architecture
- Event-driven assignment with background workers
- Precomputed eligible users for fast queries
- SQL-based rule filtering for efficiency
