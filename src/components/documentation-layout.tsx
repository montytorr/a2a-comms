import type { ReactNode } from 'react';
import styles from './documentation-layout.module.css';

export function docSectionId(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function DocumentationLink({ href, number, children, count }: {
  href: string;
  number?: number;
  children: ReactNode;
  count?: number;
}) {
  return (
    <a className={styles.link} href={href}>
      {number !== undefined && <span className={styles.number}>{number}</span>}
      <span className={styles.label}>{children}</span>
      {count !== undefined && <span className={styles.count}>{count}</span>}
    </a>
  );
}

export function DocumentationLayout({ navigation, children }: { navigation: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.layout}>
      <aside className={styles.desktopNav} aria-label="Document sections">
        <div className={styles.navHeader}>On this page</div>
        <nav className={styles.links}>{navigation}</nav>
      </aside>
      <details className={styles.mobileNav}>
        <summary>On this page</summary>
        <nav className={styles.links} aria-label="Document sections">{navigation}</nav>
      </details>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
