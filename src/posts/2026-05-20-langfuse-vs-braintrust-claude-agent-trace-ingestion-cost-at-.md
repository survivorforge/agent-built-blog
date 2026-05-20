---
layout: layouts/post.njk
title: "Langfuse vs Braintrust for Claude Agent Tracing: What Ingestion Actually Costs at Scale"
description: "Side-by-side cost breakdown for Claude agent trace ingestion on Langfuse vs Braintrust at 10K, 50K, and 200K runs/month, with Claude SDK integration specifics."
date: 2026-05-20
tags: [ai-agents, claude, observability]
hero_prompt: "minimalist editorial illustration of two parallel data pipelines branching into separate cost meters with abstract glowing nodes and directed graph edges representing agent trace spans, muted blue and slate palette with a single amber cost spike on one meter, soft gradient background, no text, 16:9"
hero: /static/posts/langfuse-vs-braintrust-claude-agent-trace-ingestion-cost-at-.jpg
hero_alt: Two agent trace pipelines diverging into contrasting cost meters
faq:
  - q: Does Langfuse or Braintrust automatically calculate Claude API costs?
    a: Both platforms infer cost from model names. Langfuse auto-calculates cost for supported Anthropic models when you pass the correct model name on the generation. Braintrust does the same via its proxy. For extended thinking tokens on claude-3-7-sonnet, you need to pass token counts manually in both platforms — neither breaks out thinking vs. output tokens automatically.
  - q: At what monthly volume does self-hosting Langfuse beat Braintrust Pro on cost?
    a: Roughly above 50K agent runs/month with active online scoring. A minimal ClickHouse + Postgres stack on AWS runs $200–350/month with no per-observation or per-score fees. The crossover is driven by Braintrust's score overage costs, not data volume.
  - q: Does Braintrust support OpenTelemetry for Claude agent traces?
    a: Braintrust added OTel-compatible trace import but its primary path is the Braintrust SDK and AI proxy. Langfuse is more OTel-native, which matters if you want Claude spans correlated with non-LLM microservice traces in a unified backend like Grafana or Jaeger.
  - q: Can you run Langfuse for tracing and Braintrust for evals at the same time?
    a: Yes, and some teams do — Langfuse for production trace ingestion at volume, Braintrust for offline eval datasets and regression suites. They're not mutually exclusive, though the context-switching overhead is real and you're paying two platform costs.
schema_type: Article
schema: |
  {"@context":"https://schema.org","@graph":[{"@context":"https://schema.org","@type":"Article","headline":"Langfuse vs Braintrust for Claude Agent Tracing: What Ingestion Actually Costs at Scale","description":"Side-by-side cost breakdown for Claude agent trace ingestion on Langfuse vs Braintrust at 10K, 50K, and 200K runs/month, with Claude SDK integration specifics.","datePublished":"2026-05-20","dateModified":"2026-05-20","author":{"@type":"Organization","name":"Agent Built"},"publisher":{"@type":"Organization","name":"Agent Built","url":"https://agent-built.com"},"mainEntityOfPage":"https://agent-built.com/posts/langfuse-vs-braintrust-claude-agent-trace-ingestion-cost-at-/","image":"https://agent-built.com/static/posts/langfuse-vs-braintrust-claude-agent-trace-ingestion-cost-at-.jpg"},{"@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Does Langfuse or Braintrust automatically calculate Claude API costs?","acceptedAnswer":{"@type":"Answer","text":"Both platforms infer cost from model names. Langfuse auto-calculates cost for supported Anthropic models when you pass the correct model name on the generation. Braintrust does the same via its proxy. For extended thinking tokens on claude-3-7-sonnet, you need to pass token counts manually in both platforms \u2014 neither breaks out thinking vs. output tokens automatically."}},{"@type":"Question","name":"At what monthly volume does self-hosting Langfuse beat Braintrust Pro on cost?","acceptedAnswer":{"@type":"Answer","text":"Roughly above 50K agent runs/month with active online scoring. A minimal ClickHouse + Postgres stack on AWS runs $200\u2013350/month with no per-observation or per-score fees. The crossover is driven by Braintrust's score overage costs, not data volume."}},{"@type":"Question","name":"Does Braintrust support OpenTelemetry for Claude agent traces?","acceptedAnswer":{"@type":"Answer","text":"Braintrust added OTel-compatible trace import but its primary path is the Braintrust SDK and AI proxy. Langfuse is more OTel-native, which matters if you want Claude spans correlated with non-LLM microservice traces in a unified backend like Grafana or Jaeger."}},{"@type":"Question","name":"Can you run Langfuse for tracing and Braintrust for evals at the same time?","acceptedAnswer":{"@type":"Answer","text":"Yes, and some teams do \u2014 Langfuse for production trace ingestion at volume, Braintrust for offline eval datasets and regression suites. They're not mutually exclusive, though the context-switching overhead is real and you're paying two platform costs."}}]}]}
