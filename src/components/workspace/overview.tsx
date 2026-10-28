import Link from 'next/link';
import {
  MarketingIcon,
  type MarketingIconName,
} from '@/components/marketing/icon';
import { WorkspaceShell } from './workspace-shell';
import {
  daysUntilWedding,
  formatWeddingDate,
} from '@/modules/weddings/calendar';
import type { WeddingDto } from '@/modules/weddings/contracts';
import styles from './workspace.module.css';
type Counts = {
  functions: number;
  tasks: number;
  guests: number;
  expenseRecords: number;
  upcoming?: {
    id: string;
    title: string;
    startsAt: string;
    timezone: string;
  }[];
};
export function WeddingOverview({
  wedding,
  counts,
  name,
  role,
  now,
}: {
  wedding: WeddingDto;
  counts: Counts;
  name: string;
  role: 'admin' | 'manager';
  now: string;
}) {
  const days = daysUntilWedding(wedding.weddingDate, wedding.timezone, now);
  const setup: {
    icon: MarketingIconName;
    title: string;
    copy: string;
    action: string;
    admin?: boolean;
  }[] = [
    {
      icon: 'calendar',
      title: 'Add your first function',
      copy: 'Make room for Mehendi, Sangeet, Pheras and every celebration.',
      action: 'Add function',
    },
    {
      icon: 'users',
      title: 'Invite co-organizers',
      copy: 'Bring your partner, family or planner into your shared workspace.',
      action: 'Invite organizer',
      admin: true,
    },
    {
      icon: 'tasks',
      title: 'Create your first task',
      copy: 'A little list for the details you don’t want to forget.',
      action: 'Create task',
    },
    {
      icon: 'mail',
      title: 'Add guest contacts',
      copy: 'Keep your people and their function invitations organized.',
      action: 'Add guests',
    },
  ];
  return (
    <WorkspaceShell wedding={wedding} name={name} role={role}>
      <div className={styles.overviewIntro}>
        <div>
          <p className={styles.eyebrow}>
            {role === 'admin' ? 'Admin workspace' : 'Manager workspace'} · One
            shared celebration
          </p>
          <h1>
            Welcome to your wedding sanctuary, <em>{name.split(' ')[0]}.</em>
          </h1>
          <p>
            Your shared family workspace is ready. Take things step by step,
            <br />
            and make a little more room for the moments that matter.
          </p>
        </div>
        <div className={styles.destination}>
          <MarketingIcon name="pin" />
          <div>
            <strong>{wedding.location}</strong>
            <small>{formatWeddingDate(wedding.weddingDate)}</small>
            <small>
              {days > 0
                ? `${days} days to go`
                : days === 0
                  ? 'Your wedding day'
                  : 'Your celebration, remembered'}
            </small>
          </div>
        </div>
      </div>
      <section aria-labelledby="first-steps">
        <div className={styles.blockHeading}>
          <div>
            <p className={styles.eyebrow}>First milestones</p>
            <h2 id="first-steps">Your first steps, together</h2>
          </div>
          <small>One thing at a time.</small>
        </div>
        <div className={styles.setupCards}>
          {setup
            .filter((item) => !item.admin || role === 'admin')
            .map((item) => (
              <article key={item.title}>
                <div className={styles.iconBadge}>
                  <MarketingIcon name={item.icon} />
                </div>
                {item.admin && (
                  <small className={styles.adminTag}>Admin only</small>
                )}
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
                {item.admin ? (
                  <Link href="/account/team">{item.action} →</Link>
                ) : (
                  <button disabled>
                    {item.action} <span>Coming next</span>
                  </button>
                )}
              </article>
            ))}
        </div>
        <p className={styles.phaseNote}>
          Your wedding is saved. Admins can now invite Managers from Team.
          Function planning, tasks and guest invitations are coming in later
          updates.
        </p>
      </section>
      <section aria-labelledby="indicators">
        <div className={styles.blockHeading}>
          <h2 id="indicators">Workspace indicators</h2>
          <small>Private wedding records</small>
        </div>
        <div className={styles.metrics}>
          {[
            {
              label: 'Functions scheduled',
              value: counts.functions,
              unit: 'functions',
              icon: 'calendar' as const,
            },
            {
              label: 'Active tasks',
              value: counts.tasks,
              unit: 'incomplete tasks',
              icon: 'tasks' as const,
            },
            {
              label: 'Guest contacts',
              value: counts.guests,
              unit: 'contacts',
              icon: 'users' as const,
            },
            {
              label: 'Recorded expenses',
              value: counts.expenseRecords === 0 ? '₹0' : '—',
              unit:
                counts.expenseRecords === 0
                  ? 'No expenses recorded'
                  : 'Totals available with expense tracking',
              icon: 'wallet' as const,
            },
          ].map((item) => (
            <article key={item.label}>
              <div>
                <h3>{item.label}</h3>
                <MarketingIcon name={item.icon} size={16} />
              </div>
              <strong>{item.value}</strong>
              <small>{item.unit}</small>
            </article>
          ))}
        </div>
        <p className={styles.phaseNote}>
          Expenses track actual recorded spending. This is not a budget or a
          bank balance.
        </p>
      </section>
      <div className={styles.overviewColumns}>
        <div>
          <section className={styles.overviewPanel}>
            <div className={styles.panelHeading}>
              <p className={styles.eyebrow}>Chronology</p>
              <h2>Upcoming functions</h2>
            </div>
            {counts.upcoming?.map((event) => (
              <p key={event.id}>
                <Link href="/account/functions">{event.title}</Link>
                <br />
                <small>
                  {new Intl.DateTimeFormat('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: event.timezone,
                  }).format(new Date(event.startsAt))}{' '}
                  · {event.timezone}
                </small>
              </p>
            ))}
            <div className={styles.emptyState}>
              <span className={styles.iconBadge}>
                <MarketingIcon name="calendar" size={27} />
              </span>
              <h3>
                {counts.functions === 0
                  ? 'No wedding functions added yet'
                  : 'Your functions are in your workspace'}
              </h3>
              <p>
                From Haldi to Reception, give each celebration its own date and
                place. Function planning is the next milestone.
              </p>
              <Link href="/account/functions" className={styles.primaryButton}>
                Manage functions
              </Link>
            </div>
          </section>
          <section className={styles.overviewPanel}>
            <div className={styles.panelHeading}>
              <p className={styles.eyebrow}>Attendance tracker</p>
              <h2>Guest RSVPs by function</h2>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <caption className={styles.srOnly}>
                  RSVP summaries will be shown separately for each function.
                </caption>
                <thead>
                  <tr>
                    {[
                      'Function',
                      'Invited',
                      'Attending',
                      'Declined',
                      'Awaiting',
                    ].map((value) => (
                      <th key={value} scope="col">
                        {value}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={5}>
                      <MarketingIcon name="users" size={25} />
                      <p>
                        Function invitations and RSVPs are coming in a later
                        update.
                        <br />
                        No attendance responses have been collected through
                        ShaadiPilot yet.
                      </p>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
        <div>
          <section className={styles.overviewPanel}>
            <div className={styles.panelHeading}>
              <p className={styles.eyebrow}>Action registry</p>
              <h2>Your task queue</h2>
            </div>
            <div className={styles.emptyState}>
              <span className={styles.iconBadge}>
                <MarketingIcon name="check" size={27} />
              </span>
              <h3>
                {counts.tasks === 0
                  ? 'A little space to begin'
                  : 'Your planning tasks'}
              </h3>
              <p>
                Keep photographer calls, venue visits and family to-dos
                together. Task planning is coming next.
              </p>
            </div>
          </section>
          <section className={styles.rolePanel}>
            <MarketingIcon name="users" size={24} />
            <h2>
              A shared plan.
              <br />
              Clear responsibilities.
            </h2>
            <p>
              <strong>Admins</strong> manage organizer membership and wedding
              planning.
            </p>
            <p>
              <strong>Managers</strong> collaborate on wedding planning.
              Membership controls are reserved for Admins.
            </p>
            <small>
              Your current role: {role === 'admin' ? 'Admin' : 'Manager'}
            </small>
          </section>
          <section className={styles.privateNote}>
            <MarketingIcon name="globe" size={20} />
            <p>
              <strong>Your wedding website is unpublished.</strong>
              <br />
              Creating this workspace hasn’t made your plans public. Website
              publishing comes later.
            </p>
          </section>
        </div>
      </div>
    </WorkspaceShell>
  );
}
