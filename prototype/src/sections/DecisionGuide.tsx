import { motion } from 'framer-motion';
import SectionHeader from '../components/SectionHeader';
import styles from './DecisionGuide.module.css';

const criteria = [
  {
    question: 'Does your workload need a guaranteed TTFT below a specific threshold?',
    yes: 'Continue to next question.',
    no: 'Shared serving is sufficient. No PT needed.',
  },
  {
    question: 'Is your traffic pattern predictable (steady production load, not bursty)?',
    yes: 'Continue to next question.',
    no: 'Shared serving with retry logic. PT requires predictable traffic to sustain 70% utilisation.',
  },
  {
    question: 'Is your peak throughput above 50,000 TPM?',
    yes: 'Continue to next question.',
    no: 'Shared serving. Below 50K TPM, the chargeback overhead of PT is not justified.',
  },
  {
    question: 'Can your team sustain above 70% average utilisation of the reserved capacity?',
    yes: 'Continue to next question.',
    no: 'Shared serving. PT at below 70% utilisation does not recover costs.',
  },
  {
    question: 'Must inference data stay on-prem (air-gap, data residency, compliance)?',
    yes: 'Use Provisioned Throughput. Cloud PT is not available for your workload.',
    no: 'Evaluate cloud PT (Vertex AI, Azure PTU) vs on-prem PT based on cost and ops preference.',
  },
];

const recommendations = [
  {
    workload: 'Experimental or low-volume inference',
    peakTpm: '< 50K TPM',
    recommendation: 'Shared serving',
    reason: 'Volume does not justify commitment overhead.',
  },
  {
    workload: 'Production with steady traffic',
    peakTpm: '50K - 200K TPM',
    recommendation: 'PT at 80% of peak',
    reason: 'Predictable traffic, chargeback lower than self-managed GPU cost.',
  },
  {
    workload: 'High-volume production',
    peakTpm: '200K - 1M TPM',
    recommendation: 'PT at 85-90% of peak',
    reason: 'Strong chargeback economics. Dedicated node pool.',
  },
  {
    workload: 'Regulated / air-gapped',
    peakTpm: 'Any',
    recommendation: 'PT (only option)',
    reason: 'Cloud PT unavailable. On-prem PT is the only path to guaranteed throughput.',
  },
];

export default function DecisionGuide() {
  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <SectionHeader
          title="Decision Guide"
          subtitle="When to use Provisioned Throughput"
          description="Work through these questions to determine whether PT is the right consumption model for your workload. This is a technical decision framework, not a sales pitch."
        />

        <div className={styles.flowTitle}>Decision Flowchart</div>
        <div className={styles.flow}>
          {criteria.map((c, i) => (
            <motion.div
              key={i}
              className={styles.flowStep}
              initial={{ opacity: 0, x: -12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.3 }}
            >
              <div className={styles.stepNumber}>{i + 1}</div>
              <div className={styles.stepBody}>
                <div className={styles.question}>{c.question}</div>
                <div className={styles.answers}>
                  <div className={styles.yes}><span className={styles.badge}>Yes</span> {c.yes}</div>
                  <div className={styles.no}><span className={styles.badgeNo}>No</span> {c.no}</div>
                </div>
              </div>
            </motion.div>
          ))}
          <div className={styles.flowResult}>
            If you answered Yes to all five questions, use Provisioned Throughput.
          </div>
        </div>

        <div className={styles.tableTitle}>Sizing Recommendations by Workload</div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Workload Type</th>
                <th>Peak TPM</th>
                <th>Recommendation</th>
                <th>Rationale</th>
              </tr>
            </thead>
            <tbody>
              {recommendations.map((r) => (
                <tr key={r.workload}>
                  <td className={styles.workloadCell}>{r.workload}</td>
                  <td>{r.peakTpm}</td>
                  <td className={styles.recCell}>{r.recommendation}</td>
                  <td>{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
