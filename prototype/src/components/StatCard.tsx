import styles from './StatCard.module.css';

interface StatCardProps {
  value: string;
  label: string;
  accentColor?: string;
}

export default function StatCard({ value, label, accentColor }: StatCardProps) {
  return (
    <div
      className={styles.card}
      style={accentColor ? { borderTopColor: accentColor } : undefined}
    >
      <div className={styles.value}>{value}</div>
      <div className={styles.label}>{label}</div>
    </div>
  );
}
