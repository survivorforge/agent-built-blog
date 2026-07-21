---
layout: layouts/post.njk
title: "AgentOps vs Langfuse for Claude Agents: What Session Replay Actually Gives You and the True Cost per 1,000 Traces"
description: "Understand exactly what session replay captures for Claude agents on each platform, and see the per-trace cost math that comparison posts never do."
date: 2026-06-08
tags: [ai-agents, claude, observability]
hero_prompt: "minimalist editorial illustration, soft gradients, two translucent overlapping panels showing branching trace trees with cost labels, abstract agent workflow diagram with nodes and edges, muted blues and warm amber tones, no text, suitable for blog hero, 16:9"
hero: /static/posts/agentops-vs-langfuse-claude-agent-session-replay-cost-per-10.jpg
hero_alt: "Abstract diagram of overlapping agent trace trees with cost nodes"
faq:
  - q: What does "session replay" actually mean in AgentOps vs Langfuse — can you literally re-run a Claude agent session?
    a: Neither platform re-runs your agent. "Session replay" means a structured, step-by-step inspection of a captured trace — you can see every tool call, LLM input/output, and decision point in sequence, but the agent is not executing again. AgentOps calls this time-travel debugging; Langfuse calls it trace inspection. Both are log viewers with good UX, not re-execution engines.
  - q: Does Langfuse pricing count traces or observations, and why does it matter for Claude agents?
    a: Langfuse bills on observations, not traces. A single Claude agent session is one trace but generates many observations — one per LLM call, one per tool call, one for the root span. A typical Claude agent session with moderate tool use produces 8–20 observations. This means 10,000 traces could cost the same as 100,000–200,000 observations, which matters when estimating whether you'll exceed a tier limit.
  - q: At what monthly trace volume does self-hosting Langfuse become cheaper than Langfuse Cloud?
    a: The self-hosted infrastructure cost (Postgres + one container) runs roughly $15–40/month regardless of volume. Langfuse Cloud's free tier covers about 50,000 observations/month. If your agents generate 10+ observations per trace, you'll exceed the free tier at around 5,000 traces/month — the point where self-hosting starts saving money, even before paying for Pro.
  - q: Does AgentOps publish per-trace pricing?
    a: As of mid-2026, AgentOps does not publish per-event or per-trace rates for higher volume tiers on their public pricing page — the comparison pages that list AgentOps pricing are mostly quoting feature tiers, not unit economics. For volume above their free tier, expect a sales conversation. Langfuse Cloud's pricing, by contrast, is fully public.
schema_type: Article
---

Every comparison of AgentOps and Langfuse covers the same ground: feature checklists, integration lists, a note that Langfuse is open-source. What none of them actually answer is the two questions operators ask once the novelty wears off: what does "session replay" give me when a Claude agent goes sideways at 2am, and how much does this cost at real production volume? Those are the questions this post addresses directly.

The pricing gap is particularly frustrating because it's easily solvable — but only if you understand that Langfuse doesn't bill per trace. It bills per observation. For Claude agents with tool use, those are not the same number. Getting the math wrong by even a factor of 5 is easy and changes whether you self-host or go managed entirely.

## What "Session Replay" Actually Means for Claude Agents

Neither platform re-runs your agent. This is worth stating plainly because the phrase "session replay" imports expectations from browser tooling — Hotjar, FullStory — where a replay means watching the actual session unfold again. In agent observability, both AgentOps and Langfuse give you a structured trace viewer: a hierarchical, timestamped record of everything that happened, navigable step by step.

AgentOps brands this as time-travel debugging. Langfuse calls it trace inspection. Functionally, you get:

- The complete message history at each step (what the model received, what it returned)
- Every tool call: name, inputs, outputs, latency
- Token counts and inferred cost per LLM call
- Error states and exceptions surfaced inline

What you do *not* get in either platform, by default:

- In-memory state between sessions (if your agent maintains a context object, you need to instrument that yourself)
- The raw HTTP request to the Claude API unless you've configured verbose capture
- Any side effects that aren't traced — file writes, database mutations, external API calls that aren't wrapped in instrumented functions

For Claude Agent SDK specifically, Langfuse's integration runs via OpenTelemetry and the `@arizeai/openinference-instrumentation-claude-agent-sdk` package. Every `query()` call becomes a root span; tool calls and sub-agent calls become child spans automatically. The trace tree in Langfuse's UI is clean for this pattern — you see the full multi-step session as a collapsible tree, and you can inspect inputs and outputs at any node. AgentOps achieves similar depth through its own instrumentation and supports Claude natively alongside 400+ other model/framework combinations.

The practical difference shows up at debugging time. Langfuse's trace view is better for teams that want to annotate traces with scores and run evals against them — the session viewer is designed with evaluation workflows in mind. AgentOps' session viewer is faster to navigate for raw debugging: the timeline-focused layout is better when you're triaging an incident and need to find the exact tool call where things diverged.

## The Observations-vs-Traces Problem Nobody Explains

Langfuse Cloud's free tier includes 50,000 observations per month. That sounds generous until you understand what an observation is.

A trace is one agent session — one complete run of your Claude agent from start to finish. An observation is every recorded event within that session. For a Claude agent using the SDK's `query()` function:

| Event type | Observations generated |
|---|---|
| Root trace (session start) | 1 |
| Each LLM call to Claude | 1 per call |
| Each tool call (MCP or custom) | 1 per call |
| Each sub-agent invocation | 1+ per invocation |

A conservative Claude agent that makes two LLM calls and four tool calls per session generates roughly 7 observations per trace. A more complex agent doing iterative research with retries might generate 20–40. For planning purposes, 10 observations/trace is a reasonable middle estimate.

At that ratio:

- 50,000 observations/month free tier ≈ **5,000 traces/month**
- Langfuse Pro's included 100,000 observations ≈ **10,000 traces/month**

If you've been reading other comparisons and thinking "50K free traces a month," you're likely off by a factor of 10.

## Cost per 1,000 Traces: The Actual Math

The table below uses Langfuse's published pricing (current as of mid-2026 — verify before provisioning), an assumption of 10 observations per Claude agent trace, and realistic self-hosting infrastructure costs. AgentOps' higher-tier unit pricing is not publicly listed; that gap is noted explicitly.

| Monthly volume | Langfuse Cloud | Langfuse self-hosted | AgentOps |
|---|---|---|---|
| 1,000 traces (~10K obs) | **$0** (free tier) | ~$20–40 (infra fixed) | Free tier (verify limits) |
| 5,000 traces (~50K obs) | **$0** (at free tier limit) | ~$20–40 | Not published |
| 10,000 traces (~100K obs) | **$59/mo** (Pro base) | ~$25–50 | Not published |
| 50,000 traces (~500K obs) | **~$100–150/mo** (Pro + overage) | ~$30–60 | Contact sales |
| 200,000 traces (~2M obs) | **$499/mo** (Team) or Enterprise | ~$80–150 (add Clickhouse) | Enterprise |

A few things this table makes clear that other comparisons don't:

**Under 5,000 traces/month, Langfuse Cloud is free.** Most early-stage Claude agent deployments live here for longer than expected. The self-hosted option actually costs more at low volume because you're paying for infra whether you use it or not.

**The crossover point is around 5,000–8,000 traces/month.** Above that, self-hosting's fixed cost ($25–60/month for a Postgres instance and one container) becomes cheaper than Langfuse Cloud's Pro tier plus overages — and stays cheaper as volume grows.

**AgentOps' pricing opacity is a real signal.** It doesn't mean AgentOps is expensive — it means you can't make an informed financial comparison without talking to sales. For teams that need budget predictability, that's a blocker.

## Self-Hosting Langfuse: When the Economics Flip

Langfuse is AGPL-licensed and fully self-hostable with no feature gates between the cloud and self-hosted versions on core tracing functionality. The minimum viable production setup:

- **PostgreSQL:** Langfuse's primary store. Railway's Postgres service starts at $5/month for hobby workloads; for production with frequent queries, $25–50/month is more realistic. Supabase's free tier technically works but has connection limits that bite under concurrent agent load.
- **Application container:** The Langfuse server itself runs happily on a $6–12/month Fly.io or Railway service with 1–2GB RAM for most workloads.
- **Total:** ~$15–40/month regardless of trace volume, up to roughly 500K traces/month before you start feeling query latency in the dashboard.

Above 500K traces/month, Langfuse recommends adding ClickHouse for analytics queries. A managed ClickHouse instance (ClickHouse Cloud, Altinity) starts at ~$30–50/month. This is worth it if you're running aggregate evals or doing cost analysis across large trace populations — the Postgres-only setup starts to slow on those queries at scale.

One important note on the self-hosted Langfuse vs. Langfuse Cloud feature comparison: the Lunary comparison page describes some privacy features as missing from self-hosted. In practice, if you're self-hosting specifically because of data residency concerns, you're not losing the features you care most about — you're gaining full data control. The "missing features" tend to be cloud-managed convenience (automatic upgrades, cloud-native SSO), not core observability functionality.

## Common Pitfalls

**Trace IDs don't automatically propagate across async boundaries in Claude agents.** If your agent fans out to parallel tool calls using `Promise.all()` or spawns sub-agents, you need to explicitly pass the trace context. The OpenInference instrumentation handles sequential calls well but drops the thread in concurrent patterns unless you use Langfuse's context manager wrapper. We found this out after two weeks of traces that looked like independent sessions rather than a connected agent run.

**AgentOps' session replay is significantly better for multi-agent graphs than single-agent debugging.** Its session view is designed for multi-agent systems with multiple nodes — when you're running a Claude orchestrator with sub-agents, the session graph view is genuinely clearer than Langfuse's trace tree. For single-agent Claude SDK usage, the Langfuse trace tree is simpler to navigate.

**Langfuse cost inference assumes well-formed model names.** Langfuse infers the Claude API cost from the model string in the span. If your code passes `claude-3-5-sonnet-20241022` directly, cost inference works. If it passes a version alias or a custom proxy that rewrites the model name, your cost data in Langfuse will be wrong or absent. The People Also Ask result about how Langfuse calculates cost is accurate: it's model-name matching against a built-in lookup table, not reading the Anthropic invoice.

**The overhead numbers from the aimultiple.com benchmark (12% for AgentOps, 15% for Langfuse) are measured on a multi-agent travel planning workflow with 100 queries.** At simpler single-call Claude agent loads, both are lower. Both platforms send traces asynchronously, so the overhead you feel in p99 latency is minimal; the overhead in average latency reflects serialization and event emission. For most production Claude agent workloads, neither number should drive the decision.

**Don't conflate "session replay" with debugging completeness.** The most common gap in practice: an agent fails because of state it accumulated across prior sessions — context windows that filled up, memory that drifted, a cached tool result from three sessions ago. Neither platform captures inter-session state unless you explicitly trace it. When your replay looks clean but the behavior is still wrong, check whether the failure is in the session you're looking at or in state the agent inherited.

---

The choice between AgentOps and Langfuse for Claude agents is less about features than about your operational posture. If you want pricing transparency, self-hosting optionality, and a tight Claude SDK integration that's already maintained in the OpenInference ecosystem, Langfuse is the more legible choice — and it's free at volumes where most teams spend months. If you need multi-framework agent support across a heterogeneous stack, or want the cleaner session graph view for multi-agent systems, AgentOps earns consideration despite the pricing opacity.

The question worth sitting with: do you actually need session replay, or do you need structured trace search? For most agent debugging, the ability to filter traces by error, cost outlier, or specific tool call matters more than the ability to walk through a session cinematically. Both platforms do structured search well. The "replay" framing makes both tools sound more magical than they are — and the useful part is always the indexed, queryable trace store underneath.