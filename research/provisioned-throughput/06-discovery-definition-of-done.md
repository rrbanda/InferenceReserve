# Discovery Definition of Done: Provisioned Throughput

**Status:** Discovery
**Date:** 2026-09-03
**Owner:** PM — Inference Platform

> Discovery is complete when we can walk into a leadership review and answer: "Should we build PT, and are we confident enough in that answer to spend engineering resources on design?" Not when we run out of time.

---

## Gate 1: Market and Problem Validation

| # | Criterion | Status | Evidence |
|---|---|---|---|
| MV-1 | At least 4 of 9 user research participants independently confirmed that TTFT unpredictability under shared on-demand causes real business impact (user-facing degradation, SLA violations, ops incidents) | Open | |
| MV-2 | At least 2 participants are currently running self-managed GPU clusters specifically to get guaranteed inference capacity — validating that customers will invest significantly to solve this problem | Open | |
| MV-3 | At least 1 Segment D participant (regulated industry) confirmed that on-prem is required for their use case and cloud PT is not an option | Open | |
| MV-4 | The PT buyer persona is documented: who the economic buyer is, who the technical influencer is, and what the decision-making process looks like | Open | |
| MV-5 | At least 3 participants provided a credible willingness-to-commit signal (specific TPM range and commitment term they would consider) | Open | |

**Gate 1 threshold:** MV-1, MV-4, and MV-5 must be CLOSED. MV-2 and MV-3 can be ACCEPTED if we have at least 1 signal from each.

---

## Gate 2: Competitive and Pricing Clarity

| # | Criterion | Status | Evidence |
|---|---|---|---|
| CP-1 | Vertex PT pricing ($/GAU) and GAU → TPM conversion for at least 2 models is documented from primary source | Open | Vertex pricing page + test account |
| CP-2 | Azure PTU pricing ($/PTU) and PTU → TPM conversion for at least 2 models is documented | Open | Azure pricing page |
| CP-3 | Our on-prem PT pricing corridor is calculated: lower bound (cost floor + target margin) and upper bound (customer alternative cost) are defined with real numbers | Open | Requires FA-01 (Finance actuals) and FA-03 (Engineering benchmarks) |
| CP-4 | The pricing corridor is positive — there is a price range where PT is competitive for customers AND profitable for us | Open | Derived from CP-3 |

**Gate 2 threshold:** All 4 must be CLOSED. If CP-4 is negative (no viable price corridor), this is a hard No-Go — do not proceed to design.

---

## Gate 3: Technical Feasibility

| # | Criterion | Status | Evidence |
|---|---|---|---|
| TF-1 | Engineering feasibility memo exists addressing all 6 questions from `02-technical-context.md` (benchmarks, isolation, MIG reconfiguration, Gateway API, cold-start, InfiniBand) | Open | Engineering spike (2 weeks) |
| TF-2 | H100 NVL throughput benchmarks (tokens/sec at 70% GPU utilisation) exist for at least 2 models — one large (70B class) and one medium (7B–13B class) | Open | vLLM benchmark run on actual hardware |
| TF-3 | Physical node isolation (taints + affinity) is confirmed to work in our OpenShift environment without RBAC or SCC conflicts | Open | Engineering test |
| TF-4 | H100 NVL / H200 NVL form factor (SXM vs PCIe) and network fabric (InfiniBand vs Ethernet) is confirmed by infrastructure team | Open | Hardware spec review |
| TF-5 | Separate InferenceService per PT tenant confirmed to produce isolated vLLM Prometheus metrics without cross-tenant contamination | Open | Engineering test |

**Gate 3 threshold:** TF-1 and TF-2 must be CLOSED — no design without benchmarks and a feasibility memo. TF-3 and TF-5 must be CLOSED. TF-4 can be ACCEPTED with documented implications for Phase 4 scope.

---

## Gate 4: Unit Economics

