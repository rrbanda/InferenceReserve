export interface ProducerStep {
  id: number;
  title: string;
  subtitle: string;
  description: string;
  codeExample: string;
  codeLabel: string;
}

export const producerSteps: ProducerStep[] = [
  {
    id: 1,
    title: 'Catalog Model',
    subtitle: 'Benchmark and price',
    description:
      'Use AIConfigurator to generate throughput profiles for each model on target GPU types. Validate estimates with on-hardware benchmarks, then set per-tier chargeback rates in the PT catalog.',
    codeExample: `# Step 1: Generate throughput profile with AIConfigurator
aiconfigurator cli recommend \\
  --model-path meta-llama/Llama-3.1-70B-Instruct \\
  --system h100_pcie \\
  --backend vllm \\
  --target-request-rate 30 \\
  --ttft 500 --tpot 50 \\
  --deployment-target llm-d

# Step 2: Create ThroughputProfile CRD from results
apiVersion: pt.platform/v1alpha1
kind: ThroughputProfile
metadata:
  name: llama3-70b-h100nvl
spec:
  model: llama3-70b
  gpuType: h100-nvl
  gpusPerReplica: 8
  source: aiconfigurator   # estimates validated on hardware
  benchmarks:
    - utilisation: 70%
      tokensPerSec: 2500   # from benchmark, not AIC estimate
  chargeback:
    chargebackPer1kTPMHour: 0.30`,
    codeLabel: 'YAML',
  },
  {
    id: 2,
    title: 'Capacity Plan',
    subtitle: 'Monitor fleet headroom',
    description:
      'View the fleet dashboard showing total GPUs vs. committed vs. available by GPU type. Capacity alerts fire when available headroom drops below 15%, giving the team time to procure or re-balance.',
    codeExample: `$ kubectl get fleetcapacity -o wide
GPU-TYPE     TOTAL  COMMITTED  AVAILABLE  UTIL%   ALERT
h100-nvl     64     48         16         75.0%   OK
h200-nvl     32     16         16         50.0%   OK
a100-80gb    24      8         16         33.3%   OK

# Alert rule
- alert: PTCapacityLow
  expr: pt_fleet_available_gpus / pt_fleet_total_gpus < 0.15
  for: 10m
  labels:
    severity: warning`,
    codeLabel: 'shell',
  },
  {
    id: 3,
    title: 'Approve',
    subtitle: 'Review and approve requests',
    description:
      'Review incoming ProvisionedThroughput requests against current fleet capacity, validate the requested tier is achievable, and approve the CRD to trigger the provisioning workflow.',
    codeExample: `$ kubectl get pt --field-selector status.phase=Pending
NAME                    MODEL        TIER  TPM     REQUESTER
team-beta-mistral7b     mistral-7b   M     50000   team-beta

$ kubectl approve pt team-beta-mistral7b \\
    --capacity-check=pass \\
    --approver=platform-ops@corp.com

provisionedthroughput.inferencereserve.io/team-beta-mistral7b approved
# Reservation Manager applies LLMInferenceService YAML
# KServe provisions: vLLM pods + llm-d EPP + InferencePool + HTTPRoute
# NVIDIA GPU Operator allocates GPUs to pods
Status: Pending → Provisioning → Active`,
    codeLabel: 'shell',
  },
  {
    id: 4,
    title: 'Operate',
    subtitle: 'Day-2 operations',
    description:
      'Handle node failures and maintenance using standard Kubernetes operations. KServe manages pod lifecycle. The NVIDIA GPU Operator handles driver updates. Prometheus alerting rules monitor SLA compliance. No custom operator needed — this is standard platform ops.',
    codeExample: `# Maintenance: cordon node, KServe reschedules pods
$ kubectl cordon gpu-node-12 --reason="driver-update"
# KServe detects pod disruption, schedules replacement on available node
# NVIDIA GPU Operator allocates GPU on new node
# llm-d EPP automatically routes traffic to healthy pods

$ kubectl get pods -n pt-team-alpha -o wide
NAME                        NODE           STATUS
llama70b-vllm-0             gpu-node-19    Running    # rescheduled
llama70b-vllm-1             gpu-node-04    Running    # unaffected
llama70b-epp-0              cpu-node-02    Running    # EPP is CPU-only, auto-provisioned by KServe

# SLA monitored via Prometheus alerting rules (not custom controller)
# DCGM alerts for GPU health already deployed by GPU Operator`,
    codeLabel: 'shell',
  },
  {
    id: 5,
    title: 'Report',
    subtitle: 'Generate compliance reports',
    description:
      'Generate utilisation reports, SLA compliance summaries, and chargeback breakdowns per tenant and cost centre. Reports feed into finance systems and executive dashboards for cost attribution and capacity planning.',
    codeExample: `# Monthly report generation
$ ptctl report generate --month=2026-08 --format=json

{
  "period": "2026-08",
  "tenants": [
    {
      "name": "team-alpha",
      "model": "llama3-70b",
      "committed_tpm": 75000,
      "avg_utilisation": "68.4%",
      "sla_availability": "99.81%",
      "sla_ttft_p95": "398ms",
      "sla_status": "MEETING",
      "monthly_chargeback": "$16,038.00"
    }
  ],
  "fleet_utilisation": "62.3%",
  "total_chargeback_recovery": "$48,720.00"
}`,
    codeLabel: 'JSON',
  },
];
