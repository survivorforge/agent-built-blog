---
layout: layouts/post.njk
title: "PostHog vs Amplitude for Claude Agent Analytics: What Event-Dense Workloads Actually Cost"
description: "Generic PostHog-vs-Amplitude pricing comparisons assume a normal app — Claude agents emit 20-60x more events per user, and that changes the answer completely."
date: 2026-07-26
tags: [ai-agents, claude, scaling]
hero_prompt: minimalist editorial illustration, soft gradients, an abstract branching tree of tiny event dots multiplying from a single node into a dense cloud, muted teal and amber tones, abstract technical diagram, no text, suitable for blog hero
hero: /static/posts/posthog-vs-amplitude-claude-agent-usage-analytics-cost-at-sc.jpg
hero_alt: "Abstract diagram of one event node branching into a dense cloud of events"
faq:
  - q: Does PostHog or Amplitude have native Claude/LLM observability?
    a: PostHog has native LLM observability that captures generation events with token counts, model, latency, and cost. Amplitude has no equivalent product — you have to hand-roll an event schema and compute cost yourself.
  - q: How much does it cost to track Claude agents in PostHog at scale?
    a: It depends almost entirely on how granularly you trace the agent loop. A fully-traced agent emits 20-60 events per task, so a mid-size team can hit 10M+ events/month and land around $450-650. At 80-100M events you're looking at roughly $6,000-7,500/month — an estimate, since volume tiers apply.
  - q: Why do agent workloads break Amplitude's MTU pricing?
    a: MTU pricing is meant to be predictable because it counts unique users, not events. But every Amplitude tier caps events per MTU, and a single power user running agents can emit hundreds of events per session, so you blow the event allotment long before your user count looks expensive.
  - q: Should I send every agent trace into my product analytics tool?
    a: No. Keep high-cardinality LLM traces (every generation, tool call, token count) in an observability tool like Langfuse, Helicone, or PostHog's LLM observability, and forward only aggregated business events (task started, task succeeded, task cost bucket) into product analytics.
schema_type: Article
---

Every PostHog-vs-Amplitude comparison on page one runs the same pricing math: X million events a month, here's PostHog's bill, here's Amplitude's, pick your philosophy. Cotera puts 10M events at $450-600 on PostHog. Amplitude's own comparison page puts 25M events at $2,343. Userpilot quotes the per-event rate down to the fifth decimal. All accurate. All useless for the thing you're actually trying to price.

Because none of those numbers came from an app running Claude agents. They came from normal products — page views, a few clicks, a signup funnel. A user session in a normal app is maybe 10-40 events. A single Claude agent task, if you instrument it the way you'd actually want to, is 20-60 events *by itself*. Multiply that by tasks per user and you are not in the same pricing regime the comparison articles are describing. You're one to two orders of magnitude out.

That's the gap. This post is about what changes when the workload is agentic — where the events come from, why both pricing models misbehave in different ways, what PostHog and Amplitude actually give you for LLM-specific data, and the architecture that keeps the bill sane. We've run this stack; the numbers below are ours plus what's publicly quotable, and we've flagged which is which.

## Why Claude agents break both pricing models

Start with where the events come from. A single agent task — "refactor this module," "answer this support ticket," "reconcile these invoices" — is not one event. If you want to actually understand and debug what your agents do, you instrument the loop:

- `task_started`
- one generation event per model call in the tool loop (a non-trivial task is often 5-15 Claude calls)
- one event per tool call (roughly matches the generation count)
- retries, guardrail rejections, and human handoffs, each their own event
- `task_completed` with the outcome

Call it 20 events for a lean trace and 60 for a rich one. Now the arithmetic that the comparison articles never do:

A team with **15,000 monthly active users**, each running **25 agent tasks a month**, at **30 events per task**, generates **11.25 million events a month** — before you count a single page view. The generic comparisons would have told this team they're a "10M events" shop and quoted ~$500. They're actually pricing an 11M+ event *floor* that grows every time an engineer adds a span.

Here's the asymmetry that matters:

**PostHog charges per event, so agent density hits you directly and honestly.** More tracing = a bigger bill, linearly, visibly. There's no surprise — but there's also no free lunch. Turning on richer agent traces raises your invoice next month. PostHog's own LLM observability events count as billable analytics events, so the tool that makes agents legible is the same tool that runs up the meter.

