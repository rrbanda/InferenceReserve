# Market & Competitive Analysis: Provisioned Throughput

**Status:** Discovery
**Date:** 2026-09-03
**Owner:** PM — Inference Platform

> Primary purpose: understand how the market has solved PT — what the product looks like, what abstractions work, what customers expect — so our on-prem implementation is grounded in validated product patterns rather than invented from scratch.

---

## 1. Why LLM Inference Needs a Reservation Product

LLM inference is structurally different from stateless API compute in ways that make shared serving insufficient for production:

**KV cache statefulness.** Each active request holds a GPU KV-cache slot for its entire duration — seconds to minutes. This is not a stateless request that returns its resources immediately. Under high concurrency, the KV cache fills, new requests queue, and TTFT climbs.

**Throughput and latency are coupled.** At low batch sizes: low latency, low GPU utilisation. At high batch sizes: high throughput, high per-request TTFT. A shared endpoint optimises for throughput across all tenants; a production application needs TTFT optimised for its own traffic.

**Bursts are correlated.** Enterprise LLM traffic often bursts simultaneously (batch pipelines trigger at the same time; user-facing apps spike on the same event). On shared infrastructure, simultaneous bursts from multiple tenants saturate the same GPU pool. PT removes a tenant's traffic from shared contention entirely.

**Consequence:** Teams that need guaranteed TTFT and throughput SLAs have only two options today: accept shared serving variability, or build and operate their own private GPU deployment. PT is the third option — reserved capacity without the operational overhead of private infrastructure.

---

## 2. Google Vertex AI — Provisioned Throughput (Primary Reference)

Vertex PT is the most directly comparable product. Understanding it precisely is the first requirement for designing our own.

### 2.1 Product Model

| Dimension | Detail |
|---|---|
| **Unit of sale** | Generative AI Scale Units (GSUs) — each GSU = a defined tokens-per-second allocation specific to the model (e.g., Gemini 3.6 Flash: 675 tokens/sec per GSU) |
| **GSU → throughput** | Model-specific burndown rates; varies by model family, input/output type, and caching. Must be verified from current Vertex pricing docs. |
| **Commitment terms** | 1-week, 1-month, 3-month, or 1-year terms; longer terms receive steeper discounts |
| **Pricing structure** | Flat hourly rate per GSU committed; customer pays for reserved capacity whether used or not |
| **Discount vs on-demand** | ~20–40% lower effective per-token cost vs on-demand at high utilisation; 1-year terms offer deepest discount (verify from current pricing page) |
| **Burst behaviour** | Overages above PT quota are billed as pay-as-you-go by default; controllable per-request |
| **Pool isolation** | Dedicated serving pool per PT purchase; physically or logically isolated from shared serving |
| **SLA** | Higher uptime SLA than shared serving endpoint; specific latency SLA not published (verify) |
| **API surface** | Dedicated endpoint URL for PT; same model API, different routing |
| **Model coverage** | Gemini family; fine-tuned model PT has limitations (verify current state) |
| **Observability** | Cloud Monitoring dashboards showing GSU utilisation vs. committed |
| **Self-serve** | Yes, via Cloud Console and API |

### 2.2 The GSU Abstraction — Why It Matters

Google deliberately hides hardware from the PT buyer. A customer purchases GSUs (Generative AI Scale Units), not H100s or TPU pods. The platform translates GSU count into GPU/TPU allocation using model-specific burndown rates. This is the correct product abstraction because:

- Customers cannot predict how many GPUs they need; they can predict their peak requests-per-minute and average token counts
- Hardware changes over time (A100 → H100 → Blackwell); the GSU abstraction insulates customers from hardware lifecycle
- Customers think in workload terms, not in silicon terms

**We must do the same.** Our PT unit must be a throughput abstraction, not a GPU count.

### 2.3 Open Questions on Vertex PT to Close in Research

