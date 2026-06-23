import { test, expect } from '@playwright/test';
import { TEST_USERS } from '../support/localTestUsers.js';

const ADMIN_USER = TEST_USERS.admin;

async function loginAsAdmin(page) {
  await page.goto('/login');
  await page.waitForSelector('#login-email', { state: 'visible' });
  await page.fill('#login-email', ADMIN_USER.email);
  await page.fill('#login-password', ADMIN_USER.password);
  await page.click('#login-submit');
  await page.waitForURL('**/dashboard', { timeout: 20000 });
}

test.describe('Modal Behavior and Smart Address Autocomplete', () => {

  test.beforeEach(async ({ page }) => {
    // Setup API mocks to ensure deterministic and fast E2E test executions
    await page.route('https://api.postalpincode.in/pincode/400001', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            Message: "Number of pincode found:1",
            Status: "Success",
            PostOffice: [
              {
                Name: "Haji S Musafarkhana",
                District: "Mumbai",
                State: "Maharashtra",
                Pincode: "400001"
              }
            ]
          }
        ])
      });
    });

    await page.route('https://api.zippopotam.us/in/400001', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          "post code": "400001",
          "country": "India",
          "country abbreviation": "IN",
          "places": [
            {
              "place name": "Mumbai G.P.O. ",
              "state": "Maharashtra"
            }
          ]
        })
      });
    });

    // Mock an invalid pincode failure
    await page.route('https://api.postalpincode.in/pincode/999999', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            Message: "No records found",
            Status: "Error",
            PostOffice: null
          }
        ])
      });
    });

    await page.route('https://api.zippopotam.us/in/999999', async route => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({})
      });
    });

    // Go to login page
    await page.goto('/login');
    if (page.url().includes('dashboard')) {
      const signOut = page.locator('button', { hasText: /sign out/i });
      if (await signOut.isVisible()) {
        await signOut.click();
      }
    }
    await loginAsAdmin(page);
  });

  test('MODAL-01: Backdrop click and text-selection drag do not close the user form modal', async ({ page }) => {
    await page.goto('/users');
    
    // Open New User Modal
    const addUserBtn = page.locator('button', { hasText: 'New User' });
    await expect(addUserBtn).toBeVisible();
    await addUserBtn.click();
    
    // Assert Modal is Open
    const modalHeader = page.locator('h3', { hasText: 'Create User' });
    await expect(modalHeader).toBeVisible();

    // Fill some form content to verify data is not lost
    const nameInput = page.locator('input[name="displayName"]');
    await nameInput.fill('E2E Tester');

    // Click outside the modal backdrop (at coordinates 10, 10)
    await page.mouse.click(10, 10);
    
    // Assert Modal is STILL Open
    await expect(modalHeader).toBeVisible();
    await expect(nameInput).toHaveValue('E2E Tester');

    // Perform a click-and-drag gesture starting from inside the modal to the outside backdrop
    // to simulate a user selecting text and accidentally releasing the mouse outside
    const modalBox = await page.locator('div.animate-fade-in').first().boundingBox();
    if (modalBox) {
      await page.mouse.move(modalBox.x + 50, modalBox.y + 50);
      await page.mouse.down();
      await page.mouse.move(10, 10);
      await page.mouse.up();
    }
    
    // Assert Modal is STILL Open
    await expect(modalHeader).toBeVisible();
    await expect(nameInput).toHaveValue('E2E Tester');

    // Explicitly click Cancel button to close
    const cancelBtn = page.locator('button', { hasText: 'Cancel' });
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();

    // Assert Modal is Closed
    await expect(modalHeader).not.toBeVisible();
  });

  test('AUTOCOMPLETE-01: Typing in City/State triggers dynamic matching suggestions dropdown', async ({ page }) => {
    await page.goto('/users');
    
    const addUserBtn = page.locator('button', { hasText: 'New User' });
    await addUserBtn.click();

    // Type in City input
    const cityInput = page.locator('input[name="address.city"]');
    await cityInput.fill('Ben');

    // Check suggestions listbox appears
    const cityListbox = page.locator('ul[role="listbox"]');
    await expect(cityListbox).toBeVisible();

    // Find and select "Bengaluru"
    const BengaluruOption = cityListbox.locator('li', { hasText: 'Bengaluru' });
    await expect(BengaluruOption).toBeVisible();
    await BengaluruOption.click();

    // Value should be updated and listbox closed
    await expect(cityInput).toHaveValue('Bengaluru');
    await expect(cityListbox).not.toBeVisible();

    // Type in State input
    const stateInput = page.locator('input[name="address.state"]');
    await stateInput.fill('Maha');

    const stateListbox = page.locator('ul[role="listbox"]');
    await expect(stateListbox).toBeVisible();

    const MaharashtraOption = stateListbox.locator('li', { hasText: 'Maharashtra' });
    await expect(MaharashtraOption).toBeVisible();
    await MaharashtraOption.click();

    await expect(stateInput).toHaveValue('Maharashtra');
    await expect(stateListbox).not.toBeVisible();

    // Close modal
    await page.locator('button', { hasText: 'Cancel' }).click();
  });

  test('PINCODE-01: Valid pincode auto-fills City and State correctly and handles invalid pincode gracefully', async ({ page }) => {
    await page.goto('/users');
    
    const addUserBtn = page.locator('button', { hasText: 'New User' });
    await addUserBtn.click();

    const cityInput = page.locator('input[name="address.city"]');
    const stateInput = page.locator('input[name="address.state"]');
    const zipInput = page.locator('input[name="address.zip"]');

    // Type valid Indian PIN code
    await zipInput.fill('400001');

    // Wait for auto-fill to resolve and verify values (from mock)
    await expect(cityInput).toHaveValue('Mumbai');
    await expect(stateInput).toHaveValue('Maharashtra');

    // Clear ZIP and test invalid PIN code handles gracefully
    await zipInput.fill('');
    await zipInput.pressSequentially('999999');

    // Wait and verify that it doesn't crash, doesn't wipe existing inputs, or shows a clean state
    await page.waitForTimeout(1000);
    await expect(zipInput).toHaveValue('999999');

    // Close modal
    await page.locator('button', { hasText: 'Cancel' }).click();
  });

});
