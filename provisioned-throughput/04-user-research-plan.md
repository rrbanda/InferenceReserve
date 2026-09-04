# User Research Plan: Provisioned Throughput Discovery

**Status:** Discovery
**Date:** 2026-09-03
**Owner:** PM — Inference Platform

---

## 1. Research Goals

1. **Validate the throughput guarantee problem.** Do customers actually experience unpredictable TTFT and throughput in production, and is this causing real business pain?
2. **Understand the "build private cluster" behaviour.** Who is already running their own GPU infrastructure for guaranteed capacity, and what would make them stop?
3. **Identify the PT buyer and their decision process.** Who purchases PT — engineering, FinOps, procurement, or executive? What is the decision criteria?
4. **Establish willingness to commit.** What TPM size and commitment term would customers actually sign? What price point breaks the deal?
5. **Find early adopter candidates.** Which segment has the clearest pain, the most predictable traffic, and the shortest path to a commitment?

---

## 2. Participant Profiles

### Segment A: Production LLM Users at Scale — 3 interviews

**Criteria:**
- Running at least one production LLM-powered application (customer-facing or internal-facing with real SLA commitments)
- Inference volume sufficient that throughput and latency are operational concerns (not experimental)
- Currently on shared inference (shared on-prem GPU pool with no reserved capacity)

**Who to recruit (in priority order):**
1. Platform engineer / MLOps engineer managing inference infrastructure — they feel the TTFT pain directly
2. ML engineer who built the production application — they know the latency requirements
3. Engineering manager — they make the buy vs. build decision

**Pain we expect to find:** TTFT spikes during peak hours, on-call alerts caused by inference throttling, customers complaining about slow AI features, teams building custom retry and circuit-breaker logic to mask inference variability.

---

### Segment B: Teams Already Running Private GPU Clusters — 2 interviews

**Criteria:**
- Operating their own GPU infrastructure (on-prem or dedicated cloud instances) specifically for inference
- Chose private infrastructure because shared serving could not guarantee their throughput or latency requirements

**Who to recruit:**
- Infrastructure engineer who built and operates the private cluster
- Engineering manager who approved the CapEx

**Why this segment is critical:** These customers have already validated the PT value proposition with their own money. They solved the problem by building what PT provides. However, they will NOT immediately migrate a working cluster to PT — sunk CapEx and operational investment make mid-lifecycle migration irrational. The research questions for this segment are different from Segment A:

1. **At what price would PT capture their next hardware refresh?** — When current GPUs reach end-of-depreciation (2-3 years), would they buy more GPUs or buy PT instead?
2. **Would they adopt PT for new workloads?** — Even if existing inference stays self-managed, would new models or new use cases go to PT?
3. **What is their fully-loaded self-managed cost?** — Hardware depreciation + power + ops headcount + engineering time. This is the PT pricing ceiling for this segment.
4. **What would they not give up?** — Control over model versions, vLLM configs, scaling behaviour. PT must match or exceed their current operational control.

Their total cost of ownership (including ops burden) is the ceiling for PT pricing. Their hardware refresh timeline is the realistic adoption window.

---

### Segment C: Churned or At-Risk Customers — 2 interviews

**Criteria:**
- Previously using shared inference at volume
- Churned or materially reduced spend — CRM notes indicate latency or cost predictability as factors
- Sales can identify from deal notes

**Why:** Churned customers give unfiltered feedback. If PT would have retained them, that signal is high-value.

**Recruiting:** CS or sales warm introduction. Frame as: "We're doing a retrospective to understand what we could have done better. This is a listening call, not a sales call."

---

### Segment D: Regulated Industry Prospects — 2 interviews

**Criteria:**
- Financial services, healthcare, or government-adjacent
- Cannot use external cloud inference APIs due to data residency or compliance requirements
- Have a real-time LLM application that needs throughput guarantees

**Why:** These customers have no cloud PT option at all. For them, on-prem PT is not a preference — it is the only viable path. They are the highest-conviction PT buyers and the segment where on-prem PT has a structural competitive moat.

**Recruiting:** Sales team to identify via industry vertical pipeline.

---

## 3. Interview Guide (45 Minutes)

### Opening (5 min)
Introduce yourself and the goal: "We're exploring whether a guaranteed throughput product for LLM inference makes sense for teams like yours. This is a research call — we're not selling anything today. I'd love to understand how you're running inference today and what problems you run into."

