# Market & Competitive Analysis: Provisioned Throughput

**Status:** Discovery
**Date:** 2026-09-03
**Owner:** PM — Inference Platform

> Primary purpose: understand how the market has solved PT — what the product looks like, what abstractions work, what customers expect — so our on-prem implementation is grounded in validated product patterns rather than invented from scratch.

---

## 1. Why LLM Inference Needs a Reservation Product

LLM inference is structurally different from stateless API compute in ways that make shared on-demand insufficient for production:

**KV cache statefulness.** Each active request holds a GPU KV-cache slot for its entire duration — seconds to minutes. This is not a stateless request that returns its resources immediately. Under high concurrency, the KV cache fills, new requests queue, and TTFT climbs.

**Throughput and latency are coupled.** At low batch sizes: low latency, low GPU utilisation. At high batch sizes: high throughput, high per-request TTFT. A shared endpoint optimises for throughput across all tenants; a production application needs TTFT optimised for its own traffic.

**Bursts are correlated.** Enterprise LLM traffic often bursts simultaneously (batch pipelines trigger at the same time; user-facing apps spike on the same event). On shared infrastructure, simultaneous bursts from multiple tenants saturate the same GPU pool. PT removes a tenant's traffic from shared contention entirely.

**Consequence:** Teams that need guaranteed TTFT and throughput SLAs have only two options today: accept on-demand variability, or build and operate their own private GPU deployment. PT is the third option — reserved capacity without the operational overhead of private infrastructure.

---

## 2. Google Vertex AI — Provisioned Throughput (Primary Reference)

Vertex PT is the most directly comparable product. Understanding it precisely is the first requirement for designing our own.

### 2.1 Product Model

| Dimension | Detail |
|---|---|
| **Unit of sale** | Generative AI Units (GAUs) — each GAU = a defined TPM allocation specific to the model |
| **GAU → TPM** | Model-specific; varies by model family and size. Must be verified from current Vertex pricing docs. |
| **Commitment terms** | 1-month minimum; longer terms negotiated for enterprise |
| **Pricing structure** | Flat hourly rate per GAU committed; customer pays for reserved capacity whether used or not |
| **Discount vs on-demand** | ~30–40% lower effective per-token cost vs on-demand at comparable throughput volumes (verify from current pricing page) |
| **Burst behaviour** | Requests above PT quota: behaviour is model-specific; likely queued or returned 429 (verify with test account) |
| **Pool isolation** | Dedicated serving pool per PT purchase; physically or logically isolated from shared on-demand serving |
| **SLA** | Higher uptime SLA than shared serving endpoint; specific latency SLA not published (verify) |
| **API surface** | Dedicated endpoint URL for PT; same model API, different routing |
| **Model coverage** | Gemini family; fine-tuned model PT has limitations (verify current state) |
| **Observability** | Cloud Monitoring dashboards showing GAU utilisation vs. committed |
| **Self-serve** | Yes, via Cloud Console and API |

### 2.2 The GAU Abstraction — Why It Matters

Google deliberately hides hardware from the PT buyer. A customer purchases GAUs, not H100s or TPU pods. The platform translates GAU count into GPU/TPU allocation. This is the correct product abstraction because:

- Customers cannot predict how many GPUs they need; they can predict their peak requests-per-minute and average token counts
- Hardware changes over time (A100 → H100 → Blackwell); the GAU abstraction insulates customers from hardware lifecycle
- Customers think in workload terms, not in silicon terms

**We must do the same.** Our PT unit must be a throughput abstraction, not a GPU count.

### 2.3 Open Questions on Vertex PT to Close in Research

| # | Question | How to Research |
|---|---|---|
| VQ1 | Exact GAU → TPM conversion table per model (Gemini 1.5 Pro, Flash, 2.x) | Vertex pricing page + test account |
| VQ2 | Hard reject vs. queue vs. on-demand spillover above PT quota | Stress test against a test account |
| VQ3 | Is PT isolation physical (separate hardware) or logical (scheduling priority)? | Load test PT and on-demand simultaneously; measure interference |
| VQ4 | Minimum GAU purchase per model | Pricing page + sales contact |
| VQ5 | PT SLA commitment — is TTFT guaranteed or only availability? | Vertex SLA documentation |
| VQ6 | Monitoring: what does the GAU utilisation dashboard show, exactly? | Console screenshot |

