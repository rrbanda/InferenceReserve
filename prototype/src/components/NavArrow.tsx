import { motion } from 'framer-motion';
import styles from './NavArrow.module.css';

interface NavArrowProps {
  onNext: () => void;
  onPrev: () => void;
  hasNext: boolean;
  hasPrev: boolean;
  nextLabel?: string;
  prevLabel?: string;
}

export default function NavArrow({ onNext, onPrev, hasNext, hasPrev, nextLabel, prevLabel }: NavArrowProps) {
  return (
    <div className={styles.container}>
      {hasPrev ? (
        <motion.button
          className={styles.arrow}
          onClick={onPrev}
          title={prevLabel || 'Previous'}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path d="M12 4L6 10L12 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {prevLabel && <span className={styles.label}>{prevLabel}</span>}
        </motion.button>
      ) : (
        <div />
      )}
      {hasNext ? (
        <motion.button
          className={`${styles.arrow} ${styles.next}`}
          onClick={onNext}
          title={nextLabel || 'Next'}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {nextLabel && <span className={styles.label}>{nextLabel}</span>}
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path d="M8 4L14 10L8 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </motion.button>
      ) : (
        <div />
      )}
    </div>
  );
}
