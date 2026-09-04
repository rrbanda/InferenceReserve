# Provisioned Throughput — Discovery Research

**Phase:** Discovery (pre-design, pre-implementation)
**Date:** 2026-09-03
**Status:** v3 — Correct product framing; grounded in fleet hardware and stack context

---

## The Product

**Provisioned Throughput (PT)** is a capacity reservation product for LLM inference. A customer commits to a fixed tokens-per-minute (TPM) capacity for a specific model over a defined term. The platform guarantees that capacity — always warm, isolated from shared serving traffic, with a TTFT SLA — at a committed rate.

This is the same product pattern as Google Vertex AI PT (GSUs) and Azure OpenAI PTU. We are building it on our own on-prem GPU fleet (H100 NVL, H200 NVL, H100 SXM, A100 80GB) running KServe + vLLM + Triton on air-gapped Red Hat OpenShift.

---

## Fleet Context

| GPU Type | Memory | Environments | PT Use |
|---|---|---|---|
| H100 NVL | 94 GB HBM3 (per GPU; dual-GPU card = 188 GB) | PROD, DEV | Primary PT tier — 7B–70B |
| H200 NVL | 141 GB HBM3e | PROD, UAT, DEV | Premium PT — long-context, large model |
| H100 SXM | 80 GB HBM3 | UAT, DEV | PT serving — high throughput efficiency |
| A100 80GB (MIG) | 80 GB HBM2e | PROD, UAT, DEV | Sub-GPU MIG PT tiers (confirmed operational) |

**Platform stack (decided):** KServe (CNCF incubating) + vLLM + Triton on OpenShift · llm-d (CNCF Sandbox, March 2026) for 70B+ (Phase 4) · DCGM + Prometheus + Grafana for observability

---

## Read in This Order

| # | File | What It Covers |
|---|---|---|
| 1 | `08-synthesis-fleet-to-pt.md` | Platform infrastructure context mapped to PT design decisions; the one-page argument |
| 2 | `00-opportunity-brief.md` | Product definition, hypothesis, 8 key discovery questions |
| 3 | `01-market-competitive-analysis.md` | Vertex PT, Azure PTU, AWS Bedrock PT — product patterns to adopt |
| 4 | `02-technical-context.md` | KServe, vLLM, llm-d, MIG, Kueue, DCGM — implementation stack |
| 5 | `03-finops-analysis.md` | On-prem cost basis; PT unit economics; pricing corridor; 3 scenarios |
| 6 | `04-user-research-plan.md` | Who to interview; what to ask; PT buyer profile |
| 7 | `05-assumptions-risks-log.md` | Open assumptions; confirmed facts; risk register |
| 8 | `06-discovery-definition-of-done.md` | Gate criteria; hard No-Go triggers; discovery review agenda |
| 9 | `07-onprem-gpu-delta.md` | How on-prem PT differs from cloud PT structurally |
| 10 | `09-leadership-brief.md` | **Start here for leadership.** 20-minute discussion brief — problem, market context, three scope options, what we need to decide |
| 11 | `10-architecture.md` | PT architecture — upstream components vs build gap; 6-layer design |
| 11 | `11-pt-crd-spec.md` | ProvisionedThroughput CRD specification and operator reconciliation logic |
| 12 | `12-vertex-pt-comparison.md` | Dimension-by-dimension comparison vs Google Vertex AI PT; gap analysis and competitive positioning |
| 13 | `13-executive-brief.md` | **3-page brief for engineering leadership.** Product features, consumer/producer experience, architecture diagram and component map. |
| 14 | `14-experience-design.md` | Consumer and producer journey design — step-by-step UX for both personas with implementation detail |

---

## PT Phase Map

| Phase | What the Customer Gets | Key Open Question |
|---|---|---|
| 1 | Full-GPU PT on H100 NVL / H200 NVL; dedicated node pool; TTFT SLA | Throughput benchmarks needed to price |
| 2 | Request-level TPM enforcement; spillover to shared pool; fine-grained metering | Gateway API (GA March 2026) TPM filter feasibility |
| 3 | MIG sub-GPU tiers (Micro 1g.10gb, Small 2g.20gb, Medium 3g.40gb) | MIG reconfig without node drain in OpenShift |
| 4 | llm-d PT for 70B+ models; disaggregated prefill/decode | InfiniBand fabric presence; NVSwitch vs NVLink-bridge spec |

---

## Top 5 Open Questions Before Design Begins

1. **What is measured H100 NVL throughput (TPM) for LLaMA-3 70B and a mid-size model at 70% GPU utilisation?** — Pricing floor depends on this. (Engineering benchmark)
2. **Does the pricing corridor exist — can we price below customer alternatives while above our cost floor?** — Requires Finance cost actuals + Engineering benchmark. (FinOps model)
3. **Who is the PT buyer, at what commitment level, and for which models?** — Market validation. (User research — 9 interviews)
4. **Are H100 NVL nodes NVLink-bridge or NVSwitch? Do we have InfiniBand between nodes?** — Determines Phase 4 llm-d PT feasibility. (Infrastructure team)
5. **Can MIG profiles be reconfigured without node drain in our OpenShift environment?** — Determines Phase 3 PT tier change SLA. (Engineering test)

---

## Immediate Next Steps

- [ ] Engineering: 2-week feasibility spike — throughput benchmarks on H100 NVL; Phase 1 isolation architecture test; hardware spec confirmation
- [ ] Finance: GPU cost actuals (depreciation schedule + power + rack) per card type
- [ ] PM: User research recruitment — 9 interviews across 4 segments (production LLM users, private cluster operators, churned customers, regulated industry)
- [ ] Sales: Run:ai pricing request from NVIDIA (for Phase 3–4 build-vs-buy comparison)
- [ ] PM: Vertex PT and Azure PTU pricing verification from current pricing pages

---

## Discovery Gate Review

**Target:** Week 6 from kickoff
**Format:** 60-minute leadership review per agenda in `06-discovery-definition-of-done.md`
**Decision:** Go to Phase 1 Design / No-Go / Extend Discovery

**Next artifact to create:** `09-go-nogo-recommendation.md` (after all gate criteria are closed)