---

## 3. Azure OpenAI — Provisioned Throughput Units (PTU)

Azure PTU is the most mature and customer-documented PT product in the market. Customer writeups, community benchmarks, and public documentation make it the richest reference.

### 3.1 Product Model

| Dimension | Detail |
|---|---|
| **Unit of sale** | PTUs (Provisioned Throughput Units) — each PTU = a defined input + output TPM capacity, model-specific |
| **PTU → TPM example** | GPT-4o: 1 PTU ≈ 2,500 input TPM + 833 output TPM (verify at current pricing page — these ratios change) |
| **Commitment terms** | Monthly or Annual; annual gets ~17% discount vs monthly |
| **Pricing structure** | Flat hourly rate per PTU committed |
| **Break-even guidance** | Microsoft explicitly publishes: buy enough PTUs to reach 60–65% utilisation to break even vs pay-as-you-go |
| **Burst / spillover** | Requests over PTU capacity spill to on-demand quota at pay-as-you-go rates — not hard rejected |
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

Azure PTU does not hard-reject requests above the PTU limit. Overflow spills to on-demand quota at pay-as-you-go rates. The customer:
- Pays their PTU commitment (flat, regardless of usage)
- Pays on-demand rates for any tokens above the PTU capacity

This design removes the operational danger of a hard capacity cliff. A team whose traffic bursts 20% above their PT reservation doesn't experience 429s — they see a higher bill.

**Design question for us:** Do we hard-reject above PT quota, spill to on-demand, or queue? This is one of the most important product decisions. Hard rejection is simpler to implement but operationally risky for customers. Spillover is better UX but requires a separate on-demand quota pool and more complex billing. Queuing is the worst of both — adds latency and doesn't resolve the capacity problem.

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
| **Unit of sale** | Model Units (MUs) — one MU = one copy of the model, hardware-anchored |
| **Commitment terms** | No commitment (hourly), 1-month, 6-month |
| **Pricing** | Per-hour rate per MU; shorter commitment = higher hourly rate |
| **Burst behaviour** | Above MU capacity: requests rejected (no spillover documented) |
| **Isolation** | One MU = one model replica exclusively for the purchasing account |

### 4.2 Why "Model Unit" Is the Wrong Abstraction

A Model Unit is hardware-anchored: one copy of the model running on some GPU. Customers must reason about how many copies of the model they need, which requires them to understand parallelism, concurrency, and GPU sizing — concepts they should not need to know.

This is a design mistake. Customers think in throughput (requests per minute, tokens per minute), not in model copies. The "how many replicas do I need" question is exactly the question the PT product should answer for them, not push back to the customer.

**Design principle for our PT:** Never expose GPU count or replica count to the customer. The unit of sale is throughput. The platform translates throughput to infrastructure.

---

## 5. Comparative Summary

| Dimension | Vertex PT | Azure PTU | AWS Bedrock PT | Our On-Prem PT (Target) |
|---|---|---|---|---|
| Unit abstraction | GAUs (throughput) | PTUs (throughput) | Model Units (hardware) | TPM or equivalent throughput unit |
| Burst / overflow | Unclear — verify | Spillover to on-demand | Hard reject | Design decision: spillover recommended |
| Min commitment | 1 month | 1 month | Hourly | TBD |
| Discount vs on-demand | ~30–40% | Break-even at ~65% utilisation | ~40% at 6-month | TBD from FinOps model |
| Sizing tool | GAU calculator | PTU calculator | None | Must build one |
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
| Dedicated pool isolation | PT and on-demand must not share capacity; any mixing degrades the PT SLA |
| Flat committed rate (pay whether you use it or not) | This is the contract that makes PT work; customers accept it for the guarantee |
| Spillover to on-demand (not hard reject) | Azure PTU demonstrates this is the right customer UX; hard 429s at capacity cliff are operationally painful |
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
| NVIDIA AI Enterprise + Runcai | Full GPU orchestration stack; Runcai for cross-tenant quota | Build vs buy for the scheduling layer; NVIDIA Runcai is a vendor dependency |
| Customer's self-managed cluster | Homegrown KServe/vLLM setup | PT removes ops overhead of managing dedicated GPU infra |

The strongest on-prem PT competitor is the customer's own team building and running a private GPU cluster for guaranteed capacity. This is the "build vs buy" comparison that the GTM motion must address.
