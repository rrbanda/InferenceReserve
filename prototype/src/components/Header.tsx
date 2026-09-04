import styles from './Header.module.css';

export interface NavSection {
  id: string;
  label: string;
  shortLabel?: string;
}

export const sections: NavSection[] = [
  { id: 'overview', label: 'Problem + Solution', shortLabel: 'Problem' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'decision', label: 'Decision Guide', shortLabel: 'Decision' },
  { id: 'consumer', label: 'Consumer Journey', shortLabel: 'Consumer' },
  { id: 'producer', label: 'Producer Journey', shortLabel: 'Producer' },
  { id: 'dashboard', label: 'Dashboards' },
  { id: 'calculator', label: 'Sizing Calculator', shortLabel: 'Calculator' },
];

interface HeaderProps {
  activeSection: string;
  onNavigate: (id: string) => void;
}

export default function Header({ activeSection, onNavigate }: HeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <span className={styles.logo} onClick={() => onNavigate('overview')}>
          InferenceReserve
        </span>
        <nav className={styles.nav}>
          {sections.map((section) => (
            <button
              key={section.id}
              className={`${styles.navLink} ${activeSection === section.id ? styles.active : ''}`}
              onClick={() => onNavigate(section.id)}
            >
              {section.shortLabel || section.label}
            </button>
          ))}
        </nav>
      </div>
      <div className={styles.progressTrack}>
        <div
          className={styles.progressFill}
          style={{
            width: `${((sections.findIndex(s => s.id === activeSection) + 1) / sections.length) * 100}%`
          }}
        />
      </div>
    </header>
  );
}
