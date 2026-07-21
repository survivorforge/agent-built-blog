---
layout: layouts/post.njk
title: "Twilio vs Claude Voice Agent: The Real Cost Per Call (Not Per Minute)"
description: "A worked per-call cost breakdown of a Claude voice pipeline on Twilio, showing why the LLM is the cheapest layer and where the money actually goes."
date: 2026-07-21
tags: [ai-agents, claude, voice, scaling]
hero_prompt: minimalist editorial illustration, soft gradients, abstract diagram of a phone call splitting into four stacked cost layers of different heights, muted teal and amber tones, no text, suitable for blog hero
hero: /static/posts/twilio-vs-claude-agent-voice-pipeline-cost-per-call.jpg
hero_alt: "Abstract diagram of a voice call splitting into four stacked cost layers"
faq:
  - q: Is Claude cheaper than Twilio for a voice agent?
    a: They aren't substitutes. Twilio carries the phone call; Claude is the language model reasoning over the transcript. In a real pipeline the Claude layer is roughly 5–8% of the per-call cost, and Twilio's telephony minute plus speech-to-text and text-to-speech make up the rest.
  - q: How much does a Claude voice call actually cost per call?
    a: For a 3.5-minute inbound US call with about 10 agent turns, expect roughly $0.10 all-in with a lean stack (Twilio + Deepgram + Claude Haiku with prompt caching + Cartesia), or closer to $0.19 with ElevenLabs and Claude Sonnet. Per minute that's $0.028–$0.055.
  - q: Does prompt caching matter for voice agents?
    a: A lot. Without caching, resending the growing conversation history every turn makes the LLM cost climb roughly quadratically across a call. Caching the system prompt and prior turns cuts the input bill by 80–90%. But the default 5-minute cache TTL expires on long holds, so a paused call re-pays full input.
  - q: Why is text-to-speech often the biggest AI cost in a voice call?
    a: STT and the LLM are cheap per minute, but TTS bills on generated audio (per character or per minute of speech), and a chatty agent generates a lot of it. With a premium voice like ElevenLabs, TTS alone can exceed the telephony minute and the model combined.
schema_type: Article
---

Every page ranking for this query answers a question nobody building a voice agent actually asks: *what does a minute cost?* Twilio lists $0.0085 inbound, the platform comparisons stack STT and TTS and LLM into a $0.05–$0.15 per-minute band, and everyone moves on. The problem is that calls aren't billed in tidy uniform minutes, the LLM line doesn't behave like the others, and "Twilio vs Claude" isn't even a choice you get to make. They're different layers of the same stack.

We've been running Claude-backed voice agents through Twilio for inbound support and outbound qualification, and the per-minute framing hid the two things that actually decided our bill: how the model's cost grows *within* a single call, and which layer we should have been optimizing (it wasn't the model). This post models a real call end to end — actual token math, actual duration, actual dollars — so you can see where the money goes instead of guessing from a per-minute range.

## "Twilio vs Claude" is the wrong comparison

Start here because it reframes everything downstream: Twilio and Claude are not competitors. Twilio is the carrier — it terminates the PSTN call, handles SIP, streams the audio. Claude is the language model that reads a transcript and decides what to say. You don't pick one. You compose both, plus two more layers most comparisons wave at.

The layer people forget: **Claude has no native realtime voice API.** As of mid-2026, there's no Anthropic equivalent of a speech-to-speech model that takes audio in and emits audio out. Claude reasons over text. That means a Claude voice pipeline *always* bolts on a separate speech-to-text engine in front and a separate text-to-speech engine behind. So the real stack is four billed layers:

1. **Telephony** — Twilio (or an alternative) carries the call.
2. **STT** — Deepgram, or Twilio's managed pipeline, transcribes the caller.
3. **LLM** — Claude generates the response text.
4. **TTS** — Cartesia, ElevenLabs, or similar speaks it back.

Twilio's ConversationRelay bundles layers 2 and 4 into a managed pipeline so you only wire up the WebSocket and the model — convenient, but it prices at a premium over the raw voice minute and adds latency (Vapi's own benchmarking pegs ConversationRelay around 1000ms round-trip, versus sub-500ms for tuned custom pipelines). You can also do it yourself: raw Twilio Media Streams into your own Deepgram and Cartesia connections. Cheaper per minute, more to operate.

Either way, the question "is Claude cheaper than Twilio" dissolves. The right question is *which layers do I own, and what does each one contribute to the cost of one real call.*

## The real cost per call: a worked example

Here's a concrete inbound support call, the kind our agent handles hundreds of times a day. Assumptions, stated so you can swap in your own:

