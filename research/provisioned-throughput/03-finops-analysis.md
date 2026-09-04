# FinOps Analysis: Provisioned Throughput Unit Economics

**Status:** Discovery
**Date:** 2026-09-03
**Owner:** PM — Inference Platform
**Reviewers:** Finance, Engineering (capacity)

> All GPU cost figures are illustrative. Every number in the Inputs section must be replaced with actuals from Finance and procurement before this model informs any pricing decision. Throughput figures must come from measured vLLM benchmarks on our H100 NVL hardware — not from vendor datasheets.

---

## 1. The Core Economics Question

PT is financially viable only if we can answer yes to both:

1. **Can we price PT below our customers' alternatives** (building private GPU clusters, or paying cloud on-demand rates) at a committed rate that makes them choose PT?
2. **Does PT generate sufficient revenue per GPU to cover our fully-loaded on-prem cost** (depreciation + power + space + ops) at a realistic pool utilisation level?

These two questions define the pricing corridor: the floor is our cost basis; the ceiling is what the customer would otherwise pay. If the corridor doesn't exist, PT is not a viable product at our cost structure.

---

## 2. Our Cost Structure — On-Prem CapEx Model

### 2.1 Fully-Loaded Cost Per GPU Per Year

On-prem GPUs have no variable cost structure. Depreciation, power, and space continue whether the GPU serves requests or sits idle. This is the fundamental difference from cloud economics.

| Cost Component | H100 NVL (per GPU) | H200 NVL (per GPU) | A100 80GB (per GPU) | Notes |
|---|---|---|---|---|
| **Hardware depreciation** | | | | |
| Purchase price (illustrative) | ~$30,000–35,000 | ~$35,000–45,000 | ~$15,000–20,000 | Negotiated price; verify with procurement |
| Depreciation period | 3 years | 3 years | 4 years | Finance policy; shorter = higher annual cost |
| Annual depreciation | ~$10,000–11,667 | ~$11,667–15,000 | ~$3,750–5,000 | |
| **Power** | | | | |
| GPU TDP | 700W | 700W | 400W | At full inference load; actual draw ~60–80% TDP |
| Node power (8 GPU, total system) | ~8–10 kW | ~9–11 kW | ~5–6 kW | Includes CPU, NIC, cooling fans |
| Data centre PUE | 1.3–1.5 | 1.3–1.5 | 1.3–1.5 | Verify with facilities |
| Power cost ($/kWh) | $0.07–0.12 | $0.07–0.12 | $0.07–0.12 | Data centre contract rate |
| **Annual power per GPU** | ~$900–1,600 | ~$1,000–1,800 | ~$500–900 | At full load; inference lower |
| **Data centre space** | | | | |
| Rack units per 8-GPU node | ~4U (PCIe) | ~4U (PCIe) | ~4U (PCIe) | Co-lo or owned rack |
| Annual rack cost per GPU | ~$400–700 | ~$400–700 | ~$400–700 | Varies widely by market |
| **Ops and software** | | | | |
| IT ops allocation per GPU | ~$500–800 | ~$500–800 | ~$400–600 | GPU cluster ops specialist labour |
| DCGM / software licensing | ~$100–200 | ~$100–200 | ~$100–200 | NVIDIA AI Enterprise if adopted |
| **Total fully-loaded per GPU per year** | **~$12,000–15,000** | **~$13,500–18,000** | **~$5,150–7,400** | |
| **Hourly cost per GPU** | **~$1.37–1.71** | **~$1.54–2.05** | **~$0.59–0.85** | ÷ 8,760 hours/year |

### 2.2 Cost Per 8-GPU Node Per Hour

For serving deployments, cost is typically measured per 8-GPU node (one InferenceService):

| Node Type | Annual Cost (8 GPUs + node overhead) | Hourly Cost |
|---|---|---|
| 8×H100 NVL | ~$100,000–125,000 | ~$11.40–14.27/hr |
| 8×H200 NVL | ~$112,000–150,000 | ~$12.79–17.12/hr |
| 8×A100 80GB | ~$44,000–62,000 | ~$5.02–7.08/hr |

---

## 3. Throughput to Cost Per TPM — The Pricing Floor

### 3.1 The Formula

```
Cost per 1,000 TPM-hour =

  Node hourly cost ($)
  ─────────────────────────────────────────────────────
  (Measured throughput at PT utilisation target, tok/sec) × 60 sec/min
  ────────────────────────────────────────────────────────────────────
  1,000    (to convert TPM to 1k-TPM units)
```

### 3.2 Illustrative Calculation (H100 NVL, LLaMA-3 70B)

These numbers are illustrative structure only. Replace all throughput figures with measured benchmark results.

