---
layout: layouts/post.njk
title: "Brave Search API vs Tavily for Claude Agents: The Real Cost Per Query"
description: "Why the $5-vs-$8-per-1,000 comparison every guide quotes is the wrong number for a Claude research agent, and what a research task actually costs once you count tokens."
date: 2026-08-03
tags: [ai-agents, claude, integrations]
hero_prompt: minimalist editorial illustration of two stacked cost bars where a small search-fee segment sits under a much larger token segment, soft gradients, abstract technical diagram, no text, muted teal and amber tones, suitable for blog hero
hero: /static/posts/brave-search-api-vs-tavily-claude-agent-research-cost-per-qu.jpg
hero_alt: "Abstract cost bars showing search fees dwarfed by token costs"
faq:
  - q: Is the Brave Search API cheaper than Tavily for a Claude agent?
    a: On sticker price yes — Brave is $5 per 1,000 requests versus Tavily's $8 for basic search. But for a real Claude research agent the search fee is the smallest line item; the tokens you spend ingesting results usually cost 3-10x more, and that gap depends on payload size, not API price.
  - q: How much does one Claude research task cost in search fees?
    a: A typical research task fires 5-8 searches, so the raw API cost is roughly $0.03-0.10. The Claude token cost of processing those results in an agentic loop is usually $0.15-0.50 on Sonnet-class pricing, which is where the real money goes.
  - q: Does Claude use Brave Search?
    a: Yes. Anthropic's native web_search tool is Brave-backed. If you call it you pay Anthropic $10 per 1,000 searches plus tokens — roughly a 2x markup over going to Brave directly, in exchange for zero integration work.
  - q: What's the difference between Tavily basic and advanced search cost?
    a: Basic search is 1 credit ($0.008, so $8 per 1,000); advanced search is 2 credits ($16 per 1,000). Advanced also returns far more content, which multiplies your Claude token bill on top of the doubled API fee.
schema_type: Article
---

Every comparison you've read on this frames the decision as $5 versus $8. Brave Search API is $5 per 1,000 requests; Tavily basic search is one credit at $0.008, so $8 per 1,000. Brave benchmarks about a point higher on relevance and returns in 669ms. Case closed, pick Brave, done.

That's the right answer to the wrong question. The number that matters for a Claude research agent isn't the per-query search fee — it's the total cost of a research *task*, and in that number the search API is the cheapest thing on the invoice. We've been running both under Claude agents for production research workloads, and the search fee is routinely 10-20% of what a single deep-research call actually costs. The other 80% is tokens: what you pay Anthropic to read the search results back into the model, over and over, as the agent loops.

None of the page-1 guides model that. They compare sticker prices per 1,000 requests as if a research task were one request. It isn't. So here's the comparison nobody publishes: what one Claude research task costs end to end, why the "cheaper" API can be the more expensive one, and the third option most people building on Claude don't realize they already have.

## The sticker prices — and why they're the small number

Let's get the floor out of the way, since every competitor covers it and you don't need us to repeat it at length:

| Provider | Bare search | Search + full content | Free tier | Index |
|---|---|---|---|---|
| **Brave Search API** | $5 / 1,000 | ~$7 / 1,000 (with contents) | $5 credits/month | Own index, 30B+ pages |
| **Tavily** | $8 / 1,000 (basic, 1 credit) | $16 / 1,000 (advanced, 2 credits) | 1,000 credits/month | Aggregated (Google-adjacent, reordered) |
| **Anthropic `web_search`** | $10 / 1,000 + tokens | n/a (managed) | none | Brave-backed |

Prices current as of August 2026. Tavily was being acquired by Nebius as of February 2026, so treat its roadmap and pricing as subject to change; Brave runs its own index, which is the main reason it's the backend behind Claude's own web search.

