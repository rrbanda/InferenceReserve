# Opportunity Brief: Provisioned Throughput on On-Prem GPU Infrastructure

**Status:** Discovery
**Date:** 2026-09-03
**Owner:** PM — Inference Platform
**Reviewers:** Engineering Lead, FinOps, GTM

---

## 1. What Is Provisioned Throughput

Provisioned Throughput (PT) is a capacity reservation product for LLM inference. A customer commits to a fixed tokens-per-minute (TPM) capacity for a specific model over a defined term. In return, the platform guarantees:

- That capacity is always available up to the committed TPM — no throttling, no queuing against other tenants
- TTFT (time to first token) remains within the agreed SLA at any load up to the reserved limit
- Pricing is flat against the committed capacity — whether they use it or not — and is lower per token than on-demand at comparable utilisation levels

This is the product Google Vertex AI ships as Generative AI Units (GAUs), Azure OpenAI ships as Provisioned Throughput Units (PTUs), and AWS Bedrock ships as Model Units (MUs). The market pattern is validated. We are building it on our own on-prem GPU fleet rather than renting cloud capacity to back it.

---

## 2. Problem Statement

Production LLM workloads have two unresolvable failure modes on shared on-demand inference:

**Failure Mode 1 — Unpredictable latency under shared load**
On-demand inference endpoints are best-effort. When cluster utilisation is high, requests queue. TTFT spikes from 400ms to 4s or more. There is no way to buy out of this: a team cannot purchase priority on a shared endpoint. The only escape is running a private dedicated GPU deployment — which is exactly what teams end up doing, at enormous cost and operational overhead.

**Failure Mode 2 — Unpredictable cost for predictable workloads**
On-demand per-token pricing is correct for bursty or experimental workloads. For production applications with predictable traffic — nightly pipelines, customer-facing chatbots with SLA commitments, RAG retrieval serving — on-demand is the wrong pricing model. Teams cannot budget, FinOps teams cannot forecast, and procurement blocks rollouts.

Both failure modes have the same driver: **shared infrastructure with no reservation mechanism.** PT is the reservation mechanism.

---

## 3. Why On-Prem Specifically

Building PT on owned on-prem GPU infrastructure rather than renting cloud GPU capacity to back it changes the cost structure and the product opportunity:

**Cost advantage at scale:** At sustained high utilisation, owned GPU infrastructure has a significantly lower cost per token than cloud-rented GPUs. If we can back PT reservations with on-prem GPUs and achieve ≥70% pool utilisation, we can price PT more competitively than cloud PT while earning better margins.

**Data sovereignty:** Enterprise customers in regulated industries (financial services, healthcare, government) cannot send inference traffic to external cloud APIs. An on-prem PT product is the only option for these segments — cloud PT does not exist for them.

**Latency control:** On-prem inference eliminates cloud API network latency. P99 TTFT on on-prem infrastructure is lower and more deterministic than any external API.

**Fleet leverage:** We already operate a GPU fleet (H100 NVL, H200 NVL, H100 HBM3, A100 80GB). PT is the product that monetises or allocates that fleet's capacity as a service, rather than leaving it ad-hoc.

---

## 4. The On-Prem GPU Fleet — What We're Working With

The fleet that will back PT reservations consists of modern GPU cards across production, staging, and development environments. Key hardware characteristics:

| GPU Type | Memory | Architecture | Primary PT Use |
|---|---|---|---|
| H100 NVL | 80 GB HBM3 | Hopper, PCIe + NVLink bridge | Primary PT tier for 7B–70B models |
| H200 NVL | 141 GB HBM3e | Hopper, PCIe + NVLink bridge | Long-context models; large context PT |
| H100 HBM3 | 80 GB HBM3 | Hopper | High-throughput PT serving |
| A100 80GB | 80 GB HBM2e | Ampere, MIG-capable | Sub-GPU MIG PT tiers; medium model PT |

The technology stack running on this fleet (confirmed by platform analysis): **KServe + vLLM + Triton on Red Hat OpenShift (air-gapped)**. Phase 4 path for 70B+ and MoE models: **llm-d** (CNCF March 2026, disaggregated prefill/decode). MIG operational and confirmed in the A100 environment.

