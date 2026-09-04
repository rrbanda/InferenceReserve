<p align="center">
  <strong>InferenceReserve</strong>
</p>

<p align="center">
  <em>Provisioned Throughput for On-Prem GPU Infrastructure</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-discovery-blue" alt="Status: Discovery" />
  <img src="https://img.shields.io/badge/phase-pre--design-lightgrey" alt="Phase: Pre-design" />
  <img src="https://img.shields.io/badge/platform-OpenShift-red" alt="Platform: OpenShift" />
  <img src="https://img.shields.io/badge/serving-KServe%20v0.17-00205B" alt="KServe v0.17" />
  <img src="https://img.shields.io/badge/routing-llm--d%20EPP-00A3E0" alt="llm-d EPP" />
  <img src="https://img.shields.io/badge/engine-vLLM%20V1-green" alt="vLLM V1" />
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="License" />
</p>

---

Reserved inference capacity with TTFT SLA, dedicated GPU isolation, and intelligent cache-aware routing — built entirely on upstream Kubernetes-native AI infrastructure.

## What This Is

**InferenceReserve** is a capacity reservation product for LLM inference on an on-prem GPU fleet. A team commits to a fixed tokens-per-minute (TPM) for a specific model over a defined term. The platform guarantees that capacity — always warm, physically isolated from shared serving traffic, with a P95 TTFT SLA.

