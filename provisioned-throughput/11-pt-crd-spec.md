# ProvisionedThroughput CRD Specification

**Status:** Draft — Discovery
**Date:** 2026-09-03
**Owner:** PM — Inference Platform

> This document specifies the custom Kubernetes CRD that serves as the reservation record for PT. The CRD tracks the business relationship — who reserved what model, at what TPM, for how long, with what SLA terms. Infrastructure provisioning is delegated to upstream controllers: KServe creates the serving stack, the NVIDIA GPU Operator manages GPUs, and Kueue manages quotas. A lightweight Reservation Manager reads this CRD and generates the `LLMInferenceService` YAML that triggers upstream provisioning.

---

## 1. CRD Overview

The `ProvisionedThroughput` CRD represents a single PT reservation — one tenant, one model, one committed TPM level, one term. It is a **reservation record**, not an infrastructure orchestration resource. When a reservation is approved, the Reservation Manager:

- Creates a namespace with a Kueue `LocalQueue` for GPU quota management
- Applies a `LLMInferenceService` YAML — KServe's controller then auto-provisions vLLM pods, llm-d EPP, InferencePool, and HTTPRoute
- Registers the tenant in the auth layer for gateway routing
- Provisions a Grafana dashboard template

GPU scheduling, node labeling, and device allocation are handled entirely by the NVIDIA GPU Operator and Kubernetes scheduler — not by this CRD or its controller.

---

## 2. Full CRD Definition

```yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: provisionedthroughputs.pt.platform
spec:
  group: pt.platform
  names:
    kind: ProvisionedThroughput
    listKind: ProvisionedThroughputList
    plural: provisionedthroughputs
    singular: provisionedthroughput
    shortNames:
      - pt
  scope: Cluster
  versions:
    - name: v1alpha1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              required:
                - tenant
                - model
                - gpuType
                - committedTPM
                - term
              properties:
                tenant:
                  type: string
                  description: "Unique tenant identifier. Maps to namespace pt-{tenant}."
                model:
                  type: string
                  description: "Model name (e.g., llama3-70b). Must match a model in the throughput profile registry."
                gpuType:
                  type: string
                  enum: ["h100-nvl", "h200-nvl", "h100-sxm", "a100-80gb", "a100-mig-3g40gb", "a100-mig-2g20gb", "a100-mig-1g10gb"]
                  description: "GPU type backing the reservation. Determines the PT tier."
                committedTPM:
                  type: integer
                  minimum: 1000
                  description: "Committed tokens per minute (weighted). The platform guarantees this throughput. When burndownRates are defined, TPM is measured in weighted tokens (output tokens count at the output multiplier; cached tokens count at the cache multiplier)."
                burndownRates:
                  type: object
                  description: "Token weighting for billing and capacity accounting. Mirrors the Vertex AI GSU burndown rate model. If omitted, all tokens are weighted equally (1.0x)."
                  properties:
                    outputTokenMultiplier:
                      type: number
                      default: 4.0
                      description: "Output tokens consume capacity at this multiple of input tokens. Decode is memory-bandwidth-bound and more expensive than prefill. Vertex uses 5x for Gemini Flash."
                    cachedInputTokenMultiplier:
                      type: number
                      default: 0.25
                      description: "Cached input tokens (prefix cache hits) consume capacity at this fraction of standard input tokens. vLLM prefix caching skips prefill compute for cached tokens. Vertex uses 0.1x."
                requestTypeOverride:
                  type: boolean
                  default: true
                  description: "When true, clients can set the X-PT-Request-Type header to 'dedicated' (use PT only, 429 on overflow) or 'shared' (bypass PT, route to shared pool). Mirrors Vertex X-Vertex-AI-LLM-Request-Type header."
                term:
                  type: object
                  required:
                    - start
                    - end
                  properties:
                    start:
                      type: string
                      format: date
                      description: "Reservation start date (ISO 8601)."
                    end:
                      type: string
                      format: date
                      description: "Reservation end date (ISO 8601)."
                    autoRenew:
                      type: boolean
                      default: false
                      description: "Whether the reservation auto-renews at term end."
                sla:
                  type: object
                  properties:
                    ttftTargetMs:
                      type: integer
                      default: 500
                      description: "TTFT target in milliseconds for this model and tier. Not a hard P95 guarantee — used with ttftTargetAttainment to define the latency SLA. The target is model-specific and derived from benchmarks."
                    ttftTargetAttainment:
                      type: string
                      default: "99%"
                      description: "Percentage of requests within committed TPM that must complete with TTFT at or below ttftTargetMs, measured over rolling 24-hour windows. SLA credits apply when attainment drops below this threshold. This 'latency target attainment' model matches Vertex AI's approach — no cloud provider publishes a fixed TTFT guarantee because TTFT depends on prompt length, batch size, and KV cache state."
                    availabilityTarget:
                      type: string
                      default: "99.5%"
                      description: "Availability SLA target. Within-PT-quota errors that would be 429 are treated as 5XX and count toward the SLA error rate. Over-PT spillover 429s do not count. Default 99.5% matches market standard (Vertex AI). On-prem hardware failure risk makes 99.9% unrealistic without N+2 spares."
                    creditPolicy:
                      type: object
                      description: "Financial credit terms for SLA breaches. Credits are applied to the next billing period."
                      properties:
                        creditPercentagePerBreach:
                          type: integer
                          default: 10
                          description: "Percentage of monthly PT bill credited per SLA breach incident."
                        maxMonthlyCreditPercentage:
                          type: integer
                          default: 30
                          description: "Maximum aggregate credit percentage per calendar month."
                        claimWindowDays:
                          type: integer
                          default: 30
                          description: "Days after a breach within which the customer must file a credit claim."
                    exclusions:
                      type: array
                      description: "Time periods excluded from SLA measurement (planned maintenance, etc.)."
                      items:
                        type: string
                      default: ["planned-maintenance", "customer-caused-overages", "force-majeure"]
                overflow:
                  type: string
                  enum: ["spillover-to-shared", "hard-reject"]
                  default: "spillover-to-shared"
                  description: "Behaviour when traffic exceeds committed TPM. 'spillover-to-shared' routes overflow to the shared serving pool at shared serving rates (Phase 2; Phase 1 returns 429). 'hard-reject' returns 429 with no spillover. Queuing is not offered — it adds latency without resolving the capacity problem."
                vllmOverrides:
                  type: object
                  description: "Optional vLLM parameter overrides for this reservation."
                  properties:
                    gpuMemoryUtilization:
                      type: string
                      default: "0.95"
                    maxNumSeqs:
                      type: integer
                    kvCacheDtype:
                      type: string
                      enum: ["auto", "fp8_e5m2"]
                      default: "auto"
            status:
              type: object
              properties:
                phase:
                  type: string
                  enum: ["Pending", "Provisioning", "Active", "Degraded", "Terminating", "Expired"]
                conditions:
                  type: array
                  items:
                    type: object
                    properties:
                      type:
                        type: string
                      status:
                        type: string
                      lastTransitionTime:
                        type: string
                        format: date-time
                      reason:
                        type: string
                      message:
                        type: string
                nodesAssigned:
                  type: array
                  items:
                    type: string
                  description: "List of node names assigned to this reservation."
                replicaCount:
                  type: integer
                  description: "Number of vLLM replicas provisioned."
                gpuCount:
                  type: integer
                  description: "Total GPUs allocated to this reservation."
                endpointURL:
                  type: string
                  description: "The inference endpoint URL for this tenant."
                currentUtilisation:
                  type: string
                  description: "Current average TPM utilisation as percentage."
                llmInferenceServiceRef:
                  type: string
                  description: "Name of the LLMInferenceService created for this reservation."
                namespaceRef:
                  type: string
                  description: "Name of the namespace created for this reservation."
                lastSLACheck:
                  type: object
                  properties:
                    timestamp:
                      type: string
                      format: date-time
                    ttftP95_ms:
                      type: integer
                    withinSLA:
                      type: boolean
      subresources:
        status: {}
      additionalPrinterColumns:
        - name: Tenant
          type: string
          jsonPath: .spec.tenant
        - name: Model
          type: string
          jsonPath: .spec.model
        - name: TPM
          type: integer
          jsonPath: .spec.committedTPM
        - name: Phase
          type: string
          jsonPath: .status.phase
        - name: Utilisation
          type: string
          jsonPath: .status.currentUtilisation
        - name: GPUs
          type: integer
          jsonPath: .status.gpuCount
        - name: Expires
          type: string
          jsonPath: .spec.term.end
```

---

## 3. Example CR

