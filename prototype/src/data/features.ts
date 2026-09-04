export interface Feature {
  id: number;
  title: string;
  description: string;
}

export const features: Feature[] = [
  {
    id: 1,
    title: 'Guaranteed TPM with TTFT SLA',
    description:
      'Dedicated vLLM replicas are always warm, delivering contractually guaranteed tokens-per-minute throughput with bound time-to-first-token latency.',
  },
  {
    id: 2,
    title: 'Physical GPU Isolation',
    description:
      'PT nodes are tainted so no shared workloads can land on provisioned hardware. Your GPUs run your models — nothing else.',
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
      'Overflow traffic routes transparently to the shared serving pool. No hard 429 errors unless the tenant explicitly opts in to strict mode.',
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
