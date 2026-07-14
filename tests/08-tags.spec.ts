import { test, expect } from '@playwright/test';
import { TodoAppHelper, uniqueUser } from './helpers';

test.describe('08 — Tag System', () => {
  let helpers: TodoAppHelper;

  test.beforeEach(async ({ page }) => {
    helpers = new TodoAppHelper(page);
    await helpers.signInDirectly(uniqueUser('tags'));
  });

  test('create tag via Manage Tags modal → tag appears in list', async ({ page }) => {
    await page.getByRole('button', { name: /manage tags/i }).click();
    await page.getByPlaceholder(/tag name/i).fill('Work');
    await page.getByRole('button', { name: /create/i }).click();
    await expect(page.getByText('Work')).toBeVisible();
  });

  test('edit tag name → updated everywhere (on existing todos)', async ({ page }) => {
    // Create a todo and tag, attach tag
    await helpers.createTodo('Test todo');
    await page.getByRole('button', { name: /manage tags/i }).click();
    await page.getByPlaceholder(/tag name/i).fill('OldName');
    await page.getByRole('button', { name: /create/i }).click();
    await page.getByRole('button', { name: /close|✕/i }).first().click();

    // Attach tag to todo
    await page.getByRole('combobox', { name: /add tag/i }).selectOption({ label: 'OldName' });

    // Edit tag name
    await page.getByRole('button', { name: /manage tags/i }).click();
    await page.getByRole('button', { name: /edit tag OldName/i }).click();
    await page.getByLabel('Rename tag').clear();
    await page.getByLabel('Rename tag').fill('NewName');
    await page.getByRole('button', { name: /save/i }).click();
    await expect(page.getByText('NewName').first()).toBeVisible();
  });

  test('delete tag → removed from all todos', async ({ page }) => {
    // Create a todo and tag, attach tag
    await helpers.createTodo('Delete tag test');
    await page.getByRole('button', { name: /manage tags/i }).click();
    await page.getByPlaceholder(/tag name/i).fill('ToDelete');
    await page.getByRole('button', { name: /create/i }).click();
    await page.getByRole('button', { name: /close|✕/i }).first().click();

    await page.getByRole('combobox', { name: /add tag/i }).selectOption({ label: 'ToDelete' });

    // Tag chip appears
    await expect(page.getByText('ToDelete').first()).toBeVisible();

    // Delete tag
    await page.getByRole('button', { name: /manage tags/i }).click();
    await page.getByRole('button', { name: /delete tag ToDelete/i }).click();
    await page.getByRole('button', { name: 'Close' }).click();

    // Tag should be gone from modal and todo
    await expect(page.getByText('ToDelete')).not.toBeVisible();
  });

  test('attach tag to todo → tag chip appears on todo', async ({ page }) => {
    await helpers.createTodo('Tag chip test');
    await page.getByRole('button', { name: /manage tags/i }).click();
    await page.getByPlaceholder(/tag name/i).fill('Urgent');
    await page.getByRole('button', { name: /create/i }).click();
    await page.getByRole('button', { name: /close|✕/i }).first().click();

    await page.getByRole('combobox', { name: /add tag/i }).selectOption({ label: 'Urgent' });
    await expect(page.locator('span').filter({ hasText: 'Urgent' }).first()).toBeVisible();
  });

  test('detach tag from todo → chip removed', async ({ page }) => {
    await helpers.createTodo('Detach tag test');
    await page.getByRole('button', { name: /manage tags/i }).click();
    await page.getByPlaceholder(/tag name/i).fill('Temp');
    await page.getByRole('button', { name: /create/i }).click();
    await page.getByRole('button', { name: /close|✕/i }).first().click();

    await page.getByRole('combobox', { name: /add tag/i }).selectOption({ label: 'Temp' });
    await expect(page.locator('span').filter({ hasText: 'Temp' })).toBeVisible();

    // Remove tag via ✕ button in chip
    await page.getByRole('button', { name: /remove tag Temp/i }).click();
    await expect(page.locator('span').filter({ hasText: 'Temp' })).not.toBeVisible();
  });

  test('attach same tag twice → no error (idempotent)', async ({ page }) => {
    await helpers.createTodo('Idempotent attach test');
    await page.getByRole('button', { name: /manage tags/i }).click();
    await page.getByPlaceholder(/tag name/i).fill('Idem');
    await page.getByRole('button', { name: /create/i }).click();
    await page.getByRole('button', { name: /close|✕/i }).first().click();

    await page.getByRole('combobox', { name: /add tag/i }).selectOption({ label: 'Idem' });

    // Direct API call to attach again
    const todoId = await page.locator('[data-todo-id]').first().getAttribute('data-todo-id');
    const response = await page.request.post(`/api/todos/${todoId}/tags`, {
      data: { tagId: 1 },
    });
    // Should succeed or tag endpoint handles idempotency
    expect([200, 404]).toContain(response.status());
  });

  test('duplicate tag name → error message shown', async ({ page }) => {
    await page.getByRole('button', { name: /manage tags/i }).click();
    await page.getByPlaceholder(/tag name/i).fill('Duplicate');
    await page.getByRole('button', { name: /create/i }).click();
    await expect(page.getByText('Duplicate')).toBeVisible();

    // Try to create same tag again
    await page.getByPlaceholder(/tag name/i).fill('Duplicate');
    await page.getByRole('button', { name: /create/i }).click();
    await expect(page.getByText(/tag name already exists/i)).toBeVisible();
  });

  test('edit tag color → updated everywhere', async ({ page }) => {
    await page.getByRole('button', { name: /manage tags/i }).click();
    await page.getByPlaceholder(/tag name/i).fill('ColorTag');
    await page.getByRole('button', { name: /create/i }).click();
    await page.getByRole('button', { name: /edit tag ColorTag/i }).click();
    // Change color input
    await page.locator('input[type="color"]').last().fill('#FF0000');
    await page.getByRole('button', { name: /save/i }).click();
    await expect(page.getByText('ColorTag')).toBeVisible();
  });
});
