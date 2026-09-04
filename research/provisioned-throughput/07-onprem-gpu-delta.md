# On-Prem GPU: How PT Differs Structurally from Cloud PT

**Status:** Discovery
**Date:** 2026-09-03
**Owner:** PM — Inference Platform

> PT as a product concept is the same whether it runs on cloud or on-prem. What changes is the cost structure, the isolation architecture, the hardware characteristics, and the operational model. This document covers those differences precisely, using our actual fleet as the reference.

---

## 1. The Fundamental Structural Difference

| Dimension | Cloud PT (Vertex, Azure) | Our On-Prem PT |
|---|---|---|
| GPU cost model | Variable ($/GPU/hr) — pay only when reserved | Fixed (CapEx) — depreciation + power continue idle or busy |
| Idle GPU cost | Zero — stop reserving, stop paying | Full cost — depreciation and power continue |
| Capacity flexibility | Add capacity in minutes; release capacity immediately | New GPU procurement: 16–26 week lead time; cannot release owned hardware |
| Utilisation pressure | Moderate — idle capacity can be released | Extreme — idle GPU is pure loss; every % of pool utilisation matters |
| Break-even utilisation | ~65% (Azure PTU guidance) | ~70–75% (our CapEx model; no idle savings) |
| Infrastructure operations | Managed by cloud provider | Owned by us: DCGM, driver updates, hardware failure, MIG configuration |
| SLA backing | Cloud provider manages hardware failures | We manage: N+1 spares, DCGM health alerts, RMA process |
| New hardware for PT growth | Cloud provider adds capacity; we request more | We must plan and order GPU hardware 6+ months ahead |
| Air-gap / data sovereignty | Not possible — traffic exits premises | Full air-gap capability (OpenShift disconnected install) |

**The single most important consequence:** On-prem PT pricing cannot afford a low break-even utilisation. A cloud PT provider can tolerate 50% pool utilisation and still be profitable (they stop renting idle GPUs). We cannot — at 50% utilisation, we are paying full cost for half of our PT pool with no revenue to show for it.

This drives two product design constraints that cloud PT providers do not face:
1. **PT must be sold only to customers with demonstrably predictable traffic** — we need their utilisation to stay above 70% on average
2. **We need hard utilisation monitoring and right-sizing conversations at renewal** — if a customer is consistently at 40% utilisation, they are losing us money and we should downsize their reservation

---

## 2. The Fleet We Are Working With

These are the GPU types in our on-prem fleet. Every PT design decision — pool sizing, TTFT SLA commitments, throughput per tier — must be grounded in these specific hardware specifications.

### 2.1 GPU Types and PT Relevance

| GPU | Memory | Form Factor | Interconnect | PT Pool Assignment |
|---|---|---|---|---|
| H100 NVL | 80 GB HBM3 | PCIe + NVLink bridge | NVLink between pairs | Primary PT tier — 7B–70B models |
| H200 NVL | 141 GB HBM3e | PCIe + NVLink bridge | NVLink between pairs | Premium PT tier — 70B long-context, large model |
| H100 HBM3 | 80 GB HBM3 | PCIe | PCIe only | PT serving; confirmed best utilisation in fleet |
| A100 80GB | 80 GB HBM2e | PCIe, MIG-capable | PCIe only | MIG PT tiers (Micro, Small, Medium) |

### 2.2 The NVL vs. NVSwitch Distinction (Critical for Phase 4)

**H100 NVL ≠ H100 SXM (DGX H100).** The NVL suffix indicates PCIe form factor with NVLink bridges — not NVSwitch, which provides full all-to-all GPU connectivity at 900 GB/s.

| Capability | H100 SXM (DGX, NVSwitch) | H100 NVL (PCIe, NVLink bridge) |
|---|---|---|
| GPU-to-GPU bandwidth | 900 GB/s (NVLink 4.0, all-to-all) | ~600 GB/s (pairwise NVLink only) |
| Tensor parallelism across all 8 GPUs | Full — NVSwitch enables any-to-any | Limited — efficient only across linked pairs |
| llm-d intra-node KV transfer | Excellent | Adequate but not optimal |
| Multi-GPU models (70B on 8 GPUs) | Optimal | Functional; some TP overhead on non-linked pairs |

