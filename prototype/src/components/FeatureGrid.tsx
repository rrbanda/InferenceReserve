import { motion } from 'framer-motion';
import { features } from '../data/features';
import styles from './FeatureGrid.module.css';

export default function FeatureGrid() {
  return (
    <div className={styles.grid}>
      {features.map((feature, i) => (
        <motion.div
          key={feature.id}
          className={styles.card}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ delay: i * 0.06, duration: 0.35 }}
        >
          <div className={styles.title}>{feature.title}</div>
          <div className={styles.description}>{feature.description}</div>
        </motion.div>
      ))}
    </div>
  );
}
