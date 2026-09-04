# Synthesis: What We Know About Our Platform

**Status:** Discovery
**Date:** 2026-09-03
**Owner:** PM — Inference Platform

> This document synthesises what is known and confirmed about our on-prem GPU infrastructure and platform stack, and maps those facts to PT design decisions. PT is a throughput reservation product. Infrastructure context tells us what hardware backs it, what performance to expect, and where the operational risks are.

---

## 1. What We Know About Our Infrastructure

Our on-prem GPU infrastructure consists of:
- GPU types: H100 NVL (94 GB HBM3 per GPU), H200 NVL (141 GB HBM3e), H100 SXM (80 GB HBM3), A100 80GB deployed across PROD, UAT, and DEV environments
- Technology stack: KServe + vLLM + Triton on OpenShift (decided and in production); llm-d confirmed for Phase 4
- MIG operational status: confirmed active in DEV with proven profiles (3g.40gb, 2g.20gb, 1g.10gb)
- Observability: DCGM deployed and producing per-GPU metrics across all environments

**What this means for PT:**
- The hardware that will back PT reservations is known (GPU types, memory capacity, interconnect)
- The serving stack PT must integrate with is fixed (KServe + vLLM — not negotiable)
- MIG is proven and available for sub-GPU PT tiers on A100
- Our serving stack is capable of sustaining high memory utilisation (>90%) under well-managed continuous workloads
- DCGM is deployed and metering infrastructure is available from day one

**What infrastructure context does not do:**
- It does not change the PT product definition (guaranteed throughput, SLA, committed pricing)
- It does not make PT an internal fleet governance project
- It does not change who the PT customer is (anyone who needs guaranteed LLM inference throughput)

---

## 2. How the Fleet Data Maps to Each PT Design Decision

### 2.1 PT Tier Structure → Informed by GPU Types in Fleet

The fleet's GPU composition directly determines what PT tiers we can offer:

| PT Tier | GPU | Why This Tier Exists |
|---|---|---|
| Micro | 1g.10gb MIG (A100 80GB) | Fleet has A100 MIG proven; embedding models confirmed at sub-2 GB VRAM; up to 7 instances per card |
| Small | 2g.20gb MIG (A100 80GB) | Small specialized models achieve 42–88% SM utilisation on this slice; up to 3 instances per card |
| Medium | 3g.40gb MIG (A100 80GB) | Medium LLM serving on half-card; up to 2 instances per card |
| Standard | 8×A100 80GB node | Full-node PT for 34B–70B on A100 |
| Performance | 8×H100 NVL node | Primary production PT tier; 94 GB per GPU enables large KV cache for 7B–70B |
| Max | 8×H200 NVL node | Premium PT for long-context workloads; 141 GB per GPU enables largest KV cache |

### 2.2 Throughput SLAs → Must Be Benchmarked on Actual Hardware

Our infrastructure tells us the hardware exists. It does not tell us what throughput the hardware delivers under PT serving conditions. The benchmarks required before PT pricing can be set:

```
Run on our actual H100 NVL node with our actual vLLM configuration:

For each model × GPU config:
  Load: 60%, 70%, 80%, 90% of max concurrency (defined by --max-num-seqs)
  Measure:
    - Output tokens/sec (throughput)
    - P50, P95, P99 TTFT (time to first token)
    - P50, P95, P99 TBT (time between tokens)
    - GPU memory utilisation (from DCGM)
    - GPU SM utilisation (from DCGM)

Result:
  Throughput table: model × GPU config → TPM at 70% utilisation
  TTFT table: model × GPU config × load → P95 TTFT
  These tables are the foundation of PT SLA commitments and pricing
```

Without these numbers, we cannot price PT and we cannot commit to a TTFT SLA. Benchmarks are not optional for discovery — they are a gate criterion.

### 2.3 PT Pool Sizing → Informed by Fleet Utilisation Patterns

Our GPU environments across PROD, UAT, and DEV produce measurable utilisation data. The key observation for PT pool sizing: our serving stack is capable of sustaining high memory utilisation (>90%) under well-managed, continuous workloads — this is the operating point PT pools should target.

For PT pool sizing, we need to understand the PT customer's traffic pattern — not the platform's existing traffic pattern. The PT customer's traffic profile determines whether PT pool utilisation will be 40%, 70%, or 90%. This is why user research (specifically asking for traffic graphs) is essential before we size PT pools.

### 2.4 PT Isolation Architecture → Informed by Stack Decision

The platform chose KServe + vLLM as the serving stack. Physical node isolation for PT (taints + affinity) is the recommended Phase 1 isolation approach — this is consistent with the stack and requires no new tooling. MIG provides the strongest sub-GPU isolation and is available on the A100 nodes.

### 2.5 PT Metering → DCGM + vLLM Prometheus Already Available

DCGM is deployed and already producing per-GPU metrics. vLLM exposes Prometheus metrics per serving process. The metering infrastructure exists. Phase 1 PT metering (separate InferenceService per tenant = naturally isolated metrics) requires no new tooling — just a Grafana dashboard definition per tenant.

---

## 3. The Phase Map

