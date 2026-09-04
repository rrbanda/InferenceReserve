# Review: Our PT Architecture vs. Google Vertex AI Provisioned Throughput

**Status:** Discovery
**Date:** 2026-09-03
**Owner:** PM — Inference Platform

> Dimension-by-dimension comparison of our on-prem PT product design against Google Vertex AI's Provisioned Throughput, the primary market reference. Identifies gaps to close, design decisions that intentionally diverge from cloud PT, and areas where our on-prem approach is stronger.

---

## What Vertex PT Is (as of September 2026)

Vertex PT is a fixed-cost, fixed-term subscription that reserves throughput for generative AI models on Google Cloud. Confirmed from Google's official documentation:

| Dimension | Detail |
|---|---|
| **Unit** | GSU (Generative AI Scale Unit) — abstract throughput unit. Each GSU delivers model-specific tokens/sec (e.g., Gemini 3.6 Flash = 675 tokens/sec per GSU). |
| **Burndown rates** | Input/output tokens consume GSU capacity at different rates. Output = 5x input (Gemini Flash). Cached = 0.1x input. This is the core pricing mechanic. |
| **Terms** | 1-week, 1-month, 3-month, 1-year. Non-cancellable. Can increase GSUs mid-term, cannot decrease. |
| **Overage** | Default: pay-as-you-go spillover. Customer can force dedicated-only (429 on overflow) via `X-Vertex-AI-LLM-Request-Type: dedicated` header. |
| **Activation** | No code change required. Once active, traffic to that model/region/project automatically uses PT. Header override is optional. |
| **SLA** | 99.5% availability. Within-PT-quota errors that would be 429 are converted to 5XX and count against the SLA. Latency target attainment (99%) with financial credits. |
| **Monitoring** | Cloud Monitoring metrics: `dedicated_gsu_limit`, `consumed_token_throughput`, `dedicated_token_limit`. Prebuilt dashboard. Metrics split by `request_type` (dedicated / spillover / shared). |
| **Sizing** | Console-based GSU calculator. Inputs: token counts per request, RPM. Output: required GSUs + monthly cost. |
| **Activation time** | Minutes to weeks depending on order size and capacity. |
| **Scheduling** | Can schedule change orders up to 2 weeks in advance for proactive capacity planning. |
| **Caching** | Cached tokens burn at 0.1x rate under PT, multiplying effective throughput by up to 10x for cache-heavy workloads. |
| **Consumption tiers** | PT (dedicated, SLA-backed) > Priority PayGo (1.8x standard rate) > Standard PayGo (default). Customer can layer all three. |
| **Model portability** | GSU commitments can be reassigned to different models within the same family. |
| **Pricing** | ~$2,700/GSU/month (1-month) to ~$2,000/GSU/month (1-year). 26% discount for annual vs monthly. |

---

## 1. Unit of Sale

| Dimension | Vertex PT | Our PT | Verdict |
|---|---|---|---|
| Unit name | GSU (Generative AI Scale Unit) | TPM (tokens per minute) | Gap |
| Unit granularity | Per-second throughput | Per-minute throughput | Minor — TPM is acceptable for on-prem |
| Input/output weighting | Burndown rates: output = 5x input; cached = 0.1x | TPM treats all tokens equally | **Gap: no differential token costing** |
| Model-specific sizing | Each model has different tokens/sec per GSU | CRD has a flat `committedTPM` field | **Gap: no model-specific throughput profiles in CRD** |

**Finding:** Our flat TPM is simpler than Vertex's GSU with burndown rates. This is acceptable for Phase 1 (one model per reservation), but becomes a problem when output tokens are 3-5x more expensive to generate than input tokens (decode is memory-bound), context caching reduces the cost of cached input tokens, and customers serve multiple modalities.

**Action:** Add burndown rate concept to the PT pricing model. At minimum, differentiate input vs output token costs in the billing pipeline. Consider whether our CRD should express commitment in an abstract unit rather than raw TPM.

**Where to implement:** Update `committedTPM` in `11-pt-crd-spec.md` to optionally support weighted token accounting. Update billing pipeline in `10-architecture.md` to track input and output tokens separately.

