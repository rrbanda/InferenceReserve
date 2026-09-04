import styles from './ComparisonTable.module.css';

const rows = [
  {
    dimension: 'Throughput Guarantee',
    shared: 'Best-effort, no minimum',
    pt: 'Contractual TPM commitment with SLA',
  },
  {
    dimension: 'Latency',
    shared: 'Variable, depends on cluster load',
    pt: 'Latency target attainment: 99% of requests meet TTFT target (e.g. ≤500 ms)',
  },
  {
    dimension: 'GPU Isolation',
    shared: 'Multi-tenant, shared nodes',
    pt: 'Phase 1: dedicated tainted nodes. Phase 2: evaluates logical isolation for better fleet utilisation.',
  },
  {
    dimension: 'Routing',
    shared: 'Round-robin or random',
    pt: 'Cache-aware intelligent routing via llm-d EPP',
  },
  {
    dimension: 'Overflow Handling',
    shared: 'HTTP 429 rate limiting',
    pt: 'Phase 1: 429 on overflow. Phase 2: pre-routing spillover to shared pool.',
  },
  {
    dimension: 'Observability',
    shared: 'Shared cluster metrics',
    pt: 'Per-tenant Grafana dashboard with SLA tracking',
  },
];

export default function ComparisonTable() {
  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Dimension</th>
            <th>Shared Serving</th>
            <th>Provisioned Throughput</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.dimension}>
              <td className={styles.dimensionCell}>{row.dimension}</td>
              <td>{row.shared}</td>
              <td className={styles.ptCell}>{row.pt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
