import Database from 'better-sqlite3';
import http from 'node:http';

/**
 * Creates an in-memory SQLite database with the same schema as production.
 * Used by unit and integration tests.
 */
export function createTestDb() {
  const db = Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

/**
 * Creates a test Express app with the same middleware pipeline.
 */
export async function createTestApp() {
  // Dynamic import to avoid loading .env in test context
  const express = (await import('express')).default;
  const { mountMiddleware, errorHandler } = await import('../src/middleware/index.js');
  const healthRoutes = (await import('../src/routes/health.js')).default;
  const authRoutes = (await import('../src/routes/auth.js')).default;
  const tablesRoutes = (await import('../src/routes/tables.js')).default;
  const syncRoutes = (await import('../src/routes/sync.js')).default;
  const visibilityRoutes = (await import('../src/routes/visibility.js')).default;
  const systemsRoutes = (await import('../src/routes/systems.js')).default;
  const factionsRoutes = (await import('../src/routes/factions.js')).default;
  const shipModelsRoutes = (await import('../src/routes/ship-models.js')).default;
  const searchRoutes = (await import('../src/routes/search.js')).default;
  const adminRoutes = (await import('../src/routes/admin.js')).default;
  const dashboardRoutes = (await import('../src/routes/dashboard.js')).default;
  const previewRoutes = (await import('../src/routes/preview.js')).default;
  const shipsRoutes = (await import('../src/routes/ships.js')).default;
  const travelRoutes = (await import('../src/routes/travel-routes.js')).default;

  const app = express();
  mountMiddleware(app);
  app.use('/api', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/game_tables', tablesRoutes);
  app.use('/api/sync', syncRoutes);
  app.use('/api/visibility', visibilityRoutes);
  app.use('/api/systems', systemsRoutes);
  app.use('/api/factions', factionsRoutes);
  app.use('/api/ship-models', shipModelsRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/preview', previewRoutes);
  app.use('/api/ships', shipsRoutes);
  app.use('/api/travel-routes', travelRoutes);
  app.use(errorHandler);
  return app;
}

/**
 * HTTP helper for integration tests — supports all methods, cookies, and JSON bodies.
 */
export function httpRequest(app, { method = 'GET', path, body, cookies, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;

      const options = {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: { ...headers }
      };

      if (body) {
        options.headers['Content-Type'] = 'application/json';
      }
      if (cookies) {
        options.headers['Cookie'] = cookies;
      }

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          server.close();
          const setCookies = res.headers['set-cookie'] || [];
          try {
            resolve({
              status: res.statusCode,
              body: data ? JSON.parse(data) : null,
              cookies: setCookies
            });
          } catch {
            resolve({ status: res.statusCode, body: data, cookies: setCookies });
          }
        });
      });
      req.on('error', err => { server.close(); reject(err); });
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  });
}
