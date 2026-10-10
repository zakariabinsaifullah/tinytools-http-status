# HTTP Status — tinytools

Searchable reference of HTTP status codes. Lives at `http-status.tinytools.work`.

Static site: plain HTML/CSS/ES modules, no build step, no dependencies at runtime.

## Features

- All 63 IANA-registered codes with plain-English meanings and a link to the exact RFC section
- "Watch out" notes for common mix-ups (401 vs 403, 301 vs 308, 502 vs 504, 400 vs 422…)
- Former names searchable (Unprocessable Entity, Payload Too Large, Moved Temporarily…)
- Optional unofficial codes (nginx 444/499, Cloudflare 52x, AWS ELB, IIS, Laravel), clearly labelled
- Search by code, pattern (`4xx`, `40x`, `5`), or words; class filters with live counts
- Copy code / `404 Not Found` / `HTTP/1.1 404 Not Found` / deep link
- Shareable URLs: `?q=timeout`, `#418`
- Keyboard: `/` focus search, `Esc` clear, `Enter` open first result
- Light / dark / system theme, works at phone width, strict CSP

## Layout

```
public/
  index.html    page shell
  styles.css    all styles (tokens at the top)
  app.js        search, filtering, rendering, URL sync
  data.js       status code data — edit this to add or fix codes
  theme.js      applies saved theme before first paint
  _headers      security headers (CSP etc.)
scripts/check-data.js   data sanity checks
wrangler.jsonc          Cloudflare Workers static assets config
```

## Develop

```sh
npm run preview      # python static server on http://localhost:8787
npm install && npm run dev   # or via wrangler
npm run check        # validate data.js
```

## Deploy

Requires `tinytools.work` to be a zone in your Cloudflare account.

```sh
npm install
npx wrangler login
npm run deploy       # runs checks, then attaches http-status.tinytools.work
```