---

## 2. Overage and Spillover

| Dimension | Vertex PT | Our PT | Verdict |
|---|---|---|---|
| Default behaviour | Overage billed as pay-as-you-go automatically | `overflow: spillover-to-shared` (CRD field) | Aligned |
| Per-request control | `X-Vertex-AI-LLM-Request-Type` header: `dedicated` or `shared` | Not in our design | **Gap: no per-request override** |
| Spillover billing | Spillover tagged with `request_type: spillover` in metrics | Planned via gateway metadata | Aligned conceptually |
| Priority fallback | PT > Priority PayGo (1.8x) > Standard PayGo — three tiers | PT > Shared serving — two tiers | **Gap: no premium shared tier** |

**Finding:** Vertex's per-request header control is a critical UX feature we are missing. A developer testing against production can bypass PT and use the shared pool without consuming the team's PT budget. Our ext_authz + header routing infrastructure can support this — it needs to be designed into the PT Auth Service.

**Action:** Add `X-PT-Request-Type` header support to PT Auth Service design. Map `dedicated` to PT pool routing and `shared` to shared pool bypass. Evaluate whether a three-tier model adds value for on-prem.

**Where to implement:** PT Auth Service design in `10-architecture.md` Layer 1. HTTPRoute rules need a `shared` bypass path.

---

## 3. Purchase and Lifecycle

| Dimension | Vertex PT | Our PT | Verdict |
|---|---|---|---|
| Purchase flow | Console UI: model, region, GSUs, term | `kubectl apply` ProvisionedThroughput CR | Different by design — on-prem is operator-managed |
| Activation time | Minutes to weeks | Operator reconciliation (minutes) + node assignment | Comparable |
| Mid-term changes | Can increase GSUs, cannot decrease | CRD update triggers operator reconciliation | **Gap: no increase-only constraint** |
| Term enforcement | Non-cancellable. Billing continues regardless. | CRD has `term.start` and `term.end` but no cancellation policy | **Gap: no cancellation policy** |
| Auto-renewal | Option at purchase time | `term.autoRenew` field in CRD | Aligned |
| Proactive scheduling | Schedule change orders 2 weeks in advance | Not addressed | **Gap: no advance scheduling** |
| Model reassignment | Can change model within family mid-term | CRD is model-specific; change = new reservation | **Gap: no model swap** |

**Finding:** Our CRD needs validation webhooks that enforce commercial constraints: commitments are non-cancellable, TPM can only increase mid-term (not decrease), term cannot be shortened. These are business rules that must be enforced at the API level.

**Action:** Add admission webhook validation to the Reservation Manager. Add proactive scheduling to Phase 2 roadmap.

**Where to implement:** Admission webhook spec in `11-pt-crd-spec.md`. Scheduling mechanism as a new CRD field (`spec.scheduledChanges`).

---

## 4. SLA Structure

| Dimension | Vertex PT | Our PT | Verdict |
|---|---|---|---|
| Availability SLA | 99.5% uptime | `sla.availabilityTarget: 99.9%` | We promise more — validate achievable on-prem |
| Latency SLA | 99% latency target attainment with financial credits | `sla.maxTTFT_P95_ms: 500` | Aligned but different metric |
| SLA credits | Financial credits (% of monthly bill) applied to future use | Not addressed | **Gap: no SLA credit mechanism** |
| SLA exclusions | Planned maintenance, customer-caused overages | Not addressed | **Gap: no exclusion definitions** |
| 429 vs 5XX treatment | Within-PT 429s become 5XX (count toward SLA). Over-PT 429s are spillover (do not count). | Health Monitor tracks TTFT breaches | **Gap: no within-PT vs over-PT distinction** |

**Finding:** Vertex's SLA mechanic is precise: within committed capacity, what would normally be a 429 becomes a 5XX that counts against the SLA (Google is accountable). Over committed capacity, 429s are spillover and do not count (customer chose to exceed). Our architecture needs this same distinction — the PT Auth Service and billing pipeline must tag requests as "within commitment" vs "overflow" for SLA accounting.

