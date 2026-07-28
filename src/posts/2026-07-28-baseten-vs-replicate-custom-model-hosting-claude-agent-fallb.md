---
layout: layouts/post.njk
title: "Baseten vs Replicate as a Claude Agent Fallback: The Cost Math Nobody Runs"
description: "How to price a self-hosted fallback for a Claude agent — replica-hour vs per-second billing, warm-idle cost, and when a fallback earns its keep."
date: 2026-07-28
tags: [claude, scaling, integrations]
hero_prompt: minimalist editorial illustration, soft gradients, two abstract compute nodes flanking a central routing junction with one dim standby path, muted teal and amber tones, no text, suitable for blog hero
hero: /static/posts/baseten-vs-replicate-custom-model-hosting-claude-agent-fallb.jpg
hero_alt: "Abstract diagram of a primary model path with a dim standby fallback route"
faq:
  - q: Is Baseten or Replicate cheaper for a Claude agent fallback?
    a: For a fallback that must respond instantly, Baseten's per-replica-minute billing on a warm instance and Replicate's per-second billing on a warm deployment cost roughly the same — you're paying for an idle GPU either way. Replicate wins if you can tolerate cold starts and traffic is truly rare; Baseten wins on cold-start speed if you keep it scaled to zero.
  - q: Do I even need a self-hosted fallback if I'm using Claude?
    a: Usually not. The cheapest, fastest fallback for a Claude agent is another Claude model — Opus falls back to Sonnet or Haiku on rate-limit or overload errors. Self-hosting only earns its cost when you have data-residency rules, sustained volume, or a hard requirement to survive an Anthropic-wide outage.
  - q: How much does it cost to keep a warm GPU fallback running?
    a: A single warm A100-80GB replica runs roughly $2,900–$3,600/month at mid-2026 list rates whether or not it serves a single request. That idle cost, not the per-request price, is what decides whether a self-hosted fallback makes sense.
  - q: Why do cold starts break a fallback?
    a: A fallback fires exactly when your primary path is failing — usually during a traffic spike or an outage. A model that scales to zero can take 30–120 seconds to load weights on that first request, so it's slowest precisely when demand is highest.
schema_type: Article
---

Every "Baseten alternatives" roundup on page one answers a question you probably aren't asking. They compare Baseten and Replicate as if you're choosing a *primary* home for a model that serves steady production traffic. The pricing tables assume a replica that's busy. The cold-start warnings assume you can either eat the latency or pay to keep things warm, and move on.

None of that maps to what you're actually building if you typed this query: you run a Claude agent, and you want a custom or open model sitting behind it as a fallback — for when Anthropic rate-limits you, when Opus is overloaded, when a compliance rule says certain data can't leave your boundary, or when you just want an escape hatch that isn't a single vendor's status page. Fallback traffic is bursty, rare, and unpredictable. It's the opposite of the steady stream every comparison table is priced against. That inverts the whole calculus, and the listicles don't run it.

So let's run it. What follows is the cost model for using Baseten or Replicate as the bottom tier of a Claude agent's fallback chain — including the number that usually kills the idea, and the two cases where it doesn't.

## What "fallback" actually means for a Claude agent

Before you price any GPU, get the hierarchy right, because most of what people call a "fallback" never touches a custom model.

A production Claude agent that cares about resilience has three tiers, and they fire in order:

1. **Claude → Claude.** Opus 4.8 gets a `429` or an `overloaded_error`, you retry on Sonnet 4.6, then Haiku 4.5. This handles the overwhelming majority of transient failures. It's a few lines of routing logic, it costs nothing to keep "warm," and the quality floor is still a frontier model. At list price that's Opus at $5/$25 per million input/output tokens, Sonnet at $3/$15, Haiku at $1/$5 — so falling back is often *cheaper* per call, not more expensive.
2. **Claude → your own hosted model.** This tier only exists for failures the first tier can't fix: an Anthropic-wide outage, a sustained rate-limit ceiling you keep hitting, or a request whose data legally can't go to a third-party API. This is where Baseten and Replicate enter.
3. **Degrade gracefully.** Queue the request, return a cached answer, or tell the user to try later.

