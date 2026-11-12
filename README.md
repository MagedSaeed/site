# Personal site

A static, data-driven academic site. All content lives in `data/*.json`; the page itself (`index.html` + `assets/`) never needs editing for content changes.

## Structure

```
index.html              page shell (top bar, header, footer)
assets/style.css        all styling, light + dark themes
assets/app.js           loads the JSON and renders each section
assets/icons.js         profile-link icons (picked by the link's host; Simple Icons, CC0)
assets/favicon.svg
assets/photo.jpg        profile photo (set by "photo" in profile.json)
data/site.json          section list: order, titles, type, data file, optional "show": N
data/profile.json       name, role line, photo, links (each with a "group": one row per group; "icon_only": true shows just the icon), emails, bio paragraphs
data/education.json     rows
data/experience.json    rows
data/news.json          timeline items (date "YYYY-MM", kind, text)
data/publications.json  papers, incl. topic weights (1 touches on, 2 substantial, 3 core)
data/venues.json        venue code -> full name (shown when hovering a venue label)
data/topics.json        research topics (name, short name for the map, colours light/dark, "neutral": true for a grey row kept last), max level, map years, sort order
data/opensource.json    rows
data/service.json       rows
data/patents.json       rows
data/awards.json        rows
data/systems.json       rows
data/skills.json        rows
```

## Editing

- **Reorder, rename, or hide a section:** edit `data/site.json`.
- **Add a news item:** add `{ "date": "2026-10", "kind": "paper", "text": "..." }` to `data/news.json`. Kinds: `paper`, `release`, `talk`, `milestone`, `award`. Order doesn't matter; items are sorted by date.
- **Add a paper:** add an entry to `data/publications.json`. Set `"type"` to `conference`, `journal`, `workshop` or `preprint`: it colours the venue label. A new venue code also needs its full name in `data/venues.json`. Leave out `url` while a paper is accepted but not yet out: it then shows an "Accepted" label instead of a link. Add `"patent": "<link>"` to a paper whose work led to a patent (gold "Led to a patent" label), or `"thesis": "<link>"` to one that came from your M.Sc. thesis ("From M.Sc. thesis" label); each label links there. Set `"selected": true` to show it in the Selected view, and tag its topics, e.g. `"topics": [{ "topic": "text-representation", "level": 5 }, { "topic": "language-models", "level": 2 }]`. Topic ids come from `data/topics.json`; level runs from 1 (minor) to 5 (core), set by `"max_level"` there.
- **Add a "rows" section** (talks, positions…): create `data/talks.json` with `[{ "key": "2025", "title": "...", "text": "...", "note": "...", "url": "..." }]` (all but `key` optional; `title` is shown in bold before `text`) and add `{ "id": "talks", "title": "Talks", "type": "rows", "source": "talks.json" }` to `site.json`.

Fields called `text` and `note`, and the bio paragraphs, accept a small Markdown subset: `[label](https://…)`, `[label](#pub-id)` for links within the page, `**bold**`, and `*italic*`. External links open in a new tab automatically. Write characters like `&` as-is; no HTML escaping is needed (raw HTML is shown as text). Everything else is plain text.

Section types: `about`, `rows`, `timeline`, `publications`, `research-map`.

Lists longer than 5 items show the first 5 and a "Show 5 more" button that reveals 5 more each time, and becomes "Show less" once the whole list is open. While a list is partly open, a quiet "Collapse" link beside the button goes back to the first 5. Set `"show": N` on a section in `site.json` to change how many it shows at first.

## Preview locally

The page loads JSON with `fetch`, so it must be served, not opened as a file:

```
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy (GitHub Pages)

1. Push this folder to a repo named `MagedSaeed.github.io` (files at the repo root).
2. Settings → Pages → Source: *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. Custom domain: enter your domain, then add DNS records at your registrar:
   - `A` records for `@`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `CNAME` for `www` → `magedsaeed.github.io`
4. Tick *Enforce HTTPS* once it's available.

Every push to `main` redeploys automatically.