**Action:** Design the SLA credit mechanism. Define planned maintenance exclusions. Add within-PT vs over-PT distinction to monitoring and billing. Consider lowering our default availability target from 99.9% to 99.5% to match market expectations — or validate that on-prem N+1 spare architecture can support 99.9%.

**Where to implement:** SLA credit fields in `11-pt-crd-spec.md`. SLA exclusion definitions in the PT contract terms (new document). Within-PT tagging in the PT Health Monitor design in `10-architecture.md`.

---

## 5. Sizing and Estimation

| Dimension | Vertex PT | Our PT | Verdict |
|---|---|---|---|
| Sizing tool | Console GSU estimator | PT Sizing Calculator (API/CLI) | Aligned in concept |
| Burndown transparency | Published per model | Not published — depends on benchmarks | **Gap: no published throughput profiles** |
| Right-sizing guidance | Provision for 60-80% baseline, spillover handles peaks | 70% utilisation target | Aligned |

**Finding:** Sizing calculator concept matches Vertex's. The gap is the burndown rate tables, which come from benchmarks. Correctly identified as discovery gate criterion TF-2. No additional action needed beyond executing the benchmark spike.

---

## 6. Monitoring and Observability

| Dimension | Vertex PT | Our PT | Verdict |
|---|---|---|---|
| Prebuilt dashboard | Model Garden Monitoring dashboard | PT Utilisation Dashboard (Grafana) per tenant | Aligned |
| Key metrics | `dedicated_gsu_limit`, `consumed_token_throughput` | Committed TPM vs consumed, TTFT P95, KV cache, GPU utilisation | **Our design is richer** |
| Request type tagging | `request_type: dedicated / spillover / shared` | Planned via gateway access log metadata | Aligned — implement the tagging |
| Alerting | Cloud Monitoring alerts (customer-configured) | PT Health Monitor / SLA Watchdog (auto-configured per tenant) | **Our design is richer** |

**Finding:** Our monitoring design is stronger than Vertex's because we expose infrastructure-level metrics (DCGM GPU utilisation, KV cache occupancy, NVLink bandwidth) that cloud PT deliberately hides. This is a competitive advantage — platform teams running on-prem want visibility into the hardware backing their reservation.

**Action:** Ensure the dashboard design prominently features GPU and KV cache metrics alongside the token-level metrics. This is a differentiator, not just operational tooling.

---

## 7. Context Caching Integration

| Dimension | Vertex PT | Our PT | Verdict |
|---|---|---|---|
| Implicit caching | Enabled by default. Cached tokens burn at 0.1x. | vLLM prefix caching on by default. EPP does cache-aware routing. | **Gap: no reduced billing rate for cached tokens** |
| Explicit caching | Customer controls cache lifetime. Storage fees. | Not addressed | **Gap: no explicit caching product layer** |
| Billing impact | 10x effective throughput for cached workloads | Not reflected in pricing model | **Gap: cache-heavy workloads would overpay** |

**Finding:** This is the most significant economic gap. Vertex's 0.1x burndown rate for cached tokens means a RAG pipeline with heavy system prompt reuse gets 10x more effective throughput per GSU. Our PT product charges the same TPM whether tokens are cached or not. Since vLLM prefix caching is on by default and the EPP routes to cache-warm pods, the infrastructure benefit exists — but we are not passing it through to the customer economically.

**Action:** Design a "cached token discount" for the PT billing model. Use vLLM's per-request metrics (which can report prefix cache hit status) to identify cached vs non-cached tokens. Apply a reduced burndown rate (e.g., 0.1-0.25x) for cached input tokens. This is a Phase 2 billing enhancement — Phase 1 can launch with flat TPM and add caching discounts after the billing pipeline is operational.

**Where to implement:** Billing pipeline design in `10-architecture.md` Layer 6. Burndown rate table in the model throughput profiles.

---

## 8. Features Vertex Has That We Do Not Address

Each gap is classified by whether it is a genuine on-prem structural constraint or a product design decision we have not yet made.