**Immediate action required:** Infrastructure team must confirm whether H100 NVL nodes have NVSwitch or NVLink-bridge-only topology. This determines the realistic throughput ceiling for large models in PT pools and affects Phase 4 llm-d PT feasibility.

### 2.3 MIG — Proven Sub-GPU Capability

A100 80GB MIG is confirmed operational with profiles active in the DEV environment:

| Profile | Memory | SM Fraction | Confirmed Status | PT Use |
|---|---|---|---|---|
| 3g.40gb | ~40 GB | 3/7 | Active | Medium model PT (13B–34B) |
| 2g.20gb | ~20 GB | 2/7 | Active; small models at 42–88% SM | Small model PT (7B–13B); audio models |
| 1g.10gb | ~10 GB | 1/7 | Active | Micro PT — embedding models, classifiers |

MIG provides hardware-level isolation between partitions — not just process isolation. This is stronger than any software isolation mechanism and makes MIG slices appropriate for PT tiers where strict capacity guarantees are required at sub-GPU granularity.

---

## 3. Cost Model Comparison

### 3.1 Cloud PT (Reference)

```
Cloud provider GPU cost: $3.40/hr per H100 (committed, 1-year)
Revenue from PT (example): $0.40/1k TPM-hr
At 70% pool utilisation:
  Revenue: covers cost + margin
  If utilisation drops to 50%: provider releases idle GPUs → cost drops proportionally
  → Provider can sustain lower utilisation without permanent loss
```

### 3.2 On-Prem PT (Our Model)

```
Our GPU cost: ~$1.60/hr per H100 NVL (fully-loaded, on-prem)
  (= ~$14,000/yr fully-loaded ÷ 8,760 hrs)
Revenue from PT (example): $0.30/1k TPM-hr
At 70% pool utilisation:
  Cost per 1k TPM: $1.60 × 8 GPUs per node ÷ (150,000 TPM × 70%) × 1,000 = $0.122/1k TPM
  Revenue: $0.30 / cost $0.122 = ~2.5× cost → ~59% gross margin
  
At 40% pool utilisation:
  Cost per 1k TPM: $0.122 / 0.40 × 0.70 = $0.214/1k TPM  
  Revenue: $0.30 / cost $0.214 = 1.4× cost → ~29% gross margin
  → Still positive but margin is dangerously thin; any throughput estimate variance kills it

At 25% pool utilisation:
  Cost per 1k TPM: $0.341/1k TPM
  Revenue: $0.30 / cost $0.341 → Revenue < cost → Loss
```

The on-prem cost advantage (lower $/hr than cloud) is real, but it only materialises at adequate pool utilisation. Below ~55% utilisation at our cost structure, on-prem PT becomes worse economics than cloud PT.

---

## 4. On-Prem-Specific Operational Requirements

### 4.1 Hardware Failure — Now Our Problem

Cloud PT providers handle hardware failure silently. On-prem, a GPU failure during a PT reservation window directly violates the SLA. Required operational capabilities:

**DCGM health monitoring with automated alerting:**
```
DCGM alert rules for PT pools:
  - GPU ECC error count > threshold → alert + flag node for drain
  - GPU temperature > 85°C sustained → alert + investigate throttling
  - GPU memory error rate > threshold → alert + preemptive node replacement
  - GPU SM utilisation = 0 when requests are active → alert + investigate hang
```

**SLA recovery process:**
- DCGM detects failure → automated page to on-call
- PT pod is evicted from failed node → rescheduled to spare node (requires N+1 spare per PT pool)
- Customer is notified; SLA credit is applied per contract terms
- RMA process initiated with NVIDIA for failed card

**PT contracts must define SLA remedies explicitly:** What credits apply when a PT reservation is unavailable? How long is the allowable recovery window? This must be in the product spec before any PT commitment is made to a customer.

### 4.2 GPU Procurement Lead Times

Cloud PT can add capacity in minutes. We cannot. New GPU hardware requires:
- 6–26 weeks depending on model availability (H100 availability has normalised; H200 and B100 are still constrained as of 2026)
- Procurement approval cycle
- Delivery, rack, power, and networking setup
- OS and driver installation
- DCGM integration and monitoring setup
- Burn-in testing before adding to PT pool

