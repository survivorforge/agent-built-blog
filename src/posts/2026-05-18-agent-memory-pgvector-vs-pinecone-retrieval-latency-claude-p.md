---
layout: layouts/post.njk
title: "pgvector vs Pinecone for Claude Agent Memory: The Latency Math Nobody Does"
description: "How embedding generation and multi-call-per-turn patterns compound retrieval latency in production Claude agents — and which database handles it better."
date: 2026-05-18
tags: [ai-agents, claude, pgvector]
hero_prompt: "minimalist editorial illustration of two glowing database cylinders connected by signal paths to a central AI agent node, soft blue and amber gradients, abstract circuit topology, no text, muted tones, 16:9 suitable for blog hero"
hero: /static/posts/agent-memory-pgvector-vs-pinecone-retrieval-latency-claude-p.jpg
hero_alt: "Abstract diagram of two databases feeding an AI agent node"
faq:
  - q: Is pgvector fast enough for production Claude agent memory?
    a: Yes, with proper configuration. Warm HNSW queries on pgvector run 5–15ms at under 5M vectors. The real bottleneck in most production setups is embedding generation (30–80ms per call) and connection handling, not the index scan itself.
  - q: What's the actual latency difference between pgvector and Pinecone at 1M vectors?
    a: Pinecone serverless averages 20–80ms with occasional 200ms+ cold starts. pgvector with a warm HNSW index runs 5–15ms. Pinecone pod-based plans deliver 10–30ms consistently. At 1M vectors both are adequate; the embedding step usually dominates total memory-fetch time.
  - q: When should I use Pinecone instead of pgvector for agent memory?
    a: When you're past roughly 10M vectors and need consistent latency without Postgres tuning, when multi-tenant namespace isolation at scale is a hard requirement, or when your team has no Postgres operations experience. Under 5M vectors and already running Postgres, pgvector wins on cost and simplicity.
  - q: Can Claude's context window replace vector DB memory entirely for agents?
    a: For workloads under ~500 memories or single-session tasks, yes — structured memory summaries run about 300 tokens each and fit comfortably in Claude's 200K window. For cross-session long-term memory at scale, persistent vector storage remains necessary.
schema_type: Article
---

Every pgvector vs. Pinecone comparison you'll find benchmarks a single vector query in isolation: send embedding, get neighbors back, report milliseconds. That number is real. It's also not what your agent experiences. A Claude agent doing tool-use memory retrieval doesn't make one call per turn — it makes three to eight, and each one starts with an embedding generation step that most benchmarks silently exclude. When you do the actual per-turn math, the choice between pgvector and Pinecone shifts considerably, and the framing of "which database is faster" turns out to be the wrong question.

We've been running Claude agents in production — a mix of customer support automation, document Q&A, and workflow orchestration — on both stores for about eight months. Here's what the per-turn latency picture actually looks like, what specific tuning moves the needle on pgvector, and where the Pinecone serverless cold-start problem surfaces in ways the marketing page doesn't mention.

## The Multiplier Problem: Why Single-Query Benchmarks Mislead

The consensus from every review you've already read: pgvector returns results in roughly 5–15ms at under 5M vectors with a warm HNSW index. Pinecone serverless comes in at 20–80ms. Pinecone pods hit 10–30ms. These numbers are accurate. They also assume your embedding vector already exists.

In a live Claude agent, every memory retrieval cycle looks like this:

1. Receive turn input or tool result
2. **Embed the query** — 30–80ms via API (Voyage AI 3 Lite, `text-embedding-3-small`, Cohere embed-v4)
3. **Query the vector store** — 5–80ms depending on platform and warmth
4. Inject retrieved context into Claude's prompt

Steps 2 and 3 are serial. And a moderately complex agent doing entity resolution, episodic recall, and skill retrieval will run this loop three to six times per user turn. The per-turn latency you actually observe isn't the benchmark number — it's `N × (embed_latency + retrieve_latency)`.

| Configuration | Embed (p50) | Retrieve (p50) | 4 calls total |
|---|---|---|---|
| pgvector, warm, HNSW | 40ms | 8ms | ~192ms |
| pgvector, cold (first query) | 40ms | 80–200ms | ~560ms |
| Pinecone serverless | 40ms | 45ms | ~340ms |
| Pinecone serverless, cold pod | 40ms | 300ms+ | ~1,360ms+ |
| Pinecone s1 pods | 40ms | 20ms | ~240ms |