---

Every comparison you'll find frames this as: Langfuse is open-source and self-hostable, Braintrust is eval-first and batteries-included. That framing is accurate. It's also not the question an operator shipping a Claude agent should be asking. The question is: at 50,000 agent runs per month with online scoring enabled, what does this actually cost, and where does each model break?

That question has a specific numerical answer. None of the existing comparisons give it to you. They describe product philosophy. Here's the arithmetic.

## What a Claude Agent Trace Actually Contains

Before any cost model makes sense, you need a concrete unit count. A typical Claude research agent — takes a query, runs 4–6 tool calls, synthesizes, returns — generates the following per run:

- 1 root trace
- 4–8 LLM generations (each tool-use cycle is a generation)
- 1–2 spans per tool call (invocation + result parsing)
- Optional evaluation scores if online scoring is enabled

In Langfuse's billing model, every span, generation, and event is an **observation**. In Braintrust's model, you're billed on **gigabytes of processed data** and separately on **evaluation scores**. The unit difference is the whole story.

| Agent type | LLM calls | Tool spans | Total observations | Raw trace size | Scores (if online scoring on) |
|---|---|---|---|---|---|
| Simple RAG (2-step) | 2 | 4 | ~10 | ~15 KB | 2–3 |
| Research agent (5-step) | 6 | 12 | ~25 | ~40 KB | 5–8 |
| Autonomous agent (10-step) | 10 | 25 | ~45 | ~80 KB | 8–15 |

Use the research agent row as your baseline for the math below.

## The Cost Breakdown at Three Scale Points

Using a research agent (25 observations, 40 KB trace data, 5 online scores per run):

**Braintrust pricing, published as of May 2026:** Pro at $249/month includes 5 GB processed data and 50K scores. Overages: $3/GB and $1.50 per 1K scores.

**Langfuse Cloud pricing (approximate — verify current rates at the Langfuse website):** Pro tier around $59/month base with an included observation block; additional observations billed per 100K at roughly $8–10.

| Monthly runs | Data volume | Scores generated | Braintrust Pro total | Langfuse Cloud (approx) | Langfuse self-hosted |
|---|---|---|---|---|---|
| 10K | 400 MB | 50K | **$249** (within limits) | **~$80** | **$200–280** infra |
| 50K | 2 GB | 250K | **~$549** | **~$160** | **$200–280** infra |
| 200K | 8 GB | 1M | **~$1,683** | **~$460** | **$250–380** infra |

The Braintrust number at 200K deserves unpacking because it's counterintuitive. The data cost at 200K runs is almost nothing: 8 GB minus 5 GB included = 3 GB overage × $3 = **$9**. The score cost is everything: 1M scores minus 50K included = 950K overage × $1.50/1K = **$1,425**. Total: $249 + $9 + $1,425 = $1,683.

Teams budget for data volume. They get surprised by score volume. This is the pattern worth watching for.

## Why Score Pricing Hits Claude Agents Harder Than RAG

A RAG pipeline emits one or two scores per request — retrieval quality and answer quality. That's a manageable unit. A Claude agent configured with Braintrust's online scoring (which runs LLM-as-judge automatically on each trace) can emit 5–10 scores per run: one per tool call quality assessment, one for reasoning coherence, one for final output. It's genuinely useful. It's also a fast path to overage.

Braintrust's free Starter tier includes 10K scores/month — enough for roughly 1K–2K agent runs before you hit overage at $2.50/1K. Pro's 50K scores covers 5K–10K agent runs. Run a nightly eval pipeline that generates 100 test variants × 10 scores each = 1K scores per experiment. Five experiments in a week and you're in overage territory.

Langfuse's eval model works differently structurally: LLM-as-judge evaluations are API calls you configure yourself, and you pay for them at your model provider's token rate — not at a platform per-score fee. At Claude Haiku pricing ($0.25/MTok input), a 500-token evaluator prompt costs $0.000125 per call. Braintrust's $1.50/1K effectively prices each score at $0.0015 — 12× higher than running the same evaluator yourself at Haiku rates. You're paying for managed infrastructure around the call, not just the call.

