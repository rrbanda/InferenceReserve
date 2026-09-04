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
- Currently on shared on-demand inference (cloud API or shared on-prem)

**Who to recruit (in priority order):**
1. Platform engineer / MLOps engineer managing inference infrastructure — they feel the TTFT pain directly
2. ML engineer who built the production application — they know the latency requirements
3. Engineering manager — they make the buy vs. build decision

**Pain we expect to find:** TTFT spikes during peak hours, on-call alerts caused by inference throttling, customers complaining about slow AI features, teams building custom retry and circuit-breaker logic to mask inference variability.

---

### Segment B: Teams Already Running Private GPU Clusters — 2 interviews

**Criteria:**
- Operating their own GPU infrastructure (on-prem or dedicated cloud instances) specifically for inference
- Chose private infrastructure because shared on-demand could not guarantee their throughput or latency requirements

**Who to recruit:**
- Infrastructure engineer who built and operates the private cluster
- Engineering manager who approved the CapEx

**Why this segment is critical:** These customers have already validated the PT value proposition with their own money. They solved the problem by building what PT provides. The question is: at what price and under what conditions would they move from self-operated to PT? Their total cost of ownership (including ops burden) is the ceiling for PT pricing.

---

### Segment C: Churned or At-Risk Customers — 2 interviews

**Criteria:**
- Previously using on-demand inference at volume
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

**For Segment A (on-demand users):**
| # | Question |
|---|---|
| BVB1 | Have you considered running your own GPU cluster to get guaranteed capacity? What stopped you or what's the status? |
| BVB2 | What would the full cost of that look like — hardware, colocation, ops headcount? |

**For Segment B (private cluster operators):**
| # | Question |
|---|---|
| BVB3 | What does it cost you to operate your GPU cluster today — all-in, including the time your team spends on it? |
| BVB4 | If you could get the same guaranteed throughput without owning hardware or managing ops, at what monthly price would that be worth switching? |
| BVB5 | What would you not want to give up about self-managed — what would PT need to match? |

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
  If yes: Monthly cost estimate: ___
  PT break-even price (what they'd need to switch): ___

BUYING SIGNALS:
  Would commit to PT: Yes / Probably / No
  Commitment term comfortable with: Monthly / Quarterly / Annual
  Estimated monthly spend: ___

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

---

## 7. Timeline

| Week | Activity |
|---|---|
| Week 1 | Finalise participant list with Sales and CS; send recruiting messages |
| Week 2–3 | Conduct 9 interviews (2–3 per week); complete synthesis template after each |
| Week 4 | Affinity mapping; PT buyer persona refinement; quantitative summary of WTP signals |
| Week 4 | Brief to sales leadership: early signal on PT buyer profile and deal size |
| Week 5 | Synthesis feeds into discovery gate review |
