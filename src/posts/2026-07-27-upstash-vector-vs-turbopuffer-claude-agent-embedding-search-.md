---
layout: layouts/post.njk
title: "Upstash Vector vs Turbopuffer: What Embedding Search Actually Costs a Claude Agent at Scale"
description: "A head-to-head cost breakdown of Upstash Vector and Turbopuffer for Claude agents, showing exactly which pricing model wins at 100K, 1M, and 50M vectors."
date: 2026-07-27
tags: [ai-agents, claude, vector-db, scaling]
hero_prompt: minimalist editorial illustration, two abstract storage columns of different heights connected by flowing query lines, soft gradients, muted teal and amber tones, no text, abstract technical diagram, suitable for blog hero
hero: /static/posts/upstash-vector-vs-turbopuffer-claude-agent-embedding-search-.jpg
hero_alt: "Two abstract database columns connected by query flow lines"
faq:
  - q: Is Upstash Vector or Turbopuffer cheaper for a Claude agent?
    a: At steady moderate volume with a handful of namespaces, Upstash's per-request pricing often undercuts Turbopuffer on list price. Turbopuffer pulls ahead the moment you have many mostly-idle tenants, because cold namespaces on object storage cost almost nothing to keep around.
  - q: Does a Claude agent even need a vector database?
    a: For searching code, agentic grep-and-read usually beats embeddings. For semantic memory, cross-document retrieval over prose, or matching by meaning across a large non-code corpus, embedding search still wins. Reach for a vector DB there, not for everything.
  - q: What is the main architectural difference between Upstash Vector and Turbopuffer?
    a: Upstash Vector is a serverless DiskANN engine priced per request. Turbopuffer separates compute from storage, keeping data on S3-style object storage, which makes storage cheap but adds cold-start latency on the first query to an idle namespace.
  - q: How much does Turbopuffer cost for one million documents?
    a: Liveblocks published roughly $47/month for their standard test of 1M documents at 1536 dimensions with 1M reads, 1M writes, and 10 namespaces — a useful public anchor, though your namespace layout changes the number.
schema_type: Article
---

Search the query in the title and you get two piles of results that never talk to each other. One pile — the Medium essays, the Tigerdata post — tells you AI agents don't need vector search anymore, that Anthropic ripped it out of Claude Code and replaced it with grep. The other pile — Firecrawl, Liveblocks, developersdigest — compares nineteen vector databases on recall and hosting model. Neither pile answers the question you actually have: your Claude agent *does* need embedding search for something, you've narrowed it to Upstash Vector or Turbopuffer, and you want to know what the bill looks like when you're not running a demo anymore.

Nobody compares those two head to head. They both show up as one row each in the big roundups — "lowest cost per query," "serverless, DiskANN" — and then the article moves on. So here's the direct comparison, with the pricing math worked out at three scale points and, more importantly, the one variable that actually decides it: how your tenants are shaped.

## When your Claude agent actually needs a vector DB

Start here, because half the internet will tell you to skip this entirely, and half of that half is right.

The agentic-search argument is real and you should take it seriously. If your agent is searching *code*, Boris Cherny's team was correct: an agent that greps, reads files, and follows references beats a pre-built embedding index on freshness, security, and — surprisingly — quality. Anthropic's own guidance is "start with agentic search and only add semantic search if you need it." For a coding agent over a repo you control, you probably don't need Upstash or Turbopuffer at all. Save yourself the bill.

The place that argument quietly stops applying is everything that isn't a filesystem you can walk cheaply. Grep works on code because code lives in files with paths, and reading a file is fast and free. It stops working when:

- The corpus is **prose that matches by meaning, not tokens** — support tickets, past conversations, a research library where "wide feet" needs to find "broad fit."
- The corpus is **too large or too remote to walk** — 50 million documents in object storage, where "just read the relevant ones" begs the question of which ones.
- You need **agent memory** — the running semantic recall of what happened across sessions, which is a retrieval problem with no filesystem underneath it.

