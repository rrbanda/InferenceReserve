export interface Feature {
  id: number;
  title: string;
  description: string;
}

export const features: Feature[] = [
  {
    id: 1,
    title: 'Guaranteed TPM with Latency Target Attainment SLA',
    description:
      'Dedicated vLLM replicas are always warm, delivering guaranteed tokens-per-minute throughput. 99% of requests within committed TPM meet the published TTFT target for the model and tier.',
  },
  {
    id: 2,
    title: 'GPU Isolation',
    description:
      'Phase 1: physical isolation via node taints — no shared workloads on PT hardware. Phase 2: evaluates logical isolation via InferenceObjective priority for better fleet utilisation.',
  },
  {
    id: 3,
    title: 'Cache-Aware Intelligent Routing',
    description:
      'The llm-d Endpoint Picker scores pods by prefix-cache hit ratio, KV-cache utilisation, and queue depth to route each request optimally.',
  },
  {
    id: 4,
    title: 'Spillover to Shared Pool',
    description:
      'Phase 1: dedicated pods only, 429 on overflow. Phase 2: pre-routing quota check spills overflow to the shared pool transparently. Tenants can opt into strict mode (dedicated only) via header.',
  },
  {
    id: 5,
    title: 'Per-Request Routing Control',
    description:
      'Set the X-PT-Request-Type header to "dedicated" or "shared" on each request for fine-grained control over where inference executes.',
  },
  {
    id: 6,
    title: 'Per-Tenant Dashboard',
    description:
      'Grafana dashboards are auto-provisioned per reservation showing real-time TPM, TTFT, GPU utilisation, and KV-cache metrics.',
  },
  {
    id: 7,
    title: 'Burndown Rates',
    description:
      'Output tokens burn at 4× the rate of input tokens, and prefix-cached tokens burn at 0.25×, aligning cost with compute intensity.',
  },
  {
    id: 8,
    title: 'Sizing Calculator',
    description:
      'Input your model, RPM, and token counts to get a recommended tier, GPU count, and estimated monthly cost — before committing.',
  },
];
