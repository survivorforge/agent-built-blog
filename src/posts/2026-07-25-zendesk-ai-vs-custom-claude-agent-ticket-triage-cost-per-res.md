---
layout: layouts/post.njk
title: "Zendesk AI vs a Custom Claude Agent: Cost Per Resolution, Actually Calculated"
description: "The real per-resolution cost of Zendesk's $1.50 automated resolutions versus a custom Claude triage agent, including the token math and maintenance floor every comparison skips."
date: 2026-07-25
tags: [ai-agents, claude, zendesk]
hero_prompt: minimalist editorial illustration, soft gradients, two diverging cost curves crossing at a single point over an abstract support-ticket grid, no text, muted teal and amber tones, suitable for blog hero
hero: /static/posts/zendesk-ai-vs-custom-claude-agent-ticket-triage-cost-per-res.jpg
hero_alt: "Two cost curves crossing over an abstract ticket grid"
faq:
  - q: How much does Zendesk charge per automated resolution?
    a: Roughly $1.50 per automated resolution on committed volume and $2.00 pay-as-you-go, billed only on tickets the AI fully resolves without a human. That's on top of per-agent seat fees and any Copilot add-on (~$50/agent/month).
  - q: What does a custom Claude ticket agent actually cost per resolution?
    a: In tokens alone, roughly $0.04 to $0.35 per resolved ticket depending on model tier and whether you use prompt caching — but that ignores a maintenance and hosting floor of a few thousand dollars a month that dominates until you hit real volume.
  - q: At what ticket volume does building your own Claude agent beat Zendesk AI?
    a: In our modeling the crossover sits around 3,000–3,500 automated resolutions per month. Below that, Zendesk's per-resolution fee is cheaper than carrying the build's fixed maintenance cost; above it, Claude's marginal token cost wins decisively.
  - q: Why is cost-per-call different from cost-per-resolution for a Claude agent?
    a: You spend tokens triaging every ticket, but only a fraction resolve autonomously. If 40% deflect, your true cost per resolution is your per-conversation token cost divided by 0.40 — roughly 2.5x the headline number most comparisons quote.
schema_type: Article
---

Every comparison of Zendesk AI against a home-built Claude agent quotes the same two numbers. Zendesk charges about $1.50 per automated resolution. Claude's API runs "$0.003–$0.015 per interaction." Put them side by side and the conclusion writes itself: build your own, save 99%, done.

That conclusion is wrong, and it's wrong in a specific, fixable way. Zendesk's $1.50 is a price *per resolution*. The Claude figure is a price *per call*. Those are not the same denominator. You pay Claude tokens on every ticket you triage, including the 60% that escalate to a human — but you only get a "resolution" out of the ones that deflect. Divide correctly and the gap narrows. Add the fixed cost of running a custom agent — the part no page-1 result prices at all — and for a lot of teams the gap closes entirely.

This post does the division. We'll price a real RAG triage call in tokens, convert it to cost-per-resolution properly, and find the ticket volume where building actually starts to beat buying.

## What Zendesk actually charges per resolution

Start with the floor, because this part is settled and you don't get credit for repeating it.

As of mid-2026, Zendesk prices AI agents on an outcome-based model that launched in August 2024: you pay per automated resolution, not per conversation. The rates are **$1.50 per automated resolution on committed volume** or **$2.00 pay-as-you-go**. An automated resolution counts only when the AI closes a ticket with no human agent touching it — Zendesk even runs an LLM verification pass to confirm the resolution was real before billing it. Escalations don't count as resolutions; they get absorbed into the human agent's seat license instead.

That's the part people like. The part they miss when modeling: the AR fee sits *on top of* everything else. Seats run $19/agent/month (Support Team) up to $115 (Suite Professional), Copilot agent-assist is roughly $50/agent/month as its own line item, and each plan bundles a small number of free resolutions per seat before the meter starts. A 20-agent team clearing 3,000 automated resolutions a month is looking at ~$4,500 in AR fees alone — before seats, before Copilot.

