# Google Vertex AI Provisioned Throughput — Definitive Reference

**Status:** Research complete
**Date:** 2026-09-04
**Owner:** PM — Inference Platform
**Sources:** Google Cloud official documentation, Google Cloud blog, third-party analysis (nOps, Finout, Apiyi, BitsLovers)

> This document captures everything known about Google's Provisioned Throughput (PT) implementation as of September 2026. It serves as the primary reference for designing our on-prem PT product and resolves open questions from `01-market-competitive-analysis.md` and `12-vertex-pt-comparison.md`.

---

## 1. Core Concepts

### 1.1 What Provisioned Throughput Is

Provisioned Throughput is a **fixed-cost, fixed-term subscription** within Vertex AI (now branded Gemini Enterprise Agent Platform) that reserves dedicated throughput for generative AI models. The customer specifies a model and region; Google reserves capacity measured in **Generative AI Scale Units (GSUs)**.

Key properties:

- **Fixed cost, fixed term.** The customer pays a flat hourly rate per GSU for the duration of the commitment, regardless of actual usage. Billing begins when the order status becomes "Active."
- **Throughput reservation, not hardware reservation.** PT reserves GSUs — abstract throughput units — not specific GPUs or TPU pods. Google translates GSUs to infrastructure internally.
- **Availability SLA.** PT is the only consumption option that provides an availability SLA (your requests will be processed), not just an uptime SLA (the model is up).
- **Non-cancellable.** Orders cannot be cancelled during the commitment term. GSUs can be increased mid-term but not decreased.
- **Per model, per region, per project.** A PT order is scoped to a specific model version, region, and GCP project. All endpoints using that model/region/project share the same PT pool.
- **No code change required for activation.** Once the order becomes active, traffic to that model/region/project automatically uses reserved capacity. HTTP header overrides are optional.

### 1.2 What PT Is Not

| Common Misconception | Fact |
|---|---|
| "PT lowers the per-token unit price" | PT does not lower the unit price. It provides throughput guarantees and scheduling priority. Effective per-token cost is lower only if utilisation is high (>60-70%). |
| "PT gives you exclusive GPU access" | PT reserves throughput units (GSU), not hardware exclusivity. Google's internal scheduling may or may not use dedicated hardware — this is opaque to the customer. |
| "PT can be cancelled at any time" | Non-cancellable during the term. You can only add more GSUs. |
| "PT applies to all Google models" | Only supported models are eligible. Check the supported models list. |
| "PT is the enterprise version of AI Studio" | PT exists only in Vertex AI (Gemini Enterprise Agent Platform). It has no connection to AI Studio (`generativelanguage.googleapis.com`). |

### 1.3 The GSU Abstraction

Google deliberately hides hardware from the PT buyer. A GSU is an abstract throughput unit where:

- The **price per GSU** is fixed across all models (for a given commitment term)
- The **throughput per GSU** varies by model — lighter models deliver more throughput per GSU
- **Burndown rates** convert input/output tokens into a common throughput measure, accounting for the different computational cost of input vs output generation

This is the correct product abstraction because:

1. Customers cannot predict how many GPUs they need; they can predict peak requests-per-second and average token counts
2. Hardware changes over time (A100 to H100 to Blackwell to TPU); the GSU abstraction insulates customers from hardware lifecycle
3. Multimodal models have different resource costs for text, image, audio, and video — burndown rates normalise these

**Design principle for our product (confirmed):** Our PT unit must be a throughput abstraction, not a GPU count.

---

## 2. Consumption Options Hierarchy

PT is one of four consumption options on Gemini Enterprise Agent Platform. Understanding the full hierarchy is critical for product positioning.

### 2.1 The Four Consumption Options

| Option | Billing Model | Priority | SLA | Commitment | Best For |
|---|---|---|---|---|---|
| **Provisioned Throughput (PT)** | Fixed prepaid per GSU-hour | Highest (dedicated queue) | Availability SLA (99.5%+) | 1 week / 1 month / 3 months / 1 year | Mission-critical, steady-state production workloads |
| **Priority PayGo** | Pay-as-you-go at premium rate (~1.8x standard) | High | Higher than Standard PayGo | None | Unpredictable spikes on important traffic; insurance against 429s |
| **Standard PayGo (DSQ)** | Pay-as-you-go at standard rate | Medium (shared pool) | Uptime SLA only | None | General traffic, development, variable workloads |
| **Batch Inference** | Pay-as-you-go at 50% discount | Lowest | 24-hour completion window | None | Async bulk processing, document summarisation, labeling |

### 2.2 Priority Ordering

```
PT (dedicated) > Priority PayGo > Standard PayGo (high-priority lane) > Standard PayGo (best-effort lane) > Batch
```

### 2.3 Dynamic Shared Quota (DSQ) — The Default

DSQ is the default pay-as-you-go mode. It operates on a fairness principle:

- **No predefined per-customer quota limits.** DSQ provides access to a large shared pool, dynamically allocated based on real-time availability and demand across all customers.
- **High-priority lane:** Each organisation has a default Tokens Per Second (TPS) threshold. Requests within this threshold get higher priority, targeting a 99.5% SLO.
- **Best-effort lane:** Requests exceeding the TPS threshold are handled with lower priority using spare capacity.
- **Usage tiers** automatically adjust baseline throughput based on rolling 30-day spend:

| Model Family | Tier | 30-Day Spend | Traffic TPM (Org-Level) |
|---|---|---|---|
| Gemini Pro models | Tier 1 | $10–$250 | 500,000 |
| | Tier 2 | $250–$2,000 | 1,000,000 |
| | Tier 3 | >$2,000 | 2,000,000 |
| | Custom Tier | Contact sales | Custom |
| Gemini Flash / Flash-Lite | Tier 1 | $10–$250 | 2,000,000 |
| | Tier 2 | $250–$2,000 | 4,000,000 |
| | Tier 3 | >$2,000 | 10,000,000 |
| | Custom Tier | Contact sales | Custom |