| PT Phase | What the Customer Gets | Upstream (Use) | Custom (Build) |
|---|---|---|---|
| **Phase 1** | Guaranteed TPM on H100 NVL or H200 NVL; dedicated node pool; latency target attainment SLA; flat committed chargeback rate | `LLMInferenceService` (KServe v0.17) with llm-d EPP auto-provisioning InferencePool + HTTPRoute; vLLM with per-request metrics; DCGM; node taints + ResourceQuota | PT Reservation CRD + Reservation Manager; PT Auth Service; Sizing Calculator; Utilisation Dashboard; Basic Chargeback Metering (flat rate: committed TPM x hours) |
| **Phase 2** | Request-level TPM enforcement; pre-routing spillover to shared pool; burndown-rate chargeback metering | Envoy AI Gateway `BackendTrafficPolicy` with `limit.fromMetadata` for token-based rate limiting; `InferenceObjective` (alpha) for PT priority scheduling | Pre-routing quota check in Auth Service; per-tenant TPM budget injection; Chargeback Pipeline (per-request token aggregation with burndown rates, monthly chargeback report per cost centre) |
| **Phase 3** | Sub-GPU MIG PT tiers (Micro, Small, Medium); embedding model and small LLM PT | MIG profiles on A100 (operational); NVIDIA GPU Operator; DCGM MIG-instance metrics | Reservation Manager extension for MIG tiers; MIG-aware sizing profiles |
| **Phase 4** | PT for 70B+ and MoE models via llm-d; disaggregated prefill/decode | llm-d disaggregation; NIXL KV transfer; `LLMInferenceService` `worker` block for LeaderWorkerSet | Two-dimensional reservation model (prefill + decode capacity); RDMA fabric validation |

> **Architecture detail:** The full component-by-component architecture with upstream maturity assessment, build-gap analysis, and CRD specification is in [`10-architecture.md`](10-architecture.md) and [`11-pt-crd-spec.md`](11-pt-crd-spec.md).

---

## 4. What We Know Enough to Start

These facts are confirmed and design-ready:

- **Stack is KServe + vLLM on OpenShift.** KServe v0.17 ships `LLMInferenceService` — the purpose-built CRD for LLM workloads that auto-provisions llm-d EPP, InferencePool, and HTTPRoute. PT should be designed on `LLMInferenceService`, not bare `InferenceService`.
- **llm-d EPP is production-ready.** KV-cache-aware, prefix-cache-aware routing is available now via the llm-d router, not only in Phase 4. Phase 1 PT benefits from intelligent routing from day one.
- **Envoy AI Gateway provides TPM rate limiting.** `BackendTrafficPolicy` with `limit.fromMetadata` + `globalLLMRequestCosts` delivers per-tenant token-based rate limiting. This resolves the Phase 2 open question about TPM enforcement.
- **vLLM per-request metrics exist.** `--enable-per-request-metrics` returns token counts and timing in the response body — the billing attribution primitive for per-tenant chargeback.
- **MIG is operational.** Phase 3 PT sub-GPU tiers are technically feasible today in the DEV environment; extending to PROD requires testing.
- **DCGM is deployed.** Metering infrastructure is available; Phase 1 PT dashboards can be built on existing observability.
- **Physical isolation is possible.** Taints + affinity in OpenShift can create dedicated PT node pools without new tooling.

---

## 5. What We Do Not Know Yet

These are the gaps that must close before design begins:

| Unknown | Why It Blocks Design | How to Close |
|---|---|---|
| Measured throughput (TPM) on H100 NVL per model | Cannot set PT pricing without it | Engineering benchmark (2 weeks) |
| ~~H100 NVL interconnect spec (NVLink bridge vs NVSwitch)~~ | ~~Affects tensor parallelism efficiency~~ | **RESOLVED:** H100 NVL is a defined NVIDIA product — PCIe + NVLink bridge at 600 GB/s pairwise (confirmed from product specs) |
| InfiniBand or RoCE RDMA fabric availability | Required for Phase 4 llm-d PT across nodes. Without RDMA, expect 200–500× TTFT degradation per NVIDIA benchmarks. | Infrastructure team network review |
| Actual GPU cost per card per year | Cannot confirm pricing corridor without it | Finance input |
| Customer willingness to commit and at what price | Cannot confirm the market exists | User research (9 interviews) |
| MIG reconfiguration behaviour in our OpenShift environment | Determines Phase 3 PT tier change operational process | Engineering test |

---

## 6. The One-Page Argument

**We own a GPU fleet: H100 NVL (94 GB), H200 NVL (141 GB), H100 SXM (80 GB), A100 80GB — running KServe (CNCF incubating) + vLLM on air-gapped OpenShift. The platform stack is decided.**

**The product is Provisioned Throughput.** Customers reserve guaranteed tokens-per-minute for a specific model at a committed price. The platform backs that reservation with dedicated GPU nodes, isolated from shared serving traffic. The customer gets deterministic TTFT and throughput up to their reserved limit. They pay whether they use it or not — because the commitment is what funds the reservation.

**Our infrastructure confirms we have the hardware and the stack.** A100 MIG is proven. DCGM is deployed. KServe + vLLM is in production. The technical foundation is real.

**What we still need to confirm:**
1. Throughput benchmarks on H100 NVL — so we can price correctly
2. Customer research — so we know who buys it and at what commitment level
3. Finance cost actuals — so we know the pricing floor

**The ask for discovery:** Two weeks of Engineering benchmark and feasibility work. Three weeks of user interviews. Finance providing actual GPU cost data. Then a 60-minute Go/No-Go review with leadership.

**If Go:** Phase 1 PT design targets the H100 NVL pool. One customer pilot, one model, 30 days. From that pilot we build the product.
