import { expect } from '@playwright/test';
import { TEST_USERS } from '../../support/localTestUsers.js';

export async function loginAs(page, user) {
  await page.goto('/login');
  const loginInput = page.locator('#login-email');
  if (!(await loginInput.isVisible({ timeout: 3000 }).catch(() => false))) {
    await page.goto('/dashboard');
    await logout(page);
    await page.goto('/login');
  }
  await page.waitForSelector('#login-email', { state: 'visible', timeout: 10000 });
  await page.fill('#login-email', user.email);
  await page.fill('#login-password', user.password);
  await page.click('#login-submit');
  await page.waitForURL('**/dashboard', { timeout: 25000 });
}

export async function loginAsRole(page, role) {
  await loginAs(page, TEST_USERS[role]);
}

export async function logout(page) {
  const signOutBtn = page.getByRole('button', { name: /sign out/i });
  if (await signOutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await signOutBtn.click();
    const confirmBtn = page.locator('.btn-danger', { hasText: /^sign out$/i });
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmBtn.click();
    }
    await page.waitForURL('**/login', { timeout: 15000 });
  }
}

export async function ensureLoggedOut(page) {
  await page.goto('/login');
  if (!(await page.locator('#login-email').isVisible({ timeout: 3000 }).catch(() => false))) {
    await logout(page);
    await page.goto('/login');
  }
}

export async function expectUnauthorizedRedirect(page, targetPath) {
  await page.goto(targetPath);
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  await expect(page).toHaveURL(/.*\/dashboard/);
}