This is the infrastructure PT will be built on. Every design decision — pool sizing, isolation model, GPU cost basis, throughput benchmarks — must be grounded in this fleet's actual characteristics.

---

## 5. Hypothesis

If we offer customers the ability to reserve a fixed TPM capacity for a specific model on our on-prem GPU fleet, backed by a throughput SLA and priced at a committed rate below on-demand, they will:

- Migrate predictable production inference traffic from on-demand (or from their own private GPU clusters) to PT
- Commit to monthly or annual terms, creating predictable recurring revenue for the platform
- Stop building and operating private GPU clusters for guaranteed capacity — because PT serves that need at lower total cost and operational overhead than self-managed

We believe this is achievable because:
- Vertex PT, Azure PTU, and AWS Bedrock PT have validated customer demand for exactly this product pattern
- Our on-prem cost structure, at adequate pool utilisation, beats cloud PT pricing
- Our GPU fleet (H100 NVL, H200 NVL, A100 80GB with MIG) has the hardware range to serve PT across model sizes from embedding models to 70B+ parameter LLMs
- The platform stack (KServe + vLLM) has the primitives to enforce pool isolation, per-tenant routing, and metered utilisation

---

## 6. Key Discovery Questions

| # | Question | Why It Matters |
|---|---|---|
| Q1 | What is the right PT unit of sale — TPM, GPU-fraction, or concurrent request slots? | Determines what customers buy and how we price it |
| Q2 | What PT pool utilisation rate do we need to achieve to be profitable at a competitive price? | Sets the economic floor for PT pricing and pool sizing |
| Q3 | How do we enforce PT isolation on the KServe + vLLM stack — at the pool level (separate replica sets) or at the request level (shared replicas + Gateway API enforcement)? | Core implementation design question |
| Q4 | What happens when a customer exceeds their PT reservation — hard reject (429), queue, or spill to on-demand at on-demand rates? | SLA and customer trust design question |
| Q5 | What minimum PT reservation size (in TPM and in $ terms) is commercially viable? | Determines addressable market and pool sizing economics |
| Q6 | How does llm-d's disaggregated prefill/decode architecture change the PT reservation model for 70B+ models? | Phase 4 PT design; may require a two-dimensional reservation unit |
| Q7 | What does PT for MIG-sliced sub-GPU reservations look like — who buys it, at what size, for which models? | Phase 3 PT; embedding model and small LLM tier |
| Q8 | Who is the PT buyer — engineering teams, FinOps/procurement, or platform leadership — and what does their decision process look like? | GTM and sales motion design |

---

## 7. What This Is Not

- This is not a fleet utilisation or idle reduction project. PT is a product with a price, an SLA, and a customer.
- This is not an internal resource allocation policy. PT may serve internal teams (via chargeback), external tenants, or both — but the product contract is the same in either case: customer commits to TPM, platform delivers the SLA.
- This brief is not a PRD. Discovery answers Q1–Q8. Design begins only after discovery is complete.

---

## 8. Success Criteria for Discovery

- [ ] Q1–Q8 above have documented, evidence-backed answers
- [ ] A FinOps model with 3 scenarios (pessimistic/base/optimistic) is reviewed by Finance
- [ ] At least 6 customer or stakeholder interviews completed (mix of potential PT buyers and churned/unsatisfied on-demand users)
- [ ] Engineering feasibility memo exists on pool isolation and Gateway API TPM enforcement
- [ ] A Go/No-Go recommendation is written and reviewed by platform leadership

---

## 9. Related Artifacts

| File | Purpose |
|---|---|
| `01-market-competitive-analysis.md` | Vertex PT, Azure PTU, AWS Bedrock PT — what they do and what to borrow |
| `02-technical-context.md` | KServe, vLLM, llm-d, MIG, Kueue, DCGM — the implementation stack |
| `03-finops-analysis.md` | GPU cost basis; PT unit economics; pricing floor; customer break-even |
| `04-user-research-plan.md` | Who to talk to; what to ask; how to identify PT buyers |
| `05-assumptions-risks-log.md` | Living log of beliefs and risks |
| `06-discovery-definition-of-done.md` | Gate criteria before design begins |
| `07-onprem-gpu-delta.md` | How on-prem PT differs structurally from cloud PT |
| `08-synthesis-fleet-to-pt.md` | One-page connecting platform infrastructure context to PT product decisions |