### 2.4 Priority PayGo

Controlled via the `X-Vertex-AI-LLM-Shared-Request-Type: priority` header. Designed for important traffic that needs reliability without a PT commitment. Charged at a premium rate (~1.8x standard).

### 2.5 Recommended Layering Strategy (per Google)

Google explicitly recommends layering consumption options:

1. **Provisioned Throughput** — cover the predictable, mission-critical baseload
2. **Priority PayGo** — handle predictable peaks above PT or important variable traffic
3. **Standard PayGo** — foundation for general, non-critical traffic within usage tier
4. **Batch** — large-scale async processing at 50% discount

### 2.6 Batch Inference Limitations

Batch inference does **not** support:
- Provisioned Throughput
- Explicit caching
- RAG
- Batch implicit caching is not supported on Gemini 2.0 Flash or Gemini 2.0 Flash-Lite

---

## 3. GSU Mechanics and Burndown Rates

### 3.1 How GSUs Work

One GSU delivers a fixed per-second throughput for a given model. The throughput varies dramatically by model:

- Lighter models (Flash-Lite, small open models): thousands of tokens/sec per GSU
- Heavier models (Pro, large reasoning models): hundreds of tokens/sec per GSU
- Video models: fractions of a video-second per GSU

The GSU price is the same regardless of model. The throughput-per-GSU is the variable that reflects model cost.

### 3.2 Burndown Rate Definition

A **burndown rate** is a ratio that converts input and output units (tokens, characters, images, video seconds) into a common throughput measure. This allows different token types to consume GSU capacity at different rates, reflecting their actual computational cost.

Key burndown principles:

- **Input text tokens** are the baseline: 1 input text token = 1 token of GSU consumption
- **Output tokens are more expensive**: typically 4-9x input tokens (decode is memory-bandwidth-bound and slower than prefill)
- **Cached tokens are cheaper**: 0.1x input tokens (10% of normal rate) because prefill computation is skipped on cache hits
- **Audio tokens are more expensive**: 1-7x input text tokens depending on model
- **Reasoning/thinking tokens**: same rate as output response tokens for most models
- **Image output tokens**: 60-120x input text tokens (image generation is extremely compute-intensive)
- **Long context penalty**: For some Pro models, inputs >200K tokens double all burndown rates

### 3.3 Complete Google Model Burndown Table (September 2026)

#### Gemini Flash Family (Text-Focused)

| Model | Version | Tokens/sec per GSU | Output Multiplier | Cache Rate | Notes |
|---|---|---|---|---|---|
| Gemini 3.8 Flash | `gemini-3.8-flash` | 675 | 5x | 0.1x | Latest Flash |
| Gemini 3.7 Flash | `gemini-3.7-flash` | 675 | 5x | 0.1x | |
| Gemini 3.6 Flash | `gemini-3.6-flash` | 675 | 5x | 0.1x | |
| Gemini 3.5 Flash | `gemini-3.5-flash` | 675 | 6x | 0.1x | Slightly higher output cost |
| Gemini 3.5 Flash-Lite | `gemini-3.5-flash-lite` | 3,360 | 9x | 0.1x | High throughput, higher output ratio |
| Gemini 3.1 Flash-Lite | `gemini-3.1-flash-lite` | 4,030 | 6x (response + reasoning) | 0.1x | Audio input = 2x text |
| Gemini 2.5 Flash | `gemini-2.5-flash` | 2,690 | 9x (response + reasoning) | N/A | Audio input = 4x text |
| Gemini 2.5 Flash-Lite | `gemini-2.5-flash-lite` | 8,070 | 4x | N/A | Audio input = 3x text |

#### Gemini Pro Family

| Model | Version | Tokens/sec per GSU | Output Multiplier | Long Context Penalty | Notes |
|---|---|---|---|---|---|
| Gemini 3.1 Pro | `gemini-3.1-pro-preview` | 500 | 6x | >200K: all rates double | Audio = 1x normal; cache = 0.1x |
| Gemini 2.5 Pro | `gemini-2.5-pro` | 650 | 8x (response + reasoning) | >200K: input 2x, output 12x | No cache burndown listed |

#### Image Generation Models

| Model | Version | Tokens/sec per GSU | Output Image Token Cost | Notes |
|---|---|---|---|---|
| Gemini 3 Pro Image | `gemini-3-pro-image` | 500 | 60x input text | Text output = 6x |
| Gemini 3.1 Flash Image | `gemini-3.1-flash-image` | 2,015 | 120x input text | Text output = 6x |
| Gemini 3.1 Flash-Lite Image (Nano Banana 2 Lite) | `gemini-3.1-flash-lite-image` | 4,030 | 120x input text | Text output = 6x |
| Gemini 2.5 Flash Image | `gemini-2.5-flash-image` | 2,690 | 100x input text | Text output = 9x |

#### Gemini Live API

| Model | Version | Tokens/sec per GSU | Key Burndown Rates | Notes |
|---|---|---|---|---|
| Gemini 2.5 Flash Live Native Audio | `gemini-live-2.5-flash-native-audio` | 1,620 | Audio input = 6x, Video input = 6x, Image input = 6x, Output audio = 24x, Output text = 4x | Session memory = 1x |

#### Video Generation Models

| Model | Version | Video sec/GSU | Key Burndown Rates |
|---|---|---|---|
| Veo 3.1 Lite Generate | `veo-3.1-lite-generate-001` | 0.035 (720p) | 1080p = 1.75x 720p; +audio = 1.75x; 1080p+audio = 2.33x |
| Veo 3.1 | `veo-3.1-generate-001` | 0.004 | +audio = 2x |
| Veo 3.1 Fast | `veo-3.1-fast-generate-001` | 0.01 (720p) | 1080p = 1.3x; +audio = 1.3x; 4k = 3.4x; 4k+audio = 4x |
| Veo 3.0 | `veo-3.0-generate-001` | 0.004 | +audio = 2x |
| Veo 3.0 Fast | `veo-3.0-fast-generate-001` | 0.01 (720p) | Same ratios as Veo 3.1 Fast |

