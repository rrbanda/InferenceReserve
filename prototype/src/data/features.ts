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
    title: 'GPU Isolation + Flow Control',
    description:
      'Phase 1: physical node isolation via taints. Phase 2: logical isolation via llm-d flow control — priority bands, reserved capacity, and per-tenant fairness on shared GPUs. Benchmarked: Realtime stays at ~500ms p95 TTFT while lower-priority work absorbs the wait.',
  },
  {
    id: 3,
    title: 'Cache-Aware Intelligent Routing',
    description:
      'The llm-d Endpoint Picker scores pods by prefix-cache hit ratio, KV-cache utilisation, and queue depth to route each request optimally.',
  },
  {
    id: 4,
    title: 'Priority Spillover via Flow Control',
    description:
      'llm-d flow control queues lower-priority requests when PT capacity is reserved. Overflow dispatches at Standard priority. Batch eviction reclaims capacity from lower-priority work already in vLLM. Zero data loss — evicted requests are safely retried.',
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
    title: 'Sizing Calculator (AIConfigurator-powered)',
    description:
      'Input your model, RPM, and token counts to get a recommended tier, GPU count, and estimated monthly chargeback. Production sizing powered by AIConfigurator with profiled GPU performance models.',
  },
];
