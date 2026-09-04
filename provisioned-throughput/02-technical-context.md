# Technical Context: Implementing PT on the On-Prem GPU Stack

**Status:** Discovery
**Date:** 2026-09-03
**Owner:** PM — Inference Platform

> This document covers the technical implementation of Provisioned Throughput on our specific GPU fleet and stack. The fleet hardware (H100 NVL, H200 NVL, H100 HBM3, A100 80GB) and the platform stack (KServe + vLLM + Triton on OpenShift) are established facts about our on-prem infrastructure. Every PT design decision must be grounded in these constraints.

---

## 1. The GPU Fleet — What PT Is Built On

### 1.1 Hardware in the Fleet

| GPU | Memory | Architecture | Interconnect | PT Relevance |
|---|---|---|---|---|
| H100 NVL | 94 GB HBM3 per GPU (dual-GPU card, 188 GB total) | Hopper | PCIe + NVLink bridge (600 GB/s pairwise) | Primary PT tier — best inference throughput for 7B–70B models |
| H200 NVL | 141 GB HBM3e | Hopper | PCIe + 2-way or 4-way NVLink bridge (900 GB/s per GPU) | Long-context PT; very large models; highest memory in fleet |
| H100 SXM | 80 GB HBM3 | Hopper | NVSwitch (900 GB/s all-to-all) | High-throughput PT serving |
| A100 80GB | 80 GB HBM2e | Ampere | PCIe | MIG-capable — sub-GPU PT tiers; medium model PT; embedding model PT (1g.10gb, 2g.20gb, 3g.40gb MIG profiles confirmed active) |

**Critical hardware note — NVL vs NVSwitch:**
H100 NVL cards are PCIe form-factor with NVLink bridging between GPU pairs at 600 GB/s. H200 NVL cards support 2-way or 4-way NVLink bridges at 900 GB/s per GPU. Neither are the SXM/DGX form factor with NVSwitch (full all-to-all GPU interconnect). This matters for multi-GPU tensor parallelism on 70B+ models. Multi-node PT requires InfiniBand or RoCE RDMA fabric — infrastructure team must confirm whether NDR InfiniBand is present before designing PT for models that span multiple nodes.

### 1.2 Why Memory Is the Primary Constraint for PT Sizing

GPU compute (FLOPS) is rarely the bottleneck in LLM inference. **KV cache memory** is:

```
KV cache per token ≈ 2 × num_layers × num_kv_heads × head_dim × dtype_bytes

LLaMA-3 70B uses Grouped Query Attention (GQA) with 8 KV heads (not 64 query heads).

Example — LLaMA-3 70B, BF16:
  = 2 × 80 × 8 × 128 × 2 = 327,680 bytes = 320 KB per token

For a 4,096-token context:
  KV cache per active request = 4,096 × 320 KB = 1.28 GB

For a 128k-token context:
  KV cache per active request = 131,072 × 320 KB = 40 GB

Note: model weights for LLaMA-3 70B in BF16 require ~140 GB — at least 2 GPUs
via tensor parallelism (TP). With 8×H100 NVL (TP=8): ~17.5 GB weights per GPU,
leaving ~76 GB per GPU (94 GB × 85% usable = 80 GB; minus 17.5 GB weights ≈ 62 GB)
for KV cache.

Concurrent 4k-context requests per GPU: 62 GB ÷ 1.28 GB = ~48
Concurrent 128k-context requests per GPU: 62 GB ÷ 40 GB = ~1.5
```

**PT implication:** The TPM a customer can buy is bounded not by GPU compute but by KV cache memory. GQA (used in LLaMA-3 and most modern models) dramatically reduces KV cache size per token — 8× smaller than MHA — enabling far more concurrent requests per GPU. However, a customer requesting long-context PT (128k token contexts) still gets far fewer concurrent request slots per GPU than short-context workloads. The PT sizing model must account for context length, not just request rate.

### 1.3 Throughput Benchmarks — Must Be Measured, Not Assumed

These are the numbers that determine PT pricing floors. They do not exist yet — benchmarks must be run on our actual hardware with our actual vLLM configuration.