#### Other

| Model | Version | Units | Throughput/GSU |
|---|---|---|---|
| Virtual Try-On | `virtual-try-on-001` | Images | 0.02 images/sec/GSU |

### 3.4 Partner Models (Anthropic Claude)

All Claude models on Vertex AI share a consistent burndown structure:

| Model | Tokens/sec per GSU | Min GSU Purchase | Output | Cache Write 5m | Cache Write 1h | Cache Hit |
|---|---|---|---|---|---|---|
| Claude Opus 5 | 210 | 1 | 5x | 1.25x | 2x | 0.1x |
| Claude Sonnet 5 | 350 | 25 | 5x | 1.25x | 2x | 0.1x |
| Claude Fable 5 | 105 | 1 | 5x | 1.25x | 2x | 0.1x |
| Claude Opus 4.8 | 210 | 35 | 5x | 1.25x | 2x | 0.1x |
| Claude Opus 4.7 | 210 | 35 | 5x | 1.25x | 2x | 0.1x |
| Claude Sonnet 4.6 | 350 | 25 | 5x | 1.25x | 2x | 0.1x |
| Claude Opus 4.6 | 210 | 35 | 5x | 1.25x | 2x | 0.1x |
| Claude Opus 4.5 | 210 | 35 | 5x | 1.25x | 2x | 0.1x |
| Claude Sonnet 4.5 | 350 | 25 | 5x (7.5x >200K input) | 1.25x (2.5x >200K) | 2x (4x >200K) | 0.1x (0.2x >200K) |
| Claude Opus 4.1 | 70 | 35 | 5x | 1.25x | 2x | 0.1x |
| Claude Haiku 4.5 | 1,050 | 8 | 5x | 1.25x | 2x | 0.1x |
| Claude Opus 4 | 70 | 35 | 5x | 1.25x | 2x | 0.1x |
| Claude Sonnet 4 | 350 | 25 | 5x (7.5x >200K input) | 1.25x (2.5x >200K) | 2x (4x >200K) | 0.1x (0.2x >200K) |

Claude-specific notes:
- Cache writes have **two tiers**: 5-minute TTL (1.25x) and 1-hour TTL (2x)
- PT for Claude models requires contacting a Google Cloud account representative
- Some models have long-context penalty (>200K inputs) that increases all burndown rates

### 3.5 Open Models

| Model | Version | Tokens/sec per GSU | Min GSU | Output Multiplier |
|---|---|---|---|---|
| DeepSeek-OCR | `deepseek-ocr-maas` | 3,360 | 1 | 4x |
| DeepSeek-V3.2 | `deepseek-v3.2-maas` | 1,680 | 1 | 4x |
| Gemma 4 26B | `gemma-4-26b-a4b-it-maas` | 6,725 | 1 | 4x |
| Kimi K2 Thinking | `kimi-k2-thinking-maas` | 1,680 | 1 | 4x |
| Llama 3.3 70B | `llama-3.3-70b-instruct-maas` | 1,400 | 1 | 1x (equal) |
| Llama 4 Maverick 17B-128E | `llama-4-maverick-17b-128e-instruct-maas` | 2,800 | 1 | 4x |
| Llama 4 Scout 17B-16E | `llama-4-scout-17b-16e-instruct-maas` | 4,035 | 1 | 3x |
| MiniMax M2 | `minimax-m2-maas` | 3,360 | 1 | 4x |
| OpenAI gpt-oss 120B | `gpt-oss-120b-maas` | 11,205 | 1 | 4x |
| OpenAI gpt-oss 20B | `gpt-oss-20b-maas` | 14,405 | 1 | 4x |
| Qwen3 235B | `qwen3-235b-a22b-instruct-2507-maas` | 4,035 | 1 | 4x |
| Qwen3 Coder 480B | `qwen3-coder-480b-a35b-instruct-maas` | 1,010 | 1 | 4x |
| Qwen3-Next-80B Instruct | `qwen3-next-80b-a3b-instruct-maas` | 6,725 | 1 | 8x |
| Qwen3-Next-80B Thinking | `qwen3-next-80b-a3b-thinking-maas` | 6,725 | 1 | 8x |
| GLM 4.7 | `glm-4.7-maas` | 1,685 | 1 | 4x |
| GLM 5 | `glm-5-maas` | 1,010 | 1 | 3x |

Open model notes:
- Billed under the same SKUs as Google models (for Gemma), or open model SKUs
- Do not support context caching integration
- Do not support supervised fine-tuned model PT
- Do not support change orders from the console
- **Do** support global endpoints, API header control, monitoring, and all commitment terms

### 3.6 GSU Calculation Formula and Worked Example

**Formula:**

```
Required GSUs = Total weighted tokens per second / Throughput per GSU
```

**Worked example — Gemini 3.6 Flash:**

Given workload:
- 10 queries per second
- 1,000 input text tokens per query
- 500 output text tokens per query
- 2,000 cached input tokens per query

Step 1 — Apply burndown rates:
```
Input:   10 QPS x 1,000 tokens x 1.0 (text input rate)   = 10,000 tokens/sec
Output:  10 QPS x   500 tokens x 5.0 (output rate)        = 25,000 tokens/sec
Cached:  10 QPS x 2,000 tokens x 0.1 (cache rate)         =  2,000 tokens/sec
                                                    Total = 37,000 tokens/sec
```

Step 2 — Divide by throughput per GSU:
```
37,000 / 675 = 54.8 → round up to 55 GSUs
```

Minimum purchase increment for Gemini 3.6 Flash is 1, so **55 GSUs** are needed.

---

## 4. Quota Enforcement Architecture

### 4.1 Dynamic Enforcement Window

Google does **not** use a fixed per-second cap. Instead, the Agent Platform enforces PT quota over a **dynamic window** that automatically adjusts based on model type and GSU allocation size. This allows temporary per-second bursts above the per-second limit while maintaining overall quota compliance over the window duration.

