import Link from 'next/link';
import { Brand } from '@/components/marketing/brand';
import { RecoveryForm } from './recovery-form';
import styles from './recovery.module.css';
export function RecoveryPage({ mode }: { mode: 'request' | 'reset' }) {
  return (
    <div className={styles.page}>
      <a href="#recovery-content" className={styles.skipLink}>
        Skip to form
      </a>
      <header>
        <Brand href="/" />
      </header>
      <main id="recovery-content">
        <RecoveryForm mode={mode} />
      </main>
      <footer>
        © {new Date().getFullYear()} ShaadiPilot. For the coming together of two
        families.<Link href="/">Back to home</Link>
      </footer>
    </div>
  );
}
