import { SetupHeader, WorkspaceFooter } from './setup-header';
import { WeddingForm } from './wedding-form';
import { MarketingIcon } from '@/components/marketing/icon';
import styles from './workspace.module.css';
export function WeddingDetails({ name }: { name: string }) {
  return (
    <div className={styles.setupPage}>
      <a href="#wedding-details" className={styles.skipLink}>
        Skip to wedding details
      </a>
      <SetupHeader name={name} details />
      <main id="wedding-details" className={styles.detailsMain}>
        <ol className={styles.stepper} aria-label="Setup progress">
          <li>✓ Workspace setup</li>
          <li aria-current="step">2 Wedding details</li>
          <li>3 Ready</li>
        </ol>
        <p className={styles.eyebrow}>Stage 02 · Your celebration</p>
        <h1>Tell us about your celebration.</h1>
        <p className={styles.lead}>
          Start with the essentials. Your functions, tasks and guest details
          will follow,
          <br />
          one step at a time.
        </p>
        <div className={styles.privacyNote}>
          <MarketingIcon name="check" size={23} />
          <div>
            <strong>Strictly private workspace</strong>
            <p>
              Creating your wedding does not publish a public website. Your
              planning details are shared only with authorized organizers.
            </p>
          </div>
        </div>
        <WeddingForm />
      </main>
      <WorkspaceFooter />
    </div>
  );
}