| GSU Allocation Size | Enforcement Window | Rationale |
|---|---|---|
| Small (<=3 GSUs) | 30–120 seconds | Wider window absorbs burst variability for small allocations |
| Medium (3–50 GSUs) | 5–30 seconds | Balanced enforcement for production workloads |
| Large (50+ GSUs) | 1–5 seconds | Tight window for high-frequency, high-volume traffic |

The enforcement windows are based on the **Agent Platform internal clock time** and are independent of when requests are made. They are subject to change for performance and reliability optimisation.

### 4.2 Output Token Estimation

At request time, the true output size is unknown. To prioritise speed, PT **estimates** the output token size before the request begins. The system then:

1. Compares the estimated total consumption (input + estimated output, weighted by burndown) against the remaining PT quota for the current enforcement window
2. If the estimate **fits** within remaining quota: the request is processed as PT (`dedicated`)
3. If the estimate **exceeds** remaining quota: the **entire request** is processed as pay-as-you-go (`spillover`)

This means a single large request can cause spillover even if the overall utilisation is low within the monitoring alignment period.

### 4.3 Quota Reconciliation

After request completion:
- Actual output token count is compared against the initial estimate
- The difference is reconciled in the quota accounting
- Monitoring dashboards report usage metrics **after** reconciliation
- Dashboard metrics are aggregated into alignment periods (minimum 1 minute), which can mask within-second burst behaviour

### 4.4 Burst Behaviour

The dynamic window enables **bursting**: temporary per-second throughput that exceeds the per-second quota limit. However:

- Total consumption over the window duration must stay within limits
- If a burst of traffic within a single enforcement window exceeds PT quota, the overflowing requests become spillover
- The burst capacity is implicit — it is a property of the window averaging, not an explicit burst budget

### 4.5 Real-Time Checking

PT checks available quota in **real time at the millisecond level** as requests arrive, comparing against the rolling enforcement window. This is distinct from the monitoring dashboards, which:

- Use a different clock than Agent Platform
- Aggregate to 1-minute minimum alignment periods
- Report post-reconciliation averages

This clock/granularity difference means: spillover traffic can appear even when dashboard utilisation shows below 100%, because the spillover happened during a sub-second burst within the enforcement window that the 1-minute dashboard average smooths out.

---

## 5. Traffic Routing and Request Control

### 5.1 HTTP Header Control

The `X-Vertex-AI-LLM-Request-Type` header controls how each request interacts with PT:

| Header Value | Behaviour | Use Case |
|---|---|---|
| `dedicated` | Route to PT. If PT quota is exceeded, return 429 ("Too many requests. Exceeded the Provisioned Throughput."). No spillover. | Strict budget control — never pay more than the PT commitment |
| `shared` | Bypass PT entirely. Route to pay-as-you-go pool. | Testing, development, or low-priority traffic that should not consume PT budget |
| Not set (default) | Use PT if active. If PT quota is exceeded, automatically spill over to pay-as-you-go. | Production default — PT with safety valve |

Code example (Python SDK):
```python
from google.genai import Client
from google.genai.types import HttpOptions

# Dedicated — strict PT only
client = Client(http_options=HttpOptions(
    headers={"X-Vertex-AI-LLM-Request-Type": "dedicated"}
))

# Shared — bypass PT
client = Client(http_options=HttpOptions(
    headers={"X-Vertex-AI-LLM-Request-Type": "shared"}
))

# Default — PT with spillover (no header needed)
client = Client()
```

### 5.2 Priority PayGo Header

Separate from PT routing, the Priority PayGo header controls priority within the pay-as-you-go pool:

```python
# Priority PayGo — premium rate, higher priority in shared pool
client = Client(http_options=HttpOptions(
    headers={"X-Vertex-AI-LLM-Shared-Request-Type": "priority"}
))
```

### 5.3 Traffic Types on Monitoring Dashboards

| `request_type` Dimension Value | Meaning |
|---|---|
| `dedicated` | Processed using Provisioned Throughput |
| `spillover` | Exceeded PT quota, processed as pay-as-you-go (note: not supported for Gemini 2.0 models with explicit caching — appears as `shared` instead) |
| `shared` | Explicitly sent to pay-as-you-go via `shared` header, or default traffic when PT is not active |

### 5.4 Scoping

PT applies automatically at the **project + model + region** level:

- All endpoints sending inference requests using the same model in the same region share the same PT pool
- No special endpoint configuration is required
- Multiple services within the same GCP project share the PT allocation
- **Global endpoint support:** PT can be assigned to the `global` region, and traffic exceeding the PT quota uses the global endpoint by default

### 5.5 Important Limitation

PT does **not** cover calls made by other Gemini Enterprise Agent Platform products. For example:
- If you have PT for Gemini 3.5 Flash and use Agent Search, the calls made by Agent Search are not guaranteed by your PT order
- Grounding tool quotas are separate and may need their own quota increase

---

## 6. Purchase Flow and Pricing

### 6.1 Commitment Terms and Pricing

| Commitment Term | Approx. GSU-Hour Rate | Discount vs PayGo | Best For |
|---|---|---|---|
| 1 week | ~$7.14 | Minimal or none | Short-term spikes, product launches, events |
| 1 month | ~$3.70 | Baseline PT pricing | Testing PT before longer commitment |
| 3 months | ~$3.29 | 15–25% savings | Stable production workloads, quarterly planning |
| 1 year | ~$2.74 | 30–40% savings | Mission-critical workloads, predictable demand |

Notes:
- Exact pricing varies by model, region, and current GCP pricing schedule
- The console GSU calculator shows precise costs for your configuration
- The ~26% discount for annual vs monthly commitment is consistent across models
- PT charges per GSU-hour; PayGo charges per million tokens (input + output priced separately)

### 6.2 Cost-Effectiveness Threshold

PT becomes cost-effective when actual usage exceeds **60–70% of committed capacity** consistently. Below this:
- Pay-as-you-go is cheaper because you only pay for tokens processed
- Workloads with high variability (e.g., 10M tokens during business hours, 100K overnight) struggle to maintain utilisation

