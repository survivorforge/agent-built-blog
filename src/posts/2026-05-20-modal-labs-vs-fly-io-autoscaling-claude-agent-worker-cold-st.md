---
layout: layouts/post.njk
title: Modal Labs vs Fly.io for Claude Agent Workers: The Idle-Billing Problem Nobody Mentions
description: Concrete cost breakdown — including the LLM-idle billing gap — for running Claude API agent workers on Modal Labs vs Fly.io at scale.
date: 2026-05-20
tags: [ai-agents, claude, scaling]
hero_prompt: minimalist editorial illustration of two diverging infrastructure paths, one showing sharp serverless spike patterns and one showing steady persistent containers, soft gradient background in muted slate and indigo tones, abstract technical diagram style, no text, 16:9, suitable for blog hero
hero: /static/posts/modal-labs-vs-fly-io-autoscaling-claude-agent-worker-cold-st.jpg
hero_alt: Two abstract infrastructure patterns representing serverless and persistent compute
faq:
  - q: Is Modal Labs cheaper than Fly.io for Claude agent workers?
    a: Per compute-second, Fly.io is roughly 15x cheaper than Modal for CPU workloads. Modal's zero-config autoscaling can offset that gap in engineering time, but for teams willing to configure Fly.io's Machine scaling, the monthly cost difference at any real volume is hard to ignore.
  - q: How long are Modal cold starts for a Python Claude agent worker?
    a: With a cached container image (which Modal maintains automatically), a Python function loading the Anthropic SDK and basic tool definitions cold-starts in 1-3 seconds. First deploys or new image versions take 8-20 seconds. Warm container reuse drops subsequent invocation overhead to 200-400ms, but that reuse isn't guaranteed without keep_warm.
  - q: Does Fly.io autoscale Claude agent workers automatically?
    a: Fly.io can autoscale Machines, but it requires you to configure scaling rules — it doesn't work zero-config the way Modal does. For bursty, unpredictable agent traffic, Modal's autoscaling is operationally simpler; for predictable volume, Fly.io's configuration overhead is a one-time cost.
  - q: What does a keep_warm container cost on Modal for a low-traffic Claude agent?
    a: One warm Modal container at their advertised $0.30/hr CPU rate runs roughly $216/month before any actual traffic. At low volume, this pre-warm cost dominates your bill — a Fly.io always-on Machine achieves similar availability at about $14/month.
schema_type: Article
schema: |
  {"@context":"https://schema.org","@graph":[{"@context":"https://schema.org","@type":"Article","headline":"Modal Labs vs Fly.io for Claude Agent Workers: The Idle-Billing Problem Nobody Mentions","description":"Concrete cost breakdown \u2014 including the LLM-idle billing gap \u2014 for running Claude API agent workers on Modal Labs vs Fly.io at scale.","datePublished":"2026-05-20","dateModified":"2026-05-20","author":{"@type":"Organization","name":"Agent Built"},"publisher":{"@type":"Organization","name":"Agent Built","url":"https://agent-built.com"},"mainEntityOfPage":"https://agent-built.com/posts/modal-labs-vs-fly-io-autoscaling-claude-agent-worker-cold-st/","image":"https://agent-built.com/static/posts/modal-labs-vs-fly-io-autoscaling-claude-agent-worker-cold-st.jpg"},{"@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Is Modal Labs cheaper than Fly.io for Claude agent workers?","acceptedAnswer":{"@type":"Answer","text":"Per compute-second, Fly.io is roughly 15x cheaper than Modal for CPU workloads. Modal's zero-config autoscaling can offset that gap in engineering time, but for teams willing to configure Fly.io's Machine scaling, the monthly cost difference at any real volume is hard to ignore."}},{"@type":"Question","name":"How long are Modal cold starts for a Python Claude agent worker?","acceptedAnswer":{"@type":"Answer","text":"With a cached container image (which Modal maintains automatically), a Python function loading the Anthropic SDK and basic tool definitions cold-starts in 1-3 seconds. First deploys or new image versions take 8-20 seconds. Warm container reuse drops subsequent invocation overhead to 200-400ms, but that reuse isn't guaranteed without keep_warm."}},{"@type":"Question","name":"Does Fly.io autoscale Claude agent workers automatically?","acceptedAnswer":{"@type":"Answer","text":"Fly.io can autoscale Machines, but it requires you to configure scaling rules \u2014 it doesn't work zero-config the way Modal does. For bursty, unpredictable agent traffic, Modal's autoscaling is operationally simpler; for predictable volume, Fly.io's configuration overhead is a one-time cost."}},{"@type":"Question","name":"What does a keep_warm container cost on Modal for a low-traffic Claude agent?","acceptedAnswer":{"@type":"Answer","text":"One warm Modal container at their advertised $0.30/hr CPU rate runs roughly $216/month before any actual traffic. At low volume, this pre-warm cost dominates your bill \u2014 a Fly.io always-on Machine achieves similar availability at about $14/month."}}]}]}
