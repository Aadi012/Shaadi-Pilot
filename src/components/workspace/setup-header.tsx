import Link from 'next/link';
import { Brand } from '@/components/marketing/brand';
import { LogoutButton } from '@/components/auth/logout-button';
import styles from './workspace.module.css';
export function SetupHeader({
  name,
  details = false,
}: {
  name: string;
  details?: boolean;
}) {
  return (
    <header className={styles.setupHeader}>
      <Brand href="/account" />
      <nav aria-label="Wedding setup">
        <Link href="/onboarding" aria-current={!details ? 'page' : undefined}>
          Overview
        </Link>
        <Link
          href="/onboarding/details"
          aria-current={details ? 'page' : undefined}
        >
          Create wedding
        </Link>
      </nav>
      <div className={styles.identity}>
        <span>
          {name} <small>Organizer</small>
        </span>
        <LogoutButton className={styles.textButton} />
      </div>
    </header>
  );
}
export function WorkspaceFooter() {
  return (
    <footer className={styles.footer}>
      <span>ShaadiPilot · For the coming together of two families.</span>
      <span>Your celebration, together.</span>
    </footer>
  );
}