At full utilisation, effective per-token cost is roughly **80–95% of standard PayGo rates**.

### 6.3 Purchase Process

1. Navigate to **Google Cloud Console > Vertex AI > Provisioned Throughput**
2. Click to create a new order
3. Use the **GSU estimator tool** to determine required GSUs:
   - Input: expected queries per second, typical input/output token counts
   - Output: required GSUs and estimated monthly cost
4. Select model, region, commitment term
5. Optionally specify a start date (up to 2 weeks in the future)
6. Review terms and submit order
7. Wait for activation:
   - **Minutes to a few weeks** depending on order size and available capacity
   - Order status progresses: Pending Review → Approved → Active
   - Billing begins only after status becomes "Active"

### 6.4 Order Management

| Action | Supported | Details |
|---|---|---|
| Increase GSUs mid-term | Yes | Submit a change order via Console |
| Decrease GSUs mid-term | No | Not allowed during commitment term |
| Cancel order | No | Non-cancellable for the full term |
| Modify auto-renewal | Yes | Change auto-renewal behaviour on existing orders |
| Modify model version | Yes | Can update to newer model version within family |
| Modify region | Yes | Configurable on existing orders |
| Advance scheduling | Yes | Schedule start date up to 2 weeks in future |
| Change orders from console | Yes (Google models) / No (open models) | Open models require API |

### 6.5 Supervised Fine-Tuned Model Support

- PT can be applied to both base models and supervised fine-tuned versions
- Fine-tuned endpoints and their base model share the same PT quota
- Starting with Gemini 3: fine-tuned inference has **higher burndown rates**, proportional to the fine-tuned inference premium. Example: if fine-tuned inference costs 50% more, burndown rates are 1.5x base rates.
- Prior to Gemini 3: fine-tuned and base models share identical burndown rates

---

## 7. SLA Structure

### 7.1 Availability SLA vs Uptime SLA

This is the most important SLA distinction:

| SLA Type | What It Guarantees | Who Has It |
|---|---|---|
| **Uptime SLA** (PayGo) | The model endpoint is up and accepting requests | All consumption options |
| **Availability SLA** (PT only) | Your requests will be **processed** within your committed capacity | PT only |

The practical difference: under PayGo, Google's uptime SLA is met even if your requests are rejected with 429 (Resource Exhausted) — because the service is "up," just at capacity. Under PT, those same 429s within your committed capacity become Google's problem.

### 7.2 The 429-to-5XX Conversion Mechanism

This is how Google enforces the availability SLA:

- **Standard PT:** When you are using **less** than your purchased amount, errors that would normally be 429 (rate limiting) are returned as **5XX** errors and **count toward the SLA error rate**. This makes Google financially accountable for capacity failures within your reservation.
- When you **exceed** your purchased amount, additional requests are processed on-demand (spillover) or rejected with 429 — these **do not** count toward the SLA.

- **Single Zone PT:** Capacity-related 429 errors become 5XX, but **do not** count toward the SLA error rate (weaker guarantee).

### 7.3 SLA Targets and Credits

| Parameter | Detail |
|---|---|
| Typical availability target | 99.5% or 99.9% depending on term and model |
| Latency target | 99% latency target attainment with financial credits |
| Latency SLA benchmark | p99 <400ms (provisioned) — better than AWS (<500ms) and Azure (<600ms) |
| Compensation | Service credits proportional to downtime, applied to future GCP bills |
| Compensation form | Credits only — no cash refunds |

### 7.4 Error Code Behaviour

| Quota Framework | Error Message | SLA Impact |
|---|---|---|
| Pay-as-you-go 429 | "Resource exhausted, please try again later." | Does not count toward SLA |
| PT within commitment 429→5XX | Converted to 5XX by platform | **Counts** toward SLA error rate (Standard PT) |
| PT over commitment 429 | "Too many requests. Exceeded the Provisioned Throughput." | Does not count toward SLA |

---

## 8. Context Caching Integration

### 8.1 Implicit Caching

- **Enabled by default** in all Google Cloud projects
- Reduces cost and latency when cache hits occur
- Cached tokens are charged at a discount (reduced burndown rate)
- Works automatically — no developer action required
- Minimum cache token count varies by model family (e.g., 4,096 tokens for Gemini 3 family)

### 8.2 Explicit Caching

- Customer explicitly declares content to cache with controlled lifetime (Time to Live / TTL)
- Default TTL: 60 minutes (updateable)
- Cache is referenced by resource name in subsequent requests
- Guarantees a discount when caches are referenced
- Maximum cacheable content: 10 MB per blob/inline data

### 8.3 Caching with Provisioned Throughput

Both implicit and explicit caching are supported with PT (**in Preview** as of September 2026).

The discount is applied through a **reduced burndown rate**:

| Token Type | Standard Burndown | Cached Burndown | Effective Multiplier |
|---|---|---|---|
| Input text token | 1x | 0.1x | 10x effective throughput |
| Input image token | 1x | 0.1x | 10x effective throughput |
| Input video token | 1x | 0.1x | 10x effective throughput |
| Input audio token | 1-7x (model-dependent) | 0.1-0.2x | 10-35x effective throughput |

**Worked example — Gemini 2.5 Pro:**
- 1,000 standard input tokens → burndown of 1,000 tokens/sec
- 1,000 cached input tokens → burndown of 100 tokens/sec (0.1x rate)
- The cache effectively gives you 10x more throughput for repeated content

### 8.4 Cross-Traffic-Type Cache Sharing

Caches are **cross-traffic-type**: a cache created while using PT also works with PayGo, and vice versa. This means:
- Caches persist regardless of which consumption option the creating request used
- Switching between PT and PayGo does not invalidate caches
- Teams can pre-warm caches using PayGo and benefit from them under PT

### 8.5 Claude Cache Burndown (Unique Structure)