```
Assumptions:
  Node cost: $12.50/hr (8×H100 NVL, midpoint)
  Throughput at 70% GPU utilisation: ~105,000 TPM (illustrative — must benchmark)
  [= 2,500 tok/sec output × 60 × 70% target utilisation]

Cost per 1k TPM-hour = $12.50 / (105,000 / 1,000) = $0.119 / 1k TPM-hour

This is our cost floor. PT must be priced above $0.119/1k TPM-hour
to cover fully-loaded costs at 70% utilisation.
```

### 3.3 Pool Utilisation Is the Critical Variable

On-prem, idle GPUs do not reduce costs. Every idle GPU-hour is lost CapEx. The PT pricing floor changes dramatically with utilisation:

| PT Pool Utilisation | Effective Cost / 1k TPM-hr (H100 NVL, LLaMA-3 70B, illustrative) | Notes |
|---|---|---|
| 40% | $0.208 | Pool is barely paying for itself even at aggressive pricing |
| 60% | $0.139 | Break-even at most pricing scenarios |
| 70% | $0.119 | Target operating point; provides pricing headroom |
| 80% | $0.104 | Good margin; allows competitive pricing |
| 90% | $0.093 | Excellent margin; only achievable with very predictable PT demand |

**The utilisation target is 70%.** Below 60%, on-prem PT is economically unfavourable at competitive prices. This drives a key product design constraint: we should only sell PT to customers with predictable enough traffic to sustain ≥70% average utilisation of their reservation.

---

## 4. Customer Economics — When Is PT Cheaper Than Their Alternatives?

### 4.1 Alternative 1: Cloud On-Demand API

For customers currently using cloud on-demand inference APIs, PT becomes attractive when:

```
PT monthly cost = PT_price × TPM_reserved × 720 hrs/month

Cloud on-demand monthly cost = OnDemand_rate × tokens_consumed / 1,000

Break-even utilisation for customer:
  utilisation = PT_price / OnDemand_rate

Example:
  PT price: $0.20/1k TPM-hr
  Cloud on-demand: $0.60/1k tokens (competitive estimate for similar model)
  Customer break-even utilisation = $0.20 / $0.60 = 33%

At 33% average utilisation of their reservation, PT costs the same as on-demand.
Above 33%, PT is cheaper. Any customer with predictable production traffic easily exceeds this.
```

This break-even is extremely favourable to the customer — much more so than Azure PTU (which requires ~65% utilisation to break even vs pay-as-you-go). This is because our on-prem cost basis is lower than cloud pricing, allowing us to set a PT price that beats cloud on-demand at much lower utilisation levels.

### 4.2 Alternative 2: Customer's Own Private GPU Cluster

For customers currently running (or considering running) their own GPU cluster for guaranteed capacity:

```
Customer's own GPU cost:
  H100 purchase: ~$30,000–35,000 per GPU
  Plus: data centre colocation, power, IT ops, DCGM, software
  Fully-loaded: ~$12,000–15,000/GPU/year → $1.37–1.71/GPU/hr

Our PT price (example at 30% margin above cost):
  PT price: ~$0.155/1k TPM-hr

Customer gets:
  - No CapEx outlay
  - No GPU ops responsibility
  - SLA-backed throughput
  - Model updates without hardware refresh

Customer build-vs-buy break-even:
  Approximately at 200k TPM sustained production load
  (Above this level, customer might prefer owning hardware;
   below this, PT is cheaper than owning)
```

PT is the right answer for customers who need guaranteed throughput but cannot or do not want to operate GPU infrastructure. The total cost of operating even a small GPU cluster (procurement lead time, ops staff, DCGM, hardware refresh cycle) typically exceeds PT cost for workloads under ~500k TPM.

### 4.3 Customer Sizing Guide

| Customer's Peak TPM | Recommended Reservation | Why |
|---|---|---|
| < 50k TPM | On-demand | Not enough volume to justify PT commitment |
| 50k–200k TPM | PT at 80% of measured peak | Predictable production traffic; PT saves 20–40% vs on-demand |
| 200k–1M TPM | PT at 85–90% of peak | High-volume; PT economics strongly favour commitment |
| > 1M TPM | PT + possible dedicated node negotiation | At scale, a dedicated node contract may be more appropriate |

---

## 5. Pricing Tiers by GPU Type and Model

PT pricing should vary by GPU tier and model size. This reflects real cost differences — an H200 NVL reservation for a long-context model costs more to back than an A100 MIG slice for an embedding model.

### 5.1 Illustrative PT Price Sheet

| PT Tier | GPU Backing | Model Class | Committed TPM Range | Illustrative Price / 1k TPM-hr |
|---|---|---|---|---|
| Micro | 1g.10gb MIG (A100) | Embedding models, classifiers | 500k–2M TPM/slice | ~$0.02–0.04 |
| Small | 2g.20gb MIG (A100) | 7B LLMs, guard models | 100k–500k TPM | ~$0.05–0.09 |
| Medium | 3g.40gb MIG (A100) | 13B–34B LLMs | 50k–200k TPM | ~$0.08–0.14 |
| Standard | 8×A100 80GB node | 34B–70B LLMs | 50k–150k TPM | ~$0.14–0.20 |
| Performance | 8×H100 NVL node | 7B–70B LLMs | 80k–200k TPM | ~$0.20–0.30 |
| Max | 8×H200 NVL node | 70B+ LLMs, long context | 60k–180k TPM | ~$0.25–0.35 |

