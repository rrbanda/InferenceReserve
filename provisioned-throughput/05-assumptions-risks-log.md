# Assumptions & Risks Log: Provisioned Throughput Discovery

**Status:** Living Document
**Date:** 2026-09-03
**Owner:** PM — Inference Platform

> Add an entry every time the team acts on an unverified belief. Update status as evidence arrives. Never delete entries — mark them Confirmed, Refuted, or Superseded.

**Status codes:**
- `Open` — unverified; we are acting on this belief
- `Confirmed` — evidence exists; belief is validated
- `Refuted` — belief was wrong; update the plan
- `Superseded` — no longer relevant; note why

---

## Section 1: Product and Market Assumptions

| ID | Assumption | Confidence | Status | Evidence / Notes |
|---|---|---|---|---|
| PM-01 | Enterprise customers running production LLM workloads experience material TTFT SLA violations from shared inference (no reserved capacity) | High | Open | No primary research yet; based on community forums, Azure PTU customer writeups, sales anecdotes |
| PM-02 | Customers who need guaranteed throughput currently resolve this by building private GPU clusters — not by accepting shared serving variability | Medium | Open | Logical; needs user research confirmation (Segment B interviews) |
| PM-03 | Data sovereignty requirements make cloud PT unavailable for a meaningful segment of enterprise LLM users (financial services, healthcare, government) | High | Open | Regulatory frameworks are public; actual prevalence of this buyer as our addressable market needs GTM validation |
| PM-04 | The throughput abstraction (TPM unit) is more appropriate than a hardware abstraction (GPU count or replica count) for the PT unit of sale | High | Open | Vertex PT (GSU) and Azure PTU both use throughput abstraction; empirically validated in market; needs confirmation with our buyers |
| PM-05 | Customers will commit to a minimum 1-month PT term; shorter terms are not economically viable for us | Medium | Open | Azure PTU is 1-month minimum; needs willingness-to-commit validation in interviews |
| PM-06 | The PT buyer in enterprise is a joint decision between engineering (who knows the throughput requirement) and FinOps/procurement (who approves the budget commitment) | Medium | Open | Common pattern in enterprise SaaS; needs validation with our specific buyer interviews |
| PM-07 | Spillover to shared pool (rather than hard reject) is the preferred behaviour when customers burst above their PT reservation | Medium | Open | Azure PTU validates this preference; needs direct confirmation in user research (interview question C5) |
| PM-08 | On-prem PT can be priced to be competitive with cloud on-demand at customer utilisation rates above ~33% | Medium | Open | Based on illustrative FinOps model; requires real GPU cost basis from Finance and real throughput from Engineering benchmarks |
| PM-09 | Output tokens should cost more than input tokens in the PT billing model (burndown rate concept) | High | Open | Vertex PT charges output at 5x input. Decode (output generation) is memory-bandwidth-bound and consumes more GPU resources per token than prefill (input processing). Our default: output = 4x input. Must validate with benchmarks. |
| PM-10 | Cached input tokens (prefix cache hits) should be billed at a reduced rate under PT | High | Open | Vertex PT charges cached tokens at 0.1x input rate. vLLM prefix caching skips prefill compute for cached tokens, so the GPU cost is genuinely lower. Our default: cached = 0.25x input. Must validate with benchmark data on prefix cache compute savings. |
| PM-11 | 99.5% availability SLA (matching Vertex PT) is the correct target, not 99.9% | Medium | Open | Vertex offers 99.5%. On-prem adds hardware failure risk (no silent failover like cloud). N+1 spare architecture can mitigate, but 99.9% requires validation that node failover completes within the error budget (43.8 min/month for 99.9% vs 3.65 hr/month for 99.5%). |
| PM-12 | Per-request override header (dedicated vs shared) is a required UX feature for PT customers | Medium | Open | Vertex provides `X-Vertex-AI-LLM-Request-Type` header. Developers need ability to bypass PT for testing without consuming committed budget. Must validate in user research. |
| PM-13 | Vertex PT's 1-week commitment term is commercially viable for our on-prem PT | Low | **Refuted** | 1-week terms are not economically viable on-prem. The GPU exists at full CapEx cost before and after the 1-week term. Node taint/untaint churn (pre-term setup, post-term teardown, idle period between tenants) makes short terms a net cost. Cloud providers can offer 1-week terms because they instantly reallocate idle GPUs. We cannot. **Minimum commitment is 1 month**, matching Azure PTU's minimum and our CapEx planning cycle. |

