export interface Opportunity {
  id: number;
  segment: string;
  pain: string;
  impact: string;
  ptCapability: string;
  evidence: string;
}

export const opportunities: Opportunity[] = [
  {
    id: 1,
    segment: 'Segment A: Production LLM teams on shared serving',
    pain: 'Unpredictable TTFT under shared load',
    impact:
      'TTFT spikes from 400ms to 4s+ during peak hours. Teams build custom retry and circuit-breaker logic to mask inference variability. On-call alerts triggered by inference throttling.',
    ptCapability:
      'Dedicated vLLM replicas with fixed replica count. llm-d EPP routes to the pod with warmest KV cache. 99% latency target attainment SLA.',
    evidence: 'User research plan: Segment A interviews (CS4, TL1-TL3)',
  },
  {
    id: 2,
    segment: 'Segment A: Production LLM teams on shared serving',
    pain: 'No capacity guarantee for predictable workloads',
    impact:
      'Teams cannot commit to downstream SLAs because the platform cannot guarantee upstream capacity. FinOps cannot forecast GPU costs per team because shared serving has no per-team accounting.',
    ptCapability:
      'Committed TPM reservation per model per tenant. Flat chargeback rate enables budget forecasting. Spillover tracking separates committed from on-demand usage.',
    evidence: 'User research plan: Segment A interviews (CS3, C1-C3)',
  },
  {
    id: 3,
    segment: 'Segment B: Teams running private GPU clusters',
    pain: 'GPU ops overhead scales linearly with inference workloads',
    impact:
      'Each new model or workload requires more GPU ops headcount: driver updates, DCGM monitoring, hardware failures, capacity planning. Self-managed GPU cluster TCO includes hardware + power + ops + opportunity cost.',
    ptCapability:
      'Platform team manages GPU ops centrally. Consumer teams get an OpenAI-compatible endpoint with no infrastructure responsibility. PT captures new workloads and next hardware refresh cycle.',
    evidence: 'User research plan: Segment B interviews (BVB3-BVB8)',
  },
  {
    id: 4,
    segment: 'Segment D: Regulated industry teams (air-gap required)',
    pain: 'Cloud PT is structurally unavailable',
    impact:
      'Data residency and compliance requirements prevent sending inference traffic to external cloud APIs. Vertex AI PT, Azure PTU, and AWS Bedrock PT are all cloud-only. No guaranteed throughput option exists for air-gapped environments.',
    ptCapability:
      'On-prem PT on air-gapped OpenShift. Data never leaves the datacenter. Same product pattern as cloud PT (committed TPM, SLA, spillover) without the cloud dependency.',
    evidence: 'User research plan: Segment D interviews',
  },
];