These prices must be recalculated once Engineering provides measured throughput benchmarks (replacing "illustrative" with real numbers).

---

## 6. Three Scenarios

### Scenario A: Pessimistic (40% pool utilisation — PT undersells or customers underuse)

```
PT pool: 32 H100 NVL cards (4 nodes) reserved for PT
Average utilisation: 40%
Serving capacity: ~60,000 TPM average (illustrative)
Monthly revenue (at $0.20/1k TPM-hr): $0.20 × 60 × 720 = $8,640/month for pool
Monthly cost of 32-card pool: (32 × $1.10/hr avg) × 720 = $25,344/month

Result: Significant loss. PT at 40% utilisation loses money.
Root cause: wrong customers (unpredictable traffic), wrong sizing (over-committed),
or insufficient sales/onboarding process.
```

### Scenario B: Base (70% pool utilisation — right customers, right sizing)

```
PT pool: 32 H100 NVL cards (4 nodes)
Average utilisation: 70%
Monthly revenue (at $0.20/1k TPM-hr): $0.20 × 105 × 720 = $15,120/month
Monthly cost: $25,344/month

Result: Below break-even. Raising price to $0.28/1k TPM-hr:
Revenue: $0.28 × 105 × 720 = $21,168/month
Cost: $25,344/month → still negative on direct cost alone.

Raise to $0.35/1k TPM-hr:
Revenue: $26,460/month vs cost $25,344 → +4.4% margin

Conclusion: On 4 nodes, PT margins are thin at 70% utilisation.
Scale to 12 nodes (96 cards) with shared ops overhead:
  Revenue (70% util, $0.35 price): $79,380/month
  Cost: $76,032/month → +4.4% margin on cost, but ops overhead is now shared
  Better margin with scale.
```

### Scenario C: Optimistic (85% pool utilisation — high-commitment, predictable customers)

```
PT pool: 64 H100 NVL cards (8 nodes), mix of reservation terms
Average utilisation: 85%
PT price: $0.35/1k TPM-hr (Performance tier)
Monthly revenue: $0.35 × 127,500 × 720 = $32,130/month per node
Across 8 nodes: $257,040/month
Monthly cost (8 nodes): $152,064/month
Gross margin: 41%

With H200 NVL nodes (premium tier) at $0.45/1k TPM-hr, 85% util:
Revenue per node: $0.45 × 127,500 × 720 = $41,310/month
Margin: 49%
```

**Key insight:** PT economics require scale and high utilisation. A 4-node PT pool at 70% barely breaks even. An 8-node pool at 85% earns ~40% margin. PT is not a small-scale product — it works at fleet scale with enough committed demand to sustain high utilisation.

---

## 7. Commitment Term Economics

Longer customer commitment terms improve our planning horizon but require pricing incentives:

| Customer Commitment | Suggested Discount vs Monthly | Rationale |
|---|---|---|
| Monthly (no term) | 0% | Baseline; most expensive per token |
| 3-month | ~5% | Small incentive; low planning value for us |
| 6-month | ~12% | Meaningful discount; allows GPU procurement planning |
| 12-month | ~20% | Strongest incentive; allows full CapEx planning cycle alignment |

Annual commitments are most valuable to us not just for the guaranteed revenue but because they give us the demand signal needed to justify new GPU hardware purchases. A 12-month PT commitment from a customer is essentially the demand validation for the next GPU procurement cycle.

---

## 8. Open Financial Questions for Finance

| # | Question | Why It Matters |
|---|---|---|
| F1 | Actual purchase price and depreciation schedule for H100 NVL, H200 NVL, A100 80GB by serial number batch | Foundation of the entire cost model |
| F2 | Fully loaded data centre power cost per GPU-hour (PUE + kWh rate + demand charges) | Second-largest cost component |
| F3 | Data centre rack and colocation cost per U per month | Third cost component |
| F4 | Target gross margin for infrastructure products | Sets the pricing floor = cost × (1 + target margin) |
| F5 | Minimum contract value (in $/month) below which billing and legal overhead makes PT uneconomical | Sets the minimum PT reservation size we will offer |
| F6 | Can annual PT commitments feed the GPU hardware procurement budget cycle? | Determines whether PT commits enable future GPU purchases with demand backing |
| F7 | Are any GPUs in the fleet on a lease or rental arrangement (different cost structure than owned)? | Changes cost basis for those specific cards |
