import { MarketingIcon } from './icon';
import styles from './homepage.module.css';

export function Brand() {
  return (
    <a href="#top" className={styles.brand} aria-label="ShaadiPilot home">
      <span className={styles.brandMark}>
        <MarketingIcon name="heart" size={17} />
      </span>
      <span>ShaadiPilot</span>
    </a>
  );
}