**Implication for PT product:** We cannot sell PT capacity we do not yet own. PT pool size is hard-bounded by current fleet. The only safe growth path is: annual PT commitments from customers → Finance approves GPU purchase → GPUs arrive and are added to PT pool. This is a 6–12 month cycle, not a cloud-like elastic capacity model.

**PT capacity must be pre-provisioned.** We cannot offer PT capacity on demand and then procure GPUs to back it. The PT pool is sized at the beginning of each planning cycle based on demand forecasts, not on actual sales.

### 4.3 NVIDIA GPU Operator — Managing the Fleet

The NVIDIA GPU Operator on OpenShift manages driver lifecycle, MIG configuration, and DCGM deployment. PT-specific operational requirements:

| Operation | Frequency | Operational Impact |
|---|---|---|
| Driver updates | Monthly/quarterly | Rolling update; PT pods must be cordoned and drained per node |
| MIG profile changes | On PT tier change request | May require node drain (confirm per environment); defines SLA for PT tier changes |
| DCGM exporter updates | As needed | Hot-update possible; DCGM restart causes metrics gap |
| GPU Operator version upgrades | Quarterly | Planned maintenance window; PT downtime must be pre-communicated |

PT SLAs must exclude planned maintenance windows. Maintenance windows must be communicated to PT customers with adequate lead time (minimum 5 business days recommended).

### 4.4 Air-Gap — All Images Must Be Mirrored

The platform runs in air-gapped OpenShift. Every container image used in the PT stack must be mirrored to the internal registry:

- vLLM serving image (pinned version; update through image promotion pipeline)
- KServe controller and serving images
- DCGM exporter image
- NVIDIA GPU Operator images
- llm-d images (Phase 4; must be planned into mirroring pipeline before Phase 4 begins)
- Any custom PT management or metering sidecar images

**PT release process must include image mirroring as a gate.** A new vLLM version that improves throughput cannot be deployed to PT pools until the image has been mirrored, scanned, and promoted through the internal registry pipeline.

---

## 5. Procurement and Supply Chain Risk

| Risk | Likelihood | Mitigation |
|---|---|---|
| GPU supply disruption delays hardware ordered to back PT commitments | Medium | Do not commit PT capacity that is not already in the fleet. Order hardware only after demand is confirmed. Build in 3-month buffer between hardware order and PT start date. |
| GPU list price increases during contract negotiation | Low | Lock in committed-buy pricing with NVIDIA/reseller before publishing PT pricing. Annual commitments from us to the GPU supplier should align with annual PT commitments from customers to us. |
| Hardware failure rate exceeds N+1 spare budget | Low | Maintain at least 10% spare GPU count per PT pool (minimum 1 spare node per 8 PT nodes). Budget spare hardware in PT pool CapEx. |
| NVIDIA changes AI Enterprise licensing terms mid-contract | Low | Prefer open-source stack (vLLM, KServe, DCGM community edition) where possible. Avoid NVIDIA AI Enterprise dependency for core PT functionality. |

---

## 6. PT Pool Sizing — Utilisation Pattern Considerations

Our GPU fleet spans PROD, UAT, and DEV environments with measurable utilisation across all GPU types. Two operating characteristics inform PT pool sizing:

**Our serving stack is capable of sustained high utilisation.** Environments running well-managed, continuous workloads regularly sustain >90% memory utilisation. This is the operating point we should target for PT pools — it is achievable with the right customer traffic profile.

**Diurnal patterns are the primary challenge for PT pool utilisation.** PT pools hold GPUs 24/7. To sustain 70%+ average daily utilisation, we need PT customers whose traffic is:
- Geographically distributed (different time zones provide offsetting demand curves), or
- Batch-scheduled (nightly pipeline jobs fill the overnight trough), or
- Predictably high-volume throughout the day (large-scale production applications)

Understanding our PT customers' traffic patterns before sizing PT pools is essential. The PT sizing process should include a 30-day traffic analysis from any PT candidate customer.