Get: their role, how long they've been running LLMs in production, roughly how much inference volume they handle.

### Current State (10 min)

| # | Question | What We Learn |
|---|---|---|
| CS1 | Walk me through your current inference setup. Where does inference run, and how did you choose that approach? | Self-managed vs. cloud API; how deliberate the decision was |
| CS2 | What models are you serving in production today? Any you're planning to add? | Model profile → sizing input; context length patterns |
| CS3 | How do you currently think about scaling inference to handle peak traffic? | Scaling strategy; whether they've experienced capacity exhaustion |
| CS4 | Have you ever had an incident caused by inference being too slow or unavailable? What happened? | Validates the problem; gets concrete examples |
| CS5 | What does your traffic look like over a week? Steady, bursty, or scheduled peaks? | Classifies workload as PT-suitable or not |

### Throughput and Latency Pain (12 min)

| # | Question | What We Learn |
|---|---|---|
| TL1 | What TTFT does your application need to stay within to not degrade the user experience? | PT SLA input; also screens for customers who don't have a real TTFT requirement |
| TL2 | How often do you actually miss that TTFT target, and what's the impact when you do? | Severity of the problem; business impact |
| TL3 | Have you ever had to rate-limit your own users or queue requests on your side because inference couldn't keep up? | Direct evidence of downstream capacity propagation |
| TL4 | How much time does your team spend managing inference capacity — monitoring, scaling, incident response? | Ops burden → PT value of "set it and forget it" guaranteed capacity |
| TL5 | If I told you I could guarantee your TTFT stays under X ms at up to Y tokens per minute, with no operational burden on your side — what would that be worth to you? | Direct willingness-to-pay probe |

### Build vs. Buy (8 min — adapt based on Segment)

**For Segment A (shared serving users):**
| # | Question |
|---|---|
| BVB1 | Have you considered running your own GPU cluster to get guaranteed capacity? What stopped you or what's the status? |
| BVB2 | What would the full cost of that look like — hardware, colocation, ops headcount? |

**For Segment B (private cluster operators):**
| # | Question |
|---|---|
| BVB3 | What does it cost you to operate your GPU cluster today — all-in, including the time your team spends on it? Hardware, power, headcount, on-call, software licensing? |
| BVB4 | When does your current GPU hardware reach end of depreciation or end of support? What is your plan for the next hardware generation? |
| BVB5 | When that hardware refresh comes, would you buy more GPUs, or would you buy guaranteed capacity from a central platform if the SLA and price were right? At what monthly price does that become compelling? |
| BVB6 | If a new model or use case came up next quarter, would you add GPUs to your cluster, or would you consider buying guaranteed capacity for just that workload? |
| BVB7 | What would you not want to give up about self-managed — control over model versions? vLLM configuration? Scaling behaviour? What would PT need to match for you to trust it? |
| BVB8 | How many people on your team spend time on GPU ops — driver updates, DCGM monitoring, hardware failures, capacity planning? Is that team growing as you add more inference workloads? |

### Commitment and Purchasing (8 min)

| # | Question | What We Learn |
|---|---|
| C1 | If you wanted to commit to guaranteed inference throughput starting next month, who in your org needs to approve that? | Identifies the buyer and decision chain |
| C2 | What budget category does inference infrastructure live in — engineering, IT, R&D? | Maps to the right financial stakeholder |
| C3 | How far ahead can you commit to a throughput level? Could you commit to the same TPM for 3 months? 6 months? 12 months? | Commitment term feasibility |
| C4 | What would make you walk away from a PT commitment — what are the deal-breakers in a contract like this? | Surfaces red-line terms: cancellation policy, SLA credits, minimum size |
| C5 | If you had a PT reservation and your traffic spiked 30% above it for a week, what would you want to happen? | Tests preferences: hard cap, spillover, or queue |

### Close (2 min)
"If you were evaluating a PT product today, what one thing would most influence your decision?"
"Who else should I be talking to about this?"

---

## 4. Observation Signals (Watch Without Prompting)