| # | Question | Status | Resolution |
|---|---|---|---|
| VQ1 | Exact GSU burndown rates per model | **RESOLVED** | Full burndown tables documented in `15-vertex-pt-reference.md` Section 3. Examples: Gemini 3.6 Flash = 675 tok/sec/GSU, output 5x input, cached 0.1x. Gemini 2.5 Pro = 650 tok/sec/GSU, output 8x, >200K input doubles all rates. 18 Claude models, 16 open models also catalogued. |
| VQ2 | Hard reject vs. queue vs. on-demand spillover above PT quota | **RESOLVED** | Default: auto-spillover to PayGo. Customer can force dedicated-only (429 on overflow) via `X-Vertex-AI-LLM-Request-Type: dedicated` header. No queuing option exists. |
| VQ3 | Is PT isolation physical (separate hardware) or logical (scheduling priority)? | **RESOLVED** | Logical. Google documentation states: "PT reserves throughput units (GSU), not hardware exclusivity." Isolation is scheduling priority, not dedicated GPUs. |
| VQ4 | Minimum GSU purchase per model | **RESOLVED** | Most Google models: 1 GSU minimum. Claude Sonnet: 25 GSU. Claude Opus: 35 GSU. Claude Haiku: 5-10 GSU. Open models: 1 GSU. Full table in `15-vertex-pt-reference.md` Section 3. |
| VQ5 | PT SLA commitment — is TTFT guaranteed or only availability? | **RESOLVED** | Both: (1) 99.5%+ availability SLA with 429-to-5XX conversion for within-PT-quota errors, and (2) 99% latency target attainment with financial credits. No fixed P95 TTFT guarantee — Vertex uses "latency target attainment" model. p99 <400ms is the benchmark. |
| VQ6 | Monitoring: what does the GSU utilisation dashboard show? | **RESOLVED** | Cloud Monitoring on `aiplatform.googleapis.com/PublisherModel`: `dedicated_gsu_limit`, `consumed_token_throughput`, `dedicated_token_limit`, split by `request_type` (dedicated/spillover/shared). 1-minute minimum alignment. Model Garden dashboard recommended at <=6h time windows. Full detail in `15-vertex-pt-reference.md` Section 10. |

---

## 3. Azure OpenAI — Provisioned Throughput Units (PTU)

Azure PTU is the most mature and customer-documented PT product in the market. Customer writeups, community benchmarks, and public documentation make it the richest reference.

### 3.1 Product Model

| Dimension | Detail |
|---|---|
| **Unit of sale** | PTUs (Provisioned Throughput Units) — each PTU = a defined input + output TPM capacity, model-specific |
| **PTU → TPM example** | GPT-4o: 1 PTU ≈ 2,500 input TPM + 833 output TPM (verify at current pricing page — these ratios change) |
| **Commitment terms** | Hourly (no commitment), Monthly, or Annual reservation; annual gets deeper discount vs hourly |
| **Pricing structure** | Flat hourly rate per PTU committed |
| **Break-even guidance** | Microsoft explicitly publishes: buy enough PTUs to reach 60–65% utilisation to break even vs pay-as-you-go |
| **Burst / spillover** | Spillover is an **optional feature** that must be configured; when enabled, requests over PTU capacity route to a standard pay-as-you-go deployment. Without spillover enabled, excess requests receive 429 errors. Configurable globally or per-request. |
| **Deployment types** | Regional PTU (single region) or Global PTU (Microsoft routes across regions) |
| **SLA** | Higher than shared; specific TTFT SLA not published per model (verify) |
| **Self-serve** | Yes, via Azure Portal + API |
| **Sizing tool** | Azure provides a PTU sizing calculator: input RPM + avg tokens → output PTU count needed |
| **Monitoring** | Azure Monitor; PTU utilisation % is the primary metric |

### 3.2 The PTU Sizing Model — Critical Design Input

Azure's sizing calculator embeds the right thinking. The customer inputs:
- Peak requests per minute (RPM) they need to serve
- Average input tokens per request
- Average output tokens per request

The calculator outputs: number of PTUs needed.

Under the hood:
```
Required PTUs = f(RPM, avg_input_tokens, avg_output_tokens, model-specific PTU capacity)
```