That's the honest boundary. If your agent falls on the grep side, close this tab. If it falls on the embedding side — and a lot of production agents have exactly one component that does — then the question of *which* store, and what it costs, is live. Both Upstash and Turbopuffer are aimed squarely at that component.

## The two pricing models are different in kind, not degree

You can't compare these two by looking up a per-query number, because they don't bill on the same axis. This is the whole game, so it's worth being precise.

**Upstash Vector is priced per request.** It's a serverless DiskANN engine (they built it on JVector with FreshDiskANN-style streaming merges). You pay per query and per upsert, with a dimension multiplier: a vector up to 1,000 dimensions counts as one request, and a 1,536-dimension OpenAI/Voyage embedding counts as two. Pay-as-you-go list price is **$0.40 per 100K requests**, with fixed monthly tiers starting around **$60/month** for predictable load, plus storage. The mental model is a taxi meter: you pay for motion. Idle data costs you almost nothing in requests but you're still storing it.

**Turbopuffer is priced by storage first, movement second.** Its architecture separates compute from storage and keeps the corpus on object storage (S3/GCS) at roughly $0.02/GB raw, with an SSD cache in front for hot data. List storage runs about **$0.33/GB/month** logical, writes are billed by volume, and queries are cheap and tiered by how big the namespace being searched is. The mental model is a warehouse: you pay rent on the square footage, and pulling a box off a cold shelf takes a beat longer than one already at the front.

Those two shapes cross over at a predictable place, and it's not where the marketing suggests.

## What it actually costs at three scales

Here's a worked comparison. Treat every dollar figure as a **list-price estimate to verify against current pricing pages** — both vendors move their numbers, and Turbopuffer's per-query rate is namespace-size-tiered in a way that resists a clean unit quote. Where possible I've anchored to published numbers rather than guessed. Assumptions: 1,536-dimension embeddings (~6 KB/vector effective), cosine, steady query load.

