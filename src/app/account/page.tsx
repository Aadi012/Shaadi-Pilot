import { redirect } from 'next/navigation';
import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { describeApiError } from '@/lib/api/error-diagnostics.server';
import { logRequest } from '@/lib/logging/logger.server';
import { Brand } from '@/components/marketing/brand';
import { LogoutButton } from '@/components/auth/logout-button';
import { currentSession } from '@/modules/auth/http.server';
import styles from '@/components/auth/auth.module.css';

export const metadata = {
  title: 'Your account | ShaadiPilot',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';
async function readAccountSession() {
  const startedAt = performance.now();
  try {
    return await currentSession(true);
  } catch (error) {
    logRequest({
      requestId: randomUUID(),
      method: 'GET',
      route: '/account',
      status: 503,
      durationMs: Math.round(performance.now() - startedAt),
      errorDiagnostic: describeApiError(error),
    });
    return false as const;
  }
}
export default async function AccountPage() {
  const current = await readAccountSession();
  if (current === false) {
    return (
      <main className={styles.formPanel}>
        <h1>Account access is temporarily unavailable</h1>
        <p>Please try again shortly.</p>
        <Link href="/login">Return to login</Link>
      </main>
    );
  }
  if (!current) redirect('/login');
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Brand href="/" />
      </header>
      <main className={styles.main}>
        <section className={`${styles.formPanel} ${styles.accountPanel}`}>
          <p className={styles.eyebrow}>Your organizer account</p>
          <h1>Welcome, {current.user.displayName}</h1>
          <p>You’re signed in as {current.user.emailNormalized}.</p>
          <p>
            Wedding setup is the next step and will be available in an upcoming
            update.
          </p>
          <LogoutButton />
        </section>
      </main>
    </div>
  );
}
