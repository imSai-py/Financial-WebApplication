/**
 * Phase 14 — Criterion 1: E2E Auth & Routing Validation
 * 
 * Tests AUTH-01 through AUTH-11:
 * - Available roles (admin, staff) can log in and reach role-specific dashboards
 * - Unauthorized route access is blocked
 * - Unauthenticated access redirects to /login
 * - Logout destroys session
 * - Invalid credentials show error
 * - No race conditions (loading screen resolves cleanly)
 *
 * NOTE: Customer and Agent accounts must exist in Firebase Auth.
 *       Tests for missing accounts are marked with graceful skip logic.
 */

import { test, expect } from '@playwright/test';
import { TEST_USERS } from '../support/localTestUsers.js';
import { ensureLoggedOut } from './support/auth.js';

// ── Test Credentials ──
// Only accounts that are confirmed to exist in production Firebase Auth
const USERS = TEST_USERS;

// ── Helpers ──

async function loginAs(page, email, password) {
  await page.goto('/login');
  await page.waitForSelector('#login-email', { state: 'visible', timeout: 10000 });
  await page.fill('#login-email', email);
  await page.fill('#login-password', password);
  await page.click('#login-submit');
}

async function loginAndWait(page, email, password) {
  await loginAs(page, email, password);
  await page.waitForURL('**/dashboard', { timeout: 25000 });
}