Anthropic Claude models on Vertex AI have a distinctive two-tier cache write structure:

| Operation | Burndown Rate | TTL |
|---|---|---|
| Cache write (5 minute) | 1.25x input | Short-lived, frequent updates |
| Cache write (1 hour) | 2x input | Longer-lived, less frequent |
| Cache hit (read) | 0.1x input | Same as Gemini |

This means writing to cache temporarily **increases** GSU consumption (1.25-2x), while reading from cache dramatically **decreases** it (0.1x). For cache-heavy workloads, the net effect is strongly positive once the cache is warm.

---

## 9. Supported Model Ecosystem (September 2026)

### 9.1 Google First-Party Models

**Text/Multimodal:**
- Gemini 3.8 Flash, 3.7 Flash, 3.6 Flash, 3.5 Flash, 3.5 Flash-Lite
- Gemini 3.1 Flash-Lite, 3.1 Pro (preview), 3 Flash (preview)
- Gemini 2.5 Pro, 2.5 Flash, 2.5 Flash-Lite

**Image Generation:**
- Gemini 3 Pro Image, 3.1 Flash Image, 3.1 Flash-Lite Image (Nano Banana 2 Lite)
- Gemini 2.5 Flash Image
- Virtual Try-On

**Video Generation:**
- Veo 3.1, Veo 3.1 Lite, Veo 3.1 Fast
- Veo 3.0, Veo 3.0 Fast
- No GSU minimums for Veo 3/3.1 — buy exactly the capacity needed

**Real-Time Multimodal:**
- Gemini 2.5 Flash with Gemini Live API (native audio)

### 9.2 Partner Models (Anthropic Claude)

Full Claude lineup on Vertex AI:
- Claude Opus 5, Sonnet 5, Fable 5
- Claude Opus 4.8, 4.7, 4.6, 4.5, 4.1, 4
- Claude Sonnet 4.6, 4.5, 4
- Claude Haiku 4.5
- Claude 3.7 Sonnet (deprecated), 3.5 Sonnet v2 (deprecated), 3.5 Haiku (deprecated), 3 Opus, 3 Haiku (deprecated), 3.5 Sonnet (deprecated)

**Access:** Requires contacting Google Cloud account representative (Private Preview form)

### 9.3 Open Models

- DeepSeek-OCR, DeepSeek-V3.2
- Gemma 4 26B
- Kimi K2 Thinking
- Llama 3.3 70B, Llama 4 Maverick 17B-128E, Llama 4 Scout 17B-16E
- MiniMax M2
- OpenAI gpt-oss 120B, OpenAI gpt-oss 20B
- Qwen3 235B, Qwen3 Coder 480B, Qwen3-Next-80B Instruct, Qwen3-Next-80B Thinking
- GLM 4.7, GLM 5

### 9.4 Capability Matrix

| Capability | Google Models | Partner Models | Open Models |
|---|---|---|---|
| Order through Cloud Console | Yes | Contact sales | Yes |
| Global endpoint support | Yes (select models) | N/A | Yes (select models) |
| Supervised fine-tuned model PT | Yes | N/A | No |
| API key usage | Yes | N/A | No |
| Implicit context caching | Yes | N/A | No |
| Explicit context caching | Yes | N/A | No |
| Single Zone PT | Yes (specific regions) | N/A | No |
| Change order from console | Yes | N/A | No |
| Overages spill to PayGo | Yes | Yes | Yes |
| API header control | Yes | Yes | Yes |
| Monitoring/dashboards/alerting | Yes | Yes | Yes |
| All commitment terms (1w/1m/3m/1y) | Yes | Yes | Yes |

---

## 10. Monitoring and Observability

### 10.1 Cloud Monitoring Metrics

All PT metrics are on the `aiplatform.googleapis.com/PublisherModel` resource:

| Metric Path | Display Name | Description |
|---|---|---|
| `/dedicated_gsu_limit` | Limit (GSU) | Dedicated limit in GSUs — your PT maximum quota |
| `/dedicated_token_limit` | Limit (tokens/sec) | Dedicated limit in tokens per second |
| `/consumed_token_throughput` | Token throughput | Actual throughput usage accounting for burndown rates and quota reconciliation |
| `/consumed_throughput` | Character throughput | Throughput in characters (for token-based models: tokens x 4) |
| `/tokens` | Tokens | Input and output token distribution |
| `/token_count` | Token count | Accumulated input and output token count |

### 10.2 Metric Dimensions

| Dimension | Values |
|---|---|
| `type` | `input`, `output` |
| `request_type` | `dedicated` (PT), `spillover` (overflow to PayGo), `shared` (explicitly PayGo) |

### 10.3 Monitoring Best Practices

**Dashboard setup:**
- Use the **Model Garden Monitoring dashboard** in GCP Console > Monitoring > Dashboards
- Set time window to **<=6 hours** to see peak patterns clearly (wider windows smooth out spikes)
- Lowest possible dashboard granularity: **1-minute alignment periods**
- Add queries via Metrics Explorer for custom views; include `consumed_token_throughput` filtered by model and region without additional aggregations to see total traffic across all types

**Understanding the dashboard/enforcement gap:**
- PT enforces quota at **millisecond-level** using the Agent Platform internal clock
- Dashboards aggregate at **1-minute** minimum using a different clock
- Spillover can appear in dashboards even when average utilisation shows below 100%, because the spillover happened during a sub-second burst within the enforcement window

### 10.4 Alerting Thresholds

| Utilisation Level | Interpretation | Action |
|---|---|---|
| <60% over 7 days | Over-provisioned — wasting money | Consider downsizing at next term renewal |
| 60–70% | Break-even zone — cost-effective vs PayGo | Monitor for trends |
| 70–85% | Healthy utilisation | Optimal range |
| >85% consistently | Approaching limits | Scale up; set 75% alert threshold to allow reaction time |
| Spillover traffic present | PT was fully utilised during enforcement period | Confirm whether spillover is acceptable or if GSUs should be increased |