Now the part the tables leave out. A Claude research agent doesn't fire one search. It searches for background, finds sources, verifies claims across follow-up queries, then synthesizes — five to eight search calls for a moderately deep task is normal, and we've seen deep-research loops fire fifteen or more. At Brave's $5/1,000 that's $0.025-$0.075 in API fees for the whole task. At Tavily basic, $0.04-$0.12. That difference — three or four cents per research task — is real, but it is nowhere near the largest cost. The largest cost is what happens to the results after they come back.

## What a research task actually costs once you count tokens

Every result a search API returns gets appended to the agent's context and fed into Claude as input tokens. In an agentic loop, prior tool results *stay* in context and get re-read on every subsequent turn. So the token cost isn't linear in the number of searches — it's closer to quadratic, because turn six re-reads the results from turns one through five.

This is the mechanism that inverts the sticker-price ranking. Brave's default response is lean snippets — maybe 1,000-1,500 tokens per search. Tavily's advanced search returns full extracted page content — 5,000-8,000 tokens per search — and its basic mode hands back a synthesized answer that can be tighter than Brave's snippets. What you feed the model matters more than what you paid the API.

Here's our model of a 6-search research loop, priced on Sonnet-class tokens ($3/M input, $15/M output). We assume ~3k tokens of system prompt and reasoning per turn, ~1k output tokens per turn, and vary only the size of each search payload. These are estimates from our own runs, not a published benchmark — your payload sizes will differ, so treat the ratios as the point, not the decimals:

| Configuration | Payload/search | API fee | Token cost | **Total/task** |
|---|---|---|---|---|
| Brave, bare snippets | ~1.2k tok | $0.03 | ~$0.20 | **~$0.23** |
| Tavily basic, answer-only | ~0.6k tok | $0.05 | ~$0.17 | **~$0.22** |
| Brave + full content fetch | ~5k tok | $0.05 | ~$0.42 | **~$0.47** |
| Tavily advanced, full content | ~6k tok | $0.10 | ~$0.44 | **~$0.54** |

Read that top to bottom and the whole "which is cheaper" question dissolves. Brave-bare and Tavily-answer-only land within a penny of each other, because the token bill dominates and both keep payloads small — Brave's $3/task API advantage is almost entirely eaten by Tavily's leaner default answer format. Meanwhile Tavily *advanced* is the most expensive option on the board despite a reasonable-looking sticker, because you doubled the credit cost **and** tripled the tokens. The API-fee column, the one every comparison ranks on, spans three cents. The total column spans thirty.

Scale that up. On Opus ($15/M input, $75/M output) every token figure multiplies by five, and the search fee becomes a rounding error — a Tavily-advanced deep-research task on Opus can clear $2.50, of which maybe eight cents is Tavily. On Haiku 4.5 ($1/M in, $5/M out) the token cost shrinks by two-thirds and the API fee starts to matter again, which is the one regime where "Brave is $3 cheaper per thousand" is a real argument.

## The third option: you might already be paying Brave

Here's what "does Claude use Brave Search" actually means for your bill. Anthropic's native `web_search` tool — the server-side tool you turn on in an API call — is Brave-backed. Anthropic charges $10 per 1,000 searches for it, plus the tokens for results fed into context. That's a roughly 2x markup over calling Brave directly at $5.

So there are really three choices, not two:

