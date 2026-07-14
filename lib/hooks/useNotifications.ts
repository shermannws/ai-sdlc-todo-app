'use client';

import { useEffect } from 'react';

export function useNotifications(): void {
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const poll = async () => {
      try {
        const res = await fetch('/api/notifications/check');
        if (!res.ok) return;

        const todos = await res.json();
        if (!Array.isArray(todos)) return;

        if (Notification.permission === 'granted') {
          for (const todo of todos) {
            new Notification('Todo Reminder', {
              body: todo.title,
              tag: `todo-${todo.id}`,
            });
          }
        }
      } catch {
        // Notifications are non-critical.
      }
    };

    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, []);
}
