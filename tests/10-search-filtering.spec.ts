import { expect, test, type Page } from '@playwright/test';
import { TodoAppHelper, futureDateLocal, uniqueUser } from './helpers';

test.describe('Search and filtering', () => {
  let helper: TodoAppHelper;

  test.beforeEach(async ({ page }) => {
    helper = new TodoAppHelper(page);
    await helper.signInDirectly(uniqueUser('search'));

    await helper.createTodo('Plan design review', {
      dueDate: futureDateLocal(60),
      priority: 'high',
    });
    await helper.createTodo('Buy groceries', {
      dueDate: futureDateLocal(180),
      priority: 'medium',
    });
    await helper.createTodo('Write release notes', {
      dueDate: futureDateLocal(240),
      priority: 'low',
    });

    await page.getByRole('checkbox', { name: /Write release notes/i }).check();
  });

  async function openFilters(page: Page): Promise<void> {
    await page.getByRole('button', { name: /show filters/i }).click();
    await expect(page.getByLabel('Search')).toBeVisible();
  }

  test('filter panel collapses and expands', async ({ page }) => {
    await expect(page.getByLabel('Search')).toHaveCount(0);

    await openFilters(page);
    await expect(page.getByLabel('Search')).toBeVisible();

    await page.getByRole('button', { name: /hide filters/i }).click();
    await expect(page.getByLabel('Search')).toHaveCount(0);
  });

  test('search filters by partial title and is case-insensitive', async ({ page }) => {
    await openFilters(page);

    await page.getByLabel('Search').fill('DESIGN');
    await page.waitForTimeout(350);

    await expect(page.getByText('Plan design review')).toBeVisible();
    await expect(page.getByText('Buy groceries')).toHaveCount(0);
    await expect(page.getByText('Write release notes')).toHaveCount(0);

    await page.getByLabel('Search').fill('');
    await page.waitForTimeout(350);

    await expect(page.getByText('Plan design review')).toBeVisible();
    await expect(page.getByText('Buy groceries')).toBeVisible();
    await expect(page.getByText('Write release notes')).toBeVisible();
  });

  test('priority, completion, and date range filters apply together', async ({ page }) => {
    await openFilters(page);

    await page.getByLabel('Priority').selectOption('low');
    await expect(page.getByText('Write release notes')).toBeVisible();
    await expect(page.getByText('Plan design review')).toHaveCount(0);

    await page.getByLabel('Completion', { exact: true }).selectOption('completed');
    await expect(page.getByText('Write release notes')).toBeVisible();
    await expect(page.getByText('Buy groceries')).toHaveCount(0);

    const dueFrom = futureDateLocal(170).slice(0, 10);
    const dueTo = futureDateLocal(250).slice(0, 10);
    await page.getByLabel('Due from').fill(dueFrom);
    await page.getByLabel('Due to').fill(dueTo);

    await expect(page.getByText('Write release notes')).toBeVisible();
    await expect(page.getByText('Buy groceries')).toHaveCount(0);
  });

  test('save preset, load preset, and delete preset', async ({ page }) => {
    await openFilters(page);

    await page.getByLabel('Search').fill('release');
    await page.waitForTimeout(350);
    await page.getByLabel('Priority').selectOption('low');
    await page.getByLabel('Completion', { exact: true }).selectOption('completed');

    await page.getByLabel('Preset name').fill('Completed release notes');
    await page.getByRole('button', { name: /save preset/i }).click();

    await expect(page.getByLabel('Saved presets')).toContainText('Completed release notes');

    await page.reload();
    await openFilters(page);
    await expect(page.getByLabel('Saved presets')).toContainText('Completed release notes');

    await page.getByLabel('Saved presets').selectOption({ label: 'Completed release notes' });
    await page.waitForTimeout(350);

    await expect(page.getByText('Write release notes')).toBeVisible();
    await expect(page.getByText('Buy groceries')).toHaveCount(0);
    await expect(page.getByText('Plan design review')).toHaveCount(0);

    await page.getByRole('button', { name: /delete preset/i }).click();
    await expect(page.getByLabel('Saved presets')).not.toContainText('Completed release notes');
  });

  test.skip('search matches subtask title', async () => {
    // Subtasks are implemented in a separate branch, so this isolated branch cannot exercise them yet.
  });

  test.skip('filter by tag', async () => {
    // Tags are implemented in a separate branch, so this isolated branch cannot exercise them yet.
  });
});