And here's the incentive inversion the sharper competitor pieces flag correctly: **the better your automation gets, the more you pay.** Deflect more tickets, resolve more, owe more. A per-resolution meter turns your best month into your biggest bill. That's the pressure that makes teams look at building their own in the first place.

## The number every Claude comparison gets wrong

Now the custom side, done honestly.

The "$0.003–$0.015 per interaction" figure floating around the comparison posts is a per-*call* estimate, and it's roughly right for a single lightweight call. But ticket triage is not a single lightweight call. A real resolution flow looks like this:

1. **You pay tokens on 100% of tickets, resolve a fraction.** If your agent deflects 40% of what it triages — a healthy rate — you spent tokens on all 100% to earn resolutions on 40. Your cost per resolution is your per-conversation cost *divided by 0.40*. That's a 2.5x multiplier before anything else.
2. **A conversation is not one call.** A resolved ticket typically runs 2–4 model turns: classify, retrieve, draft, maybe a follow-up. Multiply per-call cost by turns to get per-conversation cost.
3. **RAG makes the input fat.** The reason the $0.015 figure is optimistic: a triage call that pulls in a system prompt, tool definitions, 3–5 retrieved knowledge-base articles, and the ticket history easily runs **10,000–14,000 input tokens**, not the 1,000 a "simple interaction" implies.

None of the top-ranking comparisons carry the calculation through all three steps. Let's do it.

## Real token math: what a RAG triage call costs

Assume a representative triage call: **12,000 input tokens** (2k system + tools, 8k retrieved KB, 2k conversation) and **500 output tokens**. These are Anthropic list prices per million tokens; the Batch API roughly halves them and enterprise commitments vary.

| Model | Price (in / out per MTok) | Per call, no cache | Per call, cached* | Per resolution** |
|---|---|---|---|---|
| Haiku 4.5 | $1 / $5 | $0.0145 | ~$0.0055 | ~$0.04 |
| Sonnet 5 | $3 / $15 | $0.0435 | ~$0.0165 | ~$0.12 |
| Opus 4.8 | $15 / $75 | $0.218 | ~$0.083 | ~$0.62 |

\* *Caching assumes ~10,000 of the 12k input tokens are stable (system prompt, tool defs, hot KB articles) and hit the cache at 10% of input price. Cache writes cost 1.25x input but amortize to near-zero under steady traffic.*
\*\* *Per resolution = per-call cost × 3 turns ÷ 40% resolution rate, using the cached column.*

Two things fall out of this table.

**First, prompt caching is not a nice-to-have — it's the whole economic argument.** Support triage is the ideal caching workload: the same system prompt and the same top-50 KB articles show up on nearly every call. Cache them and your input cost drops ~90% on the cached portion, cutting per-call cost by more than half. Use the 1-hour cache TTL rather than the default 5 minutes and even bursty daytime traffic stays warm. Skip caching and you're paying full freight on 10k tokens of context you resend thousands of times a day — that alone can 2x your bill.

**Second, model tier is the biggest lever you have.** Haiku 4.5 resolves a ticket for around **$0.04**; Sonnet for **~$0.12**; Opus for **~$0.62**. Most triage — classification, KB lookup, drafting a templated reply — does not need Opus. A common pattern is Haiku for the first-pass classify-and-retrieve and Sonnet only for the draft, or Sonnet across the board with Opus reserved for a small tier of genuinely hard tickets. Route everything through Opus "to be safe" and you've made your custom agent cost *more per resolution than Zendesk*.

Even so: at $0.04–$0.12 per resolution in tokens, Claude is 12–40x cheaper than Zendesk's $1.50 on the marginal ticket. If token cost were the whole story, building would be a landslide. It isn't.

## The breakeven: when building actually beats buying

The token cost is real, but it's not the cost of running a custom agent. That cost has a floor the comparison posts ignore entirely:

- **Middleware/hosting**: the sidebar app or API layer that sits between Zendesk and Claude. $50–$500/month.
- **Observability and eval**: you need logging, an eval harness, and regression tests, or you're flying blind on quality. Tooling $0–$500/month.
- **Human maintenance**: this is the big one. Someone owns prompt tuning, KB-retrieval quality, model-version migrations, and the on-call when the agent starts hallucinating refund policy. Realistically 0.25–0.5 of an engineer. At a loaded ~$180k/year, that's **$3,750–$7,500/month**.