This is the same product pattern as [Google Vertex AI PT](https://cloud.google.com/vertex-ai/generative-ai/docs/provisioned-throughput) (GSUs) and [Azure OpenAI PTUs](https://learn.microsoft.com/en-us/azure/ai-services/openai/concepts/provisioned-throughput), built on owned GPU infrastructure running KServe + vLLM on air-gapped OpenShift.

## Architecture

All infrastructure is upstream. The custom build is a thin business layer.

| Layer | What | Upstream Owner |
|---|---|---|
| **GPU Management** | Drivers, device plugin, node labeling, MIG, DCGM | NVIDIA GPU Operator |
| **Model Serving** | vLLM pods, replicas, multi-GPU parallelism | KServe `LLMInferenceService` |
| **Routing** | InferencePool, EPP, HTTPRoute (auto-provisioned) | KServe + llm-d |
| **Ingress** | Token counting, rate limiting, tenant auth | Envoy AI Gateway |
| **Quotas** | Per-team GPU quotas, fair sharing, preemption | Kueue |
| **Observability** | GPU + inference metrics | DCGM + Prometheus |
| **Sizing** | Throughput profiles, KV cache analysis, GPU sizing | [AIConfigurator](https://github.com/ai-dynamo/aiconfigurator) + [ConfigIQ](https://configiq.dev/) |
| | | |
| **Reservations** | Who gets how much, for how long, at what price | **Custom: Reservation Manager** |
| **Billing** | Token aggregation, burndown rates, chargeback | **Custom: Billing Pipeline** |
| **Experience** | Sizing calculator, dashboards, auth service | **Custom: Product layer** |

## GPU Fleet

| GPU | Memory | Interconnect | PT Role |
|---|---|---|---|
| H100 NVL | 94 GB HBM3 per GPU | NVLink 600 GB/s | Primary — 7B-70B models |
| H200 NVL | 141 GB HBM3e | NVLink 900 GB/s | Premium — long-context |
| H100 SXM | 80 GB HBM3 | NVSwitch 900 GB/s | High-throughput serving |
| A100 80GB | 80 GB HBM2e (MIG) | PCIe | Sub-GPU MIG tiers |

## Documentation

### Start Here

| Doc | Description |
|---|---|
| [Leadership Brief](provisioned-throughput/09-leadership-brief.md) | 20-minute discussion brief — problem, options, what we need to decide |
| [Executive Brief](provisioned-throughput/13-executive-brief.md) | Product features, consumer/producer experience, architecture diagram |
| [Interactive Prototype](prototype/) | React app — product overview, journeys, dashboards, sizing calculator |

### Discovery Package

| Doc | Description |
|---|---|
| [Opportunity Brief](provisioned-throughput/00-opportunity-brief.md) | Product definition, segmented hypothesis, 8 discovery questions |
| [Market Analysis](provisioned-throughput/01-market-competitive-analysis.md) | Vertex PT (GSU), Azure PTU, AWS Bedrock — patterns to adopt |
| [Technical Context](provisioned-throughput/02-technical-context.md) | KServe, vLLM, llm-d, MIG, DCGM — implementation stack |
| [FinOps Analysis](provisioned-throughput/03-finops-analysis.md) | GPU cost basis, unit economics, pricing corridor, 3 scenarios |
| [User Research Plan](provisioned-throughput/04-user-research-plan.md) | 4 segments, 9 interviews, interview guide with Segment B hardware-refresh questions |
| [Assumptions and Risks](provisioned-throughput/05-assumptions-risks-log.md) | Living log — 13 product, 11 technical, 8 financial assumptions + 11 risks |
| [Definition of Done](provisioned-throughput/06-discovery-definition-of-done.md) | 5 gates, 9 technical feasibility criteria, hard No-Go triggers |
| [On-Prem Delta](provisioned-throughput/07-onprem-gpu-delta.md) | How on-prem PT differs from cloud PT structurally |
| [Synthesis](provisioned-throughput/08-synthesis-fleet-to-pt.md) | Fleet infrastructure mapped to PT design decisions |

### Architecture and Design

| Doc | Description |
|---|---|
| [Architecture](provisioned-throughput/10-architecture.md) | 6-layer design with upstream attribution and build-gap analysis |
| [CRD Specification](provisioned-throughput/11-pt-crd-spec.md) | ProvisionedThroughput CRD, provisioning flow, admission webhooks |
| [Vertex PT Comparison](provisioned-throughput/12-vertex-pt-comparison.md) | Dimension-by-dimension review — gaps, strengths, competitive positioning |
| [Vertex PT Reference](provisioned-throughput/15-vertex-pt-reference.md) | Complete Google PT knowledge base — GSU mechanics, burndown tables, SLA, caching, monitoring |
| [Experience Design](provisioned-throughput/14-experience-design.md) | Consumer and producer journey — step-by-step UX |

## Phase Map

| Phase | What the Customer Gets | Key Question |
|---|---|---|
| **1** | Full-GPU PT on H100 NVL / H200 NVL; TTFT SLA | Throughput benchmarks on actual hardware |
| **2** | TPM enforcement; spillover to shared pool; billing | Envoy AI Gateway release for air-gap |
| **3** | MIG sub-GPU tiers (1g.10gb, 2g.20gb, 3g.40gb) | MIG reconfig without node drain |
| **4** | llm-d disaggregated PT for 70B+ models | InfiniBand/RoCE RDMA availability |

## Upstream Dependencies

| Project | Status | Role |
|---|---|---|
| [KServe](https://github.com/kserve/kserve) `LLMInferenceService` | CNCF Incubating, v0.17 | One YAML creates entire serving stack |
| [llm-d](https://github.com/llm-d/llm-d) EPP | CNCF Sandbox, v0.8 | Cache-aware, queue-aware request routing |
| [NVIDIA GPU Operator](https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/) | Production | GPU lifecycle, MIG, DCGM, node labeling |
| [Gateway API Inference Extension](https://gateway-api-inference-extension.sigs.k8s.io/) | GA (v1) | InferencePool, InferenceObjective |
| [Envoy AI Gateway](https://github.com/envoyproxy/ai-gateway) | GA (v1.1) | Token counting, rate limiting |
| [vLLM](https://github.com/vllm-project/vllm) | Production (V1) | LLM serving engine |
| [Kueue](https://github.com/kubernetes-sigs/kueue) | GA | Per-team GPU quotas, fair sharing |

## Current Status

Discovery phase. All gates open. Benchmarks, Finance actuals, and user interviews pending.

## License

See [LICENSE](LICENSE).