We need a sizing equivalent. Customers cannot size their own PT reservation without it. Building a sizing calculator or interactive guide is a Day 1 product requirement, not a nice-to-have.

### 3.3 The Spillover Design — Key Decision for Our Product

Azure PTU offers **optional spillover** that, when enabled, routes overflow requests to a standard pay-as-you-go deployment instead of returning 429 errors. The customer:
- Pays their PTU commitment (flat, regardless of usage)
- Pays on-demand rates for any tokens above the PTU capacity

This design removes the operational danger of a hard capacity cliff. A team whose traffic bursts 20% above their PT reservation doesn't experience 429s — they see a higher bill.

**Design question for us:** Do we hard-reject above PT quota, spill to the shared pool, or queue? This is one of the most important product decisions. Hard rejection is simpler to implement but operationally risky for customers. Spillover is better UX but requires a separate shared serving pool and more complex billing. Queuing is the worst of both — adds latency and doesn't resolve the capacity problem.

**Recommendation to evaluate in design:** Spillover is correct for production workloads. Hard rejection is correct only if PT is marketed as a strict capacity reservation with no safety valve (enterprise contracts). Queue is not a valid option for real-time inference.

### 3.4 Open Questions on Azure PTU

| # | Question | How to Research |
|---|---|---|
| AQ1 | Current PTU pricing per model (GPT-4o, GPT-4o-mini) | Azure pricing calculator |
| AQ2 | Global vs Regional PTU performance difference under load | Azure docs + community benchmarks |
| AQ3 | How do customers monitor PTU utilisation in practice? What metrics do they watch? | Azure Monitor docs + customer interviews |
| AQ4 | What is the minimum PTU purchase per model? | Azure pricing page |
| AQ5 | Cancellation process and lead time for downsizing | Azure portal + community forums |

---

## 4. AWS Bedrock — Provisioned Throughput (Model Units)

AWS Bedrock PT is relevant because it shows a different — and weaker — abstraction approach, and because it covers our own models (Claude) on a third-party platform.

### 4.1 Product Model

| Dimension | Detail |
|---|---|
| **Unit of sale** | Model Units (MUs) — each MU delivers a specific throughput level (input TPM + output TPM) for a given model |
| **Commitment terms** | No commitment (hourly), 1-month, 6-month |
| **Pricing** | Per-hour rate per MU; shorter commitment = higher hourly rate. Many models require a quote from the AWS account team. |
| **Burst behaviour** | Above MU capacity: requests rejected. AWS has introduced a separate "Reserved" tier (2026) with overflow to Standard for base models. |
| **Isolation** | Dedicated model capacity for the purchasing account |

### 4.2 Why "Model Unit" Is a Weaker Abstraction

AWS defines MUs as throughput units (input TPM + output TPM per model), which is closer to the throughput abstraction than the name suggests. However, the MU abstraction is weaker than Vertex GSUs or Azure PTUs for two reasons: (1) AWS does not provide a self-serve sizing calculator, forcing customers to contact their account team for MU-to-throughput mapping, and (2) in 2026, Provisioned Throughput on Bedrock is primarily required for custom and fine-tuned models — AWS now directs standard model workloads to the newer "Reserved" tier instead.

**Design principle for our PT:** Never expose GPU count or replica count to the customer. The unit of sale is throughput. The platform translates throughput to infrastructure. Provide a sizing calculator from Day 1.

---

## 5. Comparative Summary

