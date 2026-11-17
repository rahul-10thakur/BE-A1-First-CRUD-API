const test = require('node:test');
const assert = require('node:assert/strict');

const databaseUrl = process.env.TEST_DATABASE_URL;
test('PostgreSQL CRUD API integration', { skip: !databaseUrl && 'Set TEST_DATABASE_URL to run PostgreSQL integration tests' }, async () => {
  process.env.DATABASE_URL = databaseUrl;
  const { app, pool, initializeDatabase } = require('../index');
  let server;
  try {
    await initializeDatabase();
    // This test database is disposable: start from a predictable three-row fixture.
    await pool.query('TRUNCATE TABLE tasks RESTART IDENTITY');
    await pool.query(
      'INSERT INTO tasks (title, done) VALUES ($1, $2), ($3, $4), ($5, $6)',
      ['Buy groceries', false, 'Walk the dog', true, 'Read a book', false]
    );
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    let response = await fetch(`${baseUrl}/tasks`);
    assert.equal(response.status, 200);
    const tasks = await response.json();
    assert.equal(tasks.length, 3);
    assert.deepEqual(tasks.map((task) => task.title), ['Buy groceries', 'Walk the dog', 'Read a book']);

    response = await fetch(`${baseUrl}/tasks`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Prepare assignment' })
    });
    assert.equal(response.status, 201);
    const created = await response.json();

    response = await fetch(`${baseUrl}/tasks/${created.id}`);
    assert.equal(response.status, 200);

    response = await fetch(`${baseUrl}/tasks/${created.id}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ done: true })
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).done, true);

    response = await fetch(`${baseUrl}/tasks/${created.id}`, { method: 'DELETE' });
    assert.equal(response.status, 204);
    response = await fetch(`${baseUrl}/tasks/${created.id}`);
    assert.equal(response.status, 404);

    response = await fetch(`${baseUrl}/tasks`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '  ' })
    });
    assert.equal(response.status, 400);
    response = await fetch(`${baseUrl}/health`);
    assert.deepEqual(await response.json(), { status: 'ok', db: 'ok' });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});
