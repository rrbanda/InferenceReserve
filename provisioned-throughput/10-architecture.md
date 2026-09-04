# PT Architecture: Upstream Components and Build-Gap Analysis

**Status:** Discovery
**Date:** 2026-09-03
**Owner:** PM — Inference Platform

> This document maps every component of the PT architecture to its upstream open-source project, documents the maturity and version of each dependency, identifies what must be built custom, and defines the integration boundaries between layers. Every architectural decision is grounded in the current state of KServe, llm-d, vLLM, Gateway API Inference Extension, and Envoy AI Gateway as of September 2026.

---

## Architecture Revision Note

The original technical context (`02-technical-context.md`) designed PT isolation around `InferenceService` with hand-rolled YAML for routing, node isolation, and metering. The upstream stack has evolved materially since that document was written:

| What Changed | Old Assumption | Current Reality |
|---|---|---|
| KServe CRD for LLMs | `InferenceService` | `LLMInferenceService` (v0.17, production-ready) — auto-provisions EPP + InferencePool + HTTPRoute |
| Routing intelligence | Manual HTTPRoute to separate pools | llm-d EPP (Endpoint Picker) — KV-cache-aware, prefix-cache-aware, queue-depth-aware routing via ext-proc |
| TPM rate limiting | "Does not exist; must evaluate in Phase 2" | Envoy AI Gateway `BackendTrafficPolicy` with `limit.fromMetadata` + `globalLLMRequestCosts` |
| PT vs shared serving priority | Not addressed | `InferenceObjective` (alpha, GA track) — priority field consumed by EPP |
| Per-tenant billing | "Metering gap; no per-tenant attribution layer" | vLLM `--enable-per-request-metrics` returns token counts and timing in response body |
| Dynamo relationship | "Separate; deferred" | llm-d and Dynamo share NIXL for KV transfer; Dynamo is Triton's successor |

This document supersedes the routing, isolation, and metering architecture in `02-technical-context.md`. The GPU fleet specs, KV cache math, and FinOps model in that document remain valid.

---

## 1. Architecture Overview

The PT system is organised into six layers. Each layer identifies upstream components that exist and are production-ready, components that need configuration or extension, and components that must be built from scratch.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Layer 1: Request Ingress                         │
│   Envoy AI Gateway · ext_authz · BackendTrafficPolicy              │
│   [upstream: Envoy AI Gateway]  [build: PT Auth Service]           │
├─────────────────────────────────────────────────────────────────────┤
│                    Layer 2: Routing                                 │
│   InferencePool · InferenceObjective · HTTPRoute · llm-d EPP       │
│   [upstream: Gateway API Inference Extension + llm-d]              │
├─────────────────────────────────────────────────────────────────────┤
│                    Layer 3: Serving                                 │
│   LLMInferenceService · vLLM · LeaderWorkerSet                     │
│   [upstream: KServe v0.17 + vLLM]                                  │
├─────────────────────────────────────────────────────────────────────┤
│                    Layer 4: Isolation                               │
│   Namespace · ResourceQuota · Taints · NetworkPolicy · MIG         │
│   [upstream: Kubernetes + NVIDIA GPU Operator]                     │
├─────────────────────────────────────────────────────────────────────┤
│                    Layer 5: Reservation Management + Billing        │
│   Reservation Manager · Admission Webhooks · Billing Pipeline      │
│   [build: thin product layer — business logic, not infrastructure] │
├─────────────────────────────────────────────────────────────────────┤
│                    Layer 6: Observability and Billing               │
│   DCGM · vLLM Prometheus · Per-request metrics · Grafana           │
│   [upstream: DCGM + vLLM]  [build: dashboards + billing pipeline]  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Layer 1: Request Ingress

### 2.1 Upstream Components — Use Directly

**Envoy AI Gateway**
- Role: L7 proxy with AI-native traffic management
- Key capability: token counting via `globalLLMRequestCosts` — counts input and output tokens on every request passing through the gateway, regardless of tenant
- Integration: ext-proc protocol for the llm-d EPP; ext_authz for tenant identification
- Maturity: production; deployed by Snap, Google (GKE Inference Gateway), and others
- Air-gap note: container images must be mirrored to internal registry

**`BackendTrafficPolicy` (Envoy Gateway CRD)**
- Role: per-tenant token-based rate limiting
- Mechanism: `limit.fromMetadata` reads the tenant's TPM budget from Envoy dynamic metadata; `Distinct` bucketing by `x-tenant-id` header ensures each tenant has independent token counters
- Token cost: `globalLLMRequestCosts` emits the request's token usage; the policy charges it against the tenant's budget
- Status: `limit.fromMetadata` is on Envoy Gateway main; check tagged release availability for air-gapped deployment

```yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: BackendTrafficPolicy
metadata:
  name: pt-tenant-token-budget
spec:
  targetRefs:
    - group: gateway.networking.k8s.io
      kind: Gateway
      name: inference-gateway
  rateLimit:
    type: Global
    global:
      rules:
        - clientSelectors:
            - headers:
                - name: x-tenant-id
                  type: Distinct
          limit:
            requests: 1000        # default fallback
            unit: Minute
            fromMetadata:
              namespace: envoy.filters.http.ext_authz
              key: tpm_budget
          cost:
            request: { from: Number, number: 0 }
            response:
              from: Metadata
              metadata:
                namespace: io.envoy.ai_gateway
                key: llm_total_token
```

