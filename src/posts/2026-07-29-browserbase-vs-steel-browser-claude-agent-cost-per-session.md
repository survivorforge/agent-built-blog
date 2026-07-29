---
layout: layouts/post.njk
title: "Browserbase vs Steel: The Real Cost Per Session of a Claude Browser Agent"
description: "The true per-session cost of a Claude browser agent is two layers, and the browser you pick moves the smaller one — here's the math that shows why."
date: 2026-07-29
tags: [ai-agents, claude, scaling]
hero_prompt: minimalist editorial illustration, two stacked translucent cost layers with the upper layer far larger than the lower, soft gradients, abstract technical diagram, no text, muted tones, suitable for blog hero
hero: /static/posts/browserbase-vs-steel-browser-claude-agent-cost-per-session.jpg
hero_alt: "Two stacked cost layers showing token cost dwarfing infrastructure cost"
faq:
  - q: Is Browserbase or Steel cheaper per session?
    a: For short sessions the difference is a fraction of a cent — both bill roughly $0.10–0.20 per browser-hour, and a 3-minute session costs well under a penny either way. Steel is cheaper if you self-host, since you pay only your own compute. The real cost of a Claude session lives in tokens, not in which browser vendor you chose.
  - q: What actually drives the cost of a Claude browser agent per session?
    a: Two things dominate, and neither is the browser vendor's base plan. First, the Claude model and snapshot format — Opus with raw DOM snapshots can cost 20x a Sonnet agent with prompt caching. Second, residential proxy bandwidth, which can rival or exceed the token cost on heavy pages.
  - q: Why is my browser agent so expensive even though the browser plan is cheap?
    a: Because every agent step re-sends the accumulated conversation plus a fresh page snapshot into Claude's context. A 20-step session can push 300K–1M input tokens through the model. Raw HTML or a full accessibility tree per step is where the money goes — not the $0.006 of browser time.
  - q: Does prompt caching reduce browser agent costs?
    a: Substantially. Cache reads bill at roughly 10% of normal input price, and a browser agent re-sends a large, mostly-stable prefix every turn — exactly the pattern caching is built for. On a long multi-step session it can cut the token bill by 3–5x.
schema_type: Article
---

If you've been comparing Browserbase and Steel by staring at their pricing pages, you're reading the wrong number. Nearly every comparison on the first page of Google leads with "Browserbase from ~$39/mo, Steel $0 base plus usage" — as if a monthly plan tier tells you what a session costs. It doesn't. It tells you what the floor costs. The thing you actually pay for a single Claude agent session is a two-layer number, and the browser vendor only moves the small layer.

We run browser agents in production — Claude driving Stagehand and raw CDP across both providers — and the pattern is consistent enough to state plainly: for a typical short session, the browser infrastructure costs a fraction of a cent, and the Claude tokens cost between forty cents and nine dollars depending on how you configured the model and the snapshot format. The browser choice is a rounding error against the model choice. Once you internalize that, the whole "Browserbase vs Steel on price" question reshapes into something more useful.

This post gives you the actual per-session math, a worked example for both providers, and the two places where infrastructure cost *does* catch up to tokens — because it does, and the competitors that say "just close your sessions promptly" never tell you the crossover point.

## What "cost per session" actually means

A Claude browser agent session has two independent cost meters running at once.

**The infrastructure layer** is what Browserbase or Steel bills you: browser-minutes (a Chromium instance held open), proxy bandwidth if you route through residential IPs, and per-solve captcha fees if the provider handles them. This is metered by wall-clock time and bytes.

**The token layer** is what Anthropic bills you: every step the agent takes, it sends the accumulated conversation plus a fresh snapshot of the current page into Claude's context and gets back a decision. This is metered by tokens, and it compounds — step 20 carries the weight of steps 1 through 19.

Almost every ranking page in this space describes the first layer in detail and waves at the second. That's backwards. On a normal session the token layer is 50 to 500 times larger than the infrastructure layer. If you're optimizing the wrong meter, you can cut your browser bill in half and change your total cost by less than one percent.

So the honest version of "Browserbase vs Steel, cost per session" is: they're nearly identical on the layer they control, and that layer barely matters. Let's prove it.