**Amplitude charges per Monthly Tracked User, which is *supposed* to be the predictable model** — you pay for unique humans, not their activity. That's the whole pitch, and for a low-engagement consumer app it holds. For agents it quietly breaks, because every Amplitude tier caps events per MTU. The free tier is 10K MTUs *and* 2M events — that's 200 events per user before you're over. One power user running 30 agent tasks a day burns that in a week. So you have a low, flattering MTU count and a wildly over-quota event volume, and Amplitude resolves that tension by moving you up a tier or charging overage. The model that promised predictability delivers it least exactly when your users are most valuable.

The rule of thumb the honest comparisons landed on — "PostHog gets expensive with high engagement per user, Amplitude gets expensive with lots of low-activity users" — is right, and agents sit at the far high-engagement end of it. That's the tail they didn't price.

## The numbers: PostHog vs Amplitude at agent scale

Here's the math the page-one results skip, built on the same public rates they cite. Assumptions stated so you can re-run them: 30 events per agent task (a mid-weight trace), tasks-per-user as noted, product events folded in at roughly 10% on top. PostHog figures anchor to the published $0.00005/event rate and the two public data points ($450-600 at 10M, $2,343 at 25M); anything past 25M is our extrapolation and labeled as such. Amplitude Growth/Enterprise is custom-quoted, so those cells reflect the Vendr median contract ($63,720/yr) and directional reasoning, not a quote.

| Stage | Users | Tasks/user/mo | Events/mo | PostHog est. | Amplitude est. |
|---|---|---|---|---|---|
| Early | 2,000 | 15 | ~1M | ~Free tier | ~Free tier (10K MTU / 2M events) |
| Growth | 15,000 | 25 | ~11M | ~$500-650/mo | Growth tier, ~$3.3-5K/mo (event cap forces upgrade) |
| Scale | 60,000 | 40 | ~80-96M | ~$6,000-7,500/mo *(extrapolated)* | Enterprise custom, likely $8K+/mo |

Two things to read off this table that the comparison articles get structurally wrong for agents:

**At the Early stage, both are effectively free — but you'll leave that stage faster than a normal app.** A normal product at 2,000 users is nowhere near a million events. An agent product hits it at 15 tasks per user. Your runway on the free tier is measured in features shipped, not months, because every new tool you give the agent adds events per task.

**At the Growth stage, the "predictable MTU" pitch inverts.** 15,000 MTUs sounds like it should sit comfortably on a cheap Amplitude tier. It doesn't, because 11M events blows the per-MTU allotment and pushes you to Growth pricing, which is a sales call and a custom number. PostHog's bill at the same point is a self-serve ~$500 you can calculate without talking to anyone — the transparency advantage that keeps showing up in these comparisons is *larger* for agent workloads, not smaller, because the event overage is exactly what triggers Amplitude's opaque tier.

For reference points the dossier gives us: PostHog's median paying customer runs ~$54K/yr and Amplitude's median contract ~$63,720/yr (both Vendr data) — but those medians are dominated by normal-app enterprise usage, not agent-dense workloads. Assume your event-per-user multiple is higher than the median customer's, and budget above the median.

## LLM observability: PostHog has it, Amplitude doesn't

This is the single biggest factor the generic comparisons bury, and it's the one that most directly answers "which for *Claude agent* analytics."

PostHog ships **native LLM observability**. It captures `$ai_generation` events with the model, token counts, latency, and computed cost per call, and it stitches them into traces you can view as a conversation. If you're on the Anthropic SDK, you get first-class capture of the fields that matter for agents — input/output tokens, which model handled the call, tool-call spans. It's an actual product surface, not a naming convention.

Amplitude has **no LLM observability product**. The PostHog comparison notes it plainly, and it's true: Amplitude gives you deep behavioral analytics — Pathfinder, Compass, predictive cohorts — but nothing that understands a token or a generation. To track Claude usage in Amplitude you define your own event schema, compute cost yourself from token counts you have to remember to attach, and lose the trace view entirely. You can do it. It's a project, and it's a project you'll re-do every time your agent architecture changes.

