'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

type Mode = 'login' | 'register';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me').then((res) => {
      if (res.ok) router.push('/');
    });
  }, [router]);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const optRes = await fetch('/api/auth/register-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      if (!optRes.ok) {
        const data = await optRes.json();
        setError(data.error ?? 'Failed to get registration options');
        return;
      }

      const options = await optRes.json();
      const attResp = await startRegistration({ optionsJSON: options });

      const verifyRes = await fetch('/api/auth/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, response: attResp }),
      });

      if (!verifyRes.ok) {
        const data = await verifyRes.json();
        setError(data.error ?? 'Registration verification failed');
        return;
      }

      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const optRes = await fetch('/api/auth/login-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      if (!optRes.ok) {
        const data = await optRes.json();
        setError(data.error ?? 'Failed to get login options');
        return;
      }

      const options = await optRes.json();
      const authResp = await startAuthentication({ optionsJSON: options });

      const verifyRes = await fetch('/api/auth/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, response: authResp }),
      });

      if (!verifyRes.ok) {
        const data = await verifyRes.json();
        setError(data.error ?? 'Login failed');
        return;
      }

      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-8">
          <h1 className="text-2xl font-bold text-center mb-2">Todo App</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6">
            Sign in or create an account using your passkey
          </p>

          {/* Mode toggle */}
          <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 mb-6">
            {(['login', 'register'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(null); }}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  mode === m
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {m === 'login' ? 'Login' : 'Register'}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-4">
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                required
                disabled={loading}
                autoComplete="username"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !username.trim()}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
            >
              {loading
                ? 'Please wait…'
                : mode === 'login'
                ? '🔑 Login with Passkey'
                : '🔐 Register with Passkey'}
            </button>
          </form>

          <p className="mt-4 text-xs text-center text-gray-400 dark:text-gray-500">
            Uses WebAuthn passkeys — no passwords needed
          </p>
        </div>
      </div>
    </div>
  );
}
