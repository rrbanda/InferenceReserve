import { ReactNode } from 'react';
import styles from './DashboardPanel.module.css';

interface DashboardPanelProps {
  title: string;
  timeRange?: string;
  children: ReactNode;
}

export default function DashboardPanel({ title, timeRange = 'Last 24 hours', children }: DashboardPanelProps) {
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        <span className={styles.timeRange}>{timeRange}</span>
      </div>
      <div className={styles.chartArea}>{children}</div>
    </div>
  );
}
