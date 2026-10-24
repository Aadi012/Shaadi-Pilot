import Image from 'next/image';
import { exampleWedding } from './homepage-data';
import { MarketingIcon } from './icon';
import styles from './homepage.module.css';

export function CelebrationSections() {
  return (
    <>
      <section
        className={styles.familySection}
        aria-labelledby="family-heading"
      >
        <div className={styles.container}>
          <div className={styles.familyGrid}>
            <div className={styles.familyImage}>
              <Image
                src="/marketing/wedding-family.jpg"
                alt="Family celebrating together at an Indian wedding"
                fill
                sizes="(max-width: 760px) 100vw, 50vw"
              />
              <div className={styles.familyPhotoNote}>
                <MarketingIcon name="heart" size={17} />
                <span>The best part? Doing it together.</span>
              </div>
            </div>
            <div className={styles.familyCopy}>
              <p className={styles.eyebrow}>Family collaboration</p>
              <h2 id="family-heading">
                A celebration
                <br />
                <em>planned together.</em>
              </h2>
              <p>
                Bring your parents, siblings and closest family into one shared
                wedding workspace. Everyone can help, and nothing gets lost.
              </p>
              <div className={styles.familyTasks}>
                {exampleWedding.tasks.map((task) => (
                  <div key={task.title}>
                    <span className={styles.familyAvatar}>{task.initials}</span>
                    <span>
                      <strong>{task.assignee}</strong>
                      <small>{task.title}</small>
                    </span>
                    <span
                      className={
                        task.status === 'Completed'
                          ? styles.successPill
                          : styles.pill
                      }
                    >
                      {task.status}
                    </span>
                  </div>
                ))}
              </div>
              <p className={styles.familyFootnote}>
                <MarketingIcon name="users" size={17} /> Individual accounts.
                One shared plan.
              </p>
            </div>
          </div>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="guests-heading">
        <div className={styles.container}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>For everyone on your guest list</p>
            <h2 id="guests-heading">
              Beautifully simple
              <br />
              <em>for your guests, too.</em>
            </h2>
            <p>
              No accounts. No complicated steps. Just a thoughtful way to be
              part of the celebration.
            </p>
          </div>
          <div className={styles.journeyGrid}>
            <article className={styles.journeyCard}>
              <span className={styles.stepNumber}>01</span>
              <h3>A personal invitation</h3>
              <p>
                A thoughtful email invitation with a private link to their
                invited functions.
              </p>
              <div className={styles.invitationMock}>
                <MarketingIcon name="mail" size={25} />
                <span>You’re invited</span>
                <strong>{exampleWedding.couple}</strong>
                <small>One wedding. So many memories to make.</small>
                <span className={styles.decorativeButton}>
                  Your personal invitation{' '}
                  <MarketingIcon name="arrow" size={13} />
                </span>
              </div>
            </article>
            <article className={styles.journeyCard}>
              <span className={styles.stepNumber}>02</span>
              <h3>An RSVP for every function</h3>
              <p>
                Guests respond to each invited function and let you know how
                many people are joining.
              </p>
              <div className={styles.rsvpMock}>
                {exampleWedding.functions
                  .filter((event) => event.name !== 'Wedding')
                  .map((event) => (
                    <div key={event.name}>
                      <span>
                        {event.name}
                        <small>{event.day} March</small>
                      </span>
                      <span className={styles.successPill}>
                        <MarketingIcon name="check" size={11} /> Attending · 4
                      </span>
                    </div>
                  ))}
              </div>
            </article>
            <article className={styles.journeyCard}>
              <span className={styles.stepNumber}>03</span>
              <h3>Memories, shared privately</h3>
              <p>
                Personal gallery links and QR codes let guests view and upload
                wedding photos.
              </p>
              <div className={styles.galleryMock}>
                <span className={styles.galleryIcon}>
                  <MarketingIcon name="camera" size={32} />
                </span>
                <strong>All the little moments.</strong>
                <span>One private wedding gallery.</span>
                <div className={styles.galleryBadge}>
                  <MarketingIcon name="link" size={13} /> Personal guest access
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>
      <section
        id="wedding-websites"
        className={styles.themesSection}
        aria-labelledby="themes-heading"
      >
        <div className={styles.container}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>
              A little corner of the internet, just for you
            </p>
            <h2 id="themes-heading">
              A beautiful space
              <br />
              <em>for your story.</em>
            </h2>
            <p>
              Choose a prebuilt theme, share your schedule and give guests one
              lovely place to find the details.
            </p>
          </div>
          <div className={styles.themesGrid}>
            <article className={styles.themeCard}>
              <div className={styles.editorialTheme}>
                <span>A & A · UDAIPUR</span>
                <div>
                  <i>A celebration of love</i>
                  <strong>
                    Aarav &<br />
                    Ananya
                  </strong>
                  <small>12—15 MARCH 2027</small>
                </div>
                <span>OUR STORY · THE CELEBRATIONS</span>
              </div>
              <div className={styles.themeDescription}>
                <span>01 / The Editorial</span>
                <h3>A little romance. A lot of character.</h3>
                <p>
                  Expressive serif type, soft colors and room for your story.
                </p>
              </div>
            </article>
            <article className={styles.themeCard}>
              <div className={styles.minimalTheme}>
                <span>THE WEDDING CELEBRATION OF</span>
                <div className={styles.monogram}>
                  A<span>&</span>A
                </div>
                <strong>Aarav & Ananya</strong>
                <span>UDAIPUR, RAJASTHAN · MARCH 2027</span>
                <div className={styles.themeRule} />
                <small>TOGETHER WITH OUR FAMILIES</small>
              </div>
              <div className={styles.themeDescription}>
                <span>02 / The Minimal</span>
                <h3>Simple, considered, completely yours.</h3>
                <p>Warm ivory, quiet details and a timeless sense of space.</p>
              </div>
            </article>
            <article className={styles.themeCard}>
              <div className={styles.classicTheme}>
                <div className={styles.classicFrame}>
                  <span>YOU ARE CORDIALLY INVITED</span>
                  <MarketingIcon name="sparkle" size={26} />
                  <strong>Aarav & Ananya</strong>
                  <i>A celebration of two families</i>
                  <span>12—15 MARCH 2027 · UDAIPUR</span>
                </div>
              </div>
              <div className={styles.themeDescription}>
                <span>03 / The Modern Classic</span>
                <h3>For a celebration to remember.</h3>
                <p>Deep plum, champagne touches and understated elegance.</p>
              </div>
            </article>
          </div>
          <p className={styles.themeNote}>Illustrative theme previews</p>
          <ul className={styles.websiteBenefits}>
            <li>
              <MarketingIcon name="calendar" size={17} /> Public celebration
              schedule
            </li>
            <li>
              <MarketingIcon name="pin" size={17} /> Venue details & directions
            </li>
            <li>
              <MarketingIcon name="play" size={17} /> Optional YouTube
              livestream
            </li>
          </ul>
        </div>
      </section>
      <section
        id="how-it-works"
        className={styles.section}
        aria-labelledby="steps-heading"
      >
        <div className={styles.container}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>
              Simple steps. Beautiful beginnings.
            </p>
            <h2 id="steps-heading">
              Start with your people.
              <br />
              <em>Bring the details together.</em>
            </h2>
            <p>A shared plan, from the first idea to the final celebration.</p>
          </div>
          <ol className={styles.setupSteps}>
            <li>
              <span>01</span>
              <h3>Create your wedding</h3>
              <p>
                Add your names, wedding date and location. Give every function
                its own place in the plan.
              </p>
            </li>
            <li>
              <span>02</span>
              <h3>Bring your family together</h3>
              <p>
                Invite your organizers, share responsibilities and keep everyone
                working from the same plan.
              </p>
            </li>
            <li>
              <span>03</span>
              <h3>Plan, invite and celebrate</h3>
              <p>
                Organize the details, send invitations and make more room for
                the moments that matter.
              </p>
            </li>
          </ol>
        </div>
      </section>
    </>
  );
}
