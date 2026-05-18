# Agent Built

Source for [agent-built.com](https://agent-built.com) — notes from building real things with AI agents.

## Stack

- **Eleventy** v3, Nunjucks templates, Markdown content
- **Cloudflare Pages** — auto-deploy on push to `main`
- **pressbot** — research → draft → publish pipeline (separate repo on Survivor VM)

## Local dev

```bash
npm install
npm run dev      # http://localhost:8080
npm run build    # → _site/
```

## Adding a post

Drop a markdown file in `src/posts/<slug>.md` with frontmatter:

```yaml
---
layout: layouts/post.njk
title: Post title
description: One-sentence summary for SEO + RSS
date: 2026-05-18
tags: [ai-agents, claude]
hero: /static/posts/<slug>.jpg
hero_alt: Description of the hero image
faq:
  - q: Common question one?
    a: Concise answer in plain prose.
  - q: Another question?
    a: Another answer.
---

Body in markdown.
```

`hero` and `faq` are optional but expected on all real posts (FAQ powers LLM citation, hero powers the homepage card).
