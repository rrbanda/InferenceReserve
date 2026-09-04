import styles from './SubTabs.module.css';

interface SubTabsProps {
  tabs: string[];
  active: string;
  onChange: (tab: string) => void;
}

export default function SubTabs({ tabs, active, onChange }: SubTabsProps) {
  return (
    <div className={styles.container}>
      {tabs.map((tab) => (
        <button
          key={tab}
          className={`${styles.tab} ${active === tab ? styles.active : ''}`}
          onClick={() => onChange(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