| Feature | Vertex Implementation | Our Gap | Constraint Type | How to Close | Phase |
|---|---|---|---|---|---|
| Multi-model PT management | Single console for Gemini, Claude, Llama, DeepSeek | CRD is model-specific; no consolidated view | **Product design choice** — no technical barrier | Build a Grafana dashboard that queries all `ProvisionedThroughput` CRs across models for a tenant. Pure dashboard work. | Phase 2 |
| Model swap within commitment | Reassign GSUs to new model version mid-term | CRD binds to specific model; change = new reservation | **Harder on-prem, but feasible** — swapping models requires loading new weights (minutes of downtime per replica for 70B). Cloud abstracts this away. | Reservation Manager orchestrates rolling swap: spin up new LLMInferenceService with new model, wait until warm, cut over traffic via HTTPRoute, tear down old. Add `spec.modelSwap` field to CRD. | Phase 3 |
| Priority serving tier | 1.8x standard rate, priority queue between PT and standard shared | Two tiers only (PT and shared) | **Product design choice** — `InferenceObjective` already supports priority levels. No technical barrier. | Define three `InferenceObjective` resources: PT (priority=1), premium shared (priority=2), standard shared (priority=3). Pricing decision, not engineering. | Phase 2 |
| 1-week commitment terms | Available for select models for short spikes | CRD has no minimum term constraint (implicitly supported) | **On-prem friction** — 1-week terms mean tainting/untainting nodes every week. Node assignment churn and GPU idle time between tenants is real operational overhead. Short terms are economically riskier because we cannot release idle hardware. | Evaluate whether the operational overhead of weekly node cycling is justified. May require a "shared PT pool" model (multiple short-term tenants on same PT nodes) rather than dedicated nodes per tenant. | Phase 2 |
| Proactive capacity scheduling | Schedule change orders 2 weeks ahead | CRD supports future `term.start` but no scheduled increase mechanism | **Product design choice** — no technical barrier. The Reservation Manager could process a `spec.scheduledChanges` array at the specified time. | Add `spec.scheduledChanges` field to CRD: array of `{date, newCommittedTPM}` entries. Reservation Manager applies changes at the scheduled time. | Phase 2 |
| No code change for activation | Auto-activates for project/model/region | Requires `x-tenant-id` header on every request | **On-prem structural friction** — Vertex controls routing per GCP project. On-prem, multiple tenants share a cluster, so some tenant identification is unavoidable. | Reduce friction: resolve tenant identity from source namespace or client certificate (Istio mTLS) rather than requiring a header. If a request originates from `pt-tenant-a` namespace, auto-route to that tenant's PT pool without any header. Requires the PT Auth Service to check source IP/namespace. | Phase 2 |

---

## 9. Areas Where Our Design Is Stronger Than Vertex

| Advantage | Detail | Why It Matters |
|---|---|---|
| Infrastructure transparency | GPU utilisation, KV cache metrics, NVLink bandwidth exposed to customer | Platform teams want to see hardware health, not just token counts |
| Physical isolation guarantee | Dedicated PT nodes with taints + affinity. Hardware-level separation. | Vertex's isolation is opaque — may be scheduling priority, not physical separation |
| TTFT SLA commitment | Specific P95 TTFT bound (e.g., 500ms) | Vertex has a latency target attainment objective but does not publish per-model TTFT guarantees |
| Intelligent routing visibility | llm-d EPP with prefix-cache and KV-cache-aware routing is visible and configurable | Vertex's routing is a black box; customers cannot tune or inspect it |
| Data sovereignty | Air-gapped OpenShift. Data never leaves the datacenter. | Vertex PT requires cloud API calls. Regulated industries cannot use cloud PT. |
| Custom model support | Any model on any GPU in the fleet | Vertex PT is limited to supported models (Gemini, Claude, select open-source) |
| Infrastructure-as-code lifecycle | Kubernetes-native CRD + operator. GitOps compatible. | Vertex PT is console/API-driven with no declarative lifecycle model |
| Hardware-level sub-GPU isolation | MIG on A100 for Phase 3 — hardware partitions, not software isolation | Vertex does not expose GPU partitioning to customers |

