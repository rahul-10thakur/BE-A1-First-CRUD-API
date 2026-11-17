# Task API — Docker + PostgreSQL

A Node.js + Express task-management API migrated from SQLite (A2) to PostgreSQL (A3). The database and API can run together with Docker Compose.

## Features

- PostgreSQL database in the official Docker image (`postgres:18`).
- Node.js API uses `pg` and parameterized PostgreSQL queries (`$1`, `$2`, …).
- `tasks` table is created automatically; three starter tasks are inserted only when the table is empty.
- All five CRUD endpoints retain their JSON response shapes and status codes.
- Docker volume persists rows across container recreation.
- Credentials are supplied through environment variables; `.env` is ignored by Git.
- Additional `/health`, `/stats`, `/reset`, search/filter and Swagger endpoints are retained.

## Requirements

- Docker Desktop with the WSL 2 backend (Windows) or Docker Engine + Compose plugin.
- Git (to clone the repository).

## Run the complete stack (recommended)

```bash
git clone https://github.com/rahul-10thakur/BE-A1-First-CRUD-API.git
cd BE-A1-First-CRUD-API
```

Create your local environment file from the example:

```bash
cp .env.example .env
```

On Windows PowerShell use:

```powershell
Copy-Item .env.example .env
```

Start the API and database:

```bash
docker compose up --build
```

- API: http://localhost:3000
- Swagger UI: http://localhost:3000/docs
- Health: http://localhost:3000/health
- PostgreSQL: `localhost:5432` (database `tasks`)

Stop the stack with `Ctrl+C`, then run `docker compose down`. The named volume remains. Start it again with `docker compose up` and the rows will still be present. To remove the database data as well, use `docker compose down -v` (destructive).

## Environment variables and secrets

| Variable | Purpose | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://postgres:dev@db:5432/tasks` inside Compose |
| `POSTGRES_PASSWORD` | Database password used by Compose | `dev` for local coursework only |
| `PORT` | API listening port | `3000` |

`.env` contains local values and must never be committed. `.env.example` contains the required keys and safe local placeholders. Change the sample password before using this setup outside local coursework.

## Database schema and seed rule

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE
);
```

On startup the API checks the row count and inserts `Buy groceries`, `Walk the dog`, and `Read a book` only if the table is empty. Restarting the API does not add duplicate seed rows.

## API endpoints

| Method | Endpoint | Description | Success |
|---|---|---|---|
| GET | `/tasks` | List tasks; optional `?done=true` and `?search=word` filters | 200 |
| GET | `/tasks/:id` | Get one task | 200 |
| POST | `/tasks` | Create a task | 201 |
| PUT | `/tasks/:id` | Update title and/or done | 200 |
| DELETE | `/tasks/:id` | Delete a task (empty response body) | 204 |
| GET | `/health` | Check API and database connection | 200 |
| GET | `/stats` | Return total, done and open counts | 200 |
| POST | `/reset` | Restore the three example tasks | 200 |

Invalid input returns `400`; unknown task IDs return `404`, with a JSON error message.

### Example requests

List tasks:

```bash
curl -i http://localhost:3000/tasks
```

Create a task:

```bash
curl -i -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Prepare assignment"}'
```

Update a task:

```bash
curl -i -X PUT http://localhost:3000/tasks/1 \
  -H "Content-Type: application/json" \
  -d '{"title":"Buy oat milk","done":true}'
```

Delete a task:

```bash
curl -i -X DELETE http://localhost:3000/tasks/1
```

### Verify persistence and inspect PostgreSQL

1. Create a task using `POST /tasks`.
2. Run `docker compose down` (do not add `-v`).
3. Run `docker compose up` again.
4. Call `GET /tasks`; the created row should remain.
5. Inspect the database:

```bash
docker compose exec db psql -U postgres -d tasks -c "\\dt"
docker compose exec db psql -U postgres -d tasks -c "SELECT * FROM tasks ORDER BY id;"
```

Capture a genuine terminal screenshot showing the `tasks` table and its rows, and save it as `screenshots/tasks-postgres.png` before submitting. Do not use a mock screenshot.

## Run locally without the API container (optional)

If PostgreSQL is already running on your machine at port 5432, create `.env` from `.env.example`, then:

```bash
npm install
npm start
```

For this local mode, `DATABASE_URL` should use `localhost`, for example `postgres://postgres:dev@localhost:5432/tasks`. Inside Compose the hostname is `db`, not `localhost`.

## Tests

The integration tests exercise seed data, CRUD status codes, validation and the database health endpoint. Set `TEST_DATABASE_URL` to a disposable PostgreSQL database before running them:

```powershell
$env:TEST_DATABASE_URL="postgres://postgres:dev@localhost:5432/tasks"
npm test
```

The test suite truncates and reseeds the `tasks` table in that test database. Do not point it at a database containing data you need to keep.

## Git commits

Commit after each completed assignment stage (Stages 0–5), using messages that accurately describe the work completed. The assignment requires at least six meaningful commits.

## Screenshot

Save the actual PostgreSQL inspection screenshot at `screenshots/tasks-postgres.png`. The repository's screenshot must show the real `tasks` table and rows from your running container.
