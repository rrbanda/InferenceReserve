import styles from './SectionHeader.module.css';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  description?: string;
  variant?: 'white' | 'navy';
}

export default function SectionHeader({ title, subtitle, description, variant = 'white' }: SectionHeaderProps) {
  const wrapperClass = variant === 'navy' ? styles.wrapperNavy : styles.wrapper;

  return (
    <div className={wrapperClass}>
      <h2 className={styles.title}>{title}</h2>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      {description && <p className={styles.description}>{description}</p>}
    </div>
  );
}