---

## Section 2: Technical Assumptions

| ID | Assumption | Confidence | Status | Evidence / Notes |
|---|---|---|---|---|
| TA-01 | KServe + vLLM on OpenShift is the correct and committed platform stack for PT implementation | High | **Confirmed** | Platform analysis evaluated 8 technologies; KServe + vLLM on OpenShift confirmed as primary stack |
| TA-02 | MIG is operationally viable in our A100 environment for sub-GPU PT tiers | High | **Confirmed** | A100 80GB MIG confirmed active in DEV with 3g.40gb, 2g.20gb, 1g.10gb profiles; small model workloads achieve high SM utilisation on 2g.20gb slices |
| TA-03 | Physical node isolation (dedicated PT nodes via taints/affinity) prevents cross-tenant interference in KV cache memory pressure and NVLink bandwidth | High | Open | Architecturally sound; must be stress-tested: run PT and shared pool at maximum load on adjacent nodes and measure TTFT interference |
| TA-04 | llm-d is the correct serving path for 70B+ and MoE models; it integrates with KServe's Gateway API | High | **Confirmed** | Platform analysis Phase 4; llm-d CNCF-donated March 2026; Gateway API Inference Extension integration documented |
| TA-05 | DCGM is deployed and producing reliable per-GPU metrics across all environments | High | **Confirmed** | DCGM is deployed and operational across all environments; per-GPU metrics available via Prometheus |
| TA-06 | H100 NVL nodes are PCIe form factor with NVLink bridge — NOT DGX/SXM with NVSwitch | High | **Confirmed** | "NVL" is a defined NVIDIA product: dual-GPU PCIe card with NVLink bridge at 600 GB/s pairwise. H100 NVL has 94 GB HBM3 per GPU (188 GB per card). This is distinct from H100 SXM (80 GB HBM3, NVSwitch 900 GB/s). |
| TA-07 | InfiniBand connectivity is available between H100 NVL nodes for multi-node llm-d PT | Low | Open | Completely unknown; infrastructure team must check rack networking. If Ethernet-only, multi-node llm-d PT is not viable. |
| TA-08 | MIG profile changes (e.g., a customer upgrades from Small to Medium PT tier) can be done without a full node drain in our OpenShift + NVIDIA GPU Operator environment | Low | Open | Documented as a capability; highly environment-specific; must be tested in our specific stack |
| TA-09 | Separate KServe InferenceService per PT tenant provides naturally isolated vLLM Prometheus metrics, eliminating the need for a custom per-tenant attribution layer in Phase 1 | High | Open | Architecturally sound but must be confirmed: deploy two InferenceServices in separate namespaces and verify Prometheus scrape produces distinct metric streams with no cross-contamination |
| TA-10 | vLLM's `--max-num-seqs` parameter is the correct mechanism to bound PT concurrent request capacity and enforce the committed TTFT SLA | Medium | Open | Logical from vLLM architecture; needs benchmarking to establish the relationship between `max-num-seqs` and measured P95 TTFT at various load levels |
| TA-11 | Cold-start time for 70B models from NVMe storage on H100 NVL is short enough that warm replicas provide a material TTFT advantage (vs. fast-cold-start shared serving) | Medium | Open | Critical for PT value proposition; if cold start is <5 seconds, warm replicas may be unnecessary for many workloads — which would change the product economics significantly |
| TA-12 | KServe controller and Gateway API Inference Extension perform acceptably at 50+ InferencePool/LLMInferenceService density in air-gapped OpenShift | Medium | Open | Each PT tenant creates: 1 namespace, 1 LLMInferenceService, 1 InferencePool, 1 EPP deployment, 1 HTTPRoute, 1 ResourceQuota, NetworkPolicies, 1 Grafana dashboard. At 30+ tenants with multiple models, this is 100+ objects of each type. Controller queue saturation, etcd object count, and API server load must be validated before committing to the per-tenant namespace model. |

---

## Section 3: Financial Assumptions

