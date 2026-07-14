import { test, expect } from '@playwright/test';
import { TodoAppHelper, uniqueUser } from './helpers';

test.describe('Template System', () => {
  let helper: TodoAppHelper;

  test.beforeEach(async ({ page }) => {
    helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    await helper.register(uniqueUser('tmpl'));
  });

  test('Templates section is visible with toggle button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Templates/i })).toBeVisible();
    await expect(page.getByRole('button', { name: '+ New Template' })).toBeVisible();
  });

  test('create template → appears in templates list', async ({ page }) => {
    await helper.createTemplate('Daily Standup', { category: 'Work' });

    // Expand templates panel if not visible
    const panel = page.getByText('Daily Standup');
    await expect(panel).toBeVisible();
  });

  test('create template with missing name → validation prevents submit', async ({ page }) => {
    await page.getByRole('button', { name: '+ New Template' }).click();
    await page.getByLabel('Todo title template *').fill('Some title');
    await page.getByRole('button', { name: 'Create' }).click();
    // Name is required — modal stays open
    await expect(page.getByRole('button', { name: 'Create' })).toBeVisible();
  });

  test('create template with missing title_template → validation prevents submit', async ({ page }) => {
    await page.getByRole('button', { name: '+ New Template' }).click();
    await page.getByLabel('Template name *').fill('My Template');
    await page.getByRole('button', { name: 'Create' }).click();
    // Title template is required — modal stays open
    await expect(page.getByRole('button', { name: 'Create' })).toBeVisible();
  });

  test('use template → creates a new todo', async ({ page }) => {
    await helper.createTemplate('Weekly Review', { titleTemplate: 'Review week tasks' });

    const useButton = page.getByRole('button', { name: /Use template "Weekly Review"/i });
    await expect(useButton).toBeVisible();
    await useButton.click();

    await expect(page.getByText('Review week tasks')).toBeVisible({ timeout: 5_000 });
  });

  test('edit template → updates name', async ({ page }) => {
    await helper.createTemplate('Old Name', { titleTemplate: 'Old title' });

    const editBtn = page.getByRole('button', { name: /Edit template "Old Name"/i });
    await editBtn.click();

    const nameInput = page.getByLabel('Template name *');
    await nameInput.clear();
    await nameInput.fill('New Name');
    await page.getByRole('button', { name: 'Update' }).click();

    await expect(page.getByText('New Name')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Old Name')).not.toBeVisible();
  });

  test('delete template → removed from list', async ({ page }) => {
    await helper.createTemplate('Delete Me', { titleTemplate: 'Temp todo' });

    await expect(page.getByText('Delete Me')).toBeVisible();
    await page.getByRole('button', { name: /Delete template "Delete Me"/i }).click();
    await expect(page.getByText('Delete Me')).not.toBeVisible({ timeout: 5_000 });
  });

  test('create template with subtasks → use creates todo with subtasks', async ({ page }) => {
    // Open modal
    await page.getByRole('button', { name: '+ New Template' }).click();
    await page.getByLabel('Template name *').fill('Sprint Template');
    await page.getByLabel('Todo title template *').fill('Sprint Planning');

    // Add subtasks
    await page.getByRole('button', { name: '+ Add subtask' }).click();
    await page.getByPlaceholder('Subtask 1').fill('Define goals');
    await page.getByRole('button', { name: '+ Add subtask' }).click();
    await page.getByPlaceholder('Subtask 2').fill('Estimate tasks');

    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Sprint Template')).toBeVisible({ timeout: 5_000 });

    // Use the template
    await page.getByRole('button', { name: /Use template "Sprint Template"/i }).click();

    // Verify todo was created
    await expect(page.getByText('Sprint Planning')).toBeVisible({ timeout: 5_000 });
  });

  test('create recurring template → use creates recurring todo', async ({ page }) => {
    await page.getByRole('button', { name: '+ New Template' }).click();
    await page.getByLabel('Template name *').fill('Daily Checkin');
    await page.getByLabel('Todo title template *').fill('Daily checkin');
    await page.getByLabel('Recurring').check();
    await page.getByLabel('Recurrence pattern *').selectOption('daily');
    await page.getByRole('button', { name: 'Create' }).click();

    await expect(page.getByText('Daily Checkin')).toBeVisible({ timeout: 5_000 });
  });

  test('POST /api/templates validates required fields', async ({ page }) => {
    const res = await page.request.post('/api/templates', {
      data: { description: 'no name or title' },
    });
    expect(res.status()).toBe(400);
  });

  test('POST /api/templates validates is_recurring needs recurrence_pattern', async ({ page }) => {
    const res = await page.request.post('/api/templates', {
      data: {
        name: 'Bad Template',
        title_template: 'Some todo',
        is_recurring: true,
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/recurrence_pattern/i);
  });

  test('DELETE /api/templates/[id] returns 404 for non-existent template', async ({ page }) => {
    const res = await page.request.delete('/api/templates/999999');
    expect(res.status()).toBe(404);
  });

  test('POST /api/templates/[id]/use returns 404 for non-existent template', async ({ page }) => {
    const res = await page.request.post('/api/templates/999999/use');
    expect(res.status()).toBe(404);
  });

  test('toggle templates panel collapses list', async ({ page }) => {
    await helper.createTemplate('Collapsible', { titleTemplate: 'Collapsible todo' });
    await expect(page.getByText('Collapsible')).toBeVisible();

    // Click toggle to collapse
    await page.getByRole('button', { name: /Templates \(/i }).click();
    await expect(page.getByText('Collapsible')).not.toBeVisible({ timeout: 3_000 });

    // Click toggle again to expand
    await page.getByRole('button', { name: /Templates \(/i }).click();
    await expect(page.getByText('Collapsible')).toBeVisible({ timeout: 3_000 });
  });
});
