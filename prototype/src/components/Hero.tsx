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
        <p className={styles.problemLabel}>The Problem</p>
        <h1 className={styles.title}>
          Your LLM inference has no capacity guarantee.
        </h1>
        <p className={styles.description}>
          Shared GPU pools mean unpredictable TTFT, 429 errors under load, and no SLA for production
          applications. Teams either accept the variability or build expensive private GPU clusters.
        </p>
        <p className={styles.solutionLabel}>Provisioned Throughput</p>
        <p className={styles.solutionText}>
          Reserve guaranteed tokens-per-minute for a model on dedicated GPUs, backed by a latency
          target attainment SLA and chargeback to your cost centre.
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