- **Duration:** 3.5 minutes (inbound, US local).
- **Turns:** ~10 agent responses.
- **System prompt:** 1,500 tokens (instructions + a few tool definitions).
- **History growth:** ~80 tokens per turn (caller transcript + agent reply added to context).
- **Output:** ~50 tokens per agent turn.
- **Agent speech:** ~90 seconds of generated audio (the agent isn't talking the whole call).

Per-minute list prices as of July 2026 (these move — treat them as a snapshot, not gospel):

| Layer | Provider / rate | Billed on | Cost for this call |
|---|---|---|---|
| Telephony | Twilio inbound, $0.0085/min | Call duration (3.5 min) | $0.030 |
| STT | Deepgram Nova-3 streaming, $0.0077/min | Connection time (3.5 min) | $0.027 |
| TTS (lean) | Cartesia, ~$0.025/min of audio | Generated speech (1.5 min) | $0.038 |
| TTS (premium) | ElevenLabs, ~$0.08/min of audio | Generated speech (1.5 min) | $0.120 |
| LLM | Claude Haiku 4.5, w/ prompt caching | Tokens (see below) | $0.005 |
| LLM | Claude Sonnet 5, w/ prompt caching | Tokens | $0.013 |

Two realistic builds fall out of that table:

- **Lean stack** (Twilio + Deepgram + Cartesia + Haiku, cached): **~$0.10 per call**, about **$0.028/min**.
- **Premium stack** (Twilio + Deepgram + ElevenLabs + Sonnet, cached): **~$0.19 per call**, about **$0.055/min**.

That lands inside the $0.05–$0.15/min band the competitor pages quote — but now you can see *which knob* moves it. Swapping ElevenLabs for Cartesia saves more than three times what switching Sonnet to Haiku does. The model is a rounding error. TTS and duration are the bill.

## The LLM line grows per turn — and caching collapses it

This is the part no ranking page models, and it's the whole reason "per minute" lies about the LLM. The Claude API is stateless: every turn, you resend the entire conversation so far. So the input tokens you pay for on turn *k* include the system prompt *plus every prior turn*. Cost per turn climbs as the call goes on.

Do the arithmetic for our 10-turn call. Turn 1 sends ~1,530 input tokens. By turn 10 it's ~2,250. Summed across the call: **~18,900 input tokens and ~500 output tokens** — for a call where the caller and agent exchanged maybe 800 tokens of actual new content. The rest is history, re-sent again and again. That sum grows roughly with the *square* of turn count, which is why a 20-turn call costs far more than twice a 10-turn one on the model line.

Without caching, on Haiku 4.5 ($1/M input, $5/M output) that's about **$0.021 per call**. Modest — but it's also the layer that scales worst with call length, and on Sonnet 5 ($3/M input, $15/M output) it's ~$0.065.

Prompt caching is what makes the model layer disappear. Cache the system prompt and the accumulated history; each turn only the newest caller line is a fresh write, and everything prior reads from cache at roughly a tenth of the input price. That collapses the ~18,900-token input bill by 80–90%, dropping Haiku to **~$0.005 per call** and Sonnet to ~$0.013. That's the number in the table, and it's why we treat the LLM as the cheapest thing in the stack.

The catch — and this is a genuine failure mode, covered below — is that Anthropic's default cache TTL is **five minutes**. Voice calls have holds, transfers, and dead air. Cross that five-minute gap and the cache evaporates; the next turn re-pays full input at 10× the cached rate, right when your context is largest. The one-hour cache tier exists but costs more to write, so it's a bet on call shape.

## Where the money actually goes

Reread the table with the model priced correctly and the picture inverts from what the "cheap inference" narrative suggests. In the lean stack, Claude is **~5%** of the call. Telephony, STT, and TTS are the other 95%, and two of those three bill on **duration**, not content.

That has a consequence the per-minute pages never draw: **latency is a cost multiplier, not just a UX problem.** Telephony and STT bill for every second the call is open. A pipeline that adds 500ms of round-trip lag doesn't just feel robotic — it stretches the call. Across thousands of calls, a slower pipeline quietly buys you more Twilio and Deepgram minutes. This is the hidden tax in a managed pipeline like ConversationRelay running near 1000ms versus a tuned custom stack under 500ms: you may pay the premium *and* pay for the extra duration it causes.

TTS is the other lever, and it's the one to pull first. It's usually the single largest AI line item, it scales with how much your agent *talks*, and premium voices cost 3–4× budget ones. Two cheap wins we took: tighten the prompt so the agent is terse (fewer generated characters), and drop to a cheaper voice for internal or low-stakes flows. Cutting agent verbosity 30% cut our TTS bill almost proportionally — a bigger dollar swing than any model change we tried.

## Common pitfalls

What actually bit us, in rough order of surprise:

- **STT bills the connection, not the talking.** Deepgram (and most streaming STT) charges for the duration the stream is open, whether the caller is speaking or silent. A caller on hold still meters. Close streams aggressively during known dead time.
- **TTS bills characters, and numbers explode.** "$1,247.89" is far more synthesized characters than it looks once spoken. Currency, dates, and phone numbers spoken back to callers inflate TTS more than you'd estimate from word count.
- **The 5-minute cache TTL vs. real call shape.** Long holds and warm transfers blow past the default cache window. When context is largest is exactly when a cache miss hurts most. Model your hold-time distribution before assuming caching saves 90%.
- **Silence and minimum billing.** Some platforms bill a minimum call duration or round up to the minute. At high volume of short calls (wrong numbers, immediate hang-ups), rounding is a real percentage of the bill. Check whether you're billed per second or per minute.
- **Concurrency caps.** Per-minute math assumes you can actually run the calls. Twilio, STT, and TTS vendors all impose concurrency limits; bursting past them means dropped calls or throttling, not a bigger invoice. Provision headroom before a campaign, not during.
- **ConversationRelay's convenience-vs-latency trade.** The managed pipeline saves integration work but runs slower and prices above raw voice. If margin matters at your volume, price the custom pipeline before committing — the difference compounds on both the AI line and the duration-billed lines.

## What we'd tell someone starting today

If you're prototyping one agent, the "Twilio vs Claude" framing is harmless and you should just wire up ConversationRelay and Claude and ship. The moment volume is real — call it past 50,000 minutes a month — the framing costs you money, because it points your optimization energy at the model, which is 5% of the bill, instead of at TTS and call duration, which are most of it.

The honest unresolved tension: the cheapest possible stack (Cartesia, Haiku, raw Media Streams) is also the most operational work and the one most likely to sound slightly robotic, and voice quality directly affects whether callers stay on the line — which affects duration, which affects every duration-billed layer. We don't have a clean answer to where that line sits for a given use case, only that you should price the *call*, model the model's per-turn growth, and stop comparing two things that were never substitutes. If someone shows you a single per-minute number for a voice agent, they haven't costed a real call.