```yaml
apiVersion: pt.platform/v1alpha1
kind: ProvisionedThroughput
metadata:
  name: res-acme-llama3-70b
spec:
  tenant: acme
  model: llama3-70b
  gpuType: h100-nvl
  committedTPM: 100000
  burndownRates:
    outputTokenMultiplier: 4.0       # Output tokens cost 4x input tokens
    cachedInputTokenMultiplier: 0.25  # Cached input tokens cost 0.25x
  requestTypeOverride: true           # Allow X-PT-Request-Type header
  term:
    start: "2026-10-01"
    end: "2027-10-01"
    autoRenew: true
  sla:
    ttftTargetMs: 400
    ttftTargetAttainment: "99%"
    availabilityTarget: "99.5%"
    creditPolicy:
      creditPercentagePerBreach: 10
      maxMonthlyCreditPercentage: 30
      claimWindowDays: 30
    exclusions:
      - planned-maintenance
      - customer-caused-overages
  overflow: spillover-to-shared
  vllmOverrides:
    gpuMemoryUtilization: "0.95"
    kvCacheDtype: fp8_e5m2
```

Expected `kubectl get pt` output:

```
NAME                    TENANT  MODEL        TPM      PHASE    UTILISATION  GPUS  EXPIRES
res-acme-llama3-70b     acme    llama3-70b   100000   Active   72%          16    2027-10-01
res-globex-mistral-7b   globex  mistral-7b   50000    Active   65%          2     2027-04-01
res-initech-embed       initech embedding-v2 500000   Active   88%          1     2027-01-01
```

---

## 4. Provisioning Flow

The Reservation Manager reads `ProvisionedThroughput` CRs and provisions infrastructure by applying YAML to upstream controllers. It does NOT run a Kubernetes reconciliation loop — it executes a provisioning sequence once when a reservation is approved.

**What the Reservation Manager does vs. what upstream controllers do:**

| Step | Who does it | How |
|---|---|---|
| Capacity validation | Reservation Manager | Queries GPU fleet inventory |
| Namespace + Kueue LocalQueue | Reservation Manager | `kubectl create ns` + `kubectl apply` |
| LLMInferenceService YAML | Reservation Manager generates, **KServe reconciles** | KServe auto-creates vLLM pods, EPP, InferencePool, HTTPRoute |
| GPU allocation to pods | **NVIDIA GPU Operator** + Kubernetes scheduler | Device plugin + nodeSelector |
| Node labeling with GPU type | **NVIDIA GPU Feature Discovery** | Automatic |
| Auth registration | Reservation Manager | Updates auth service config |
| Dashboard | Reservation Manager | Grafana provisioning API |

### 4.1 Provisioning (reservation approved)

```
Reservation approved
│
├── Step 1: Capacity Check
│   ├── Query fleet: enough GPUs available for this model + tier?
│   └── If NO: reject reservation
│
├── Step 2: Namespace + Quota
│   ├── kubectl create ns pt-{tenant}
│   ├── Apply Kueue LocalQueue → tenant's ClusterQueue
│   └── Apply NetworkPolicy: gateway-only ingress
│
├── Step 3: Apply LLMInferenceService
│   ├── Generate YAML from throughput profile (model, GPU count, vLLM args)
│   ├── Set replicas.min == replicas.max (always-warm)
│   ├── Include router block (scheduler + route + gateway)
│   └── kubectl apply → KServe controller takes over:
│       ├── Creates vLLM pods (NVIDIA GPU Operator allocates GPUs)
│       ├── Creates llm-d EPP deployment
│       ├── Creates InferencePool
│       └── Creates HTTPRoute
│   │   └── worker: tensor-parallel-size (for multi-GPU models)
│   └── KServe controller auto-provisions: vLLM pods, EPP, InferencePool, HTTPRoute
│
├── Step 5: InferenceObjective
│
├── Step 4: Auth + Dashboard
│   ├── Register tenant in auth service (API key → namespace mapping)
│   ├── Set TPM budget for gateway rate limiting
│   └── Provision Grafana dashboard from template
│
└── Step 5: Update CRD status
    └── phase: Active, endpointURL, gpuCount
```

### 4.2 Deprovisioning (term expired or reservation deleted)

```
Reservation expired or deleted
│
├── 1. Delete LLMInferenceService
│   └── KServe cleans up: vLLM pods, EPP, InferencePool, HTTPRoute
│   └── NVIDIA GPU Operator releases GPU devices
│
├── 2. Deregister from auth service
│
├── 3. Archive billing records and dashboard snapshots
│
└── 4. Delete namespace (after grace period for log retention)
```

### 4.3 Health Monitoring (separate CronJob or alerting rules)

Health monitoring is NOT part of the Reservation Manager — it is Prometheus alerting rules plus DCGM health checks that already exist in the observability layer:

- vLLM pod health → standard Kubernetes `Ready` condition + Prometheus `up` metric
- TTFT SLA compliance → Prometheus alerting rule on `vllm:time_to_first_token_seconds` histogram
- GPU health → DCGM alerts for ECC errors, thermal throttling (already deployed)
- Term expiry → CronJob that checks CRD `term.end` dates and triggers deprovisioning

---

## 5. Admission Webhook — Business Rule Enforcement

The Reservation Manager must include a validating admission webhook that enforces commercial constraints on CRD mutations. These rules mirror the constraints in Vertex AI PT and are business requirements, not just technical guardrails.

**Update validation rules (applied on UPDATE operations):**

| Rule | Enforcement | Rationale |
|---|---|---|
| `committedTPM` can only increase, not decrease | Reject UPDATE if new `committedTPM` < current `committedTPM` | PT commitment is non-reducible mid-term. Customer must wait for term end to right-size. Matches Vertex behaviour (GSUs can increase, not decrease). |
| `term.end` cannot be shortened | Reject UPDATE if new `term.end` < current `term.end` | PT commitment is non-cancellable. Billing continues for the full term. |
| `term.start` cannot be changed after activation | Reject UPDATE if `status.phase == Active` and `term.start` is modified | Start date is immutable once the reservation is provisioned. |
| `model` cannot be changed (Phase 1) | Reject UPDATE if `model` field is modified | Model is bound to the reservation. Phase 3 may relax this for model-family swaps. |
| `gpuType` cannot be changed | Reject UPDATE if `gpuType` field is modified | GPU type determines node assignment and throughput profile. Changing it requires a new reservation. |

**Delete validation rules:**

| Rule | Enforcement | Rationale |
|---|---|---|
| Active reservations cannot be deleted before term end | Reject DELETE if `status.phase == Active` and `term.end > now` and not `force-delete` annotation | Non-cancellable commitment. Platform admin can override with `pt.platform/force-delete: "true"` annotation for exceptional cases (billing credit issued separately). |

**Request-type header enforcement:**

When `spec.requestTypeOverride` is true, the PT Auth Service recognises two header values on incoming requests:
- `X-PT-Request-Type: dedicated` — route to PT pool only. If PT pool is at capacity, return 429 (do not spill to shared pool). Customer controls cost by avoiding spillover charges.
- `X-PT-Request-Type: shared` — bypass PT pool entirely. Route to shared pool. Does not consume the customer's PT TPM budget. Useful for development, testing, or non-critical traffic.
- No header / default — use PT pool, spill to shared pool on overflow (default behaviour per `spec.overflow` setting).

---

## 6. Implementation Notes

**The Reservation Manager is NOT a Kubernetes operator.** It is a lightweight service or CLI that:
- Reads ProvisionedThroughput CRDs from the Kubernetes API
- Generates and applies `LLMInferenceService` YAML (KServe does the actual reconciliation)
- Calls the Grafana provisioning API for dashboards
- Updates the auth service configuration

**Implementation options (choose one):**
- **GitOps pipeline** — ArgoCD watches a repo; reservation approval triggers a commit that adds the LLMInferenceService YAML. ArgoCD applies it. Most operationally mature.
- **CLI tool** — `pt-reserve create --tenant acme --model llama3-70b --tpm 100000 --term 12m` generates and applies YAML.
- **Simple controller** — if CRD-driven lifecycle is preferred, a minimal controller that ONLY creates the namespace + applies the LLMInferenceService YAML. Does NOT touch nodes, GPUs, InferencePool, or HTTPRoute (those are upstream).

**What it does NOT do (upstream handles these):**
- GPU scheduling → NVIDIA GPU Operator + Kubernetes scheduler
- Node labeling → GPU Feature Discovery (automatic)
- InferencePool / EPP / HTTPRoute creation → KServe LLMInferenceService controller
- GPU quota enforcement → Kueue ClusterQueue
- GPU metrics → DCGM Exporter (deployed by GPU Operator)

---

## 6. Relationship to Other Documents

| Document | Relationship |
|---|---|
| `10-architecture.md` | This CRD is Layer 5 of the architecture; the Operator is the integration point between all layers |
| `02-technical-context.md` | GPU fleet specs and vLLM configuration inform the throughput profiles used by the Operator |
| `03-finops-analysis.md` | Pricing tiers map to `gpuType` values; the Sizing Calculator uses the FinOps model |
| `06-discovery-definition-of-done.md` | Phase 1 design must produce the CRD spec and Operator design before engineering begins |