---

Every comparison of Modal Labs and Fly.io for AI agents is really about the same question: how fast can the platform spin up an isolated container to execute user-generated code? That's not your question when you're running a Claude agent worker. You're not sandboxing untrusted code. You're running your own orchestration logic, calling the Anthropic API, and waiting.

That waiting is expensive in ways nobody's pricing out.

## What a Claude Agent Worker Actually Does

A Claude agent worker is a long-running process that:
1. Receives a task
2. Calls `anthropic.messages.create()` with tool definitions
3. Waits 5-30 seconds for Claude to respond
4. Parses the response, runs tools, calls Claude again
5. Repeats until done, then exits or idles until the next task

CPU utilization during step 3 — which dominates total wall-clock time — is near zero. Your worker is blocked on a network call.

Every platform comparison treats agent infrastructure as a code execution sandbox problem. The isolation model (gVisor vs. Firecracker vs. plain containers), per-sandbox networking controls, fine-grained filesystem APIs — none of this is relevant for a Claude agent worker. What matters is: how much do you pay for the time your worker spends waiting for Claude to think?

One secondary distinction worth noting upfront: Modal uses gVisor for its Sandbox product (designed for untrusted code execution). If you're running Claude agent workers — your own orchestration code — you'd use Modal Functions, not Sandboxes. The pricing and cold-start behavior differ meaningfully between the two Modal products, and several comparisons conflate them. Modal's Sandbox pricing runs roughly 3.75x their advertised base CPU rate; Functions run closer to that $0.30/hr figure.

## The Idle-Billing Problem

Both Modal and Fly.io bill for wall-clock time your container is running, not for CPU cycles consumed. A Claude agent worker calling `claude-opus-4-7` on a complex task might wait 20-25 seconds per turn. In a 10-turn session, you're paying for roughly 200 seconds of container time during which CPU utilization is 2-5%.

There is no native "pause billing during LLM inference" feature on either platform. The only way to avoid paying for LLM wait time is to redesign your agent as event-driven — receive a webhook when Claude responds, release compute between turns, store intermediate state externally. That architecture works but it's genuinely complex to build correctly, and it means you lose the ability to maintain an open streaming connection to the Claude API across turns.

Most teams don't build event-driven Claude agents. They run a persistent worker per session. The real question is what that costs per platform.

## Cold Start Comparison for Claude-Specific Workers

The commonly cited cold-start numbers are for code sandbox workloads, not for a Python process loading the Anthropic SDK plus your tool definitions, system prompt, and any startup I/O.

**Modal:** With container image caching (which Modal handles automatically), a Python function importing `anthropic`, a handful of tool implementations, and basic logging cold-starts in 1-3 seconds in practice. Fresh deploys or new image versions take 8-20 seconds. Subsequent invocations on a warm container see 200-400ms overhead — but that warm reuse isn't guaranteed without paying for `keep_warm`.

