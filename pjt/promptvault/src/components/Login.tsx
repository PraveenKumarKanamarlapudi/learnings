import { useState, type FormEvent } from 'react';
import { Lock } from 'lucide-react';
import { api } from '../api';
import { Button, inputCls } from './ui';

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/login', { password });
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <form onSubmit={submit} className="pv-in w-full max-w-sm space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2 font-semibold">
          <span className="grid size-8 place-items-center rounded-lg bg-indigo-600 text-white"><Lock size={16} /></span>
          PromptVault
        </div>
        <p className="text-sm text-zinc-500">Enter the password to open your prompt library.</p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">Password</span>
          <input type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password" required />
        </label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <Button type="submit" variant="primary" className="w-full" disabled={busy || !password}>{busy ? 'Signing in…' : 'Sign in'}</Button>
      </form>
    </main>
  );
}
