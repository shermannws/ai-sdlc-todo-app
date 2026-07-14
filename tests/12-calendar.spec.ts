import { test, expect } from '@playwright/test';
import { TodoAppHelper, uniqueUser, futureDateLocal } from './helpers';

test.describe('Calendar View', () => {
  test('Calendar loads for current month', async ({ page }) => {
    const helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    await helper.register(uniqueUser('cal'));

    await page.goto('/calendar');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Should show a month name and year
    const heading = await page.getByRole('heading', { level: 1 }).textContent();
    expect(heading).toMatch(/\w+ \d{4}/);
  });

  test('Navigate to next month → URL param changes', async ({ page }) => {
    const helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    await helper.register(uniqueUser('calnext'));

    await page.goto('/calendar');
    await page.click('button[aria-label="Next month"]');

    await expect(page).toHaveURL(/\/calendar\?month=\d{4}-\d{2}/);
  });

  test('Navigate to previous month → URL param changes', async ({ page }) => {
    const helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    await helper.register(uniqueUser('calprev'));

    await page.goto('/calendar?month=2026-07');
    await page.click('button[aria-label="Previous month"]');

    await expect(page).toHaveURL('/calendar?month=2026-06');
  });

  test('Invalid ?month= param → falls back to current month', async ({ page }) => {
    const helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    await helper.register(uniqueUser('calinv'));

    await page.goto('/calendar?month=not-a-date');

    // Should still show a valid month heading, not crash
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const heading = await page.getByRole('heading', { level: 1 }).textContent();
    expect(heading).toMatch(/\w+ \d{4}/);
  });

  test('Todo with due date shows on correct calendar cell', async ({ page }) => {
    const helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    await helper.register(uniqueUser('calduedate'));

    // Create a todo due on a specific future date in the same month
    const dueDateTime = futureDateLocal(60 * 24 * 3); // 3 days from now
    const dueDateOnly = dueDateTime.slice(0, 10); // YYYY-MM-DD
    const [year, month] = dueDateOnly.split('-').map(Number);

    await helper.createTodo('Calendar Due Todo', { dueDate: dueDateTime });

    await page.goto(`/calendar?month=${year}-${String(month).padStart(2, '0')}`);

    // The todo title should appear somewhere in the calendar grid
    await expect(page.getByText('Calendar Due Todo')).toBeVisible();
  });

  test('High priority todo shows red indicator', async ({ page }) => {
    const helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    await helper.register(uniqueUser('calhigh'));

    const dueDateTime = futureDateLocal(60 * 24 * 5);
    const dueDateOnly = dueDateTime.slice(0, 10);
    const [year, month] = dueDateOnly.split('-').map(Number);

    await helper.createTodo('High Priority Task', {
      dueDate: dueDateTime,
      priority: 'high',
    });

    await page.goto(`/calendar?month=${year}-${String(month).padStart(2, '0')}`);

    // Red dot indicator for high priority
    const redDot = page.locator('.bg-red-500').first();
    await expect(redDot).toBeVisible();
  });

  test('Holiday name appears on correct cell', async ({ page }) => {
    const helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    await helper.register(uniqueUser('calholiday'));

    // National Day is 2026-08-09 (seeded in seed-holidays.ts)
    await page.goto('/calendar?month=2026-08');

    // If holidays are seeded, National Day should appear
    const nationalDay = page.getByText('National Day');
    // Only assert visibility if the API returns holidays
    const holidaysRes = await page.request.get('/api/holidays');
    if (holidaysRes.ok()) {
      const holidays = await holidaysRes.json();
      const hasAugHoliday = holidays.some(
        (h: { date: string }) => h.date.startsWith('2026-08')
      );
      if (hasAugHoliday) {
        await expect(nationalDay).toBeVisible();
      }
    }
  });

  test('Click cell with todos → modal shows todo list', async ({ page }) => {
    const helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    await helper.register(uniqueUser('calmodal'));

    const dueDateTime = futureDateLocal(60 * 24 * 4);
    const dueDateOnly = dueDateTime.slice(0, 10);
    const [year, month] = dueDateOnly.split('-').map(Number);

    await helper.createTodo('Modal Test Todo', { dueDate: dueDateTime });

    await page.goto(`/calendar?month=${year}-${String(month).padStart(2, '0')}`);
    await page.getByText('Modal Test Todo').first().click();

    // Modal should appear with the todo listed
    await expect(page.getByText(`Todos for ${dueDateOnly}`)).toBeVisible();
    await expect(page.getByText('Modal Test Todo')).toBeVisible();
  });

  test('Cell with > 3 todos shows count badge', async ({ page }) => {
    const helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    await helper.register(uniqueUser('calbadge'));

    // Create 4 todos on the same day
    const dueDateTime = futureDateLocal(60 * 24 * 5);
    const dueDateOnly = dueDateTime.slice(0, 10);
    const [year, month] = dueDateOnly.split('-').map(Number);

    for (let i = 1; i <= 4; i++) {
      await helper.createTodo(`Badge Todo ${i}`, { dueDate: dueDateTime });
    }

    await page.goto(`/calendar?month=${year}-${String(month).padStart(2, '0')}`);

    // Should show "+2 more" badge (showing 2, hiding 2)
    await expect(page.getByText('+2 more')).toBeVisible();
  });

  test("Today's cell is highlighted", async ({ page }) => {
    const helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    await helper.register(uniqueUser('caltoday'));

    await page.goto('/calendar');

    // Today's date number should have a blue background ring
    const todayBadge = page.locator('.bg-blue-600').first();
    await expect(todayBadge).toBeVisible();
  });

  test('Weekend cells are visually distinct', async ({ page }) => {
    const helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    await helper.register(uniqueUser('calweekend'));

    await page.goto('/calendar');

    // Weekend cells have a distinct background class
    const weekendCell = page.locator('.bg-slate-50').first();
    await expect(weekendCell).toBeVisible();
  });
});
