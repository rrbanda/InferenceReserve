import { motion } from 'framer-motion';
import StatCard from './StatCard';
import styles from './Hero.module.css';

export default function Hero() {
  return (
    <section className={styles.hero}>
      <motion.div
        className={styles.inner}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h1 className={styles.title}>Provisioned Throughput</h1>
        <p className={styles.description}>
          Guaranteed, SLA-bound inference capacity with dedicated GPU isolation — built on upstream Kubernetes-native AI infrastructure.
        </p>
        <div className={styles.stats}>
          <StatCard value="99.5%" label="Availability SLA" />
          <StatCard value="99% Target" label="TTFT Attainment SLA" />
          <StatCard value="Isolated" label="GPU Isolation" />
        </div>
      </motion.div>
    </section>
  );
}
