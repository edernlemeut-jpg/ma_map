import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

async function request(app, path) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      http.get(`http://127.0.0.1:${port}${path}`, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          server.close();
          try {
            resolve({ status: res.statusCode, body: JSON.parse(body) });
          } catch (e) {
            reject(new Error(`Invalid JSON response: ${body}`));
          }
        });
      }).on('error', err => { server.close(); reject(err); });
    });
  });
}

describe('GET /api/health', () => {
  it('should return 200 with { data: { status: "ok" } }', async () => {
    const { createTestApp } = await import('../setup.js');
    const app = await createTestApp();
    const res = await request(app, '/api/health');

    assert.equal(res.status, 200);
    assert.deepStrictEqual(res.body, { data: { status: 'ok' } });
  });
});
