import Link from 'next/link';
import { MarketingIcon } from './icon';
import styles from './homepage.module.css';

export function Brand({ href = '#top' }: { href?: string }) {
  return (
    <Link href={href} className={styles.brand} aria-label="ShaadiPilot home">
      <span className={styles.brandMark}>
        <MarketingIcon name="heart" size={17} />
      </span>
      <span>ShaadiPilot</span>
    </Link>
  );
}