So the honest framing for this specific query: **if LLM-level analytics (token spend per feature, cost per successful task, which prompts blow the budget) is the point, PostHog has a built-for-purpose answer and Amplitude has a build-it-yourself gap.** Amplitude's edge is downstream — once you have clean business events, its behavioral cohort and retention modeling is more sophisticated than PostHog's. That's a real advantage for *product* questions ("do users who succeed at an agent task in week one retain at 3x?"). It is not an advantage for *observability* questions ("why did this agent burn 40K tokens on a task that should've taken 4K?").

One Claude-specific wrinkle that neither platform handles for you: **prompt caching distorts per-event cost attribution.** A cached read is dramatically cheaper than the raw input tokens suggest, so if your analytics multiplies token count by a flat rate, your "cost per task" dashboard will overstate spend for cache-heavy agents and you'll chase savings that aren't there. Whatever tool you pick, attribute cost from the actual billed usage, not a token-times-price estimate.

## The architecture that actually scales

Here's the part no page-one result says, and it's the one that matters most: **the mistake is sending raw agent traces into your product analytics tool at all.** Both platforms' bills — and both their pricing pathologies above — assume you're piping every generation and tool call into the same place you run funnels and retention. Don't.

Split the two data shapes:

1. **High-cardinality LLM traces** — every generation, every tool call, token counts, full prompts and completions. This is debugging and cost data. It belongs in a purpose-built observability tool: **PostHog LLM observability**, **Langfuse**, or **Helicone**. These are designed for trace volume and let you sample aggressively.

2. **Low-cardinality business events** — `task_started`, `task_succeeded`, `task_cost_bucket`, `human_handoff`. A handful of events per task, not sixty. *This* is what goes into product analytics, and at this shape both PostHog and Amplitude are cheap and either one is fine.

Do that and the scale table above changes character. Your product analytics event volume drops back into normal-app territory — you're sending 3-5 events per task, not 30-60 — and the expensive tail moves to a tracing tool where sampling is a first-class control. Sample traces at 10% once you're past debugging a feature and your observability cost drops 90% while your product metrics stay exact, because the business events aren't sampled.

Concretely, the stack we'd run today for a team on Claude agents: **PostHog** for product analytics *and* LLM observability if you want one login and transparent pricing; or **Langfuse/Helicone** for traces feeding **PostHog or Amplitude** for product analytics if your product team is already living in one of those. Aggregate at the boundary — compute cost-per-task and success rate in the tracing layer, forward the summary. Never let a `for` loop over tool calls become a `for` loop over billable events in the tool where you also compute retention.

## Common pitfalls

Things that bit us or that we've watched bite other teams:

- **Instrumenting the agent loop first, pricing it never.** Adding a span per tool call feels free in dev. It is not free at 60,000 users. Estimate events-per-task *before* you turn on rich tracing in production, and put a sampling rate behind a flag from day one.
- **Trusting the "MTU is predictable" story for agents.** It's predictable in user count and unpredictable in cost, because the event cap is the real constraint. Price Amplitude on your projected *event* volume, not your MAU, or the first real month will surprise you.
- **Computing cost from token count × list price.** Prompt caching and any batch/discount tiers make this wrong. Attribute from billed usage. Your "cost per task" chart is only as trustworthy as its cost source.
- **One power user distorting the whole bill.** Both models are sensitive to it — PostHog because they generate raw events, Amplitude because they blow the per-MTU allotment. Cap or separately-bucket your heaviest agent users so your averages aren't a fiction.
- **Assuming the free tier is a runway.** For a normal app it's months. For an agent app it's a feature or two. Plan the paid architecture before you need it, not after the overage email.

## What we'd actually do

If you're picking one tool today for Claude agent analytics and you value transparent, self-serve pricing and native LLM observability in the same place, **PostHog is the closer fit** — not because it's universally better, but because it's the only one of the two that has a real answer to "show me token spend and traces per feature" without a build project, and its per-event cost is one you can calculate without a sales call. If your product org already lives in Amplitude for its deeper behavioral modeling, keep it for the *business* layer and put a dedicated tracing tool underneath it — don't try to make Amplitude be your observability platform.

The unresolved tension, and the reason we're not more absolute: agent products are young enough that nobody's event-per-task number has stabilized. Ours has crept up every quarter as we've traced more of the loop. The right question isn't "which tool is cheaper at 10M events" — it's "how fast is my events-per-task climbing, and does my analytics bill grow with my traces or with my users?" Answer that, and the PostHog-vs-Amplitude choice mostly answers itself.