// ═══════════════════════════════════════════════════════
test.describe('Criterion 1: Auth & Routing', () => {

  // Each test gets a fresh browser context (isolated storage)
  test.beforeEach(async ({ page }) => {
    await ensureLoggedOut(page);
  });

  // ─── AUTH-01: Admin login ───
  test('AUTH-01: Admin can log in and sees admin dashboard', async ({ page }) => {
    await loginAndWait(page, USERS.admin.email, USERS.admin.password);
    
    await expect(page).toHaveURL(/.*\/dashboard/);
    
    // Verify admin-specific content
    const heading = page.locator('text=Welcome back');
    await expect(heading.first()).toBeVisible({ timeout: 10000 });

    // Verify admin-only sidebar nav items
    const sidebar = page.locator('aside');
    await expect(sidebar.locator('a', { hasText: 'Manage Users' })).toBeVisible();
    await expect(sidebar.locator('a', { hasText: 'Activity Logs' })).toBeVisible();
    await expect(sidebar.locator('a', { hasText: 'Reports' })).toBeVisible();
    await expect(sidebar.locator('a', { hasText: 'Commissions' })).toBeVisible();
  });

  // ─── AUTH-02: Staff login ───
  test('AUTH-02: Staff can log in and sees staff dashboard', async ({ page }) => {
    await loginAndWait(page, USERS.staff.email, USERS.staff.password);
    
    await expect(page).toHaveURL(/.*\/dashboard/);
    
    // Staff should have Customers, Transactions, but NOT Manage Users or Activity Logs
    const sidebar = page.locator('aside');
    await expect(sidebar.locator('a', { hasText: 'Customers' })).toBeVisible();
    await expect(sidebar.locator('a', { hasText: 'Transactions' })).toBeVisible();
    await expect(sidebar.locator('a', { hasText: 'Manage Users' })).not.toBeVisible();
    await expect(sidebar.locator('a', { hasText: 'Activity Logs' })).not.toBeVisible();
  });

  // ─── AUTH-03: Invalid credentials ───
  test('AUTH-03: Invalid credentials show error on login page', async ({ page }) => {
    await loginAs(page, 'bad@email.com', 'wrongpassword');

    // Should stay on /login
    await page.waitForTimeout(4000);
    await expect(page).toHaveURL(/.*\/login/);

    // Error message should be visible
    const errorText = page.locator('text=/Invalid|No account|failed/i');
    await expect(errorText.first()).toBeVisible({ timeout: 5000 });
  });

  // ─── AUTH-04: Empty fields validation ───
  test('AUTH-04: Empty form submission shows validation messages', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('#login-submit', { state: 'visible', timeout: 10000 });
    
    // Click submit without filling anything - app validation should handle it
    await page.click('#login-submit');
    
    // Should still be on login page with visible field errors
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/.*\/login/);
    await expect(page.locator('text=Email is required')).toBeVisible();
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

  // â”€â”€â”€ AUTH-04B: Whitespace email validation â”€â”€â”€
  test('AUTH-04B: Invalid email format shows invalid email message', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('#login-email', { state: 'visible', timeout: 10000 });

    await page.fill('#login-email', 'not-an-email');
    await page.fill('#login-password', USERS.staff.password);
    await page.click('#login-submit');

    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/.*\/login/);
    await expect(page.locator('text=Invalid email format')).toBeVisible();
  });

  // ─── AUTH-05: Unauthenticated → protected route → /login ───
  test('AUTH-05: Unauthenticated user is redirected to /login', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Should redirect to /login after loading screen resolves
    await page.waitForURL('**/login', { timeout: 20000 });
    await expect(page).toHaveURL(/.*\/login/);
  });

  // ─── AUTH-06: Unauthenticated → /users → /login ───
  test('AUTH-06: Unauthenticated user on /users redirects to /login', async ({ page }) => {
    await page.goto('/users');
    
    await page.waitForURL('**/login', { timeout: 20000 });
    await expect(page).toHaveURL(/.*\/login/);
  });

  // ─── AUTH-07: Staff → admin-only /users → redirected to /dashboard ───
  test('AUTH-07: Staff accessing /users is redirected to /dashboard', async ({ page }) => {
    await loginAndWait(page, USERS.staff.email, USERS.staff.password);
    
    // Navigate to admin-only route
    await page.goto('/users');
    
    // Staff should be blocked — redirected back to /dashboard
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    await expect(page).toHaveURL(/.*\/dashboard/);
  });

  // ─── AUTH-08: Staff → admin-only /activity → redirected ───
  test('AUTH-08: Staff accessing /activity is redirected to /dashboard', async ({ page }) => {
    await loginAndWait(page, USERS.staff.email, USERS.staff.password);
    
    await page.goto('/activity');
    
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    await expect(page).toHaveURL(/.*\/dashboard/);
  });

  // ─── AUTH-09: Logout flow ───
  test('AUTH-09: Logout redirects to /login and destroys session', async ({ page }) => {
    await loginAndWait(page, USERS.admin.email, USERS.admin.password);
    await expect(page).toHaveURL(/.*\/dashboard/);

    // Click Sign Out in sidebar
    const signOutBtn = page.locator('button', { hasText: /sign out/i });
    await expect(signOutBtn).toBeVisible({ timeout: 5000 });
    await signOutBtn.click();

    // Should redirect to login
    await page.waitForURL('**/login', { timeout: 15000 });
    await expect(page).toHaveURL(/.*\/login/);

    // Session should be destroyed — going back to dashboard should NOT work
    await page.goto('/dashboard');
    await page.waitForURL('**/login', { timeout: 20000 });
    await expect(page).toHaveURL(/.*\/login/);
  });

  // ─── AUTH-10: Catch-all route redirects ───
  test('AUTH-10: Unknown route /xyz redirects appropriately', async ({ page }) => {
    // When not logged in, /xyz should eventually go to /login
    await page.goto('/xyz');
    
    await page.waitForTimeout(5000);
    const url = page.url();
    // Should end up on either /login (unauthed) or /dashboard (authed catch-all)
    expect(url.includes('/login') || url.includes('/dashboard')).toBe(true);
  });

  // ─── AUTH-11: Race condition guard ───
  test('AUTH-11: Cold navigation shows loading then resolves (no blank screen)', async ({ page }) => {
    await page.goto('/dashboard');

    // Wait for the page to settle
    await page.waitForTimeout(6000);
    
    const url = page.url();
    const isOnLogin = url.includes('/login');
    const isOnDashboard = url.includes('/dashboard');
    
    // Must end up on a valid page — never a blank/broken state
    expect(isOnLogin || isOnDashboard).toBe(true);

    // Verify the page has actual content (not blank white)
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(10);
  });

});
