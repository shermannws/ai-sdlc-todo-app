import { expect, type Page } from '@playwright/test';

export class TodoAppHelper {
  constructor(private page: Page) {}

  /**
   * Creates a virtual WebAuthn authenticator via CDP.
   * Must be called before any register/login action in the test.
   */
  async setupVirtualAuthenticator(): Promise<void> {
    const cdpSession = await this.page.context().newCDPSession(this.page);
    await cdpSession.send('WebAuthn.enable');
    await cdpSession.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
      },
    });
  }

  async register(username: string): Promise<void> {
    await this.page.goto('/login');
    await this.page.getByRole('button', { name: 'Register' }).click();
    await this.page.getByLabel('Username').fill(username);
    await this.page.getByRole('button', { name: /Register with Passkey/i }).click();
    await this.page.waitForURL('/', { timeout: 10_000 });
  }

  async login(username: string): Promise<void> {
    await this.page.goto('/login');
    await this.page.getByLabel('Username').fill(username);
    await this.page.getByRole('button', { name: /Login with Passkey/i }).click();
    await this.page.waitForURL('/', { timeout: 10_000 });
  }

  async logout(): Promise<void> {
    await this.page.getByRole('button', { name: 'Logout' }).click();
    await this.page.waitForURL('/login', { timeout: 5_000 });
  }

  async createTodo(title: string, opts?: { dueDate?: string; priority?: 'high' | 'medium' | 'low' }): Promise<void> {
    await this.page.getByPlaceholder('Todo title…').fill(title);
    if (opts?.dueDate) {
      await this.page.locator('input[type="datetime-local"]').fill(opts.dueDate);
    }
    if (opts?.priority) {
      await this.page.locator('select').selectOption(opts.priority);
    }
    await this.page.getByRole('button', { name: 'Add Todo' }).click();
    await this.page.getByText(title).waitFor({ timeout: 5_000 });
  }

  // ── Stubs for feature branches ────────────────────────────────────────────

  async addSubtask(todoTitle: string, subtaskTitle: string): Promise<void> {
    const todoCard = this.page.locator('div', { hasText: todoTitle }).first();
    await todoCard.getByRole('button', { name: new RegExp(`Toggle subtasks for ${todoTitle}`) }).click();
    await todoCard.getByLabel(`Add subtask for ${todoTitle}`).fill(subtaskTitle);
    await todoCard.getByRole('button', { name: 'Add' }).click();
    await expect(this.page.getByText(subtaskTitle)).toBeVisible({ timeout: 5_000 });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async createTag(_name: string, _color?: string): Promise<void> {
    throw new Error('createTag not implemented yet — see feature/tags branch');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async createTemplate(_name: string, _opts?: object): Promise<void> {
    throw new Error('createTemplate not implemented yet — see feature/templates branch');
  }
}

/** Generates a unique username to avoid cross-test collisions. */
export function uniqueUser(prefix = 'user'): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
}

/** Returns a datetime-local string N minutes from now (Singapore UTC+8). */
export function futureDateLocal(minutesFromNow = 60): string {
  const d = new Date(Date.now() + minutesFromNow * 60 * 1000);
  // Format as YYYY-MM-DDTHH:MM (datetime-local input format)
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
