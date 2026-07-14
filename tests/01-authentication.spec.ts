import { test, expect } from '@playwright/test';
import { TodoAppHelper, uniqueUser } from './helpers';

test.describe('Authentication', () => {
  test('register new user → lands on /', async ({ page }) => {
    const helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    await helper.register(uniqueUser('reg'));
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'My Todos' })).toBeVisible();
  });

  test('login with registered user → lands on /', async ({ page }) => {
    const helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    const username = uniqueUser('login');
    await helper.register(username);
    await helper.logout();
    await helper.login(username);
    await expect(page).toHaveURL('/');
  });

  test('logout → lands on /login', async ({ page }) => {
    const helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    await helper.register(uniqueUser('logout'));
    await helper.logout();
    await expect(page).toHaveURL('/login');
  });

  test('unauthenticated access to / → redirected to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/login');
  });

  test('duplicate username registration → error shown', async ({ page }) => {
    const helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    const username = uniqueUser('dup');
    await helper.register(username);
    await helper.logout();

    // Try to register the same username again (new authenticator instance)
    await page.goto('/login');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.getByLabel('Username').fill(username);
    await page.getByRole('button', { name: /Register with Passkey/i }).click();

    // Should show an error — not redirect to /
    await expect(page.locator('text=already registered')).toBeVisible({ timeout: 5_000 });
    await expect(page).not.toHaveURL('/');
  });
});