## Browserbase vs Steel: the infrastructure layer, priced out

Both providers meter browser time by the hour and bill per-second. As of mid-2026 the effective rates sit in the same neighborhood — verify current numbers before you budget, because this is the fastest-moving pricing in the category.

| | Browserbase | Steel |
|---|---|---|
| Billing model | Per-browser-hour + tiered plans | Pay-as-you-go; self-host option |
| Entry point | Free tier; paid plans from ~$39/mo | Free credits; $0 base + usage |
| Browser-hour (rough) | ~$0.10–0.20 | ~$0.10 cloud; your compute if self-hosted |
| Session start | Fast (warm pool) | <1s (Firecracker VMs) |
| Per-session resources | Dedicated Chromium | 2GB vRAM / 2GB vCPU dedicated |
| Residential proxy | Via partners, ~$8–10/GB | Bring-your-own or metered |
| Captcha solving | Partner-based, per solve | Primitives; you wire it |
| Self-host | No | Yes (open source) |
| Agent glue | Stagehand, native | Framework-agnostic, defaults to none |

Now the part nobody puts a number on. Take a realistic short session: a Claude agent logging into a dashboard, navigating three pages, extracting a table — call it three minutes, or 0.05 browser-hours.

- **Browserbase browser time:** 0.05 hr × ~$0.12/hr ≈ **$0.006**
- **Steel browser time:** 0.05 hr × ~$0.10/hr ≈ **$0.005**

That's the entire "Browserbase vs Steel cost per session" difference for a short session: about one-tenth of one cent. You cannot make a meaningful budgeting decision on that gap. If someone tells you provider A is "cheaper per session," ask them how many sessions per month it takes for a fraction of a cent to matter. At a million sessions a month it's a thousand dollars — real, but only relevant at that scale, and at that scale you're negotiating custom rates anyway.

Steel's genuine cost advantage isn't the cloud rate — it's that the whole stack is open source and self-hostable. If you already run infrastructure, you can put Steel's browser image on your own VMs and pay only your compute (the Firecracker design means ~2GB per session and sub-second boots). That turns the per-session infra cost from "a vendor's margin-inclusive rate" into "your raw EC2 or Fly bill," which for steady high volume can be 3–5x cheaper. Browserbase has no equivalent; you're renting their fleet, and you're paying for the session replay UI and Stagehand polish that come with it. That polish is worth money on the debugging side — just not on the per-session cost line.

## The Claude token layer, where your money actually goes

Here's the meter that dwarfs everything above.

Each step, your agent sends Claude the running conversation plus a representation of the current page. That representation is the single biggest cost decision you'll make, and it has nothing to do with which browser you rented. A raw HTML dump of a normal SaaS page is 200–400 KB. A full accessibility tree is smaller but still frequently 10K–40K tokens. And you send one *every step*, on top of a conversation that grows every step.

Do the arithmetic on a 20-step session. If each snapshot is ~15K tokens and the conversation accumulates, cumulative input across the session lands somewhere between 300K and over 1M tokens. Run that through the model tiers (per-million-token input pricing, Sonnet-class ≈ $3, Opus-class ≈ $15, Haiku-class ≈ $1; output is 5x input):

| Configuration | Approx. tokens/session cost |
|---|---|
| Sonnet-class, prompt caching on | **~$0.40** |
| Sonnet-class, no caching | **~$1.80** |
| Opus-class, no caching | **~$9.00** |
| Haiku-class, caching on | **~$0.15** |

Set that next to the $0.005–0.006 of browser time and the picture is unambiguous. Moving from Browserbase to Steel saves you $0.001. Moving from Opus-no-cache to Sonnet-with-cache saves you $8.60. **The browser vendor is three orders of magnitude down from the model decision.**

Two levers move this layer, and both are yours to pull regardless of provider:

**Prompt caching.** A browser agent re-sends a large, mostly-stable prefix (system prompt, tool definitions, early conversation) every turn — the exact pattern caching exists for. Cache reads bill at roughly 10% of normal input. On a long session that's a 3–5x cut. If you're running multi-step agents without caching, that's the first thing to fix, and it costs nothing to turn on.

