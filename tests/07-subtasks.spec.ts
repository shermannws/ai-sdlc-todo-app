import { test, expect } from '@playwright/test';
import { TodoAppHelper, uniqueUser } from './helpers';

test.describe('Subtasks and Progress', () => {
  let helper: TodoAppHelper;

  test.beforeEach(async ({ page }) => {
    helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    await helper.register(uniqueUser('subtasks'));
  });

  test('add subtask to a todo → appears in expanded subtask list', async ({ page }) => {
    await helper.createTodo('Parent Task');
    await helper.addSubtask('Parent Task', 'First Subtask');

    await expect(page.getByText('First Subtask')).toBeVisible();
  });

  test('check subtask → marked complete and progress bar updates', async ({ page }) => {
    await helper.createTodo('Progress Task');
    await helper.addSubtask('Progress Task', 'One');
    await helper.addSubtask('Progress Task', 'Two');

    const card = page.locator('div', { hasText: 'Progress Task' }).first();
    await expect(card.getByText('0/2 subtasks')).toBeVisible();

    await card.getByLabel('Toggle subtask One').check();

    await expect(card.getByText('1/2 subtasks')).toBeVisible();
  });

  test('all subtasks checked → progress bar turns green', async ({ page }) => {
    await helper.createTodo('Green Bar Task');
    await helper.addSubtask('Green Bar Task', 'Alpha');
    await helper.addSubtask('Green Bar Task', 'Beta');

    const card = page.locator('div', { hasText: 'Green Bar Task' }).first();
    await card.getByLabel('Toggle subtask Alpha').check();
    await card.getByLabel('Toggle subtask Beta').check();

    await expect(card.getByText('2/2 subtasks')).toBeVisible();
    const fill = card.getByRole('progressbar').locator('div').first();
    await expect(fill).toHaveCSS('background-color', 'rgb(34, 197, 94)');
  });

  test('delete subtask → removed from list', async ({ page }) => {
    await helper.createTodo('Delete Subtask Task');
    await helper.addSubtask('Delete Subtask Task', 'Will be deleted');

    const card = page.locator('div', { hasText: 'Delete Subtask Task' }).first();
    await card.getByRole('button', { name: 'Delete subtask Will be deleted' }).click();

    await expect(card.getByText('Will be deleted')).not.toBeVisible({ timeout: 5_000 });
  });

  test('progress bar hidden when no subtasks', async ({ page }) => {
    await helper.createTodo('No Subtasks Task');

    const card = page.locator('div', { hasText: 'No Subtasks Task' }).first();
    await expect(card.getByRole('progressbar')).toHaveCount(0);
    await expect(card.getByText(/\d+\/\d+ subtasks/)).toHaveCount(0);
  });

  test('progress text shows X/Y subtasks', async ({ page }) => {
    await helper.createTodo('Progress Text Task');
    await helper.addSubtask('Progress Text Task', 'Only one');

    const card = page.locator('div', { hasText: 'Progress Text Task' }).first();
    await expect(card.getByText('0/1 subtasks')).toBeVisible();

    await card.getByLabel('Toggle subtask Only one').check();
    await expect(card.getByText('1/1 subtasks')).toBeVisible();
  });

  test('add subtask via Enter key (keyboard submit)', async ({ page }) => {
    await helper.createTodo('Keyboard Task');

    const card = page.locator('div', { hasText: 'Keyboard Task' }).first();
    await card.getByRole('button', { name: /Toggle subtasks for Keyboard Task/i }).click();
    await card.getByLabel('Add subtask for Keyboard Task').fill('Entered Subtask');
    await card.getByLabel('Add subtask for Keyboard Task').press('Enter');

    await expect(card.getByText('Entered Subtask')).toBeVisible({ timeout: 5_000 });
  });

  test('subtask positions not renumbered after delete', async ({ page }) => {
    const todoRes = await page.request.post('/api/todos', {
      data: { title: 'Position Task', priority: 'medium' },
    });
    expect(todoRes.status()).toBe(201);
    const todo = (await todoRes.json()) as { id: number };

    const firstRes = await page.request.post(`/api/todos/${todo.id}/subtasks`, {
      data: { title: 'First' },
    });
    const secondRes = await page.request.post(`/api/todos/${todo.id}/subtasks`, {
      data: { title: 'Second' },
    });
    const thirdRes = await page.request.post(`/api/todos/${todo.id}/subtasks`, {
      data: { title: 'Third' },
    });

    expect(firstRes.status()).toBe(201);
    expect(secondRes.status()).toBe(201);
    expect(thirdRes.status()).toBe(201);

    const second = (await secondRes.json()) as { id: number };

    const deleteRes = await page.request.delete(`/api/subtasks/${second.id}`);
    expect(deleteRes.status()).toBe(204);

    const createdAfterDeleteRes = await page.request.post(`/api/todos/${todo.id}/subtasks`, {
      data: { title: 'Fourth' },
    });
    expect(createdAfterDeleteRes.status()).toBe(201);
    const createdAfterDelete = (await createdAfterDeleteRes.json()) as { position: number };

    expect(createdAfterDelete.position).toBe(3);

    const todoGetRes = await page.request.get(`/api/todos/${todo.id}`);
    expect(todoGetRes.status()).toBe(200);
    const todoWithSubtasks = (await todoGetRes.json()) as { subtasks: Array<{ position: number }> };

    const positions = todoWithSubtasks.subtasks.map((subtask) => subtask.position);
    expect(positions).toEqual([0, 2, 3]);
  });
});
