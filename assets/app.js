/* Personal site renderer.
 * Everything on the page comes from data/*.json:
 *   data/site.json lists the sections (order, title, type, data file).
 *   Each section type has a renderer below. Add a section by adding an entry to site.json.
 * Fields named "text" and "note" (and bio paragraphs) accept a small Markdown subset: [label](url), **bold**, *italic*.
 * Everything is escaped first, so no raw HTML gets through.
 */
(async function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const ext = url => `href="${esc(url)}" target="_blank" rel="noopener"`;
  // runs on escaped text, so link targets are already safe to put in an attribute
  const md = s => esc(s)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${u}"${u.startsWith("#") ? "" : ` target="_blank" rel="noopener"`}>${t}</a>`)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\*(.+?)\*/g, "<i>$1</i>");
  const getJSON = async path => {
    const r = await fetch(path, { cache: "no-cache" });
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return r.json();
  };

  let site;
  const data = {};
  try {
    site = await getJSON("data/site.json");
    const files = new Set(["profile.json", ...site.sections.map(s => s.source).filter(Boolean)]);
    // publications and the research map need each other's data
    if (site.sections.some(s => s.type === "publications" || s.type === "research-map")) { files.add("publications.json"); files.add("topics.json"); files.add("venues.json"); }
    await Promise.all([...files].map(async f => { data[f] = await getJSON("data/" + f); }));
  } catch (e) {
    $("header").innerHTML = `<p class="err">Could not load site data (${esc(e.message)}). If you opened this file directly, serve the folder instead, e.g. <code>python3 -m http.server</code>.</p>`;
    return;
  }

  const profile = data["profile.json"];
  const ME = profile.highlight_author || "";
  if (site.title) document.title = site.title;

  /* ---------- header, nav, footer ---------- */
  // profile links, one row per "group" (in the order groups first appear), then a row of email addresses
  const linkRows = profile => {
    const groups = new Map();
    for (const l of profile.links || []) {
      const g = l.group || "";
      if (!groups.has(g)) groups.set(g, []);
      // "icon_only": the icon stands alone (e.g. X, whose name is the same letter as its logo); the name stays
      // available to screen readers and as a hover tooltip
      groups.get(g).push(l.icon_only && linkIcon(l.url)
        ? `<a ${ext(l.url)} aria-label="${esc(l.label)}" title="${esc(l.label)}">${linkIcon(l.url)}</a>`
        : `<a ${ext(l.url)}>${linkIcon(l.url)}${esc(l.label)}</a>`);
    }
    const mails = [].concat(profile.emails || profile.email || [])
      .map(e => `<a class="mail" href="mailto:${esc(e)}">${window.MAIL_ICON || ""}<span>${esc(e)}</span></a>`);
    return [...groups.values(), mails].filter(r => r.length).map(r => `<div class="link-row">${r.join("")}</div>`).join("");
  };
  // a small icon for a known profile site (assets/icons.js), picked by the link's host
  const linkIcon = url => {
    let host = ""; try { host = new URL(url).hostname; } catch (e) {}
    // the key must be the whole host or end it after a dot ("x.com" matches x.com and www.x.com, not dropbox.com)
    const hit = (window.LINK_ICONS || []).find(([h]) => h.endsWith(".") ? host.includes(h) : host === h || host.endsWith("." + h));
    if (!hit) return "";
    const paint = hit[2] === "stroke" ? 'fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"' : 'fill="currentColor"';
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${paint} d="${hit[1]}"/></svg>`;
  };
  $("header").innerHTML = `
    ${profile.photo ? `<img class="photo" src="${esc(profile.photo)}" alt="${esc(profile.name)}" width="120" height="120">` : ""}
    <div class="intro">
      <h1>${esc(profile.name)}</h1>
      <p class="role">${esc(profile.role)}</p>
      <nav class="links" aria-label="Profiles">
        ${linkRows(profile)}
      </nav>
    </div>`;
  // on wide screens the photo sits above the side nav instead of in the header (CSS picks which one shows)
  if (profile.photo) $("nav").insertAdjacentHTML("beforebegin", `<img class="side-photo" src="${esc(profile.photo)}" alt="" width="160" height="160">`);
  $("nav").innerHTML = site.sections.map(s => `<a href="#${esc(s.id)}">${esc(s.nav || s.title)}</a>`).join("");
  $("footer").textContent = site.footer || "";

  /* ---------- shared helpers ---------- */
  const head = (s, extra = "") => `<div class="sh"><h2>${esc(s.title)}</h2>${s.meta ? `<span class="meta">${esc(s.meta)}</span>` : ""}${extra}</div>`;

  /* ---------- topics: colours + ordering ---------- */
  const topicsData = data["topics.json"] || { topics: [] };
  const pubs = data["publications.json"] || [];
  // contribution levels run 1..MAX_LEVEL (topics.json "max_level", 5 by default)
  const MAX_LEVEL = topicsData.max_level || 5;
  const LEVEL = l => `level ${l} of ${MAX_LEVEL}`;
  // shade per level, from 35% (the faintest that stays visible on both themes) up to the full colour
  const mix = l => Math.round(35 + 65 * (l - 1) / Math.max(MAX_LEVEL - 1, 1));
  const TOPICS = topicsData.topics.slice();
  {
    const light = TOPICS.map(t => `--c-${t.id}:${t.color};`).join("");
    const dark = TOPICS.map(t => `--c-${t.id}:${t.color_dark || t.color};`).join("");
    const st = document.createElement("style");
    st.textContent = `:root{${light}}@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${dark}}}:root[data-theme="dark"]{${dark}}`;
    document.head.appendChild(st);
  }
  // publications.json lists topics as [{ topic, level }]; the renderers use a { topic: level } lookup
  const topicIds = new Set(topicsData.topics.map(t => t.id));
  pubs.forEach((p, i) => {
    p.topics = Object.fromEntries((p.topics || []).filter(({ topic, level }) => {
      const ok = topicIds.has(topic) && Number.isInteger(level) && level >= 1 && level <= MAX_LEVEL;
      if (!ok) console.warn(`publications.json: "${p.title}" has an unknown topic or a level outside 1-${MAX_LEVEL}:`, { topic, level });
      return ok;
    }).map(({ topic, level }) => [topic, level]));
    p.id = p.id || `pub-${i + 1}`;  // every paper gets an anchor so the map can link to it
  });
  if (topicsData.sort === "volume") {
    const stat = t => { const ps = pubs.filter(p => p.topics[t.id]); return { n: ps.length, last: Math.max(0, ...ps.map(p => p.year)), sum: ps.reduce((a, p) => a + p.topics[t.id], 0) }; };
    TOPICS.sort((a, b) => { const x = stat(a), y = stat(b); return y.n - x.n || y.last - x.last || y.sum - x.sum; });
  }
  // "neutral" topics (grey, e.g. work outside NLP) always come last
  TOPICS.sort((a, b) => !!a.neutral - !!b.neutral);
  const col = (id, lvl) => lvl ? `color-mix(in srgb, var(--c-${id}) ${mix(lvl)}%, var(--empty))` : "var(--empty)";
  const [y0, y1] = topicsData.years || [Math.min(...pubs.map(p => p.year)), Math.max(...pubs.map(p => p.year))];
  const YEARS = Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i);

  const state = { active: null, onlySel: true, pubsShown: 0 };  // pubsShown: how many papers the list shows (0 = default)
  const rerender = [];  // functions to call when shared state changes
  const update = () => rerender.forEach(f => f());

  /* ---------- long lists: the first few items, then one button: "Show N more" in steps, "Show less" at the end.
     While partly open, a quiet "Collapse" link beside it goes straight back to the first few. ---------- */
  const LIST_STEP = 5;  // items shown at first, and added per "Show more"
  const EASE = "cubic-bezier(.2,.7,.2,1)";
  const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  // empty space at the very end of the page, grown while a list collapses (see below)
  const endSpacer = document.createElement("div"); endSpacer.setAttribute("aria-hidden", "true");
  document.body.appendChild(endSpacer);
  // box: the list element (its height animates); items: its <li>s in order. opts.shown restores a count,
  // opts.onChange reports it, opts.afterApply tidies up after items are shown or hidden (e.g. empty year headings).
  const expandable = (section, box, items, limit, opts = {}) => {
    if (box.nextElementSibling?.classList.contains("more-wrap")) box.nextElementSibling.remove();
    box.classList.remove("expandable", "has-more");
    if (items.length <= limit) return;
    box.classList.add("expandable");
    const wrap = document.createElement("div"); wrap.className = "more-wrap";
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "more";
    const collapse = document.createElement("button"); collapse.type = "button"; collapse.className = "collapse"; collapse.textContent = "Collapse";
    const count = document.createElement("span"); count.className = "count";
    wrap.append(count, btn, collapse); box.after(wrap);  // count | button | collapse: the button stays centred
    let shown = Math.min(Math.max(opts.shown || limit, limit), items.length);
    const label = n => {
      const left = items.length - n;
      btn.textContent = left ? `Show ${Math.min(LIST_STEP, left)} more` : "Show less";
      btn.setAttribute("aria-expanded", !left);
      collapse.hidden = !left || n <= limit;
      count.textContent = `${n} of ${items.length}`;
      box.classList.toggle("has-more", left > 0);  // soft fade over the last item: the list goes on
    };
    const showItems = n => { items.forEach((li, i) => { li.hidden = i >= n; }); opts.afterApply?.(); };
    const apply = n => { showItems(n); label(n); };

    let running = null;  // { anim, done } for the animation in progress
    const setShown = n => {
      // start from what is on screen now, even mid-animation, so a quick second click doesn't jump
      const from = box.offsetHeight, anchor = wrap.getBoundingClientRect().top;
      if (running) { const r = running; running = null; r.anim.cancel(); r.done(true); }
      const before = shown; shown = n; opts.onChange?.(n);
      if (reducedMotion() || n === before) return apply(n);
      showItems(n); const to = box.offsetHeight;
      label(n);  // the button's text changes right away, not when the animation ends
      box.style.overflow = "hidden";
      const opening = n > before;
      let fades = [];
      if (opening) {
        items.slice(before, n).forEach((li, i) => li.animate(
          { opacity: [0, 1], transform: ["translateY(8px)", "none"] },
          { duration: 380, delay: i * 45, easing: EASE, fill: "backwards" }));
      } else {
        showItems(before);  // keep the closing items in place, fading, while the list folds up
        fades = items.slice(n, before).map(li => li.animate({ opacity: [1, 0] }, { duration: 220, easing: "ease-out", fill: "forwards" }));
      }
      const timing = { duration: opening ? 420 : 380, easing: EASE };
      const anim = box.animate({ height: [from + "px", to + "px"] }, timing);
      // closing: empty space at the end of the page grows as fast as the list shrinks, so the page keeps its
      // height and the browser never clamps the scroll position (at the bottom of the page that made the button
      // jump). It sits at the very end, not under the button, so the sections below stay put on screen.
      // The browser's own scroll anchoring is paused so it doesn't correct on top of ours.
      const spacer = opening ? null : endSpacer.animate({ height: ["0px", (from - to) + "px"] }, timing);
      if (!opening) document.documentElement.style.overflowAnchor = "none";
      // closing: scroll up as the list shrinks so the button stays under the pointer instead of the page
      // sliding away beneath it
      const follow = () => {
        if (running?.anim !== anim) return;
        const d = wrap.getBoundingClientRect().top - anchor;
        if (Math.abs(d) > .5) scrollBy({ top: d, behavior: "instant" });
        requestAnimationFrame(follow);
      };
      const done = (interrupted = false) => {
        box.style.overflow = "";
        if (!opening) {
          showItems(n); fades.forEach(f => f.cancel());
          const d = wrap.getBoundingClientRect().top - anchor;
          if (!interrupted && Math.abs(d) > .5) scrollBy({ top: d, behavior: "instant" });
          spacer.cancel();  // the scroll already moved up by the same amount, so removing the space changes nothing on screen
          document.documentElement.style.overflowAnchor = "";
        }
      };
      running = { anim, done };
      anim.onfinish = () => { if (running?.anim !== anim) return; running = null; done(); };
      if (!opening) requestAnimationFrame(follow);
    };
    btn.onclick = () => setShown(shown < items.length ? Math.min(shown + LIST_STEP, items.length) : limit);
    collapse.onclick = () => setShown(limit);
    apply(shown);
  };

  /* ---------- section renderers ---------- */
  const R = {};

  R.about = (s, el) => {
    el.innerHTML = head(s) + `<div class="bio">${(profile.bio || []).map(p => `<p>${md(p)}</p>`).join("")}</div>`;
  };

  R.rows = (s, el, items) => {
    el.innerHTML = head(s) + `<ul class="rows">${items.map(r => {
      const body = [r.title && `<b>${esc(r.title)}</b>`, r.text && md(r.text)].filter(Boolean).join(", ");
      const plain = [r.title, r.text].filter(Boolean).join(", ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*/g, "");
      return `
      <li class="row"><span class="k">${r.url ? `<a ${ext(r.url)}>${esc(r.key)}</a>` : esc(r.key)}</span>
        <p>${body}${r.note ? (plain.length > 70 ? `<br>` : " ") + `<span class="d">${md(r.note)}</span>` : ""}</p></li>`;
    }).join("")}</ul>`;
    const list = el.querySelector(".rows");
    expandable(el, list, [...list.children], s.show || LIST_STEP);
  };

  R.timeline = (s, el, items) => {
    const KIND = { paper: "Paper", release: "Release", talk: "Talk", milestone: "Milestone", award: "Award" };
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const sorted = items.slice().sort((a, b) => b.date.localeCompare(a.date));
    el.innerHTML = head(s) + `<ol class="timeline"></ol>`;
    const list = el.querySelector(".timeline");
    {
      let lastY = null, lastD = null;
      list.innerHTML = sorted.map(n => {
        const [y, m] = n.date.split("-"), newY = y !== lastY, sameD = n.date === lastD;
        lastY = y; lastD = n.date;
        return `<li class="ev k-${esc(n.kind)}${newY ? " ny" : ""}">
          <div class="when">${newY ? `<span class="yr">${y}</span>` : ""}<span class="mo">${sameD || !m ? "" : MON[+m - 1]}</span></div>
          <span class="node" aria-hidden="true"></span>
          <div class="what"><span class="kind">${esc(KIND[n.kind] || n.kind)}</span><p>${md(n.text)}</p></div></li>`;
      }).join("");
    }
    expandable(el, list, [...list.children], s.show || LIST_STEP);
  };

  const VENUE_TYPE = { conference: "Conference", journal: "Journal", workshop: "Workshop", preprint: "Preprint" };
  const VENUES = data["venues.json"] || {};  // venue code -> full name, shown when hovering a venue label
  R.publications = (s, el) => {
    const limit = s.show || LIST_STEP;
    el.innerHTML = `
      <div class="sh pubhead">
        <div class="sh"><h2>${esc(s.title)}</h2><span class="meta" data-meta></span></div>
        <div class="toggle" role="group" aria-label="Filter publications">
          <button type="button" data-sel="1">Selected</button><button type="button" data-sel="0">All</button>
        </div>
      </div>
      <p class="pubnote">${["conference", "journal", "workshop", "preprint"].map(t => `<span class="venue v-${t}">${VENUE_TYPE[t]}</span>`).join(" ")}<br>
        The small columns under each venue are the paper's topics; taller means a deeper contribution, out of ${MAX_LEVEL}.</p>
      <div class="filterbar" hidden></div>
      <div class="pubs"></div>`;
    const box = el.querySelector(".pubs"), fb = el.querySelector(".filterbar");
    el.querySelectorAll("[data-sel]").forEach(b => b.onclick = () => { state.onlySel = b.dataset.sel === "1"; state.pubsShown = 0; update(); });

    // only the paper's own topics, tallest first (ties keep chart-row order), as small columns whose height is the level (like
    // Google Scholar's citation bars) in the topic's full colour. Each column is a button named after its topic, so a
    // hover, tap, or keyboard focus shows the topic label (below); this replaces a text list under each paper.
    const fingerprint = p => `<span class="fp">${TOPICS.filter(t => p.topics[t.id]).sort((a, b) => p.topics[b.id] - p.topics[a.id]).map(t =>
      `<button type="button" class="sq${state.active === t.id ? " focus" : ""}" data-t="${esc(t.id)}" data-l="${p.topics[t.id]}" aria-label="${esc(`${t.name}: ${LEVEL(p.topics[t.id])}`)}"><i style="background:var(--c-${esc(t.id)});height:${Math.round(15 * p.topics[t.id] / MAX_LEVEL)}px"></i></button>`
    ).join("")}</span>`;

    // one shared glass label for the topic columns and the venue labels, filled with textContent
    const label = document.createElement("div"); label.className = "glass mini-tip"; label.hidden = true; document.body.appendChild(label);
    let labelFor = null;
    const TARGETS = ".sq, .venue";
    const showLabel = el => {
      const muted = text => { const n = document.createElement("span"); n.className = "lv"; n.textContent = text; return n; };
      if (el.classList.contains("venue")) {
        const p = pubs.find(x => x.id === el.closest(".pub")?.id);
        label.replaceChildren(document.createTextNode(VENUES[el.textContent] || el.textContent), muted(VENUE_TYPE[p?.type] || ""));
      } else {
        const t = TOPICS.find(t => t.id === el.dataset.t); if (!t) return;
        const dot = document.createElement("i"); dot.style.background = col(t.id, 3);
        label.replaceChildren(dot, document.createTextNode(t.name), muted(`${el.dataset.l}/${MAX_LEVEL}`));
      }
      label.hidden = false; labelFor = el;
      const r = el.getBoundingClientRect(), vw = document.documentElement.clientWidth;
      // starts at the element and runs right, over the paper's own column rather than into the side menu
      label.style.left = Math.min(Math.max(r.left - 4, 8), vw - 8 - label.offsetWidth) + "px";
      label.style.top = (r.top - label.offsetHeight - 6) + "px";
    };
    const hideLabel = () => { label.hidden = true; labelFor = null; };
    box.addEventListener("pointerover", e => { const el = e.target.closest(TARGETS); if (el && e.pointerType === "mouse") showLabel(el); });
    box.addEventListener("pointerout", e => { if (e.target.closest(TARGETS) && e.pointerType === "mouse") hideLabel(); });
    box.addEventListener("focusin", e => { const el = e.target.closest(TARGETS); if (el) showLabel(el); });
    box.addEventListener("focusout", e => { if (e.target.closest(TARGETS)) hideLabel(); });
    // touch has no hover: a tap shows the label, and a tap elsewhere (or a second tap) hides it
    document.addEventListener("click", e => {
      const el = e.target.closest?.(".pub .sq, .pub .venue");
      if (el && el !== labelFor) showLabel(el); else if (!el || e.pointerType !== "mouse") hideLabel();
    });
    addEventListener("scroll", hideLabel, { passive: true });
    const authors = a => { const e = esc(a); return ME ? e.replace(esc(ME), `<b>${esc(ME)}</b>`) : e; };

    rerender.push(() => {
      el.querySelectorAll("[data-sel]").forEach(b => b.setAttribute("aria-pressed", (b.dataset.sel === "1") === state.onlySel));
      const full = pubs.filter(p => (!state.onlySel || p.selected) && (!state.active || p.topics[state.active]))
        .sort((a, b) => b.year - a.year || (state.active ? b.topics[state.active] - a.topics[state.active] : 0));
      const list = full;  // long lists are cut by expandable() below; a topic filter shows every match
      // the list's own counter says how many are showing; the heading just says how many there are
      el.querySelector("[data-meta]").textContent = state.onlySel ? `${full.length} selected` : `${full.length} papers`;
      box.classList.toggle("filtered", !!state.active);
      if (state.active) {
        const t = TOPICS.find(t => t.id === state.active);
        fb.hidden = false;
        fb.innerHTML = `<span>${full.length} ${state.onlySel ? "selected " : ""}paper${full.length === 1 ? "" : "s"} on</span><b><i class="dot" style="--c:var(--c-${t.id})"></i>${esc(t.name)}</b><button type="button">Show all topics</button>`;
        fb.querySelector("button").onclick = () => { state.active = null; update(); };
      } else fb.hidden = true;
      const years = [...new Set(list.map(p => p.year))];
      box.innerHTML = list.length ? years.map(y => `
        <div class="year">${y}</div>
        <ol>${list.filter(p => p.year === y).map(p => `
          <li class="pub"${p.id ? ` id="${esc(p.id)}"` : ""}>
            <div class="lhs"><span class="venue v-${esc(p.type || "conference")}" tabindex="0" aria-label="${esc(`${VENUES[p.venue] || p.venue}, ${VENUE_TYPE[p.type] || ""}`)}">${esc(p.venue)}</span>${fingerprint(p)}</div>
            <div>
              <p class="t">${p.url ? `<a ${ext(p.url)}>${esc(p.title)}</a>` : `${esc(p.title)} <span class="tag">Accepted</span>`}${p.patent ? ` <a class="tag tag-patent" ${ext(p.patent)} title="Opens the patent this work led to">Led to a patent</a>` : ""}${p.thesis ? ` <a class="tag tag-thesis" ${ext(p.thesis)} title="Opens the M.Sc. thesis this work comes from">From M.Sc. thesis</a>` : ""}</p>
              <p class="au">${authors(p.authors)}</p>
              <p class="src">${esc(p.published_in)}</p>
            </div>
          </li>`).join("")}</ol>`).join("")
        : `<p class="lead">No selected papers on this topic. Switch to <b>All</b> to see every paper.</p>`;
      // a year heading goes with its papers: hidden while all of them are
      const tidyYears = () => box.querySelectorAll("ol").forEach(ol => { ol.hidden = ol.previousElementSibling.hidden = !ol.querySelector("li:not([hidden])"); });
      if (state.active) expandable(el, box, [], limit);  // filtered by topic: show every match
      else expandable(el, box, [...box.querySelectorAll("li.pub")], limit, { shown: state.pubsShown, onChange: n => { state.pubsShown = n; }, afterApply: tidyYears });
    });
  };

  R["research-map"] = (s, el) => {
    const meta = s.meta || `${TOPICS.length} topics · ${y0} – ${y1}`;
    el.innerHTML = head({ ...s, meta }) +
      `<p class="lead">${esc(s.lead || "Each dot is a paper. Hover a dot for details, click it to find the paper below, or select a topic to filter the publications.")}</p>
      <div class="map"></div><div class="keyrow"></div><div class="tip" role="tooltip" hidden></div>`;
    const map = el.querySelector(".map"), key = el.querySelector(".keyrow"), tip = el.querySelector(".tip");
    const dotMark = (id, l) => `<i style="background:${col(id, l)}"></i>`;
    const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Hovering a dot previews the paper; clicking it jumps to the paper in the list. Tooltip text comes from
    // data, so it is built with textContent, never innerHTML.
    const showTip = b => {
      const p = pubs.find(x => x.id === b.dataset.p); if (!p) return;
      map.querySelectorAll(".pt.hl").forEach(d => d.classList.remove("hl"));
      map.querySelectorAll(`.pt[data-p="${CSS.escape(p.id)}"]`).forEach(d => d.classList.add("hl"));
      map.classList.add("hovering");  // fades every other paper so this one's dots stand out
      tip.replaceChildren();
      const add = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; tip.appendChild(n); return n; };
      add("strong", "tip-title", p.title);  // cut to two lines; the list entry has the full title and link
      add("span", "tip-src", `${p.published_in || p.venue} · ${p.year}`);
      const topics = add("span", "tip-topics");  // topics flow as one line; two lines fit the most topics any paper has
      Object.entries(p.topics).sort((a, b) => b[1] - a[1]).forEach(([id, l]) => {
        const t = TOPICS.find(t => t.id === id); if (!t) return;
        const row = document.createElement("span"); row.className = "tip-t"; topics.appendChild(row);
        // the dot's shade carries the level, as on the chart
        const k = document.createElement("i"); k.style.background = col(id, l); k.title = LEVEL(l); row.appendChild(k);
        const nm = document.createElement("span"); nm.className = "tip-n"; nm.textContent = t.short || t.name; row.appendChild(nm);
      });
      add("span", "tip-hint", "Click the dot to see it in the publications");
      tip.hidden = false;
      // a paper's dots all sit in one year column, so the tooltip goes beside that column, level with the dot,
      // and may spill into the page margin. Only when neither side has room (phones) does it go above or below
      // the paper's dots. Either way it never hides them.
      const box = el.getBoundingClientRect(), r = b.getBoundingClientRect(), cell = b.parentElement.getBoundingClientRect();
      const own = [...map.querySelectorAll(".pt.hl")].map(d => d.getBoundingClientRect());
      const w = tip.offsetWidth, h = tip.offsetHeight, vw = document.documentElement.clientWidth, gap = 8;
      let x, y = r.top + r.height / 2 - h / 2;
      if (cell.right + gap + w <= vw - gap) x = cell.right + gap;
      else if (cell.left - gap - w >= gap) x = cell.left - gap - w;
      else {
        x = Math.min(Math.max(r.left + r.width / 2 - w / 2, gap), vw - gap - w);
        const top = Math.min(...own.map(o => o.top)), bottom = Math.max(...own.map(o => o.bottom));
        y = top - gap - h >= gap ? top - gap - h : bottom + gap;
      }
      tip.style.left = (x - box.left) + "px";
      tip.style.top = (y - box.top) + "px";
    };
    const hideTip = () => { tip.hidden = true; map.classList.remove("hovering"); map.querySelectorAll(".pt.hl").forEach(d => d.classList.remove("hl")); };

    // jump to a paper in the list, widening the list's filters first if they would hide it
    const goTo = id => {
      const p = pubs.find(x => x.id === id); if (!p) return;
      if (state.onlySel && !p.selected) state.onlySel = false;
      if (state.active && !p.topics[state.active]) state.active = null;
      state.pubsShown = Infinity;
      hideTip(); update();
      const li = document.getElementById(id); if (!li) return;
      li.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "center" });
      li.classList.add("flash"); setTimeout(() => li.classList.remove("flash"), 1800);
    };

    rerender.push(() => {
      hideTip();  // the dots are rebuilt below, so an open tooltip would point at nothing
      const cols = `grid-template-columns:repeat(${YEARS.length},1fr)`;
      let h = `<div class="map-grid"><span></span><div class="yrs" style="${cols}">${YEARS.map(y => `<span class="map-yr">'${String(y).slice(2)}</span>`).join("")}</div><span class="map-yr n">#</span>`;
      for (const t of TOPICS) {
        const n = pubs.filter(p => p.topics[t.id]).length;
        const cells = YEARS.map(y => `<span class="cell">${pubs.filter(p => p.year === y && p.topics[t.id])
          .sort((a, b) => b.topics[t.id] - a.topics[t.id])
          .map(p => `<button type="button" class="pt" data-p="${esc(p.id)}" aria-label="${esc(`${p.title} (${p.year}), ${t.name}: ${LEVEL(p.topics[t.id])}`)}">${dotMark(t.id, p.topics[t.id])}</button>`).join("")}</span>`).join("");
        h += `<div class="topic${state.active === t.id ? " on" : ""}" style="--c:var(--c-${t.id})">
          <button type="button" data-t="${esc(t.id)}" aria-pressed="${state.active === t.id}" title="${esc(t.description || "")}"><span class="dot"></span>${esc(t.short || t.name)}</button>
          <span class="cells" style="${cols}">${cells}</span>
          <span class="cnt">${n}</span></div>`;
      }
      map.innerHTML = h + "</div>";
      map.classList.toggle("dim", !!state.active);
      map.querySelectorAll("button[data-t]").forEach(b => b.onclick = () => {
        state.active = state.active === b.dataset.t ? null : b.dataset.t;
        update();
        const pubsEl = document.querySelector('section[data-type="publications"]');
        if (state.active && pubsEl) pubsEl.scrollIntoView({ behavior: reduced() ? "auto" : "smooth" });
      });
      map.querySelectorAll(".pt").forEach(b => {
        b.onpointerenter = b.onfocus = () => showTip(b);
        b.onpointerleave = b.onblur = hideTip;
        b.onclick = () => goTo(b.dataset.p);
      });
      const c = state.active || (TOPICS[0] && TOPICS[0].id);
      key.innerHTML = c ? `<span>${[1, Math.ceil(MAX_LEVEL / 2), MAX_LEVEL].map(l => dotMark(c, l)).join("")}</span>Darker color, deeper contribution.` : "";
    });
  };

  /* ---------- build sections in the order site.json gives ---------- */
  const main = $("sections");
  for (const s of site.sections) {
    const el = document.createElement("section");
    el.id = s.id; el.dataset.type = s.type;
    main.appendChild(el);
    const fn = R[s.type];
    if (!fn) { el.innerHTML = head(s) + `<p class="err">Unknown section type "${esc(s.type)}".</p>`; continue; }
    fn(s, el, s.source ? data[s.source] : null);
  }
  update();
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();

  /* ---------- highlight the nav link for the section in view ---------- */
  const navLinks = [...$("nav").querySelectorAll("a")];
  const spy = () => {
    let cur = null;
    for (const sec of main.children) if (sec.getBoundingClientRect().top <= innerHeight * 0.3) cur = sec.id;
    // short sections at the very bottom never reach the line above, so the last one wins at the end of the page
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) cur = main.lastElementChild?.id;
    navLinks.forEach(a => a.getAttribute("href") === "#" + cur ? a.setAttribute("aria-current", "location") : a.removeAttribute("aria-current"));
  };
  addEventListener("scroll", spy, { passive: true });
  addEventListener("resize", spy);
  spy();

  /* ---------- theme toggle ---------- */
  const root = document.documentElement;
  const isDark = () => root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  $("theme-toggle").onclick = () => {
    const next = isDark() ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (e) {}
  };
})();
