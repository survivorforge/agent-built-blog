---
layout: layouts/post.njk
title: "Deepgram vs Whisper API for a Claude Voice Agent: The Real Cost Per Minute"
description: "A worked per-minute breakdown of Deepgram vs Whisper feeding a Claude voice agent — why the STT price gap is noise and what actually drives your bill."
date: 2026-07-22
tags: [ai-agents, claude, voice]
hero_prompt: minimalist editorial illustration, soft gradients, abstract audio waveform flowing into three stacked layered bars, muted teal and amber tones, no text, suitable for blog hero
hero: /static/posts/deepgram-vs-whisper-api-claude-voice-agent-transcription-cos.jpg
hero_alt: "Abstract waveform flowing through three stacked cost layers"
faq:
  - q: Is Deepgram or Whisper cheaper per minute for a voice agent?
    a: Whisper API is nominally cheaper for batch ($0.006/min vs Deepgram's $0.0077/min streaming), but Whisper has no real-time streaming, so for a live Claude voice agent Deepgram is effectively the only usable option of the two. The ~$0.0017/min difference is a rounding error against your total stack cost.
  - q: Can I use the OpenAI Whisper API for a real-time Claude voice agent?
    a: Not directly. The Whisper API (whisper-1) is batch-only — it transcribes complete audio files, not a live stream. To use it in a conversational loop you'd build a chunking pipeline that adds one to three seconds of latency, which breaks the turn-taking feel before Claude even starts responding.
  - q: What does a full Claude voice agent cost per minute?
    a: Roughly $0.05–$0.18 per minute all-in: telephony ($0.01–0.03), STT ($0.006–0.008), the Claude LLM layer ($0.005–0.04 depending on model and context), and TTS ($0.03–0.10). STT is the smallest line item; TTS and telephony dominate.
  - q: Does the Deepgram vs Whisper price difference actually matter?
    a: Almost never. STT is 4–8% of a full voice-agent minute. Pick Deepgram for its sub-300ms streaming and built-in turn detection, not because it saves or costs you a fraction of a cent per minute.
schema_type: Article
---

Every comparison you'll find for this query answers a question you didn't ask. Search "Deepgram vs Whisper cost per minute" and you get a tidy table: Deepgram Nova-3 streaming at $0.0077/min, Whisper API at $0.006/min, a paragraph about word error rate, and a verdict. What none of them do is put those numbers where you actually need them — inside a real voice agent with Claude as the brain — and once you do that, the whole framing falls apart. The STT price difference is $0.0017 a minute. Over 2,000 minutes a month that's $3.40. You will spend more than that on the coffee you drink deciding.

We've built this exact stack — Deepgram or Whisper feeding transcripts to Claude, Claude's replies going out through ElevenLabs — and the cost lessons had almost nothing to do with the per-minute STT rate the ranking pages fixate on. Here's what actually moves the bill, what breaks in production, and how to think about the choice when Claude is doing the reasoning.

## Deepgram vs Whisper per minute: the numbers, and why they're the wrong headline

Let's get the table everyone wants out of the way, because you should have accurate figures. These are pulled from the providers' own 2026 pricing.

| Model | Mode | Per minute | Per hour | Streaming? | English WER |
|---|---|---|---|---|---|
| Deepgram Nova-3 | streaming | $0.0077 | $0.46 | Yes (<300ms) | ~5.2% |
| Deepgram Nova-3 | batch (pre-recorded) | $0.0043 | $0.258 | No | ~5.2% |
| OpenAI Whisper API (whisper-1) | batch | $0.006 | $0.36 | **No** | ~10.6% |
| OpenAI gpt-4o-transcribe | batch/near-real-time | ~$0.006 | ~$0.36 | Limited | collapses on long-form (43.8%) |
| Groq whisper-large-v3 (hosted) | batch | ~$0.0003–0.002 | ~$0.02–0.11 | No | Whisper-class |
| faster-whisper (self-hosted) | either | fractions of a cent | GPU cost | DIY | Whisper-class |

Three things in this table matter far more than the numbers in the "per minute" column.

First: **Whisper doesn't stream.** The OpenAI Whisper API is a batch endpoint — you hand it a complete audio file, it hands you back text. There is no partial-transcript-as-you-speak mode. For a Claude voice agent that means the "cheaper" $0.006/min option isn't a live option at all. To use it in a conversational loop you have to build a chunker: slice the incoming audio into windows, send each window, stitch the results, guess at word boundaries. That pipeline adds one to three seconds of latency, and it's latency that stacks *before* Claude's time-to-first-token. So the real comparison for a live agent isn't $0.0077 vs $0.006 — it's "Deepgram streaming" vs "a batch model plus a latency-injecting pipeline you have to build and maintain." Those aren't the same product.

Second: **the batch-vs-streaming Deepgram number trips people up.** Deepgram's $0.0043/min pre-recorded rate is the one that shows up in a lot of "cheapest STT" roundups. Your live voice agent cannot use it. You need the streaming WebSocket endpoint, which is $0.0077/min. If you budgeted off the batch rate, you're low by ~80% on the STT line.

Third: **gpt-4o-transcribe is newer and worse where it counts.** Independent July 2026 benchmarks clocked it at 43.8% WER on long-form financial earnings calls — a collapse, not a wobble. Newer model, marketing momentum, and it still isn't the one you want for a reliability-sensitive agent. Deepgram Nova-3 tied for best on English meeting audio in the same test.

## Where the money actually goes: the four-layer minute

The reason the STT price is noise is that STT is the smallest layer in the stack. A Claude voice agent that answers a phone runs four billable layers in real time, and here's roughly what each costs per minute of conversation in 2026:

| Layer | Low | High | What drives it |
|---|---|---|---|
| Telephony (Twilio/Telnyx) | $0.01 | $0.03 | inbound vs outbound, number type |
| **STT** (Deepgram/Whisper) | **$0.006** | **$0.0077** | model + streaming vs batch |
| LLM (Claude) | $0.005 | $0.04 | model tier + context replayed per turn |
| TTS (ElevenLabs/Cartesia) | $0.03 | $0.10 | voice realism, throughput tier |
| **Total** | **~$0.05** | **~$0.18** | |

STT is 4–8% of the minute. TTS alone is often five to ten times the STT cost. If you're optimizing this stack for money, the Deepgram-vs-Whisper decision is the last place to look — you'd get more savings from dropping ElevenLabs to Cartesia, or from trimming Claude's context, than from anything you could do at the STT layer.

**The Claude layer, honestly.** We can't hand you a single per-minute Claude number, because it depends entirely on how much context you replay each turn and which model you pick — and you should compute it, not trust a blog's guess. The scaffold: a spoken minute is maybe four turns, and a spoken reply runs ~150 words ≈ 200 output tokens. Input is where it swings — a growing transcript plus a system prompt, billed every turn. With prompt caching on the system prompt and stable history, effective input might be 1,500–3,000 tokens/min. Run that through Haiku 4.5's rates and you land near half a cent a minute; run it through Sonnet 5 with a fat, uncached context and you're up toward $0.04. Voice agents almost always want the fast, cheap tier for the conversational loop — Haiku 4.5 — and escalate to Sonnet 5 only for the hard turns. That single model choice moves your bill more than the entire STT decision does. Check current per-million-token rates against Anthropic's pricing page before you commit a number to a spreadsheet; the model IDs to price are `claude-haiku-4-5` and `claude-sonnet-5`.

## The billing detail nobody in the top results mentions: you pay for silence

Here's the one that actually surprised us, and it's absent from every page-1 result: **streaming STT bills the wall-clock duration of the open connection, not the seconds of speech.**

When you open a Deepgram streaming WebSocket, the meter runs for as long as the socket is open. A voice agent minute is full of dead air — the user thinking, the agent talking for eight seconds through TTS, the pause before someone answers a question. If you leave the STT stream open through all of it, you're paying Deepgram's streaming rate for audio that contains no user speech at all. On a call where the agent talks 40% of the time and the user pauses to think, you can be paying for a meaningful chunk of minutes where there was nothing to transcribe.

Whisper's batch billing is the opposite: you pay for the duration of the audio file you actually send. If you only send the user's speech segments, you only pay for speech. That's a genuine structural difference, and it slightly narrows the real-world gap the headline rates imply — but it doesn't rescue Whisper, because you've paid for it in latency and engineering instead.

The practical fix on Deepgram: pause or close the stream during agent TTS playback and long silences, and reopen on voice activity. Most turn-detection setups do some version of this, but if you naively hold one socket open for the whole call, your "minutes" of STT can run well above your minutes of conversation. This is also why "minutes" is a slippery unit across the stack — telephony bills call minutes, STT bills audio-or-connection seconds, TTS bills characters. They don't reconcile one-to-one, and budgeting as if they do is how people end up 30% off.

## The thing worth paying for isn't accuracy or price — it's turn detection

If cost isn't the reason to pick Deepgram over Whisper for a Claude agent, what is? Latency and turn-taking.

A voice agent lives or dies on the moment between the user finishing a sentence and the agent starting to respond. That gap is the sum of: STT finalizing the transcript, Claude producing its first token, and TTS starting to speak. You have a latency budget of maybe 500–800ms before it feels broken. Whisper's batch nature spends your entire budget before Claude has seen a word. Deepgram returns final transcripts in under 300ms and — with Nova-3 and the newer Flux model — does *turn detection inside the STT layer*, telling you when the user has actually stopped talking versus just paused.

That last part is worth more than any price difference, because turn detection is otherwise a component *you* have to build in your Claude orchestration loop. When the STT provider hands you a reliable "the user is done" signal, you delete code from your own pipeline and you stop Claude from responding to half-finished sentences. That's the real trade: Deepgram isn't cheaper or even dramatically more accurate for clean English — it removes work and latency from the loop around Claude. Whisper hands you raw transcription and makes the rest your problem.

## Common pitfalls we hit the hard way

- **Wiring Whisper API into the live loop.** It's batch. You'll build a chunker, add one to three seconds of latency, and then stack Claude's TTFT on top. It works in a demo with pre-recorded audio and feels broken the first time a human talks to it.
- **Budgeting off Deepgram's $0.0043 batch rate.** Your live agent needs the $0.0077 streaming endpoint. Easy 80% underestimate.
- **Whisper hallucinating on silence.** Whisper is notorious for inventing text in dead air — phantom "Thank you for watching" strings and similar. Feed that to Claude and it responds to something the user never said. Deepgram is far less prone to this. On a voice agent, a hallucinated transcript isn't a cosmetic error; it derails the conversation.
- **Holding one STT socket open per call.** Pay-for-silence, described above. Pause the stream during TTS playback and long pauses.
- **Assuming newer transcription models are better.** gpt-4o-transcribe is newer than Nova-3 and collapsed to 43.8% WER on long-form audio in independent testing. Benchmark on *your* audio domain before switching.
- **Optimizing the wrong layer.** We spent a week arguing about STT and then realized swapping ElevenLabs for Cartesia saved 4× what the entire STT line cost. Look at TTS and telephony first.

## The tension worth watching

There's a real strategic question underneath all of this. Speech-to-speech models — OpenAI's Realtime API and its kin — are collapsing STT, the LLM, and TTS into one round trip, and the latency numbers are genuinely better because there are fewer hops. But you lose Claude. If you're committed to Claude as the reasoning layer — for its tool use, its longer-context reliability, its behavior under complex instructions — then you're committed to a three-provider pipeline, and your STT choice should be judged almost entirely on how little latency and orchestration it adds to the loop around Claude. Under that lens, Deepgram Nova-3 wins on turn detection and streaming latency, Whisper API doesn't qualify for the live path at all, and the per-minute price you came here to compare turns out to be the least interesting number in the stack.

If you're still choosing on cost per minute, you're solving the 6% of the bill and ignoring the 94%. Pick the STT that shrinks your Claude loop, put a real number on your TTS and telephony, and price the Claude layer against your own token replay — that's where the month-end invoice actually comes from.