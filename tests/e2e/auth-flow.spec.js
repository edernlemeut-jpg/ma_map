/**
 * E2E — Auth & Table flow
 *
 * Covers:
 *   - Registration via UI form → redirect to home
 *   - Login via UI form → redirect to home
 *   - Table creation via API → selector appears on home page
 *   - Player invitation (join via invite code)
 */
import { test, expect } from '@playwright/test';

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e5)}`;
}

// ---------------------------------------------------------------------------
// Auth UI
// ---------------------------------------------------------------------------

test.describe('Registration & Login UI', () => {
  test('register via UI form → redirects to home, user is logged in', async ({ page }) => {
    const username = unique('e2e-reg');

    await page.goto('/login.html');

    // Switch to register form
    await page.click('#show-register');
    await expect(page.locator('#register-form')).not.toHaveClass(/hidden/);

    // Fill and submit
    await page.fill('#register-username', username);
    await page.fill('#register-password', 'password123');
    await page.fill('#register-confirm', 'password123');
    await page.click('#register-form button[type="submit"]');

    // Success message appears
    await expect(page.locator('#message')).toContainText(/créé/i);

    // Auto-redirect to / after 1.5 s
    await page.waitForURL('/', { timeout: 8000 });

    // Auth header shows logged-in user
    await expect(page.locator('#auth-user-info')).not.toHaveClass(/hidden/);
    await expect(page.locator('#auth-user-name')).toContainText(username);
  });

  test('login via UI form → redirects to home, user is logged in', async ({ page }) => {
    const username = unique('e2e-login');

    // Create user via API first
    await page.request.post('/api/auth/register', {
      data: { username, password: 'password123' }
    });

    // Clear session so we can test the login flow
    await page.context().clearCookies();

    await page.goto('/login.html');
    await page.fill('#login-username', username);
    await page.fill('#login-password', 'password123');
    await page.click('#login-form button[type="submit"]');

    await page.waitForURL('/', { timeout: 8000 });
    await expect(page.locator('#auth-user-info')).not.toHaveClass(/hidden/);
    await expect(page.locator('#auth-user-name')).toContainText(username);
  });

  test('wrong password shows error, no redirect', async ({ page }) => {
    const username = unique('e2e-bad');
    await page.request.post('/api/auth/register', {
      data: { username, password: 'password123' }
    });
    await page.context().clearCookies();

    await page.goto('/login.html');
    await page.fill('#login-username', username);
    await page.fill('#login-password', 'wrongpassword');
    await page.click('#login-form button[type="submit"]');

    await expect(page.locator('#message')).toContainText(/.+/); // error message
    await expect(page).toHaveURL('/login.html');
  });
});

// ---------------------------------------------------------------------------
// Table creation & invitation
// ---------------------------------------------------------------------------

test.describe('Table creation & player invitation', () => {
  test('new user without table sees table selector on home page', async ({ page }) => {
    const username = unique('e2e-notbl');

    // Register — now logged in as this user, no tables
    await page.request.post('/api/auth/register', {
      data: { username, password: 'password123' }
    });

    // Navigate to home without any localStorage table
    await page.goto('/');

    // Table selector container should appear
    await expect(page.locator('#table-selector-container')).not.toHaveClass(/hidden/, { timeout: 10000 });
  });

  test('invited player joins table via invite code', async ({ page }) => {
    const mjName = unique('e2e-mj-inv');
    const playerName = unique('e2e-pl-inv');

    // MJ registers and creates a table
    await page.request.post('/api/auth/register', {
      data: { username: mjName, password: 'password123' }
    });
    const tableRes = await page.request.post('/api/game_tables', {
      data: { name: unique('e2e-inv-table') }
    });
    const table = (await tableRes.json()).data;
    const inviteCode = table.invite_code;
    const tableId = table.id;
    expect(inviteCode).toBeTruthy();

    // Player registers (overrides cookie to player's session)
    await page.request.post('/api/auth/register', {
      data: { username: playerName, password: 'password123' }
    });

    // Player joins the table
    const joinRes = await page.request.post(`/api/game_tables/${tableId}/join`, {
      data: { invite_code: inviteCode }
    });
    expect(joinRes.ok()).toBeTruthy();
    const joinData = (await joinRes.json()).data;
    expect(joinData.table_id).toBe(tableId);

    // Verify player sees the table in their list
    const listRes = await page.request.get('/api/game_tables');
    const tables = (await listRes.json()).data;
    expect(tables.some(t => t.id === tableId)).toBeTruthy();
  });

  test('logout clears session and redirects to login', async ({ page }) => {
    const username = unique('e2e-logout');
    await page.request.post('/api/auth/register', {
      data: { username, password: 'password123' }
    });

    await page.goto('/');
    // Wait for page to load and show user info
    await expect(page.locator('#auth-user-info')).not.toHaveClass(/hidden/, { timeout: 10000 });

    // Click logout
    await page.click('#auth-logout-btn');

    // Expect redirect to login
    await page.waitForURL('/login.html', { timeout: 8000 });
  });
});