| ID | Assumption | Confidence | Status | Evidence / Notes |
|---|---|---|---|---|
| FA-01 | On-prem H100 NVL fully-loaded cost is ~$12,000–15,000 per GPU per year (depreciation + power + space + ops) | Medium | Open | Illustrative; Finance must provide actuals from procurement records and facilities contracts |
| FA-02 | PT pool utilisation of 70% is achievable with the right customer mix (predictable production traffic, committed terms) | Medium | Open | Azure PTU guidance publishes ~65% as break-even; on-prem requires slightly higher (~70%) due to no idle savings. Actual achievable utilisation depends on customer traffic patterns confirmed in user research. |
| FA-03 | Throughput on H100 NVL for LLaMA-3 70B is ~2,500 tokens/sec at 70% GPU utilisation | Low | Open | Order-of-magnitude estimate; Engineering must benchmark on actual hardware with our actual vLLM configuration |
| FA-04 | The pricing corridor exists: we can price PT below customer alternatives (cloud on-demand, self-managed cluster) while remaining above our cost floor with target margin | Medium | Open | Illustrative model suggests this is true at 70%+ utilisation; requires real cost and throughput data |
| FA-05 | Annual PT commitments are the right vehicle to link internal team demand signals to GPU hardware procurement decisions | High | Open | Logical: 12-month PT chargeback commitment backlog justifies CapEx. Finance must confirm that procurement cycle aligns with this mechanism. |
| FA-06 | Output token burndown rate of 4x input is the correct multiplier for our cost structure | Medium | Open | Vertex uses 5x for Gemini Flash. The exact multiplier depends on the ratio of decode compute cost to prefill compute cost on our GPU hardware. Must be derived from vLLM benchmarks measuring per-phase resource consumption. Starting at 4x; adjust after benchmarks. |
| FA-07 | Cached input token burndown rate of 0.25x is commercially viable while still reflecting real cost savings | Medium | Open | Vertex uses 0.1x. vLLM prefix caching skips prefill compute for cached tokens, but memory for the KV cache is still allocated. Our 0.25x is more conservative than Vertex's 0.1x. May need to be more aggressive (lower multiplier) to compete with cloud PT for cache-heavy RAG workloads. |
| FA-08 | SLA credits at 10% per breach (max 30% per month) are the correct commercial terms | Medium | Open | Vertex offers financial credits (percentage not publicly documented). Industry standard for infrastructure SLAs is 10-25% credit per breach with 30-100% monthly cap. Must align with legal and Finance on credit terms that are competitive but not ruinous. |

---

## Section 4: Risks

### High Impact / High Likelihood

| ID | Risk | Impact | Mitigation |
|---|---|---|---|
| R-01 | Measured throughput on H100 NVL is materially lower than estimated, raising the PT cost floor above competitive pricing | PT pricing cannot beat cloud alternatives; product is not viable at this GPU cost | Run benchmarks before discovery gate closes. Do not proceed to design without real throughput numbers. |
| R-02 | User research reveals customers' TTFT requirements are loose enough that shared serving already meets them — guaranteed throughput is not worth paying for | Market is smaller than expected; PT is a niche product, not a broad platform feature | This outcome is a valid go/no-go input. Validate TTFT requirements rigorously in interviews; do not rely on "everyone needs low latency" as a given. |
| R-03 | PT pool utilisation is chronically below 60% because internal teams over-commit (reserve more TPM than they use) or traffic is more bursty than expected | Chargeback does not recover costs; PT is a net cost to the platform | Mandate utilisation monitoring and offer right-sizing guidance at renewal. Design spillover correctly so teams don't over-reserve "just in case." |
| R-03a | KServe `LLMInferenceService` v0.17 fails to deploy or auto-provision correctly in air-gapped OpenShift — the single-point-of-failure for the entire Phase 1 architecture | Phase 1 architecture is blocked; must fall back to hand-rolled InferenceService + manual EPP/InferencePool/HTTPRoute YAML, significantly increasing build complexity | Validate TF-6 in the first week of the engineering spike. If it fails, immediately design the fallback architecture using bare InferenceService. Do not proceed with Phase 1 design until resolved. |

### High Impact / Medium Likelihood

