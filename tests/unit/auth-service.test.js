import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Auth service — token functions', () => {
  let authService;

  it('should generate a valid JWT and verify it', async () => {
    authService = await import('../../src/services/auth.js');
    const user = { id: 42, is_admin: 1 };
    const token = authService.generateToken(user);
    assert.ok(token);
    assert.equal(typeof token, 'string');

    const payload = authService.verifyToken(token);
    assert.ok(payload);
    assert.equal(payload.sub, 42);
    assert.equal(payload.is_admin, true);
    assert.ok(payload.exp);
    assert.ok(payload.iat);
    // 7 day expiry
    assert.ok(payload.exp - payload.iat >= 6 * 24 * 3600);
  });

  it('should return null for invalid token', async () => {
    authService = await import('../../src/services/auth.js');
    const result = authService.verifyToken('not-a-real-jwt');
    assert.equal(result, null);
  });

  it('should return null for tampered token', async () => {
    authService = await import('../../src/services/auth.js');
    const token = authService.generateToken({ id: 1, is_admin: false });
    // Tamper with payload
    const tampered = token.slice(0, -5) + 'XXXXX';
    const result = authService.verifyToken(tampered);
    assert.equal(result, null);
  });

  it('is_admin should be boolean in token payload', async () => {
    authService = await import('../../src/services/auth.js');
    // SQLite stores is_admin as integer
    const token1 = authService.generateToken({ id: 1, is_admin: 1 });
    const p1 = authService.verifyToken(token1);
    assert.equal(p1.is_admin, true);
    assert.equal(typeof p1.is_admin, 'boolean');

    const token0 = authService.generateToken({ id: 2, is_admin: 0 });
    const p0 = authService.verifyToken(token0);
    assert.equal(p0.is_admin, false);
    assert.equal(typeof p0.is_admin, 'boolean');
  });

  it('register should reject empty username', async () => {
    authService = await import('../../src/services/auth.js');
    const result = authService.register('', 'password123');
    assert.equal(result.error.code, 'VALIDATION_ERROR');
    assert.equal(result.error.status, 400);
  });

  it('register should reject short username', async () => {
    authService = await import('../../src/services/auth.js');
    const result = authService.register('ab', 'password123');
    assert.equal(result.error.code, 'VALIDATION_ERROR');
  });

  it('register should reject long username', async () => {
    authService = await import('../../src/services/auth.js');
    const result = authService.register('a'.repeat(31), 'password123');
    assert.equal(result.error.code, 'VALIDATION_ERROR');
  });

  it('register should reject short password', async () => {
    authService = await import('../../src/services/auth.js');
    const result = authService.register('validuser', 'short');
    assert.equal(result.error.code, 'VALIDATION_ERROR');
  });
});