The trap in every comparison you've read is that it treats tier two as if it were tier one. If your goal is resilience against *transient* Claude errors, you don't need a GPU at all — you need retry logic. Self-hosting is worth its cost only when tier one genuinely can't save you. That narrows the field to three real reasons: outage independence, a rate-limit ceiling you routinely hit, and data residency. If none of those apply to you, stop here; you'll spend thousands to solve a problem `try/except` already solved.

If one of them *does* apply, the question becomes: Baseten or Replicate, and what does it actually cost?

## Baseten vs Replicate: the billing models, translated to fallback traffic

The two platforms bill on fundamentally different axes, and that difference matters far more for bursty fallback traffic than for steady serving.

- **Baseten** bills per **replica-minute**. A replica is a running copy of your model on a GPU. It costs money for every minute it's alive, whether it serves one request or ten thousand. It can scale to zero when idle, at the cost of a cold start on the next request.
- **Replicate** bills per **GPU-second** of actual compute. A custom deployment can also scale to zero, or you can pin a minimum number of instances to stay warm — which, once pinned, is effectively continuous billing again.

Here's the comparison that's actually relevant to a fallback — rare traffic, latency that matters when it fires — rather than the generic feature grid:

| Dimension | Baseten | Replicate |
|---|---|---|
| Billing axis | Per replica-minute | Per GPU-second |
| A100-80GB list rate (mid-2026, approx.) | ~$0.008/min (~$4.80/hr) | ~$0.0014/sec (~$5.04/hr) |
| Scale to zero | Yes | Yes (custom deployments) |
| Cold start, 13B-class model | ~20–60s | ~1–5 min (weights load on boot) |
| Cost of one warm replica, 24/7 | ~$3,500/mo | ~$3,600/mo if min-instances ≥ 1 |
| Best when fallback is… | Rare but latency-sensitive; cold-start speed matters | Truly rare and latency-tolerant, or steady enough to justify a pinned warm instance |
| Packaging | Truss (Baseten-specific) | Cog / container |

Prices are list rates as of mid-2026 and move with GPU supply; treat the table as a shape, not a quote. Confirm live rates before you commit — both platforms adjust them, and committed-use or self-hosted arrangements change the picture again.

The headline most articles stop at — "Replicate is per-second, Baseten is per-replica-hour, so Replicate is cheaper" — is true only when your GPU is *idle most of the time and you let it scale to zero*. That's the good case for a fallback. But it comes bundled with the exact failure mode a fallback can't afford, which is the next section.

Notice what the table also shows: on a *warm* GPU, the two are within a few percent of each other. The per-second-vs-per-minute distinction nearly vanishes once the instance is pinned. So the real decision isn't Baseten vs Replicate on unit price. It's whether you keep the fallback warm at all.

## The number that decides it: what a warm fallback costs to keep alive

Here is the calculation none of the page-one results put in front of you, and it's the one that matters most.

A single warm A100-80GB replica, doing nothing, costs roughly **$2,900 to $3,600 a month** at mid-2026 list rates. Two replicas for redundancy — which is what "production fallback" usually implies, because a single-replica fallback has its own single point of failure — is **$6,000–$7,000 a month**. That's the floor. It's what you pay before a single fallback request arrives, and the entire point of a fallback is that most months, none does.

Now compare that to the thing it's replacing. A Claude → Haiku fallback costs *nothing* to keep ready. Haiku at $1/$5 per million tokens only bills when it actually serves a request, and it's a capable model. So the break-even question for a self-hosted fallback isn't "is it cheaper per request than Claude?" It's:

> Does the value of surviving an Anthropic outage — or meeting a data-residency requirement — exceed ~$3,000/month of idle GPU, every month, forever?

For most teams the honest answer is no. Anthropic's API has real uptime; the expected annual cost of outage minutes you'd actually lose is usually far below $36,000/year. If your agent isn't load-bearing revenue infrastructure, a warm self-hosted fallback is insurance priced higher than the risk.

The two cases where the math flips:

- **You have a rate-limit ceiling you hit routinely.** If you're bumping your Anthropic tier limits during normal peaks — not during outages, during *Tuesdays* — then your "fallback" isn't idle. It's serving real overflow traffic every day, which means the GPU is busy and the idle-cost objection disappears. At that point you're not pricing insurance, you're pricing a second serving tier, and per-second Replicate billing or a well-utilized Baseten replica both pencil out.
- **Data residency is a hard requirement.** If certain requests legally cannot go to a third-party API, there's no Claude tier that satisfies the rule. The cost is the cost of compliance, and the comparison shrinks to "which platform, self-hosted, is cheapest" — where the bare-metal and per-second providers the roundups list (Runpod, Modal, Spheron) genuinely undercut both Baseten and Replicate's managed markup.

