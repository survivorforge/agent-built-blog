---
layout: layouts/post.njk
title: "Portkey vs Helicone for Claude API: Multi-Workspace Cost Attribution in Production"
description: "How Portkey's virtual key model and Helicone's property system each break down for Claude API cost attribution across multiple workspaces, with production failure modes and pricing reality."
date: 2026-05-24
tags: [claude, cost-attribution, llm-gateway]
hero_prompt: "minimalist editorial illustration, soft gradients, abstract technical diagram showing layered proxy architecture with branching cost flows, nodes labeled by team and environment, muted blues and warm ambers, no text, 16:9, suitable for blog hero"
hero: /static/posts/portkey-vs-helicone-claude-api-multi-workspace-cost-attribut.jpg
hero_alt: "Abstract diagram of API gateway routing costs across team workspaces"
faq:
  - q: Does Portkey correctly attribute Claude prompt cache costs (cache write vs cache read tokens)?
    a: Portkey logs cache_creation_input_tokens and cache_read_input_tokens as separate line items and applies their respective rates to cost calculations. Always verify by comparing a sample window against your Anthropic invoice, since cache write tokens cost 1.25x regular input and cache read tokens cost roughly 0.1x — a material difference on cache-heavy workloads.
  - q: How do I track Claude Code CLI API costs through Portkey or Helicone?
    a: By default, Claude Code routes directly to api.anthropic.com and bypasses both gateways. Set the ANTHROPIC_BASE_URL environment variable to your gateway endpoint and provide a gateway-managed API key. Without this, Claude Code usage appears on your Anthropic invoice but not in your gateway dashboard.
  - q: Is self-hosting Helicone worth it for multi-workspace cost attribution?
    a: The operational case becomes clear above roughly $300/month on Helicone Cloud — equivalent infra (Postgres plus ClickHouse plus worker processes) runs $30-60/month. The tradeoff is real maintenance overhead — schema migrations, ClickHouse version upgrades, and staying current with upstream changes. It's only worth it if you have someone who will actually own it.
  - q: What is the core difference between Portkey workspaces and Helicone properties for attribution?
    a: Portkey workspaces are isolated environments with separate dashboards and virtual keys; attribution is enforced by which key you use. Helicone properties are custom HTTP headers you set per request; attribution depends on developers consistently setting them, which has no technical enforcement mechanism.
schema_type: Article
---

Every comparison you've read says both tools do cost attribution. They're right. What they don't say is that cost attribution works fine for two or three workspaces and starts failing in specific, predictable ways after that — ways that are distinct between Portkey and Helicone, and ways that get worse if you're running Claude API specifically rather than a mix of providers.

We ran into this at workspace four. By workspace seven, we had learned more about LLM gateway cost modeling than we wanted to. This is what the feature tables don't surface.

## How Each Tool Actually Models Attribution

Portkey's attribution primitive is the **virtual key** (VK). A VK maps to a real Anthropic API key, lives inside a workspace, and carries that workspace's budget context. Every request made with that VK gets attributed to that workspace. You can add granularity by passing `x-portkey-metadata` in the request headers — arbitrary JSON like `{"team": "search", "feature": "reranker", "env": "prod"}` — and the dashboard lets you drill into those tags within a workspace view.

The structural consequence: attribution at the key level is automatic and consistent. Attribution below that level — per feature, per user, per environment — requires every engineer to remember to set the metadata header. If someone uses the shared infra VK from a new prototype without tagging, those costs land correctly in infra's workspace but without feature-level attribution. Discipline is social, not enforced.

Helicone's attribution primitive is the **property**. You add `Helicone-Property-Team: search` and `Helicone-Property-Feature: reranker` to your HTTP headers, and the dashboard filters and groups by any property key you define. There's no workspace concept at the same level — organization is the top level, and everything under it is properties.

The structural consequence: properties are more flexible and require no upfront configuration. But there is no mechanism that enforces a property is present on a given request. Requests without a `Team` property silently accumulate in an unattributed pile. On teams where tagging is "mostly done," a measurable percentage of requests (commonly reported across forum discussions as in the single-digit to low-double-digit percent range) ends up unattributed. That percentage grows as teams grow and onboarding discipline slips.

Neither model is wrong. They encode different assumptions about how teams maintain discipline around infrastructure.

## The Claude Token Problem Nobody Mentions

Here is the specific thing that breaks cost attribution silently if your gateway isn't handling it: Claude's API returns four distinct token counts in the `usage` response object, and they are not all billed at the same rate.

For `claude-sonnet-4-6` at current pricing:

| Token type | Field in usage response | Rate |
|---|---|---|
| Regular input | `input_tokens` | $3.00 / MTok |
| Cache write | `cache_creation_input_tokens` | $3.75 / MTok |
| Cache read | `cache_read_input_tokens` | $0.30 / MTok |
| Output | `output_tokens` | $15.00 / MTok |

Cache write tokens cost 25% more than regular input. Cache read tokens cost 90% less. If a gateway conflates cache creation tokens with regular input tokens when calculating attributed cost, every workspace using prompt caching gets an incorrect number — not slightly incorrect, but wrong in direction depending on the cache hit rate.

A workflow with an 80% cache hit rate on a large system prompt looks expensive if cache write tokens are counted at regular input rates (because the occasional write looks like normal input). A workflow that's constantly writing cache — something like Claude Code's long system prompts refreshing frequently — looks cheaper than it is if cache writes are underweighted.

Portkey logs `cache_creation_input_tokens` and `cache_read_input_tokens` as separate fields in the request log and applies their respective billing rates to the attributed cost calculation. Helicone logs the raw response including the full usage object, which means the data is there in storage — but whether the dashboard cost calculation applies differential rates to cache tokens depends on your Helicone version. With the self-hosted version you can verify this by querying the raw ClickHouse logs directly and comparing to Anthropic's invoice for the same API key and window. With Helicone Cloud, export a sample of cache-heavy requests and check the math. Don't assume.