**ext_authz filter (Envoy standard)**
- Role: calls an external auth service on every request to resolve tenant identity
- The auth service returns dynamic metadata containing the tenant's PT reservation details (TPM budget, pool assignment, priority level)
- Standard Envoy capability; no custom proxy code needed

### 2.2 Must Build

**PT Auth Service**

A lightweight gRPC service called by Envoy's ext_authz filter on every incoming inference request. Responsibilities:

1. Resolve tenant identity using one of (in priority order):
   - `x-tenant-id` header (explicit, always works)
   - Source namespace (if request originates from a `pt-*` namespace via Istio mTLS, identity is implicit — no header required)
   - Client certificate CN or SPIFFE ID (if mTLS is enabled, the tenant identity is in the cert)
   - API key lookup
2. Look up the tenant's PT reservation from the PT Reservation CRD (Layer 5)
3. Check the `X-PT-Request-Type` header (if `spec.requestTypeOverride` is true for this tenant):
   - `dedicated` — route to PT pool only; return 429 if PT pool is at capacity (do not spill)
   - `shared` — bypass PT pool entirely; route to shared pool; do not consume PT budget
   - Absent / default — use PT pool, spill to shared pool on overflow per `spec.overflow` setting
4. Return dynamic metadata to Envoy:
   - `tpm_budget`: the tenant's committed TPM for the current billing period
   - `pool_assignment`: `pt` or `shared` — determines which InferencePool the request routes to
   - `priority`: `1` (PT) or `2` (shared) — sets the `x-gateway-inference-objective` header
   - `request_type`: `dedicated`, `shared`, or `default` — for billing and SLA tagging
5. If no PT reservation exists, return `shared` pool assignment with priority `2`

Estimated complexity: ~800 lines of Go or Python. Stateless; reads from Kubernetes API (PT Reservation CRD) or a cache.

> **Vertex PT comparison note** (see [`12-vertex-pt-comparison.md`](12-vertex-pt-comparison.md)): Vertex auto-activates PT per GCP project with no code change. Our Phase 1 requires the `x-tenant-id` header. Phase 2 should implement namespace-based or mTLS-based identity resolution so that traffic from a PT tenant's namespace automatically routes to PT without headers — reducing UX friction to near-zero.

**Spillover Logic**

> **Phase 1:** No spillover. Each tenant has dedicated pods with no shared pool fallback. Requests exceeding the PT pool's `max-num-seqs` capacity receive a 429. This is the simplest correct implementation.

> **Phase 2:** Pre-routing spillover via the PT Auth Service. The approach mirrors Google Vertex AI's pre-routing quota check — the routing decision happens BEFORE the request reaches the serving pod, not after a failure.

Phase 2 spillover implementation:

1. The PT Auth Service maintains a lightweight per-tenant consumed-TPM counter, updated every second from vLLM Prometheus metrics (`prompt_tokens_total` + `generation_tokens_total`)
2. On each incoming request, the Auth Service estimates the request's weighted token cost using the tenant's burndown rates and average historical output length
3. If the estimated cost fits within remaining PT quota for the current enforcement window: route to PT pool (`pool_assignment: pt`)
4. If the estimated cost exceeds remaining PT quota: route to shared pool (`pool_assignment: shared`) and tag as `request_type: spillover` in dynamic metadata
5. After request completion, reconcile actual token count against the estimate

This pre-routing approach avoids the latency penalty of retry-based spillover (where the request fails first, then retries to the shared pool) and correctly distinguishes tenant quota exhaustion from infrastructure 429s (vLLM at max concurrency).

Billing: the gateway access log captures `request_type` (dedicated / spillover / shared) from dynamic metadata. The chargeback pipeline charges the flat committed rate for dedicated traffic and the shared serving rate for spillover traffic.

---

## 3. Layer 2: Routing

### 3.1 Upstream Components — Use Directly

**InferencePool (GA — `inference.networking.k8s.io/v1`)**
- Groups vLLM pods serving a specific model into a routing target
- References an EPP (Endpoint Picker) service for intelligent pod selection
- One InferencePool per PT tenant per model; one shared InferencePool for non-PT (shared serving) traffic
- Auto-provisioned by `LLMInferenceService` when a `router` block is defined

**InferenceObjective (alpha — `inference.networking.x-k8s.io/v1alpha2`)**
- Defines serving priority for a class of requests
- Currently supports a `priority` field (integer; lower = higher priority)
- Clients associate requests with an objective by setting the `x-gateway-inference-objective` header
- The EPP consults the InferenceObjective when scoring candidate pods — higher-priority requests are favored under contention
- PT mapping: PT requests → priority 1; shared serving requests → priority 2
- Alpha status: breaking changes possible; design PT to function without it (fallback: separate InferencePools provide isolation without priority)

