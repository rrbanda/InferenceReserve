export interface ArchComponent {
  name: string;
  upstream: string;
  status: string;
  role: string;
  isCustom: boolean;
}

export const components: ArchComponent[] = [
  {
    name: 'NVIDIA GPU Operator',
    upstream: 'NVIDIA',
    status: 'Production',
    role: 'Manages GPU drivers, device plugin, node labeling (GFD), MIG Manager, and DCGM deployment. Handles all GPU lifecycle.',
    isCustom: false,
  },
  {
    name: 'LLMInferenceService',
    upstream: 'KServe v0.17',
    status: 'Production',
    role: 'One YAML creates the full serving stack: vLLM pods, llm-d EPP, InferencePool, HTTPRoute. KServe controller reconciles all child resources.',
    isCustom: false,
  },
  {
    name: 'vLLM',
    upstream: 'vllm-project',
    status: 'Production',
    role: 'LLM serving engine. Continuous batching, PagedAttention, prefix caching, per-request metrics for billing.',
    isCustom: false,
  },
  {
    name: 'llm-d Endpoint Picker',
    upstream: 'llm-d/llm-d-router',
    status: 'Production',
    role: 'Picks the optimal vLLM pod per request: prefix-cache locality, KV-cache occupancy, queue depth. Auto-created by KServe.',
    isCustom: false,
  },
  {
    name: 'InferencePool + HTTPRoute',
    upstream: 'Gateway API Inference Extension',
    status: 'GA (v1)',
    role: 'Groups vLLM pods into routing targets. Auto-created by KServe LLMInferenceService controller. Do NOT create separately.',
    isCustom: false,
  },
  {
    name: 'Envoy AI Gateway',
    upstream: 'envoyproxy/ai-gateway',
    status: 'GA (v1.1)',
    role: 'L7 proxy with token counting, rate limiting, ext_authz integration for tenant routing.',
    isCustom: false,
  },
  {
    name: 'Kueue',
    upstream: 'kubernetes-sigs/kueue',
    status: 'GA',
    role: 'Per-team GPU quotas via ClusterQueue + ResourceFlavor. Fair-sharing across teams via cohorts.',
    isCustom: false,
  },
  {
    name: 'DCGM Exporter',
    upstream: 'NVIDIA (via GPU Operator)',
    status: 'Production',
    role: 'GPU metrics: utilisation, memory, temperature, ECC errors. Already deployed by GPU Operator.',
    isCustom: false,
  },
  {
    name: 'Reservation Manager',
    upstream: 'Custom build',
    status: 'To build',
    role: 'Tracks reservations (who, what model, how much TPM, how long). Generates LLMInferenceService YAML. Does NOT manage GPUs or routing.',
    isCustom: true,
  },
  {
    name: 'Auth Service',
    upstream: 'Custom build',
    status: 'To build',
    role: 'ext_authz service that resolves tenant identity and injects TPM budget for gateway rate limiting.',
    isCustom: true,
  },
  {
    name: 'Sizing Calculator',
    upstream: 'Custom build',
    status: 'To build',
    role: 'Translates workload params (model, RPM, tokens) into LLMInferenceService spec and cost estimate.',
    isCustom: true,
  },
  {
    name: 'Billing Pipeline',
    upstream: 'Custom build',
    status: 'To build',
    role: 'Aggregates per-request token counts, applies burndown rates, generates chargeback reports.',
    isCustom: true,
  },
  {
    name: 'Dashboard Templates',
    upstream: 'Custom build (Grafana)',
    status: 'To build',
    role: 'Per-tenant and fleet-wide Grafana dashboards provisioned from templates.',
    isCustom: true,
  },
];
