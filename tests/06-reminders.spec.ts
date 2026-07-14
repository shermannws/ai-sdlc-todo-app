import { test, expect } from '@playwright/test';
import { TodoAppHelper, uniqueUser, futureDateLocal } from './helpers';

test.describe('Reminders and Notifications', () => {
  let helper: TodoAppHelper;

  test.beforeEach(async ({ page }) => {
    helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    await helper.register(uniqueUser('remind'));
  });

  test('set reminder on todo with due date -> reminder badge visible', async ({ page }) => {
    await page.getByPlaceholder('Todo title…').fill('Reminder todo');
    await page.locator('input[type="datetime-local"]').fill(futureDateLocal(120));
    await page.getByLabel('Reminder').selectOption('15');
    await page.getByRole('button', { name: 'Add Todo' }).click();

    await expect(page.getByText('Reminder todo')).toBeVisible();
    await expect(page.getByText('🔔 15m')).toBeVisible();
  });

  test('try to set reminder on todo without due date -> dropdown disabled', async ({ page }) => {
    const reminderSelect = page.getByLabel('Reminder');
    await expect(reminderSelect).toBeDisabled();
  });

  test('reminder dropdown contains all expected labels', async ({ page }) => {
    await page.locator('input[type="datetime-local"]').fill(futureDateLocal(120));

    const reminderSelect = page.getByLabel('Reminder');
    await expect(reminderSelect).toBeEnabled();
    await expect(reminderSelect.locator('option')).toHaveCount(8);
    await expect(reminderSelect.locator('option[value=""]')).toHaveText('none');
    await expect(reminderSelect.locator('option[value="15"]')).toHaveText('15m');
    await expect(reminderSelect.locator('option[value="30"]')).toHaveText('30m');
    await expect(reminderSelect.locator('option[value="60"]')).toHaveText('1h');
    await expect(reminderSelect.locator('option[value="120"]')).toHaveText('2h');
    await expect(reminderSelect.locator('option[value="1440"]')).toHaveText('1d');
    await expect(reminderSelect.locator('option[value="2880"]')).toHaveText('2d');
    await expect(reminderSelect.locator('option[value="10080"]')).toHaveText('1w');
  });

  test('/api/notifications/check returns todo in active notification window', async ({ page }) => {
    const dueSoon = futureDateLocal(10);

    const createRes = await page.request.post('/api/todos', {
      data: {
        title: 'Notification window todo',
        due_date: dueSoon,
        priority: 'medium',
        reminder_minutes: 15,
      },
    });
    expect(createRes.status()).toBe(201);

    const checkRes = await page.request.get('/api/notifications/check');
    expect(checkRes.status()).toBe(200);
    const dueTodos = await checkRes.json();

    const found = dueTodos.find((t: { title: string }) => t.title === 'Notification window todo');
    expect(found).toBeTruthy();
  });

  test('/api/notifications/check deduplicates repeated notifications', async ({ page }) => {
    const dueSoon = futureDateLocal(10);

    const createRes = await page.request.post('/api/todos', {
      data: {
        title: 'Dedup todo',
        due_date: dueSoon,
        priority: 'medium',
        reminder_minutes: 15,
      },
    });
    expect(createRes.status()).toBe(201);

    const first = await page.request.get('/api/notifications/check');
    expect(first.status()).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.find((t: { title: string }) => t.title === 'Dedup todo')).toBeTruthy();

    const second = await page.request.get('/api/notifications/check');
    expect(second.status()).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.find((t: { title: string }) => t.title === 'Dedup todo')).toBeFalsy();
  });
});