```yaml
apiVersion: inference.networking.x-k8s.io/v1alpha2
kind: InferenceObjective
metadata:
  name: pt-priority
  namespace: pt-tenant-a
spec:
  targetRef:
    group: inference.networking.k8s.io
    kind: InferencePool
    name: pt-tenant-a-llama3-70b
  priority: 1
---
apiVersion: inference.networking.x-k8s.io/v1alpha2
kind: InferenceObjective
metadata:
  name: shared-default
  namespace: inference-shared
spec:
  targetRef:
    group: inference.networking.k8s.io
    kind: InferencePool
    name: shared-llama3-70b
  priority: 2
```

**HTTPRoute (Gateway API GA)**
- Routes incoming requests to the correct InferencePool based on header matching
- PT Auth Service sets the `x-tenant-id` header; HTTPRoute matches it to the tenant's InferencePool
- Auto-provisioned by `LLMInferenceService`; Reservation Manager may need to create additional rules for spillover routing

**llm-d EPP (Endpoint Picker)**
- Production-grade routing engine; the "brain" of request placement
- Runs as a Kubernetes Deployment (the "scheduler" pod); integrates with Envoy via ext-proc on port 9002
- Scoring pipeline for each incoming request:
  1. **Filter** — exclude pods that cannot serve the request (wrong model, unhealthy)
  2. **Score** — evaluate each candidate pod:
     - `prefix-cache-scorer`: hash the request's token prefix; match to pod with warm KV cache
     - `kv-cache-utilization-scorer`: prefer pods with available KV cache capacity
     - `queue-scorer`: prefer pods with shorter request queues
  3. **Pick** — `max-score-picker` selects the highest-scoring pod
- Scrapes each vLLM replica's `/metrics` endpoint every ~100ms for real-time state
- Auto-provisioned by `LLMInferenceService` with `router` block
- For PT: each tenant's InferencePool gets its own EPP deployment (isolated scoring)

### 3.2 Must Build

**Per-tenant InferencePool provisioning** — when a reservation is approved, the Reservation Manager applies a `LLMInferenceService` with a `router` block. KServe's controller then auto-provisions the InferencePool, EPP, and HTTPRoute. No custom provisioning code needed for routing.

**Spillover routing (Phase 2)** — the PT Auth Service sets `pool_assignment` in dynamic metadata before the request is routed. The HTTPRoute uses header matching on this metadata to direct traffic to either the PT InferencePool or the shared InferencePool. No retry-based spillover is needed — the routing decision is made pre-request, not post-failure.

---

## 4. Layer 3: Serving

### 4.1 Upstream Components — Use Directly

**`LLMInferenceService` CRD (KServe v0.17)**

The correct CRD for PT workloads. Replaces the hand-rolled `InferenceService` YAML in `02-technical-context.md`. When created with a `router` block, the KServe `llmisvc-controller-manager` automatically provisions:

1. vLLM pods with the specified model, GPU resources, and vLLM args
2. llm-d EPP (scheduler) deployment
3. InferencePool targeting the vLLM pods
4. HTTPRoute to expose the model endpoint
5. For multi-GPU models: LeaderWorkerSet for coordinated pod groups

```yaml
apiVersion: serving.kserve.io/v1alpha1
kind: LLMInferenceService
metadata:
  name: llama3-70b-tenant-a
  namespace: pt-tenant-a
  annotations:
    pt.platform/reservation-id: "res-20260903-001"
    pt.platform/tpm-committed: "100000"
    pt.platform/term-end: "2027-10-03"
spec:
  modelSpec:
    uri: "oci://internal-registry/llama3-70b"
    runtime: vllm
    accelerator:
      count: 8
      productName: "NVIDIA-H100-NVL"
    args:
      - "--gpu-memory-utilization=0.95"
      - "--max-num-seqs=64"
      - "--enable-per-request-metrics"
      - "--enable-prefix-caching"
      - "--tensor-parallel-size=8"
  replicas:
    min: 2                  # Fixed — PT always-warm guarantee
    max: 2                  # Fixed — no autoscaling; capacity is committed
  router:
    image: "internal-registry/llm-d-inference-scheduler:v0.8"
    args:
      - "--scheduling-profile=prefix-cache-scorer,kv-cache-utilization-scorer,queue-scorer"
  worker:                   # Multi-GPU tensor parallelism
    size: 8                 # 8 GPUs per replica
```

Key differences from the old `InferenceService` approach:
- `router` block auto-provisions llm-d EPP + InferencePool + HTTPRoute
- `worker` block handles multi-GPU coordination via LeaderWorkerSet
- `replicas.min == replicas.max` enforces the PT always-warm guarantee
- Native integration with Gateway API Inference Extension

**vLLM serving engine**

All features documented in `02-technical-context.md` remain accurate. Additional capabilities now relevant for PT:

| Feature | PT Role | Configuration |
|---|---|---|
| Per-request metrics | Billing attribution per tenant | `--enable-per-request-metrics` |
| Prefix caching | EPP routes to pod with warm KV prefix; reduces TTFT | `--enable-prefix-caching` (default on in V1) |
| Chunked prefill | Prevents long-prompt requests from spiking TTFT for other PT requests | On by default in V1 |
| FP8 KV cache | Reduces KV cache memory by 2x; doubles concurrent requests per GPU | `--kv-cache-dtype fp8_e5m2` (Hopper GPUs) |
| `max-num-seqs` | Hard cap on concurrent sequences; defines PT capacity boundary | `--max-num-seqs=N` (tuned per reservation) |
| `gpu-memory-utilization` | Controls KV cache pool size; set higher (0.95) for dedicated PT nodes | `--gpu-memory-utilization=0.95` |