---

## 10. Summary: Gaps to Address

| Gap | Severity | Constraint Type | Phase | Action |
|---|---|---|---|---|
| No burndown rates (input/output token cost differentiation) | **High** | Product design choice | Phase 1 design | Add input/output token weighting to billing model; output = 4x input default |
| No cached token discount in billing | **High** | Product design choice | Phase 2 | Reduced burndown rate for prefix-cache-hit tokens; cached = 0.25x input default |
| No per-request PT override header | **Medium** | Product design choice | Phase 1 | `X-PT-Request-Type` header in PT Auth Service (`dedicated` / `shared`) |
| No SLA credit mechanism | **Medium** | Product design choice | Phase 1 | Define credit terms: 10% per breach, 30% monthly cap, 30-day claim window |
| No SLA exclusion definitions | **Medium** | Product design choice | Phase 1 | Define planned-maintenance, customer-caused-overages, force-majeure exclusions |
| No within-PT vs over-PT SLA distinction | **Medium** | Product design choice | Phase 1 | Tag requests as within-commitment vs spillover in gateway for SLA accounting |
| No increase-only validation webhook | **Low** | Product design choice | Phase 1 | CRD admission webhook: TPM can increase, not decrease mid-term |
| No-code activation (header required) | **Medium** | On-prem structural friction | Phase 2 | Resolve tenant from namespace or mTLS identity instead of requiring header |
| No proactive capacity scheduling | **Low** | Product design choice | Phase 2 | `spec.scheduledChanges` CRD field with date + newCommittedTPM |
| No consolidated multi-model dashboard | **Low** | Product design choice | Phase 2 | Grafana dashboard querying all ProvisionedThroughput CRs per tenant |
| No Priority PayGo equivalent | **Low** | Product design choice | Phase 2 | Three InferenceObjective priority levels; pricing decision, not engineering |
| 1-week commitment terms | **Low** | On-prem operational friction | Phase 2 | Evaluate shared PT pool model to reduce node cycling overhead |
| No model swap within commitment | **Low** | Harder on-prem, feasible | Phase 3 | Rolling swap via Reservation Manager: new LLMInferenceService, warm, cut over, tear down |

---

## 11. Competitive Positioning Summary

Our on-prem PT product should not attempt to replicate Vertex PT feature-for-feature. The correct positioning is:

**Where we match Vertex:** Unit-of-sale abstraction (throughput, not hardware), spillover to shared pool, sizing calculator, per-tenant dashboards, commitment-based pricing with discounts for longer terms.

**Where we deliberately diverge (on-prem strengths):** Physical isolation (dedicated nodes vs opaque scheduling), infrastructure transparency (GPU metrics exposed), data sovereignty (air-gapped), custom model support, Kubernetes-native lifecycle (CRD vs console).

**Where we must close gaps for competitive parity (product design choices — no technical barrier):**
- Burndown rates (input/output/cached token differentiation) — billing pipeline change
- Per-request override header (`dedicated` / `shared`) — PT Auth Service design
- SLA credit mechanism — contract and billing terms
- Within-PT vs over-PT SLA accounting — gateway tagging
- Multi-model consolidated dashboard — Grafana dashboard work
- Priority PayGo equivalent — InferenceObjective already supports this
- Proactive capacity scheduling — CRD field + operator logic

**Where genuine on-prem friction exists (harder but addressable):**
- No-code activation — requires namespace-based or mTLS-based identity instead of headers; solvable but never fully transparent like Vertex's project-level auto-routing
- 1-week commitment terms — node taint/untaint churn makes short terms operationally expensive; may need shared PT pool model
- Model swap within commitment — requires rolling swap orchestration; minutes of transition vs Vertex's seamless redirect

**Where we have structural advantages Vertex cannot match:** Air-gap capability, hardware-level MIG isolation, TTFT SLA with specific latency bound, full infrastructure visibility, any-model support, GitOps lifecycle.