## Cold starts: why a scale-to-zero fallback fails exactly when you need it

If you're tempted to dodge the $3,000/month by letting the fallback scale to zero — smart instinct, wrong for this workload — understand what you're trading.

A fallback fires under one of two conditions: a spike that blows past your Claude limits, or an outage that redirects your *entire* load onto it at once. Both are high-traffic moments. A model that scaled to zero has to load its weights on that first request — 20 to 60 seconds on Baseten for a mid-sized model, potentially several minutes on Replicate if the container has to pull and boot a large image. Meanwhile requests are piling up behind it. Your fallback is slowest at the precise instant demand is highest, and if you're autoscaling from zero under a thundering herd, every new replica pays that cold-start tax again.

This is the structural bind, and it's why "just scale to zero" isn't a free lunch for fallbacks specifically:

- **Scale to zero** → ~$0/month idle, but 30–120s of dead air when it fires. Fine for a batch fallback, useless for an interactive agent.
- **Keep it warm** → instant response, but you're back to ~$3,000+/month for a GPU that mostly idles.

There's no third option that gives you both. Baseten markets fast cold starts and genuinely is better than most at it, but "better" here is 20 seconds instead of 90 — still an eternity for a user waiting on an agent mid-task. If your fallback needs to be interactive and instant, budget for warm. If it can be a degraded, slower path — "we're at reduced capacity, this may take a moment" — then scale-to-zero on either platform is fine, and Replicate's per-second billing makes it close to free.

## Common pitfalls

Things that bite teams building this, learned the expensive way:

- **Pricing per-request instead of per-idle-hour.** The listicles quote per-token or per-second rates because that's what looks cheap. For a fallback, the per-request cost is a rounding error — the idle-warm cost is the entire bill. If your cost model is denominated in tokens, you've modeled the wrong thing.
- **A single-replica "fallback" that shares your failure.** One warm replica in one region isn't redundancy — it's a second single point of failure that also happens to cost $3,000/month. Real fallback redundancy doubles the idle bill, which usually pushes teams back toward the Claude-to-Claude tier they should've used first.
- **Truss lock-in you didn't price.** Baseten's Truss packaging is pleasant, but it's Baseten-specific. If you later want to move the fallback to raw vLLM on a cheaper bare-metal provider, that's a rewrite. Not hard, but it's a switching cost teams consistently underestimate. Replicate's Cog is closer to a standard container, though still its own format.
- **Assuming the self-hosted model matches Claude's quality.** Your fallback is a 13B–70B open model, not Opus. When it fires, output quality drops. If your agent's prompts and tool-calling are tuned tightly to Claude, they may not transfer cleanly. Test the fallback path under real load *before* you rely on it, or you'll discover the quality cliff during the outage it was supposed to cover.
- **Forgetting async fallbacks don't store output on Baseten.** Baseten's async inference is by design fire-and-forget — it doesn't persist results, so you're wiring up webhooks that, as one reviewer put it bluntly, "fail all the time." For a fallback you want the result guaranteed captured; plan the storage layer yourself.

## The honest recommendation

For most teams shipping Claude agents in 2026, the right fallback is another Claude model, and the second-best is degrading gracefully. A self-hosted custom model behind Baseten or Replicate is the correct answer to exactly three problems — outage independence you can quantify, a daily rate-limit ceiling, or data residency — and it's an expensive wrong answer to everything else. The idle-GPU cost, not the per-request price, is what should drive the decision, and no comparison table that treats this like primary serving will tell you that.

If you're in one of the three cases: Baseten if the fallback must be warm and fast, and cold-start speed is your priority; Replicate if it can tolerate latency and fire rarely, where per-second billing on a scaled-to-zero deployment is nearly free; and if it's data residency specifically, look past both to the bare-metal providers, because you're paying for compliance, not convenience, and the managed markup buys you nothing you need. The open question we're still sitting with: as Anthropic's tier limits keep rising and Haiku keeps getting cheaper, the window where a self-hosted fallback beats simply falling back to a smaller Claude model is narrowing every quarter. Price it again in six months — the answer may have moved.