| | Upstash Vector | Turbopuffer |
|---|---|---|
| **Pricing axis** | Per request ($0.40/100K, ×2 at 1536-dim) + storage | Storage ($0.33/GB-mo) + writes + cheap tiered queries |
| **Floor cost** | ~$0 free tier; $60/mo for a fixed tier | Storage-dominated; near-zero for tiny/idle data |
| **Cold/idle data** | Only storage; no request cost | Only storage on object store — its core advantage |
| **Small: 100K vectors, 200K q/mo** | ~$2.5 list (free tier covers most) | ~$1–3 list (storage-dominated) |
| **Mid: 1M vectors, 1M reads + 1M writes, 10 namespaces** | ~$18 list (4M billable requests ≈ $16 + ~$2 storage) | **~$47** (Liveblocks' published figure for this exact config) |
| **Large: 50M vectors, 10M q/mo, thousands of tenants** | Request bill scales linearly; storage ~$75/mo | Storage-dominated (~$100/mo); cold tenants nearly free to hold |

Two things fall out of this table that the roundups don't tell you.

**At the mid scale, Upstash's list price undercuts Turbopuffer** — roughly $18 versus the $47 Liveblocks published for the same 1M-doc, 1M-read, 1M-write, 10-namespace workload. That's counterintuitive if you absorbed the "Turbopuffer has the lowest cost per query" headline. Per query it may, but with only ten namespaces and steady traffic, you're not benefiting from the thing Turbopuffer is cheap *at*. You're paying storage rent on data that's all warm anyway, while Upstash just meters your 4 million billable requests and charges $16.

**At the large scale with thousands of tenants, the crossover flips hard.** This is where Turbopuffer's object-storage model stops being a curiosity and starts being the reason you'd pick it. Which brings us to the variable that actually decides this.

## The multi-tenant cliff is the real deciding factor

Almost every serious Claude-agent deployment that needs embedding search is multi-tenant: one namespace per customer, per workspace, per user. And multi-tenant workloads have a defining property — **most tenants are idle most of the time**. A thousand customers, and at any given minute maybe thirty are querying.

Under Upstash's request model, idle tenants are genuinely cheap on requests but you still hold and pay storage for all of them, and the moment traffic gets spiky your metered bill tracks it in real time. Under Turbopuffer's model, an idle namespace collapses to almost pure object-storage cost — pennies per GB per month — because there's no compute pinned to it. You can keep ten thousand cold tenants alive for the price of the S3 bytes. Turbopuffer was explicitly built for "millions of tenants/namespaces," and this is the workload where that claim earns its keep.

The catch — and this is the number nobody in the SERP puts on these two specifically — is **cold-start latency**. The first query to a cold namespace has to fetch from object storage before the SSD cache is warm. That's a jump from single-digit-to-tens-of-milliseconds warm to **several hundred milliseconds cold**, sometimes north of half a second. For a Claude agent, that latency lands inside a tool call the model is waiting on, and it stacks with the LLM's own latency.

So the actual decision rule is sharper than "which is cheaper":

- **Many tenants, most idle, latency-tolerant** (async agents, batch enrichment, memory that isn't in the hot path): Turbopuffer, decisively, on cost.
- **Few namespaces or steady hot traffic, latency-sensitive** (a synchronous chat agent where every hundred milliseconds shows): Upstash, or Turbopuffer with enough traffic to keep caches warm — and check the list-price math, because Upstash may also be *cheaper* here.
- **Spiky, unpredictable, low baseline**: Upstash's serverless metering means you pay nothing when nothing's happening, which is the whole pitch of pay-as-you-go.

## Common pitfalls we've hit

**Forgetting the dimension multiplier on Upstash.** A 1,536-dimension embedding is two requests, not one, on every query and every upsert. If you budgeted at $0.40/100K assuming one-to-one, your real bill is double. Re-embedding a corpus (new model, changed chunking) is a wall of upserts, each doubled — a migration can cost more than a month of queries.

**Benchmarking Turbopuffer warm and shipping it cold.** During development you hit the same namespace repeatedly, so it's always cached and you clock 20ms. In production with a long tail of tenants, your p99 is the cold-start path — a real user's first query of the day. Test the cold path deliberately, or you'll ship a latency profile you never measured.

**Treating storage as free on either side.** Upstash's request pricing is so prominent that storage gets ignored; Turbopuffer's whole model is storage, so it doesn't. At 50M vectors of 1,536 dimensions you're carrying ~300 GB. That's a real line item on both, and it's the *dominant* one on Turbopuffer. Budget it.

**Using a vector DB for something grep should do.** The most expensive pitfall is upstream of both vendors: indexing a corpus your agent could have searched with tools. If you're embedding your own codebase so a Claude agent can "search" it, you're paying for infrastructure *and* fighting staleness *and* getting worse results than a grep tool. The cheapest vector database is the one you didn't need.

**Pinning to fixed tiers before you know your curve.** Upstash's ~$60/month fixed plan is cheaper than pay-as-you-go above a break-even request volume — but below it you're pre-paying for capacity you're not using. Run pay-as-you-go until your monthly request count is stable enough to do the arithmetic.

## The recommendation, and the tension it leaves

If you're building a multi-tenant Claude agent with a long tail of mostly-idle customers and you can absorb a few hundred milliseconds on a cold query, Turbopuffer is the structurally right answer and gets more right as you add tenants — its cost model was designed for exactly this shape. If you're running a smaller number of hot namespaces, or a latency-sensitive synchronous agent, or spiky low-baseline traffic, Upstash Vector is simpler, its serverless metering matches unpredictable load, and — worth repeating because it contradicts the headlines — at moderate scale it may come out cheaper on list price too.

The unresolved tension is the one the first half of the SERP keeps shouting about. Every dollar of this comparison assumes you've correctly decided you need embedding search at all. The frontier of agent design in 2026 is agents that reach for retrieval *less* — grep the files, load context just in time, embed only the corpus that genuinely matches by meaning. The best move might be to run this comparison, pick the winner, and then keep quietly shrinking the slice of your agent that touches either database. The cheapest query is still the one you never make.