### 10.5 Troubleshooting Spillover

Spillover traffic appearing on dashboards while average utilisation appears low is not a bug. It means:

1. During the specific enforcement window when those requests arrived, PT quota was consumed
2. The 1-minute dashboard average smooths out the spike, making overall utilisation appear low
3. To investigate: zoom to the narrowest time window possible and look for per-second spikes

If spillover is occurring but should not be:
- Verify traffic patterns for sub-second bursts
- Consider increasing GSUs to handle peak-second throughput, not just average throughput
- Confirm the `X-Vertex-AI-LLM-Request-Type` header is not set to `shared` on any requests

---

## 11. Competitive Comparison

### 11.1 Cross-Provider Comparison Table

| Dimension | Google Vertex AI PT | AWS Bedrock PT | Azure OpenAI PTUs | Oracle OCI Clusters |
|---|---|---|---|---|
| **Unit of capacity** | GSU + per-model burndown rates | Model Units (MU) — per-model | PTU — model-independent pool | AI Units — GPU fractions |
| **Throughput definition** | Tokens per second per GSU | Tokens per minute per MU | TPM + RPM per PTU (output-weighted) | Varies |
| **Shortest commitment** | 1 week | Hourly (no commitment) | Hourly (no commitment) | 1 month |
| **Longest commitment** | 1 year | 12 months | 3 years | Negotiated |
| **Discount range** | 15–40% (3mo–1yr vs PayGo) | ~40% at 6 months | 30–50% with reservations | Negotiated |
| **Cross-model flexibility** | No — per model | No — per model | Yes — PTU pool rebalanceable across models | No |
| **Quota enforcement** | Dynamic window (1–120s) | Per-minute | Per-minute TPM/RPM | N/A |
| **Burst handling** | Window averaging (implicit burst) | Cross-region inference | Spillover to standard | N/A |
| **Output token weighting** | Per-model burndown (4–9x input) | Per-model pricing | Fixed ratios (8:1 GPT-5, 4:1 GPT-4.1) | N/A |
| **Spillover** | Default: auto-spillover to PayGo; `dedicated` header to hard-reject | Hard reject (Reserved tier has overflow for base models) | Optional (must configure); 429 without | N/A |
| **Latency SLA** | p99 <400ms (provisioned) | p99 <500ms (provisioned) | p99 <600ms (PTU) | N/A |
| **Availability SLA** | Yes (99.5%+, with 429→5XX conversion) | No formal availability SLA published | Higher than standard | N/A |
| **Caching integration** | Reduced burndown (0.1x for cached tokens) | Prompt caching (up to 90% input cost reduction) | Cached tokens deducted from utilisation | N/A |
| **Sizing tool** | Console GSU estimator | No self-serve calculator (account team required) | PTU sizing calculator | N/A |
| **Self-serve purchase** | Yes (Console + API) | Yes (Console + API) | Yes (Portal + API) | Account team |
| **Activation time** | Minutes to weeks | Near-instant for available capacity | Near-instant for available capacity | N/A |
| **Model coverage** | Broadest: Gemini, Claude, Llama, Qwen, DeepSeek, GLM, Veo, Imagen, Live API | Amazon Titan, Claude, Llama, Mistral, Cohere | GPT-4o/4.1/5, select models | Cohere, Llama |
| **Fine-tuned model PT** | Yes (Gemini only) | Required for custom models | Limited | N/A |

### 11.2 Google's Key Differentiators

**Strengths:**

1. **Shortest meaningful commitment in market (1 week).** AWS and Azure offer hourly no-commitment options, but those come without meaningful discounts. Google's 1-week term provides guaranteed capacity with a defined commitment — ideal for product launches, campaigns, and seasonal spikes.

2. **Dynamic enforcement windows vs fixed per-minute caps.** Google's 1–120 second dynamic windows allow intelligent burst absorption that fixed per-minute enforcement (AWS, Azure) cannot match. A 1-second burst of 10x normal traffic is absorbed by window averaging rather than causing immediate 429s.

3. **Broadest model coverage.** Google offers PT for first-party (Gemini), partner (Claude), and open-source (Llama, Qwen, DeepSeek, GLM, Kimi, MiniMax, OpenAI gpt-oss) models — all from the same console. AWS and Azure have narrower model coverage.

4. **Context caching integration with reduced burndown.** The 0.1x cache burndown rate effectively gives 10x throughput for cached content. Neither AWS nor Azure offers this level of cache/PT integration.

5. **Deterministic billing.** Fixed price per GSU-hour with no variable surprises. Spillover is the only variable component, and it can be eliminated with the `dedicated` header.

6. **Superior latency SLA.** p99 <400ms vs AWS (<500ms) and Azure (<600ms).

7. **No GSU minimums for video models.** Veo 3/3.1 have no minimum GSU purchase — exact capacity can be purchased. AWS and Azure have minimum commitment thresholds.

**Weaknesses:**

1. **No cross-model flexibility.** GSU commitments are per-model. Azure PTUs can be rebalanced across models within a region. If a customer switches models mid-term on Google, they need a new PT order for the new model.

2. **Activation time uncertainty.** "Minutes to weeks" is a wide range. AWS and Azure provision near-instantly for available capacity. Google's order processing depends on capacity availability and order size.

3. **Non-cancellable terms with no hourly option.** AWS and Azure offer hourly no-commitment PT. Google's minimum is 1 week. For experimentation, Google requires PayGo first.

4. **Context caching with PT is in Preview.** Not yet GA. AWS prompt caching and Azure caching are generally available.

5. **Fine-tuned model PT is limited.** Only Google models (Gemini) support fine-tuned PT. Open models and partner models do not.

### 11.3 Azure PTU — Unique Design Differences Worth Noting

Azure's PTU model has two properties our product design should consider:

- **PTU quota is model-independent.** One pool of PTUs covers any supported model in a region and deployment type. You can shift PTUs between GPT-4o and GPT-4.1 without a new order. This is a significant flexibility advantage over Google's per-model GSU.
- **Output token weighting is explicit and steep.** For GPT-5, one output token counts as 8 input tokens against utilisation. For GPT-4.1, the ratio is 4:1. Cached tokens are deducted fully from utilisation. This is analogous to Google's burndown rates but expressed differently.

### 11.4 AWS Bedrock — Unique Design Differences

- **Custom models require PT.** No exceptions. Fine-tuned models on Bedrock must use Provisioned Throughput for inference. This is a hard requirement, not an option.
- **No self-serve sizing calculator.** Customers must contact their AWS account team for MU-to-throughput mapping. Google and Azure both provide self-serve calculators.
- **Cross-region inference.** AWS routes traffic across regions to dodge regional capacity limits at no added charge. Google offers global endpoints; Azure offers Global Standard deployments.

---

## 12. Resolving Open Questions from Discovery Docs

The following open questions from `01-market-competitive-analysis.md` and `12-vertex-pt-comparison.md` are now resolved:

| ID | Question | Resolution |
|---|---|---|
| VQ1 | Exact GSU burndown rates per model | **Resolved.** Full burndown tables in Section 3 above. |
| VQ2 | Hard reject vs queue vs spillover above PT quota | **Resolved.** Default is auto-spillover to PayGo. Customer can force dedicated-only (429 on overflow) via `dedicated` header. No queuing. |
| VQ3 | Is PT isolation physical or logical? | **Partially resolved.** Google's documentation describes PT as "scheduling priority" and "dedicated pool" but does not confirm physical hardware isolation. GSUs reserve throughput units, not hardware exclusivity. Isolation is likely logical (scheduling priority), not physical (dedicated GPUs). |
| VQ4 | Minimum GSU purchase per model | **Resolved.** Most models: 1 GSU. Claude Sonnet: 25 GSU. Claude Opus: 35 GSU. Claude Haiku: 5-10 GSU. See Section 3 tables. |
| VQ5 | PT SLA — TTFT guaranteed or only availability? | **Resolved.** PT provides: (1) availability SLA (99.5%+) with 429→5XX conversion, and (2) latency target attainment (99%) with financial credits. p99 <400ms is the benchmark. |
| VQ6 | Monitoring — what does the dashboard show? | **Resolved.** See Section 10. Key metrics: `dedicated_gsu_limit`, `consumed_token_throughput`, `dedicated_token_limit`, split by `request_type` (dedicated/spillover/shared). |

### Additional Facts Resolved

| Claim in `12-vertex-pt-comparison.md` | Verified Status |
|---|---|
| Pricing: ~$2,700/GSU/month (1-month) to ~$2,000/GSU/month (1-year) | **Approximately correct.** ~$3.70/GSU-hour for 1-month (~$2,700/month per GSU) and ~$2.74/GSU-hour for 1-year (~$2,000/month per GSU). 26% discount for annual vs monthly is consistent. |
| Consumption tiers: PT > Priority PayGo (1.8x) > Standard PayGo | **Confirmed.** Full hierarchy documented in Section 2. |
| Model portability: GSUs reassignable within model family | **Partially confirmed.** You can modify model version and region on existing orders. Full cross-model reassignment not confirmed. |
| Caching: 0.1x burndown rate | **Confirmed.** Standard across Google models. Claude cache hits also at 0.1x; cache writes at 1.25-2x. |

---

## Source Index

### Primary Google Documentation
- [PT Overview](https://cloud.google.com/vertex-ai/generative-ai/docs/provisioned-throughput)
- [Use PT](https://cloud.google.com/vertex-ai/generative-ai/docs/provisioned-throughput/use-provisioned-throughput)
- [Calculate PT Requirements](https://cloud.google.com/vertex-ai/generative-ai/docs/provisioned-throughput/measure-provisioned-throughput)
- [Purchase PT](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/provisioned-throughput/purchase-provisioned-throughput)
- [Supported Models](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/provisioned-throughput/supported-models)
- [Consumption Options](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/deploy/consumption-options)
- [Standard PayGo / DSQ](https://cloud.google.com/vertex-ai/generative-ai/docs/dynamic-shared-quota)
- [Context Caching Overview](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/context-cache/context-cache-overview)
- [Error Code 429](https://cloud.google.com/vertex-ai/generative-ai/docs/error-code-429)
- [PT Blog Post](https://cloud.google.com/blog/products/ai-machine-learning/provisioned-throughput-on-vertex-ai)
- [Cost-Effective GenAI Strategy Blog](https://cloud.google.com/blog/products/ai-machine-learning/build-a-robust-and-cost-effective-gen-ai-strategy)

### Third-Party Analysis
- [nOps: GCP Provisioned Throughput for AI Workloads](https://www.nops.io/blog/gcp-provisioned-throughput/)
- [nOps: Vertex AI Cost Optimization Guide](https://www.nops.io/blog/vertex-ai-cost-optimization-guide/)
- [Finout: Cross-Cloud Provisioned AI Capacity Comparison](https://www.finout.io/blog/comparing-provisioned-ai-capacity-options-across-aws-azure-google-cloud-and-oci)
- [Apiyi: Google PT In-Depth Decryption](https://help.apiyi.com/en/google-provisioned-throughput-pt-explained-vertex-vs-aistudio-2026-en.html)
- [BitsLovers: Bedrock vs Azure AI Foundry vs Vertex AI](https://www.bitslovers.com/bedrock-vs-azure-ai-foundry-vs-vertex-ai/)
- [DigiUsher: FinOps Guide to GenAI Cost Governance](https://www.digiusher.com/blog/azure-openai-vs-aws-bedrock-vs-google-vertex-ai/)
- [TechnologyMatch: Enterprise AI Comparison](https://technologymatch.com/blog/aws-bedrock-vs-azure-openai-vs-google-vertex-ai-enterprise-ai-comparison)
- [Dr. Pranay Jha: Vertex AI Pricing, PT, and Caching](https://drpranayjha.com/vertex-ai-pricing-provisioned-throughput-caching/)
