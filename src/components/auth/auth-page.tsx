import Image from 'next/image';
import Link from 'next/link';
import { Brand } from '@/components/marketing/brand';
import { MarketingIcon } from '@/components/marketing/icon';
import { AuthForm } from './auth-form';
import type { AuthMode } from './auth-validation';
import styles from './auth.module.css';

export function AuthPage({ mode }: { mode: AuthMode }) {
  const signup = mode === 'signup';
  return (
    <div className={styles.page}>
      <a href="#account-content" className={styles.skipLink}>
        Skip to form
      </a>
      <header className={styles.header}>
        <Brand href="/" />
        <Link href="/" className={styles.backHome}>
          <span aria-hidden="true">←</span> Back to home
        </Link>
      </header>
      <main id="account-content" className={styles.main}>
        <div className={styles.card}>
          <section
            className={styles.formPanel}
            aria-labelledby="account-heading"
          >
            <p className={styles.eyebrow}>
              <MarketingIcon name="sparkle" size={14} /> Your celebration,
              together
            </p>
            <h1 id="account-heading">
              {signup ? (
                <>
                  Let’s begin
                  <br />
                  <em>something beautiful.</em>
                </>
              ) : (
                <>
                  Welcome
                  <br />
                  <em>back.</em>
                </>
              )}
            </h1>
            <p className={styles.introduction}>
              {signup
                ? 'A little less organizing. A lot more celebrating. Your shared wedding-planning space starts here.'
                : 'The people, plans and little details that make your celebration yours. All in one place.'}
            </p>
            <AuthForm mode={mode} key={mode} />
          </section>
          <aside
            className={styles.story}
            aria-label="Planning your celebration together"
          >
            <Image
              src={
                signup
                  ? '/marketing/wedding-family.jpg'
                  : '/marketing/wedding-couple.jpg'
              }
              alt={
                signup
                  ? 'Family sharing a joyful moment at an Indian wedding'
                  : 'An Indian wedding couple celebrating together'
              }
              fill
              loading="eager"
              sizes="(max-width: 900px) 100vw, 55vw"
            />
            <div className={styles.storyScrim} />
            <div className={styles.photoHeading}>
              <span>
                <MarketingIcon name="pin" size={13} /> Made for Indian weddings
              </span>
              <span className={styles.photoHeart}>
                <MarketingIcon name="heart" size={16} />
              </span>
            </div>
            <div className={styles.storyContent}>
              <p className={styles.storyEyebrow}>
                Plan together. Celebrate more.
              </p>
              <blockquote>
                {signup
                  ? '“One shared space for your family, functions, and forever memories.”'
                  : '“Beautiful celebrations begin together.”'}
              </blockquote>
              <p className={styles.storyDescription}>
                Make room for the moments that matter. We’ll help you bring the
                details together.
              </p>
              <div className={styles.storyCard}>
                <div className={styles.storyCardTitle}>
                  <span className={styles.monogram}>A&A</span>
                  <span>
                    <strong>Aarav & Ananya’s wedding</strong>
                    <small>Udaipur · March 2027</small>
                  </span>
                  <span className={styles.exampleTag}>Example</span>
                </div>
                {signup ? (
                  <>
                    <div className={styles.storyStep}>
                      <span>01</span>
                      <div>
                        <strong>A celebration that feels like you</strong>
                        <small>
                          From Mehendi to Reception, every function in one
                          place.
                        </small>
                      </div>
                    </div>
                    <div className={styles.storyStep}>
                      <span>02</span>
                      <div>
                        <strong>Your people, part of the plan</strong>
                        <small>
                          Shared tasks and a little more time together.
                        </small>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className={styles.storyEvents}>
                    <span>
                      <MarketingIcon name="calendar" size={17} />
                      <strong>4 functions</strong>
                      <small>One beautiful week</small>
                    </span>
                    <span>
                      <MarketingIcon name="users" size={17} />
                      <strong>A shared plan</strong>
                      <small>For the whole family</small>
                    </span>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </main>
      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} ShaadiPilot.</span>
        <p>For the coming together of two families.</p>
        <Link href="/#features">
          Explore ShaadiPilot <span aria-hidden="true">↗</span>
        </Link>
      </footer>
    </div>
  );
}
