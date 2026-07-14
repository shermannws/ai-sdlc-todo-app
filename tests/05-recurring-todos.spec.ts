import { test, expect } from '@playwright/test';
import { TodoAppHelper, uniqueUser, futureDateLocal } from './helpers';

test.describe('Recurring Todos', () => {
  let helper: TodoAppHelper;

  test.beforeEach(async ({ page }) => {
    helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    await helper.register(uniqueUser('recur'));
  });

  test('create daily recurring todo -> recurrence badge is visible', async ({ page }) => {
    await page.getByPlaceholder('Todo title…').fill('Daily standup prep');
    await page.locator('input[type="datetime-local"]').fill(futureDateLocal(120));
    await page.getByRole('checkbox', { name: 'Repeat' }).check();
    await page.getByLabel('Repeat pattern').selectOption('daily');
    await page.getByRole('button', { name: 'Add Todo' }).click();

    await expect(page.getByText('Daily standup prep')).toBeVisible();
    await expect(page.getByText('🔄 daily')).toBeVisible();
  });

  test('complete daily recurring todo -> next instance appears in Pending with +1 day', async ({ page }) => {
    const dueDate = '2027-03-10T09:00:00';

    const createRes = await page.request.post('/api/todos', {
      data: {
        title: 'Daily recurring completion',
        due_date: dueDate,
        priority: 'medium',
        is_recurring: true,
        recurrence_pattern: 'daily',
      },
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();

    const completeRes = await page.request.put(`/api/todos/${created.id}`, {
      data: { completed: true },
    });
    expect(completeRes.status()).toBe(200);

    await page.reload();

    const todosRes = await page.request.get('/api/todos');
    expect(todosRes.status()).toBe(200);
    const todos = await todosRes.json();

    const nextTodo = todos.find((t: { title: string; completed: boolean; is_recurring: boolean }) =>
      t.title === 'Daily recurring completion' && !t.completed && t.is_recurring
    );
    expect(nextTodo).toBeTruthy();
    expect(nextTodo.due_date).toContain('2027-03-11');
  });

  test('complete weekly recurring todo -> next due date +7 days', async ({ page }) => {
    const createRes = await page.request.post('/api/todos', {
      data: {
        title: 'Weekly recurring completion',
        due_date: '2027-01-25T09:00:00',
        priority: 'medium',
        is_recurring: true,
        recurrence_pattern: 'weekly',
      },
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();

    const completeRes = await page.request.put(`/api/todos/${created.id}`, {
      data: { completed: true },
    });
    expect(completeRes.status()).toBe(200);

    const todosRes = await page.request.get('/api/todos');
    const todos = await todosRes.json();

    const nextTodo = todos.find((t: { title: string; completed: boolean }) =>
      t.title === 'Weekly recurring completion' && !t.completed
    );
    expect(nextTodo).toBeTruthy();
    expect(nextTodo.due_date).toContain('2027-02-01');
  });

  test('complete monthly recurring todo on Jan 31 -> next due date Feb 28/29', async ({ page }) => {
    const createRes = await page.request.post('/api/todos', {
      data: {
        title: 'Monthly edge',
        due_date: '2027-01-31T10:00:00',
        priority: 'medium',
        is_recurring: true,
        recurrence_pattern: 'monthly',
      },
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();

    const completeRes = await page.request.put(`/api/todos/${created.id}`, {
      data: { completed: true },
    });
    expect(completeRes.status()).toBe(200);

    const todosRes = await page.request.get('/api/todos');
    const todos = await todosRes.json();

    const nextTodo = todos.find((t: { title: string; completed: boolean }) =>
      t.title === 'Monthly edge' && !t.completed
    );
    expect(nextTodo).toBeTruthy();
    expect(nextTodo.due_date).toMatch(/^2027-02-(28|29)T/);
  });

  test('creating recurring todo without due date -> validation error', async ({ page }) => {
    const res = await page.request.post('/api/todos', {
      data: {
        title: 'Invalid recurring todo',
        is_recurring: true,
        recurrence_pattern: 'daily',
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/due date/i);
  });
});
