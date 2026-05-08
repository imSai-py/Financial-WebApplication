import { test, expect } from '@playwright/test';
import { loginAsRole } from './support/auth.js';
import { findUserDocByEmail, deleteUserArtifacts } from '../support/emulatorAdmin.js';

function uniqueCustomer(prefix) {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const localPart = `${prefix}-${nonce}`.toLowerCase().replace(/[^a-z0-9-]/g, '');
  return {
    displayName: `${prefix} ${nonce}`,
    email: `${localPart}@example.com`,
    password: 'TracePass123@',
    phone: '+91 9876543210',
    panNumber: 'ABCDE1234F',
    aadhaarLastFour: '1234',
    dateOfBirth: '1994-01-15',
    address: {
      street: '123 Trace Lane',
      city: 'Mumbai',
      state: 'Maharashtra',
      zip: '400001',
    },
  };
}

async function waitForUserDoc(email) {
  let userDoc = null;
  await expect
    .poll(async () => {
      userDoc = await findUserDocByEmail(email);
      return Boolean(userDoc);
    }, { timeout: 15000 })
    .toBe(true);
  return userDoc;
}

async function fillCustomerForm(page, customer) {
  await page.locator('input[name="displayName"]').fill(customer.displayName);
  await page.locator('input[name="email"]').fill(customer.email);
  await page.locator('input[name="phone"]').fill(customer.phone);
  await page.locator('input[name="password"]').fill(customer.password);
  await page.locator('input[name="confirmPassword"]').fill(customer.password);
  await page.locator('input[name="panNumber"]').fill(customer.panNumber);
  await page.locator('input[name="aadhaarLastFour"]').fill(customer.aadhaarLastFour);
  await page.locator('input[name="dateOfBirth"]').fill(customer.dateOfBirth);
  await page.locator('input[name="address.street"]').fill(customer.address.street);
  await page.locator('input[name="address.city"]').fill(customer.address.city);
  await page.locator('input[name="address.state"]').fill(customer.address.state);
  await page.locator('input[name="address.zip"]').fill(customer.address.zip);
}

test.describe('Staff operations', () => {
  const cleanupQueue = [];

  test.afterEach(async () => {
    while (cleanupQueue.length > 0) {
      await deleteUserArtifacts(cleanupQueue.pop());
    }
  });

  test('staff-created customers appear in staff management and staff profile history', async ({ page }) => {
    test.skip(page.viewportSize().width < 1024, 'Runs on desktop only.');

    const customer = uniqueCustomer('staff-ops');
    await loginAsRole(page, 'staff');
    await page.goto('/customers');
    await page.locator('button', { hasText: 'Add Customer' }).click();
    await fillCustomerForm(page, customer);
    await page.locator('button[type="submit"]').filter({ hasText: /Create Customer/i }).click();

    const createdUser = await waitForUserDoc(customer.email);
    cleanupQueue.push({ uid: createdUser.id, email: customer.email });

    await page.getByPlaceholder('Search customers...').fill(customer.displayName);
    const customerRow = page.locator('tbody tr').filter({ hasText: customer.displayName }).first();
    await expect(customerRow).toBeVisible();
    await expect(customerRow).toContainText(customer.displayName);
    await expect(customerRow).toContainText('Created by me');

    await page.goto('/settings');
    await page.locator('button', { hasText: 'History' }).click();
    await expect(page.getByText('Customer Creation History')).toBeVisible();
    const historyRow = page.locator('tbody tr').filter({ hasText: customer.displayName }).first();
    await expect(historyRow).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export CSV' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export XLSX' }).first()).toBeVisible();
  });

  test('admin can monitor staff history from reports', async ({ page }) => {
    test.skip(page.viewportSize().width < 1024, 'Runs on desktop only.');

    await loginAsRole(page, 'admin');
    await page.goto('/reports');
    await expect(page.getByText('Staff History Monitor')).toBeVisible();
    await expect(page.getByPlaceholder('Search staff timeline...')).toBeVisible();
  });
});