1. **Brave direct** ($5/1,000). Cheapest per search, own index, lowest latency, but you write and run the search loop yourself, parse results, decide what to feed back, and manage the context.
2. **Tavily direct** ($8-16/1,000). Built for LLMs, returns synthesized answers and clean extraction, native MCP server, `extract`/`crawl`/`map` tools for when the agent needs to read a full article or map a site — but you're aggregating someone else's index (its results reproduce ~80% of Google's domains but in a reordered, LLM-optimized sequence), and it gets expensive at scale in parallel.
3. **Anthropic `web_search`** ($10/1,000 + tokens). Brave underneath, zero integration, Anthropic manages the loop and citations. You pay double Brave's rate for the convenience of not building anything.

The honest guidance: if you're prototyping a Claude agent and want web search working in ten minutes, turn on `web_search` and pay the markup — at low volume the $5/1,000 you'd save going direct isn't worth an afternoon of plumbing. The moment you're running thousands of research tasks a day, that markup is the first thing to cut, and going direct to Brave halves the search-fee line. Tavily earns its premium specifically when your agent needs extraction and crawling, not just search — its `extract` and `crawl` endpoints are genuinely better than bolting a scraper onto Brave yourself.

## How to cut the token bill (this matters more than the API choice)

Since tokens are the real cost, the biggest lever isn't which API you pick — it's how you handle results. Two techniques change the math more than the Brave/Tavily decision does:

**Cache the tool results.** Prompt caching charges cache reads at roughly 0.1x of base input tokens. In our 6-search loop, the re-read tax is where most of the token cost lives — turn six paying full freight to re-read turns one through five. Cache those tool results and the re-read portion drops by 90%. In our model, Tavily-advanced's ~$0.54 task falls to roughly $0.20 with caching on the result blocks. Caching largely neutralizes the payload-verbosity penalty — which means if you're disciplined about caching, you can afford the richer Tavily payloads and the decision swings back toward "whichever returns better results." Almost none of the comparisons mention this, and it's the single highest-leverage thing you can do.

**Prune before you feed.** You do not need to hand Claude five full 6,000-token pages. Use Tavily basic's synthesized answer, or take Brave's snippets and only fetch full content for the two or three URLs the agent actually cites. Every page you don't feed is 5k tokens you re-pay on every subsequent turn. A small "select then extract" step in front of the model is worth more than any per-query price difference.

## Common pitfalls

- **Benchmarking on single queries.** Running one search through Brave and one through Tavily and comparing latency and cost tells you almost nothing about a research agent, because the agent's cost lives in the loop, not the call. Benchmark a full multi-search task or you're measuring the wrong thing.
- **Defaulting Tavily to advanced.** Advanced search is two credits *and* a much heavier payload — double the API fee, triple the tokens. Use basic unless you've confirmed a specific task needs the depth. This is the most common way we've seen a Tavily bill balloon.
- **Forgetting the free tiers cover prototyping.** Brave includes $5 in credits monthly; Tavily gives 1,000 credits/month. For most prototypes you'll pay nothing for search — which is another reason to stop optimizing the search line item early and optimize tokens instead.
- **Assuming Brave returns what Google returns.** Brave preserves Google's *ranking* better than Tavily (Spearman ~0.55 vs ~0.03) but shares fewer of Google's domains (~65% recall). Tavily returns more of Google's sources but reorders them for LLM consumption. If your agent depends on a specific site appearing, test with your actual queries — neither is a Google clone, and both drift on technical or niche topics per the Reddit threads.
- **Treating platform risk as zero.** Bing's search API was retired in August 2025; Tavily is mid-acquisition by Nebius as of February 2026. Brave's own-index model is the most insulated from a rug-pull, which is a real tiebreaker if you're building something long-lived.

## So which one?

If you want a single default: go direct to Brave, keep payloads lean with snippets-plus-selective-extract, and turn on prompt caching for tool results. It's the cheapest search fee, the fastest, the most independent, and with disciplined token handling it's also the cheapest total. That's the boring, correct answer for a high-volume Claude research agent.

But notice what changed. Once you count tokens, the Brave-versus-Tavily question stops being the important one. The important questions become *how big is each result payload* and *are you caching the re-reads* — and on those, a well-tuned Tavily setup and a sloppy Brave setup can land on opposite sides of the cost ledger from what the sticker prices predict. The vendor comparison everyone publishes optimizes a variable that's 15% of your bill. Optimize the other 85% first, and the $5-versus-$8 question mostly answers itself.

The open tension we haven't resolved: as Claude's own `web_search` tool gets cheaper and better at managing the loop natively, the case for wiring up either API directly narrows to volume and extraction depth. We'd bet that within a year the direct-integration decision is mostly about whether you need crawling — not about search at all.