| ID | Risk | Impact | Mitigation |
|---|---|---|---|
| R-04 | H100 NVL nodes are Ethernet-only (no InfiniBand) — multi-node llm-d PT for 70B+ models is not viable without hardware upgrade | Phase 4 PT (large model guaranteed throughput) cannot be delivered; positioning gap vs Vertex PT for large models | Confirm network fabric immediately. If no IB, scope Phase 1 PT to models that fit on a single node. Plan IB procurement if demand signals justify it. |
| R-05 | MIG dynamic reconfiguration requires node drain + reboot in OpenShift — PT tier changes become operationally disruptive and require maintenance windows | Customer churn if they cannot resize PT without service interruption | Test immediately in our environment. If drain is required, design PT tier change SLA accordingly (24-hour advance notice, scheduled window). Set this expectation in contracts before launch. |
| R-06 | Gateway API Inference Extension does not support the custom TPM rate-limiting filter we need for Phase 2 PT | Phase 2 (shared replicas with per-tenant TPM enforcement) is blocked; must remain on per-tenant InferenceService model (higher GPU overhead) | Phase 1 (separate InferenceService) does not need this; it's a Phase 2 problem. Engineering must evaluate upstream contribution vs. forking. Do not block Phase 1 on this. |
| R-07 | NVIDIA Run:ai at competitive licence pricing covers PT Phases 3–5 capabilities faster than native build | Engineering investment in native PT is suboptimal; Run:ai delivers the same product | Get Run:ai pricing and capability map before Phase 3 design begins. Run a build-vs-buy analysis. |

### Medium Impact / High Likelihood

| ID | Risk | Impact | Mitigation |
|---|---|---|---|
| R-08 | PT minimum reservation size (set by our economics) is too large for SMB customers but correct for enterprise | PT is effectively enterprise-only in Phase 1 | Acceptable if the enterprise segment generates sufficient volume. MIG PT tiers in Phase 3 will open smaller reservation sizes. |
| R-09 | Customer commitment terms we need (6–12 months) are longer than what procurement processes can approve in their standard cycle | Sales cycles are long; revenue ramps slowly | Offer 1-month entry terms with incentive to extend. Sales-led contracts for enterprise. Self-serve for smaller monthly commitments. |
| R-10 | Flat TPM billing (no burndown rates) causes PT to be uncompetitive for cache-heavy RAG/agent workloads vs Vertex PT | Vertex charges cached tokens at 0.1x; customers doing RAG with heavy system prompt reuse get 10x effective throughput on Vertex but not on our PT | Implement burndown rate billing in Phase 2 at latest. Phase 1 can launch with flat TPM but must communicate the roadmap for differential pricing. |
| R-11 | SLA availability target of 99.5% is perceived as low by enterprise customers accustomed to 99.9%+ infrastructure SLAs | Customer pushback during sales; PT may be seen as less reliable than self-managed GPU cluster | Validate in user research (Segment A/B). Consider tiered SLA: 99.5% standard, 99.9% premium (with N+2 spares and higher price). On-prem hardware failure risk is real — do not over-promise. |

---

## Section 5: Explicit Non-Assumptions

These are beliefs that are tempting but wrong. We are explicitly NOT acting on them:

- **NOT assuming** that every customer with high inference spend is a PT candidate. High spend on bursty, unpredictable workloads is worse for PT than moderate, steady spend.
- **NOT assuming** that GPU utilisation improvement is the product's value proposition. PT's value proposition is guaranteed throughput and predictable cost. Fleet efficiency is a benefit to us, not the reason customers buy.
- **NOT assuming** that PT requires feature parity with Vertex PT or Azure PTU on Day 1. Phase 1 MVP must be scoped to the minimum that a customer would actually commit to.
- **NOT assuming** that the technical implementation is straightforward because KServe and vLLM are established. The enforcement layer (per-tenant TPM rate limiting, physical isolation, metering) is new build. Complexity is real.

---

## Assumption Review Schedule

| Milestone | Assumptions to Review |
|---|---|
| After Engineering benchmarks | FA-03, FA-06, FA-07; update all FinOps model scenarios; derive burndown rate multipliers from measured prefill vs decode cost |
| After Finance provides GPU cost actuals | FA-01; update cost floor and pricing corridor |
| After user research synthesis (Week 4) | PM-01 through PM-13; validate or refute each; specifically validate PM-09 (burndown rates), PM-11 (SLA target), PM-12 (per-request override header) |
| After Engineering feasibility memo | TA-03, TA-06, TA-07, TA-08, TA-09, TA-10, TA-11 |
| After Run:ai pricing received | R-07 |
| After Vertex PT comparison review | PM-09, PM-10, PM-11, PM-12, PM-13, FA-06, FA-07, FA-08, R-10, R-11 |
| Before discovery gate | All Open items — close, accept with documented risk, or escalate as blockers |
