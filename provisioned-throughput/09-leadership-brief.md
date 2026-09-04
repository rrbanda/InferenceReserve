# Provisioned Throughput: Leadership Discussion Brief

**Date:** 2026-09-03
**From:** PM — Inference Platform
**For:** Platform Leadership
**Format:** 20-minute discussion, not a presentation

---

## The Problem We Keep Hearing

Teams running production LLM inference on our platform hit two problems that shared serving cannot solve:

**Latency spikes under shared load.** When multiple teams are active on the same GPU pool, TTFT climbs from 400ms to 4+ seconds. There is no way to buy priority — a team with a customer-facing chatbot gets the same queue position as a batch summarisation job. Teams that need reliable latency end up requesting dedicated GPU nodes, which fragments the fleet and drops utilisation.

**No capacity guarantee for predictable workloads.** Teams running nightly pipelines or production chatbots with steady traffic have no way to reserve throughput. They cannot commit to downstream SLAs because the platform cannot guarantee upstream capacity. FinOps cannot forecast GPU costs per team because shared serving has no per-team accounting.

Both problems have the same root cause: shared infrastructure with no reservation mechanism.

---

## What the Market Built to Solve This

Google, Microsoft, and AWS each ship a capacity reservation product for LLM inference:

| Provider | Product | Unit | How It Works |
|---|---|---|---|
| Google Vertex AI | Provisioned Throughput | GSU (Generative AI Scale Unit) | Customer reserves throughput per model. Fixed monthly cost. Overflow spills to pay-as-you-go. 99.5% availability SLA. |
| Microsoft Azure | Provisioned Throughput Units | PTU | Same pattern. Customer reserves capacity. Fixed hourly rate. Optional spillover. |
| AWS Bedrock | Provisioned Throughput | Model Unit | Dedicated model capacity. Hourly billing. Mostly for custom/fine-tuned models. |

The product pattern is validated and converging: customer commits to a throughput level for a model, pays a flat rate whether they use it or not, gets an SLA in return. Overages spill to the shared pool at shared serving rates.

---

## What We Have to Build It

We already operate the infrastructure these cloud products are built on — except we own it:

- **GPU fleet:** H100 NVL (94 GB), H200 NVL (141 GB), H100 SXM (80 GB), A100 80GB with MIG — across PROD, UAT, DEV
- **Serving stack:** KServe + vLLM on air-gapped OpenShift — in production today
- **Routing:** Gateway API Inference Extension (GA) with llm-d intelligent routing — available upstream, validated by Red Hat OpenShift AI 3.4
- **Observability:** DCGM + Prometheus + Grafana — deployed

The upstream open-source stack (KServe `LLMInferenceService`, llm-d, Envoy AI Gateway) provides roughly 70% of the architecture. What does not exist upstream is the product layer: the reservation lifecycle, the tenant provisioning, the SLA enforcement, the billing, and the sizing tools.

---

## The Question for This Discussion

We see three possible scopes. They build on each other — Option A is a subset of B, which is a subset of C.

**Option A — Internal Capacity Reservation**

Solve the immediate problem: teams can request guaranteed GPU capacity for a model, carved out from the shared fleet. Platform team allocates dedicated nodes, enforces isolation, monitors TTFT. Chargeback through existing FinOps tooling. No formal SLA contract. No billing pipeline. No external pricing.

- Effort: 4-6 weeks engineering
- Uses: `LLMInferenceService` with fixed replicas + node taints + ResourceQuota
- Outcome: teams stop fighting for GPU capacity; fleet utilisation improves

**Option B — Internal PT Product**

Everything in A, plus a formal product contract: committed TPM with TTFT SLA, per-tenant dashboards, spillover to shared pool, a sizing calculator, and an operator that automates the provisioning lifecycle. Tenants commit to monthly or annual terms. Platform team manages capacity planning.

- Effort: 3-4 months for Phase 1 (full-GPU PT on H100 NVL/H200 NVL)
- Requires: Engineering benchmark spike (2 weeks), Finance GPU cost actuals, user research (3 weeks)
- Outcome: predictable capacity allocation with SLA accountability; demand signals for GPU procurement

**Option C — Full PT Product (Internal + External)**

Everything in B, plus competitive pricing with burndown rates (input/output/cached token differentiation), SLA credits, commercial contract terms, and a billing pipeline that can serve external customers or regulated-industry tenants.

- Effort: 6-9 months through Phase 2
- Requires: Legal, Finance, GTM involvement beyond engineering
- Outcome: GPU fleet costs are recovered through justified chargeback to consuming business units; competitive with self-managed GPU infrastructure for internal teams with air-gapped and data-sovereignty requirements

---

## What We Need From This Conversation

1. **Scope is Option B: enterprise-grade internal PT product with chargeback.** Full SLA, dashboards, sizing calculator, chargeback billing to internal business units. Not commercial pricing for external customers (that would be Option C, a future scope extension).

2. **The customer is internal business units.** Teams within the org that need guaranteed LLM inference throughput. Segment D (regulated industry teams with compliance requirements) are internal teams with stricter data sovereignty needs — not external customers.

3. **What is the timeline expectation?** Are we solving a problem teams have today (Option A, weeks), or building an enterprise-grade platform product for capacity planning and SLA-backed chargeback (Option B, months)?

---

## If the Answer Is B or C

We have a discovery package ready to execute. It answers eight questions before any design begins:

1. What throughput can our H100 NVL hardware actually deliver? (Engineering benchmark — 2 weeks)
2. Does a pricing corridor exist between our cost floor and what customers would otherwise pay? (Finance actuals + benchmarks)
3. Who is the PT buyer, at what commitment level, and for which models? (9 user interviews — 3 weeks)
4. Can KServe `LLMInferenceService` + llm-d deploy correctly in our air-gapped OpenShift? (Engineering spike)
5. What SLA terms are customers willing to accept? (User research)
6. Can MIG profiles be changed without node drain? (Engineering test — Phase 3 input)
7. Do we have InfiniBand for multi-node llm-d? (Infrastructure team — Phase 4 input)
8. What does NVIDIA Run:ai cost vs. building the scheduling layer ourselves? (Sales inquiry)

Discovery target: 6 weeks to a Go/No-Go recommendation with evidence.

---

## What We Are Not Asking For Today

- We are not asking for engineering resources yet. Discovery is PM + one Engineering spike.
- We are not asking for a budget commitment. Discovery determines whether the product is viable before any build decision.
- We are not proposing a timeline for delivery. That comes after discovery, if Go.

We are asking for alignment on scope so we run the right discovery.
