import { test, expect } from '@playwright/test';
import { Timestamp } from 'firebase-admin/firestore';
import { loginAsRole, ensureLoggedOut, expectUnauthorizedRedirect } from './support/auth.js';
import { TEST_USERS } from '../support/localTestUsers.js';
import {
  createLeadDocument,
  deleteUserArtifacts,
  findUserDocByEmail,
  getUserDoc,
  readEmulatorLogs,
  setUserStatus,
} from '../support/emulatorAdmin.js';

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

async function openCustomerCreateForm(page, role) {
  if (role === 'admin') {
    await page.goto('/users');
    await page.locator('button', { hasText: 'New User' }).click();
    return;
  }

  if (role === 'staff') {
    await page.goto('/customers');
    await page.locator('button', { hasText: /Add Customer|Create Customer/i }).click();
    return;
  }

  await page.goto('/portfolio');
  await page.locator('button', { hasText: 'Create Customer' }).click();
}

async function fillCustomerForm(page, customer) {
  await fillFirst(page, [
    'input[name="displayName"]',
    'input[placeholder="Full legal name"]',
    'input[placeholder="John Doe"]',
  ], customer.displayName);
  await fillFirst(page, [
    'input[name="email"]',
    'input[placeholder="user@example.com"]',
    'input[placeholder="john@example.com"]',
  ], customer.email);
  await fillFirst(page, [
    'input[name="phone"]',
    'input[placeholder="+91 98765 43210"]',
  ], customer.phone);
  await fillFirst(page, [
    'input[name="password"]',
    'input[placeholder="Set a strong password"]',
  ], customer.password);
  await fillFirst(page, [
    'input[name="confirmPassword"]',
    'input[placeholder="Confirm the password"]',
    'input[placeholder="Confirm password"]',
  ], customer.password);
  await fillFirst(page, [
    'input[name="panNumber"]',
    'input[placeholder="ABCDE1234F"]',
  ], customer.panNumber);
  await fillFirst(page, [
    'input[name="aadhaarLastFour"]',
    'input[placeholder="1234"]',
  ], customer.aadhaarLastFour);
  await fillFirst(page, [
    'input[name="dateOfBirth"]',
    'input[type="date"]',
  ], customer.dateOfBirth);
  await fillFirst(page, [
    'input[name="address.street"]',
    'input[placeholder="Street address"]',
    'input[placeholder="123 Main Street"]',
  ], customer.address.street);
  await fillFirst(page, [
    'input[name="address.city"]',
    'input[placeholder="City"]',
    'input[placeholder="Mumbai"]',
  ], customer.address.city);
  await fillFirst(page, [
    'input[name="address.state"]',
    'input[placeholder="State"]',
    'input[placeholder="Maharashtra"]',
  ], customer.address.state);
  await fillFirst(page, [
    'input[name="address.zip"]',
    'input[placeholder="PIN"]',
    'input[placeholder="400001"]',
  ], customer.address.zip);
}

async function submitCustomerForm(page) {
  const submitButton = page.locator('button[type="submit"]').filter({
    hasText: /Create Customer|Create User|Activate Customer/i,
  });
  await submitButton.click();
}

async function createCustomerThroughUi(page, role, customer) {
  await ensureLoggedOut(page);
  await loginAsRole(page, role);
  await openCustomerCreateForm(page, role);
  await fillCustomerForm(page, customer);
  await submitCustomerForm(page);
  await expect(page.locator('text=/Created customer|created successfully|Activated customer/i').first()).toBeVisible({
    timeout: 15000,
  });

  return waitForUserDoc(customer.email);
}

async function verifyTraceabilityRow(browser, customer, expected) {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await loginAsRole(page, 'admin');
    await page.goto('/dashboard');

    const section = page.getByTestId('customer-traceability-section');
    await expect(section).toBeVisible();
    await expect(section.getByText('Customer Creation Traceability')).toBeVisible();

    const searchInput = section.getByPlaceholder('Search customer, ID, creator, linked staff, or linked agent...');
    await searchInput.fill(customer.displayName);
    const matchingRow = section.locator('tbody tr').filter({ hasText: customer.displayName }).first();
    await expect(matchingRow).toBeVisible();
    await expect(matchingRow).toContainText(customer.displayName);
    await expect(matchingRow).toContainText(expected.creatorName);
    await expect(matchingRow).toContainText(expected.creatorRole);
    await expect(matchingRow).toContainText(expected.creatorId);

    await section.getByLabel('Filter by creator role').selectOption(expected.creatorRole);
    await expect(matchingRow).toBeVisible();
  } finally {
    await context.close();
  }
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

