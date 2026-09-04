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
      'Run standardised benchmarks for each model on target GPU types, create a throughput profile documenting max tokens/sec at utilisation thresholds, and set per-tier pricing in the PT catalog.',
    codeExample: `apiVersion: pt.epio.net/v1alpha1
kind: ThroughputProfile
metadata:
  name: llama3-70b-h100nvl
spec:
  model: llama3-70b
  gpuType: h100-nvl
  gpusPerReplica: 8
  benchmarks:
    - utilisation: 50%
      tokensPerSec: 3200
    - utilisation: 70%
      tokensPerSec: 2500
    - utilisation: 90%
      tokensPerSec: 1800
  pricing:
    costPer1kTPMHour: 0.30
    currency: USD`,
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

provisionedthroughput.pt.epio.net/team-beta-mistral7b approved
Status: Pending → Provisioning`,
    codeLabel: 'shell',
  },
  {
    id: 4,
    title: 'Operate',
    subtitle: 'Day-2 operations',
    description:
      'Handle node failures with automated replica rescheduling, coordinate driver updates during maintenance windows, and manage GPU node cordoning without breaching tenant SLAs.',
    codeExample: `# Maintenance window procedure
$ kubectl cordon gpu-node-12 --reason="driver-update"

# Reservation Manager response:
# 1. Identifies affected reservations
# 2. Schedules replacement replicas on available nodes
# 3. Waits for health checks to pass
# 4. Drains original pods
# 5. Logs SLA impact (if any)

$ kubectl get events --field-selector reason=PTRebalance
LAST SEEN   TYPE     REASON        MESSAGE
2m          Normal   PTRebalance   Replica moved: gpu-node-12 → gpu-node-19
2m          Normal   PTHealthy     All replicas healthy, SLA maintained`,
    codeLabel: 'shell',
  },
  {
    id: 5,
    title: 'Report',
    subtitle: 'Generate compliance reports',
    description:
      'Generate utilisation reports, SLA compliance summaries, and billing breakdowns per tenant. Reports feed into chargeback systems and executive dashboards for cost attribution and capacity planning.',
    codeExample: `# Monthly report generation
$ ptctl report generate --month=2025-06 --format=json

{
  "period": "2025-06",
  "tenants": [
    {
      "name": "team-alpha",
      "model": "llama3-70b",
      "committed_tpm": 75000,
      "avg_utilisation": "68.4%",
      "sla_availability": "99.81%",
      "sla_ttft_p95": "398ms",
      "sla_status": "MEETING",
      "total_cost": "$16,038.00"
    }
  ],
  "fleet_utilisation": "62.3%",
  "total_revenue": "$48,720.00"
}`,
    codeLabel: 'JSON',
  },
];
