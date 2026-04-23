import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, httpRequest } from '../setup.js';
import db from '../../src/database.js';

// Clean up test users before and after to ensure isolation
const TEST_PREFIX = '__test_auth_';

function cleanTestUsers() {
  db.prepare(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`).run();
}

describe('Auth routes — integration', () => {
  let app;

  before(async () => {
    cleanTestUsers();
    app = await createTestApp();
  });

  // --- REGISTER ---

  it('POST /api/auth/register — valid registration', async () => {
    const username = `${TEST_PREFIX}user1`;
    const res = await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/register',
      body: { username, password: 'password123' }
    });

    assert.equal(res.status, 201);
    assert.ok(res.body.data);
    assert.equal(res.body.data.username, username);
    assert.ok(res.body.data.message);
    // Should get a cookie
    assert.ok(res.cookies.length > 0);
    assert.ok(res.cookies[0].includes('token='));
    assert.ok(res.cookies[0].includes('HttpOnly'));
  });

  it('POST /api/auth/register — duplicate username returns 409', async () => {
    const username = `${TEST_PREFIX}dup`;
    // First registration
    await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/register',
      body: { username, password: 'password123' }
    });
    // Duplicate
    const res = await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/register',
      body: { username, password: 'password456' }
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'CONFLICT');
  });

  it('POST /api/auth/register — short username returns 400', async () => {
    const res = await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/register',
      body: { username: 'ab', password: 'password123' }
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('POST /api/auth/register — short password returns 400', async () => {
    const res = await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}shortpw`, password: 'short' }
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  // --- LOGIN ---

  it('POST /api/auth/login — valid credentials', async () => {
    const username = `${TEST_PREFIX}login1`;
    // Register first
    await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/register',
      body: { username, password: 'password123' }
    });
    // Login
    const res = await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/login',
      body: { username, password: 'password123' }
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.data);
    assert.equal(res.body.data.username, username);
    assert.ok(res.cookies.length > 0);
    assert.ok(res.cookies[0].includes('token='));
  });

  it('POST /api/auth/login — wrong password returns 401', async () => {
    const username = `${TEST_PREFIX}login2`;
    await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/register',
      body: { username, password: 'password123' }
    });
    const res = await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/login',
      body: { username, password: 'wrongpassword' }
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
    // Should NOT reveal whether user exists
    assert.ok(!res.body.error.message.includes('pseudo'));
    assert.ok(!res.body.error.message.includes('mot de passe'));
  });

  it('POST /api/auth/login — nonexistent user returns 401', async () => {
    const res = await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/login',
      body: { username: `${TEST_PREFIX}nonexistent`, password: 'password123' }
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
  });

  // --- LOGOUT ---

  it('POST /api/auth/logout — clears cookie', async () => {
    const username = `${TEST_PREFIX}logout1`;
    await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/register',
      body: { username, password: 'password123' }
    });
    const loginRes = await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/login',
      body: { username, password: 'password123' }
    });
    const cookie = loginRes.cookies[0]?.split(';')[0];

    const res = await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/logout',
      cookies: cookie
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.message);
    // Cookie should be cleared (expires in the past)
    const clearCookie = res.cookies.find(c => c.includes('token='));
    assert.ok(clearCookie);
  });

  // --- GET /me ---

  it('GET /api/auth/me — with valid cookie returns user data', async () => {
    const username = `${TEST_PREFIX}me1`;
    await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/register',
      body: { username, password: 'password123' }
    });
    const loginRes = await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/login',
      body: { username, password: 'password123' }
    });
    const cookie = loginRes.cookies[0]?.split(';')[0];

    const res = await httpRequest(app, {
      method: 'GET',
      path: '/api/auth/me',
      cookies: cookie
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.username, username);
    assert.ok('is_admin' in res.body.data);
    assert.ok('display_name' in res.body.data);
  });

  it('GET /api/auth/me — without cookie returns 401', async () => {
    const res = await httpRequest(app, {
      method: 'GET',
      path: '/api/auth/me'
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'AUTH_REQUIRED');
  });

  it('GET /api/auth/me — with invalid cookie returns 401', async () => {
    const res = await httpRequest(app, {
      method: 'GET',
      path: '/api/auth/me',
      cookies: 'token=invalid-jwt-value'
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'AUTH_REQUIRED');
  });

  // --- HEALTH (still works with auth middleware) ---

  it('GET /api/health — still accessible without auth (whitelisted)', async () => {
    const res = await httpRequest(app, {
      method: 'GET',
      path: '/api/health'
    });
    assert.equal(res.status, 200);
    assert.deepStrictEqual(res.body.data, { status: 'ok' });
  });

  // Cleanup
  after(() => {
    cleanTestUsers();
  });
});
