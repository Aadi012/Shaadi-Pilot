'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './auth.module.css';

export function LogoutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  async function logout() {
    setPending(true);
    setError('');
    try {
      const session = await fetch('/api/v1/auth/session', {
        cache: 'no-store',
      });
      if (!session.ok) throw new Error();
      const { data } = await session.json();
      if (data.user) {
        const response = await fetch('/api/v1/auth/logout', {
          method: 'POST',
          headers: { 'X-CSRF-Token': data.csrfToken },
        });
        if (!response.ok) throw new Error();
      }
      router.replace('/login');
      router.refresh();
    } catch {
      setError('Could not log out. Please try again.');
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <button
        className={styles.submitButton}
        disabled={pending}
        onClick={logout}
      >
        {pending ? 'Logging out…' : 'Log out'}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
