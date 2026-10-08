# The Christmas Conundrum — 101 Collins St

A one-page Christmas competition. Visitors unscramble a three-word festive phrase shown as letter tiles, then enter their answer, name, email and business name through a form. Each entry is sent as JSON to an endpoint you choose; an optional relay is included that appends entries to a CSV file in a private GitHub repo.

Preview: https://pomcoder21.github.io/xmas-conundrum/

**The answer is not in this repo.** The repo and the page source are both public, so POMPOM will send it to you separately. Don't add answer checking to the front end. Judge entries case-insensitively and ignore spaces and punctuation.

## What's in here

```
index.html       The page. All HTML, CSS and JS inline. No framework, no build step.
assets/          Title and stamp artwork (SVG/PNG) and the TAY webfonts
relay/           Optional Cloudflare Worker that saves entries to a CSV (with tests)
robots.txt       For the GitHub preview only. Don't copy it to your site root: it blocks search engines from the whole domain.
```

## Putting the page on your site

**Easiest: a standalone page.** Copy `index.html` and `assets/` to a URL on your site, for example `/christmas`. All asset paths are relative.

**Embedding inside an existing page:** the CSS uses global selectors (`*`, `html`, `body`, `:root`) and generic class names (`.tile`, `.panel`, `.field`, `.hero`, `.toast`, and so on). Either scope the styles under a wrapper class or load the page in an `<iframe>` so it doesn't clash with your site's styles.

The layout has been checked at 320, 360, 375, 390, 430, 768, 1024, 1440 and 1920px widths. Phones get a simplified layout: two stamps beside the title, letter tiles sized to the screen, full-width Submit, and buttons at least 44px tall.

### Settings (top of the `<script>` in `index.html`)

| Setting | What it does |
|---|---|
| `JUMBLE` | The letters shown, in order. The first 7 are row one, the rest row two. Currently `TECRDREHEPESHA`. |
| `ENTRY_ENDPOINT` | The URL entries are POSTed to. **Set this before launch**: while it's empty, every submission fails with "Couldn't send your entry. Please try again". |

To change the puzzle, replace `JUMBLE` with a new scramble and update the word count in the `.tease` paragraph ("a festive three‑word phrase…").

## Where entries go

### What the form sends

```
POST {ENTRY_ENDPOINT}
Content-Type: application/json

{ "answer": "...", "name": "...", "email": "...", "business": "...", "website": "" }
```

- `website` is a hidden spam trap. Real visitors leave it empty, so discard any entry where it's filled in.
- The browser already checks that all four fields are filled and the email looks valid, but check again on the server.
- Reply `2xx` with `{"ok": true}` on success; the visitor then sees "Merry Christmas. You're in the running." Any other response shows "Couldn't send your entry. Please try again" and leaves the form filled in so the visitor can retry.

### Option A: your own back end or CMS

Point `ENTRY_ENDPOINT` at your own form handler that accepts the request above. Or swap the `fetch` call in the submit handler for your CMS's form API (Webflow, HubSpot, etc.).

### Option B: the included relay (CSV in a private GitHub repo)

The relay validates each entry, filters out spam bots, caps each field at 200 characters, and appends a row with a timestamp to `entries.csv`. It's safe when two people submit at the same moment, and it blocks Excel formula injection. Cloudflare's free tier allows 100,000 requests a day.

What you need:

- A Cloudflare account.
- A private GitHub repo containing `entries.csv` with this header row: `submitted_at,answer,name,email,business`. POMPOM already has one at `pomcoder21/xmas-entries`; if you use your own, update `REPO`.
- A fine-grained GitHub personal access token limited to that one repo, with **Contents: Read and write**. POMPOM can create this for `pomcoder21/xmas-entries`.

Steps:

```bash
cd relay
npm install
npm test                          # 12 checks, all should pass
# Edit wrangler.toml: set REPO and ALLOWED_ORIGINS (your site's origin(s), comma-separated, no trailing slash)
npx wrangler login
npx wrangler deploy               # prints https://xmas-conundrum-entries.<subdomain>.workers.dev
npx wrangler secret put GITHUB_TOKEN   # paste the token when prompted
```

Then set `ENTRY_ENDPOINT` in `index.html` to the `workers.dev` URL. To view entries, open `entries.csv` in the private repo on GitHub and download it; it opens directly in Excel.

## Other notes

- **Fonts:** TAY Dumpling and TAY Birdie (by Taylor Penton) are licensed by POMPOM Studio for this use. The Google Fonts link loads fallbacks (Oswald, Space Mono) that only show if the TAY files fail to load.
- **Letter centring:** TAY Dumpling's capitals sit above the centre of their line box. The `--cap-nudge` variable recentres them in the tiles and buttons, so keep it if you restyle those.
- **Search engines:** `<meta name="robots" content="noindex, nofollow">` keeps this page out of Google. Remove it if you want the page indexed.
- **Repeat entries:** after a successful entry, the form is hidden in that browser (using the `localStorage` key `ioi-conundrum-entered`). That's a convenience, not a lock, and the relay doesn't remove duplicates, so check for repeat emails when judging.
- **Terms and privacy:** the form collects names, emails and business names. Add links to the competition terms and conditions and the privacy policy near the form; the current design doesn't include them.
- **Accessibility:** the tile animation respects `prefers-reduced-motion`, and the title artwork has alt text.
- **Design source:** Figma file "POMPOM x 101 Collins", frame "Desktop - 5" (node `3479:13789`). The title artwork in this repo has been corrected to read CONUNDRUM; the Figma frame still says "CONDUNDRUM".
