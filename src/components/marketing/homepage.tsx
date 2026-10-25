import Image from 'next/image';
import Link from 'next/link';
import { Brand } from './brand';
import { CelebrationSections } from './celebration-sections';
import { exampleWedding, features, navigation } from './homepage-data';
import { MarketingIcon } from './icon';
import { SiteHeader } from './site-header';
import { WorkspacePreview } from './workspace-preview';
import styles from './homepage.module.css';

export function MarketingHomepage() {
  return (
    <div id="top">
      <a href="#main-content" className={styles.skipLink}>
        Skip to content
      </a>
      <SiteHeader />
      <main id="main-content">
        <section className={styles.hero} aria-labelledby="hero-heading">
          <div className={styles.container}>
            <div className={styles.heroGrid}>
              <div className={styles.heroCopy}>
                <p className={styles.eyebrow}>
                  <span className={styles.dot} /> Made for every moment that
                  matters
                </p>
                <h1 id="hero-heading">
                  Plan the wedding.
                  <br />
                  <em>Cherish the moments.</em>
                </h1>
                <p className={styles.heroDescription}>
                  From your first function to the final celebration, plan
                  everything together with the people who matter.
                </p>
                <div className={styles.heroActions}>
                  <Link href="/signup" className={styles.primaryButton}>
                    Start planning <MarketingIcon name="arrow" size={17} />
                  </Link>
                  <a href="#how-it-works" className={styles.textLink}>
                    See how it works <MarketingIcon name="arrow" size={17} />
                  </a>
                </div>
                <p className={styles.heroNote}>
                  <MarketingIcon name="heart" size={16} /> Made for Indian
                  weddings. Designed for the whole family.
                </p>
              </div>
              <div className={styles.heroVisual}>
                <div className={styles.heroImage}>
                  <Image
                    src="/marketing/wedding-couple.jpg"
                    alt="A couple sharing a joyful moment during their Indian wedding celebration"
                    fill
                    preload
                    sizes="(max-width: 760px) 100vw, 50vw"
                  />
                  <span className={styles.photoLabel}>
                    <MarketingIcon name="sparkle" size={13} /> A little less
                    planning. A lot more presence.
                  </span>
                </div>
                <div className={styles.invitePreview}>
                  <div className={styles.inviteHeader}>
                    <div>
                      <strong>{exampleWedding.couple}</strong>
                      <span>Our wedding week · Udaipur</span>
                    </div>
                    <span className={styles.pill}>4 functions</span>
                  </div>
                  <ul className={styles.miniSchedule}>
                    {exampleWedding.functions.map((event) => (
                      <li key={event.name}>
                        <span>
                          <i />
                          {event.name}
                        </span>
                        <span>
                          {event.day} March{' '}
                          <span className={styles.scheduleTime}>
                            · {event.time}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className={styles.inviteFooter}>
                    <div
                      className={styles.avatars}
                      aria-label="Five example family organizers"
                    >
                      <span>AN</span>
                      <span>AA</span>
                      <span>MS</span>
                      <span>RK</span>
                      <span>+1</span>
                    </div>
                    <span>One celebration. Together.</span>
                  </div>
                </div>
                <p className={styles.heroCaption}>
                  An illustrative wedding, made with love.
                </p>
              </div>
            </div>
          </div>
        </section>
        <WorkspacePreview />
        <section
          id="features"
          className={styles.section}
          aria-labelledby="features-heading"
        >
          <div className={styles.container}>
            <div className={styles.sectionHeading}>
              <p className={styles.eyebrow}>Thoughtfully put together</p>
              <h2 id="features-heading">
                Everything you need.
                <br />
                <em>Nothing you don’t.</em>
              </h2>
              <p>Thoughtful tools for every part of your celebration.</p>
            </div>
            <div className={styles.featureGrid}>
              {features.map((feature, index) => (
                <article className={styles.featureCard} key={feature.title}>
                  <span className={styles.featureIcon}>
                    <MarketingIcon name={feature.icon} size={24} />
                  </span>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                  <FeatureDetail index={index} />
                </article>
              ))}
            </div>
          </div>
        </section>
        <CelebrationSections />
        <section
          id="get-started"
          className={styles.closing}
          aria-labelledby="closing-heading"
        >
          <div className={styles.closingOrnament} aria-hidden="true">
            ✧
          </div>
          <p className={styles.eyebrow}>Your next beautiful chapter</p>
          <h2 id="closing-heading">
            More moments together.
            <br />
            <em>Less time organizing.</em>
          </h2>
          <p>
            Bring your people, plans and celebrations into one beautiful place.
          </p>
          <Link
            href="/signup"
            className={styles.signupButton}
            aria-describedby="signup-note"
          >
            Start planning <MarketingIcon name="arrow" size={17} />
          </Link>
          <p id="signup-note" className={styles.closingNote}>
            Create your organizer account and start your wedding workspace.
          </p>
        </section>
      </main>
      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerTop}>
            <div>
              <Brand />
              <p className={styles.tagline}>Plan together. Celebrate more.</p>
            </div>
            <nav aria-label="Footer navigation">
              {navigation.map((item) => (
                <a key={item.href} href={item.href}>
                  {item.label}
                </a>
              ))}
              <a href="#product-preview">Explore the preview</a>
            </nav>
          </div>
          <div className={styles.footerBottom}>
            <span>© {new Date().getFullYear()} ShaadiPilot.</span>
            <span>Made for the coming together of two families.</span>
            <a href="#top">Back to top ↑</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureDetail({ index }: { index: number }) {
  switch (index) {
    case 0:
      return (
        <div className={styles.featureDetail}>
          {exampleWedding.functions.slice(0, 2).map((event) => (
            <div key={event.name}>
              <span className={styles.miniDate}>MAR {event.day}</span>
              <span>
                {event.name}
                <small>
                  {event.time} · {event.venue}
                </small>
              </span>
            </div>
          ))}
        </div>
      );
    case 1:
      return (
        <div className={styles.featureDetail}>
          <div>
            <span className={styles.checkCircle}>
              <MarketingIcon name="check" size={12} />
            </span>
            <span>Confirm the Mehendi venue</span>
            <span className={styles.tinyAvatar}>AN</span>
          </div>
          <div>
            <span className={styles.emptyCircle} />
            <span>Choose the Sangeet playlist</span>
            <span className={styles.tinyAvatar}>RK</span>
          </div>
        </div>
      );
    case 2:
      return (
        <div className={styles.featureDetail}>
          <div>
            <span className={styles.tinyAvatar}>RS</span>
            <span>
              Rajesh Sharma<small>Reception · Party of 4</small>
            </span>
            <span className={styles.successPill}>Attending</span>
          </div>
        </div>
      );
    case 3:
      return (
        <div className={styles.featureDetail}>
          <div>
            <span>Venue deposit</span>
            <strong>₹2,50,000</strong>
          </div>
          <div>
            <span>Photography</span>
            <strong>₹85,000</strong>
          </div>
        </div>
      );
    case 4:
      return (
        <div className={styles.featureDetail}>
          <div>
            <span className={styles.vendorAvatar}>AF</span>
            <span>
              Aura Films<small>Photography · Udaipur</small>
            </span>
            <span className={styles.pill}>Saved</span>
          </div>
        </div>
      );
    default:
      return (
        <div
          className={styles.photoStrip}
          aria-label="Illustrative private gallery"
        >
          <div>
            <Image
              src="/marketing/wedding-couple.jpg"
              alt=""
              fill
              sizes="120px"
            />
          </div>
          <div>
            <Image
              src="/marketing/wedding-family.jpg"
              alt=""
              fill
              sizes="120px"
            />
          </div>
          <span>
            <MarketingIcon name="camera" size={22} />
            <small>Our memories</small>
          </span>
        </div>
      );
  }
}
