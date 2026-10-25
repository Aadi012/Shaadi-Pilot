import { Brand } from '@/components/marketing/brand';
import styles from './workspace.module.css';
export function WorkspaceLoading() {
  return (
    <main className={styles.loadingPage} aria-busy="true">
      <Brand href="/" />
      <p role="status">Loading your workspace…</p>
      <div className={styles.loadingHeading} aria-hidden="true" />
      <div className={styles.loadingGrid} aria-hidden="true">
        {[1, 2, 3, 4].map((key) => (
          <div key={key} />
        ))}
      </div>
      <div className={styles.loadingPanel} aria-hidden="true" />
    </main>
  );
}
