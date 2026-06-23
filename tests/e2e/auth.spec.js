/**
 * Phase 14 - Criterion 1: E2E Auth and Routing Validation
 *
 * Tests AUTH-01 through AUTH-11:
 * - Available roles (admin, staff) can log in and reach role-specific dashboards
 * - Unauthorized route access is blocked
 * - Unauthenticated access redirects to /login
 * - Logout destroys session
 * - Invalid credentials show error
 * - No race conditions (loading screen resolves cleanly)
 */

import { test, expect } from '@playwright/test';
import { TEST_USERS } from '../support/localTestUsers.js';
import { ensureLoggedOut } from './support/auth.js';

const USERS = TEST_USERS;

async function loginAs(page, identifier, password, route = '/login') {
  await page.goto(route);
  await page.waitForSelector('#login-email', { state: 'visible', timeout: 10000 });
  await page.fill('#login-email', identifier);
  await page.fill('#login-password', password);
  await page.click('#login-submit');
}

async function loginAndWait(page, identifier, password, route = '/login') {
  await loginAs(page, identifier, password, route);
  await page.waitForURL('**/dashboard', { timeout: 25000 });
}

test.describe('Criterion 1: Auth & Routing', () => {
  test.beforeEach(async ({ page }) => {
    await ensureLoggedOut(page);
  });

  test('AUTH-01: Admin can log in and sees admin dashboard', async ({ page }) => {
    await loginAndWait(page, USERS.admin.email, USERS.admin.password);

    await expect(page).toHaveURL(/.*\/dashboard/);

    const heading = page.locator('text=Welcome back');
    await expect(heading.first()).toBeVisible({ timeout: 10000 });

    const sidebar = page.locator('aside');
    await expect(sidebar.locator('a', { hasText: 'Manage Users' })).toBeVisible();
    await expect(sidebar.locator('a', { hasText: 'Activity Logs' })).toBeVisible();
    await expect(sidebar.locator('a', { hasText: 'Reports' })).toBeVisible();
    await expect(sidebar.locator('a', { hasText: 'Commissions' })).toBeVisible();
  });

  test('AUTH-02: Staff can log in and sees staff dashboard', async ({ page }) => {
    await loginAndWait(page, USERS.staff.email, USERS.staff.password);

    await expect(page).toHaveURL(/.*\/dashboard/);

    const sidebar = page.locator('aside');
    await expect(sidebar.locator('a', { hasText: 'Customers' })).toBeVisible();
    await expect(sidebar.locator('a', { hasText: 'Transactions' })).toBeVisible();
    await expect(sidebar.locator('a', { hasText: 'Manage Users' })).not.toBeVisible();
    await expect(sidebar.locator('a', { hasText: 'Activity Logs' })).not.toBeVisible();
  });

  test('AUTH-03: Invalid credentials show error on login page', async ({ page }) => {
    await loginAs(page, 'bad@email.com', 'wrongpassword');

    await page.waitForTimeout(4000);
    await expect(page).toHaveURL(/.*\/login/);

    const errorText = page.locator('text=/Invalid|No account|failed/i');
    await expect(errorText.first()).toBeVisible({ timeout: 5000 });
  });

  test('AUTH-04: Empty form submission shows validation messages', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('#login-submit', { state: 'visible', timeout: 10000 });

    await page.click('#login-submit');

    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/.*\/login/);
    await expect(page.locator('text=Email, username, or phone is required')).toBeVisible();
    await expect(page.locator('text=Password is required')).toBeVisible();
  });

  test('AUTH-04A: Password visibility toggle works on login', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('#login-password', { state: 'visible', timeout: 10000 });

    const passwordInput = page.locator('#login-password');
    const showToggle = page.locator('button[aria-label="Show password"]');

    await expect(passwordInput).toHaveAttribute('type', 'password');
    await expect(showToggle).toHaveAttribute('aria-pressed', 'false');

    await showToggle.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    const hideToggle = page.locator('button[aria-label="Hide password"]');
    await expect(hideToggle).toHaveAttribute('aria-pressed', 'true');

    await hideToggle.click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('AUTH-04B: Unknown login identifier shows invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('#login-email', { state: 'visible', timeout: 10000 });

    await page.fill('#login-email', 'not-an-email');
    await page.fill('#login-password', USERS.staff.password);
    await page.click('#login-submit');

    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/.*\/login/);
    await expect(page.locator('text=Invalid login credentials.')).toBeVisible();
  });

  test('AUTH-04C: Forgot password route redirects back to login', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.waitForURL('**/login', { timeout: 10000 });
    await expect(page).toHaveURL(/.*\/login/);
  });


  test('AUTH-05: Unauthenticated user is redirected to /login', async ({ page }) => {
    await page.goto('/dashboard');

    await page.waitForURL('**/login', { timeout: 20000 });
    await expect(page).toHaveURL(/.*\/login/);
  });

  test('AUTH-06: Unauthenticated user on /users redirects to /login', async ({ page }) => {
    await page.goto('/users');

    await page.waitForURL('**/login', { timeout: 20000 });
    await expect(page).toHaveURL(/.*\/login/);
  });

  test('AUTH-07: Staff accessing /users is redirected to /dashboard', async ({ page }) => {
    await loginAndWait(page, USERS.staff.email, USERS.staff.password);

    await page.goto('/users');

    await page.waitForURL('**/dashboard', { timeout: 15000 });
    await expect(page).toHaveURL(/.*\/dashboard/);
  });

  test('AUTH-08: Staff accessing /activity is redirected to /dashboard', async ({ page }) => {
    await loginAndWait(page, USERS.staff.email, USERS.staff.password);

    await page.goto('/activity');

    await page.waitForURL('**/dashboard', { timeout: 15000 });
    await expect(page).toHaveURL(/.*\/dashboard/);
  });

  test('AUTH-09: Logout redirects to /login and destroys session', async ({ page }) => {
    await loginAndWait(page, USERS.admin.email, USERS.admin.password);
    await expect(page).toHaveURL(/.*\/dashboard/);

    const signOutBtn = page.locator('button', { hasText: /sign out/i });
    await expect(signOutBtn).toBeVisible({ timeout: 5000 });
    await signOutBtn.click();

    await expect(page.getByText(/are you sure you want to sign out/i)).toBeVisible();
    await page.locator('.btn-danger', { hasText: /^sign out$/i }).click();

    await page.waitForURL('**/login', { timeout: 15000 });
    await expect(page).toHaveURL(/.*\/login/);

    await page.goto('/dashboard');
    await page.waitForURL('**/login', { timeout: 20000 });
    await expect(page).toHaveURL(/.*\/login/);
  });

  test('AUTH-09A: Canceling sign out keeps the user logged in', async ({ page }) => {
    await loginAndWait(page, USERS.admin.email, USERS.admin.password);
    await page.goto('/users');
    await expect(page).toHaveURL(/.*\/users/);

    const signOutBtn = page.locator('button', { hasText: /sign out/i });
    await expect(signOutBtn).toBeVisible({ timeout: 5000 });
    await signOutBtn.click();

    await expect(page.getByText(/are you sure you want to sign out/i)).toBeVisible();
    await page.getByRole('button', { name: /^cancel$/i }).click();

    await expect(page).toHaveURL(/.*\/users/);
    await expect(page.getByText(/are you sure you want to sign out/i)).not.toBeVisible();
  });

  test('AUTH-10: Unknown route /xyz redirects appropriately', async ({ page }) => {
    await page.goto('/xyz');

    await page.waitForTimeout(5000);
    const url = page.url();
    expect(url.includes('/login') || url.includes('/dashboard')).toBe(true);
  });

  test('AUTH-11: Cold navigation shows loading then resolves (no blank screen)', async ({ page }) => {
    await page.goto('/dashboard');

    await page.waitForTimeout(6000);

    const url = page.url();
    const isOnLogin = url.includes('/login');
    const isOnDashboard = url.includes('/dashboard');

    expect(isOnLogin || isOnDashboard).toBe(true);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(10);
  });
});