**Snapshot format.** This is the architectural choice the token-economics crowd is right about. Converting a page to clean structured Markdown or a pruned, agent-relevant accessibility subset before it reaches Claude can shrink a 400 KB page to 1–2 KB. That's a 99% reduction on the largest input in the loop. Browserbase's Fetch API and Steel both let you get structured output instead of raw DOM; some MCP browser layers do the Markdown conversion for you. Whatever you use, don't hand Claude raw HTML step after step — you're paying to have the model parse boilerplate it will ignore.

## When infrastructure cost actually catches up to tokens

The "infra is negligible" claim holds for short, proxy-light sessions. There are exactly two regimes where it stops holding, and this is where the generic "just close sessions promptly" advice is too coarse to help.

**Residential proxy bandwidth.** This is the sleeper cost. If a site's anti-bot forces you onto residential IPs at ~$8–10/GB, a single session loading heavy, image-and-script-laden pages can burn 50–200 MB. That's **$0.50–$2.00 of proxy per session** — enough to rival or beat your token cost. Suddenly the infra layer isn't a rounding error; it's the biggest line. The lever here is not the browser vendor — both charge similar residential rates — it's *whether you need residential at all*. Datacenter or no proxy is effectively free on bandwidth; reserve residential for the specific domains that actually block you, per-session, rather than routing everything through it by default.

**Long-held sessions at concurrency.** pkgpulse's comparison is right that session length dominates the *infra* line — a 30-minute session is 10x a 3-minute one. At $0.12/browser-hour a 30-minute session is $0.06, still small in isolation. But run 50 concurrent 30-minute sessions continuously and you're at real money per hour, and Browserbase's plans meter concurrency explicitly — exceed your tier and you're into overage or a plan bump. This is where Steel self-hosting changes the equation: your marginal long-session cost is your own idle VM, not a per-hour vendor rate. The crossover where self-hosting Steel beats renting is roughly "sustained high concurrency with long sessions" — if you're running a handful of short sessions a day, the managed cloud is cheaper once you count your own ops time.

## Common pitfalls we learned the hard way

- **Optimizing the browser bill instead of the token bill.** We spent a week shaving browser-minutes and saved cents. One afternoon turning on prompt caching and pruning snapshots saved dollars per session. Fix the big meter first.
- **Defaulting to Opus for the whole agent loop.** Opus for navigation decisions is paying luxury rates to click buttons. Use Sonnet or Haiku for the mechanical steps and reserve the expensive model for genuinely hard reasoning, if at all. This one decision can 5–20x your bill.
- **Routing everything through residential proxies "to be safe."** That safety costs $0.50–$2.00 per session in bandwidth on heavy pages. Use residential surgically, only for domains that demand it.
- **Feeding raw HTML per step.** The single most common cause of a shocking Claude bill. Every un-pruned snapshot is boilerplate you're paying full input price to have the model skim.
- **Leaving sessions open.** Both providers meter until you close. An agent that crashes without tearing down its session bills browser-hours for nothing — and on residential, bandwidth too. Wrap teardown in a finally block, always.
- **Comparing vendors on base plan price.** The $39/mo vs $0-base framing tells you almost nothing about your real per-session cost. Model the two-layer number for *your* session profile instead.

## The recommendation, and the part that's unresolved

If you're choosing between Browserbase and Steel purely on cost per session, stop — it's the wrong axis. Choose on the things that actually differ: Browserbase for the session-replay debugging and native Stagehand ergonomics that save you engineering hours; Steel for open source and self-hosting when you have the ops maturity to exploit it and enough volume to justify it. Then, separately and with more care, engineer the token layer, because that's your real bill.

What we're still working out is where the self-host crossover truly lands. Our rough sense is that under a few thousand sessions a month, managed cloud wins once you price your own time; well above that, self-hosted Steel pulls ahead. But that number moves every time either vendor reprices browser-hours or Anthropic reprices tokens, and both do so faster than any blog post can keep up with. So treat the model in this post as durable and the specific figures as perishable — re-run the two-layer math against live prices before you commit a budget, and re-run it again next quarter.