| Dimension | Vertex PT | Azure PTU | AWS Bedrock PT | Our On-Prem PT (Target) |
|---|---|---|---|---|
| Unit abstraction | GSUs (throughput, burndown-rate-based) | PTUs (throughput) | Model Units (throughput, per-model) | TPM or equivalent throughput unit |
| Burst / overflow | Overages billed as pay-as-you-go | Spillover optional (must be configured); 429 without it | Hard reject (Reserved tier has overflow for base models) | Design decision: spillover recommended |
| Min commitment | 1 week | Hourly (no commitment) | Hourly | TBD |
| Discount vs on-demand | ~20–40% at high utilisation | Break-even at ~60–70% utilisation | ~40% at 6-month | TBD from FinOps model |
| Sizing tool | GSU calculator (in Console) | PTU calculator | None (account team required) | Must build one |
| Self-serve | Yes | Yes | Yes | Yes (Phase 1 may be sales-assisted) |
| Fine-tuned model PT | Limited | Limited | Limited | TBD |
| Observability | Cloud Monitoring | Azure Monitor | CloudWatch | DCGM + vLLM metrics + Grafana |
| Isolation model | Physical or logical pool | Physical or logical pool | One replica per MU | Physical pool isolation (PT nodes dedicated) |

---

## 6. What On-Prem PT Uniquely Enables

Cloud PT (Vertex, Azure, AWS) all have the same structural limitation: the customer's data leaves their premises and crosses a cloud API boundary. For a significant segment of enterprise users, this is not acceptable:

| Customer Type | Cloud PT Blocker | On-Prem PT Advantage |
|---|---|---|
| Regulated financial services | Data residency requirements; inference on sensitive financial data | On-prem PT: data never leaves the datacenter |
| Healthcare (HIPAA) | PHI cannot transit external APIs without BAA; real-time inference on patient data | On-prem PT: no external API, no compliance exposure |
| Government / defense | FedRAMP, air-gap, sovereign cloud requirements | On-prem PT: air-gapped OpenShift deployment; no internet dependency |
| Enterprises with existing GPU fleet | Already paying for GPU CapEx; want to use it, not pay again for cloud | On-prem PT: monetises existing infrastructure investment |

The on-prem PT addressable market is customers for whom cloud PT is structurally unavailable, plus customers for whom on-prem TCO at scale beats cloud pricing.

---

## 7. Key Patterns to Adopt from the Market

From the three reference products, the following patterns are validated and should be adopted:

| Pattern | Why Adopt It |
|---|---|
| Throughput-based unit (not GPU count) | Customers cannot size in hardware; both Vertex and Azure validate this |
| Dedicated pool isolation | PT and shared serving must not share capacity; any mixing degrades the PT SLA |
| Flat committed rate (pay whether you use it or not) | This is the contract that makes PT work; customers accept it for the guarantee |
| Spillover to on-demand (not hard reject) | Azure PTU offers optional spillover; Vertex bills overages as pay-as-you-go. Both validate that a safety valve above PT capacity is the right customer UX. |
| Sizing calculator | Without it, customers cannot correctly size their reservation and will either over-buy (waste) or under-buy (churn) |
| Per-tenant utilisation dashboard | PT customers need to see how much of their reservation they are using; this is table stakes |
| Committed discount vs on-demand | The financial incentive for committing; Azure publishes break-even explicitly; we should too |

---

## 8. Competitive Landscape for On-Prem PT

Our competitive set is not just cloud PT products. For the on-prem segment:

| Competitor | What They Offer | Our Advantage |
|---|---|---|
| CoreWeave | Dedicated GPU cloud; reserved H100 instances per hour/month; no shared inference | We serve inference-ready endpoints with the serving stack; CoreWeave sells raw compute |
| Lambda Labs | On-demand and reserved GPU instances; competitive H100 pricing | Inference-optimised serving with PT SLA; Lambda sells raw compute |
| NVIDIA DGX Cloud | DGX hardware managed by NVIDIA on Azure/GCP/OCI | Genuine on-prem air-gap capability; DGX Cloud is still cloud |
| NVIDIA AI Enterprise + Run:ai | Full GPU orchestration stack; Run:ai for cross-tenant quota and fairshare scheduling | Build vs buy for the scheduling layer; NVIDIA Run:ai (acquired 2024) is a vendor dependency |
| Customer's self-managed cluster | Homegrown KServe/vLLM setup | PT removes ops overhead of managing dedicated GPU infra |

The strongest on-prem PT competitor is the customer's own team building and running a private GPU cluster for guaranteed capacity. This is the "build vs buy" comparison that the GTM motion must address.
