import { exampleWedding, formatExampleMoney } from './homepage-data';
import { MarketingIcon, type MarketingIconName } from './icon';
import styles from './homepage.module.css';

const previewNavigation: ReadonlyArray<{
  icon: MarketingIconName;
  label: string;
}> = [
  { icon: 'calendar', label: 'Overview' },
  { icon: 'calendar', label: 'Wedding events' },
  { icon: 'tasks', label: 'Family tasks' },
  { icon: 'users', label: 'Guests & RSVPs' },
  { icon: 'wallet', label: 'Expenses' },
  { icon: 'vendor', label: 'Saved vendors' },
];

export function WorkspacePreview() {
  const totalMinor = exampleWedding.expenses.reduce(
    (sum, item) => sum + item.amountMinor,
    0,
  );
  return (
    <section
      id="product-preview"
      className={styles.previewSection}
      aria-labelledby="preview-heading"
    >
      <div className={styles.container}>
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>One beautiful place to plan</p>
          <h2 id="preview-heading">
            Every detail, <em>finally together.</em>
          </h2>
          <p>
            Events, responsibilities, guests and spending—organized in one
            shared space.
          </p>
        </div>
        <div className={styles.workspace}>
          <div className={styles.workspaceTopbar}>
            <div className={styles.windowDots} aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <strong>{exampleWedding.couple}’s Wedding</strong>
            <span className={styles.exampleLabel}>Example workspace</span>
          </div>
          <div className={styles.workspaceBody}>
            <div className={styles.workspaceSidebar} aria-hidden="true">
              <span className={styles.sidebarLabel}>Our celebration</span>
              <ul>
                {previewNavigation.map((item) => (
                  <li key={item.label}>
                    <MarketingIcon name={item.icon} size={16} />
                    {item.label}
                  </li>
                ))}
              </ul>
              <div className={styles.sidebarWedding}>
                <MarketingIcon name="heart" size={20} />
                <strong>
                  One wedding.
                  <br />
                  Your whole family.
                </strong>
                <span>{exampleWedding.dates}</span>
              </div>
            </div>
            <div className={styles.workspaceContent}>
              <div className={styles.workspaceGreeting}>
                <div>
                  <span className={styles.eyebrow}>
                    A little clarity for your big day
                  </span>
                  <h3>Good morning, Ananya.</h3>
                </div>
                <span className={styles.pill}>Your wedding overview</span>
              </div>
              <div className={styles.metrics}>
                <div>
                  <span>Wedding functions</span>
                  <strong>04</strong>
                  <small>A week to remember</small>
                </div>
                <div>
                  <span>Tasks completed</span>
                  <strong>
                    18 <i>/ 24</i>
                  </strong>
                  <small>Everyone playing their part</small>
                </div>
                <div>
                  <span>Reception headcount</span>
                  <strong>280</strong>
                  <small>Confirmed attendees</small>
                </div>
                <div>
                  <span>Recorded expenses</span>
                  <strong>{formatExampleMoney(totalMinor)}</strong>
                  <small>Actual expenses paid</small>
                </div>
              </div>
              <div className={styles.workspacePanels}>
                <div className={styles.previewPanel}>
                  <h4>
                    Coming up next <MarketingIcon name="calendar" size={16} />
                  </h4>
                  {exampleWedding.functions.slice(0, 3).map((event) => (
                    <div className={styles.eventRow} key={event.name}>
                      <span className={styles.dateTile}>
                        <small>MAR</small>
                        {event.day}
                      </span>
                      <span>
                        <strong>{event.name}</strong>
                        <small>
                          {event.time} · {event.venue}
                        </small>
                      </span>
                    </div>
                  ))}
                </div>
                <div className={styles.previewPanel}>
                  <h4>
                    Family to-dos <MarketingIcon name="tasks" size={16} />
                  </h4>
                  {exampleWedding.tasks.map((task) => (
                    <div className={styles.taskRow} key={task.title}>
                      <span
                        className={
                          task.status === 'Completed'
                            ? styles.successPill
                            : styles.pill
                        }
                      >
                        {task.status}
                      </span>
                      <strong>{task.title}</strong>
                      <span className={styles.taskAssignee}>
                        <span className={styles.tinyAvatar}>
                          {task.initials}
                        </span>
                        {task.assignee}
                      </span>
                    </div>
                  ))}
                </div>
                <div className={styles.previewPanel}>
                  <h4>
                    Expense notes <MarketingIcon name="wallet" size={16} />
                  </h4>
                  <div className={styles.expenseTotal}>
                    <span>Total recorded</span>
                    <strong>{formatExampleMoney(totalMinor)}</strong>
                  </div>
                  {exampleWedding.expenses.map((expense) => (
                    <div className={styles.expenseRow} key={expense.label}>
                      <span>
                        {expense.label}
                        <small>Paid by {expense.paidBy}</small>
                      </span>
                      <strong>{formatExampleMoney(expense.amountMinor)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        <p className={styles.exampleCaption}>
          A glimpse of what’s ahead. All names, figures and wedding details
          shown are fictional examples.
        </p>
      </div>
    </section>
  );
}