| # | Criterion | Status | Evidence |
|---|---|---|---|
| UE-1 | Finance has provided actual GPU depreciation schedule and per-GPU annual cost for H100 NVL, H200 NVL, and A100 80GB | Open | Finance input |
| UE-2 | FinOps model Scenario B (base case, 70% utilisation) shows a positive margin at a price that is competitive with customer alternatives | Open | Requires UE-1 + TF-2 |
| UE-3 | Minimum commercially viable PT reservation size (in TPM and in $/month) is defined and acceptable to target customers | Open | UE-2 + user research signal on WTP |
| UE-4 | Finance has defined the target gross margin for infrastructure products — this is the margin target the PT pricing floor must achieve | Open | Finance policy input |

**Gate 4 threshold:** All 4 must be CLOSED. Negative unit economics in Scenario B is a hard No-Go.

---

## Gate 5: Go / No-Go

| # | Criterion | Status |
|---|---|---|
| GNG-1 | A written Go/No-Go recommendation exists with an explicit recommendation citing evidence from all four prior gates | Open |
| GNG-2 | If GO: a proposed Phase 1 MVP scope is documented (what is included, what is deferred) | Open |
| GNG-3 | If GO: Engineering has provided a rough effort estimate for Phase 1 (separate InferenceService per tenant + physical isolation + PT dashboards) | Open |
| GNG-4 | If GO: a build-vs-buy comparison for Runcai (Phase 3–4 features) is documented and a recommendation exists | Open |
| GNG-5 | Platform leadership has reviewed and signed off on the recommendation | Open |

---

## Hard No-Go Triggers

Do not proceed to design if any of the following are true:

| No-Go Trigger | Rationale |
|---|---|
| CP-4 fails — no viable price corridor exists at our cost structure | Fundamental economics do not support PT. Revisit when GPU costs decrease or throughput improves. |
| MV-1 fails — fewer than 4 of 9 participants confirm material TTFT pain | Market is not large enough or not ready enough to justify building PT now. |
| UE-2 fails — base case unit economics are negative | Cannot build a profitable PT product at competitive prices with current fleet and cost structure. |
| TF-2 fails — measured throughput is materially below estimates causing CP-4 to fail | Throughput benchmark is the foundation of the pricing model. If benchmarks don't support the economics, the product does not work. |
| TF-3 fails and Engineering cannot find an alternative isolation mechanism | PT SLA cannot be delivered without isolation. A PT product that cannot guarantee its SLA is not a PT product. |

---

## Discovery Gate Review Agenda (60 minutes)

```
0:00–0:05   What we set out to learn and the structure of this review
0:05–0:15   User research findings — PT buyer profile; pain severity; willingness to commit
0:15–0:20   Competitive analysis — Vertex PT and Azure PTU pricing; our positioning
0:20–0:30   FinOps model — cost basis; pricing corridor; three scenarios
0:30–0:40   Engineering feasibility — benchmarks; isolation architecture; feasibility memo summary
0:40–0:50   PM recommendation — Go/No-Go with rationale; Phase 1 MVP scope if Go
0:50–0:60   Leadership discussion and decision
```

**Output:** Written decision record saved as `09-go-nogo-recommendation.md`.

---

## After a Go Decision — What Phase 1 Design Produces

Phase 1 Design is not implementation. It produces:

1. **PT product specification** — exact unit of sale (TPM definition), tier structure, commitment terms, overflow behaviour, SLA commitments
2. **KServe implementation spec** — InferenceService template for PT; namespace isolation model; ResourceQuota per tenant; node taint/affinity configuration
3. **PT metering spec** — what vLLM + DCGM metrics feed the utilisation dashboard; what the tenant-facing dashboard shows
4. **Chargeback/billing model** — how TPM consumption is aggregated and reported; how committed vs. consumed is reconciled
5. **Sizing calculator spec** — inputs (RPM, avg input tokens, avg output tokens) → output (recommended PT tier and TPM reservation)
6. **Phase 1 pilot plan** — one customer/tenant, one model, PROD environment, 30-day measurement period with success criteria
7. **Engineering roadmap** — Phase 1 implementation milestones and resource requirements

Phase 1 Design has its own review before any engineering begins.
