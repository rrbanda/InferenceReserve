import { motion } from 'framer-motion';
import { opportunities } from '../data/opportunities';
import styles from './OpportunityMap.module.css';

export default function OpportunityMap() {
  return (
    <div className={styles.wrapper}>
      <p className={styles.intro}>
        Four validated pain points drive the PT product hypothesis. Each maps directly to a PT
        capability. Evidence gates are defined in the user research plan.
      </p>
      <div className={styles.grid}>
        {opportunities.map((opp, i) => (
          <motion.div
            key={opp.id}
            className={styles.card}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08, duration: 0.35 }}
          >
            <div className={styles.segment}>{opp.segment}</div>
            <div className={styles.painLabel}>Pain</div>
            <div className={styles.pain}>{opp.pain}</div>
            <div className={styles.impact}>{opp.impact}</div>
            <div className={styles.arrow}>&#x2193;</div>
            <div className={styles.capLabel}>PT Capability</div>
            <div className={styles.capability}>{opp.ptCapability}</div>
            <div className={styles.evidence}>{opp.evidence}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
