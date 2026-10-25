import Image from 'next/image';
import Link from 'next/link';
import { MarketingIcon } from '@/components/marketing/icon';
import { SetupHeader, WorkspaceFooter } from './setup-header';
import styles from './workspace.module.css';
export function WeddingWelcome({ name }: { name: string }) {
  return (
    <div className={styles.setupPage}>
      <a className={styles.skipLink} href="#setup-main">
        Skip to wedding setup
      </a>
      <SetupHeader name={name} />
      <main id="setup-main" className={styles.welcomeMain}>
        <section className={styles.welcomeHeading}>
          <p className={styles.eyebrow}>Getting started · ShaadiPilot</p>
          <h1>
            Welcome to your wedding sanctuary, <em>{name.split(' ')[0]}.</em>
          </h1>
          <p>
            Bring your entire celebration into one calm, private space.
            <br />
            Let’s create your shared family workspace.
          </p>
          <div className={styles.assurances}>
            <span>
              <MarketingIcon name="check" size={15} /> Private planning
            </span>
            <span>
              <MarketingIcon name="users" size={15} /> Family collaboration
            </span>
            <span>
              <MarketingIcon name="heart" size={15} /> One celebration
            </span>
          </div>
        </section>
        <div className={styles.welcomeGrid}>
          <section className={styles.createCard}>
            <div className={styles.cardKicker}>
              <span className={styles.badge}>Primary organizer</span>
              <small>Single wedding workspace</small>
            </div>
            <h2>Create a new wedding workspace</h2>
            <p>
              You’ll be the first Admin. Bring your functions, family tasks,
              guest invitations and wedding details together in one place.
            </p>
            <div className={styles.featureGrid}>
              {[
                {
                  icon: 'calendar' as const,
                  title: 'Every celebration',
                  text: 'A shared home for your Mehendi, Sangeet, wedding and reception.',
                },
                {
                  icon: 'tasks' as const,
                  title: 'A little more organized',
                  text: 'Keep planning details together, one manageable step at a time.',
                },
                {
                  icon: 'users' as const,
                  title: 'Your people, together',
                  text: 'Admins and Managers collaborate in the same private workspace.',
                },
              ].map((item) => (
                <div key={item.title}>
                  <MarketingIcon name={item.icon} />
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              ))}
            </div>
            <div className={styles.cardBottom}>
              <Link className={styles.primaryButton} href="/onboarding/details">
                Set up your wedding <MarketingIcon name="arrow" size={18} />
              </Link>
              <small>Start with the essentials.</small>
            </div>
          </section>
          <aside className={styles.welcomeAside}>
            <div className={styles.vision}>
              <Image
                src="/workspace/setup.jpg"
                alt="An intimate Indian wedding celebration setting"
                fill
                sizes="(max-width: 760px) 100vw, 400px"
                loading="eager"
              />
              <div>
                <span className={styles.eyebrow}>The vision</span>
                <p>
                  “A celebration designed with care,
                  <br />
                  experienced with joy.”
                </p>
              </div>
            </div>
            <section className={styles.invitedCard}>
              <MarketingIcon name="mail" size={26} />
              <p className={styles.eyebrow}>Joining a wedding?</p>
              <h2>Invited as a co-organizer?</h2>
              <p>
                Open the private invitation link shared by your wedding
                organizer. There is no public wedding directory or join code.
              </p>
              <div className={styles.softNote}>
                Organizer invitations are an upcoming feature. You don’t need to
                create another wedding to join one.
              </div>
            </section>
          </aside>
        </div>
        <div className={styles.familyNote}>
          <MarketingIcon name="heart" size={25} />
          <div>
            <strong>One wedding. Your whole planning team.</strong>
            <p>
              Each organizer belongs to one wedding. Guests use private
              invitation and gallery links—no account needed.
            </p>
          </div>
        </div>
      </main>
      <WorkspaceFooter />
    </div>
  );
}
