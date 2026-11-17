const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-api-test-'));
process.env.DB_PATH = path.join(tempDir, 'test.db');

const { app, db } = require('../index');
let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('database is created and seeds exactly three tasks once', async () => {
  const response = await fetch(`${baseUrl}/tasks`);
  assert.equal(response.status, 200);
  const tasks = await response.json();
  assert.equal(tasks.length, 3);
  assert.deepEqual(tasks.map((task) => task.title), ['Buy groceries', 'Walk the dog', 'Read a book']);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM tasks').get().count, 3);
});

test('full CRUD cycle and expected status codes', async () => {
  let response = await fetch(`${baseUrl}/tasks`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Prepare assignment' })
  });
  assert.equal(response.status, 201);
  const created = await response.json();
  assert.equal(created.title, 'Prepare assignment');
  assert.equal(created.done, false);

  response = await fetch(`${baseUrl}/tasks/${created.id}`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).id, created.id);

  response = await fetch(`${baseUrl}/tasks/${created.id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ done: true })
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).done, true);

  response = await fetch(`${baseUrl}/tasks?done=true`);
  assert.equal(response.status, 200);
  assert.ok((await response.json()).some((task) => task.id === created.id));

  response = await fetch(`${baseUrl}/tasks/${created.id}`, { method: 'DELETE' });
  assert.equal(response.status, 204);
  response = await fetch(`${baseUrl}/tasks/${created.id}`);
  assert.equal(response.status, 404);
});

test('validation returns 400 and unknown IDs return 404', async () => {
  let response = await fetch(`${baseUrl}/tasks`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: '   ' })
  });
  assert.equal(response.status, 400);
  response = await fetch(`${baseUrl}/tasks/99999`);
  assert.equal(response.status, 404);
  response = await fetch(`${baseUrl}/tasks?done=maybe`);
  assert.equal(response.status, 400);
});

test('data remains available from the SQLite file through a new connection', () => {
  const secondConnection = new Database(process.env.DB_PATH);
  try {
    assert.equal(secondConnection.prepare('SELECT COUNT(*) AS count FROM tasks').get().count, 3);
  } finally {
    secondConnection.close();
  }
});