Extended thinking tokens (when `claude-sonnet-4-6` is invoked with `thinking: {type: "enabled"}`) appear in the response alongside regular output tokens. Both tools handle output token attribution correctly in our testing, but again: verify against invoice rather than trusting the dashboard at face value.

## The Spend That Neither Gateway Sees

Both tools only attribute what flows through them. For Claude API specifically, this creates a gap that is larger than most teams expect.

**Claude Code**: The CLI tool routes to `api.anthropic.com` by default, bypassing any gateway. If your engineers use Claude Code — and they do, it's now a standard part of most AI-adjacent engineering workflows — those costs appear on your Anthropic invoice but are invisible to both Portkey and Helicone dashboards. Claude Code's API usage is substantial: it sends large system prompts, uses prompt caching aggressively, and generates significant output tokens per session. On engineering-heavy teams, Claude Code is often the single largest source of ungated LLM spend.

The fix is straightforward: set `ANTHROPIC_BASE_URL` to your gateway endpoint and supply a gateway-managed API key. But it requires knowing the problem exists, distributing the configuration, and onboarding every engineer who uses the tool.

**AWS Bedrock routing**: Teams using Anthropic models via Bedrock generate spend that never touches Anthropic's API invoicing at all, and neither gateway covers it unless you're explicitly proxying Bedrock traffic through them.

**Direct SDK calls**: Anyone who sets `ANTHROPIC_API_KEY` directly in their environment rather than a gateway-issued key bypasses attribution entirely. Common in local development; easy to accidentally deploy.

Anthropic's [Usage & Cost Admin API](https://platform.claude.com/docs/en/manage-claude/usage-cost-api) provides the reconciliation tool: it shows usage at the API key level from Anthropic's side. The operational workflow we use: at the end of each month, compare total attributed cost in the gateway dashboard against total invoiced cost from Anthropic. The delta is ungated spend. If that delta is growing, something new is routing directly.

Neither Portkey nor Helicone integrates with Anthropic's Usage API to surface this gap automatically. You have to build the reconciliation check yourself or run it manually.

## Pricing at Realistic Scale

| | Portkey | Helicone Cloud | Helicone Self-Hosted |
|---|---|---|---|
| Entry price | $49/month | Free tier (10k req/mo) | $0 + infra |
| Attribution model | Workspaces + virtual keys | Properties (no workspace concept) | Same as Cloud |
| High-volume pricing | Enterprise (not listed) | Enterprise (not listed) | ClickHouse storage costs |
| Self-hosting | Enterprise tier only | Not available | Open source |
| Who manages infra | Portkey | Helicone | You |

Portkey's $49/month developer plan includes multiple workspaces. Where workspace count, seat limits, and RBAC depth change with pricing tier is not clearly documented. At the scale where multi-workspace governance actually matters — teams with $10k+/month in LLM spend that need to break down costs by cost center — you're likely in unpublished enterprise pricing territory for both tools.

Helicone self-hosting break-even: if your Helicone Cloud bill exceeds roughly $300/month, the equivalent infrastructure (Postgres plus ClickHouse plus worker processes) costs $30–60/month to run. The gap is real. What fills it is maintenance overhead — staying current with the Helicone repo, handling ClickHouse version upgrades and schema migrations, and owning availability. That's a reasonable trade if you have an infrastructure engineer who will own it; an expensive surprise if you don't.

## What Actually Breaks After Month Three

**Virtual key proliferation**: You start with one VK per team. Then you want separate VKs for dev/staging/prod. Then per feature, because the feature teams want their own dashboards. By month three you have forty virtual keys, an inconsistent naming convention, and an admin panel that no longer tells you anything quickly. Portkey doesn't enforce VK naming; that's your problem to solve with documentation and convention.

**Cross-workspace rollup in Portkey**: Workspace isolation means cross-workspace cost aggregation requires API calls, not a single dashboard view. Getting a "what did we spend total on AI last week across all teams" answer means scripting against the Portkey API. Helicone's property approach has the inverse characteristic — cross-property rollup is natural from the dashboard, but per-property isolation is weaker.

**Untagged requests compound**: In Helicone, a request without a `Team` property goes into an unattributed bucket. As teams grow and onboarding slips, that bucket grows. It doesn't cause any errors; it just silently erodes the accuracy of your attribution over time. The only mitigation is an automated test or linter that checks for required properties in your gateway client initialization.

**The gateway-is-down failure mode**: Both tools add a network hop. When either tool is unavailable — Portkey had at least one outage in our production use lasting roughly 12 minutes — LLM calls fail unless your client has direct fallback logic. Adding fallback logic to bypass the gateway when it's unreachable is the right call operationally, but it means those fallback requests are ungated and unattributed. You've now built in a systematic attribution gap that activates precisely when something is already wrong.

## Where This Leaves You

For teams where attribution consistency matters more than flexibility, Portkey's workspace model enforces cleaner boundaries — you either used the right VK or you didn't, and the attribution is automatically correct within that constraint. For teams where attribution categories evolve quickly and you don't want to manage VK infrastructure, Helicone's property model is lower friction to set up but higher friction to keep clean.

The more uncomfortable truth is that neither tool fully solves multi-workspace Claude cost attribution in 2026. The combination of prompt-cache token complexity, Claude Code bypassing gateways by default, and the absence of Anthropic Usage API integration in both tools means attribution in production is still a gateway dashboard plus invoice reconciliation workflow. Whoever builds the automated delta alerting — "here's your ungated spend this week and here's which API key it came from" — has a real product gap to fill.