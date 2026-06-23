import { test, expect } from '@playwright/test';
import { TEST_USERS } from '../support/localTestUsers.js';

const ADMIN_USER = TEST_USERS.admin;

async function loginAsAdmin(page) {
  await page.goto('/login');
  await page.waitForSelector('#login-email', { state: 'visible' });
  await page.fill('#login-email', ADMIN_USER.email);
  await page.fill('#login-password', ADMIN_USER.password);
  await page.click('#login-submit');
  await page.waitForURL('**/dashboard', { timeout: 25000 });
}

test.describe('Mobile Customer Card and Loan Details Integration', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate and sign out if needed
    await page.goto('/login');
    if (page.url().includes('dashboard')) {
      const signOut = page.locator('button', { hasText: /sign out/i });
      if (await signOut.isVisible()) {
        await signOut.click();
      }
    }
    await loginAsAdmin(page);
  });

  test('MOBILE-LOAN-01: Tapping a customer card on mobile opens Loans & Financials view', async ({ page }) => {
    // Explicitly set viewport to mobile size (iPhone X dimensions)
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto('/customers');
    await page.waitForTimeout(2000); // Allow data to load completely

    // Verify card layout is rendered
    const cardList = page.locator('div.glass-card').first();
    await expect(cardList).toBeVisible();

    // Verify cursor styling shows as clickable pointer on mobile cards
    const clickableCard = page.locator('div[style*="cursor: pointer"]').first();
    await expect(clickableCard).toHaveCSS('cursor', 'pointer');

    // Tap/Click the customer card
    await clickableCard.click();

    // Assert that the Customer Details Modal/Drawer slides up/opens
    const modalHeader = page.locator('h3', { hasText: 'Customer Details' });
    await expect(modalHeader).toBeVisible();

    // Verify "Loans & Financials" section title is visible
    const loansHeader = page.locator('h4', { hasText: 'Loans & Financials' });
    await expect(loansHeader).toBeVisible();

    // Verify that the details loaded elegantly (either showing a summary of loans or the correct empty state)
    // Wait for the async database fetch to resolve (either showing empty state or loan principal stats card)
    // using Playwright's native locator.or() method.
    const emptyStateText = page.locator('text=No active or past loans found for this customer.');
    const loanPrincipalText = page.locator('text=Total Principal Taken');
    await expect(emptyStateText.or(loanPrincipalText).first()).toBeVisible({ timeout: 10000 });

    // Verify Close button is present and clickable
    const closeBtn = page.locator('button[aria-label="Close"]');
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    // Assert the modal is closed
    await expect(modalHeader).not.toBeVisible();
  });

  test('MOBILE-LOAN-02: Desktop customer row clicks are untouched (retains standard behavior)', async ({ page }) => {
    // Explicitly set viewport to desktop size
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto('/customers');
    await page.waitForTimeout(2000); // Allow data to load completely

    // Verify table layout is rendered (desktop mode)
    const tableHeader = page.locator('table th').first();
    await expect(tableHeader).toBeVisible();

    // Find the first row in the table
    const tableRow = page.locator('table tbody tr').first();
    await expect(tableRow).toBeVisible();

    // Double-check cursor is default (non-clickable row) to verify desktop is untouched
    await expect(tableRow).toHaveCSS('cursor', 'default');

    // Click the row (not the Eye button)
    await tableRow.click();

    // Assert that the Customer Details Modal does NOT open
    const modalHeader = page.locator('h3', { hasText: 'Customer Details' });
    await expect(modalHeader).not.toBeVisible();
  });

});