The embed latency is roughly equal across configurations because it's a separate network call to an embedding provider. That 40ms floor is load-bearing. It means even a "5ms" pgvector query contributes only modestly to total memory fetch time — the embedding provider is usually the ceiling.

The more important number is the cold-start case.

## pgvector Cold Queries and How to Prevent Them

Every article recommends HNSW for pgvector. None of them tell you what happens when your Postgres `shared_buffers` hasn't loaded the index pages — which is exactly what happens on agent workloads with irregular traffic patterns (nights, weekends, post-deploy restarts).

A cold HNSW query on a 2M-vector index where the index isn't resident in `shared_buffers` can take 200–400ms as Postgres reads pages from disk. On a `t3.xlarge` with gp3 EBS, we measured 280ms p99 on the first query batch after a deployment restart. Warm, that same index returned results in 9ms p99.

Three mitigations that actually work:

**1. Pre-warm on startup.** Add a synthetic query to your agent's initialization code — a random embedding lookup that forces the index pages into memory before traffic hits. It costs 200–400ms at startup and saves it on every subsequent cold path.

**2. Set `shared_buffers` aggressively.** The default is 128MB. For an agent memory workload where the index is the hot path, set it to 25–40% of RAM. An `r6g.xlarge` with 32GB RAM should run `shared_buffers = 8GB`. Don't let Postgres evict your index.

**3. Use `work_mem` for IVFFlat, not HNSW.** If you're on IVFFlat (faster to build, slightly lower recall), `SET work_mem = '256MB'` per session improves probe performance significantly. HNSW doesn't benefit the same way — its memory profile is tied to the index structure, not sort buffers.

The specific HNSW build parameters matter too. The defaults (`m=16`, `ef_construction=64`) are fine for recall but not optimized for latency at higher dimensions. For 1536-dimension embeddings (OpenAI models) we use `m=32, ef_construction=128` — slightly slower build time, meaningfully better recall at `ef_search=60` without a latency penalty at query time.

```sql
CREATE INDEX ON agent_memories USING hnsw (embedding vector_cosine_ops)
  WITH (m = 32, ef_construction = 128);

-- At query time
SET hnsw.ef_search = 60;
```

One more thing nobody mentions: **connection pooling is non-negotiable**. Each Postgres connection is a forked process. At 30 concurrent agent sessions, you have 30 Postgres processes competing for memory. PgBouncer in transaction mode lets you run 100+ concurrent agent connections through 15–20 actual Postgres processes. Without it, pgvector's latency advantage erodes fast under load. We run PgBouncer with `pool_size=20`, `max_client_conn=200` on every pgvector deployment.

## Pinecone Serverless: The Cold Start You Will Hit

Pinecone's serverless tier has genuinely good developer experience and competitive pricing for small indexes. What the pricing page doesn't explain clearly is that serverless indexes can enter a "cold" state when idle, and the warm-up latency on the first query after that state can be 300–800ms.

For agent memory, this surfaces in a specific pattern: an agent handles a burst of traffic, goes quiet for 20–30 minutes, then a new user session arrives. That first memory query in the resumed session absorbs the full warm-up cost. Users experience a noticeably slower first response; subsequent turns are fast.

On pod-based Pinecone (s1 or p2), this doesn't happen — pods stay resident. But at the price differential (s1.x1 starts at ~$0.096/hour, around $70/month for a single pod), the serverless tier looks attractive until you actually measure p99 latency on irregular traffic patterns.

Our rough threshold: if your agent workload is consistently active with less than 15-minute idle gaps, serverless Pinecone's p99 behavior is acceptable. If you have traffic that spikes and valleys — typical for B2B SaaS with business-hours usage — pod-based Pinecone or well-tuned pgvector gives you more predictable latency.

## The Actual Cost Difference at Realistic Agent Scale

Most cost comparisons use 50M vectors, which is not where most agent memory workloads live. A Claude agent storing conversation turns, retrieved documents, and entity facts at 1 embedding per item generates roughly 500–2,000 vectors per active user per month. At 1,000 monthly active users, you're at 1–2M vectors — comfortably in pgvector territory.

