// Task API — SQLite-backed CRUD server

const express = require('express');
const Database = require('better-sqlite3');
const swaggerUi = require('swagger-ui-express');
const path = require('node:path');
const openapi = require('./openapi.json');

const app = express();
const port = Number(process.env.PORT || 3000);
const databasePath = process.env.DB_PATH || path.join(__dirname, 'tasks.db');

app.use(express.json());

// ============================================================
// Stage 0 — SQLite database
// ============================================================

const db = new Database(databasePath);

db.prepare(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0
  )
`).run();

// Seed only when database is empty
const count = db.prepare(
  'SELECT COUNT(*) AS count FROM tasks'
).get();

if (count.count === 0) {
  // A transaction ensures all three seed tasks are inserted together.
  const seedTasks = db.transaction(() => {
    const insert = db.prepare(
      'INSERT INTO tasks (title, done) VALUES (?, ?)'
    );
    insert.run('Buy groceries', 0);
    insert.run('Walk the dog', 1);
    insert.run('Read a book', 0);
  });
  seedTasks();
}

// Convert SQLite 0/1 into JSON false/true
function formatTask(task) {
  if (!task) return null;

  return {
    ...task,
    done: Boolean(task.done),
  };
}

// ============================================================
// Swagger
// ============================================================

app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

// ============================================================
// Home + health
// ============================================================

app.get('/', (req, res) => {
  res.json({
    name: 'Task API',
    version: '2.0',
    storage: 'SQLite',
    endpoints: ['/tasks', '/stats', '/reset'],
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ============================================================
// Stage 1 — READ all tasks
// ============================================================

app.get('/tasks', (req, res) => {
  let sql = 'SELECT * FROM tasks';
  const conditions = [];
  const params = [];

  // Optional filter: /tasks?done=true
  if (req.query.done !== undefined) {
    if (req.query.done !== 'true' && req.query.done !== 'false') {
      return res
        .status(400)
        .json({ error: 'done must be true or false' });
    }

    conditions.push('done = ?');
    params.push(req.query.done === 'true' ? 1 : 0);
  }

  // Optional search: /tasks?search=milk
  if (req.query.search !== undefined) {
    const word = String(req.query.search).trim();

    if (word === '') {
      return res
        .status(400)
        .json({ error: 'search must not be empty' });
    }

    conditions.push('title LIKE ?');
    params.push(`%${word}%`);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  const tasks = db.prepare(sql).all(...params);

  res.json(tasks.map(formatTask));
});

// ============================================================
// Extras — Stats
// ============================================================

app.get('/stats', (req, res) => {
  const total = db.prepare(
    'SELECT COUNT(*) AS count FROM tasks'
  ).get().count;

  const done = db.prepare(
    'SELECT COUNT(*) AS count FROM tasks WHERE done = ?'
  ).get(1).count;

  res.json({
    total,
    done,
    open: total - done,
  });
});

// ============================================================
// Reset database to original 3 tasks
// ============================================================

app.post('/reset', (req, res) => {
  const resetTasks = db.transaction(() => {
    db.prepare('DELETE FROM tasks').run();
    const insert = db.prepare(
      'INSERT INTO tasks (title, done) VALUES (?, ?)'
    );
    insert.run('Buy groceries', 0);
    insert.run('Walk the dog', 1);
    insert.run('Read a book', 0);
  });
  resetTasks();
  const tasks = db.prepare('SELECT * FROM tasks').all();

  res.json(tasks.map(formatTask));
});

// ============================================================
// Stage 2 — CREATE task
// ============================================================

app.post('/tasks', (req, res) => {
  const { title } = req.body ?? {};

  if (
    title === undefined ||
    title === null ||
    String(title).trim() === ''
  ) {
    return res.status(400).json({
      error: 'title is required and cannot be empty',
    });
  }

  const cleanTitle = String(title).trim();

  const result = db.prepare(
    'INSERT INTO tasks (title, done) VALUES (?, ?)'
  ).run(cleanTitle, 0);

  const task = db.prepare(
    'SELECT * FROM tasks WHERE id = ?'
  ).get(result.lastInsertRowid);

  res.status(201).json(formatTask(task));
});

// ============================================================
// Stage 1 — READ one task
// ============================================================

app.get('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);

  const task = db.prepare(
    'SELECT * FROM tasks WHERE id = ?'
  ).get(id);

  if (!task) {
    return res.status(404).json({
      error: `Task ${id} not found`,
    });
  }

  res.json(formatTask(task));
});

// ============================================================
// Stage 3 — UPDATE task
// ============================================================

app.put('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);

  const existingTask = db.prepare(
    'SELECT * FROM tasks WHERE id = ?'
  ).get(id);

  if (!existingTask) {
    return res.status(404).json({
      error: `Task ${id} not found`,
    });
  }

  const body = req.body ?? {};

  const hasTitle =
    Object.prototype.hasOwnProperty.call(body, 'title');

  const hasDone =
    Object.prototype.hasOwnProperty.call(body, 'done');

  if (!hasTitle && !hasDone) {
    return res.status(400).json({
      error: 'request body must include title and/or done',
    });
  }

  let newTitle = existingTask.title;
  let newDone = existingTask.done;

  if (hasTitle) {
    if (
      body.title === null ||
      String(body.title).trim() === ''
    ) {
      return res.status(400).json({
        error: 'title cannot be empty',
      });
    }

    newTitle = String(body.title).trim();
  }

  if (hasDone) {
    if (typeof body.done !== 'boolean') {
      return res.status(400).json({
        error: 'done must be a boolean',
      });
    }

    newDone = body.done ? 1 : 0;
  }

  db.prepare(`
    UPDATE tasks
    SET title = ?, done = ?
    WHERE id = ?
  `).run(newTitle, newDone, id);

  const updatedTask = db.prepare(
    'SELECT * FROM tasks WHERE id = ?'
  ).get(id);

  res.json(formatTask(updatedTask));
});

// ============================================================
// Stage 3 — DELETE task
// ============================================================

app.delete('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);

  const result = db.prepare(
    'DELETE FROM tasks WHERE id = ?'
  ).run(id);

  if (result.changes === 0) {
    return res.status(404).json({
      error: `Task ${id} not found`,
    });
  }

  res.status(204).send();
});

// ============================================================
// Start server
// ============================================================

if (require.main === module) {
  app.listen(port, () => {
    console.log(`CRUD API listening on port ${port}`);
    console.log(`SQLite database: ${databasePath}`);
    console.log(`Swagger UI: http://localhost:${port}/docs`);
  });
}

module.exports = { app, db };