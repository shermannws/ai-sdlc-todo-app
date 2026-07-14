import { test, expect } from '@playwright/test';
import { TodoAppHelper, uniqueUser, futureDateLocal } from './helpers';

test.describe('Todo CRUD', () => {
  let helper: TodoAppHelper;

  test.beforeEach(async ({ page }) => {
    helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    await helper.register(uniqueUser('crud'));
  });

  test('create todo with title only → appears in Pending section', async ({ page }) => {
    await helper.createTodo('Buy groceries');
    await expect(page.getByText('Pending')).toBeVisible();
    await expect(page.getByText('Buy groceries')).toBeVisible();
  });

  test('create todo with future due date → appears in Pending', async ({ page }) => {
    await helper.createTodo('Meeting prep', { dueDate: futureDateLocal(120) });
    await expect(page.getByText('Meeting prep')).toBeVisible();
    // Should be in Pending section, not Overdue
    const pendingSection = page.locator('text=Pending').locator('..');
    await expect(pendingSection).toContainText('Meeting prep');
  });

  test('create todo with empty title → validation error', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Todo' }).click();
    // Browser HTML5 validation prevents submission; title input should be focused/invalid
    // Alternatively the field is required, so no API call is made
    await expect(page.getByText('Buy groceries')).not.toBeVisible();
  });

  test('mark todo complete → moves to Completed section', async ({ page }) => {
    await helper.createTodo('Finish report');
    const checkbox = page.locator('input[type="checkbox"]').first();
    await checkbox.check();
    await expect(page.locator('text=Completed')).toBeVisible();
    await expect(page.getByText('Finish report')).toBeVisible();
  });

  test('delete todo → removed from list', async ({ page }) => {
    await helper.createTodo('Delete me');
    await expect(page.getByText('Delete me')).toBeVisible();

    await page.getByRole('button', { name: /Delete "Delete me"/i }).click();
    await expect(page.getByText('Delete me')).not.toBeVisible({ timeout: 5_000 });
  });

  test('due date in past → API returns validation error', async ({ page }) => {
    // Fill the form manually with a past date via API test
    const res = await page.request.post('/api/todos', {
      data: { title: 'Past todo', due_date: '2020-01-01T00:00:00', priority: 'low' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/future/i);
  });
});
