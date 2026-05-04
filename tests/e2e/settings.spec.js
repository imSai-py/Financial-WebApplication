import { test, expect } from '@playwright/test';

const STAFF_USER = { email: 'staff@financeflow.com', password: 'Staff@123' };

async function loginAsStaff(page) {
  await page.goto('/login');
  await page.waitForSelector('#login-email', { state: 'visible', timeout: 10000 });
  await page.fill('#login-email', STAFF_USER.email);
  await page.fill('#login-password', STAFF_USER.password);
  await page.click('#login-submit');
  await page.waitForURL('**/dashboard', { timeout: 25000 });
}

test.describe('Settings Profile', () => {
  test('staff profile settings show email and allow saving profile changes', async ({ page }) => {
    await loginAsStaff(page);
    await page.goto('/settings');

    const emailInput = page.locator('input[name="email"]');
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveValue(STAFF_USER.email);
    await expect(emailInput).not.toBeDisabled();
    await expect(emailInput).toHaveAttribute('readonly', '');

    const nameInput = page.locator('input[name="displayName"]');
    const originalName = await nameInput.inputValue();
    const updatedName = `${originalName} QA`;

    await nameInput.fill(updatedName);
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('text=Profile updated successfully')).toBeVisible({ timeout: 10000 });
    await expect(nameInput).toHaveValue(updatedName);

    await nameInput.fill(originalName);
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('text=Profile updated successfully')).toBeVisible({ timeout: 10000 });
    await expect(nameInput).toHaveValue(originalName);
  });
});
