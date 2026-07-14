import { test, expect } from '@playwright/test';
import { readFile } from 'fs/promises';
import { TodoAppHelper, uniqueUser } from './helpers';

test.describe('Export & Import', () => {
  test('Export JSON → file download with correct filename', async ({ page }) => {
    const helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    await helper.register(uniqueUser('expfn'));

    await page.click('button:has-text("Export")');

    const downloadPromise = page.waitForEvent('download');
    await page.click('a:has-text("Export as JSON")');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^todos-\d{4}-\d{2}-\d{2}\.json$/);
  });

  test('Export JSON structure has version:1, exported_at, todos array', async ({ page }) => {
    const helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    await helper.register(uniqueUser('expstruct'));

    await page.click('button:has-text("Export")');
    const downloadPromise = page.waitForEvent('download');
    await page.click('a:has-text("Export as JSON")');
    const download = await downloadPromise;

    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const content = await readFile(filePath!, 'utf-8');
    const data = JSON.parse(content);

    expect(data.version).toBe(1);
    expect(typeof data.exported_at).toBe('string');
    expect(Array.isArray(data.todos)).toBe(true);
  });

  test('Exported todo includes subtasks and tags arrays (may be empty)', async ({ page }) => {
    const helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    await helper.register(uniqueUser('expfields'));
    await helper.createTodo('Task with arrays');

    await page.click('button:has-text("Export")');
    const downloadPromise = page.waitForEvent('download');
    await page.click('a:has-text("Export as JSON")');
    const download = await downloadPromise;

    const filePath = await download.path();
    const content = await readFile(filePath!, 'utf-8');
    const data = JSON.parse(content);

    expect(data.todos.length).toBeGreaterThan(0);
    const todo = data.todos[0];
    expect(Array.isArray(todo.subtasks)).toBe(true);
    expect(Array.isArray(todo.tags)).toBe(true);
  });

  test('Exported todo does NOT include id or user_id fields', async ({ page }) => {
    const helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    await helper.register(uniqueUser('expnoid'));
    await helper.createTodo('No ID task');

    await page.click('button:has-text("Export")');
    const downloadPromise = page.waitForEvent('download');
    await page.click('a:has-text("Export as JSON")');
    const download = await downloadPromise;

    const filePath = await download.path();
    const content = await readFile(filePath!, 'utf-8');
    const data = JSON.parse(content);

    expect(data.todos.length).toBeGreaterThan(0);
    const todo = data.todos[0];
    expect(todo.id).toBeUndefined();
    expect(todo.user_id).toBeUndefined();
  });

  test('Export CSV → file download with correct headers', async ({ page }) => {
    const helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    await helper.register(uniqueUser('expcsv'));

    await page.click('button:has-text("Export")');
    const downloadPromise = page.waitForEvent('download');
    await page.click('a:has-text("Export as CSV")');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^todos-\d{4}-\d{2}-\d{2}\.csv$/);

    const filePath = await download.path();
    const content = await readFile(filePath!, 'utf-8');
    const firstLine = content.split('\n')[0];
    expect(firstLine).toBe('ID,Title,Completed,Due Date,Priority,Recurring,Pattern,Reminder');
  });

  test('Import JSON → todos appear in list', async ({ page }) => {
    const helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    await helper.register(uniqueUser('imptodos'));

    const payload = {
      version: 1,
      exported_at: new Date().toISOString(),
      todos: [
        {
          title: 'Imported Todo Alpha',
          completed: false,
          due_date: null,
          priority: 'medium',
          is_recurring: false,
          recurrence_pattern: null,
          reminder_minutes: null,
          subtasks: [],
          tags: [],
        },
      ],
    };

    const res = await page.request.post('/api/todos/import', { data: payload });
    expect(res.ok()).toBe(true);
    const result = await res.json();
    expect(result.imported).toBe(1);

    await page.reload();
    await expect(page.getByText('Imported Todo Alpha')).toBeVisible();
  });

  test('Import creates subtasks from exported subtasks', async ({ page }) => {
    const helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    await helper.register(uniqueUser('impsub'));

    const payload = {
      version: 1,
      exported_at: new Date().toISOString(),
      todos: [
        {
          title: 'Todo with subtask',
          completed: false,
          due_date: null,
          priority: 'low',
          is_recurring: false,
          recurrence_pattern: null,
          reminder_minutes: null,
          subtasks: [{ title: 'Subtask One', completed: false, position: 0 }],
          tags: [],
        },
      ],
    };

    const res = await page.request.post('/api/todos/import', { data: payload });
    expect(res.ok()).toBe(true);

    // Verify via API that the todo was created with subtask
    const todosRes = await page.request.get('/api/todos');
    const todos = await todosRes.json();
    const imported = todos.find((t: { title: string }) => t.title === 'Todo with subtask');
    expect(imported).toBeDefined();
    expect(imported.subtasks).toHaveLength(1);
    expect(imported.subtasks[0].title).toBe('Subtask One');
  });

  test('Import reuses existing tag by case-insensitive name match', async ({ page }) => {
    const helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    await helper.register(uniqueUser('imptag'));

    // Create first todo with tag "Work"
    const firstImport = {
      version: 1,
      exported_at: new Date().toISOString(),
      todos: [
        {
          title: 'First tagged todo',
          completed: false,
          due_date: null,
          priority: 'medium' as const,
          is_recurring: false,
          recurrence_pattern: null,
          reminder_minutes: null,
          subtasks: [],
          tags: [{ name: 'Work', color: '#3B82F6' }],
        },
      ],
    };
    await page.request.post('/api/todos/import', { data: firstImport });

    // Import second todo with tag "work" (lowercase)
    const secondImport = {
      ...firstImport,
      todos: [
        {
          ...firstImport.todos[0],
          title: 'Second tagged todo',
          tags: [{ name: 'work', color: '#EF4444' }],
        },
      ],
    };
    const res = await page.request.post('/api/todos/import', { data: secondImport });
    expect(res.ok()).toBe(true);

    // Both todos should share the same tag (same ID)
    const todosRes = await page.request.get('/api/todos');
    const todos = await todosRes.json();
    const first = todos.find((t: { title: string }) => t.title === 'First tagged todo');
    const second = todos.find((t: { title: string }) => t.title === 'Second tagged todo');
    expect(first.tags[0].id).toBe(second.tags[0].id);
  });

  test('Import creates new tag if no case-insensitive name match', async ({ page }) => {
    const helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    await helper.register(uniqueUser('impnewtag'));

    const payload = {
      version: 1,
      exported_at: new Date().toISOString(),
      todos: [
        {
          title: 'Todo with brand new tag',
          completed: false,
          due_date: null,
          priority: 'high' as const,
          is_recurring: false,
          recurrence_pattern: null,
          reminder_minutes: null,
          subtasks: [],
          tags: [{ name: 'UniqueTag123', color: '#10B981' }],
        },
      ],
    };

    const res = await page.request.post('/api/todos/import', { data: payload });
    expect(res.ok()).toBe(true);

    const todosRes = await page.request.get('/api/todos');
    const todos = await todosRes.json();
    const todo = todos.find((t: { title: string }) => t.title === 'Todo with brand new tag');
    expect(todo.tags).toHaveLength(1);
    expect(todo.tags[0].name).toBe('UniqueTag123');
  });

  test('Re-import same file → duplicates todos (by design)', async ({ page }) => {
    const helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    await helper.register(uniqueUser('impdup'));

    const payload = {
      version: 1,
      exported_at: new Date().toISOString(),
      todos: [
        {
          title: 'Duplicate Me',
          completed: false,
          due_date: null,
          priority: 'medium' as const,
          is_recurring: false,
          recurrence_pattern: null,
          reminder_minutes: null,
          subtasks: [],
          tags: [],
        },
      ],
    };

    await page.request.post('/api/todos/import', { data: payload });
    await page.request.post('/api/todos/import', { data: payload });

    const todosRes = await page.request.get('/api/todos');
    const todos = await todosRes.json();
    const dupes = todos.filter((t: { title: string }) => t.title === 'Duplicate Me');
    expect(dupes).toHaveLength(2);
  });

  test('Import invalid JSON structure → 400 error, no partial write', async ({ page }) => {
    const helper = new TodoAppHelper(page);
    await helper.setupVirtualAuthenticator();
    await helper.register(uniqueUser('impinv'));

    // Completely wrong structure
    const res = await page.request.post('/api/todos/import', {
      data: { not_valid: true, random: 'garbage' },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();

    // No todos should have been written
    const todosRes = await page.request.get('/api/todos');
    const todos = await todosRes.json();
    expect(todos).toHaveLength(0);
  });
});
