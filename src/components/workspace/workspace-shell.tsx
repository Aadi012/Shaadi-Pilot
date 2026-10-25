'use client';
import { useRef, useState } from 'react';
import { Brand } from '@/components/marketing/brand';
import {
  MarketingIcon,
  type MarketingIconName,
} from '@/components/marketing/icon';
import { LogoutButton } from '@/components/auth/logout-button';
import type { WeddingDto } from '@/modules/weddings/contracts';
import { formatWeddingDate } from '@/modules/weddings/calendar';
import styles from './workspace.module.css';
const navigation: { label: string; icon: MarketingIconName; group: string }[] =
  [
    { label: 'Overview', icon: 'globe', group: 'Planning dashboard' },
    { label: 'Functions', icon: 'calendar', group: '' },
    { label: 'Tasks', icon: 'tasks', group: '' },
    { label: 'Guests & RSVPs', icon: 'users', group: '' },
    { label: 'Expenses', icon: 'wallet', group: '' },
    { label: 'Vendors', icon: 'vendor', group: '' },
    { label: 'Wedding website', icon: 'globe', group: 'Celebration' },
    { label: 'Gallery', icon: 'camera', group: '' },
    { label: 'Livestream', icon: 'play', group: '' },
    { label: 'Team', icon: 'users', group: 'Management' },
    { label: 'Settings', icon: 'sparkle', group: '' },
  ];
export function WorkspaceShell({
  children,
  wedding,
  name,
  role,
}: {
  children?: React.ReactNode;
  wedding: WeddingDto;
  name: string;
  role: 'admin' | 'manager';
}) {
  const drawer = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  function nav() {
    return (
      <>
        <Brand href="/account" />
        <div className={styles.weddingIdentity}>
          <strong>
            {wedding.displayNames.partnerOne} &{' '}
            {wedding.displayNames.partnerTwo}
          </strong>
          <small>
            {formatWeddingDate(wedding.weddingDate)} · {wedding.location}
          </small>
        </div>
        <nav aria-label="Wedding workspace">
          {navigation
            .filter((item) => role === 'admin' || item.label !== 'Team')
            .map((item) => (
              <div key={item.label}>
                {item.group && <p className={styles.navGroup}>{item.group}</p>}
                {item.label === 'Overview' ? (
                  <a
                    href="/account"
                    aria-current="page"
                    className={styles.navActive}
                  >
                    <MarketingIcon name={item.icon} size={17} />
                    {item.label}
                  </a>
                ) : (
                  <button disabled title="Available in an upcoming update">
                    <MarketingIcon name={item.icon} size={17} />
                    {item.label}
                    {item.label === 'Team' && <small>Admin</small>}
                  </button>
                )}
              </div>
            ))}
        </nav>
        <p className={styles.navHint}>Planning modules are coming next.</p>
        <div className={styles.sidebarProfile}>
          <span className={styles.avatar}>{name.slice(0, 1)}</span>
          <div>
            <strong>{name}</strong>
            <small>{role === 'admin' ? 'Admin' : 'Manager'}</small>
          </div>
          <LogoutButton className={styles.textButton} />
        </div>
      </>
    );
  }
  return (
    <div className={styles.workspace}>
      <a href="#workspace-content" className={styles.skipLink}>
        Skip to overview
      </a>
      <aside className={styles.sidebar}>{nav()}</aside>
      <dialog
        id="workspace-navigation"
        ref={drawer}
        className={styles.drawer}
        onClose={() => setOpen(false)}
      >
        <button
          className={styles.closeMenu}
          onClick={() => drawer.current?.close()}
          aria-label="Close navigation"
        >
          <MarketingIcon name="close" />
        </button>
        {nav()}
      </dialog>
      <div className={styles.workspaceBody}>
        <header className={styles.workspaceHeader}>
          <button
            className={styles.menuButton}
            onClick={() => {
              drawer.current?.showModal();
              setOpen(true);
            }}
            aria-label="Open navigation"
            aria-controls="workspace-navigation"
            aria-expanded={open}
          >
            <MarketingIcon name="menu" />
          </button>
          <div>
            <strong>
              {wedding.displayNames.partnerOne} &{' '}
              {wedding.displayNames.partnerTwo}
            </strong>
            <small>Workspace overview</small>
          </div>
          <span className={styles.badge}>Private workspace</span>
          <span className={styles.avatar} aria-label={name}>
            {name.slice(0, 1)}
          </span>
        </header>
        <main id="workspace-content" className={styles.overviewMain}>
          {children}
        </main>
      </div>
    </div>
  );
}
