import { test, expect } from '@playwright/test';
import { TodoAppHelper, uniqueUser } from './helpers';

const PRIORITY_COLORS = {
  high: 'rgb(239, 68, 68)',    // #EF4444
  medium: 'rgb(245, 158, 11)', // #F59E0B
  low: 'rgb(59, 130, 246)',    // #3B82F6
} as const;

test.describe('Priority', () => {
  let helper: TodoAppHelper;

  test.beforeEach(async ({ page }) => {
    helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    await helper.register(uniqueUser('prio'));
  });

  test('create high priority todo → red badge visible', async ({ page }) => {
    await helper.createTodo('Urgent task', { priority: 'high' });
    const badge = page.locator('span', { hasText: 'high' });
    await expect(badge).toBeVisible();
    const color = await badge.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(color).toBe(PRIORITY_COLORS.high);
  });

  test('create medium priority todo → amber badge visible', async ({ page }) => {
    await helper.createTodo('Normal task', { priority: 'medium' });
    const badge = page.locator('span', { hasText: 'medium' });
    await expect(badge).toBeVisible();
    const color = await badge.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(color).toBe(PRIORITY_COLORS.medium);
  });

  test('create low priority todo → blue badge visible', async ({ page }) => {
    await helper.createTodo('Nice to have', { priority: 'low' });
    const badge = page.locator('span', { hasText: 'low' });
    await expect(badge).toBeVisible();
    const color = await badge.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(color).toBe(PRIORITY_COLORS.low);
  });

  test('todos sorted high before medium before low in Pending', async ({ page }) => {
    await helper.createTodo('Low task', { priority: 'low' });
    await helper.createTodo('High task', { priority: 'high' });
    await helper.createTodo('Medium task', { priority: 'medium' });

    // All items in the todo list
    const items = page.locator('.space-y-2 > div');
    const texts = await items.allInnerTexts();
    const titles = texts.map((t) => t.split('\n')[0].trim());

    const highIdx = titles.findIndex((t) => t === 'High task');
    const medIdx = titles.findIndex((t) => t === 'Medium task');
    const lowIdx = titles.findIndex((t) => t === 'Low task');

    expect(highIdx).toBeLessThan(medIdx);
    expect(medIdx).toBeLessThan(lowIdx);
  });
});
