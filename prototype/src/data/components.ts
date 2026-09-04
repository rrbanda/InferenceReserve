export interface ArchComponent {
  name: string;
  upstream: string;
  status: string;
  role: string;
  isCustom: boolean;
  phase: number;
}

export const components: ArchComponent[] = [
  {
    name: 'NVIDIA GPU Operator',
    upstream: 'NVIDIA',
    status: 'Production',
    role: 'Manages GPU drivers, device plugin, node labeling (GFD), MIG Manager, and DCGM deployment. Handles all GPU lifecycle.',
    isCustom: false,
    phase: 1,
  },
  {
    name: 'LLMInferenceService',
    upstream: 'KServe v0.17',
    status: 'Production',
    role: 'One YAML creates the full serving stack: vLLM pods, llm-d EPP, InferencePool, HTTPRoute. KServe controller reconciles all child resources.',
    isCustom: false,
    phase: 1,
  },
  {
    name: 'vLLM',
    upstream: 'vllm-project',
    status: 'Production',
    role: 'LLM serving engine. Continuous batching, PagedAttention, prefix caching, per-request metrics for chargeback metering.',
    isCustom: false,
    phase: 1,
  },
  {
    name: 'llm-d EPP + Flow Control',
    upstream: 'llm-d/llm-d-router',
    status: 'Production (benchmarked)',
    role: 'Picks the optimal vLLM pod via ext_proc. Flow control enforces priority bands (Realtime > Standard > Batch), per-tenant fairness, reserved capacity, and batch eviction. This is the PT enforcement mechanism.',
    isCustom: false,
    phase: 1,
  },
  {
    name: 'InferencePool + HTTPRoute',
    upstream: 'Gateway API Inference Extension',
    status: 'GA (v1)',
    role: 'InferencePool defines the pod set for EPP. HTTPRoute configures gateway path matching. Both are control-plane CRDs auto-created by KServe.',
    isCustom: false,
    phase: 1,
  },
  {
    name: 'Envoy AI Gateway',
    upstream: 'envoyproxy/ai-gateway',
    status: 'GA (v1.1)',
    role: 'L7 proxy hosting the filter chain: ext_authz (auth) + ext_proc (EPP). Token counting via globalLLMRequestCosts.',
    isCustom: false,
    phase: 1,
  },
  {
    name: 'Kueue',
    upstream: 'kubernetes-sigs/kueue',
    status: 'GA',
    role: 'Per-team GPU quotas via ClusterQueue + ResourceFlavor. Fair-sharing across teams via cohorts. Coordinates with Reservation Manager.',
    isCustom: false,
    phase: 1,
  },
  {
    name: 'DCGM Exporter',
    upstream: 'NVIDIA (via GPU Operator)',
    status: 'Production',
    role: 'GPU metrics: utilisation, memory, temperature, ECC errors. Already deployed by GPU Operator.',
    isCustom: false,
    phase: 1,
  },
  {
    name: 'InferenceObjective',
    upstream: 'Gateway API Inference Extension',
    status: 'Alpha (v1alpha2)',
    role: 'Priority scheduling: PT priority=1, shared priority=2. Used for logical isolation in Phase 2.',
    isCustom: false,
    phase: 2,
  },
  {
    name: 'AIConfigurator',
    upstream: 'ai-dynamo/aiconfigurator',
    status: 'Production',
    role: 'GPU sizing, throughput estimation, KV cache analysis for vLLM. Powers ThroughputProfile generation via recommend mode. Web UI: ConfigIQ.',
    isCustom: false,
    phase: 1,
  },
  {
    name: 'Reservation Manager',
    upstream: 'Custom build',
    status: 'To build',
    role: 'Tracks reservations (who, what model, how much TPM, how long). Generates LLMInferenceService YAML. Does NOT manage GPUs or routing.',
    isCustom: true,
    phase: 1,
  },
  {
    name: 'Auth Service',
    upstream: 'Custom build',
    status: 'To build',
    role: 'ext_authz service: resolves tenant identity, injects TPM budget. Phase 2 adds pre-routing quota check for spillover.',
    isCustom: true,
    phase: 1,
  },
  {
    name: 'Sizing Calculator',
    upstream: 'Custom build',
    status: 'To build',
    role: 'Translates workload params (model, RPM, tokens) into tier recommendation with burndown rate breakdown.',
    isCustom: true,
    phase: 1,
  },
  {
    name: 'Chargeback Pipeline',
    upstream: 'Custom build',
    status: 'To build',
    role: 'Aggregates per-request token counts, applies burndown rates, generates monthly chargeback reports per cost centre. Phase 1 uses flat committed rate.',
    isCustom: true,
    phase: 2,
  },
  {
    name: 'Dashboard Templates',
    upstream: 'Custom build (Grafana)',
    status: 'To build',
    role: 'Per-tenant and fleet-wide Grafana dashboards provisioned from templates.',
    isCustom: true,
    phase: 1,
  },
];