async function fillFirst(page, selectors, value) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      await locator.fill(value);
      return;
    }
  }
}

test.describe('Customer activity tracking', () => {
  const cleanupQueue = [];

  test.afterEach(async ({}, testInfo) => {
    while (cleanupQueue.length > 0) {
      const cleanupTarget = cleanupQueue.pop();
      await deleteUserArtifacts(cleanupTarget);
    }

    if (testInfo.status !== testInfo.expectedStatus) {
      const logs = readEmulatorLogs();
      await testInfo.attach('firebase-emulators.log', {
        body: logs.stdout || 'No emulator stdout captured.',
        contentType: 'text/plain',
      });
      await testInfo.attach('firebase-emulators.err.log', {
        body: logs.stderr || 'No emulator stderr captured.',
        contentType: 'text/plain',
      });
    }
  });

  test('admins, staff, and agents write creator metadata that matches the admin dashboard row', async ({ page, browser }) => {
    test.skip(page.viewportSize().width < 1024, 'Creation-path certification runs on desktop only.');

    for (const role of ['admin', 'staff', 'agent']) {
      const customer = uniqueCustomer(`${role}-trace`);
      const context = await browser.newContext();
      const rolePage = await context.newPage();
      const createdUser = await createCustomerThroughUi(rolePage, role, customer);
      await context.close();
      cleanupQueue.push({ uid: createdUser.id, email: customer.email });

      const persisted = await getUserDoc(createdUser.id);
      expect(persisted.uid).toBe(createdUser.id);
      expect(persisted.createdBy).toBe(persisted.creator.id);
      expect(persisted.creator.name).toBeTruthy();
      expect(persisted.creator.role).toBe(role);
      expect(persisted.creator.timestamp).toBeTruthy();
      expect(persisted.createdAt).toBeTruthy();

      await verifyTraceabilityRow(browser, customer, {
        creatorName: persisted.creator.name,
        creatorRole: role,
        creatorId: persisted.creator.id,
      });
    }
  });

  test('admin dashboard traceability filters and search narrow results correctly', async ({ page, browser }) => {
    test.skip(page.viewportSize().width < 1024, 'Filter coverage runs on desktop only.');

    const customer = uniqueCustomer('filter-trace');
    const createdUser = await createCustomerThroughUi(page, 'staff', customer);
    cleanupQueue.push({ uid: createdUser.id, email: customer.email });

    const context = await browser.newContext();
    const adminPage = await context.newPage();

    try {
      await loginAsRole(adminPage, 'admin');
      await adminPage.goto('/dashboard');

      const section = adminPage.getByTestId('customer-traceability-section');
      const searchInput = section.getByPlaceholder('Search customer, ID, creator, linked staff, or linked agent...');
      await searchInput.fill(customer.displayName);
      await expect(section.getByText(customer.displayName)).toBeVisible();

      await section.getByLabel('Filter by creator role').selectOption('staff');
      await expect(section.getByText(customer.displayName)).toBeVisible();

      await section.getByLabel('Filter by creator role').selectOption('agent');
      await expect(section.getByText('No customer creation records match the current filters.')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('staff and agents are blocked from admin-only routes and unauthenticated users are redirected', async ({ page, browser }) => {
    test.skip(page.viewportSize().width < 1024, 'Access-control certification runs on desktop only.');

    const staffContext = await browser.newContext();
    const staffPage = await staffContext.newPage();
    await loginAsRole(staffPage, 'staff');
    await expectUnauthorizedRedirect(staffPage, '/users');
    await expectUnauthorizedRedirect(staffPage, '/activity');
    await staffContext.close();

    const agentContext = await browser.newContext();
    const agentPage = await agentContext.newPage();
    await loginAsRole(agentPage, 'agent');
    await expectUnauthorizedRedirect(agentPage, '/users');
    await expectUnauthorizedRedirect(agentPage, '/activity');
    await agentContext.close();

    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await guestPage.goto('/dashboard');
    await guestPage.waitForURL('**/login', { timeout: 20000 });
    await expect(guestPage).toHaveURL(/.*\/login/);
    await guestContext.close();
  });

  test('rapid customer creation preserves distinct creator mappings', async ({ page }) => {
    test.skip(page.viewportSize().width < 1024, 'Rapid-creation certification runs on desktop only.');

    const rapidCustomers = Array.from({ length: 3 }, (_, index) => uniqueCustomer(`rapid-${index}`));
    await loginAsRole(page, 'admin');
    await page.goto('/users');

    for (const customer of rapidCustomers) {
      await page.locator('button', { hasText: 'New User' }).click();
      await fillCustomerForm(page, customer);
      await submitCustomerForm(page);
      const createdUser = await waitForUserDoc(customer.email);
      cleanupQueue.push({ uid: createdUser.id, email: customer.email });
    }
  });

  test('invalid customer input shows validation and avoids failed mappings', async ({ page }) => {
    test.skip(page.viewportSize().width < 1024, 'Validation certification runs on desktop only.');

    const invalidCustomer = uniqueCustomer('invalid-trace');
    await loginAsRole(page, 'admin');
    await openCustomerCreateForm(page, 'admin');

    await page.locator('input[name="displayName"]').fill('');
    await page.locator('input[name="email"]').fill('invalid-email');
    await page.locator('input[name="password"]').fill('weak');
    await page.locator('input[name="confirmPassword"]').fill('different');
    await page.locator('input[name="panNumber"]').fill('BADPAN');
    await page.locator('input[name="aadhaarLastFour"]').fill('12');
    await submitCustomerForm(page);

    await expect(page.getByText(/Full name is required|Invalid email format|Passwords do not match|Invalid PAN/i).first()).toBeVisible();
    expect(await findUserDocByEmail(invalidCustomer.email)).toBeNull();
  });

  test('staff session interruption before submit prevents customer creation', async ({ page }) => {
    test.skip(page.viewportSize().width < 1024, 'Session-interruption certification runs on desktop only.');

    const customer = uniqueCustomer('suspended-staff');
    await loginAsRole(page, 'staff');
    await openCustomerCreateForm(page, 'staff');
    await fillCustomerForm(page, customer);

    const staffDoc = await findUserDocByEmail(TEST_USERS.staff.email);
    await setUserStatus(staffDoc.id, 'suspended');

    await page.waitForURL('**/login', { timeout: 15000 });
    expect(await findUserDocByEmail(customer.email)).toBeNull();

    await setUserStatus(staffDoc.id, 'active');
  });

  test('lead promotion preserves the original creator snapshot', async ({ page }) => {
    test.skip(page.viewportSize().width < 1024, 'Lead-promotion certification runs on desktop only.');

    const lead = uniqueCustomer('lead-trace');
    const leadDocId = `lead-${Date.now()}`;
    const agentDoc = await findUserDocByEmail(TEST_USERS.agent.email);

    await createLeadDocument({
      id: leadDocId,
      displayName: lead.displayName,
      email: lead.email,
      creatorUid: agentDoc.id,
      creatorRole: 'agent',
      onboardedByAgent: agentDoc.id,
      createdAt: Timestamp.now(),
    });
    cleanupQueue.push({ leadDocId });

    await ensureLoggedOut(page);
    await loginAsRole(page, 'admin');
    await page.goto('/users');
    await page.getByPlaceholder('Search users by name, email, role...').fill(lead.displayName);
    await page.locator('button[title="Activate customer account"]').first().click();

    await page.locator('input[name="password"]').fill(lead.password);
    await page.locator('input[name="confirmPassword"]').fill(lead.password);
    await submitCustomerForm(page);

    const promoted = await waitForUserDoc(lead.email);
    cleanupQueue.push({ uid: promoted.id, email: lead.email, leadDocId });

    expect(promoted.creator.id).toBe(agentDoc.id);
    expect(promoted.creator.role).toBe('agent');
  });

  test('traceability section renders in mobile card layout', async ({ page }) => {
    test.skip(page.viewportSize().width > 768, 'Responsive traceability check runs on mobile/tablet only.');

    await loginAsRole(page, 'admin');
    await page.goto('/dashboard');

    const section = page.getByTestId('customer-traceability-section');
    await expect(section).toBeVisible();
    await expect(section.getByText('Customer Creation Traceability')).toBeVisible();
    await expect(section.locator('table')).toHaveCount(0);
    await expect(section.getByPlaceholder('Search customer, ID, creator, linked staff, or linked agent...')).toBeVisible();
  });
});