| Signal During Interview | What It Means |
|---|---|
| Interviewee mentions they have a pager alert on inference latency | Strong buy signal — they are already measuring this |
| Interviewee describes a recent incident caused by inference variability | The problem is real and painful; high PT urgency |
| Interviewee says "we just added more retries / circuit breakers" | Band-aid workaround; PT removes the root cause |
| Interviewee's traffic graph shows a clear diurnal or weekly pattern | Good PT candidate — predictable enough to commit |
| Interviewee says "we can't send this data to a cloud API" | Segment D; on-prem PT is the only viable path |
| Interviewee has already priced out their own GPU cluster | They understand the value; PT must beat their self-managed TCO |
| Interviewee says "the ML team just gets whatever GPUs are available" | Low problem awareness; PT is not the right sell for them now |
| Interviewee cannot answer how often TTFT exceeds their target | They don't measure it; not yet ready for PT |
| **Segment B:** Interviewee mentions their GPUs are 2+ years old or approaching refresh | Hardware refresh window — PT can capture the next procurement cycle |
| **Segment B:** Interviewee says "we're hiring another GPU ops person" | Ops scaling pain — PT's value is capping ops team growth, not eliminating the existing team |
| **Segment B:** Interviewee says "we'd use PT for new models but keep our existing cluster" | Realistic adoption path — PT captures new workloads, not immediate migration of working systems |
| **Segment B:** Interviewee resists giving up control of vLLM config or model versions | PT must offer configuration transparency or customisation (our `vllmOverrides` CRD field addresses this) |
| **Segment B:** Interviewee says "our cluster is at 40% utilisation most of the time" | Org-level consolidation argument — their team is wasting CapEx; platform-level PT would be more efficient |

---

## 5. Synthesis Template (Fill After Each Interview)

```
Interview #: ___   Date: ___   Segment: A/B/C/D
Role: ___   Industry (anonymised): ___

WORKLOAD CLASSIFICATION:
  Predictable / Scheduled / Bursty / Mixed
  Peak TPM (approximate): ___
  Context length (short <2k / medium 2k–16k / long >16k): ___

PROBLEM SEVERITY (1–5):
  TTFT incidents in last 90 days: ___
  Business impact when inference degrades: ___
  Overall severity: ___

BUILD-VS-BUY STATUS:
  Currently self-managed GPU: Yes / No / Evaluating
  If yes: Monthly cost estimate (fully loaded): ___
  If yes: GPU ops headcount (FTEs or fraction): ___
  If yes: Hardware age and refresh timeline: ___
  If yes: Would adopt PT for NEW workloads (even if existing stays): Yes / No / Maybe
  If yes: Would adopt PT at next hardware refresh: Yes / No / Maybe
  PT break-even price (what they'd need to switch): ___
  What operational control they require PT to match: ___

BUYING SIGNALS:
  Would commit to PT: Yes / Probably / No
  Commitment term comfortable with: Monthly / Quarterly / Annual
  Estimated monthly spend: ___
  Adoption path: Immediate migration / New workloads first / At hardware refresh / Not interested

DEAL-BREAKERS SURFACED:
  -

TOP QUOTE:
  "..."

OPEN QUESTIONS FROM THIS INTERVIEW:
  -
```

---

## 6. What We Need to Conclude from Research

After all interviews, the following questions must be answerable with evidence:

| Decision | Evidence Required |
|---|---|
| What is the minimum PT reservation size customers will actually buy? | Distribution of "peak TPM" across all interviews |
| What commitment term is feasible for the typical PT buyer? | C3 data from all interviews |
| Is the PT buyer engineering, FinOps, or executive? | C1 data across all interviews |
| Does on-prem PT's data-residency advantage resonate with Segment D? | Segment D interviews |
| What is the competitive reference frame — are customers comparing us to cloud PT, or to their own GPU cluster cost? | CS1 + BVB data |
| Is spillover (vs hard reject) the required behaviour for most PT customers? | C5 data |
| **For Segment B:** What is the hardware refresh timeline, and would PT capture the next procurement cycle? | BVB4 + BVB5 data |
| **For Segment B:** Would they adopt PT for new workloads even if existing inference stays self-managed? | BVB6 data |
| **For Segment B:** What is the fully-loaded self-managed cost (the PT pricing ceiling for this segment)? | BVB3 + BVB8 data |
| **For Segment B:** What operational control would they require PT to match? | BVB7 data |

---

## 7. Timeline

| Week | Activity |
|---|---|
| Week 1 | Finalise participant list with Sales and CS; send recruiting messages |
| Week 2–3 | Conduct 9 interviews (2–3 per week); complete synthesis template after each |
| Week 4 | Affinity mapping; PT buyer persona refinement; quantitative summary of WTP signals |
| Week 4 | Brief to sales leadership: early signal on PT buyer profile and deal size |
| Week 5 | Synthesis feeds into discovery gate review |
