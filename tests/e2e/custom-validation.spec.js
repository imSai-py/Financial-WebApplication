import { test, expect } from '@playwright/test';
import { TEST_USERS } from '../support/localTestUsers.js';
import { ensureLoggedOut, loginAs } from './support/auth.js';

const USERS = TEST_USERS;

test.describe('E2E Validation and Settings Email Tests', () => {
  test.beforeEach(async ({ page }) => {
    await ensureLoggedOut(page);
  });

  test('CUSTOM-01: Admin user creation form enforces mandatory username, phone, and optional email validations', async ({ page }) => {
    // 1. Log in as admin
    await loginAs(page, USERS.admin);
    await expect(page).toHaveURL(/.*\/dashboard/);

    // 2. Navigate to Manage Users
    await page.goto('/users');
    await page.waitForSelector('text=New User', { timeout: 15000 });
    
    // 3. Open New User Modal
    await page.click('text=New User');
    await page.waitForSelector('input[name="displayName"]', { timeout: 5000 });

    // Verify UI Asterisks and Labels
    await expect(page.locator('label:has-text("Username *")')).toBeVisible();
    await expect(page.locator('label:has-text("Phone Number *")')).toBeVisible();
    await expect(page.locator('label:has-text("Email (Optional)")')).toBeVisible();

    // 4. Test misspelled email validation
    await page.fill('input[name="displayName"]', 'E2E Validation Tester');
    await page.fill('input[name="username"]', 'e2e.tester');
    await page.fill('input[name="email"]', 'test@gmal.com');
    await page.fill('input[name="phone"]', '+919876543210');
    await page.fill('input[name="password"]', 'Tester@123');
    await page.fill('input[name="confirmPassword"]', 'Tester@123');
    
    await page.click('button[type="submit"]');
    
    // Assert email typo domain validation blocks submission and displays correction
    const emailError = page.locator('text=/Misspelled email domain. Did you mean gmail.com\\?/i');
    await expect(emailError).toBeVisible({ timeout: 5000 });

    // 5. Test mandatory username validation
    await page.fill('input[name="email"]', ''); // clear email (since it is optional)
    await page.fill('input[name="username"]', ''); // clear username
    await page.click('button[type="submit"]');

    const usernameError = page.locator('text=Username is required');
    await expect(usernameError).toBeVisible({ timeout: 5000 });

    // 6. Test mandatory phone number validation
    await page.fill('input[name="username"]', 'e2e.tester');
    await page.fill('input[name="phone"]', ''); // clear phone
    await page.click('button[type="submit"]');

    const phoneError = page.locator('text=Phone number is required');
    await expect(phoneError).toBeVisible({ timeout: 5000 });
  });

  test('CUSTOM-02: User profile settings page supports email updates with secure re-authentication flow', async ({ page }) => {
    // 1. Log in as admin
    await loginAs(page, USERS.admin);
    await expect(page).toHaveURL(/.*\/dashboard/);

    // 2. Navigate to Settings
    await page.goto('/settings');
    await page.waitForSelector('input[name="email"]', { timeout: 15000 });

    // 3. Verify that the email input is editable and not read-only
    const emailInput = page.locator('input[name="email"]');
    await expect(emailInput).toBeEditable();

    // 4. Change email address
    const originalEmail = USERS.admin.email;
    const testNewEmail = 'admin-e2e-updated@financeflow.com';

    await emailInput.fill(testNewEmail);
    await page.click('button[type="submit"]:has-text("Save Changes")');

    // 5. Verify either the password re-authentication modal opens OR direct update is blocked (auth/operation-not-allowed)
    const reauthModalHeader = page.locator('text=Confirm Password');
    const operationNotAllowedAlert = page.locator('text=/operation-not-allowed|verify the new email/i');

    const isModalVisible = await reauthModalHeader.isVisible({ timeout: 5000 }).catch(() => false);
    if (!isModalVisible) {
      // Direct update is blocked by production console settings (auth/operation-not-allowed)
      await expect(operationNotAllowedAlert).toBeVisible({ timeout: 5000 });
      console.log('Skipping client-side re-auth flow check on production as direct email update is blocked by project console settings.');
      return;
    }

    // 6. Enter incorrect password first and verify error
    await page.fill('input[name="password"]', 'IncorrectPassword@123');
    await page.click('button[type="submit"]:has-text("Confirm")');

    const errorMsg = page.locator('text=/invalid|wrong|failed/i');
    await expect(errorMsg.first()).toBeVisible({ timeout: 10000 });

    // 7. Enter correct password to complete update
    await page.fill('input[name="password"]', USERS.admin.password);
    await page.click('button[type="submit"]:has-text("Confirm")');

    // Verify success toast/message and modal closure
    await expect(reauthModalHeader).not.toBeVisible({ timeout: 15000 });
    const successToast = page.locator('text=Profile updated successfully');
    await expect(successToast).toBeVisible({ timeout: 5000 });

    // 8. Revert the changes back to original email to maintain state
    await page.waitForTimeout(2000);
    await emailInput.fill(originalEmail);
    await page.click('button[type="submit"]:has-text("Save Changes")');

    // Re-auth pops up again due to sensitive action
    await expect(reauthModalHeader).toBeVisible({ timeout: 5000 });
    await page.fill('input[name="password"]', USERS.admin.password);
    await page.click('button[type="submit"]:has-text("Confirm")');

    await expect(reauthModalHeader).not.toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Profile updated successfully')).toBeVisible({ timeout: 5000 });
  });
});