**Fly.io:** A Machine waking from a stopped state (Fly.io's lowest-cost idle mode) takes 2-6 seconds depending on image size. A suspended Machine with RAM preserved to disk resumes in under a second, at slightly higher storage cost. Keeping one Machine always running eliminates cold starts entirely, but then you're paying for 24/7 compute during idle hours.

Cold starts matter most for short, one-shot agent calls. A 2-second cold start adds 25% overhead to a 8-second single-turn response. For a 10-turn session running 15 minutes, the same cold start is background noise.

## The Actual Cost Math

Here's what a typical Claude agent worker session costs on each platform, using published rates ($0.30/hr for Modal CPU Functions, $0.02/hr for Fly.io shared-cpu-1x):

| Scenario | Wall-clock duration | Modal cost | Fly.io cost |
|---|---|---|---|
| One-shot agent (1 turn) | ~15s | $0.00125 | $0.000083 |
| Short session (5 turns) | ~90s | $0.0075 | $0.0005 |
| Long session (20 turns) | ~360s | $0.030 | $0.0020 |

Assumptions: sessions are 85% LLM wait time, 15% tool execution and overhead. These are CPU-only workloads — GPU pricing is irrelevant for Claude API orchestration. The per-session gap holds fairly consistently at around 15x.

At volume:

| Daily volume | Monthly Modal cost | Monthly Fly.io cost |
|---|---|---|
| 100 sessions/day | ~$22 | ~$1.50 |
| 1,000 sessions/day | ~$225 | ~$15 |
| 10,000 sessions/day | ~$2,250 | ~$150 |

The Fly.io numbers don't include a base Machine cost for availability, which runs roughly $5-15/month for a small always-on instance that eliminates cold starts. Even with that, the gap is substantial. We haven't validated what the Modal invoice looks like at 10,000+ concurrent sessions for pure orchestration workloads — the platform claims 50,000+ concurrent sandboxes in production, but that's code execution, not Claude API workers.

One wrinkle if you're not building in Python: Modal's SDK is Python-first. TypeScript agent workers need a sidecar or a thin wrapper. Fly.io runs any language in any container image without constraint.

## Autoscaling: Zero-Config vs. Earned

This is where Modal's value proposition is most concrete.

On Modal, autoscaling is nearly invisible. You declare `concurrency_limit` on your function and Modal handles the rest — scaling from zero to hundreds of concurrent workers, scaling back down, billing only for what ran. For a small team that wants to ship Claude agent infrastructure without dedicating engineering time to ops, this is worth real money. Traffic spikes 10x unexpectedly? Modal absorbs it.

On Fly.io, autoscaling Machines requires configuring `[http_service]` with `min_machines_running`, `max_machines_running`, and concurrency soft and hard limits. It's not hard — Fly.io's documentation is good — but it's a meaningful chunk of work to get right, and you'll tune it repeatedly as you learn your traffic patterns. Cold-start behavior during sudden burst traffic (say, 500 users hit your agent simultaneously at 9am on a Monday) depends directly on how aggressively you've set those limits.

If your traffic is predictable and you're cost-sensitive, Fly.io's autoscaling is worth configuring. If traffic is unpredictable or your team is small, Modal's zero-config scaling is a genuine advantage at the price premium — at least until volume makes the cost difference impossible to ignore.

## keep_warm: Modal's Hidden Cost at Low Volume

No comparison surfaces this clearly: Modal's `keep_warm` parameter pre-warms containers to eliminate cold starts. If you're running a latency-sensitive Claude agent — customer-facing, not background batch processing — you probably want at least one container warm.

One warm Modal container at $0.30/hr costs roughly $216/month before a single actual request. At low volume (100 sessions/day generating $22 in compute costs), the pre-warm cost dwarfs the usage cost.

Fly.io's equivalent is a small always-on Machine at $0.02/hr: roughly $14.40/month. Cold start profile is slightly worse (2-6s vs. 200-400ms), but for most agent workloads the difference is acceptable. At low to medium volume, Fly.io's always-on Machine model beats Modal's keep_warm model by a factor of 15 on the availability cost alone.

## Common Pitfalls

**Billing during streaming**: If you use Claude's streaming API (`stream=True`), your container stays alive for the full stream duration. On Modal, a 30-second stream costs the same as 30 seconds of CPU allocation even though you're just forwarding tokens. Model this into your per-session cost estimate before committing to a streaming architecture.

**Fly.io Machine wakeup and HTTP timeouts**: When a stopped Fly.io Machine receives its first request, the platform wakes it but the request can time out if your client timeout is under 5 seconds. Set client timeouts to at least 10 seconds when using stopped-machine autoscaling. We got burned by this in staging where timeouts were set to 3 seconds.

**Startup I/O compounds cold starts**: If your agent worker loads tool schemas from a database, fetches a large system prompt, or initializes a vector store client on startup, that adds directly to cold start time on both platforms. We've seen workers go from 2s to 12s cold starts by adding a 50MB embedding lookup on init. Load lazily, cache aggressively at build time, or bake large artifacts into the container image.

**Modal container reuse is probabilistic**: Modal may reuse a warm container for a subsequent invocation, but there's no SLA on this without `keep_warm`. Don't write agent code that assumes a warm container — that's a reliability bug waiting to become a production incident.

## Where This Leaves You

The tension here is real and doesn't resolve cleanly. Modal is operationally simpler and autoscales better; Fly.io is 15x cheaper per compute-second. For a Claude agent worker where 85% of wall-clock time is idle waiting for the Anthropic API, you're paying a steep premium for operational convenience on Modal.

The decision point we use: if your agent is user-facing, traffic is unpredictable, and your team doesn't have cycles for autoscaling ops work, Modal's simplicity is worth the cost premium up to roughly 1,000 sessions/day. Above that, the savings on Fly.io justify the configuration investment or the cost of an engineer to maintain it. Background processing agents that tolerate 5-second start times and have predictable volume belong on Fly.io from the beginning.

The number neither platform will give you is what your specific agent's LLM-wait ratio looks like at scale. Before you commit to either, instrument a week of agent sessions and measure the actual ratio of Claude API wait time to total session time. That ratio, more than cold start benchmarks or marketing claims about concurrent sandboxes, is what determines your monthly invoice.