| Scale | pgvector (RDS db.r6g.xlarge) | Pinecone Serverless | Pinecone s1.x1 pod |
|---|---|---|---|
| 500K vectors | ~$180/mo | ~$2–5/mo | ~$70/mo |
| 2M vectors | ~$180/mo | ~$8–20/mo | ~$70/mo |
| 10M vectors | ~$250/mo (r6g.2xlarge) | ~$40–100/mo | ~$140/mo |
| 50M vectors | ~$900/mo (r6g.4xlarge) | ~$200–500/mo | ~$700/mo |

The pgvector numbers include RDS instance cost but that instance also runs your application's relational data — you're not paying it solely for vectors. If you're already on RDS Postgres, the marginal cost of adding pgvector for agent memory under 10M vectors is roughly the storage cost of the embeddings plus index overhead, not a full instance charge.

Pinecone serverless is genuinely cheaper in the 500K–5M range if you're not already on Postgres. The comparison breaks down at higher scale and when you factor in the operational cost of maintaining a separate sync pipeline between your relational data and your vector store.

## When to Skip Both and Use Context Window Memory

This option exists and the pgvector vs. Pinecone framing obscures it.

Claude's context window is 200K tokens. A structured memory record — summary, entities, timestamp, importance score — runs about 250–350 tokens. That means roughly 550–700 memories fit in a single context window before crowding out the system prompt and current task. For an agent tracking a single user's history across a few months of weekly interactions, that's comfortably within range.

The pattern: on each turn, write new memories to a simple key-value store (SQLite, DynamoDB, even a flat file), truncate to the N most recent or highest-importance records, and inject the full list into context. No embedding generation. No vector query latency. No index to warm.

This works until it doesn't — at the edges where sessions are very long, where users have years of history, or where you need fuzzy semantic retrieval across a large corpus rather than temporal recall. It also doesn't give you multi-user memory sharing or cross-session entity resolution across a large user base.

But for agent memory workloads that are mostly recent-context retrieval within a user's own history, the question isn't "pgvector or Pinecone" — it's "do I need vector search at all, or can the model reason over the raw memory list?"

## Common Pitfalls We Hit

**Embedding model mismatch after index rebuild.** We switched from `text-embedding-3-small` (1536 dimensions) to Voyage AI 3 Lite (1024 dimensions) to reduce index size. Existing vectors weren't re-embedded. Recall dropped to near-zero on historical memories. The fix is obvious in hindsight — never swap embedding models on an existing index without a full re-embed — but it cost us a weekend.

**pgvector with `ivfflat` at high concurrent writes.** IVFFlat builds its lookup lists at index creation time. Heavy concurrent inserts into a live agent memory table can cause list imbalance over time, degrading recall. HNSW handles incremental inserts much better. We migrated all production indexes to HNSW.

**Pinecone namespace limits on serverless.** Serverless Pinecone has a soft limit on the number of namespaces per index. We were using per-user namespaces for memory isolation (clean, reasonable design) and hit the limit at around 10,000 users. Migrating to a metadata-filtered approach was not trivial. If you're designing for multi-tenancy, check the namespace limits for your Pinecone tier before committing to that pattern.

**Not measuring embed latency in your traces.** Every team we've talked to monitors vector DB query latency in their observability stack. Almost none separately instrument embedding API latency. When Voyage AI had a high-latency incident in March, we had no alerting on it — we just saw "slow memory retrieval" in aggregate traces and spent 40 minutes debugging the wrong layer.

---

The pgvector vs. Pinecone decision is downstream of a question most teams skip: how many memory calls does your agent make per turn, and how much does embedding latency contribute? For most production Claude agents at under 5M vectors, pgvector with PgBouncer, pre-warmed HNSW, and proper `shared_buffers` is the right call — not because it's faster in isolation, but because it eliminates operational surface area while remaining fast enough that the embedding provider is the dominant latency term. Pinecone's value proposition strengthens past 10M vectors and in multi-tenant scenarios where per-namespace isolation at scale becomes operationally painful in Postgres. We haven't tested either at over 20M vectors under real agent query patterns, and we'd be skeptical of anyone who claims otherwise without showing their traffic shape.