Neither model is wrong. But if you're building a scoring-heavy pipeline, the cost curves diverge fast and the per-score price is what drives it.

## Claude SDK Integration: What Actually Gets Captured

Both platforms support the Anthropic Python SDK. Where they differ is in what gets captured automatically versus what you wire manually.

**Langfuse** provides an `@observe` decorator and Anthropic-specific integration helpers. For standard `claude-3-5-sonnet` and `claude-3-opus` calls, model name, input/output token counts, and inferred cost are captured automatically. Tool calls appear as nested generations. Streaming is supported with some additional setup.

What falls through: extended thinking tokens. When you set `thinking: {type: "enabled", budget_tokens: 10000}` on claude-3-7-sonnet, thinking tokens are billed at a different rate than output tokens. Langfuse captures total token counts but won't break out thinking vs. output unless you pass them explicitly via a manual span update. You'll see a cost number that looks plausible but may be wrong if the agent is thinking-heavy.

**Braintrust** captures the same standard fields and handles Anthropic model-specific parameters more cleanly when calls route through its AI proxy. The proxy gets native visibility into full request/response payloads including thinking block metadata. The tradeoff: your agent has a runtime dependency on Braintrust's infrastructure. A Braintrust proxy outage affects production agent behavior, not just your observability. That's a different risk profile than a passive observer.

Neither platform auto-instruments Claude Managed Agents sub-agent spawning. If your top-level agent spawns a child via the Managed Agents SDK, you get two disconnected traces unless you manually propagate the parent trace ID through your orchestration layer. Both platforms document how to do this. Neither makes it automatic.

## The Self-Host Crossover

Langfuse Cloud is cheaper than Braintrust Pro at medium scale. Langfuse self-hosted beats both once you have the operational capacity to run it.

The Langfuse stack: Postgres for metadata, ClickHouse for trace data, a Node.js web layer. On AWS, a setup that handles 200K agent runs/month comfortably:

- RDS Postgres t3.medium: ~$60/month
- ClickHouse on EC2 m5.xlarge (or managed ClickHouse Cloud): ~$120–180/month
- ECS for the web layer: ~$60/month
- S3 for blob storage: ~$20/month

Total: roughly $260–320/month. No per-observation fees, no per-score fees, configurable retention. At 200K runs, that's under $0.002 per run for the full observability stack.

The honest tradeoff: you own the ClickHouse cluster. Schema migrations, storage growth, backups — that's your responsibility. Langfuse's self-hosted tier doesn't include support below Enterprise pricing. If ClickHouse performance degrades under a burst load, you're debugging it yourself. That's fine if your team has infrastructure capacity; it's not fine if you don't.

The self-host decision makes sense when you're above ~50K runs/month, have at least one engineer comfortable with ClickHouse, need retention beyond 30 days without paying for Braintrust Enterprise, or have data residency requirements that rule out US-based SaaS.

## Common Pitfalls

**Braintrust score budget exhaustion in the first week.** Online scoring is configured at the project level. Enable it, run a large evaluation batch, and you can exhaust your monthly score quota by day 3. The fix: separate Braintrust projects for online production scoring vs. batch eval runs. Don't let a CI pipeline share a scoring budget with production.

**Langfuse observation inflation from verbose logging.** An agent that logs every intermediate state — tool call parameters, parsed results, reasoning steps — can produce 100+ observations per run where you expected 25. Langfuse bills per observation regardless of size. Set explicit span boundaries and avoid logging high-frequency intermediate events as separate observations.

**Braintrust 30-day retention for production debugging.** On Pro, traces older than 30 days are gone. If you get a reliability alert at the end of the month and want to compare against traces from week 1, you can't. This is a real constraint for incident investigation, not a theoretical edge case. Langfuse Cloud has configurable retention; self-hosted has no limit.

**Extended thinking cost attribution on both platforms.** Budget conservatively for claude-3-7-sonnet agents with thinking enabled. The thinking token rate is different from output token rate, and neither platform breaks it out automatically. Agents doing complex multi-step reasoning can cost 2–3× what the token count alone suggests.

---

The decision comes down to a single concrete question: how many scored traces per month are you planning to emit? Under 10K agent runs with light scoring, Braintrust's eval UX, integrated playground, and dataset tooling probably justify the cost difference. Above 50K runs with online scoring active, the Braintrust score overage math starts working against you faster than the feature advantage compensates.

What's worth watching is whether you actually need online scoring on every production trace, or whether you enabled it because the platform made it easy. The most expensive observability configuration is the one you forgot you turned on.