| Model | GPU Config | Expected Output Throughput | Status |
|---|---|---|---|
| LLaMA-3 70B | 8×H100 NVL, vLLM, BF16 | ~1,500–2,500 tok/sec | **Run benchmark** |
| LLaMA-3 8B | 2×H100 NVL, vLLM, BF16 | ~3,000–6,000 tok/sec | **Run benchmark** |
| Gemma-4 26B | 4×H100 NVL, vLLM, BF16 | ~2,000–4,000 tok/sec | **Run benchmark** |
| Mistral 7B | 1×H100 NVL, vLLM, BF16 | ~3,500–7,000 tok/sec | **Run benchmark** |
| Embedding model (sub-2GB) | 1g.10gb MIG slice, A100 | ~500k+ tok/sec | **Run benchmark** |

Without these numbers, the FinOps model has no price floor. Benchmarks are a prerequisite for the discovery gate, not a post-design activity.

---

## 2. The Platform Stack

### 2.1 Confirmed Technology Decisions

The platform analysis evaluated 8 technologies against 10 requirements. The stack is decided:

| Layer | Technology | Decision |
|---|---|---|
| Control plane | **KServe** (CNCF incubating since Sept 2025, OpenShift AI default) | Confirmed primary |
| LLM serving CRD | **`LLMInferenceService`** (KServe v0.17) — purpose-built for LLM workloads; auto-provisions llm-d EPP + InferencePool + HTTPRoute | **Phase 1 deployment target** (replaces hand-rolled `InferenceService` for PT) |
| LLM serving engine | **vLLM** (V1) — with `--enable-per-request-metrics` for billing attribution | In production |
| Intelligent routing | **llm-d EPP** (Endpoint Picker) — KV-cache-aware, prefix-cache-aware, queue-depth-aware routing via ext-proc | **Phase 1 deployment target** (auto-provisioned by `LLMInferenceService` `router` block) |
| Request ingress | **Envoy AI Gateway** — token-based rate limiting via `BackendTrafficPolicy` with `limit.fromMetadata` | **Phase 2 deployment target** for TPM enforcement |
| Non-LLM serving | **Triton Inference Server** (under KServe) | In production (note: NVIDIA Dynamo is Triton's successor) |
| 70B+ / MoE models | **llm-d** disaggregated prefill/decode (CNCF Sandbox, March 2026) | Phase 4; pilot in progress |
| Fractional GPU | **MIG** via NVIDIA GPU Operator | Confirmed operational in A100 environment |
| Request routing API | **Gateway API Inference Extension** (GA March 2026) — InferencePool (GA) + InferenceObjective (alpha) | Phase 1 deployment target |
| PT vs shared serving priority | **InferenceObjective** (`inference.networking.x-k8s.io/v1alpha2`) — priority field consumed by EPP | Phase 2 (alpha; design PT to function without it) |
| Platform | **Red Hat OpenShift** (air-gapped) | In production |
| GPU metrics | **DCGM** + Grafana + Prometheus | In production |
| Batch job scheduling | **Kueue** | Batch workloads only; not in real-time inference path |

> **Architecture note:** The full PT architecture with upstream component mapping, build-gap analysis, and per-layer detail is in [`10-architecture.md`](10-architecture.md). This section documents the stack decisions; `10-architecture.md` documents how they integrate into the PT product.

Evaluated and deliberately deferred: NVIDIA Dynamo (successor to Triton Inference Server; requires RDMA/InfiniBand fabric for production disaggregated serving — not available in current fleet), NVIDIA Run:ai (commercial GPU orchestration with multi-tenant quota and fairshare scheduling — Phase 5 build-vs-buy decision), Ray Serve (best-fit for fine-grained fractional GPU — deferred due to ops burden). **Note:** Dynamo's position as Triton's successor means the Triton component in our stack has a defined migration path; monitor Dynamo roadmap.

### 2.2 One Stack for All Models — The Design Constraint

The platform requirement is explicit: **one approach for all models, all projects, all environments.** PT cannot introduce a parallel serving infrastructure. It must be a reservation and routing policy layer on top of the existing KServe + vLLM stack.

This eliminates solutions that require a separate scheduler, separate serving framework, or separate control plane for PT traffic.

---

## 3. How PT Isolation Works on KServe + vLLM

### 3.1 The Core Isolation Architecture

PT is enforced through dedicated serving pools — separate from the shared serving pool:

```
On-Prem GPU Fleet
│
├── PT Pool (per tenant or per reservation)
│   ├── KServe InferenceService: model-X, project-A  ← dedicated replicas
│   │   └── vLLM pod(s) serving ONLY project-A's PT traffic
│   └── KServe InferenceService: model-X, project-B  ← dedicated replicas
│       └── vLLM pod(s) serving ONLY project-B's PT traffic
│
└── Shared Pool
    └── KServe InferenceService: model-X, shared
        └── vLLM pod(s) serving all non-PT requests (best-effort)
        └── HPA: scales dynamically with traffic
```

PT replicas have fixed replica counts (`minReplicas == maxReplicas == N`). They hold their GPU allocation permanently for the duration of the reservation. Shared pool replicas scale dynamically based on traffic.

### 3.2 KServe LLMInferenceService as the PT Unit of Enforcement

> **Update:** KServe v0.17 introduces `LLMInferenceService` as the purpose-built CRD for LLM workloads. It replaces `InferenceService` for PT deployments and auto-provisions the llm-d EPP, InferencePool, and HTTPRoute when a `router` block is defined. The full updated architecture is in [`10-architecture.md`](10-architecture.md). The YAML below is retained for reference but should be migrated to `LLMInferenceService` format during Phase 1 design.

Each PT reservation maps to a KServe InferenceService (migrating to LLMInferenceService) with specific parameters:

```yaml
apiVersion: serving.kserve.io/v1beta1
kind: InferenceService
metadata:
  name: llama3-70b-tenant-a
  namespace: pt-tenant-a
  annotations:
    pt.platform/reservation-id: "res-20260903-001"
    pt.platform/tpm-committed: "100000"
    pt.platform/term-end: "2026-10-03"
spec:
  predictor:
    minReplicas: 2        # Fixed — guarantees always-warm capacity
    maxReplicas: 2        # Fixed — no autoscaling for PT; capacity is committed
    model:
      modelFormat:
        name: vllm
      storageUri: "oci://internal-registry/llama3-70b"
      args:
        - "--gpu-memory-utilization=0.90"
        - "--max-num-seqs=64"
      resources:
        requests:
          nvidia.com/gpu: "8"
        limits:
          nvidia.com/gpu: "8"
```

`minReplicas == maxReplicas` ensures the PT pod is always running, always warm, GPU always held. This is the product guarantee.

### 3.3 Node Affinity and Taints — Physical Pool Isolation

PT pods must be physically isolated from shared pool pods to prevent noisy-neighbour effects on the same GPU node:

```yaml
# Taint PT nodes so only PT pods schedule on them
kubectl taint nodes h100-pt-node-01 dedicated=provisioned-throughput:NoSchedule

# PT InferenceService tolerates the taint and prefers PT nodes
spec:
  predictor:
    affinity:
      nodeAffinity:
        requiredDuringSchedulingIgnoredDuringExecution:
          nodeSelectorTerms:
          - matchExpressions:
            - key: node-type
              operator: In
              values: ["pt-node"]
    tolerations:
    - key: "dedicated"
      operator: "Equal"
      value: "provisioned-throughput"
      effect: "NoSchedule"
```

Without physical isolation, a bursty shared-pool workload on the same GPU node as a PT workload can cause memory pressure, thermal throttling, or NVLink bandwidth contention — all of which degrade PT TTFT. Physical isolation is the only reliable guarantee.

### 3.4 OpenShift Namespace and ResourceQuota per Tenant

Each PT tenant gets a dedicated OpenShift namespace. ResourceQuota enforces hard GPU limits:

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: pt-tenant-a-gpu-quota
  namespace: pt-tenant-a
spec:
  hard:
    requests.nvidia.com/gpu: "8"     # Exactly the GPUs backing their reservation
    limits.nvidia.com/gpu: "8"
```

This ensures no single PT tenant can accidentally consume more than their reservation even if the InferenceService spec is misconfigured. ResourceQuota is the enforcement backstop.

---

## 4. vLLM — How It Enables PT

### 4.1 vLLM Features Critical to PT

| Feature | How It Enables PT |
|---|---|
| **Continuous batching** | Keeps GPU utilisation high within the PT pool; requests are packed into the current decode step dynamically. High utilisation = better economics. |
| **PagedAttention** | KV cache as virtual memory pages; reduces fragmentation; more concurrent requests per GPU than naive KV allocation. Directly increases TPM per reserved GPU. |
| **Prefix caching** | Shared system prompts are cached as KV pages. PT tenants with shared system prompts (RAG, agents) get significant TPM multiplication from prefix hits. |
| **Chunked prefill** | Splits large prompt prefill into chunks. Prevents a single long-prompt request from monopolising decode steps and spiking TTFT for other concurrent PT requests. |
| **`--max-num-seqs`** | Hard cap on concurrent sequences. Sets the ceiling on concurrent requests, which defines the PT capacity boundary. Must be tuned per reservation. |
| **`--gpu-memory-utilization`** | Controls what fraction of GPU memory vLLM claims at startup. Set to 0.90 for PT pools (full KV cache headroom); can be lower for shared pools. |
| **Priority queues** | vLLM supports request priority. If PT and shared serving share a pool (Phase 2 soft isolation), PT requests get priority over shared traffic. |
| **Per-request metrics** | `--enable-per-request-metrics` returns `prompt_tokens`, `completion_tokens`, `queue_time_ms`, `prefill_time_ms`, `decode_time_ms` in the response body. This is the per-tenant billing attribution primitive — the gateway access log captures these fields tagged with `x-tenant-id`. |
| **FP8 KV cache** | `--kv-cache-dtype fp8_e5m2` on Hopper GPUs reduces KV cache memory by 2×, doubling concurrent requests per GPU. Significant impact on PT capacity and pricing. |

### 4.2 TTFT SLA — What vLLM Can and Cannot Guarantee

vLLM can guarantee TTFT within bounds **when the PT pool is not over-subscribed**. Specifically:
- If concurrent requests ≤ `max-num-seqs`, TTFT is bounded by the prefill compute time
- If concurrent requests > `max-num-seqs`, requests queue — TTFT rises unpredictably

The PT product SLA must be grounded in the measured TTFT at the committed TPM level, not at theoretical peak. The sizing model must leave 20–30% headroom above the committed TPM to absorb natural burst within the SLA threshold.

### 4.3 Telemetry — Per-Tenant TPM Metering

vLLM exposes Prometheus metrics that form the basis for PT utilisation metering and chargeback:

```
# Available at /metrics on each vLLM pod
vllm:prompt_tokens_total          # Input tokens processed
vllm:generation_tokens_total      # Output tokens generated
vllm:num_requests_total           # Total requests
vllm:time_to_first_token_seconds  # TTFT histogram
vllm:gpu_cache_usage_perc         # KV cache utilisation
vllm:num_requests_running         # Current concurrent requests
```

For PT metering, these metrics are naturally scoped per InferenceService (per tenant) when each PT reservation runs as its own InferenceService in its own namespace. The metering gap (who owns which tokens) is resolved by the isolation architecture.

---

## 5. Kueue — Batch PT Workloads

Kueue is not in the real-time inference serving path. It is the scheduling layer for **batch PT workloads** — scheduled inference over document sets, nightly pipeline runs, fine-tuning jobs.

### 5.1 What Kueue Provides for Batch PT

```yaml
# ClusterQueue: PT batch quota pool
apiVersion: kueue.x-k8s.io/v1beta1
kind: ClusterQueue
metadata:
  name: pt-batch-queue
spec:
  namespaceSelector:
    matchLabels:
      tier: pt-batch
  resourceGroups:
  - coveredResources: ["nvidia.com/gpu"]
    flavors:
    - name: h100-nvl
      resources:
      - name: "nvidia.com/gpu"
        nominalQuota: 16    # Tenant's PT batch GPU allocation
        borrowingLimit: 0   # Cannot borrow from shared pool
---
# LocalQueue: per-tenant view
apiVersion: kueue.x-k8s.io/v1beta1
kind: LocalQueue
metadata:
  name: tenant-a-batch
  namespace: pt-tenant-a
spec:
  clusterQueueName: pt-batch-queue
```

### 5.2 Batch PT vs Real-Time PT

| Dimension | Real-Time PT | Batch PT |
|---|---|---|
| Workload type | Persistent serving (HTTP endpoint) | Scheduled jobs (start → complete) |
| Mechanism | KServe InferenceService + fixed minReplicas | Kueue ClusterQueue + Job admission |
| TTFT SLA | Yes — always-warm replicas | No — latency is total job completion time |
| Pricing | Per committed TPM-hour | Per GPU-hour committed window |
| Customer | Production application teams | Data pipeline / batch processing teams |
| Enforcement | KServe ResourceQuota + node taints | Kueue ClusterQueue nominalQuota |

---

## 6. llm-d — Phase 4 PT for 70B+ Models

llm-d (CNCF-donated March 2026) is the disaggregated inference serving architecture for very large models and MoE models. Phase 4 of the platform roadmap targets llm-d for 70B+ model serving.

### 6.1 What llm-d Does

Standard vLLM processes prefill (prompt computation — compute-intensive, brief) and decode (token generation — memory-intensive, extended) on the same GPU. Under load, long prefill requests block the decode pipeline, spiking TTFT.

llm-d disaggregates these roles:

```
Prefill Nodes:  GPU-compute-intensive; handle prompt prefill phase
Decode Nodes:   GPU-memory-intensive; handle token generation
KV Router:      Directs each request to the right prefill node → transfers KV cache → decode node
                Chooses prefill node with warm prefix cache for prefix-cache hits
```

### 6.2 PT Implications for llm-d

For a model served via llm-d, the PT reservation cannot be expressed as a single TPM number. The reservation has two dimensions:

- **Prefill capacity:** how many prompt prefills per minute can be served (bounded by compute)
- **Decode capacity:** how many output tokens per minute can be sustained (bounded by memory bandwidth)

A document processing workload (long prompts, short outputs) is prefill-heavy. A chatbot (short prompts, long outputs) is decode-heavy. They need different shapes of PT reservation even at the same TPM level.

**PT Phase 4 product design question:** Do we expose this two-dimensional capacity model to customers, or do we hide it behind a single TPM number and internally size prefill/decode ratios from the customer's stated use case? Hiding it is better UX. Exposing it is more precise. This is a Phase 4 design decision — not a Phase 1 concern.

### 6.3 llm-d Network Requirements

KV cache transfer between prefill and decode nodes requires RDMA fabric. Both llm-d and NVIDIA Dynamo use NIXL for KV cache transfers. **Without RDMA, expect 200–500× TTFT degradation** (~98s with TCP vs ~200–500ms with RDMA, per NVIDIA benchmarks).

| Transport | Bandwidth | Cross-Node | GPU Direct |
|---|---|---|---|
| NVLink (intra-pod only) | 450–900 GB/s | No | Yes |
| InfiniBand RDMA | 20–50 GB/s | Yes | Yes (with GPUDirect) |
| RoCE RDMA | 10–25 GB/s | Yes | Yes (with GPUDirect) |
| TCP (fallback) | 1–3 GB/s | Yes | No (host staging) |

**Infrastructure team must confirm:** Do our H100 NVL / H200 NVL nodes have InfiniBand or RoCE connectivity, and at what speed? This determines whether multi-node llm-d PT is viable. TCP-only networking makes disaggregated serving non-viable for production.

---

## 7. MIG — Sub-GPU PT Tiers

### 7.1 MIG Is Operationally Proven

A100 80GB MIG is confirmed operational in the DEV environment with the following profiles active:
- **3g.40gb:** ~40 GB memory, 3/7 of SM compute — medium models (13B–34B)
- **2g.20gb:** ~20 GB memory, 2/7 of SM — small models (7B–13B); guard/audio models confirmed at 42–88% SM utilisation
- **1g.10gb:** ~10 GB memory, 1/7 of SM — embedding models, classifiers, sub-2 GB models

MIG creates hard hardware-level partitions. Each partition has:
- Isolated memory bandwidth (no memory crosstalk between slices)
- Isolated CUDA compute engines
- Independent DCGM monitoring (each slice appears as a separate device)
- Full isolation — stronger than vLLM process isolation; guaranteed by hardware

### 7.2 PT MIG Tiers

| PT Tier | MIG Profile | Memory | Target Models | Notes |
|---|---|---|---|---|
| Micro | 1g.10gb | ~10 GB | Embedding models, classifiers, guard (sub-2 GB) | 7 per A100 80GB card |
| Small | 2g.20gb | ~20 GB | 7B LLMs, audio models | 3 per A100 80GB card |
| Medium | 3g.40gb | ~40 GB | 13B–34B LLMs | 2 per A100 80GB card |
| Standard | Full A100 80GB | 80 GB | 34B–70B LLMs on A100 | 1 per card |
| Large | Full H100 NVL | 94 GB | 34B–70B LLMs on H100 | 1 per GPU (2 GPUs per NVL card) |
| XL | Full H200 NVL | 141 GB | 70B LLMs at long context | 1 per GPU |

MIG PT is Phase 3. Phase 1 targets full-GPU PT on the H100 NVL / H200 NVL pool.

### 7.3 MIG Operational Constraint

MIG profile changes require GPU Operator reconfiguration. Whether this requires a node drain depends on the specific GPU, driver version, and OpenShift configuration. **Engineering must test this in our environment before Phase 3 PT design.** If PT tier changes (e.g., a customer upgrades from Small to Medium) require a node drain and reboot, the SLA implications must be defined (e.g., "tier changes take effect at next maintenance window with 24-hour notice").

---

## 8. DCGM — The Metering and Observability Foundation

DCGM (Data Center GPU Manager) is deployed and collecting metrics across the fleet. This is the observability foundation PT needs.

### 8.1 What DCGM Provides for PT

| DCGM Metric | PT Usage |
|---|---|
| `DCGM_FI_DEV_GPU_UTIL` | PT pool GPU utilisation — primary health metric |
| `DCGM_FI_DEV_FB_USED` | KV cache utilisation — saturation signal |
| `DCGM_FI_DEV_FB_FREE` | Available KV cache headroom — early warning before TTFT degrades |
| `DCGM_FI_PROF_PIPE_TENSOR_ACTIVE` | Actual tensor core activity — distinguishes compute-busy from memory-stalled |
| `DCGM_FI_DEV_NVLINK_BANDWIDTH_TOTAL` | NVLink inter-GPU bandwidth — relevant for multi-GPU model PT |
| MIG instance-level metrics | Per-slice utilisation for MIG PT tiers |

### 8.2 Combined Metering: DCGM + vLLM Metrics

PT requires two views simultaneously:
- **GPU view** (DCGM): hardware utilisation, memory saturation, thermal state
- **Request view** (vLLM Prometheus): tokens consumed, TTFT per request, concurrent active requests, queue depth

The PT utilisation dashboard must show both. A PT tenant whose GPU is 90% utilised but TTFT is 5× the SLA threshold has a different problem than a tenant at 30% GPU with TTFT within SLA. Both signals are required to diagnose PT health.

---

## 9. The Gateway API Inference Extension — Request Routing

The Gateway API Inference Extension reached GA in March 2026. This is the request-routing layer for PT traffic.

### 9.1 What It Provides

- Model-aware load balancing across vLLM replicas
- Header-based routing (route requests to PT pool based on tenant header or API key)
- Prefix-cache-aware routing (routes requests to the replica that has the KV prefix warm)
- LoRA adapter awareness

### 9.2 PT Routing Architecture

```
Incoming Request
     │
     ▼
Gateway API HTTPRoute
     │
     ├── X-Tenant: tenant-a, model: llama3-70b
     │       ↓
     │   InferencePool: pt-tenant-a-llama3-70b  ← routes to PT pool
     │       ↓
     │   vLLM PT replicas (fixed, always-warm)
     │
     └── X-Tenant: shared (or no PT header)
             ↓
         InferencePool: shared-llama3-70b       ← routes to shared pool
             ↓
         vLLM shared replicas (dynamic, best-effort)
```

### 9.3 TPM Enforcement at the Gateway Layer

The Gateway API Inference Extension does not natively implement per-tenant TPM rate limiting (token bucket enforcement). Options for adding it:

| Option | Mechanism | Complexity | Phase |
|---|---|---|---|
| Separate vLLM per tenant | No shared replicas; metering is per-InferenceService naturally | Low | Phase 1 (recommended) |
| Envoy rate-limit filter | Token bucket at Gateway using token counts from vLLM response trailers | Medium | Phase 2 |
| Admission sidecar | Custom sidecar tracks TPM per tenant and enforces limits | High | Phase 2 |

Phase 1 uses separate InferenceService per tenant for clean isolation and metering. Phase 2 evaluates whether shared replicas with Gateway-layer enforcement are more GPU-efficient while maintaining per-tenant SLAs.

---

## 10. Engineering Feasibility Questions

These must be answered before the discovery gate. Engineering feasibility memo required.

| # | Question | Impact if Unresolved |
|---|---|---|
| T1 | What is measured H100 NVL throughput (tokens/sec) for each model at PT-level utilisation (70% GPU) with our actual vLLM config? | Cannot price PT without this; FinOps model is invalid |
| T2 | Does physical node isolation (taint/affinity) work cleanly with our OpenShift RBAC and SCC model? | PT isolation guarantee is unverifiable without testing |
| T3 | Can MIG profiles be changed without node drain in our OpenShift + NVIDIA GPU Operator environment? | Determines PT tier change SLA and operational process |
| T4 | Does the Gateway API Inference Extension's HTTPRoute work correctly with our air-gapped OpenShift configuration? | If routing doesn't work in air-gap, PT endpoint delivery is blocked |
| T5 | What is the cold-start time for each major model from local NVMe storage on H100 NVL? | Determines whether PT must always hold warm replicas or whether fast cold-start is an acceptable alternative |
| T6 | Are H100 NVL / H200 NVL nodes connected via InfiniBand or Ethernet? At what speed? | Determines feasibility of multi-node llm-d PT in Phase 4 |