### 4.2 Must Build

**PT-specific `LLMInferenceConfig`** — a configuration template per PT tier that sets vLLM parameters appropriate for the GPU type and model. Not code; YAML templates consumed by the Reservation Manager when generating LLMInferenceService YAML.

| PT Tier | GPU | `gpu-memory-utilization` | `max-num-seqs` | `kv-cache-dtype` | `tensor-parallel-size` |
|---|---|---|---|---|---|
| Performance | 8×H100 NVL | 0.95 | Benchmark-derived | fp8_e5m2 | 8 |
| Max | 8×H200 NVL | 0.95 | Benchmark-derived | fp8_e5m2 | 8 |
| Standard | 8×A100 80GB | 0.90 | Benchmark-derived | auto | 8 |
| Medium (MIG) | 3g.40gb | 0.90 | Benchmark-derived | auto | 1 |
| Small (MIG) | 2g.20gb | 0.90 | Benchmark-derived | auto | 1 |
| Micro (MIG) | 1g.10gb | 0.90 | Benchmark-derived | auto | 1 |

**Model throughput profiles** — a data table mapping (model, GPU type, vLLM config) → (max TPM at 70% utilisation, P95 TTFT, recommended `max-num-seqs`). Produced using [AIConfigurator](https://github.com/ai-dynamo/aiconfigurator) (`aiconfigurator cli recommend`) with validation against on-hardware benchmarks. Consumed by the Sizing Calculator and Reservation Manager to translate a team's TPM commitment into the correct number of replicas and GPU allocation.

**AIConfigurator Integration**

[AIConfigurator](https://github.com/ai-dynamo/aiconfigurator) (CLI + REST API, web frontend: [ConfigIQ](https://configiq.dev/)) provides GPU sizing, performance estimation, and KV cache capacity analysis for vLLM, TRT-LLM, and SGLang. It replaces our manual throughput estimation with profiled kernel-level performance models.

How it integrates with PT:

1. **Throughput profile generation:** `aiconfigurator cli recommend --model-path <model> --system <gpu> --backend vllm --target-request-rate <RPM/60>` finds the minimum GPU count and optimal deployment config (TP, PP, batch size) for a target request rate. Output populates the `ThroughputProfile` CRD.
2. **KV cache capacity validation:** `aiconfigurator cli default --model-path <model> --system <gpu> --backend vllm --total-gpus <N>` reports memory breakdown including KV cache capacity, validating that the PT reservation can hold the expected concurrent requests.
3. **TTFT/TPOT estimation:** AIConfigurator estimates TTFT and TPOT per config with SLA filtering (`--ttft`, `--tpot`), providing the latency targets for the PT SLA.
4. **Deployment artifact generation:** `--deployment-target llm-d` generates llm-d Helm values, directly feeding the LLMInferenceService spec.

Fleet GPU mapping to AIConfigurator system names:

| Our Fleet GPU | AIConfigurator System | Profile Status | Notes |
|---|---|---|---|
| H100 NVL (94 GB, PCIe + NVLink bridge) | `h100_pcie` | Estimate-only | Closest match; NVLink bridge bandwidth not modeled. Validate with on-hardware benchmarks. |
| H100 SXM (80 GB, NVSwitch) | `h100_sxm` | Full SILICON profiled | Direct match. |
| H200 NVL (141 GB, PCIe + NVLink bridge) | `h200_sxm` | Full SILICON profiled | Memory capacity matches but interconnect differs (SXM NVSwitch vs NVL NVLink bridge). |
| A100 80GB (PCIe, MIG-capable) | `a100_pcie` | Estimate-only | Closest match. MIG partitions not modeled by AIConfigurator. |

> **Important:** AIConfigurator's SILICON-profiled data is collected on SXM form-factor GPUs. Our H100 NVL and A100 PCIe GPUs have different interconnect characteristics (NVLink bridge vs NVSwitch, PCIe vs SXM). AIConfigurator estimates provide a strong first-order approximation but must be validated against benchmarks on our actual hardware before setting PT chargeback rates. The `h100_pcie` and `a100_pcie` profiles use HYBRID or EMPIRICAL mode, not SILICON — results are directional, not reproducible.

---

## 5. Layer 4: Isolation

### 5.1 Upstream Components — Use Directly

All isolation primitives exist in Kubernetes and the NVIDIA GPU Operator. No custom code is needed for the mechanisms; only configuration.

**Namespace isolation**
- One OpenShift namespace per PT tenant: `pt-tenant-a`
- RBAC: tenant-scoped roles; platform team owns ClusterServingRuntime and ClusterQueue
- ResourceQuota: hard GPU limits per namespace

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: pt-gpu-quota
  namespace: pt-tenant-a
spec:
  hard:
    requests.nvidia.com/gpu: "8"
    limits.nvidia.com/gpu: "8"
```

**Physical node isolation**
- Node labels: `node-type: pt-node` or `node-type: shared`
- Node taints: `dedicated=provisioned-throughput:NoSchedule` on PT nodes
- Pod tolerations + nodeAffinity: PT pods tolerate the taint and require `node-type: pt-node`
- Prevents noisy-neighbour effects from shared pool workloads on PT GPU nodes

**NetworkPolicy**
- Restrict ingress to PT namespaces: allow only from gateway namespace and monitoring namespace
- Deny cross-tenant traffic: no pod in `pt-tenant-a` can reach pods in `pt-tenant-b`

**MIG (Phase 3)**
- A100 80GB with NVIDIA GPU Operator
- Hardware-level GPU partitioning: isolated memory bandwidth, CUDA engines, DCGM monitoring per slice
- Profiles: 1g.10gb (7 per card), 2g.20gb (3 per card), 3g.40gb (2 per card)
- Each MIG slice appears as a separate device to Kubernetes; ResourceQuota enforces per-slice allocation

### 5.2 Must Build

**PT Node Pool Manager** — a component (script or CronJob) that:
1. Labels and taints nodes when they are assigned to the PT pool
2. Tracks N+1 spare nodes per PT pool (minimum 1 spare node per 8 PT nodes)
3. Handles node reassignment when a PT reservation is created, modified, or terminated
4. Monitors DCGM health on PT nodes; flags nodes for drain on hardware errors

**NetworkPolicy templates** — specific policy YAML for PT namespaces. Template per tenant, applied by the Reservation Manager during provisioning.

---

## 6. Layer 5: Reservation Management and Billing

**This layer is the product — the business logic that sits on top of upstream infrastructure. It does NOT duplicate GPU scheduling (NVIDIA GPU Operator), model serving orchestration (KServe), or request routing (llm-d EPP). It tracks WHO gets HOW MUCH, for HOW LONG, at WHAT PRICE.**

### 6.1 What Upstream Already Handles (do not rebuild)

| Responsibility | Upstream Owner | How It Works |
|---|---|---|
| GPU drivers, device plugin, node labeling | NVIDIA GPU Operator + GPU Feature Discovery | Auto-labels nodes with GPU type, memory, MIG capability |
| MIG configuration | NVIDIA MIG Manager (part of GPU Operator) | Watches `nvidia.com/mig.config` node label |
| Model serving: vLLM pods, replicas, scaling | KServe `LLMInferenceService` controller | One YAML creates the entire serving stack |
| InferencePool, EPP deployment, HTTPRoute | KServe `LLMInferenceService` controller | Auto-provisioned from `router` block — do NOT create these separately |
| Per-team GPU quotas, fair sharing, preemption | Kueue ClusterQueue + ResourceFlavor + cohorts | Queue-based admission with borrowing and preemption policies |
| GPU metrics collection | DCGM Exporter (deployed by GPU Operator) | Already running across all environments |

### 6.2 What We Build (thin product layer)

**Reservation Manager** — a service (not a Kubernetes operator) that tracks the business relationship between tenants and their reserved capacity. It does NOT reconcile infrastructure — it generates YAML that upstream controllers reconcile.

Provisioning flow when a new reservation is approved:

```
Reservation request received
  │
  ├── 1. Validate capacity
  │       └── Query fleet: are enough GPUs available for this model + tier?
  │       └── If no: reject with "insufficient capacity"
  │
  ├── 2. Create namespace + Kueue LocalQueue
  │       └── kubectl create ns pt-{tenant}
  │       └── Apply Kueue LocalQueue pointing to the tenant's ClusterQueue
  │
  ├── 3. Apply LLMInferenceService YAML
  │       └── Model, GPU count, vLLM args from throughput profile
  │       └── replicas.min == replicas.max (always-warm)
  │       └── router block included → KServe auto-creates EPP + InferencePool + HTTPRoute
  │       └── ALL serving infrastructure is now managed by KServe, not by us
  │
  ├── 4. Register tenant in auth layer
  │       └── API key → tenant namespace mapping
  │       └── TPM budget for gateway rate limiting
  │
  ├── 5. Provision Grafana dashboard from template
  │
  └── 6. Record reservation in database
          └── tenant, model, TPM, term start/end, SLA terms, pricing
```

Deprovisioning on term expiry or cancellation:
1. Delete `LLMInferenceService` — KServe cleans up vLLM pods, EPP, InferencePool, HTTPRoute
2. Remove Kueue LocalQueue and namespace (after grace period)
3. Archive billing records and dashboard snapshots

**Key distinction:** this is a provisioning script or GitOps pipeline, not a Kubernetes operator with a reconciliation loop. The infrastructure reconciliation is handled entirely by KServe's `LLMInferenceService` controller and the NVIDIA GPU Operator.

**Kueue and Reservation Manager Coordination**

Kueue manages per-team GPU quotas via ClusterQueue/LocalQueue. The Reservation Manager tracks PT GPU allocations. These must coordinate to prevent double-allocation:

1. The Reservation Manager queries Kueue's `allocatedResources` on the PT ClusterQueue before approving a new reservation
2. When a reservation is approved, the Reservation Manager creates the tenant namespace with a Kueue LocalQueue pointing to the PT ClusterQueue and a ResourceQuota matching the reservation's GPU count
3. Kueue's admission control prevents the LLMInferenceService pods from scheduling if the ClusterQueue's total GPU quota is already consumed by other tenants
4. The PT Capacity Planner reads both the Reservation Manager's committed inventory and Kueue's `allocatedResources` to produce the authoritative fleet capacity view

This ensures that the Reservation Manager (business logic) and Kueue (scheduling enforcement) agree on GPU allocation. The Reservation Manager is the source of truth for commitments; Kueue is the enforcement mechanism that prevents over-scheduling.

**Admission Webhooks** — standard Kubernetes validating webhooks that enforce business rules:
- `committedTPM` can only increase mid-term (not decrease)
- `term.end` cannot be shortened (non-cancellable)
- New reservations rejected if fleet capacity is insufficient

**Billing Pipeline** — a data aggregation pipeline (not a controller):
- Reads per-request token counts from gateway access logs
- Applies burndown rate multipliers (output tokens × 4, cached tokens × 0.25)
- Aggregates per tenant per hour into billing records (PostgreSQL)
- Monthly chargeback report generation: committed chargeback + spillover chargeback - SLA credits

### 6.3 Sizing Calculator

A service (API endpoint or CLI tool) that translates customer workload parameters into a PT reservation recommendation.

**Inputs:**
- Model name (e.g., `llama3-70b`)
- Peak requests per minute (RPM)
- Average input tokens per request
- Average output tokens per request
- Average context length
- TTFT SLA requirement (ms)

**Outputs:**
- Recommended PT tier (Performance, Max, Standard, Medium, Small, Micro)
- GPU count and type
- Committed TPM
- Recommended `max-num-seqs`
- Estimated monthly cost (from FinOps model)

**Depends on:** Model throughput profiles (from benchmarks).

### 6.3 PT Capacity Planner

Tracks total PT pool capacity vs. committed reservations across all tenants. Responsibilities:
- Prevent over-selling: reject new PT reservations that would exceed available GPU capacity
- Capacity alerts: warn when PT pool utilisation exceeds 85% of total fleet allocation
- Procurement signal: when committed PT reservations exceed 70% of current capacity, trigger procurement planning for additional GPUs
- Maintain N+1 spare tracking: ensure at least 1 spare node per 8 PT nodes at all times

---

## 7. Layer 6: Observability and Billing

### 7.1 Upstream Components — Use Directly

**DCGM Exporter** — deployed and operational across all environments. Key metrics for PT:

| Metric | PT Use |
|---|---|
| `DCGM_FI_DEV_GPU_UTIL` | PT pool GPU utilisation — primary health metric |
| `DCGM_FI_DEV_FB_USED` / `_FREE` | KV cache memory saturation and headroom |
| `DCGM_FI_PROF_PIPE_TENSOR_ACTIVE` | Compute vs memory-stall — helps diagnose TTFT issues |
| `DCGM_FI_DEV_NVLINK_BANDWIDTH_TOTAL` | Multi-GPU PT bandwidth health |
| `DCGM_FI_DEV_ECC_DBE_VOL_TOTAL` | Hardware error detection for PT node health |
| MIG instance-level metrics | Per-slice utilisation for Phase 3 MIG PT tiers |

**vLLM Prometheus metrics** — scraped from `/metrics` on each vLLM pod. Naturally scoped per LLMInferenceService (per tenant) when each PT reservation has its own serving deployment.

| Metric | PT Use |
|---|---|
| `vllm:prompt_tokens_total` | Input token consumption for committed vs consumed |
| `vllm:generation_tokens_total` | Output token consumption |
| `vllm:time_to_first_token_seconds` | TTFT histogram — SLA compliance monitoring |
| `vllm:gpu_cache_usage_perc` | KV cache utilisation — early warning before TTFT degrades |
| `vllm:num_requests_running` | Current concurrent requests vs `max-num-seqs` ceiling |
| `vllm:num_requests_waiting` | Queue depth — signals pool saturation |

**vLLM per-request metrics** — enabled with `--enable-per-request-metrics`. Returns a `metrics` object in the response body:

```json
{
  "metrics": {
    "prompt_tokens": 1024,
    "completion_tokens": 256,
    "queue_time_ms": 12.5,
    "prefill_time_ms": 45.2,
    "decode_time_ms": 890.1,
    "total_time_ms": 947.8
  }
}
```

This is the billing primitive. The gateway access log captures these fields per request, tagged with `x-tenant-id`, for downstream aggregation.

### 7.2 Must Build

**PT Utilisation Dashboard (Grafana)**

Per-tenant dashboard showing:

| Panel | Data Source | Purpose |
|---|---|---|
| Committed TPM vs Consumed TPM | vLLM `prompt_tokens_total` + `generation_tokens_total` | Are they using what they're paying for? |
| P95 TTFT vs SLA Threshold | vLLM `time_to_first_token_seconds` | Are we meeting the SLA? |
| KV Cache Utilisation | vLLM `gpu_cache_usage_perc` | Early warning before TTFT degrades |
| GPU Utilisation | DCGM `DCGM_FI_DEV_GPU_UTIL` | Hardware health and efficiency |
| GPU Memory Used | DCGM `DCGM_FI_DEV_FB_USED` | Memory saturation monitoring |
| Concurrent Requests | vLLM `num_requests_running` / `max-num-seqs` | Capacity headroom |
| Queue Depth | vLLM `num_requests_waiting` | Pool saturation signal |
| Spillover Events | Gateway metrics (spillover tag count) | How often is traffic overflowing to the shared pool? |

Implementation: Grafana dashboard JSON provisioned per tenant by the Reservation Manager. Template with tenant namespace as variable.

**PT Billing / Chargeback Pipeline**

> **Design informed by Vertex PT comparison** (see [`12-vertex-pt-comparison.md`](12-vertex-pt-comparison.md)): billing must differentiate input vs output tokens (output costs 3-5x more to generate) and apply reduced rates for cached input tokens (prefix cache hits). This mirrors Vertex's burndown rate model.

```
vLLM response body (per-request metrics)
     │  prompt_tokens, completion_tokens, cache_hit status
     ▼
Envoy access log (%DYNAMIC_METADATA%)
     │  Tagged with: x-tenant-id, prompt_tokens, completion_tokens,
     │  request_type (dedicated / spillover / shared), cache_hit
     ▼
Log collector (Fluentd / Vector / OTel Collector)
     │
     ▼
Aggregation job (hourly)
     │  Per tenant per hour:
     │    1. Sum input tokens (non-cached) × 1.0
     │    2. Sum input tokens (cached / prefix-cache hit) × cachedInputTokenMultiplier
     │    3. Sum output tokens × outputTokenMultiplier
     │    4. Weighted total = weighted TPM consumed
     │    5. Compare weighted TPM to committed TPM
     │    6. Tag requests as within-commitment vs spillover
     ▼
Billing record store (PostgreSQL)
     │
     ├── Committed: flat rate per weighted-TPM-hour (PT pricing)
     ├── Consumed within commitment: no additional charge
     ├── Spillover: per-token shared serving rates (input and output priced separately)
     └── SLA credit events: logged when Health Monitor detects breaches
```

Components:
1. **Envoy access log format** — configured to emit per-request token counts from dynamic metadata, including `request_type` (dedicated / spillover / shared) and cache hit status
2. **Log collector** — routes access logs to the aggregation store (existing Fluentd/Vector or new OTel Collector)
3. **Aggregation job** — hourly CronJob that reads access logs, applies burndown rate multipliers, sums weighted tokens per tenant, writes to billing store
4. **Chargeback store** — PostgreSQL table: `(tenant_id, cost_centre, hour, model, input_tokens, cached_input_tokens, output_tokens, weighted_tpm_consumed, request_type, spillover_tokens, committed_tpm, chargeback_amount)`
5. **Monthly chargeback report generator** — monthly job that computes per tenant/cost centre: committed chargeback (flat rate: committed TPM x hours, regardless of usage) + spillover chargeback (input and output tokens at shared serving rates) - SLA credit deductions (from Health Monitor breach events). Output: chargeback report per cost centre for Finance. This is internal cost allocation, not commercial invoicing.
6. **Burndown rate configuration** — per-model burndown rates stored in the throughput profile registry. Default: output = 4.0x input, cached = 0.25x input. Customisable per reservation via `spec.burndownRates` in the ProvisionedThroughput CRD.

**PT Health Monitor / SLA Watchdog**

A lightweight controller or CronJob that watches PT-specific health signals and takes automated action:

| Signal | Condition | Action |
|---|---|---|
| DCGM ECC error count | > threshold on PT node | Alert + flag node for drain; reschedule to N+1 spare |
| DCGM GPU temperature | > 85°C sustained on PT node | Alert + investigate thermal throttling |
| vLLM TTFT target attainment | <99% of within-PT requests meeting `ttftTargetMs` over rolling 24-hour window | Alert; log SLA credit event in chargeback store; credit amount per `spec.sla.creditPolicy`. Note: measured only on within-PT requests (not spillover). |
| vLLM queue depth | > 0 sustained for 10 minutes | Alert: PT pool may be undersized |
| vLLM `gpu_cache_usage_perc` | > 95% sustained | Alert: KV cache saturation; TTFT degradation imminent |
| Node unreachable | PT node NotReady for 2 minutes | Evict PT pods; reschedule to spare; page on-call |

---

## 8. Phase Map — Upstream Components vs Custom Build

| Phase | What the Customer Gets | Upstream Components (Use) | Custom Build |
|---|---|---|---|
| **Phase 1** | Full-GPU PT on H100 NVL / H200 NVL; dedicated node pool; latency target attainment SLA; flat committed chargeback rate | LLMInferenceService (KServe v0.17), vLLM, InferencePool + EPP + HTTPRoute (auto-provisioned by KServe), NVIDIA GPU Operator, Kueue, DCGM, Prometheus | Reservation Manager, Auth Service, Sizing Calculator, Admission Webhooks, Dashboard Templates, Basic Chargeback Metering (flat rate: committed TPM x hours per tenant) |
| **Phase 2** | Request-level TPM enforcement; pre-routing spillover to shared pool; burndown-rate chargeback metering | Envoy AI Gateway BackendTrafficPolicy, ext_authz, InferenceObjective (alpha), vLLM per-request metrics | Pre-routing quota check in Auth Service, per-tenant TPM budget injection, Chargeback Pipeline (per-request token aggregation with burndown rates, monthly chargeback report per cost centre) |
| **Phase 3** | MIG sub-GPU PT tiers (Micro, Small, Medium) for embedding models and small LLMs | MIG profiles (operational on A100), NVIDIA GPU Operator, DCGM MIG-instance metrics | PT Operator extension for MIG tier management, MIG-aware sizing profiles, MIG reconfiguration runbook |
| **Phase 4** | PT for 70B+ models via llm-d disaggregated prefill/decode | llm-d disaggregation, NIXL KV transfer, LeaderWorkerSet, LLMInferenceService `worker` block | Two-dimensional reservation model (prefill + decode capacity), RDMA fabric validation and procurement, prefill/decode pool sizing profiles |

---

## 9. Upstream Dependency Summary

| Component | Project | Version | CNCF Status | Maturity for PT |
|---|---|---|---|---|
| KServe | kserve/kserve | v0.17+ | Incubating | LLMInferenceService production-ready |
| LLMInferenceService CRD | kserve/kserve | v0.17+ | Incubating | Production |
| llm-d | llm-d/llm-d | v0.8+ | Sandbox (March 2026) | Production (EPP, disaggregation) |
| llm-d Router (EPP) | llm-d/llm-d-router | latest | Part of llm-d | Production |
| Gateway API | kubernetes-sigs/gateway-api | v1.2+ | SIG-Network | GA |
| InferencePool | gateway-api-inference-extension | v1.0+ | SIG-Network | GA |
| InferenceObjective | gateway-api-inference-extension | v1.0+ | SIG-Network | Alpha (v1alpha2) |
| Envoy AI Gateway | envoyproxy/ai-gateway | latest | Envoy ecosystem | Production |
| vLLM | vllm-project/vllm | v0.18+ (V1) | Independent | Production |
| Kueue | kubernetes-sigs/kueue | v0.9+ | SIG-Scheduling | GA |
| DCGM | NVIDIA/dcgm-exporter | latest | Independent | Production |
| AIConfigurator | ai-dynamo/aiconfigurator | v0.10+ | Independent | Production — GPU sizing, throughput estimation, KV cache analysis |
| ConfigIQ | redhat-performance/configiq | latest | Independent | Production — web frontend for AIConfigurator (sizing calculator, GPU explorer) |
| NVIDIA GPU Operator | NVIDIA/gpu-operator | latest | Independent | Production |

### Air-Gap Considerations

All upstream components must be mirrored to the internal OCI registry before deployment. The PT release process must include:

1. Pin exact image versions for all components
2. Mirror images through the internal registry promotion pipeline
3. Security scan all images before promotion
4. Validate in UAT environment before PROD deployment
5. Document rollback procedure for each component

---

## 10. Open Architecture Questions

| # | Question | Blocks | Resolution Path |
|---|---|---|---|
| A1 | Does `LLMInferenceService` work correctly in air-gapped OpenShift with the `llmisvc` Helm chart? | Phase 1 | Engineering spike: deploy KServe v0.17 + llm-d in DEV |
| A2 | Is Envoy AI Gateway's `limit.fromMetadata` available in a tagged release suitable for air-gapped deployment? | Phase 2 | Check Envoy Gateway release notes; mirror if available |
| A3 | Can InferenceObjective priority work across separate InferencePools (PT pool vs shared pool), or only within a single pool? | Phase 2 | Test with Gateway API Inference Extension |
| A4 | Does the llm-d EPP's prefix-cache-scorer work correctly when each PT tenant has a separate InferencePool with its own EPP? | Phase 1 | Confirmed by architecture: each EPP scores only within its pool |
| A5 | Can `LLMInferenceService` `replicas.min == replicas.max` be enforced without HPA overriding it? | Phase 1 | Verify KServe autoscaling interaction; may need to disable KPA |
| A6 | How does the Reservation Manager interact with OpenShift's multi-tenancy model (Projects vs Namespaces)? | Phase 1 | OpenShift Projects are Namespaces with additional metadata; should be compatible |
| A7 | Can the PT Auth Service resolve tenant identity from source namespace or Istio mTLS certificate without requiring an explicit `x-tenant-id` header? | Phase 2 | Test ext_authz with Envoy's `source.namespace` and `connection.uri_san_peer_certificate` metadata. If feasible, PT activation becomes near-transparent (no code change for tenant). |
| A8 | What is the model weight loading time for a 70B model from NVMe on H100 NVL? This determines the feasibility of model swap within commitment and the transition downtime customers would experience. | Phase 3 | Benchmark cold-start time in DEV environment. If <60 seconds, rolling swap is viable with brief traffic cutover. |
| A9 | Can the Reservation Manager support a shared PT pool model (multiple short-term tenants on the same tainted nodes) to make 1-week commitment terms operationally viable? | Phase 2 | Design shared pool with per-tenant InferenceService on shared nodes (soft isolation via ResourceQuota rather than physical node taints). Trade-off: weaker isolation, lower node cycling overhead. |
