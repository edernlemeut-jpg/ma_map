import { defineConfig } from '@playwright/test';

const PORT = 3123;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  expect: {
    timeout: 10000
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: true,
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node server.js',
    url: `http://127.0.0.1:${PORT}/api/health`,
    timeout: 120000,
    reuseExistingServer: true,
    env: {
      PORT: String(PORT),
      JWT_SECRET: 'e2e-jwt-secret',
      DB_PATH: './db/ma.db',
      NODE_ENV: 'test'
    }
  }
});
