import { motion } from 'framer-motion';
import styles from './PhaseRoadmap.module.css';

const phases = [
  {
    id: 1,
    title: 'Phase 1',
    subtitle: 'Full-GPU PT',
    timeline: 'First 3-4 months',
    delivers: [
      'Full-GPU PT on H100 NVL / H200 NVL',
      'Physical node isolation (taints + affinity)',
      'Flat chargeback rate (committed TPM x hours)',
      'Sizing calculator with burndown rate preview',
      'Per-tenant Grafana dashboards (auto-provisioned)',
      'Latency target attainment SLA (99% meet target, 99.5% availability)',
    ],
    builds: [
      'Reservation Manager + PT CRD',
      'PT Auth Service (ext_authz)',
      'Sizing Calculator API',
      'Dashboard templates (Grafana)',
      'Admission webhooks (business rules)',
    ],
    upstream: [
      'LLMInferenceService (KServe v0.17)',
      'llm-d EPP (auto-provisioned)',
      'InferencePool + HTTPRoute (auto-provisioned)',
      'NVIDIA GPU Operator + DCGM',
      'Kueue (GPU quota)',
    ],
    openQuestions: [
      'LLMInferenceService in air-gapped OpenShift (TF-6 — critical path)',
      'H100 NVL throughput benchmarks (TF-2 — pricing depends on this)',
      'Physical isolation stress test (TA-03)',
    ],
  },
  {
    id: 2,
    title: 'Phase 2',
    subtitle: 'Enforcement + Chargeback',
    timeline: 'Months 4-6',
    delivers: [
      'Request-level TPM enforcement at the gateway',
      'Pre-routing spillover to shared pool',
      'Burndown-rate chargeback pipeline (input/output/cached)',
      'Monthly chargeback reports per cost centre',
      'Logical isolation evaluation (InferenceObjective priority)',
      'Per-request routing control (dedicated / shared header)',
    ],
    builds: [
      'Pre-routing quota check in Auth Service',
      'Chargeback Pipeline (token aggregation + burndown)',
      'SLA credit automation',
    ],
    upstream: [
      'Envoy AI Gateway BackendTrafficPolicy (limit.fromMetadata)',
      'InferenceObjective (alpha) for priority scheduling',
      'vLLM per-request metrics',
    ],
    openQuestions: [
      'Envoy AI Gateway tagged release for air-gap (TF-9)',
      'InferenceObjective cross-pool priority behavior',
      'Logical isolation vs physical isolation SLA impact',
    ],
  },
  {
    id: 3,
    title: 'Phase 3',
    subtitle: 'MIG Sub-GPU Tiers',
    timeline: 'Months 6-9',
    delivers: [
      'MIG sub-GPU PT tiers on A100 80GB',
      'Micro (1g.10gb), Small (2g.20gb), Medium (3g.40gb)',
      'Embedding models and small LLMs at sub-GPU granularity',
      'Hardware-level isolation between MIG partitions',
    ],
    builds: [
      'MIG-aware sizing profiles',
      'Reservation Manager extension for MIG tiers',
      'MIG reconfiguration runbook',
    ],
    upstream: [
      'MIG profiles (operational on A100)',
      'NVIDIA GPU Operator MIG Manager',
      'DCGM MIG-instance metrics',
    ],
    openQuestions: [
      'MIG reconfiguration without node drain (TA-08)',
      'NVIDIA Run:ai build-vs-buy for scheduling (R-07)',
    ],
  },
  {
    id: 4,
    title: 'Phase 4',
    subtitle: 'Disaggregated Serving',
    timeline: 'Months 9-12+',
    delivers: [
      'PT for 70B+ and MoE models via llm-d',
      'Disaggregated prefill/decode with KV cache transfer',
      'Two-dimensional reservation model (prefill + decode capacity)',
    ],
    builds: [
      'Prefill/decode pool sizing profiles',
      'RDMA fabric validation and procurement',
    ],
    upstream: [
      'llm-d disaggregation + NIXL KV transfer',
      'LLMInferenceService worker block (LeaderWorkerSet)',
    ],
    openQuestions: [
      'InfiniBand / RoCE RDMA availability between nodes (TA-07)',
      'TCP-only networking makes this non-viable per NVIDIA benchmarks',
    ],
  },
];

export default function PhaseRoadmap() {
  return (
    <div className={styles.wrapper}>
      <p className={styles.intro}>
        Each phase builds on the previous one. Phase 1 is the MVP that validates the product with a
        single pilot tenant. Dependencies and open questions are listed per phase.
      </p>
      <div className={styles.timeline}>
        {phases.map((phase, i) => (
          <motion.div
            key={phase.id}
            className={styles.phase}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1, duration: 0.35 }}
          >
            <div className={styles.phaseHeader}>
              <div className={styles.phaseNumber}>{phase.id}</div>
              <div>
                <div className={styles.phaseTitle}>{phase.title}: {phase.subtitle}</div>
                <div className={styles.phaseTimeline}>{phase.timeline}</div>
              </div>
            </div>

            <div className={styles.columns}>
              <div className={styles.col}>
                <div className={styles.colTitle}>Delivers</div>
                <ul className={styles.list}>
                  {phase.delivers.map((d) => <li key={d}>{d}</li>)}
                </ul>
              </div>
              <div className={styles.col}>
                <div className={styles.colTitleBuild}>Custom Build</div>
                <ul className={styles.list}>
                  {phase.builds.map((b) => <li key={b}>{b}</li>)}
                </ul>
                <div className={styles.colTitleUpstream}>Upstream (use)</div>
                <ul className={styles.list}>
                  {phase.upstream.map((u) => <li key={u}>{u}</li>)}
                </ul>
              </div>
              <div className={styles.col}>
                <div className={styles.colTitleRisk}>Open Questions</div>
                <ul className={styles.listRisk}>
                  {phase.openQuestions.map((q) => <li key={q}>{q}</li>)}
                </ul>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
