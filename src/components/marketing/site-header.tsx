'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Brand } from './brand';
import { navigation } from './homepage-data';
import { MarketingIcon } from './icon';
import styles from './homepage.module.css';

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        document.getElementById('menu-toggle')?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Brand />
        <nav className={styles.desktopNav} aria-label="Main navigation">
          {navigation.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className={styles.headerActions}>
          <Link href="/login" className={styles.loginLink}>
            Log in
          </Link>
          <Link href="/signup" className={styles.smallButton}>
            Start planning <MarketingIcon name="arrow" size={15} />
          </Link>
        </div>
        <button
          id="menu-toggle"
          type="button"
          className={styles.menuToggle}
          aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <MarketingIcon name={menuOpen ? 'close' : 'menu'} />
        </button>
      </div>
      <nav
        id="mobile-navigation"
        className={styles.mobileNav}
        aria-label="Mobile navigation"
        hidden={!menuOpen}
      >
        {navigation.map((item) => (
          <a
            key={item.href}
            href={item.href}
            onClick={() => setMenuOpen(false)}
          >
            {item.label}
          </a>
        ))}
        <Link href="/signup" onClick={() => setMenuOpen(false)}>
          Start planning <MarketingIcon name="arrow" size={16} />
        </Link>
        <Link href="/login" onClick={() => setMenuOpen(false)}>
          Log in
        </Link>
        <span>Your celebration starts here</span>
      </nav>
    </header>
  );
}
