# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Teamost 官网搭建 — a static website project that scrapes pages from mattermost.com, translates content to Simplified Chinese, and serves them as a local static site for Teamost (a Mattermost-based product for the Chinese market).

Three pages are scraped: `/apps/`, `/mobile/`, `/download/`. Output lands in `static/`.

## Commands

```bash
# Scrape the live Mattermost site (three approaches, newest last)
node scrape.mjs            # v1: website-scraper package, CSS-selector based
node scrape-v2.mjs         # v2: native fetch, manual URL extraction and rewriting
node scrape-puppeteer.mjs  # v3: Puppeteer — runs JS, handles lazy-loaded images

# Translate scraped pages to Simplified Chinese via DeepSeek API
node translate.mjs

# Visual comparison and diagnostics (expects local server on :8080)
node screenshot.mjs        # Screenshot the local /apps/ page
node diagnose.mjs          # Dump rendered page structure, first visible content
node diagnose-v2.mjs       # Side-by-side comparison: local vs remote mattermost.com
node compare.mjs           # Screenshot both local and remote for visual diff

# Serve static files locally
npx serve static -p 8080   # or any static file server
```

**Workflow after scraping:** serve the static directory → run `diagnose-v2.mjs` or `compare.mjs` to verify rendering matches the live site → run `translate.mjs` to replace English text with Chinese.

## Architecture

### Scraping pipeline (three generations)

All three scrape scripts download the same three pages and their static assets, differing in approach:

| Script | Approach | When to use |
|---|---|---|
| `scrape.mjs` | `website-scraper` npm package with CSS selectors | Simplest, but doesn't run JS |
| `scrape-v2.mjs` | Native `fetch`, regex-based URL extraction, manual path rewriting | No Puppeteer dependency, but no JS rendering |
| `scrape-puppeteer.mjs` | Full headless Chrome via Puppeteer | **Preferred** — handles dynamic content, lazy-load images, JS-injected elements |

`scrape-puppeteer.mjs` is the most complete. It launches Chrome (hardcoded path `C:/Program Files/Google/Chrome/Application/chrome.exe`), waits for `networkidle2`, scrolls to trigger lazy loading, then extracts all static resource URLs from the rendered DOM. Resources are downloaded through the browser's `fetch` (via `page.evaluate`) to reuse cookies/sessions.

### URL rewriting

All scrapers rewrite absolute `https://mattermost.com/...` URLs to relative paths pointing into `wp-content/` within the static directory. The `getRelativePath()` helper computes `../` depth based on page directory depth (e.g., from `apps/index.html` to `wp-content/uploads/...` becomes `../wp-content/uploads/...`).

### Translation pipeline (`translate.mjs`)

1. Parses each page's HTML with Cheerio
2. Collects text blocks from `h1-h6, p, li, a, span, label, button, figcaption, dt, dd, th, td` (skipping `script, style, code, pre, svg`)
3. Deduplicates unique text strings
4. Sends batches of 15 to DeepSeek API with the prompt "Translate each item to Simplified Chinese. Keep product names and technical terms."
5. Applies translations back to text nodes in the DOM
6. Also translates `<title>`, `<meta name="description">`, and `<meta property="og:*">`

The API key is hardcoded in `translate.mjs`. The API endpoint is `https://api.deepseek.com/v1/chat/completions`.

### Static site structure

```
static/
  index.html          → redirects to /apps/ (meta refresh + JS redirect)
  apps/index.html     → Desktop & mobile apps download page
  mobile/index.html   → Mobile-specific page
  download/index.html → General download page
  wp-content/         → WordPress theme assets, uploads, fonts, CSS, JS
```

The `static/index.html` is a hand-written redirect page (not scraped). It uses both `<meta http-equiv="refresh">` and a JS `location.href` redirect to `/apps/`.

### Puppeteer usage pattern

All Puppeteer scripts (`scrape-puppeteer.mjs`, `screenshot.mjs`, `diagnose.mjs`, `diagnose-v2.mjs`, `compare.mjs`) share the same launch config:

```js
puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox'],
})
```

The Chrome path is Windows-specific. These scripts use top-level `await` (ES modules).

## Dependencies

- **cheerio** — server-side jQuery for HTML parsing in `translate.mjs`
- **puppeteer** — headless Chrome for JS-rendered scraping and screenshots
- **website-scraper** — declarative website downloading (only used by `scrape.mjs`)

No build step, no bundler, no framework. Plain Node.js ES modules (`.mjs` extension).
