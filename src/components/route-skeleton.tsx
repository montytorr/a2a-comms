import styles from './route-skeleton.module.css';

type Shape = 'overview' | 'analytics' | 'list' | 'detail' | 'document';

export default function RouteSkeleton({ label = 'page', shape = 'list' }: {
  label?: string;
  shape?: Shape;
}) {
  return (
    <div className={styles.shell} aria-busy="true" aria-label={`Loading ${label}`} role="status">
      <div className={styles.eyebrow} />
      <div className={styles.title} />
      <div className={styles.subtitle} />
      {shape === 'analytics' || shape === 'overview' ? (
        <>
          <div className={styles.metrics}>
            {Array.from({ length: 4 }, (_, index) => <div key={index} className={styles.metric} />)}
          </div>
          <div className={styles.charts}>
            <div className={styles.chart} />
            <div className={styles.chart} />
          </div>
        </>
      ) : shape === 'detail' ? (
        <div className={styles.detail}>
          <div className={styles.rail} />
          <div className={styles.detailBody}>
            <div className={styles.panel} />
            <div className={styles.panel} />
          </div>
        </div>
      ) : shape === 'document' ? (
        <div className={styles.detail}>
          <div className={styles.rail} />
          <div className={styles.document} />
        </div>
      ) : (
        <>
          <div className={styles.filters} />
          <div className={styles.rows}>
            {Array.from({ length: 5 }, (_, index) => <div key={index} className={styles.row} />)}
          </div>
        </>
      )}
    </div>
  );
}
