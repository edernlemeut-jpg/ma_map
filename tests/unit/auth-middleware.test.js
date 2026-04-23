import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Auth middleware', () => {
  let authMiddleware, requireAdmin;

  it('should skip auth for whitelisted routes', async () => {
    const mod = await import('../../src/middleware/auth.js');
    authMiddleware = mod.default;
    requireAdmin = mod.requireAdmin;

    const whitelistedRoutes = [
      { method: 'POST', path: '/api/auth/register' },
      { method: 'POST', path: '/api/auth/login' },
      { method: 'GET', path: '/api/health' },
    ];

    for (const route of whitelistedRoutes) {
      let nextCalled = false;
      const req = { method: route.method, path: route.path, cookies: {} };
      const res = {};
      authMiddleware(req, res, () => { nextCalled = true; });
      assert.ok(nextCalled, `next() should be called for ${route.method} ${route.path}`);
    }
  });

  it('should return 401 when no cookie present', async () => {
    const mod = await import('../../src/middleware/auth.js');
    authMiddleware = mod.default;

    let statusCode = null;
    let responseBody = null;

    const req = { method: 'GET', path: '/api/some-protected', cookies: {} };
    const res = {
      status(code) { statusCode = code; return this; },
      json(body) { responseBody = body; return this; }
    };

    authMiddleware(req, res, () => { assert.fail('next() should not be called'); });
    assert.equal(statusCode, 401);
    assert.equal(responseBody.error.code, 'AUTH_REQUIRED');
  });

  it('should return 401 when cookie has invalid token', async () => {
    const mod = await import('../../src/middleware/auth.js');
    authMiddleware = mod.default;

    let statusCode = null;
    let responseBody = null;

    const req = { method: 'GET', path: '/api/protected', cookies: { token: 'invalid' } };
    const res = {
      status(code) { statusCode = code; return this; },
      json(body) { responseBody = body; return this; }
    };

    authMiddleware(req, res, () => { assert.fail('next() should not be called'); });
    assert.equal(statusCode, 401);
  });

  it('requireAdmin should return 403 when user is not admin', async () => {
    const mod = await import('../../src/middleware/auth.js');
    requireAdmin = mod.requireAdmin;

    let statusCode = null;
    let responseBody = null;

    const req = { user: { id: 1, is_admin: false } };
    const res = {
      status(code) { statusCode = code; return this; },
      json(body) { responseBody = body; return this; }
    };

    requireAdmin(req, res, () => { assert.fail('next() should not be called'); });
    assert.equal(statusCode, 403);
    assert.equal(responseBody.error.code, 'FORBIDDEN');
  });

  it('requireAdmin should call next() when user is admin', async () => {
    const mod = await import('../../src/middleware/auth.js');
    requireAdmin = mod.requireAdmin;

    let nextCalled = false;
    const req = { user: { id: 1, is_admin: true } };
    const res = {};

    requireAdmin(req, res, () => { nextCalled = true; });
    assert.ok(nextCalled);
  });
});
