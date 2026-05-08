/**
 * Phase 14 — Criterion 4: UI Responsiveness
 * 
 * Tests UI layout and responsive behavior across Mobile, Tablet, and Desktop.
 * Run automatically across projects defined in playwright.config.js.
 */

import { test, expect } from '@playwright/test';
import { TEST_USERS } from '../support/localTestUsers.js';

// ── Credentials ──
const ADMIN_USER = TEST_USERS.admin;

// ── Helper ──
async function loginAsAdmin(page) {
  // Use a fast login that bypasses UI if possible, but testing the UI login is also good.
  await page.goto('/login');
  await page.waitForSelector('#login-email', { state: 'visible' });
  await page.fill('#login-email', ADMIN_USER.email);
  await page.fill('#login-password', ADMIN_USER.password);
  await page.click('#login-submit');
  await page.waitForURL('**/dashboard', { timeout: 20000 });
}

test.describe('Criterion 4: Responsiveness', () => {

  // Login once for the whole suite per worker is fine unless sequential causes issues,
  // but Playwright isolates test runner contexts natively.
  test.beforeEach(async ({ page }) => {
    // Explicitly make sure we are not already logged in/dirty state
    await page.goto('/login');
    if (page.url().includes('dashboard')) {
      const signOut = page.locator('button', { hasText: /sign out/i });
      if (await signOut.isVisible()) {
        await signOut.click();
      }
    }
    await loginAsAdmin(page);
  });

  test('UI-01: Navigation Structure adapts to viewport', async ({ page, isMobile }) => {
    await page.goto('/dashboard');
    
    const sidebar = page.locator('aside');
    const mainContent = page.locator('main');
    
    // Check main layout existence
    await expect(sidebar).toBeVisible();
    await expect(mainContent).toBeVisible();

    const viewportSize = page.viewportSize();
    
    if (viewportSize.width < 768) {
      // MOBILE
      const toggleBtn = page.locator('#header-menu-toggle').first();
      await expect(toggleBtn).toBeVisible();
      await toggleBtn.click();
      await page.waitForTimeout(500); 
    } else if (viewportSize.width >= 768 && viewportSize.width < 1024) {
      // TABLET
      const box = await sidebar.boundingBox();
      // On our app, 768px triggers max-width: 768px (isMobile) so it uses mobile sizing up to 320px max.
      expect(box.width).toBeLessThanOrEqual(320);
      
      // If the sidebar has an explicit toggle button (like on Desktop or if we rendered mobile header)
      const toggleBtn = page.locator('button[aria-label="Expand sidebar"], button[aria-label="Collapse sidebar"], button[aria-label="Open menu"]').first();
      if (await toggleBtn.isVisible()) {
        await toggleBtn.click();
      }
    } else {
      // DESKTOP
      const box = await sidebar.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(250);
      
      const toggleBtn = page.locator('button[aria-label="Collapse sidebar"]');
      await expect(toggleBtn).toBeVisible();
      await toggleBtn.click();
      await page.waitForTimeout(500);
      
      const boxAfter = await sidebar.boundingBox();
      expect(boxAfter.width).toBeLessThan(100);
    }
  });

  test('UI-02: DataTable converts to card layout on small screens', async ({ page }) => {
    await page.goto('/users');
    // Wait for data to load
    await page.waitForTimeout(1000); 

    const viewportSize = page.viewportSize();
    
    // In our implementation, isMobile triggers on width <= 768px in useMediaQuery
    if (viewportSize.width <= 768) {
      // Mobile: should not have a table, should have cards
      const tables = page.locator('table');
      await expect(tables).toHaveCount(0);
      
      // Should have rows rendered as cards inside a column layout wrapper
      const wrapper = page.locator('div.glass-card').first();
      await expect(wrapper).toBeVisible();
    } else {
      // Desktop: should render a standard HTML table
      const table = page.locator('table').first();
      await expect(table).toBeVisible();
    }
  });

  test('UI-03: Responsive Forms grid layouts adapt correctly', async ({ page }) => {
    await page.goto('/users');
    
    const addUserBtn = page.locator('button', { hasText: 'New User' });
    await expect(addUserBtn).toBeVisible();
    await addUserBtn.click();
    
    const form = page.locator('form');
    await expect(form).toBeVisible();
    
    const nameInput = form.locator('input[name="displayName"]');
    const emailInput = form.locator('input[name="email"]');
    
    await expect(nameInput).toBeVisible();
    await expect(emailInput).toBeVisible();
    
    const nameBox = await nameInput.boundingBox();
    const emailBox = await emailInput.boundingBox();
    
    const viewportSize = page.viewportSize();
    
    if (viewportSize.width < 640) {
      // Mobile stacked form fields
      expect(Math.abs(nameBox.y - emailBox.y)).toBeGreaterThan(20);
    }

    await page.locator('button', { hasText: 'Cancel' }).click();
  });

  test('UI-04: Customer password fields in modal toggle independently', async ({ page }) => {
    await page.goto('/users');

    const addUserBtn = page.locator('button', { hasText: 'New User' });
    await expect(addUserBtn).toBeVisible();
    await addUserBtn.click();

    const passwordInput = page.locator('input[name="password"]');
    const confirmPasswordInput = page.locator('input[name="confirmPassword"]');
    const showButtons = page.locator('button[aria-label="Show password"]');

    await expect(passwordInput).toHaveAttribute('type', 'password');
    await expect(confirmPasswordInput).toHaveAttribute('type', 'password');
    await expect(showButtons).toHaveCount(2);

    await showButtons.nth(0).click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
    await expect(confirmPasswordInput).toHaveAttribute('type', 'password');

    await page.locator('button[aria-label="Show password"]').click();
    await expect(confirmPasswordInput).toHaveAttribute('type', 'text');
  });

  test('UI-05: Back navigation appears on subpages and returns to dashboard fallback', async ({ page }) => {
    await page.goto('/users');

    const backButton = page.locator('#header-back-button');
    await expect(backButton).toBeVisible();
    await backButton.click();

    await page.waitForURL('**/dashboard', { timeout: 15000 });
    await expect(page.locator('#header-back-button')).toHaveCount(0);
  });
});
