# EPIO — Enterprise Private Inference Orchestrator

**Status:** Discovery
**Phase:** Pre-design, pre-implementation

EPIO is the product and platform initiative for building **Provisioned Throughput (PT)** on an on-prem GPU fleet running KServe + vLLM on air-gapped Red Hat OpenShift.

PT is a capacity reservation product. A customer commits to a fixed tokens-per-minute (TPM) for a specific model over a defined term. The platform guarantees that capacity — always warm, isolated from on-demand traffic, with a TTFT SLA — at a committed price below on-demand. Same product pattern as Google Vertex AI (GAUs) and Azure OpenAI (PTUs), built on owned GPU infrastructure.

---

## Infrastructure

| GPU | Memory | PT Role |
|---|---|---|
| H100 NVL | 80 GB HBM3 | Primary PT tier — 7B–70B models |
| H200 NVL | 141 GB HBM3e | Premium PT — long-context, large models |
| H100 HBM3 | 80 GB HBM3 | High-throughput PT serving |
| A100 80GB (MIG) | 80 GB HBM2e | Sub-GPU MIG PT tiers |

**Platform stack (decided):** KServe + vLLM + Triton on OpenShift · llm-d for 70B+ (Phase 4) · DCGM + Prometheus + Grafana

---

## Repository Structure

```
epio/
└── research/
    └── provisioned-throughput/    # PM discovery package
        ├── README.md              # Index and phase map
        ├── 00-opportunity-brief.md
        ├── 01-market-competitive-analysis.md
        ├── 02-technical-context.md
        ├── 03-finops-analysis.md
        ├── 04-user-research-plan.md
        ├── 05-assumptions-risks-log.md
        ├── 06-discovery-definition-of-done.md
        ├── 07-onprem-gpu-delta.md
        └── 08-synthesis-fleet-to-pt.md
```

---

## PT Phase Map

| Phase | Customer Gets | Key Open Question |
|---|---|---|
| 1 | Full-GPU PT on H100 NVL / H200 NVL; dedicated node pool; TTFT SLA | Throughput benchmarks on actual hardware |
| 2 | Request-level TPM enforcement; spillover to on-demand; fine-grained metering | Gateway API TPM rate-limiting filter feasibility |
| 3 | MIG sub-GPU tiers (Micro 1g.10gb, Small 2g.20gb, Medium 3g.40gb) | MIG reconfig without node drain in OpenShift |
| 4 | llm-d PT for 70B+ models; disaggregated prefill/decode | InfiniBand fabric presence; NVSwitch vs NVLink-bridge |

---

## Current Status

Discovery phase. Every gate is Open. No benchmarks run. No Finance actuals. No user interviews completed.

The discovery package in `research/provisioned-throughput/` defines the product, maps the technical constraints, models the economics, and specifies the gate criteria for a Go/No-Go decision.

**Start here:** [`research/provisioned-throughput/README.md`](research/provisioned-throughput/README.md)
