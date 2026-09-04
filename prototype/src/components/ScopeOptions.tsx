import { motion } from 'framer-motion';
import styles from './ScopeOptions.module.css';

const options = [
  {
    id: 'A',
    title: 'Option A',
    timeline: '4–6 weeks',
    description:
      'Static allocation MVP: manual GPU reservation via namespace taints, basic Grafana dashboard, no intelligent routing. Proves isolation and SLA concepts.',
    effort: '2 engineers · Low integration risk',
    highlighted: false,
  },
  {
    id: 'B',
    title: 'Option B',
    timeline: '3–4 months',
    description:
      'Full internal PT product: CRD-driven lifecycle, llm-d cache-aware routing, per-tenant dashboards, chargeback metering, sizing calculator. Production-ready for first internal tenants. Spillover and burndown-rate chargeback in Phase 2.',
    effort: '4 engineers · Moderate integration risk',
    highlighted: true,
  },
  {
    id: 'C',
    title: 'Option C',
    timeline: '6–9 months',
    description:
      'Enterprise scale: logical isolation via InferenceObjective, LoRA-aware routing, self-service portal, burndown-rate chargeback pipeline, SLA credits automation. Future: external customer support.',
    effort: '6+ engineers · Higher integration risk',
    highlighted: false,
  },
];

export default function ScopeOptions() {
  return (
    <div className={styles.wrapper}>
      {options.map((opt, i) => (
        <motion.div
          key={opt.id}
          className={opt.highlighted ? styles.highlighted : styles.card}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.1, duration: 0.35 }}
        >
          <div className={styles.label}>
            {opt.highlighted ? '★ Recommended' : `Option ${opt.id}`}
          </div>
          <div className={styles.title}>{opt.title}</div>
          <div className={styles.timeline}>{opt.timeline}</div>
          <div className={styles.description}>{opt.description}</div>
          <div className={styles.effort}>{opt.effort}</div>
        </motion.div>
      ))}
    </div>
  );
}
