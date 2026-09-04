export interface ConsumerStep {
  id: number;
  title: string;
  subtitle: string;
  description: string;
  codeExample: string;
  codeLabel: string;
}

export const consumerSteps: ConsumerStep[] = [
  {
    id: 1,
    title: 'Discover',
    subtitle: 'Browse the PT catalog',
    description:
      'Explore the Provisioned Throughput catalog to view eligible models, available tiers, throughput profiles, and chargeback rates. The catalog is self-service and always reflects real-time fleet capacity.',
    codeExample: `kubectl get ptcatalog -o wide
NAME            MODEL           GPU-TYPE    TIERS       MIN-TPM    RATE/1K-TPM-HR
llama3-70b      meta/llama3-70b h100-nvl    S,M,L,XL   10000      $0.30
llama3-8b       meta/llama3-8b  h100-nvl    S,M,L       5000      $0.15
mistral-7b      mistralai/7b    h100-nvl    S,M          5000      $0.12
embedding-v2    internal/emb-v2 a100-mig    S,M         50000      $0.02`,
    codeLabel: 'kubectl output',
  },
  {
    id: 2,
    title: 'Size',
    subtitle: 'Run the sizing calculator',
    description:
      'Input your model, requests per minute, and average token counts into the sizing calculator. It returns a recommended tier, GPU count, committed TPM (with burndown rates applied), and estimated monthly chargeback.',
    codeExample: `# Sizing API call
POST /api/v1/sizing
{
  "model": "llama3-70b",
  "rpm": 500,
  "avg_input_tokens": 1200,
  "avg_output_tokens": 400
}

# Response
{
  "recommended_tier": "M",
  "gpus_required": 16,
  "committed_tpm": 75000,
  "estimated_monthly_chargeback": "$16,200"
}`,
    codeLabel: 'HTTP',
  },
  {
    id: 3,
    title: 'Request',
    subtitle: 'Submit a ProvisionedThroughput CR',
    description:
      'Apply a ProvisionedThroughput custom resource via kubectl. The CR declares the model, tier, and committed TPM. The Reservation Manager validates the request against fleet capacity and applies the LLMInferenceService YAML. KServe provisions the serving stack.',
    codeExample: `apiVersion: pt.platform/v1alpha1
kind: ProvisionedThroughput
metadata:
  name: team-alpha-llama70b
  namespace: team-alpha
spec:
  model: llama3-70b
  tier: M
  committedTPM: 75000
  sla:
    ttftTargetMs: 500
    ttftTargetAttainment: "99%"
    availabilityTarget: "99.5%"
  chargeback:
    costCenter: CC-4422
    approver: platform-lead@corp.com`,
    codeLabel: 'YAML',
  },
  {
    id: 4,
    title: 'Provision',
    subtitle: 'Watch status transitions',
    description:
      'Monitor the reservation as it transitions through Pending → Provisioning → Active. The Reservation Manager applies the LLMInferenceService YAML. KServe provisions vLLM pods, llm-d EPP, InferencePool, and HTTPRoute. The NVIDIA GPU Operator allocates GPUs to the pods.',
    codeExample: `$ kubectl get pt team-alpha-llama70b -w
NAME                    MODEL        TIER  TPM     STATUS
team-alpha-llama70b     llama3-70b   M     75000   Pending
team-alpha-llama70b     llama3-70b   M     75000   Provisioning
team-alpha-llama70b     llama3-70b   M     75000   Active

$ kubectl describe pt team-alpha-llama70b
Status:
  Phase: Active
  Endpoint: https://inference.internal/v1/team-alpha/llama3-70b
  GPUs Allocated: 16x H100-NVL (via NVIDIA GPU Operator)
  Serving: LLMInferenceService (KServe v0.17)
  Routing: InferencePool + llm-d EPP (auto-provisioned by KServe)
  Dashboard: https://grafana.internal/d/pt-team-alpha`,
    codeLabel: 'shell',
  },
  {
    id: 5,
    title: 'Onboard',
    subtitle: 'Configure your application',
    description:
      'Receive your dedicated endpoint URL and configure your application. The API is OpenAI-compatible — swap the base URL and you are live. No SDK changes, no code rewrites.',
    codeExample: `from openai import OpenAI

client = OpenAI(
    base_url="https://inference.internal/v1/team-alpha",
    api_key=os.environ["IR_API_KEY"],
)

response = client.chat.completions.create(
    model="llama3-70b",
    messages=[{"role": "user", "content": "Summarise Q3 results"}],
    max_tokens=512,
)
print(response.choices[0].message.content)`,
    codeLabel: 'Python',
  },
  {
    id: 6,
    title: 'Use',
    subtitle: 'Send inference requests',
    description:
      'Send inference requests to your PT endpoint. The Gateway runs ext_authz (tenant auth) and ext_proc (llm-d EPP picks the best pod), then forwards directly to the selected vLLM pod. Use the X-PT-Request-Type header for routing control.',
    codeExample: `// Request with routing header
POST https://inference.internal/v1/team-alpha/chat/completions
X-PT-Request-Type: dedicated
Authorization: Bearer $IR_API_KEY

{
  "model": "llama3-70b",
  "messages": [{"role": "user", "content": "Analyse this portfolio"}],
  "stream": true
}

// Response (OpenAI-compatible)
{
  "choices": [{"message": {"content": "..."}}],
  "usage": {
    "prompt_tokens": 1024,
    "completion_tokens": 256,
    "total_tokens": 1280
  }
}`,
    codeLabel: 'JSON',
  },
  {
    id: 7,
    title: 'Monitor',
    subtitle: 'Open your Grafana dashboard',
    description:
      'Access your auto-provisioned Grafana dashboard to track committed vs. consumed TPM, P95 TTFT against SLA thresholds, spillover events, GPU utilisation, and KV-cache hit rates in real time.',
    codeExample: `# PromQL queries powering the dashboard
# Committed vs Consumed TPM
sum(rate(vllm_request_output_tokens_total{namespace="team-alpha"}[1m])) * 60

# P95 TTFT
histogram_quantile(0.95, rate(vllm_ttft_seconds_bucket{namespace="team-alpha"}[5m]))

# Spillover rate
sum(rate(pt_spillover_requests_total{tenant="team-alpha"}[5m]))

# GPU Utilisation
avg(DCGM_FI_DEV_GPU_UTIL{node=~"pt-team-alpha.*"})`,
    codeLabel: 'PromQL',
  },
  {
    id: 8,
    title: 'Manage',
    subtitle: 'Scale, alert, and optimise',
    description:
      'Increase committed TPM with a CR patch, view SLA compliance status, receive alerts when utilisation approaches capacity, and review chargeback summaries — all through standard Kubernetes tooling.',
    codeExample: `# Scale up TPM
kubectl patch pt team-alpha-llama70b --type merge -p '
  spec:
    committedTPM: 100000
    tier: L
'

# Check SLA status
kubectl get pt team-alpha-llama70b -o jsonpath='{.status.sla}'
{
  "currentAvailability": "99.72%",
  "ttftTargetAttainment": "99.4%",
  "ttftP95": "412ms",
  "slaStatus": "MEETING",
  "lastViolation": null
}`,
    codeLabel: 'shell',
  },
];
