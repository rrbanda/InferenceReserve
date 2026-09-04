import { AnimatePresence, motion } from 'framer-motion';
import CodeBlock from './CodeBlock';
import styles from './JourneyStep.module.css';

interface JourneyStepProps {
  stepNumber: number;
  title: string;
  subtitle: string;
  description: string;
  codeExample: string;
  codeLabel: string;
  isExpanded: boolean;
  onToggle: () => void;
}

export default function JourneyStep({
  stepNumber,
  title,
  subtitle,
  description,
  codeExample,
  codeLabel,
  isExpanded,
  onToggle,
}: JourneyStepProps) {
  return (
    <div className={styles.card}>
      <div className={styles.header} onClick={onToggle}>
        <div className={isExpanded ? styles.stepNumberActive : styles.stepNumber}>
          {stepNumber}
        </div>
        <div className={styles.titleGroup}>
          <div className={styles.title}>{title}</div>
          <div className={styles.subtitle}>{subtitle}</div>
        </div>
        <span className={isExpanded ? styles.chevronOpen : styles.chevron}>▾</span>
      </div>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className={styles.body}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <p className={styles.description}>{description}</p>
            <CodeBlock code={codeExample} language={codeLabel} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