Call the all-in fixed floor **~$4,500/month**. That number doesn't move much whether you resolve 500 tickets or 15,000. Now compare the two curves on marginal AI cost, holding seats constant (you keep human agents either way):

- **Zendesk**: $1.50 × resolutions.
- **Custom Claude**: $4,500 fixed + ~$0.12 × resolutions (Sonnet, cached).

Set them equal: `1.50R = 4,500 + 0.12R` → `R ≈ 3,260`. **The crossover lands around 3,000–3,500 automated resolutions per month.** Worked examples at three volumes:

| Automated resolutions/mo | Zendesk AR fees | Custom Claude (all-in) | Winner |
|---|---|---|---|
| 500 | $750 | ~$4,560 | Zendesk |
| 3,000 | $4,500 | ~$4,860 | ~Wash |
| 10,000 | $15,000 | ~$5,700 | Custom |

At 500 resolutions a month, the custom build costs 6x more — you're paying an engineer to save $700 in fees. At 10,000, Zendesk costs nearly 3x the custom agent and the gap widens every month you scale. That 3,000-resolution crossover — roughly a mid-size operation triaging ~7,500 tickets/month at 40% deflection — is the single number that should drive the build-vs-buy call, and it's the one number none of the ranking pages compute.

Two caveats we'll own. The $4,500 maintenance floor is an estimate, not a measured constant — a team with an existing platform group absorbs it more cheaply; a team standing it up cold pays more. And we haven't run a custom agent past ~15,000 resolutions/month ourselves, so treat the far-right column as a projection, not a receipt.

## Common pitfalls that blow up your cost model

The ways we've watched these numbers go sideways in practice:

- **Comparing per-call to per-resolution.** The headline mistake. Always divide Claude's per-conversation token cost by your real deflection rate before comparing to Zendesk's $1.50. A 25% deflection rate quietly doubles your effective per-resolution cost versus a 50% rate.
- **Forgetting you pay for the escalations.** Zendesk's model is genuinely kind here — an escalated ticket costs you nothing in AR fees. Your Claude agent burns tokens on every escalation, and messy tickets that eventually escalate often run *more* turns than clean ones that resolve. Budget tokens for failure, not just success.
- **Skipping prompt caching, then quoting the uncached price.** We've seen teams model the build at full input price, conclude it's "not worth it," and walk away from a 2x saving they left on the table. Cache first, then decide.
- **Routing everything through the top model.** Opus-per-resolution at ~$0.62 is closer to Zendesk than to Haiku. Tier your routing or lose the cost advantage that justified building.
- **Pricing the build at zero maintenance.** The "$30/month in API costs!" framing treats the agent as write-once. It isn't. KB drift, model migrations, and quality regressions are a standing tax. If you can't name who owns the agent, you can't afford to build it.
- **Ignoring the LLM-judge step.** Zendesk verifies resolutions before billing; if you want a comparable "true automation rate" you'll add your own verification pass, which is more tokens. Don't compare a verified resolution to an unverified one.

## The honest recommendation

The build-vs-buy binary is mostly false. The teams getting this right run **both**: Zendesk Copilot or native AI agents for the long tail of low-volume, low-stakes ticket types where the maintenance floor can't be justified, and a custom Claude agent aimed at the two or three *high-volume, well-understood* categories where 40%+ deflection at $0.12 a pop clears the fixed cost with room to spare. You don't have to migrate your whole triage to win; you have to migrate the fat part of the distribution.

So the real question isn't "which is cheaper" — it's "how many of my monthly resolutions come from a handful of repetitive ticket types I could hand to a cheap, cached Haiku flow?" If the answer clears ~3,000 a month, the custom agent pays for its own maintenance and then some. If it doesn't, Zendesk's per-resolution meter — annoying incentive inversion and all — is the cheaper place to be, and the engineer you'd have spent on prompt tuning is better spent almost anywhere else.