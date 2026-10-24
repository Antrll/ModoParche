/* =====================================================================
   Modo Parche Business · empresa-dashboard.js
   Parte 1: charts.js de la taste-skill de Leonxlnx (gráficas SVG sin
   dependencias, con las reglas de app-screens.md). Parte 2: el panel.
===================================================================== */

// tasteskill / charts.js — small, dependency-free charts for app screens, drawn in SVG from your data.
// They follow references/app-screens.md: one question per chart, one series that matters, 3–5 quiet
// horizontal gridlines, round ticks that top out above the largest value, 2px straight lines with no
// markers, square bars, no gradients, a bare tooltip, tabular figures. Colours come from CSS variables:
//   --chart-1 … --chart-4 (series), --chart-muted (other series), --chart-mark (a marked period; ink by default),
//   --chart-span (the opacity of a shaded span: about .06 on light, .12 on dark), --chart-track (a time strip's track),
//   --grid, --axis-ink, --ink, --surface, --raised, --rule, --negative
// Usage (after this file loads):
//   Charts.line(el, { labels: ['1 Oct', …], series: [{ name: 'Requests', values: [...] }], format: Charts.fmt.compact })
//   Charts.bars(el, { labels, values, highlight: 6, format })        one bar (or [indices]) may carry the accent; dim: [indices]
//   Charts.diverging(el, { labels, up, down, above: 'Sold', below: 'Bought', mark: [3, 9], markLabel: 'Car charged' })
//   Charts.ring(el, { value: 0.72, label: '72%', sub: 'of capacity' }) a progress ring with its total inside
//   Charts.barList(el, [{ label: 'Berlin', value: 412 }, …], { format, thin })  a ranked list where the row is the bar
//   Charts.plan(el, [{ label: 'Groceries', planned: 600, spent: 412, committed: 60 }, …], { scale: 'row' | 'plan' })  planned against spent
//   Charts.bullet(el, [{ label: 'Bonds', value: 0.31, target: 0.25 }, …])   share against a target
//   Charts.timeline(el, rows, kinds, { days, today, weekends })      who is away when, each kind of booking its own mark
//   Charts.matrix(el, rows, { cols, comfort: 2, today })             slack against a minimum, team by day
//   Charts.timeStrip(el, rows, { open: '08:00', close: '15:00', compareLabel: 'Last Sunday' })  when, within the day
// line, bars and diverging take annotations: [{ at: index, label: 'Deploy a3f09c1', short: 'a3f09c1' }] or spans
// [{ from, to, label: 'Cloud' }]. Their labels sit in rows above the plot, measured once the fonts have loaded, and no
// leader line crosses another label; the rows are reserved only when a label exists. reference: { value, label }, its
// label set where no series passes.
// line takes step: true for a balance that only changes on given days; today: index (the forecast after it is dashed)
// with todayLabel: 'Now 20:34' (set clear of the line); endLabel: true (the last value at the line's end); max: caps a
// flat series with one spike (the peak is labelled); yTicks: fixed ticks for a bounded quantity (0–100%); tickFormat:
// axis labels apart from the tooltip format; xAt: the indices to label. Without xAt the x labels keep one step.
// diverging, timeline, matrix and timeStrip return { svg, legend }, and line returns { legend } for two series or more:
// the legend is drawn from the same style objects as the marks, so a swatch is always the mark scaled down. Put it in
// the card's header, or pass legend: element (or a selector) to have it filled.
// Numbers follow the page's language (<html lang>). Every chart gets role="img" and an aria-label that states what it shows.
(() => {
  const NS = 'http://www.w3.org/2000/svg', MINUS = '\u2212', ROW = 14, LANE = (rows) => 8 + rows * ROW + (rows ? 4 : 0);
  const css = (el, name, fb) => getComputedStyle(el).getPropertyValue(name).trim() || fb;
  const cssNum = (el, name, fb) => { const v = parseFloat(css(el, name, '')); return Number.isFinite(v) ? v : fb; };
  const svg = (tag, attrs = {}, parent) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v); if (parent) parent.appendChild(n); return n; };
  const text = (parent, str, attrs) => { const t = svg('text', attrs, parent); t.textContent = str; return t; };
  const titled = (parent, str) => { svg('title', {}, parent).textContent = str; return parent; };
  // numbers follow the page's language (<html lang>), so separators match the rest of the screen
  const nf = (o) => new Intl.NumberFormat(document.documentElement.lang || 'en', o);
  const fmt = {
    int: (v) => nf({ maximumFractionDigits: 0 }).format(v),
    dec: (d) => (v) => nf({ minimumFractionDigits: d, maximumFractionDigits: d }).format(v),
    pct: (d = 1) => (v) => nf({ style: 'percent', minimumFractionDigits: d, maximumFractionDigits: d }).format(v),
    money: (cur = 'EUR', d = 0) => (v) => nf({ style: 'currency', currency: cur, minimumFractionDigits: d, maximumFractionDigits: d }).format(v),
    compact: (v) => nf({ notation: 'compact', maximumFractionDigits: 1 }).format(v),
    ms: (v) => `${nf({ maximumFractionDigits: 0 }).format(v)} ms`,
    // a sign on every change, with a true minus: fmt.signed() → '+2', '0', '−1'; fmt.signed(fmt.dec(1)) → '+0.4'
    signed: (f = (v) => nf({ maximumFractionDigits: 0 }).format(v)) => (v) => (v > 0 ? '+' : v < 0 ? MINUS : '') + f(Math.abs(v)),
    // minutes since midnight as a 24-hour time: 680 → '11:20'
    clock: (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`, // taste-skill-ignore: a clock, not a counter
  };
  const minutes = (t) => (t == null || t === '' ? null : typeof t === 'number' ? t : (([hh, mm]) => hh * 60 + (mm || 0))(String(t).split(':').map(Number)));
  // Round ticks (steps of 1, 2, 2.5 or 5 × 10^n) whose top sits above the largest value.
  function ticks(min, max, count = 4) {
    if (max === min) max = min + 1;
    const raw = (max - min) / count, mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
    const lo = Math.floor(min / step) * step; let hi = Math.ceil(max / step) * step; if (hi <= max) hi += step;
    const out = []; for (let v = lo; v <= hi + step / 2; v += step) out.push(+v.toFixed(10));
    return out;
  }
  // x labels keep one step all the way: every k-th label, with k chosen so the labels fit the width, and a step that
  // lands on the last label when one gives enough labels. Never a forced end label that breaks the step. Clock labels
  // ('08:30') step in whole hours (or halves and quarters) from a round time, so a half-hourly axis reads 06:00, 09:00.
  function xPicks(labels, span, at) {
    const n = labels.length;
    if (at) return at.filter((i) => i >= 0 && i < n);
    if (n <= 1) return n ? [0] : [];
    const longest = Math.max(...labels.map((l) => String(l).length));
    const cap = Math.max(2, Math.min(8, Math.floor(span / (longest * 7 + 18))));
    if (n <= cap) return [...Array(n).keys()];
    const mins = labels.every((l) => /^\d{1,2}:\d{2}$/.test(String(l))) ? labels.map(minutes) : null;
    const d = mins ? mins[1] - mins[0] : 0;
    let first = null, land = null;
    for (let k = 1; k < n; k++) {
      const stepM = k * d, clock = mins && d > 0;
      if (clock && (stepM >= 60 ? ![1, 2, 3, 4, 6, 12].includes(stepM / 60) : 60 % stepM !== 0)) continue;
      // start on a round time: a multiple of the step (09:00 for three hours), or a whole hour for shorter steps
      let s = clock ? mins.findIndex((m) => m % Math.max(60, stepM) === 0) : 0;
      if (s < 0) s = Math.max(0, mins.findIndex((m) => m % 60 === 0));
      const count = Math.floor((n - 1 - s) / k) + 1;
      if (count > cap) continue;
      if (first == null) first = { k, s };
      if ((n - 1 - s) % k === 0) { land = { k, s, count }; break; }
    }
    const pick = land && land.count >= Math.max(3, Math.ceil(cap * 0.6)) ? land : first || { k: n - 1, s: 0 };
    const out = []; for (let i = pick.s; i < n; i += pick.k) out.push(i);
    return out;
  }
  // colours: tokens resolved to rgb, so a mark can be mixed with the surface (a pale fill, a darker step)
  const swatchProbe = document.createElement('span'); swatchProbe.style.display = 'none';
  const rgb = (el, value) => {
    el.appendChild(swatchProbe); swatchProbe.style.color = ''; swatchProbe.style.color = value;
    const c = getComputedStyle(swatchProbe).color; swatchProbe.remove();
    const m = c.match(/-?[\d.]+/g); if (!m || m.length < 3) return null;
    return c.startsWith('color(') ? m.slice(0, 3).map((v) => Math.round(+v * 255)) : m.slice(0, 3).map(Number);
  };
  const mix = (el, a, b, t) => { const p = rgb(el, a), q = rgb(el, b); return p && q ? `rgb(${p.map((v, i) => Math.round(v * t + q[i] * (1 - t))).join(',')})` : a; };
  // text width, measured in the chart's own face (falls back to an estimate when the chart is hidden)
  const measure = (s, str, size = 11, weight = 400) => { const t = text(s, str, { x: -999, y: -999, 'font-size': size, 'font-weight': weight, visibility: 'hidden' }); let wd = 0; try { wd = t.getComputedTextLength(); } catch {} t.remove(); return wd > 0 ? wd : String(str).length * size * 0.56; };
  const fit = (s, str, max, size, weight) => { str = String(str); if (measure(s, str, size, weight) <= max) return str; while (str.length > 1 && measure(s, str + '\u2026', size, weight) > max) str = str.slice(0, -1); return str.trimEnd() + '\u2026'; };
  function frame(el, h) {
    el.innerHTML = '';
    const w = Math.max(240, el.clientWidth || 600);
    const s = svg('svg', { viewBox: `0 0 ${w} ${h}`, width: '100%', height: h, role: 'img', style: 'display:block;overflow:visible;font-variant-numeric:tabular-nums' }, el);
    return { s, w, h };
  }
  function tooltip(el) {
    let t = el.querySelector('.chart-tip');
    if (!t) { t = document.createElement('div'); t.className = 'chart-tip'; t.style.cssText = 'position:absolute;pointer-events:none;padding:6px 8px;font:inherit;font-size:12px;line-height:1.35;border-radius:6px;white-space:nowrap;opacity:0;transition:opacity 120ms ease;background:var(--surface,#fff);color:var(--ink,#111);border:1px solid var(--grid,#e5e7eb)'; if (getComputedStyle(el).position === 'static') el.style.position = 'relative'; el.appendChild(t); }
    return t;
  }
  function axes(g, el, { w, h, padL, padB, yt, y, labels, x, band = false, at = null, tick, avoid = null }) {
    const grid = css(el, '--grid', '#e8e8e8'), ink = css(el, '--axis-ink', '#6b6b6b'), s = g.ownerSVGElement;
    for (const v of yt) {
      const yy = y(v);
      svg('line', { x1: padL, x2: w, y1: yy, y2: yy, stroke: grid, 'stroke-width': 1, 'shape-rendering': 'crispEdges' }, g);
      text(g, tick(v), { x: padL - 8, y: yy + 4, 'text-anchor': 'end', 'font-size': 12, fill: ink });
    }
    const n = labels.length;
    for (const i of xPicks(labels, w - padL, at)) {
      const lab = String(labels[i]), tw = measure(s, lab, 12), xx = x(i);
      // the first and last labels are pulled inside the plot; none runs past either edge
      let left = band ? xx - tw / 2 : i === 0 ? xx : i === n - 1 ? xx - tw : xx - tw / 2;
      left = Math.max(band ? 0 : padL, Math.min(w - tw, left));
      if (avoid && left < avoid[1] + 8 && left + tw > avoid[0] - 8) continue;
      text(g, lab, { x: left, y: h - padB + 18, 'font-size': 12, fill: ink });
    }
  }
  // Annotation labels sit in rows above the plot, never on the data. A label sits beside the top of its own leader
  // line, right of it or left of it, in one of three rows. A place is free when no other label in that row overlaps
  // it, no leader line passes through it, and its own leader passes through no label below it. The layout is searched
  // (close markers often need the first label on the left so the next leader runs clear): full labels first, then
  // short forms (`short`), and only then is a label dropped to its marker's tooltip, with a note in the console.
  function lane(s, items, w, maxRows = 3) {
    const gap = 6, rank = (it) => (it.fixed != null ? 0 : it.span ? 1 : 2);
    // fixed captions first, then spans, then markers from left to right
    const order = [...items].sort((a, b) => rank(a) - rank(b) || (a.x ?? a.x0) - (b.x ?? b.x0));
    const opts = order.map((it) => {
      const out = [];
      for (const str of [it.label, it.short].filter(Boolean)) {
        const tw = measure(s, str, 11) + (it.glyph ? 9 : 0), mid = it.span ? (it.x0 + it.x1) / 2 : 0;
        const cands = it.fixed != null ? [[it.fixed, it.fixed + tw]] : it.span ? [[mid - tw / 2, mid + tw / 2], [it.x0, it.x0 + tw], [it.x1 - tw, it.x1]] : [[it.x + 4, it.x + 4 + tw], [it.x - 4 - tw, it.x - 4]];
        for (let row = 0; row < maxRows; row++) for (const [x0, x1] of cands) if (x0 >= 0 && x1 <= w) out.push({ ...it, text: str, isShort: str !== it.label, row, x0, x1 });
      }
      return out;
    });
    const free = (c, placed) => placed.every((p) => p.dropped || (!(p.row === c.row && c.x0 < p.x1 + gap && c.x1 > p.x0 - gap)
      && !(p.leader != null && p.row >= c.row && p.leader > c.x0 - 3 && p.leader < c.x1 + 3)
      && !(c.leader != null && p.row <= c.row && c.leader > p.x0 - 3 && c.leader < p.x1 + 3)));
    let best = null, steps = 0;
    const solve = (i, placed, allowShort, allowDrop) => {
      if (++steps > 20000) return false;
      if (i === order.length) { best = placed.slice(); return true; }
      for (const c of opts[i]) { if ((c.isShort && !allowShort) || !free(c, placed)) continue; placed.push(c); if (solve(i + 1, placed, allowShort, allowDrop)) return true; placed.pop(); }
      if (allowDrop) { placed.push({ ...order[i], dropped: true }); if (solve(i + 1, placed, allowShort, allowDrop)) return true; placed.pop(); }
      return false;
    };
    for (const [sh, dr] of [[false, false], [true, false], [true, true]]) { steps = 0; if (solve(0, [], sh, dr)) break; }
    const placed = (best || []).filter((p) => !p.dropped), dropped = (best || order.map((it) => ({ ...it, dropped: true }))).filter((p) => p.dropped);
    return { placed, dropped, rows: placed.length ? Math.max(...placed.map((p) => p.row)) + 1 : 0 };
  }
  function prepNotes(s, annotations = [], x, w, extra = []) {
    const items = [];
    for (const a of annotations || []) {
      if (a.from != null) items.push({ span: true, x0: Math.min(x(a.from), x(a.to)), x1: Math.max(x(a.from), x(a.to)), label: a.label, short: a.short, colour: a.colour });
      else if (a.at != null) items.push({ x: x(a.at), at: a.at, leader: x(a.at), label: a.label, short: a.short, colour: a.colour });
    }
    items.push(...extra);
    return { items, ...lane(s, items.filter((it) => it.label), w) };
  }
  // shaded spans go under the data; marker lines and the label rows over it
  function notesUnder(g, el, N, { padT, h, padB }) {
    const ink = css(el, '--axis-ink', '#6b6b6b'), op = cssNum(el, '--chart-span', 0.07);
    for (const it of N.items) if (it.span) svg('rect', { x: it.x0, y: padT, width: it.x1 - it.x0, height: h - padT - padB, fill: ink, opacity: op }, g);
  }
  function notesOver(g, el, N, { padT, h, padB }) {
    const ink = css(el, '--axis-ink', '#6b6b6b');
    // a marker line runs to the plot's foot, or stops above the bar it points at (it.end)
    for (const it of N.items) if (it.leader != null && !it.drawn) svg('line', { x1: it.leader, x2: it.leader, y1: padT, y2: Math.max(padT, it.end ?? h - padB), stroke: ink, 'stroke-width': 1, opacity: 0.45, 'shape-rendering': 'crispEdges' }, g);
    for (const p of N.placed) {
      const base = padT - 9 - p.row * ROW;
      if (p.leader != null) svg('line', { x1: p.leader, x2: p.leader, y1: base - 8, y2: padT, stroke: ink, 'stroke-width': 1, opacity: 0.45, 'shape-rendering': 'crispEdges' }, g);
      if (p.glyph) svg('path', { d: p.glyph === 'up' ? `M${p.x0} ${base - 1}l3 -6l3 6z` : `M${p.x0} ${base - 7}l3 6l3 -6z`, fill: ink }, g);
      text(g, p.text, { x: p.x0 + (p.glyph ? 9 : 0), y: base, 'font-size': 11, fill: p.colour || ink });
    }
    const el2 = g.ownerSVGElement.parentNode; el2._warned = el2._warned || new Set();
    for (const d of N.dropped) {
      if (d.leader != null) { const hit = svg('line', { x1: d.leader, x2: d.leader, y1: padT, y2: h - padB, stroke: 'transparent', 'stroke-width': 8 }, g); titled(hit, d.label, {}); }
      if (!el2._warned.has(d.label)) { el2._warned.add(d.label); console.warn(`Charts: no room above the plot for "${d.label}". Give it a short form (short) or label fewer markers.`); }
    }
  }
  // does a label box touch a drawn line? polylines are [[x, y], …]; a box is { x0, x1, y0, y1 }
  function hits(b, lines) {
    for (const pts of lines) for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], c = pts[k]; if (!a || !c) continue;
      if (a[0] === c[0]) { if (a[0] >= b.x0 - 3 && a[0] <= b.x1 + 3 && Math.max(a[1], c[1]) >= b.y0 - 3 && Math.min(a[1], c[1]) <= b.y1 + 3) return true; continue; }
      const lo = Math.max(b.x0 - 3, Math.min(a[0], c[0])), hi = Math.min(b.x1 + 3, Math.max(a[0], c[0]));
      for (let xx = lo; xx <= hi; xx += 2) { const yy = a[1] + ((xx - a[0]) / (c[0] - a[0])) * (c[1] - a[1]); if (yy >= b.y0 - 3 && yy <= b.y1 + 3) return true; }
    }
    return false;
  }
  const boxHits = (b, boxes) => boxes.some((r) => b.x0 < r.x1 + 3 && b.x1 > r.x0 - 3 && b.y0 < r.y1 + 3 && b.y1 > r.y0 - 3);
  // a reference line (a budget, an SLO) with its label at an end where no series passes
  function references(g, el, refs, { y, padL, w, lines = [], boxes = [] }) {
    const ink = css(el, '--axis-ink', '#6b6b6b'), s = g.ownerSVGElement;
    for (const r of [].concat(refs || [])) {
      const yy = y(r.value);
      svg('line', { x1: padL, x2: w, y1: yy, y2: yy, stroke: ink, 'stroke-width': 1, 'stroke-dasharray': '4 4', opacity: 0.7 }, g);
      if (!r.label) continue;
      const tw = measure(s, r.label, 11), right = r.at !== 'left';
      const cand = [[right, -5], [right, 13], [!right, -5], [!right, 13]].map(([rt, dy]) => ({ x0: rt ? w - tw : padL + 4, x1: rt ? w : padL + 4 + tw, y0: yy + dy - 9, y1: yy + dy + 2, base: yy + dy }));
      const b = cand.find((c) => !hits(c, lines) && !boxHits(c, boxes)) || cand[0];
      text(g, r.label, { x: b.x0, y: b.base, 'font-size': 11, fill: ink });
    }
  }
  // One style object per kind of mark draws both the mark and its legend swatch, so the two cannot drift apart.
  function paintRect(parent, st, x, y, w, h, r = 0) {
    let fill = st.fill || 'none';
    if (st.hatch) {
      const s = parent.ownerSVGElement || parent, id = 'h' + Math.random().toString(36).slice(2, 8);
      const p = svg('pattern', { id, width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, svg('defs', {}, s));
      svg('rect', { width: 5, height: 5, fill: st.fill }, p); svg('line', { x1: 0, y1: 0, x2: 0, y2: 5, stroke: st.hatch, 'stroke-width': 1.2 }, p);
      fill = `url(#${id})`;
    }
    const inset = st.stroke ? (st.width || 1) / 2 : 0;
    const n = svg('rect', { x: x + inset, y: y + inset, width: Math.max(0, w - inset * 2), height: Math.max(0, h - inset * 2), rx: r, fill, stroke: st.stroke, 'stroke-width': st.stroke ? st.width || 1 : null, 'stroke-dasharray': st.dash, opacity: st.opacity, 'shape-rendering': r ? null : 'crispEdges' }, parent);
    if (st.edge) svg('rect', { x, y, width: 3, height: h, rx: Math.min(r, 1.5), fill: st.edge }, parent);
    return n;
  }
  const legendCss = ':where(.chart-legend){list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;line-height:16px;color:var(--muted,#5f6368)}:where(.chart-legend li){display:inline-flex;align-items:center;gap:6px;white-space:nowrap}:where(.chart-legend svg){flex:none;overflow:visible}@media (max-width:480px){:where(.chart-legend){display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}}';
  function legendEl(items, target) {
    if (!document.getElementById('charts-legend-css')) { const st = document.createElement('style'); st.id = 'charts-legend-css'; st.textContent = legendCss; document.head.appendChild(st); }
    const ul = document.createElement('ul'); ul.className = 'chart-legend';
    for (const it of items) {
      const li = document.createElement('li'), sw = svg('svg', { width: it.w || 14, height: 12, 'aria-hidden': 'true' });
      it.draw(sw); li.append(sw, document.createTextNode(it.label)); ul.appendChild(li);
    }
    const t = typeof target === 'string' ? document.querySelector(target) : target;
    if (t) t.replaceChildren(ul);
    return ul;
  }
  const rectSwatch = (st, w = 14, h = 10, r = 2) => (sw) => paintRect(sw, st, 0, (12 - h) / 2, w, h, r);
  // charts are laid out with measured text: draw again once the page's fonts have arrived
  function settle(draw) { if (document.fonts) { document.fonts.ready.then(draw); document.fonts.addEventListener?.('loadingdone', draw, { once: true }); } }
  const heightOf = (h) => (typeof h === 'function' ? h() : h);

  function line(el, { labels, series, format = fmt.int, tickFormat = null, height = 220, fill = false, min, max, step = false, annotations, reference, today = null, todayLabel = 'Today', endLabel = false, yTicks = null, xAt = null, legend = null }) {
    el._fmt = format;
    const colourOf = (sr, k) => sr.colour || (k === 0 ? css(el, '--chart-1', '#2f6fdf') : css(el, `--chart-${k + 1}`, css(el, '--chart-muted', '#a3a3a3')));
    const draw = () => {
      const { s, w, h } = frame(el, heightOf(height));
      const all = series.flatMap((x) => x.values.filter((v) => v != null)).concat([].concat(reference || []).map((r) => r.value));
      // max caps the range (a flat series with one spike): values above it are clipped and their peak labelled
      const top = max ?? Math.max(...all);
      const yt = yTicks || ticks(min ?? Math.min(0, ...all), top, 4);
      const tick = tickFormat || format;
      const lastVal = series[0].values.filter((v) => v != null).at(-1);
      const padL = 12 + Math.max(...yt.map((v) => measure(s, tick(v), 12))), padB = 26, padR = endLabel ? 10 + measure(s, format(lastVal), 12, 600) : 0;
      const x = (i) => padL + (i * (w - padL - padR)) / Math.max(1, labels.length - 1);
      // the peaks clipped by max are labelled in the rows above the plot, where the line leaves it
      const peaks = [];
      series.forEach((sr, k) => sr.values.forEach((v, i) => { if (v != null && v > yt.at(-1) && (i === 0 || sr.values[i - 1] == null || sr.values[i - 1] <= yt.at(-1))) { let j = i, peak = v; while (j < sr.values.length && sr.values[j] != null && sr.values[j] > yt.at(-1)) { peak = Math.max(peak, sr.values[j]); j++; } peaks.push({ x: x(i), label: format(peak) + ' at ' + labels[i], colour: colourOf(sr, k) }); } }));
      const scale = (N) => { const padT = LANE(N.rows); return { padT, y: (v) => padT + (h - padT - padB) * (1 - (v - yt[0]) / (yt.at(-1) - yt[0])) }; };
      const linesAt = (y) => series.map((sr) => { const out = []; sr.values.forEach((v, i) => { if (v == null) { out.push(null); return; } const p = [x(i), y(Math.min(v, yt.at(-1)))]; const prev = out.at(-1); if (step && prev) out.push([p[0], prev[1]]); out.push(p); }); return out; }).concat([].concat(reference || []).map((r) => [[padL, y(r.value)], [w, y(r.value)]]));
      let N = prepNotes(s, annotations, x, w, peaks), { padT, y } = scale(N), todayBox = null;
      // the today label goes inside the plot on whichever side of its line no series crosses; failing that, above
      if (today != null && todayLabel) {
        const cut = x(today), tw = measure(s, todayLabel, 11), lines = linesAt(y);
        const cand = [[cut + 4, h - padB - 6], [cut - 4 - tw, h - padB - 6], [cut + 4, padT + 11], [cut - 4 - tw, padT + 11]].map(([x0, b]) => ({ x0, x1: x0 + tw, y0: b - 9, y1: b + 2, base: b }));
        todayBox = cand.find((b) => b.x0 >= padL && b.x1 <= w && !hits(b, lines)) || null;
        if (!todayBox) { N = prepNotes(s, annotations, x, w, [...peaks, { x: cut, leader: cut, drawn: true, label: todayLabel }]); ({ padT, y } = scale(N)); }
      }
      const g = svg('g', {}, s);
      axes(g, el, { w, h, padL, padB, yt, y, labels, x, at: xAt, tick });
      notesUnder(g, el, N, { padT, h, padB });
      series.forEach((sr, k) => {
        const col = colourOf(sr, k);
        const pts = sr.values.map((v, i) => (v == null ? null : [x(i), y(Math.min(v, yt.at(-1)))]));
        // step: a balance that only changes on given days holds its value until the next one
        const d = pts.reduce((acc, p, i) => (p ? acc + (acc && pts[i - 1] ? (step ? `L${p[0].toFixed(1)} ${pts[i - 1][1].toFixed(1)}L` : 'L') : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1) : acc), '');
        if (fill && k === 0) { const first = pts.find(Boolean), last = [...pts].reverse().find(Boolean); svg('path', { d: `${d}L${last[0]} ${y(yt[0])}L${first[0]} ${y(yt[0])}Z`, fill: col, opacity: 0.12 }, g); }
        if (today == null) svg('path', { d, fill: 'none', stroke: col, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g);
        else {
          // a forecast: the line after today is dashed, so a projection never reads as a fact
          const cut = x(today), id = 'c' + k + Math.random().toString(36).slice(2, 8);
          const defs = svg('defs', {}, g);
          const a = svg('clipPath', { id: id + 'a' }, defs); svg('rect', { x: 0, y: 0, width: cut, height: h }, a);
          const b = svg('clipPath', { id: id + 'b' }, defs); svg('rect', { x: cut, y: 0, width: w, height: h }, b);
          svg('path', { d, fill: 'none', stroke: col, 'stroke-width': 2, 'stroke-linejoin': 'round', 'clip-path': 'url(#' + id + 'a)' }, g);
          svg('path', { d, fill: 'none', stroke: col, 'stroke-width': 2, 'stroke-dasharray': '5 4', opacity: 0.8, 'clip-path': 'url(#' + id + 'b)' }, g);
          if (k === 0) { svg('line', { x1: cut, x2: cut, y1: padT, y2: h - padB, stroke: css(el, '--axis-ink', '#6b6b6b'), 'stroke-width': 1, opacity: 0.4 }, g); if (todayBox) text(g, todayLabel, { x: todayBox.x0, y: todayBox.base, 'font-size': 11, fill: css(el, '--axis-ink', '#6b6b6b') }); }
        }
        if (endLabel && k === 0) { const li = sr.values.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0).at(-1); text(g, format(sr.values[li]), { x: x(li) + 6, y: y(Math.min(sr.values[li], yt.at(-1))) + 4, 'font-size': 12, 'font-weight': 600, fill: css(el, '--ink', '#111') }); }
      });
      references(g, el, reference, { y, padL, w, lines: linesAt(y).slice(0, series.length) });
      notesOver(g, el, N, { padT, h, padB });
      // hover: a rule, a dot per series and a bare tooltip
      const tip = tooltip(el), rule = svg('line', { y1: padT, y2: h - padB, stroke: css(el, '--axis-ink', '#6b6b6b'), 'stroke-width': 1, opacity: 0 }, g);
      const dots = series.map((sr, k) => svg('circle', { r: 3.5, fill: css(el, '--surface', '#fff'), stroke: colourOf(sr, k), 'stroke-width': 2, opacity: 0 }, g));
      const hit = svg('rect', { x: padL, y: padT, width: w - padL, height: h - padT - padB, fill: 'transparent' }, s);
      const move = (ev) => { const r = s.getBoundingClientRect(); const px = ((ev.clientX - r.left) / r.width) * w; const i = Math.max(0, Math.min(labels.length - 1, Math.round(((px - padL) / (w - padL - padR)) * (labels.length - 1)))); rule.setAttribute('x1', x(i)); rule.setAttribute('x2', x(i)); rule.setAttribute('opacity', 0.35); series.forEach((sr, k) => { const v = sr.values[i]; dots[k].setAttribute('cx', x(i)); dots[k].setAttribute('cy', v == null ? -99 : y(Math.min(v, yt.at(-1)))); dots[k].setAttribute('opacity', v == null ? 0 : 1); }); tip.innerHTML = `<div style="opacity:.7">${labels[i]}</div>` + series.map((sr) => `<div><b style="font-weight:600">${sr.values[i] == null ? '–' : format(sr.values[i])}</b> ${series.length > 1 ? sr.name : ''}</div>`).join(''); const left = Math.min((x(i) / w) * r.width + 12, r.width - tip.offsetWidth - 4); tip.style.left = `${Math.max(0, left)}px`; tip.style.top = '0px'; tip.style.opacity = 1; };
      hit.addEventListener('pointermove', move); hit.addEventListener('pointerleave', () => { tip.style.opacity = 0; rule.setAttribute('opacity', 0); dots.forEach((d) => d.setAttribute('opacity', 0)); });
      const last = series[0].values.filter((v) => v != null).at(-1);
      s.setAttribute('aria-label', `${series.map((x) => x.name).join(', ')}, ${labels[0]} to ${labels.at(-1)}; latest ${last == null ? 'no data' : format(last)}`);
    };
    draw(); watch(el, draw); settle(draw);
    const lg = series.length > 1 ? legendEl(series.map((sr, k) => ({ label: sr.name, w: 16, draw: (sw) => svg('line', { x1: 0, x2: 16, y1: 6, y2: 6, stroke: colourOf(sr, k), 'stroke-width': 2, 'stroke-dasharray': sr.dash ? '4 3' : null }, sw) })), legend) : null;
    return { legend: lg };
  }
  function bars(el, { labels, values, format = fmt.int, tickFormat = null, height = 200, highlight = null, dim = [], colour, mutedColour, annotations, reference, xAt = null }) {
    el._fmt = format;
    const lit = (i) => highlight == null || (Array.isArray(highlight) ? highlight.includes(i) : highlight === i);
    const draw = () => {
      const { s, w, h } = frame(el, heightOf(height));
      const yt = ticks(0, Math.max(...values, ...[].concat(reference || []).map((r) => r.value)), 4), tick = tickFormat || format;
      const padL = 12 + Math.max(...yt.map((v) => measure(s, tick(v), 12))), padB = 26;
      const band = (w - padL) / values.length, bw = Math.max(2, band * 0.62);
      const x = (i) => padL + band * i + band / 2;
      const N = prepNotes(s, annotations, x, w), padT = LANE(N.rows);
      const y = (v) => padT + (h - padT - padB) * (1 - v / yt.at(-1));
      const g = svg('g', {}, s);
      axes(g, el, { w, h, padL, padB, yt, y, labels, x, band: true, at: xAt, tick });
      notesUnder(g, el, N, { padT, h, padB });
      for (const it of N.items) if (it.at != null && values[it.at] != null) it.end = y(values[it.at]) - 4;
      const main = colour || css(el, '--chart-1', '#2f6fdf'), muted = mutedColour || css(el, '--chart-muted', '#c9c9c9');
      values.forEach((v, i) => { const r = svg('rect', { x: x(i) - bw / 2, y: y(v), width: bw, height: Math.max(0, y(0) - y(v)), fill: lit(i) ? main : muted, opacity: dim.includes(i) ? 0.45 : null, 'shape-rendering': 'crispEdges' }, g); titled(r, `${labels[i]}: ${format(v)}`, {}); });
      references(g, el, reference, { y, padL, w, boxes: values.map((v, i) => ({ x0: x(i) - bw / 2, x1: x(i) + bw / 2, y0: y(v), y1: y(0) })) });
      notesOver(g, el, N, { padT, h, padB });
      s.setAttribute('aria-label', `${labels.length} barras del ${labels[0]} al ${labels.at(-1)}; la más alta: ${format(Math.max(...values))}`);
    };
    draw(); watch(el, draw); settle(draw);
  }
  // Two directions on one scale: what went out above the zero line and what came in below it (sold and bought,
  // income and spend). The axis says which is which, with signed ticks and a caption on each side of zero.
  // mark: [indices] draws those periods in a second tone with their own legend entry (the nights the car charged).
  function diverging(el, { labels, up, down, values, above = 'Above', below = 'Below', mark = [], markLabel = null, markSide = 'below', partial = null, format = fmt.int, tickFormat = null, height = 200, annotations, reference, xAt = null, legend = null }) {
    if (values) { up = values.map((v) => Math.max(0, v || 0)); down = values.map((v) => Math.max(0, -(v || 0))); }
    up = up || labels.map(() => 0); down = down || labels.map(() => 0);
    const st = { above: { fill: css(el, '--chart-1', '#2f6fdf') }, below: { fill: css(el, '--chart-muted', '#c9c9c9') }, mark: { fill: css(el, '--chart-mark', css(el, '--ink', '#111')) } };
    const marked = (i, side) => mark.includes(i) && (markSide === 'both' || markSide === side);
    const tick = (v) => (v > 0 ? '+' : v < 0 ? MINUS : '') + (tickFormat || format)(Math.abs(v));
    const draw = () => {
      const { s, w, h } = frame(el, heightOf(height));
      const hiUp = Math.max(0, ...up), hiDown = Math.max(0, ...down);
      const yt = ticks(-hiDown, hiUp || 1, 4); const stp = yt[1] - yt[0]; if (hiDown > 0 && yt[0] >= -hiDown) yt.unshift(+(yt[0] - stp).toFixed(10));
      const padL = 12 + Math.max(...yt.map((v) => measure(s, tick(v), 12))), padB = 26;
      const band = (w - padL) / labels.length, bw = Math.max(2, band * 0.62);
      const x = (i) => padL + band * i + band / 2;
      // the caption for the upper side opens the label rows above the plot; the lower one sits under the plot, at left
      const N = prepNotes(s, annotations, x, w, [{ fixed: padL, glyph: 'up', label: above }]), padT = LANE(N.rows);
      const y = (v) => padT + (h - padT - padB) * (1 - (v - yt[0]) / (yt.at(-1) - yt[0]));
      const g = svg('g', {}, s), ink = css(el, '--axis-ink', '#6b6b6b');
      const bwid = measure(s, below, 11) + 9;
      axes(g, el, { w, h, padL, padB, yt, y, labels, x, band: true, at: xAt, tick, avoid: [padL, padL + bwid] });
      svg('path', { d: `M${padL} ${h - padB + 11}l3 6l3 -6z`, fill: ink }, g); text(g, below, { x: padL + 9, y: h - padB + 18, 'font-size': 11, fill: ink });
      notesUnder(g, el, N, { padT, h, padB });
      for (const it of N.items) if (it.at != null) it.end = y(up[it.at] || 0) - 4;
      labels.forEach((lab, i) => {
        const o = partial === i ? 0.5 : null;
        if (up[i] > 0) { const r = paintRect(g, { ...(marked(i, 'above') ? st.mark : st.above), opacity: o }, x(i) - bw / 2, y(up[i]), bw, Math.max(0, y(0) - y(up[i]) - 1)); titled(r, `${lab}: ${above} ${format(up[i])}`, {}); }
        if (down[i] > 0) { const r = paintRect(g, { ...(marked(i, 'below') ? st.mark : st.below), opacity: o }, x(i) - bw / 2, y(0) + 1, bw, Math.max(0, y(-down[i]) - y(0) - 1)); titled(r, `${lab}: ${below} ${format(down[i])}`, {}); }
      });
      svg('line', { x1: padL, x2: w, y1: y(0), y2: y(0), stroke: ink, 'stroke-width': 1, opacity: 0.8, 'shape-rendering': 'crispEdges' }, g);
      references(g, el, reference, { y, padL, w, boxes: labels.map((_, i) => ({ x0: x(i) - bw / 2, x1: x(i) + bw / 2, y0: y(up[i]), y1: y(-down[i]) })) });
      notesOver(g, el, N, { padT, h, padB });
      s.setAttribute('aria-label', `${above} above the line and ${below} below it, ${labels[0]} to ${labels.at(-1)}`);
    };
    draw(); watch(el, draw); settle(draw);
    const items = [];
    if (up.some((v) => v > 0)) items.push({ label: above, draw: rectSwatch(st.above) });
    if (down.some((v) => v > 0)) items.push({ label: below, draw: rectSwatch(st.below) });
    if (mark.length && markLabel) items.push({ label: markLabel, draw: rectSwatch(st.mark) });
    return { get svg() { return el.querySelector(':scope > svg'); }, legend: legendEl(items, legend) };
  }
  function ring(el, { value, label, sub, size = 132, stroke = 8, colour }) {
    el.innerHTML = '';
    const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value));
    const wrap = document.createElement('div'); wrap.style.cssText = `position:relative;width:${size}px;height:${size}px`;
    const s = svg('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img', 'aria-label': `${label}${sub ? ' ' + sub : ''}` }, wrap);
    svg('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: css(el, '--grid', '#e8e8e8'), 'stroke-width': stroke }, s);
    svg('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: colour || css(el, '--chart-1', '#2f6fdf'), 'stroke-width': stroke, 'stroke-dasharray': `${c * v} ${c}`, transform: `rotate(-90 ${size / 2} ${size / 2})` }, s);
    const t = document.createElement('div'); t.style.cssText = 'position:absolute;inset:0;display:grid;place-content:center;text-align:center;font-variant-numeric:tabular-nums';
    t.innerHTML = `<div style="font-size:${Math.round(size / 5.5)}px;font-weight:600;line-height:1">${label}</div>${sub ? `<div style="font-size:12px;opacity:.7;margin-top:4px">${sub}</div>` : ''}`;
    wrap.appendChild(t); el.appendChild(wrap);
  }
  // A ranked list. By default the row's fill is the bar (a one-figure list); thin: true puts a 2px grey bar under each
  // label instead, ink for the top item, for a ranked list of money in a narrow card.
  function barList(el, rows, { format = fmt.int, colour, thin = false } = {}) {
    el.innerHTML = '';
    const max = Math.max(...rows.map((r) => r.value)) || 1;
    const list = document.createElement('ol'); list.style.cssText = `list-style:none;margin:0;padding:0;display:grid;gap:${thin ? 10 : 2}px;font-variant-numeric:tabular-nums`;
    const valueCol = Math.max(...rows.map((r) => String(format(r.value)).length)) + 1;
    rows.forEach((r, k) => {
      const li = document.createElement('li'); li.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) ' + valueCol + 'ch;align-items:center;column-gap:12px';
      const a = document.createElement('span'); a.textContent = r.label; a.style.cssText = 'position:relative;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      const b = document.createElement('span'); b.textContent = format(r.value); b.style.cssText = 'font-weight:500;text-align:right';
      if (thin) {
        const bar = document.createElement('span'); bar.style.cssText = `grid-column:1 / -1;height:2px;margin-top:4px;width:${(r.value / max) * 100}%;background:${k === 0 ? colour || 'var(--ink,#111)' : 'var(--chart-muted,#c9c9c9)'}`;
        li.append(a, b, bar);
      } else {
        const track = document.createElement('span'); track.style.cssText = 'position:relative;padding:10px 12px;border-radius:6px;isolation:isolate;min-width:0';
        const bar = document.createElement('span'); bar.style.cssText = `position:absolute;inset:0 auto 0 0;width:${(r.value / max) * 100}%;background:${colour || 'var(--bar-fill, color-mix(in srgb, var(--chart-1, #2f6fdf) 12%, transparent))'};border-radius:inherit;z-index:-1`;
        track.append(bar, a); li.append(track, b);
      }
      list.appendChild(li);
    });
    el.appendChild(list);
  }
  // Planned against spent: the track is the plan, the fill what is spent, a lighter segment what is
  // already committed (bills to come), and an overrun past the track's end in the negative colour.
  // One row per category: label and figures on one line, the 8px track under them.
  function plan(el, rows, { format = fmt.money('EUR', 0), scale = 'row', note = (r) => r.spent > r.planned ? `${format(r.spent - r.planned)} over` : `${format(r.planned - r.spent - (r.committed || 0))} left` } = {}) {
    el.innerHTML = '';
    const list = document.createElement('ul'); list.style.cssText = 'list-style:none;margin:0;padding:0;display:grid;gap:14px;font-variant-numeric:tabular-nums';
    const max = Math.max(...rows.map((r) => Math.max(r.planned, r.spent + (r.committed || 0))));
    for (const r of rows) {
      const over = r.spent > r.planned;
      const li = document.createElement('li');
      const top = document.createElement('div'); top.style.cssText = 'display:flex;justify-content:space-between;gap:12px;margin-bottom:6px';
      top.innerHTML = `<span>${r.label}</span><span><b style="font-weight:500">${format(r.spent)}</b> <span style="color:var(--muted,#5f6368)">of ${format(r.planned)} · </span><span style="color:${over ? 'var(--negative,#c4242a)' : 'var(--muted,#5f6368)'}">${note(r)}</span></span>`;
      // scale 'row': each track is full width and shows the share used (rows in a grid compare); 'plan': as long as its plan
      const room = over ? 100 / (1 + Math.max(0.06, (r.spent - r.planned) / r.planned)) : 100;
      const track = document.createElement('div'); track.style.cssText = 'position:relative;height:8px;border-radius:999px;background:var(--rule,#eceeef);overflow:visible;width:' + (scale === 'plan' ? (r.planned / max) * room : room) + '%';
      const pct = (v) => (v / r.planned) * 100;
      const spent = Math.min(r.spent, r.planned);
      track.innerHTML = `<span style="position:absolute;inset:0 auto 0 0;width:${pct(spent)}%;border-radius:999px;background:var(--chart-1,#2f6fdf)"></span>`
        + (r.committed ? `<span style="position:absolute;top:0;bottom:0;left:${pct(spent)}%;width:${Math.min(pct(r.committed), 100 - pct(spent))}%;background:var(--chart-1,#2f6fdf);opacity:.35"></span>` : '')
        + (over ? `<span style="position:absolute;top:-3px;bottom:-3px;left:100%;width:1px;background:var(--text,#111)"></span><span style="position:absolute;top:0;bottom:0;left:calc(100% + 2px);width:max(12px, ${pct(r.spent - r.planned)}%);border-radius:0 999px 999px 0;background:var(--negative,#c4242a)"></span>` : '');
      track.setAttribute('role', 'img'); track.setAttribute('aria-label', `${r.label}: ${format(r.spent)} of ${format(r.planned)}${r.committed ? `, ${format(r.committed)} committed` : ''}${over ? ', over plan' : ''}`);
      li.append(top, track); list.appendChild(li);
    }
    el.appendChild(list);
  }
  // Share against a target: one row per part, the current share as a bar and a 1px tick at the target,
  // so drift reads at a glance (never two stacked bars to compare).
  function bullet(el, rows, { format = fmt.pct(1), max = Math.max(...rows.map((r) => Math.max(r.value, r.target))) * 1.15 } = {}) {
    el.innerHTML = '';
    const list = document.createElement('ul'); list.style.cssText = 'list-style:none;margin:0;padding:0;display:grid;gap:12px;font-variant-numeric:tabular-nums';
    for (const r of rows) {
      const drift = r.value - r.target;
      const li = document.createElement('li'); li.style.cssText = 'display:grid;grid-template-columns:minmax(90px,30%) 1fr auto;align-items:center;gap:12px';
      li.innerHTML = `<span>${r.label}</span><span style="position:relative;height:10px;background:var(--rule,#eceeef);border-radius:2px"><span style="position:absolute;inset:0 auto 0 0;width:${(r.value / max) * 100}%;background:var(--chart-1,#2f6fdf);border-radius:2px"></span><span style="position:absolute;top:-4px;bottom:-4px;left:${(r.target / max) * 100}%;width:2px;margin-left:-1px;background:var(--text,#111)"></span></span><span><b style="font-weight:500">${format(r.value)}</b> <span style="color:${Math.abs(drift) >= (r.tolerance ?? 0.02) ? 'var(--negative,#c4242a)' : 'var(--muted,#5f6368)'}">${drift >= 0 ? '+' : '−'}${format(Math.abs(drift))} vs ${format(r.target)}</span></span>`;
      li.setAttribute('aria-label', `${r.label}: ${format(r.value)}, target ${format(r.target)}`);
      list.appendChild(li);
    }
    el.appendChild(list);
  }
  // shared by the row charts (timeline, matrix, time strip): a label column with an optional grey subline.
  // A subline needs a 40-44px row pitch; one-line labels sit on 32px.
  function rowLabel(g, s, el, r, { y0, pitch, lw }) {
    const ink = css(el, '--ink', '#111'), muted = css(el, '--axis-ink', '#6b6b6b');
    if (r.sub) { text(g, fit(s, r.label, lw - 12, 14), { x: 0, y: y0 + pitch / 2 - 3, 'font-size': 14, fill: ink }); text(g, fit(s, r.sub, lw - 12, 12), { x: 0, y: y0 + pitch / 2 + 13, 'font-size': 12, fill: muted }); }
    else text(g, fit(s, r.label, lw - 12, 14), { x: 0, y: y0 + pitch / 2 + 5, 'font-size': 14, fill: ink });
  }
  const dayText = (d) => (typeof d === 'object' && d ? d.label : String(d));
  // day headers: the full label when every one fits its column, else the short form ('19'), else every k-th short
  // label with today always shown and its neighbours left out, so no two headers ever touch
  function dayHeads(g, s, el, days, { x0, cw, y, today }) {
    const ink = css(el, '--ink', '#111'), muted = css(el, '--axis-ink', '#6b6b6b');
    const full = days.map(dayText), short = days.map((d) => (typeof d === 'object' && d ? d.short || dayText(d) : dayText(d).split(' ').at(-1)));
    const wide = (labs) => Math.max(...labs.map((t) => measure(s, t, 12))) + 6;
    const labs = wide(full) <= cw ? full : short, k = Math.max(1, Math.ceil(wide(labs) / cw));
    labs.forEach((t, i) => {
      if (i !== today && (i % k || (today != null && k > 1 && Math.abs(i - today) < k))) return;
      text(g, t, { x: x0 + i * cw + cw / 2, y, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': i === today ? 600 : 400, fill: i === today ? ink : muted });
    });
  }
  // The style of each kind of booking: a pale fill, a 1px diagonal hatch, a darker grey step, an outline, or the one
  // chart hue for the screen's main data element. tone: 'negative' turns the edge and the label red (it needs a decision).
  function kindStyle(el, k = {}) {
    const ink = css(el, '--ink', '#111'), surface = css(el, '--surface', '#fff'), neg = css(el, '--negative', '#c4242a'), hue = k.colour || css(el, '--chart-1', '#2f6fdf');
    const tone = k.tone === 'negative' ? { stroke: neg, width: 1.5 } : {};
    const dash = k.dash ? { dash: '3 2' } : {};
    if (k.mark === 'hatch') return { fill: mix(el, ink, surface, 0.04), hatch: mix(el, ink, surface, 0.32), ...tone, ...dash };
    if (k.mark === 'step') return { fill: mix(el, ink, surface, 0.24), ...tone, ...dash };
    if (k.mark === 'outline') return { fill: surface, stroke: mix(el, ink, surface, 0.55), width: 1, ...tone, ...dash };
    if (k.mark === 'hue') return { fill: mix(el, hue, surface, 0.18), edge: hue, ...tone, ...dash };
    return { fill: mix(el, ink, surface, 0.12), ...tone, ...dash };
  }
  // Who is away when: people (or rooms, vans) down the left, days across, a bar per booking told apart by its kind.
  //   rows: [{ label: 'Lena Hoffmann', sub: 'Product design · Berlin', bars: [{ from: 3, to: 7, kind: 'holiday', label, note }] }]
  //         and { group: 'Brand' } rows for a team subheader
  //   kinds: { holiday: { label: 'Holiday', mark: 'fill' | 'hatch' | 'step' | 'outline' | 'hue', code: 'H', tone, dash } }
  //   days: ['Mon 19', …] or [{ label: 'Mon 19', short: '19' }]; weekends: [indices]; today: index;
  //   holidays: [{ day: index, label: 'All Saints’ Day (Lisbon)' }]; onSelect(bar, row) makes the bars buttons.
  // A label that does not fit its bar becomes the kind's code inside it, then goes after the bar's end (never into the
  // days before it), and is always in the bar's tooltip.
  function timeline(el, rows, kinds = {}, { days = [], weekends = [], today = null, holidays = [], labelWidth = null, rowHeight = null, barHeight = 22, onSelect = null, legend = null, extras = true } = {}) {
    const draw = () => {
      const pitch = rowHeight || (rows.some((r) => r.sub) ? 44 : 32), head = 30, groupH = 30;
      const height = head + rows.reduce((a, r) => a + (r.group ? groupH : pitch), 0) + 2;
      const { s, w, h } = frame(el, height);
      const lw = labelWidth || Math.round(Math.min(220, Math.max(w < 480 ? 96 : 120, w * 0.2)));
      const cw = (w - lw) / Math.max(1, days.length), col = (i) => lw + i * cw;
      const ink = css(el, '--ink', '#111'), muted = css(el, '--axis-ink', '#6b6b6b'), rule = css(el, '--rule', '#f0f0f0'), raised = css(el, '--raised', '#f4f5f6'), hue = css(el, '--chart-1', '#2f6fdf');
      const g = svg('g', {}, s);
      // weekends one tone step darker, faint day lines, the day header (today in ink)
      for (const i of weekends) svg('rect', { x: col(i), y: head, width: cw, height: h - head, fill: raised }, g);
      for (let i = 0; i <= days.length; i++) svg('line', { x1: col(i), x2: col(i), y1: head, y2: h, stroke: rule, 'stroke-width': 1, 'shape-rendering': 'crispEdges' }, g);
      dayHeads(g, s, el, days, { x0: lw, cw, y: head - 10, today });
      for (const hd of holidays) { const c = svg('circle', { cx: col(hd.day) + cw / 2, cy: head - 3, r: 2, fill: muted }, g); titled(c, hd.label, {}); }
      if (today != null) svg('line', { x1: col(today) + cw / 2, x2: col(today) + cw / 2, y1: head, y2: h, stroke: hue, 'stroke-width': 1, 'shape-rendering': 'crispEdges' }, g);
      let y0 = head;
      for (const r of rows) {
        if (r.group) { svg('line', { x1: 0, x2: w, y1: y0 + 0.5, y2: y0 + 0.5, stroke: rule, 'stroke-width': 1 }, g); text(g, r.group, { x: 0, y: y0 + 20, 'font-size': 12, 'font-weight': 500, fill: muted }); y0 += groupH; continue; }
        rowLabel(g, s, el, r, { y0, pitch, lw });
        const bs = (r.bars || []).filter((b) => b.to >= 0 && b.from < days.length).sort((a, b) => a.from - b.from);
        bs.forEach((b, k) => {
          const kind = kinds[b.kind] || {}, st = kindStyle(el, kind);
          const x0 = col(Math.max(0, b.from)) + 2, x1 = col(Math.min(days.length - 1, b.to) + 1) - 2, by = y0 + (pitch - barHeight) / 2;
          const grp = svg('g', onSelect ? { tabindex: 0, role: 'button', style: 'cursor:pointer' } : {}, g);
          paintRect(grp, st, x0, by, x1 - x0, barHeight, 4);
          const label = b.label ?? kind.label ?? '', code = b.code ?? kind.code, tw = measure(s, label, 12), labInk = kind.tone === 'negative' ? css(el, '--negative', '#c4242a') : ink;
          const next = bs[k + 1] ? col(Math.max(0, bs[k + 1].from)) : w;
          // over a hatch the label keeps a halo of the bar's own fill, so the lines never run through the words
          const halo = st.hatch ? { stroke: st.fill, 'stroke-width': 4, 'stroke-linejoin': 'round', 'paint-order': 'stroke' } : {};
          if (label && tw + 16 <= x1 - x0) text(grp, label, { x: x0 + 8 + (st.edge ? 2 : 0), y: by + barHeight / 2 + 4, 'font-size': 12, fill: labInk, ...halo });
          else if (code && measure(s, code, 12) + 8 <= x1 - x0) text(grp, code, { x: (x0 + x1) / 2, y: by + barHeight / 2 + 4, 'text-anchor': 'middle', 'font-size': 12, fill: labInk, ...halo });
          else if (label && x1 + 6 + tw <= Math.min(next - 6, w)) text(grp, label, { x: x1 + 6, y: by + barHeight / 2 + 4, 'font-size': 12, fill: kind.tone === 'negative' ? labInk : muted });
          titled(grp, `${r.label}: ${label}${b.note ? ' \u00b7 ' + b.note : ''}`, {});
          if (onSelect) { grp.addEventListener('click', () => onSelect(b, r)); grp.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(b, r); } }); }
        });
        y0 += pitch;
      }
      s.setAttribute('aria-label', `${rows.filter((r) => !r.group).length} rows across ${days.length} days, ${dayText(days[0])} to ${dayText(days.at(-1))}`);
    };
    draw(); watch(el, draw); settle(draw);
    const used = new Set(rows.flatMap((r) => (r.bars || []).map((b) => b.kind)));
    const items = Object.entries(kinds).filter(([id]) => used.has(id)).map(([, k]) => ({ label: k.label, w: 22, draw: (sw) => { const st = kindStyle(el, k); paintRect(sw, st, 0, 0, 22, 12, 3); } }));
    if (extras && today != null) items.push({ label: 'Today', w: 8, draw: (sw) => svg('line', { x1: 4, x2: 4, y1: 0, y2: 12, stroke: css(el, '--chart-1', '#2f6fdf'), 'stroke-width': 1.5 }, sw) });
    return { get svg() { return el.querySelector(':scope > svg'); }, legend: legendEl(items, legend) };
  }
  // Is there enough cover? A team-by-day grid of slack against the minimum (+2, +1, 0, −1). Cells with room to spare
  // stay plain, and one hue ramps toward the negative colour as the slack runs out; the headcount is in the tooltip.
  //   rows: [{ label: 'Product design', sub: 'needs 7 of 10', values: [2, 1, 0, -1, null, …], titles: ['8 in', …] }]
  //   cols: ['Mon 19', …]; comfort: the slack that needs no attention (2); null is a day with no cover to count (a dash)
  function matrix(el, rows, { cols = [], comfort = 2, today = null, format = fmt.signed(), labelWidth = null, rowHeight = null, levels = ['Room to spare', 'Tight', 'At the minimum', 'Short'], legend = null } = {}) {
    const level = (v) => (v >= comfort ? 0 : v > 0 ? 1 : v === 0 ? 2 : 3);
    const styles = () => { const neg = css(el, '--negative', '#c4242a'), surface = css(el, '--surface', '#fff'), ink = css(el, '--ink', '#111'); return [{ fill: surface, ink: css(el, '--axis-ink', '#6b6b6b'), stroke: css(el, '--grid', '#e5e5e5') }, { fill: mix(el, neg, surface, 0.1), ink }, { fill: mix(el, neg, surface, 0.26), ink }, { fill: neg, ink: surface }]; };
    const draw = () => {
      const pitch = rowHeight || (rows.some((r) => r.sub) ? 44 : 32), head = 26;
      const { s, w, h } = frame(el, head + rows.length * pitch);
      const lw = labelWidth || Math.round(Math.min(220, Math.max(w < 480 ? 96 : 120, w * 0.22)));
      const cw = (w - lw) / Math.max(1, cols.length), ST = styles(), muted = css(el, '--axis-ink', '#6b6b6b'), ink = css(el, '--ink', '#111');
      const g = svg('g', {}, s);
      dayHeads(g, s, el, cols, { x0: lw, cw, y: head - 10, today });
      rows.forEach((r, k) => {
        const y0 = head + k * pitch; rowLabel(g, s, el, r, { y0, pitch, lw });
        const ch = Math.min(pitch - 6, 28), cy = y0 + (pitch - ch) / 2;
        r.values.forEach((v, i) => {
          const cx = lw + i * cw + 1;
          if (v == null) { svg('rect', { x: cx + cw / 2 - 4, y: cy + ch / 2 - 1, width: 6, height: 2, fill: muted }, g); return; }
          const st = ST[level(v)], cell = paintRect(g, { fill: st.fill }, cx, cy, cw - 2, ch, 3);
          text(g, format(v), { x: cx + (cw - 2) / 2, y: cy + ch / 2 + 4, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': level(v) === 3 ? 600 : 400, fill: st.ink });
          titled(cell, `${r.label}, ${dayText(cols[i])}: ${r.titles?.[i] || format(v) + ' against the minimum'}`, {});
        });
      });
      s.setAttribute('aria-label', `Cover against the minimum for ${rows.length} rows across ${cols.length} days`);
    };
    draw(); watch(el, draw); settle(draw);
    const seen = new Set(rows.flatMap((r) => r.values.filter((v) => v != null).map(level)));
    const ST = styles();
    const items = [0, 1, 2, 3].filter((l) => seen.has(l)).map((l) => ({ label: levels[l], w: 14, draw: rectSwatch(l === 0 ? { fill: ST[0].fill, stroke: ST[0].stroke } : { fill: ST[l].fill }, 14, 12, 3) }));
    return { get svg() { return el.querySelector(':scope > svg'); }, legend: legendEl(items, legend) };
  }
  // When, within the day: one row per item on a shared open–close axis. A 2px grey track, an ink dot at today's time and
  // a hollow tick at the comparison day's, so "earlier than last Sunday" is drawn and not only written.
  //   rows: [{ label: 'White sourdough', sub: 'Headingley', at: '11:20', compare: '12:05', value: '11:20', note: '3 h 40 m before close' }]
  //   at or compare may be null (it did not sell out); step: minutes between axis labels (60).
  function timeStrip(el, rows, { open = '08:00', close = '18:00', step = 60, todayLabel = 'Today', compareLabel = null, labelWidth = null, valueWidth = null, rowHeight = null, legend = null } = {}) {
    const o = minutes(open), c = minutes(close);
    const st = { today: { r: 4.5 }, compare: { w: 5, h: 12 } };
    const dot = (parent, cx, cy) => svg('circle', { cx, cy, r: st.today.r, fill: css(el, '--ink', '#111') }, parent);
    const tick = (parent, cx, cy) => svg('rect', { x: cx - st.compare.w / 2, y: cy - st.compare.h / 2, width: st.compare.w, height: st.compare.h, rx: 2.5, fill: css(el, '--surface', '#fff'), stroke: css(el, '--axis-ink', '#6b6b6b'), 'stroke-width': 1.5 }, parent);
    const draw = () => {
      const narrow = (el.clientWidth || 600) < 560, axisH = 24;
      const pitch = rowHeight || (narrow ? 62 : rows.some((r) => r.sub || r.note) ? 44 : 32);
      const { s, w, h } = frame(el, rows.length * pitch + axisH);
      const lw = narrow ? 0 : labelWidth || Math.round(Math.min(200, Math.max(110, w * 0.26)));
      const vw = narrow ? 0 : valueWidth ?? Math.min(w * 0.32, Math.max(0, ...rows.map((r) => Math.max(r.value ? measure(s, r.value, 13, 500) : 0, r.note ? measure(s, r.note, 12) : 0))) + (rows.some((r) => r.value || r.note) ? 16 : 0));
      const x0 = narrow ? 18 : lw + 6, x1 = narrow ? w - 18 : w - vw - 6, tx = (m) => x0 + ((m - o) / Math.max(1, c - o)) * (x1 - x0);
      const ink = css(el, '--ink', '#111'), muted = css(el, '--axis-ink', '#6b6b6b'), rule = css(el, '--rule', '#f0f0f0');
      const track = css(el, '--chart-track', mix(el, ink, css(el, '--surface', '#fff'), 0.16));
      const g = svg('g', {}, s), plotH = rows.length * pitch;
      // the axis: one step from the opening, the labels thinned by the same rule as the charts
      const marks = []; for (let m = Math.ceil(o / step) * step; m <= c; m += step) marks.push(m);
      const picks = xPicks(marks.map(fmt.clock), x1 - x0);
      for (const i of picks) { const xx = tx(marks[i]); if (!narrow) svg('line', { x1: xx, x2: xx, y1: 0, y2: plotH, stroke: rule, 'stroke-width': 1, 'shape-rendering': 'crispEdges' }, g); const lab = fmt.clock(marks[i]), tw = measure(s, lab, 12); text(g, lab, { x: Math.max(x0 - 2, Math.min(x1 + 6 - tw, xx - tw / 2)), y: plotH + 17, 'font-size': 12, fill: muted }); }
      rows.forEach((r, k) => {
        const y0 = k * pitch, cy = narrow ? y0 + pitch - 12 : y0 + pitch / 2;
        if (narrow) {
          const vwid = r.value ? measure(s, r.value, 13, 500) + 12 : 0;
          text(g, fit(s, r.label, w - vwid, 14), { x: 0, y: y0 + 16, 'font-size': 14, fill: ink });
          if (r.value) text(g, r.value, { x: w, y: y0 + 16, 'text-anchor': 'end', 'font-size': 13, 'font-weight': 500, fill: ink });
          const second = [r.sub, r.note].filter(Boolean).join(' \u00b7 ');
          if (second) text(g, fit(s, second, w, 12), { x: 0, y: y0 + 33, 'font-size': 12, fill: muted });
        } else rowLabel(g, s, el, r, { y0, pitch, lw });
        svg('line', { x1: x0, x2: x1, y1: cy, y2: cy, stroke: track, 'stroke-width': 2, 'stroke-linecap': 'round' }, g);
        const cm = minutes(r.compare), am = minutes(r.at);
        if (cm != null) titled(tick(g, tx(cm), cy), `${compareLabel || 'Comparison'}: ${fmt.clock(cm)}`, {});
        if (am != null) titled(dot(g, tx(am), cy), `${todayLabel}: ${fmt.clock(am)}`, {});
        if (narrow) return;
        if (r.note) { if (r.value) text(g, r.value, { x: w, y: cy - 3, 'text-anchor': 'end', 'font-size': 13, 'font-weight': 500, fill: ink }); text(g, fit(s, r.note, vw - 8, 12), { x: w, y: r.value ? cy + 13 : cy + 4, 'text-anchor': 'end', 'font-size': 12, fill: muted }); }
        else if (r.value) text(g, r.value, { x: w, y: cy + 5, 'text-anchor': 'end', 'font-size': 13, 'font-weight': 500, fill: ink });
      });
      s.setAttribute('aria-label', `${rows.length} rows between ${fmt.clock(o)} and ${fmt.clock(c)}`);
    };
    draw(); watch(el, draw); settle(draw);
    const items = [];
    if (rows.some((r) => minutes(r.at) != null)) items.push({ label: todayLabel, w: 10, draw: (sw) => dot(sw, 5, 6) });
    if (compareLabel && rows.some((r) => minutes(r.compare) != null)) items.push({ label: compareLabel, w: 8, draw: (sw) => tick(sw, 4, 6) });
    return { get svg() { return el.querySelector(':scope > svg'); }, legend: legendEl(items, legend) };
  }
  function watch(el, draw) { if (!('ResizeObserver' in window)) return; let w = el.clientWidth; new ResizeObserver(() => { if (Math.abs(el.clientWidth - w) > 4) { w = el.clientWidth; draw(); } }).observe(el); }
  window.Charts = { line, bars, diverging, ring, barList, plan, bullet, timeline, matrix, timeStrip, ticks, fmt };
})();

/* =====================================================================
   Modo Parche Business · aplicación del panel
   1. Utilidades          6. Mapa comercial y GPS
   2. Datos de muestra    7. Cupones y validador
   3. Persistencia        8. Asistentes y chat
   4. Navegación          9. Perfil del local
   5. Resumen y parches  10. Diálogos, avisos e inicio
===================================================================== */
(() => {
  'use strict';

  /* =====================================================================
     1. UTILIDADES
  ===================================================================== */
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const MIN = 6e4, HOUR = 36e5, DAY = 864e5;
  const NOW = () => Date.now();
  const pad = n => String(n).padStart(2, '0'); // taste-skill-ignore: horas y fechas, no numeración
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const ic = n => `<svg class="ic" aria-hidden="true"><use href="#${n}"/></svg>`;
  const hash = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rnd = key => (hash(key) % 10000) / 10000;  // 0..1 estable para una clave
  const nf = new Intl.NumberFormat('es-CO');
  const int = n => nf.format(Math.round(n));
  const money = n => '$' + nf.format(Math.round(n));          // sin espacio después del signo
  const pct = (n, d = 0) => new Intl.NumberFormat('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n * 100) + ' %';
  const MINUS = '−';
  const signed = n => (n > 0 ? '+' : n < 0 ? MINUS : '') + int(Math.abs(n));

  const day0 = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const dayKey = ts => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const at = (base, hhmm) => { const [h, m] = hhmm.split(':').map(Number); const d = new Date(base); d.setHours(h, m, 0, 0); return d.getTime(); };
  const fmtHora = ts => new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true }).format(ts).replace(/\s/g, ' ');
  const fmtDiaCorto = ts => new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }).format(ts).replace(/\./g, '');
  const fmtMesCorto = ts => new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' }).format(ts).replace(/\./g, '');
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  function fmtDia(ts) {
    const d = Math.round((day0(ts) - day0(NOW())) / DAY);
    if (d === 0) return 'Hoy';
    if (d === 1) return 'Mañana';
    if (d === -1) return 'Ayer';
    return cap(fmtDiaCorto(ts));
  }
  const fmtCuando = ts => `${fmtDia(ts)}, ${fmtHora(ts)}`;
  const isoDateTime = ts => `${dayKey(ts)} ${pad(new Date(ts).getHours())}:${pad(new Date(ts).getMinutes())}`;
  const minsLeft = ts => Math.max(0, Math.round((ts - NOW()) / MIN));
  const fmtDur = m => m >= 60 ? `${Math.floor(m / 60)} h ${pad(m % 60)} min` : `${m} min`;

  // Persona: inicial estable y un tinte pálido propio (los vecinos de lista quedan a 67° de distancia)
  const tint = i => { const h = (i * 67) % 360; return `background:hsl(${h} 70% 92%);color:hsl(${h} 45% 26%)`; };
  const initials = n => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const avatar = (p) => `<span class="avatar" style="${tint(p.tono)}" aria-hidden="true">${esc(initials(p.nombre))}</span>`;

  /* =====================================================================
     2. DATOS DE MUESTRA (Villavicencio, coordenadas reales)
  ===================================================================== */
  const LUGARES = {
    capachos: { nombre: 'Discoteca Los Capachos', ref: 'Km 4 Vía Acacías', lat: 4.1165, lng: -73.6508 },
    primavera: { nombre: 'C.C. Primavera Urbana', ref: 'Calle 15 # 40-01', lat: 4.1348, lng: -73.6206 },
    fundadores: { nombre: 'Parque Los Fundadores', ref: 'Entrada sur, Av. 40', lat: 4.1242, lng: -73.6395 },
    piedra: { nombre: 'Mirador La Piedra del Amor', ref: 'Buenavista', lat: 4.1585, lng: -73.6540 },
    siete: { nombre: 'Parque Siete de Agosto', ref: 'Barrio Siete de Agosto', lat: 4.1462, lng: -73.6335 },
    viva: { nombre: 'C.C. Viva Villavicencio', ref: 'Av. 40', lat: 4.1290, lng: -73.6225 },
  };
  const CATEGORIAS = ['Rumba y Bares', 'Comida y Antojos', 'Planes Chill', 'Conciertos y Toques', 'Gaming y Tecnología', 'Cultura y Talleres'];
  const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const PERFIL_DEF = {
    nombre: 'Discoteca Los Capachos', categoria: 'Rumba y Bares', tel: '608 670 4521', nit: '900.418.226-1',
    desc: 'Discoteca a la salida de Villavo por la vía a Acacías. Crossover, reguetón viejo y arpa llanera en vivo los sábados.',
    lat: LUGARES.capachos.lat, lng: LUGARES.capachos.lng, direccion: LUGARES.capachos.ref,
    horarios: {
      0: { abierto: true, open: '18:00', close: '00:00' }, 1: { abierto: true, open: '19:00', close: '00:00' },
      2: { abierto: true, open: '19:00', close: '00:00' }, 3: { abierto: true, open: '19:00', close: '00:00' },
      4: { abierto: true, open: '20:00', close: '02:00' }, 5: { abierto: true, open: '21:00', close: '04:00' },
      6: { abierto: true, open: '21:00', close: '04:00' },
    },
    cover: { src: 'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?auto=format&fit=crop&w=1200&q=70', zoom: 1, y: 0 },
    logo: { src: '', zoom: 1 },
  };

  const NOMBRES = ['Laura', 'Santiago', 'Valentina', 'Juan Pablo', 'Daniela', 'Camilo', 'Carolina', 'Andrés', 'Nicolás', 'Sofía', 'Felipe', 'María José', 'Kevin', 'Luisa', 'Sebastián', 'Isabella', 'Mateo', 'Paula', 'Julián', 'Natalia', 'David', 'Manuela', 'Esteban', 'Juliana', 'Diego', 'Mariana', 'Alejandro', 'Valeria', 'Cristian', 'Tomás', 'Gabriela', 'Brayan', 'Ana María', 'Samuel', 'Lorena', 'Óscar', 'Yesica', 'Miguel', 'Karen', 'Jhon'];
  const APELLIDOS = ['Rojas', 'Gutiérrez', 'Moreno', 'Parra', 'Rincón', 'Baquero', 'Velásquez', 'Herrera', 'Castro', 'Garzón', 'Ortiz', 'Pineda', 'Suárez', 'Cárdenas', 'Mora', 'Ríos', 'Torres', 'Beltrán'];
  const persona = i => ({ id: 'u' + i, tono: i, nombre: `${NOMBRES[i % NOMBRES.length]} ${APELLIDOS[(i * 7 + 3) % APELLIDOS.length].charAt(0)}.` });

  // Programación del local por día de la semana
  const OFICIAL = {
    0: { titulo: 'Domingo de música popular', cupos: 80, consumo: 30000 },
    1: { titulo: 'Lunes de billar y cerveza', cupos: 40, consumo: 25000 },
    2: { titulo: 'Martes de karaoke llanero', cupos: 60, consumo: 28000 },
    3: { titulo: 'Miércoles de salsa caleña', cupos: 80, consumo: 30000 },
    4: { titulo: 'Jueves de crossover', cupos: 120, consumo: 35000 },
    5: { titulo: 'Viernes de reguetón viejo', cupos: 150, consumo: 45000 },
    6: { titulo: 'Toque en vivo: arpa y rock', cupos: 180, consumo: 50000 },
  };
  const BASE_CHECKINS = [19, 9, 8, 14, 28, 54, 71]; // un día típico, por día de la semana

  let peopleSeq = 0;
  const nuevaGente = (n, seed) => Array.from({ length: n }, (_, k) => persona((hash(seed + k) % 997) + (peopleSeq++ % 3) * 997));

  function mkParche(o) {
    const asistentes = o.asistentes || nuevaGente(o.confirmados || 0, o.id).map((p, k) => ({
      ...p, id: `${o.id}-${k}`, confirmo: Math.min(o.inicio - (2 + (k % 40)) * HOUR, NOW() - (k + 1) * MIN),
      llego: k < (o.checkins || 0) ? Math.min(o.inicio + Math.round((k / Math.max(1, o.checkins)) * 110 + 4) * MIN, NOW() - (k % 30 + 1) * MIN) : null,
    }));
    return {
      lugar: 'capachos', consumo: 0, promo: '', cancelado: false, chat: [], ...o,
      lat: o.lat ?? LUGARES[o.lugar || 'capachos'].lat, lng: o.lng ?? LUGARES[o.lugar || 'capachos'].lng,
      asistentes,
    };
  }

  function buildSeed() {
    const t0 = day0(NOW());
    const parches = [];
    const serie = []; // { ts, checkins, confirmados } por día, los últimos 60 días sin hoy

    // Día de hora feliz relámpago: el jueves de hace 7 a 13 días, y otro un mes antes
    const relDays = new Set();
    for (let d = 7; d <= 13; d++) if (new Date(t0 - d * DAY).getDay() === 4) relDays.add(dayKey(t0 - d * DAY));
    for (let d = 35; d <= 41; d++) if (new Date(t0 - d * DAY).getDay() === 4) relDays.add(dayKey(t0 - d * DAY));

    for (let d = 60; d >= 1; d--) {
      const ts = t0 - d * DAY, wd = new Date(ts).getDay(), k = dayKey(ts);
      const rel = relDays.has(k);
      const oficial = Math.round(BASE_CHECKINS[wd] * (0.82 + rnd('c' + k) * 0.36));
      const comunidad = rnd('com' + k) < 0.4 ? 8 + Math.round(rnd('cn' + k) * 6) : 0;
      const relN = rel ? 38 : 0;
      const noShow = n => Math.round(n * (0.12 + rnd('ns' + k + n) * 0.1));
      const conf = [oficial + noShow(oficial), comunidad + noShow(comunidad), relN + noShow(relN)];
      serie.push({ ts, checkins: oficial + comunidad + relN, confirmados: conf[0] + conf[1] + conf[2], relampago: rel });
      if (d <= 14) {
        const h = PERFIL_DEF.horarios[wd];
        parches.push(mkParche({ id: 'po' + k, tipo: 'oficial', titulo: OFICIAL[wd].titulo, organizador: 'Los Capachos', inicio: at(ts, h.open), dur: 240, cupos: OFICIAL[wd].cupos, consumo: OFICIAL[wd].consumo, confirmados: conf[0], checkins: oficial }));
        if (comunidad) parches.push(mkParche({ id: 'pc' + k, tipo: 'comunidad', titulo: pick(['Rumba de la oficina', 'Cumple de Juliana B.', 'Reencuentro del colegio', 'Despedida de soltera'], k), organizador: persona(hash(k) % 40).nombre, inicio: at(ts, h.open) + 60 * MIN, dur: 180, cupos: comunidad + 6, confirmados: conf[1], checkins: comunidad }));
        if (rel) parches.push(mkParche({ id: 'pr' + k, tipo: 'relampago', titulo: 'Hora feliz: 2x1 en cerveza nacional', promo: '2x1 en cerveza nacional', organizador: 'Los Capachos', inicio: at(ts, '21:00'), dur: 60, cupos: 50, consumo: 15000, confirmados: conf[2], checkins: relN }));
      }
    }

    // Esta noche
    const wd = new Date(t0).getDay(), h = PERFIL_DEF.horarios[wd];
    const llegaron = (conf, inicio) => NOW() > inicio ? Math.round(conf * clamp((NOW() - inicio) / (150 * MIN), 0, 1) * 0.82) : 0;
    const iOf = at(t0, h.open), iCom = at(t0, h.open) + 60 * MIN;
    const confOf = Math.round(OFICIAL[wd].cupos * 0.8);
    parches.push(mkParche({ id: 'hoy-of', tipo: 'oficial', titulo: OFICIAL[wd].titulo, organizador: 'Los Capachos', inicio: iOf, dur: 240, cupos: OFICIAL[wd].cupos, consumo: OFICIAL[wd].consumo, confirmados: confOf, checkins: llegaron(confOf, iOf), promo: 'Cover incluye la primera. Mesa reservada hasta las 11.' }));
    parches.push(mkParche({ id: 'hoy-com', tipo: 'comunidad', titulo: 'Rumba en Los Capachos', organizador: 'Mafe P.', inicio: iCom, dur: 180, cupos: 12, consumo: 45000, confirmados: 12, checkins: llegaron(12, iCom) }));

    // Próximos días
    const frac = [0.8, 0.62, 0.5, 0.42, 0.36, 0.3, 0.26];
    for (let d = 1; d <= 6; d++) {
      const ts = t0 + d * DAY, w = new Date(ts).getDay(), hh = PERFIL_DEF.horarios[w];
      parches.push(mkParche({ id: 'f' + d, tipo: 'oficial', titulo: OFICIAL[w].titulo, organizador: 'Los Capachos', inicio: at(ts, hh.open), dur: 240, cupos: OFICIAL[w].cupos, consumo: OFICIAL[w].consumo, confirmados: Math.round(OFICIAL[w].cupos * frac[d]) }));
      if (d === 2) parches.push(mkParche({ id: 'fc2', tipo: 'comunidad', titulo: 'Cumpleaños de Laura M.', organizador: 'Laura M.', inicio: at(ts, hh.open) + 30 * MIN, dur: 180, cupos: 20, consumo: 45000, confirmados: 14 }));
      if (d === 4) parches.push(mkParche({ id: 'fc4', tipo: 'comunidad', titulo: 'Despedida de Andrés F.', organizador: 'Andrés F.', inicio: at(ts, hh.open) + 60 * MIN, dur: 180, cupos: 15, consumo: 40000, confirmados: 9 }));
    }

    // Otros puntos de la ciudad (contexto del mapa)
    const otros = [
      { id: 'o1', lugar: 'siete', titulo: 'Micro en el Parque Siete de Agosto', organizador: 'Santi R.', inicio: at(t0, '19:30'), cupos: 10, confirmados: 8 },
      { id: 'o2', lugar: 'viva', titulo: 'Hora feliz 2x1 en el C.C. Viva', organizador: 'Terraza C.C. Viva', inicio: Math.max(at(t0, '18:00'), NOW() + 40 * MIN), cupos: 20, confirmados: 11 },
      { id: 'o3', lugar: 'primavera', titulo: 'Cine y arcade en Primavera Urbana', organizador: 'Andrés F.', inicio: at(t0, '18:30'), cupos: 8, confirmados: 3 },
      { id: 'o4', lugar: 'fundadores', titulo: 'Tarde de frisbee y picnic', organizador: 'Laura M.', inicio: at(t0 + DAY, '16:00'), cupos: 10, confirmados: 5 },
      { id: 'o5', lugar: 'piedra', titulo: 'Atardecer en la Piedra del Amor', organizador: 'Valen G.', inicio: at(t0 + 2 * DAY, '16:30'), cupos: 15, confirmados: 7 },
    ].map(o => mkParche({ ...o, tipo: 'otro', dur: 180 }));
    parches.push(...otros);

    // Chat de muestra en los parches de esta noche
    const of = parches.find(p => p.id === 'hoy-of'), com = parches.find(p => p.id === 'hoy-com');
    of.chat = [
      { tipo: 'sys', texto: 'Los Capachos abrió el parche', ts: of.inicio - 30 * HOUR },
      { autor: of.asistentes[0], texto: '¿El cover incluye la primera de verdad?', ts: NOW() - 95 * MIN },
      { autor: 'biz', texto: 'Sí señor, la primera va por la casa. Las mesas se guardan hasta las 11.', ts: NOW() - 90 * MIN },
      { autor: of.asistentes[3], texto: 'Vamos 6, ¿nos pueden juntar dos mesas?', ts: NOW() - 40 * MIN },
    ];
    com.chat = [
      { tipo: 'sys', texto: 'Mafe P. abrió el parche y eligió Los Capachos', ts: com.inicio - 50 * HOUR },
      { autor: com.asistentes[1], texto: 'Llegamos en dos carros', ts: NOW() - 70 * MIN },
      { tipo: 'sys', texto: 'Parche lleno: se desbloqueó la recompensa Mesa llena', ts: NOW() - 30 * MIN },
    ];

    // Recompensas y códigos
    const cupones = [
      { id: 'k1', nombre: 'Mesa llena', regla: 'lleno', beneficio: 'Botella de aguardiente de cortesía para la mesa', prefijo: 'LLENA', activo: true },
      { id: 'k2', nombre: 'Llegada temprano', regla: 'temprano', beneficio: '2x1 en el primer coctel', prefijo: 'TEMPRANO', activo: true },
      { id: 'k3', nombre: 'Cumpleañero', regla: 'cumple', beneficio: 'Cover gratis para quien cumple', prefijo: 'CUMPLE', activo: true },
      { id: 'k4', nombre: 'Relámpago 2x1', regla: 'relampago', beneficio: '2x1 en cerveza nacional', prefijo: 'FLASH', activo: true },
    ];
    const codigos = [];
    const emitir = (k, n, seed, desdeDias, canjeRatio) => {
      for (let i = 0; i < n; i++) {
        const dias = 1 + Math.floor(rnd(seed + i) * desdeDias);
        const emitido = t0 - dias * DAY + Math.round((20 + rnd(seed + 'e' + i) * 3.5) * 60) * MIN;
        const canj = rnd(seed + 'x' + i) < canjeRatio;
        codigos.push({ codigo: `${k.prefijo}-${1000 + (hash(seed + i) % 9000)}`, cuponId: k.id, persona: persona(hash(seed + 'p' + i) % 400).nombre, emitido, canjeado: canj ? emitido + Math.round(20 + rnd(seed + 'h' + i) * 130) * MIN : null });
      }
    };
    emitir(cupones[0], 9, 'k1', 45, 0.75);
    emitir(cupones[1], 58, 'k2', 45, 0.55);
    emitir(cupones[2], 5, 'k3', 45, 0.7);
    emitir(cupones[3], 40, 'k4', 40, 0.6);
    // La rumba de esta noche se llenó: su código Mesa llena está por canjear
    codigos.push({ codigo: 'LLENA-4821', cuponId: 'k1', persona: 'Mafe P.', emitido: NOW() - 30 * MIN, canjeado: null });

    // Reseñas de clientes que hicieron check-in
    const R = [
      [5, 'Laura M.', 'El toque de arpa con rock del sábado fue otra cosa. Volvemos seguro.', 'Toque en vivo: arpa y rock'],
      [5, 'Santiago G.', 'Nos guardaron la mesa hasta las 11 como decía el parche. Cumplieron.', 'Viernes de reguetón viejo'],
      [4, 'Valentina P.', 'Muy buena música, la fila para entrar estuvo larga a las 10.', 'Viernes de reguetón viejo'],
      [5, 'Camilo R.', 'La hora feliz 2x1 valió la pena, llegamos 8 del trabajo.', 'Hora feliz: 2x1 en cerveza nacional'],
      [4, 'Daniela H.', 'Ambiente sano y seguro. El parqueadero se llena rápido.', 'Jueves de crossover'],
      [5, 'Andrés F.', 'Celebré el cumple aquí y el cover gratis fue un detalle.', 'Cumple de Juliana B.'],
      [3, 'Kevin O.', 'Buena rumba pero se demoraron con los pedidos en la barra.', 'Viernes de reguetón viejo'],
      [5, 'Sofía C.', 'El karaoke llanero de los martes es lo más chévere de Villavo.', 'Martes de karaoke llanero'],
      [4, 'Mateo T.', 'Llegamos temprano y nos dieron el 2x1 en coctel sin problema.', 'Jueves de crossover'],
      [5, 'Mariana B.', 'La botella de cortesía por llenar la mesa nos animó a invitar a más gente.', 'Rumba de la oficina'],
      [4, 'Julián S.', 'Buen sonido. Faltan más opciones sin alcohol.', 'Domingo de música popular'],
      [2, 'Yesica O.', 'Mucho calor en la pista, el aire no daba abasto.', 'Toque en vivo: arpa y rock'],
      [5, 'Tomás R.', 'Atención rápida y el DJ puso todo lo que pedimos en el chat.', 'Viernes de reguetón viejo'],
      [5, 'Isabella M.', 'Primera vez que vengo por Modo Parche y conocí gente muy bacana.', 'Miércoles de salsa caleña'],
    ];
    const resenas = R.map(([estrellas, autor, texto, parche], i) => ({ estrellas, autor, texto, parche, fecha: t0 - (2 + i * 3) * DAY + 23 * HOUR }));

    return { day: dayKey(t0), parches, serie, cupones, codigos, resenas, perfil: structuredClone(PERFIL_DEF) };
  }
  function pick(arr, key) { return arr[hash(key) % arr.length]; }

  /* =====================================================================
     3. PERSISTENCIA
  ===================================================================== */
  const KEY = 'mp_business_v1';
  let S = null;
  function load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { saved = null; }
    if (saved && saved.day === dayKey(NOW()) && Array.isArray(saved.parches)) { S = saved; return; }
    S = buildSeed();
    if (saved) {
      // Día nuevo: se conservan el perfil, las recompensas y los parches propios que siguen vigentes
      if (saved.perfil) S.perfil = Object.assign(S.perfil, saved.perfil);
      if (Array.isArray(saved.cupones)) S.cupones = saved.cupones;
      const propios = (saved.parches || []).filter(p => p.creado && p.inicio > NOW() - DAY);
      S.parches.push(...propios);
    }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('No se pudo guardar', 'El navegador no tiene espacio para la foto.', true); } }

  // Derivados
  const fin = p => p.inicio + (p.dur || 180) * MIN;
  const confirmados = p => p.asistentes.length;
  const checkins = p => p.asistentes.filter(a => a.llego).length;
  const enLocal = p => p.lugar === 'capachos' && p.tipo !== 'otro';
  const activo = p => !p.cancelado && fin(p) > NOW();
  const enVivo = p => !p.cancelado && p.inicio <= NOW() && fin(p) > NOW();
  const lleno = p => confirmados(p) >= p.cupos;
  const hoyLocal = () => S.parches.filter(p => enLocal(p) && !p.cancelado && day0(p.inicio) === day0(NOW())).sort((a, b) => a.inicio - b.inicio);
  const relampagoActivo = () => S.parches.find(p => p.tipo === 'relampago' && enVivo(p));
  const cupon = id => S.cupones.find(k => k.id === id);
  const estadoCodigo = c => c.canjeado ? 'canjeado' : c.emitido < NOW() - 7 * DAY ? 'vencido' : 'pendiente';

  // Serie diaria con hoy incluido: hoy sale de los parches de esta noche (un solo dato)
  function serieCompleta() {
    const hoy = hoyLocal();
    return S.serie.concat([{ ts: day0(NOW()), checkins: hoy.reduce((s, p) => s + checkins(p), 0), confirmados: hoy.reduce((s, p) => s + confirmados(p), 0), hoy: true }]);
  }
  function verificar() {
    // Lo que se muestra dos veces es una sola variable: los días con detalle cuadran con la serie
    for (const dia of S.serie.slice(-14)) {
      const del = S.parches.filter(p => enLocal(p) && day0(p.inicio) === day0(dia.ts));
      console.assert(del.reduce((s, p) => s + checkins(p), 0) === dia.checkins, 'Check-ins del día no cuadran', dayKey(dia.ts));
      console.assert(del.reduce((s, p) => s + confirmados(p), 0) === dia.confirmados, 'Confirmados del día no cuadran', dayKey(dia.ts));
    }
    for (const k of S.cupones) {
      const cs = S.codigos.filter(c => c.cuponId === k.id);
      console.assert(cs.filter(c => c.canjeado).length + cs.filter(c => !c.canjeado).length === cs.length, 'Códigos de', k.nombre);
    }
  }

  /* =====================================================================
     4. NAVEGACIÓN
  ===================================================================== */
  const ROUTES = ['resumen', 'parches', 'mapa', 'cupones', 'asistentes', 'perfil'];
  let route = 'resumen';
  function go() {
    const r = (location.hash || '#resumen').slice(1).split('/')[0];
    route = ROUTES.includes(r) ? r : 'resumen';
    $$('.view').forEach(v => { v.hidden = v.id !== 'view-' + route; });
    $$('.nav-item[data-route]').forEach(a => { if (a.dataset.route === route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    toggleMenu(false);
    window.scrollTo(0, 0);
    render();
  }
  function render() {
    renderShell();
    if (route === 'resumen') renderResumen();
    if (route === 'parches') renderParches();
    if (route === 'mapa') renderMapa();
    if (route === 'cupones') renderCupones();
    if (route === 'asistentes') renderAsistentes();
    if (route === 'perfil') renderPerfil();
  }
  function toggleMenu(open) {
    const sb = $('#sidebar');
    const o = open ?? !sb.classList.contains('open');
    sb.classList.toggle('open', o);
    $('#menu-toggle').setAttribute('aria-expanded', String(o));
  }

  function logoHTML() {
    const l = S.perfil.logo;
    if (l.src) return `<img src="${esc(l.src)}" alt="" style="transform:scale(${l.zoom})">`;
    const ini = initials(S.perfil.nombre.replace(/^(Discoteca|Bar|Restaurante|Café)\s+/i, ''));
    return `<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" fill="#15110e"/><text x="32" y="41" text-anchor="middle" font-family="Gagalin, 'Bebas Neue', Impact, sans-serif" font-size="26" fill="#ff751f">${esc(ini)}</text></svg>`;
  }
  function renderShell() {
    $('#biz-name-top').textContent = S.perfil.nombre;
    $('#biz-logo-top').innerHTML = logoHTML();
    const pend = S.codigos.filter(c => estadoCodigo(c) === 'pendiente').length;
    const cc = $('#count-cupones'); cc.hidden = !pend; cc.textContent = pend;
    cc.setAttribute('aria-label', `${pend} códigos por canjear`);
    const vivos = S.parches.filter(p => enLocal(p) && enVivo(p)).length;
    const cp = $('#count-parches'); cp.hidden = !vivos; cp.textContent = vivos;
    cp.setAttribute('aria-label', `${vivos} parches en vivo`);
  }

  /* =====================================================================
     5. RESUMEN Y PARCHES
  ===================================================================== */
  const chartState = { metric: 'checkins', range: 30 };

  function periodo(offsetMeses) {
    // Del 1 del mes al mismo día de hoy, desplazado n meses
    const d = new Date(NOW()); const dia = d.getDate();
    const ini = new Date(d.getFullYear(), d.getMonth() - offsetMeses, 1).getTime();
    const finD = new Date(d.getFullYear(), d.getMonth() - offsetMeses, dia, 23, 59).getTime();
    return [ini, finD];
  }
  const rangoTxt = ([a, b]) => `1–${new Date(b).getDate()} ${new Intl.DateTimeFormat('es-CO', { month: 'short' }).format(a).replace('.', '')}`;

  function kpisResumen() {
    const serie = serieCompleta();
    const sumIn = ([a, b]) => serie.filter(d => d.ts >= a && d.ts <= b).reduce((s, d) => s + d.checkins, 0);
    const mes = periodo(0), ant = periodo(1);
    const inMes = sumIn(mes), inAnt = sumIn(ant);
    const activos = S.parches.filter(p => enLocal(p) && activo(p));
    const canjes = ([a, b]) => S.codigos.filter(c => c.canjeado && c.canjeado >= a && c.canjeado <= b).length;
    const cMes = canjes(mes), cAnt = canjes(ant);
    const prom = S.resenas.reduce((s, r) => s + r.estrellas, 0) / S.resenas.length;
    const deltaHTML = (now, before, label) => {
      if (!before) return `<p class="delta">${now ? `${signed(now)} (nuevo)` : '—'} vs ${label}</p>`;
      const diff = now - before, rel = diff / before;
      return `<p class="delta"><span class="${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}">${signed(diff)} (${rel > 0 ? '+' : rel < 0 ? MINUS : ''}${pct(Math.abs(rel))})</span> vs ${label}</p>`;
    };
    return { inMes, inAnt, mes, ant, activos, cMes, cAnt, prom, deltaHTML };
  }

  function renderResumen() {
    const k = kpisResumen();
    const hoy = hoyLocal();
    const confHoy = hoy.reduce((s, p) => s + confirmados(p), 0), inHoy = hoy.reduce((s, p) => s + checkins(p), 0);
    const llenos = hoy.filter(lleno);
    const pendLlena = S.codigos.filter(c => c.cuponId === 'k1' && estadoCodigo(c) === 'pendiente').length;
    $('#resumen-sub').innerHTML = hoy.length
      ? `Esta noche hay <b>${int(confHoy)} confirmados</b> en ${hoy.length} ${hoy.length === 1 ? 'parche' : 'parches'} y ${int(inHoy)} ya hicieron check-in.${llenos.length ? ` ${esc(llenos[0].titulo)} se llenó: ${pendLlena === 1 ? 'su cupón Mesa llena está' : `${pendLlena} cupones Mesa llena están`} por canjear.` : ''}`
      : 'No hay parches esta noche en el local. Un relámpago puede llenar las horas valle.';

    const ofi = k.activos.filter(p => p.tipo !== 'comunidad').length, com = k.activos.filter(p => p.tipo === 'comunidad').length;
    $('#kpis').innerHTML = `
      <div class="kpi kpi--lead"><p class="kpi-label">Check-ins este mes</p><p class="kpi-value num">${int(k.inMes)}<small>personas</small></p>${k.deltaHTML(k.inMes, k.inAnt, rangoTxt(k.ant))}</div>
      <div class="kpi"><p class="kpi-label">Parches activos</p><p class="kpi-value num">${int(k.activos.length)}</p><p class="delta">${ofi} oficiales · ${com} de la comunidad</p></div>
      <div class="kpi"><p class="kpi-label">Canjes este mes</p><p class="kpi-value num">${int(k.cMes)}</p>${k.deltaHTML(k.cMes, k.cAnt, rangoTxt(k.ant))}</div>
      <div class="kpi"><p class="kpi-label">Calificación</p><p class="kpi-value num">${k.prom.toFixed(1).replace('.', ',')}<small>/ 5</small></p><p class="delta">${S.resenas.length} reseñas de clientes</p></div>`;

    drawFlujo();
    renderProximos();
    renderNoche();
    renderCanjesRecientes();
  }

  function drawFlujo() {
    const serie = serieCompleta().slice(-chartState.range);
    const metric = chartState.metric;
    const values = serie.map(d => d[metric]);
    const labels = serie.map(d => chartState.range === 7 ? cap(new Intl.DateTimeFormat('es-CO', { weekday: 'short' }).format(d.ts).replace('.', '')) + ' ' + new Date(d.ts).getDate() : fmtMesCorto(d.ts));
    const annotations = serie.map((d, i) => d.relampago ? { at: i, label: 'Hora feliz relámpago', short: 'Relámpago' } : null).filter(Boolean);
    const total = values.reduce((s, v) => s + v, 0);
    const tipico = serie.filter(d => !d.hoy && !d.relampago && new Date(d.ts).getDay() === 5).map(d => d[metric]);
    const promViernes = tipico.length ? Math.round(tipico.reduce((s, v) => s + v, 0) / tipico.length) : null;
    $('#flujo-meta').textContent = `${int(total)} ${metric === 'checkins' ? 'check-ins' : 'confirmaciones'} en ${chartState.range} días${promViernes ? ` · un viernes típico: ${int(promViernes)}` : ''} · en naranja, los últimos 7 días; hoy va en curso`;
    if (!window.Charts) { $('#chart-flujo').innerHTML = '<p class="empty">No se pudo dibujar la gráfica.</p>'; return; }
    const semana = values.map((_, i) => i).filter(i => i >= values.length - 7);
    Charts.bars($('#chart-flujo'), { labels, values, height: 210, highlight: chartState.range === 30 ? semana : null, mutedColour: getComputedStyle(document.documentElement).getPropertyValue('--accent-200').trim(), dim: [values.length - 1], annotations, format: v => int(v) });
  }

  function estadoPill(p) {
    if (p.cancelado) return '<span class="pill">Cancelado</span>';
    if (fin(p) <= NOW()) return '<span class="pill">Terminado</span>';
    if (enVivo(p)) return '<span class="pill brand live"><span class="dot"></span>En vivo</span>';
    if (lleno(p)) return '<span class="pill warn">Lleno</span>';
    return '<span class="pill pos">Abierto</span>';
  }
  const tipoTxt = p => ({ oficial: 'Oficial del local', comunidad: `Organiza ${p.organizador}`, relampago: 'Relámpago', otro: `Organiza ${p.organizador}` }[p.tipo]);
  const aforoHTML = p => {
    const c = confirmados(p), inn = checkins(p);
    return `<span class="aforo-cell"><span class="num"><b>${int(c)}</b> <span class="unit">/ ${int(p.cupos)}</span></span><span class="mini-track" aria-hidden="true"><i style="width:${clamp(inn / p.cupos, 0, 1) * 100}%"></i><i style="width:${clamp((c - inn) / p.cupos, 0, 1) * 100}%"></i></span></span>`;
  };

  function renderProximos() {
    const list = S.parches.filter(p => enLocal(p) && activo(p)).sort((a, b) => a.inicio - b.inicio);
    $('#proximos-link').textContent = `Ver todos (${list.length})`;
    $('#tabla-proximos').innerHTML = `<thead><tr><th>Parche</th><th>Cuándo</th><th class="n">Confirmados</th><th>Estado</th></tr></thead><tbody>${
      list.slice(0, 5).map(p => `<tr><td><span class="name truncate">${esc(p.titulo)}</span><span class="sub">${esc(tipoTxt(p))}</span></td><td class="num">${esc(fmtCuando(p.inicio))}</td><td class="n">${aforoHTML(p)}</td><td>${estadoPill(p)}</td></tr>`).join('')
      || '<tr><td colspan="4"><p class="empty">No hay parches programados. Publica uno oficial o lanza un relámpago.</p></td></tr>'
    }</tbody>`;
  }

  function renderNoche() {
    const box = $('#noche');
    const rel = relampagoActivo();
    const hoy = hoyLocal().filter(p => fin(p) > NOW() - 6 * HOUR && p !== rel);
    let html = '';
    if (rel) {
      html += `<div class="flash"><div class="flash-top"><b>${esc(rel.titulo)}</b><span class="left">${fmtDur(minsLeft(fin(rel)))}</span></div>
        <div class="door-nums"><span><b>${int(confirmados(rel))}</b> confirmados de ${int(rel.cupos)}</span><span>Termina a las ${fmtHora(fin(rel))}</span></div>
        <button class="btn btn--sm" data-action="terminar-rel" data-id="${rel.id}">Terminar ahora</button></div>`;
    }
    if (!hoy.length) {
      box.innerHTML = html + '<p class="empty">No hay parches esta noche en el local.</p>';
      return;
    }
    html += `<div class="door-legend"><span><i style="background:var(--accent)"></i>Llegaron</span><span><i style="background:var(--accent-200)"></i>Por llegar</span><span><i style="background:var(--rule)"></i>Cupos libres</span></div><div class="door">`;
    for (const p of hoy) {
      const c = confirmados(p), inn = checkins(p), libres = Math.max(0, p.cupos - c);
      html += `<button class="door-item row--btn" data-action="ver-asistentes" data-id="${p.id}" style="padding-top:8px;padding-bottom:8px">
        <span class="door-top"><b>${esc(p.titulo)}</b><span>${fmtHora(p.inicio)}</span></span>
        <span class="door-track" role="img" aria-label="${inn} llegaron, ${c - inn} por llegar, ${libres} cupos libres de ${p.cupos}"><i class="in" style="width:${inn / p.cupos * 100}%"></i><i class="pend" style="width:${(c - inn) / p.cupos * 100}%"></i></span>
        <span class="door-nums"><span><b>${int(inn)}</b> llegaron · ${int(c - inn)} por llegar</span><span>${libres ? `${int(libres)} cupos libres` : 'Lleno'}</span></span>
      </button>`;
    }
    box.innerHTML = html + '</div>';
  }

  function renderCanjesRecientes() {
    const list = S.codigos.filter(c => c.canjeado).sort((a, b) => b.canjeado - a.canjeado).slice(0, 5);
    $('#canjes-recientes').innerHTML = (list.length ? `<ul class="rows">${list.map(c => `<li class="row"><span class="row-main"><b class="code">${esc(c.codigo)}</b><small>${esc(cupon(c.cuponId)?.nombre || '')} · ${esc(c.persona)}</small></span><span class="row-end">${esc(fmtDia(c.canjeado))}<small>${fmtHora(c.canjeado)}</small></span></li>`).join('')}</ul>` : '<p class="empty">Todavía no hay canjes.</p>')
      + '<div class="panel-foot"><a class="btn btn--sm" href="#cupones">Ver todos los canjes</a></div>';
  }

  /* ---------- Lista de parches ---------- */
  const listState = { tab: 'proximos', q: '' };
  function renderParches() {
    const local = S.parches.filter(enLocal);
    const sets = {
      proximos: local.filter(p => activo(p)).sort((a, b) => a.inicio - b.inicio),
      relampago: local.filter(p => p.tipo === 'relampago').sort((a, b) => b.inicio - a.inicio),
      comunidad: local.filter(p => p.tipo === 'comunidad' && activo(p)).sort((a, b) => a.inicio - b.inicio),
      pasados: local.filter(p => !activo(p)).sort((a, b) => b.inicio - a.inicio),
    };
    $$('#parches-tabs [data-tab]').forEach(b => {
      b.setAttribute('aria-selected', String(b.dataset.tab === listState.tab));
      const n = sets[b.dataset.tab].length;
      b.innerHTML = `${esc(b.textContent.replace(/\s*\d+$/, ''))}<span class="tab-count">${n}</span>`;
    });
    const ofi = sets.proximos.filter(p => p.tipo !== 'comunidad').length;
    $('#parches-sub').textContent = `${sets.proximos.length} próximos: ${ofi} oficiales o relámpago y ${sets.proximos.length - ofi} organizados por la comunidad en tu local.`;
    const q = norm(listState.q);
    const rows = sets[listState.tab].filter(p => !q || norm(`${p.titulo} ${p.organizador}`).includes(q));
    $('#parches-count').textContent = `${rows.length} ${rows.length === 1 ? 'parche' : 'parches'}`;
    $('#tabla-parches').innerHTML = `<thead><tr><th>Parche</th><th>Fecha</th><th class="n">Confirmados</th><th class="n">Check-ins</th><th class="n">Consumo por persona</th><th>Estado</th><th class="act"><span class="sr-only">Acciones</span></th></tr></thead><tbody>${
      rows.map(p => `<tr>
        <td class="c-name"><span class="name truncate">${esc(p.titulo)}</span><span class="sub">${esc(tipoTxt(p))}</span></td>
        <td class="c-fecha num">${esc(fmtDia(p.inicio))}<span class="sub">${fmtHora(p.inicio)}${p.tipo === 'relampago' ? ` a ${fmtHora(fin(p))}` : ''}</span><span class="sub m-only">${p.inicio > NOW() ? 'Sin check-ins aún' : `${int(checkins(p))} check-ins`}${p.consumo ? ` · ${money(p.consumo)} por persona` : ''}</span></td>
        <td class="c-aforo n">${aforoHTML(p)}</td>
        <td class="c-check n">${p.inicio > NOW() ? '<span class="unit">—</span>' : int(checkins(p))}</td>
        <td class="c-consumo n">${p.consumo ? money(p.consumo) : '<span class="unit">—</span>'}</td>
        <td class="c-estado">${estadoPill(p)}</td>
        <td class="act"><button class="icon-btn" data-action="row-menu" data-id="${p.id}" aria-label="Acciones de ${esc(p.titulo)}" aria-haspopup="menu">${ic('i-more')}</button></td>
      </tr>`).join('') || `<tr><td colspan="7"><p class="empty">${listState.q ? `Ningún parche coincide con "${esc(listState.q)}".` : listState.tab === 'relampago' ? 'Todavía no has lanzado parches relámpago.' : 'No hay parches en esta lista.'}</p></td></tr>`
    }</tbody>`;
  }

  function openRowMenu(btn, id) {
    const p = S.parches.find(x => x.id === id);
    const menu = $('#row-menu');
    const editable = p.tipo !== 'comunidad' && activo(p);
    menu.innerHTML = `<button data-action="ver-asistentes" data-id="${id}" role="menuitem">${ic('i-users')} Asistentes y chat</button>
      ${editable ? `<button data-action="editar" data-id="${id}" role="menuitem">${ic('i-edit')} Editar parche</button>
      <button class="danger" data-action="cancelar" data-id="${id}" role="menuitem">${ic('i-trash')} Cancelar parche</button>` : ''}`;
    const r = btn.getBoundingClientRect();
    menu.hidden = false;
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
    menu.style.top = (r.bottom + h + 8 > window.innerHeight ? r.top - h - 4 : r.bottom + 4) + 'px';
    menu.querySelector('button').focus();
  }
  const closeRowMenu = () => { $('#row-menu').hidden = true; };

  /* =====================================================================
     6. MAPA COMERCIAL Y GPS
  ===================================================================== */
  let map = null, mapLayer = null, meMarker = null, meCircle = null, bizMarker = null, watchId = null, flyMe = false;
  let userPos = null;
  const timeState = { mode: 'hoy', date: null };
  const tiles = () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' });
  const bizIcon = (n = 0, flash = false) => L.divIcon({ className: 'pin-icon', html: `<div class="biz-pin ${flash ? 'mpin--flash' : ''}" title="${esc(S.perfil.nombre)}">${ic('i-store')}${n ? `<span class="biz-count">${n}</span>` : ''}</div>`, iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -18] });
  const pinIcon = p => {
    const cls = p.tipo === 'otro' ? 'mpin--other' : p.tipo === 'comunidad' ? 'mpin--com' : 'mpin--own';
    return L.divIcon({ className: 'pin-icon', html: `<div class="mpin ${cls} ${p.tipo === 'relampago' && enVivo(p) ? 'mpin--flash' : ''}"></div>`, iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -10] });
  };
  const meIcon = () => L.divIcon({ className: 'pin-icon', html: '<div class="mpin mpin--me" title="Tu ubicación"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });

  function timeMatch(p) {
    const d = Math.round((day0(p.inicio) - day0(NOW())) / DAY);
    if (timeState.mode === 'todos') return true;
    if (timeState.mode === 'hoy') return d === 0;
    if (timeState.mode === 'manana') return d === 1;
    return dayKey(p.inicio) === timeState.date;
  }
  function timeLabel() {
    if (timeState.mode === 'todos') return 'en los próximos días';
    if (timeState.mode === 'hoy') return 'hoy';
    if (timeState.mode === 'manana') return 'mañana';
    return 'el ' + new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(timeState.date + 'T12:00:00')).replace('.', '');
  }
  function buildTimeSelect() {
    const opts = ['<option value="">En: elegir día</option>'];
    for (let i = 2; i <= 13; i++) { const ts = day0(NOW()) + i * DAY; opts.push(`<option value="${dayKey(ts)}">En: ${cap(new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'short' }).format(ts).replace('.', ''))}</option>`); }
    opts.push('<option value="__fecha">En: fecha exacta...</option>');
    $('#time-select').innerHTML = opts.join('');
    $('#time-date').min = dayKey(NOW());
  }

  function renderMapa() {
    const list = S.parches.filter(p => activo(p) && timeMatch(p)).sort((a, b) => a.inicio - b.inicio);
    const enMi = list.filter(enLocal).length;
    $('#mapa-sub').textContent = `${list.length} ${list.length === 1 ? 'parche' : 'parches'} ${timeLabel()} en Villavicencio, ${enMi} en tu local.`;
    $$('#time-filter [data-time]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.time === timeState.mode)));
    const sel = $('#time-select');
    sel.value = timeState.mode === 'fecha' && [...sel.options].some(o => o.value === timeState.date) ? timeState.date : timeState.mode === 'fecha' ? '__fecha' : '';
    $('#time-date').hidden = !(timeState.mode === 'fecha' && sel.value === '__fecha');
    if (timeState.mode === 'fecha') $('#time-date').value = timeState.date;

    $('#map-legend').innerHTML = `<span><i class="lg lg--own"></i>Tus parches oficiales y relámpago</span><span><i class="lg lg--com"></i>De la comunidad en tu local</span><span><i class="lg lg--other"></i>Otros puntos de la ciudad</span>${userPos ? '<span><i class="lg lg--me"></i>Tu ubicación</span>' : ''}`;
    $('#maplist-meta').textContent = `${list.length} ${timeLabel()}`;
    $('#map-list').innerHTML = list.length ? list.map(p => `<li><button class="row row--btn" data-action="fly" data-id="${p.id}">
        <span class="lg ${p.tipo === 'otro' ? 'lg--other' : p.tipo === 'comunidad' ? 'lg--com' : 'lg--own'}" aria-hidden="true"></span>
        <span class="row-main"><b>${esc(p.titulo)}</b><small>${esc(LUGARES[p.lugar]?.nombre || '')} · ${esc(fmtCuando(p.inicio))}</small></span>
        <span class="row-end num">${int(confirmados(p))}<small>de ${int(p.cupos)}</small></span>
      </button></li>`).join('') : `<li><p class="empty">Nadie ha abierto parche ${timeLabel()}. Es buen momento para un relámpago.</p></li>`;

    setTimeout(() => {
      if (typeof L === 'undefined') return;
      if (!map) {
        map = L.map('map', { zoomControl: true }).setView([S.perfil.lat, S.perfil.lng], 13);
        tiles().addTo(map);
        mapLayer = L.layerGroup().addTo(map);
        bizMarker = L.marker([S.perfil.lat, S.perfil.lng], { icon: bizIcon(), zIndexOffset: 800 }).bindPopup(`<div class="pop"><b>${esc(S.perfil.nombre)}</b><span>${esc(S.perfil.direccion)}</span></div>`).addTo(map);
      }
      map.invalidateSize();
      const enPunto = p => Math.abs(p.lat - S.perfil.lat) < 1e-4 && Math.abs(p.lng - S.perfil.lng) < 1e-4;
      const delLocal = list.filter(enPunto);
      bizMarker.setLatLng([S.perfil.lat, S.perfil.lng]).setIcon(bizIcon(delLocal.length, delLocal.some(p => p.tipo === 'relampago' && enVivo(p))));
      bizMarker.setPopupContent(`<div class="pop"><b>${esc(S.perfil.nombre)}</b><span>${esc(S.perfil.direccion)}</span>${delLocal.map(p => `<span>${esc(fmtHora(p.inicio))} · ${esc(p.titulo)} · ${int(confirmados(p))} de ${int(p.cupos)}</span>`).join('') || '<span>Sin parches en este filtro</span>'}</div>`);
      mapLayer.clearLayers();
      list.filter(p => !enPunto(p)).forEach(p => {
        const m = L.marker([p.lat, p.lng], { icon: pinIcon(p), riseOnHover: true })
          .bindPopup(`<div class="pop"><b>${esc(p.titulo)}</b><span>${esc(LUGARES[p.lugar]?.nombre || '')}</span><span>${esc(fmtCuando(p.inicio))} · ${int(confirmados(p))} de ${int(p.cupos)} confirmados</span>${estadoPill(p)}</div>`);
        m._pid = p.id;
        m.addTo(mapLayer);
      });
      updateMe();
    }, 30);
  }
  function flyTo(id) {
    const p = S.parches.find(x => x.id === id);
    if (!p || !map) return;
    map.flyTo([p.lat, p.lng], 16, { duration: 1 });
    let found = false;
    mapLayer.eachLayer(m => { if (m._pid === id) { found = true; map.once('moveend', () => m.openPopup()); } });
    if (!found && bizMarker) map.once('moveend', () => bizMarker.openPopup());
  }

  function startGeo(fly) {
    if (!('geolocation' in navigator)) { $('#geo-stamp').textContent = 'Este navegador no comparte la ubicación.'; return; }
    flyMe = flyMe || fly;
    if (fly && userPos && map) map.flyTo(userPos, 15, { duration: 1 });
    const o = { enableHighAccuracy: true, timeout: 12000, maximumAge: 20000 };
    const ok = pos => {
      userPos = [pos.coords.latitude, pos.coords.longitude];
      $('#geo-stamp').textContent = `Ubicación en vivo, precisión ${int(pos.coords.accuracy)} m`;
      updateMe(pos.coords.accuracy);
      if (flyMe && map) { flyMe = false; map.flyTo(userPos, 15, { duration: 1 }); }
    };
    const bad = err => {
      $('#geo-stamp').textContent = err.code === 1 ? 'Sin permiso de ubicación. Actívalo en el candado del navegador.' : 'No pudimos leer tu ubicación.';
      if (flyMe) { flyMe = false; toast('Sin ubicación', $('#geo-stamp').textContent, true); }
    };
    navigator.geolocation.getCurrentPosition(ok, bad, o);
    if (watchId === null) watchId = navigator.geolocation.watchPosition(ok, bad, o);
  }
  function updateMe(acc) {
    if (!map || !userPos) return;
    if (!meMarker) {
      meMarker = L.marker(userPos, { icon: meIcon(), zIndexOffset: 900, interactive: false }).addTo(map);
      meCircle = L.circle(userPos, { radius: acc || 30, color: '#2f6fd6', weight: 1, fillOpacity: .08 }).addTo(map);
    } else { meMarker.setLatLng(userPos); if (acc) meCircle.setLatLng(userPos).setRadius(acc); }
  }

  /* =====================================================================
     7. CUPONES Y VALIDADOR
  ===================================================================== */
  const REGLAS = {
    lleno: 'El parche llega al 100 % del aforo',
    mitad: 'El parche llega al 50 % del aforo',
    temprano: 'Check-in en la primera hora del parche',
    cumple: 'Cumpleaños con 10 o más confirmados',
    relampago: 'Durante un parche relámpago',
  };
  let canjesShown = 8;
  function renderCupones() {
    const mes = periodo(0);
    const cMes = S.codigos.filter(c => c.canjeado && c.canjeado >= mes[0] && c.canjeado <= mes[1]).length;
    const pend = S.codigos.filter(c => estadoCodigo(c) === 'pendiente').sort((a, b) => b.emitido - a.emitido);
    $('#cupones-sub').innerHTML = `<b>${int(cMes)} canjeados</b> este mes y ${int(pend.length)} ${pend.length === 1 ? 'código vigente' : 'códigos vigentes'} por canjear. Los códigos vencen a los 7 días.`;

    $('#pendientes-meta').textContent = `${pend.length} vigentes`;
    $('#pendientes').innerHTML = pend.length ? pend.slice(0, 6).map(c => `<li><button class="row row--btn" data-action="usar-codigo" data-code="${esc(c.codigo)}">
      <span class="row-main"><b class="code">${esc(c.codigo)}</b><small>${esc(cupon(c.cuponId)?.nombre || '')} · ${esc(c.persona)}</small></span>
      <span class="row-end">${esc(fmtDia(c.emitido))}<small>vence ${esc(fmtMesCorto(c.emitido + 7 * DAY))}</small></span></button></li>`).join('')
      + (pend.length > 6 ? `<li class="row"><span class="hint">Y ${pend.length - 6} más. Búscalos por código en la barra superior.</span></li>` : '')
      : '<li><p class="empty">No hay códigos por canjear.</p></li>';

    $('#tabla-cupones').innerHTML = `<thead><tr><th>Recompensa</th><th>Qué recibe</th><th class="n">Emitidos</th><th class="n">Canjeados</th><th class="n">Tasa de canje</th><th class="act">Activa</th></tr></thead><tbody>${
      S.cupones.map(k => {
        const cs = S.codigos.filter(c => c.cuponId === k.id), canj = cs.filter(c => c.canjeado).length;
        return `<tr><td><span class="name">${esc(k.nombre)}</span><span class="sub">${esc(REGLAS[k.regla] || k.regla)}</span></td><td>${esc(k.beneficio)}</td>
          <td class="n">${int(cs.length)}</td><td class="n">${int(canj)}</td><td class="n">${cs.length ? pct(canj / cs.length) : '<span class="unit">—</span>'}</td>
          <td class="act"><label class="sr-only" for="sw-${k.id}">Activar ${esc(k.nombre)}</label><input type="checkbox" class="switch" id="sw-${k.id}" data-cupon="${k.id}" ${k.activo ? 'checked' : ''}></td></tr>`;
      }).join('')
    }</tbody>`;

    const hist = S.codigos.filter(c => c.canjeado).sort((a, b) => b.canjeado - a.canjeado);
    $('#historial-meta').textContent = `${int(hist.length)} canjes en total`;
    $('#tabla-canjes').innerHTML = `<thead><tr><th>Código</th><th>Recompensa</th><th>Cliente</th><th class="n">Canjeado</th></tr></thead><tbody>${
      hist.slice(0, canjesShown).map(c => `<tr><td class="code">${esc(c.codigo)}</td><td>${esc(cupon(c.cuponId)?.nombre || '')}</td><td>${esc(c.persona)}</td><td class="n">${isoDateTime(c.canjeado)}</td></tr>`).join('')
      || '<tr><td colspan="4"><p class="empty">Todavía no hay canjes.</p></td></tr>'
    }</tbody>`;
    $('#canjes-more').hidden = hist.length <= canjesShown;
  }

  function validar(raw) {
    const code = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
    const out = $('#validator-result');
    if (!code) { out.innerHTML = ''; return; }
    const c = S.codigos.find(x => x.codigo === code);
    const verdict = (ok, title, text) => { out.innerHTML = `<div class="verdict ${ok ? 'ok' : 'bad'}">${ic(ok ? 'i-check' : 'i-alert')}<b>${title}</b><p>${text}</p></div>`; };
    if (!c) return verdict(false, `${esc(code)} no existe`, 'Revisa que el cliente te muestre el código completo, con el guion.');
    const k = cupon(c.cuponId);
    const st = estadoCodigo(c);
    if (st === 'canjeado') return verdict(false, 'Este código ya se usó', `Se canjeó el ${isoDateTime(c.canjeado)}. ${esc(k?.nombre || '')} para ${esc(c.persona)}.`);
    if (st === 'vencido') return verdict(false, 'Este código venció', `Se emitió el ${esc(fmtMesCorto(c.emitido))} y valía 7 días.`);
    if (k && !k.activo) return verdict(false, 'Recompensa pausada', `Activa "${esc(k.nombre)}" para poder canjearla.`);
    c.canjeado = NOW();
    save();
    verdict(true, `Canjeado: ${esc(k?.beneficio || '')}`, `${esc(c.persona)} · ${esc(k?.nombre || '')} · ${esc(c.codigo)}`);
    toast('Cupón canjeado', `${c.codigo}: ${k?.beneficio || ''}`);
    $('#code-input').value = '';
    renderShell();
    if (route === 'cupones') renderCupones();
  }

  function emitirCodigo(k, personaNombre) {
    let codigo;
    do { codigo = `${k.prefijo}-${1000 + Math.floor(Math.random() * 9000)}`; } while (S.codigos.some(c => c.codigo === codigo));
    S.codigos.push({ codigo, cuponId: k.id, persona: personaNombre, emitido: NOW(), canjeado: null });
    return codigo;
  }

  /* =====================================================================
     8. ASISTENTES Y CHAT
  ===================================================================== */
  const asisState = { id: null, tab: 'lista', filtro: 'todos', q: '', shown: 30 };
  function parchesParaSelect() {
    const local = S.parches.filter(p => enLocal(p) && !p.cancelado);
    const hoy = local.filter(p => day0(p.inicio) === day0(NOW())).sort((a, b) => a.inicio - b.inicio);
    const prox = local.filter(p => day0(p.inicio) > day0(NOW())).sort((a, b) => a.inicio - b.inicio);
    const pas = local.filter(p => day0(p.inicio) < day0(NOW())).sort((a, b) => b.inicio - a.inicio).slice(0, 6);
    return { hoy, prox, pas };
  }
  function renderAsistentes() {
    const g = parchesParaSelect();
    if (!asisState.id || !S.parches.some(p => p.id === asisState.id)) asisState.id = (g.hoy[0] || g.prox[0] || g.pas[0])?.id || null;
    const opt = (p) => `<option value="${p.id}" ${p.id === asisState.id ? 'selected' : ''}>${esc(p.titulo)} · ${esc(fmtDia(p.inicio))}</option>`;
    $('#parche-select').innerHTML = (g.hoy.length ? `<optgroup label="Esta noche">${g.hoy.map(opt).join('')}</optgroup>` : '')
      + (g.prox.length ? `<optgroup label="Próximos">${g.prox.map(opt).join('')}</optgroup>` : '')
      + (g.pas.length ? `<optgroup label="Pasados">${g.pas.map(opt).join('')}</optgroup>` : '');
    const p = S.parches.find(x => x.id === asisState.id);
    if (!p) { $('#h-asistentes').textContent = 'Asistentes'; $('#people').innerHTML = '<li><p class="empty">No hay parches en el local.</p></li>'; return; }
    $('#h-asistentes').textContent = p.titulo;
    const c = confirmados(p), inn = checkins(p);
    $('#asistentes-sub').textContent = `${fmtCuando(p.inicio)} · ${tipoTxt(p)} · aforo de ${int(p.cupos)}`;
    $('#asis-kpis').innerHTML = `
      <div class="kpi"><p class="kpi-label">Confirmados</p><p class="kpi-value num">${int(c)}<small>/ ${int(p.cupos)}</small></p><p class="delta">${lleno(p) ? 'Parche lleno' : `${int(p.cupos - c)} cupos libres`}</p></div>
      <div class="kpi kpi--lead"><p class="kpi-label">Llegaron</p><p class="kpi-value num">${int(inn)}</p><p class="delta">${c ? pct(inn / c) : '—'} de los confirmados</p></div>
      <div class="kpi"><p class="kpi-label">Por llegar</p><p class="kpi-value num">${int(c - inn)}</p><p class="delta">${p.inicio > NOW() ? `Arranca ${fmtCuando(p.inicio).toLowerCase()}` : fin(p) > NOW() ? `Termina a las ${fmtHora(fin(p))}` : 'El parche ya terminó'}</p></div>`;

    $$('#asis-tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === asisState.tab)));
    $('#asis-lista').hidden = asisState.tab !== 'lista';
    $('#asis-chat').hidden = asisState.tab !== 'chat';
    $$('[data-asis]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.asis === asisState.filtro)));

    if (asisState.tab === 'lista') {
      const q = norm(asisState.q);
      const rows = p.asistentes
        .filter(a => asisState.filtro === 'todos' || (asisState.filtro === 'llegaron' ? a.llego : !a.llego))
        .filter(a => !q || norm(a.nombre).includes(q))
        .sort((a, b) => (b.llego || 0) - (a.llego || 0));
      $('#asis-count').textContent = `${rows.length} ${rows.length === 1 ? 'persona' : 'personas'}`;
      const puede = p.inicio - HOUR <= NOW() && fin(p) + 2 * HOUR > NOW();
      $('#people').innerHTML = rows.slice(0, asisState.shown).map(a => `<li class="person">${avatar(a)}
        <span><b>${esc(a.nombre)}</b><small>Confirmó ${esc(fmtCuando(a.confirmo).toLowerCase())}</small></span>
        ${a.llego ? `<span class="pill pos">Llegó ${fmtHora(a.llego)}</span>` : '<span class="pill">Por llegar</span>'}
        ${puede ? (a.llego ? `<button class="btn ghost btn--sm" data-action="deshacer" data-uid="${a.id}">Deshacer</button>` : `<button class="btn btn--sm" data-action="checkin" data-uid="${a.id}">${ic('i-check')} Marcar llegada</button>`) : '<span></span>'}
      </li>`).join('') || `<li><p class="empty">${q ? `Nadie se llama "${esc(asisState.q)}" en este parche.` : 'No hay personas en esta lista.'}</p></li>`;
      $('#people-more').hidden = rows.length <= asisState.shown;
    } else renderChat(p);
  }

  function renderChat(p) {
    const box = $('#chat-msgs');
    box.innerHTML = p.chat.length ? p.chat.map(m => {
      if (m.tipo === 'sys') return `<p class="msg msg--sys">${esc(m.texto)} · ${fmtHora(m.ts)}</p>`;
      if (m.autor === 'biz') return `<div class="msg msg--biz"><div class="msg-body"><small>${esc(S.perfil.nombre)} · ${fmtHora(m.ts)}</small><p>${esc(m.texto)}</p></div><span class="avatar biz-logo" aria-hidden="true">${logoHTML()}</span></div>`;
      return `<div class="msg">${avatar(m.autor)}<div class="msg-body"><small>${esc(m.autor.nombre)} · ${fmtHora(m.ts)}</small><p>${esc(m.texto)}</p></div></div>`;
    }).join('') : '<p class="msg msg--sys">Todavía no hay mensajes. Saluda al grupo.</p>';
    requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
  }
  const RESPUESTAS = ['De una, gracias', 'Listo, ya vamos para allá', 'Perfecto', 'Melo, nos vemos', '¿Hay parqueadero?'];

  function marcarLlegada(uid, on) {
    const p = S.parches.find(x => x.id === asisState.id);
    const a = p && p.asistentes.find(x => x.id === uid);
    if (!a) return;
    a.llego = on ? NOW() : null;
    let extra = '';
    // Recompensa automática: check-in en la primera hora
    const k = S.cupones.find(x => x.regla === 'temprano' && x.activo);
    if (on && k && NOW() <= p.inicio + HOUR) extra = ` Se emitió ${emitirCodigo(k, a.nombre)} (${k.nombre}).`;
    save();
    toast(on ? 'Check-in registrado' : 'Check-in deshecho', `${a.nombre}${on ? ' ya está en el local.' : ' vuelve a estar por llegar.'}${extra}`);
    renderShell();
    renderAsistentes();
  }

  /* =====================================================================
     9. PERFIL DEL LOCAL
  ===================================================================== */
  let mapPerfil = null, perfilMarker = null, moviendo = false;
  function coverStyle(c) { return `transform:translateY(${c.y}%) scale(${c.zoom})`; }
  function renderPerfil() {
    const P = S.perfil;
    $('#b-nombre').value = P.nombre;
    $('#b-categoria').innerHTML = CATEGORIAS.map(c => `<option ${c === P.categoria ? 'selected' : ''}>${esc(c)}</option>`).join('');
    $('#b-tel').value = P.tel; $('#b-nit').textContent = P.nit; $('#b-desc').value = P.desc;

    $('#hours').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(d => {
      const h = P.horarios[d];
      return `<div class="hour-row"><b>${DIAS[d]}</b>
        <label class="field--inline"><input type="checkbox" class="switch" data-day="${d}" ${h.abierto ? 'checked' : ''}><span>${h.abierto ? 'Abierto' : 'Cerrado'}</span></label>
        <span class="hour-times ${h.abierto ? '' : 'is-off'}"><input class="input num" type="time" data-open="${d}" value="${h.open}" aria-label="${DIAS[d]} abre"><span>a</span><input class="input num" type="time" data-close="${d}" value="${h.close}" aria-label="${DIAS[d]} cierra"></span>
      </div>`;
    }).join('');

    $('#img-cover').src = P.cover.src; $('#img-cover').style.cssText = coverStyle(P.cover);
    $('#cz').value = P.cover.zoom; $('#cy').value = P.cover.y;
    $('#out-cz').textContent = P.cover.zoom.toFixed(2).replace('.', ',') + 'x'; $('#out-cy').textContent = P.cover.y;
    $('#frame-logo').innerHTML = logoHTML(); $('#lz').value = P.logo.zoom; $('#out-lz').textContent = P.logo.zoom.toFixed(2).replace('.', ',') + 'x';
    $('#lz').disabled = !P.logo.src; $('#logo-reset').hidden = !P.logo.src;
    renderPreview();

    $('#ubic-stamp').textContent = `${P.direccion} · ${P.lat.toFixed(4)}, ${P.lng.toFixed(4)}`;
    setTimeout(() => {
      if (typeof L === 'undefined') return;
      if (!mapPerfil) {
        mapPerfil = L.map('map-perfil', { scrollWheelZoom: false }).setView([P.lat, P.lng], 15);
        tiles().addTo(mapPerfil);
        perfilMarker = L.marker([P.lat, P.lng], { icon: bizIcon(), draggable: false }).addTo(mapPerfil);
        perfilMarker.on('dragend', () => { $('#ubic-save').disabled = false; const ll = perfilMarker.getLatLng(); $('#ubic-stamp').textContent = `Nuevo punto · ${ll.lat.toFixed(4)}, ${ll.lng.toFixed(4)}`; });
      }
      mapPerfil.invalidateSize();
    }, 30);

    const prom = S.resenas.reduce((s, r) => s + r.estrellas, 0) / S.resenas.length;
    $('#rating-big').innerHTML = `<b>${prom.toFixed(1).replace('.', ',')}</b><span>de 5, con ${S.resenas.length} reseñas</span>`;
    const dist = [5, 4, 3, 2, 1].map(n => ({ label: `${n} ${n === 1 ? 'estrella' : 'estrellas'}`, value: S.resenas.filter(r => r.estrellas === n).length }));
    console.assert(dist.reduce((s, d) => s + d.value, 0) === S.resenas.length, 'La distribución de estrellas no suma');
    if (window.Charts) Charts.barList($('#rating-dist'), dist, { thin: true, colour: 'var(--accent)', format: v => int(v) });
    const stars = n => `<span class="stars" aria-label="${n} de 5">${[1, 2, 3, 4, 5].map(i => `<svg class="ic ${i <= n ? '' : 'off'}" aria-hidden="true"><use href="#i-star"/></svg>`).join('')}</span>`;
    $('#reviews').innerHTML = S.resenas.slice(0, 6).map(r => `<li class="review"><div class="review-top">${stars(r.estrellas)}<b>${esc(r.autor)}</b><small>${esc(fmtMesCorto(r.fecha))}</small></div><p>${esc(r.texto)}</p><p class="on">En ${esc(r.parche)}</p></li>`).join('');
  }
  function renderPreview() {
    const P = S.perfil;
    $('#preview-card').innerHTML = `<div class="preview-cover"><img src="${esc(P.cover.src)}" alt="" style="${coverStyle(P.cover)}"></div>
      <div class="preview-body"><span class="biz-logo">${logoHTML()}</span><span><b>${esc(P.nombre)}</b><small>${esc(P.categoria)} · ${esc(P.direccion)}</small></span></div>`;
  }
  const stamp = id => { $('#' + id).textContent = `Guardado a las ${fmtHora(NOW())}`; };

  function readImage(file, max = 1200) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onerror = rej;
      r.onload = () => { const im = new Image(); im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.84)); }; im.onerror = rej; im.src = r.result; };
      r.readAsDataURL(file);
    });
  }

  /* =====================================================================
     10. DIÁLOGOS, AVISOS E INICIO
  ===================================================================== */
  function toast(title, text = '', error = false) {
    const el = document.createElement('div');
    el.className = 'toast' + (error ? ' is-error' : '');
    el.setAttribute('role', error ? 'alert' : 'status');
    el.innerHTML = `${ic(error ? 'i-alert' : 'i-check')}<div><b>${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ''}</div>`;
    $('#toasts').appendChild(el);
    while ($('#toasts').children.length > 3) $('#toasts').firstElementChild.remove();
    setTimeout(() => el.remove(), 4200);
  }

  function setField(input, msg) {
    const f = input.closest('.field');
    f.classList.toggle('is-error', !!msg);
    f.classList.toggle('is-valid', !msg);
    const out = $('.field-msg', f); if (out) out.textContent = msg;
    if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    return !msg;
  }

  /* ---------- Parche oficial: crear y editar ---------- */
  let editId = null, mapDlg = null, dlgMarker = null;
  const dlgPos = { lat: null, lng: null };
  const RULES_P = {
    'p-titulo': v => !v.trim() ? 'Ponle un nombre al parche.' : v.trim().length < 5 ? 'Mínimo 5 caracteres.' : '',
    'p-fecha': v => !v ? 'Elige la fecha.' : v < dayKey(NOW()) ? 'Esa fecha ya pasó.' : '',
    'p-hora': v => { if (!v) return 'Elige la hora.'; const f = $('#p-fecha').value; return f === dayKey(NOW()) && at(new Date(f + 'T12:00:00').getTime(), v) < NOW() ? 'Esa hora ya pasó.' : ''; },
    'p-cupos': v => { const n = Number(v); if (!Number.isInteger(n) || n < 2) return 'Mínimo 2 personas.'; if (n > 500) return 'Máximo 500.'; const p = editId && S.parches.find(x => x.id === editId); return p && n < confirmados(p) ? `Ya hay ${confirmados(p)} confirmados.` : ''; },
    'p-consumo': v => v === '' || Number(v) < 0 ? 'Usa 0 si no hay consumo mínimo.' : '',
    'p-promo': v => v.trim().length < 10 ? 'Cuenta qué pasa ese día (mínimo 10 caracteres).' : '',
  };
  function openParche(id = null) {
    editId = id;
    const p = id ? S.parches.find(x => x.id === id) : null;
    $('#dlg-parche-title').textContent = p ? 'Editar parche' : 'Nuevo parche oficial';
    $('#p-submit').textContent = p ? 'Guardar cambios' : 'Publicar parche';
    $$('#form-parche .field').forEach(f => { f.classList.remove('is-error', 'is-valid'); const m = $('.field-msg', f); if (m) m.textContent = ''; });
    const d = p ? new Date(p.inicio) : new Date(day0(NOW()) + DAY);
    $('#p-titulo').value = p ? p.titulo : '';
    $('#p-fecha').value = dayKey(d); $('#p-fecha').min = dayKey(NOW());
    $('#p-hora').value = p ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : (S.perfil.horarios[d.getDay()].open || '21:00');
    $('#p-cupos').value = p ? p.cupos : 80;
    $('#p-consumo').value = p ? p.consumo : 35000;
    $('#p-promo').value = p ? p.promo : '';
    dlgPos.lat = p ? p.lat : S.perfil.lat; dlgPos.lng = p ? p.lng : S.perfil.lng;
    $('#dlg-parche').showModal();
    setTimeout(() => {
      if (typeof L === 'undefined') return;
      if (!mapDlg) {
        mapDlg = L.map('map-parche').setView([dlgPos.lat, dlgPos.lng], 15);
        tiles().addTo(mapDlg);
        dlgMarker = L.marker([dlgPos.lat, dlgPos.lng], { icon: bizIcon(), draggable: true }).addTo(mapDlg);
        const set = ll => { dlgPos.lat = +ll.lat.toFixed(6); dlgPos.lng = +ll.lng.toFixed(6); dlgMarker.setLatLng(ll); coords(); };
        mapDlg.on('click', e => set(e.latlng));
        dlgMarker.on('dragend', () => set(dlgMarker.getLatLng()));
      }
      mapDlg.invalidateSize();
      dlgMarker.setLatLng([dlgPos.lat, dlgPos.lng]);
      mapDlg.setView([dlgPos.lat, dlgPos.lng], 15);
      coords();
    }, 60);
  }
  function coords() {
    const dist = (a, b) => { const R = 6371, r = x => x * Math.PI / 180; const dl = r(b[0] - a[0]), dg = r(b[1] - a[1]); const s = Math.sin(dl / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dg / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
    const km = dist([dlgPos.lat, dlgPos.lng], [S.perfil.lat, S.perfil.lng]);
    $('#pmap-coords').textContent = `${dlgPos.lat.toFixed(5)}, ${dlgPos.lng.toFixed(5)} · ${km < 0.05 ? 'en tu local' : `a ${km.toFixed(1).replace('.', ',')} km de tu local`}. Toca el mapa o arrastra el pin para moverlo.`;
  }
  function submitParche(e) {
    e.preventDefault();
    const bad = Object.keys(RULES_P).filter(id => !setField($('#' + id), RULES_P[id]($('#' + id).value)));
    if (bad.length) { $('#' + bad[0]).focus(); return; }
    const inicio = at(new Date($('#p-fecha').value + 'T12:00:00').getTime(), $('#p-hora').value);
    const datos = { titulo: $('#p-titulo').value.trim(), inicio, cupos: Number($('#p-cupos').value), consumo: Number($('#p-consumo').value), promo: $('#p-promo').value.trim(), lat: dlgPos.lat, lng: dlgPos.lng };
    if (editId) {
      const p = S.parches.find(x => x.id === editId);
      Object.assign(p, datos);
      p.chat.push({ tipo: 'sys', texto: 'El local actualizó los datos del parche', ts: NOW() });
      toast('Parche actualizado', 'Los confirmados ya ven los cambios.');
    } else {
      S.parches.push(mkParche({ id: 'n' + NOW().toString(36), tipo: 'oficial', organizador: 'Los Capachos', dur: 240, creado: true, asistentes: [], chat: [{ tipo: 'sys', texto: 'Publicaste el parche', ts: NOW() }], lugar: 'capachos', ...datos }));
      toast('Parche publicado', `${datos.titulo} ya está en el mapa de Modo Parche.`);
      listState.tab = 'proximos';
    }
    save();
    $('#dlg-parche').close();
    if (route !== 'parches') location.hash = '#parches'; else render();
  }

  /* ---------- Relámpago ---------- */
  let relDur = 60, relTimer = null;
  function openRelampago() {
    const wd = new Date(NOW()).getDay(), h = S.perfil.horarios[wd];
    const abre = at(NOW(), h.open);
    let cierra = at(NOW(), h.close); if (cierra <= abre) cierra += DAY;
    const dentro = h.abierto && NOW() >= abre && NOW() < cierra;
    $('#rel-note').textContent = relampagoActivo()
      ? 'Ya tienes un relámpago en vivo. Si lanzas otro, el actual termina ahora.'
      : dentro ? `Sale de inmediato en el mapa de Modo Parche con un anillo naranja. Hoy abres hasta las ${h.close}.`
        : `Ojo: hoy abres de ${h.open} a ${h.close}. Si lo lanzas ahora, la gente llegará con el local cerrado.`;
    $('#r-promo').value = ''; $('#r-cupos').value = 40;
    $$('#form-relampago .field').forEach(f => { f.classList.remove('is-error', 'is-valid'); const m = $('.field-msg', f); if (m) m.textContent = ''; });
    updRelSummary();
    $('#dlg-relampago').showModal();
  }
  function updRelSummary() {
    $$('#r-dur button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.min) === relDur)));
    $('#rel-summary').textContent = `Arranca ya y termina a las ${fmtHora(NOW() + relDur * MIN)}; mientras dure, quien llegue recibe la recompensa Relámpago 2x1`;
  }
  function submitRelampago(e) {
    e.preventDefault();
    const ok1 = setField($('#r-promo'), $('#r-promo').value.trim().length < 4 ? 'Escribe la promoción (mínimo 4 caracteres).' : '');
    const n = Number($('#r-cupos').value);
    const ok2 = setField($('#r-cupos'), !Number.isInteger(n) || n < 5 ? 'Mínimo 5 cupos.' : n > 300 ? 'Máximo 300.' : '');
    if (!ok1 || !ok2) return;
    const prev = relampagoActivo();
    if (prev) prev.dur = Math.max(1, Math.round((NOW() - prev.inicio) / MIN));
    const promo = $('#r-promo').value.trim();
    const p = mkParche({ id: 'r' + NOW().toString(36), tipo: 'relampago', titulo: `Hora feliz: ${promo}`, promo, organizador: 'Los Capachos', inicio: NOW(), dur: relDur, cupos: n, consumo: 15000, creado: true, asistentes: [], chat: [{ tipo: 'sys', texto: 'Lanzaste un parche relámpago', ts: NOW() }] });
    S.parches.push(p);
    save();
    $('#dlg-relampago').close();
    toast('Relámpago en vivo', `${p.promo} ya se ve en el mapa con un anillo naranja, hasta las ${fmtHora(fin(p))}`);
    simularLlegadas(p.id);
    render();
  }
  // Mientras dure el relámpago, la gente se va sumando (en la versión conectada llega en tiempo real)
  function simularLlegadas(id) {
    clearInterval(relTimer);
    relTimer = setInterval(() => {
      const p = S.parches.find(x => x.id === id);
      if (!p || !enVivo(p) || lleno(p)) { clearInterval(relTimer); render(); return; }
      const nuevos = nuevaGente(1 + Math.floor(Math.random() * 3), id + NOW()).map(x => ({ ...x, confirmo: NOW(), llego: null }));
      p.asistentes.push(...nuevos.slice(0, p.cupos - confirmados(p)));
      save();
      if (route === 'resumen') { renderNoche(); renderShell(); }
      if (route === 'mapa') renderMapa();
    }, 7000);
  }

  /* ---------- Recompensa nueva ---------- */
  function openCupon() {
    $('#k-regla').innerHTML = Object.entries(REGLAS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
    ['k-nombre', 'k-beneficio', 'k-prefijo'].forEach(id => { $('#' + id).value = ''; const f = $('#' + id).closest('.field'); f.classList.remove('is-error', 'is-valid'); $('.field-msg', f).textContent = ''; });
    $('#dlg-cupon').showModal();
  }
  function submitCupon(e) {
    e.preventDefault();
    const nombre = $('#k-nombre').value.trim(), ben = $('#k-beneficio').value.trim(), pre = $('#k-prefijo').value.trim().toUpperCase();
    const ok = [
      setField($('#k-nombre'), nombre.length < 3 ? 'Mínimo 3 caracteres.' : S.cupones.some(k => norm(k.nombre) === norm(nombre)) ? 'Ya tienes una recompensa con ese nombre.' : ''),
      setField($('#k-beneficio'), ben.length < 5 ? 'Di qué recibe el cliente.' : ''),
      setField($('#k-prefijo'), !/^[A-Z]{3,8}$/.test(pre) ? 'Entre 3 y 8 letras, sin espacios.' : S.cupones.some(k => k.prefijo === pre) ? 'Ese prefijo ya existe.' : ''),
    ].every(Boolean);
    if (!ok) return;
    S.cupones.push({ id: 'k' + NOW().toString(36), nombre, regla: $('#k-regla').value, beneficio: ben, prefijo: pre, activo: true });
    save();
    $('#dlg-cupon').close();
    toast('Recompensa creada', `${nombre}: ${REGLAS[$('#k-regla').value]}.`);
    renderCupones();
  }

  /* ---------- Cancelar ---------- */
  function askCancel(id) {
    const p = S.parches.find(x => x.id === id);
    $('#confirm-text').textContent = `"${p.titulo}" (${fmtCuando(p.inicio)}) sale del mapa y avisamos a ${confirmados(p)} ${confirmados(p) === 1 ? 'confirmado' : 'confirmados'} por el chat del grupo.`;
    const dlg = $('#dlg-confirm');
    dlg.returnValue = '';
    dlg.onclose = () => {
      if (dlg.returnValue !== 'ok') return;
      p.cancelado = true;
      p.chat.push({ tipo: 'sys', texto: 'El local canceló el parche', ts: NOW() });
      save();
      toast('Parche cancelado', `Avisamos a los ${confirmados(p)} confirmados.`);
      render();
    };
    dlg.showModal();
  }

  /* ---------- Eventos ---------- */
  function bind() {
    window.addEventListener('hashchange', go);
    $('#menu-toggle').addEventListener('click', () => toggleMenu(true));
    $('#menu-close').addEventListener('click', () => toggleMenu(false));

    document.addEventListener('click', e => {
      const a = e.target.closest('[data-action]');
      if (!e.target.closest('#row-menu') && !e.target.closest('[data-action="row-menu"]')) closeRowMenu();
      if (!a) return;
      const id = a.dataset.id;
      switch (a.dataset.action) {
        case 'relampago': openRelampago(); break;
        case 'nuevo-parche': openParche(); break;
        case 'nuevo-cupon': openCupon(); break;
        case 'editar': closeRowMenu(); openParche(id); break;
        case 'cancelar': closeRowMenu(); askCancel(id); break;
        case 'row-menu': e.stopPropagation(); if ($('#row-menu').hidden) openRowMenu(a, id); else closeRowMenu(); break;
        case 'ver-asistentes': closeRowMenu(); asisState.id = id; asisState.tab = 'lista'; asisState.shown = 30; if (route === 'asistentes') render(); else location.hash = '#asistentes'; break;
        case 'fly': flyTo(id); break;
        case 'checkin': marcarLlegada(a.dataset.uid, true); break;
        case 'deshacer': marcarLlegada(a.dataset.uid, false); break;
        case 'usar-codigo': $('#code-input').value = a.dataset.code; $('#code-input').focus(); break;
        case 'validar-rapido': if (route !== 'cupones') location.hash = '#cupones'; setTimeout(() => $('#code-input').focus(), 80); break;
        case 'terminar-rel': { const p = S.parches.find(x => x.id === id); if (p) { p.dur = Math.max(1, Math.round((NOW() - p.inicio) / MIN)); clearInterval(relTimer); save(); toast('Relámpago terminado', `${p.titulo} salió del mapa.`); render(); } break; }
      }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeRowMenu(); toggleMenu(false); } });

    // Resumen
    $$('[data-metric]').forEach(b => b.addEventListener('click', () => { chartState.metric = b.dataset.metric; $$('[data-metric]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); drawFlujo(); }));
    $$('[data-range]').forEach(b => b.addEventListener('click', () => { chartState.range = Number(b.dataset.range); $$('[data-range]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); drawFlujo(); }));

    // Búsqueda global: un código va al validador; lo demás, a la lista de parches
    $('#search').addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const q = e.target.value.trim();
      if (!q) return;
      if (/^[a-z]{3,8}-\d{4}$/i.test(q)) { location.hash = '#cupones'; setTimeout(() => { $('#code-input').value = q.toUpperCase(); validar(q); }, 60); return; }
      listState.q = q; listState.tab = 'proximos'; $('#parches-search').value = q;
      const hit = S.parches.filter(enLocal).find(p => norm(p.titulo + p.organizador).includes(norm(q)) && !activo(p));
      if (hit && !S.parches.filter(enLocal).some(p => activo(p) && norm(p.titulo + p.organizador).includes(norm(q)))) listState.tab = 'pasados';
      if (route !== 'parches') location.hash = '#parches'; else renderParches();
    });

    // Parches
    $$('#parches-tabs [data-tab]').forEach(b => b.addEventListener('click', () => { listState.tab = b.dataset.tab; renderParches(); }));
    $('#parches-search').addEventListener('input', e => { listState.q = e.target.value; renderParches(); });

    // Mapa
    $$('#time-filter [data-time]').forEach(b => b.addEventListener('click', () => { timeState.mode = b.dataset.time; timeState.date = null; renderMapa(); }));
    $('#time-select').addEventListener('change', e => {
      const v = e.target.value;
      if (v === '__fecha') { $('#time-date').hidden = false; $('#time-date').focus(); return; }
      if (v) { timeState.mode = 'fecha'; timeState.date = v; renderMapa(); }
    });
    $('#time-date').addEventListener('change', e => { if (e.target.value) { timeState.mode = 'fecha'; timeState.date = e.target.value; renderMapa(); } });
    $('#btn-locate').addEventListener('click', () => startGeo(true));

    // Cupones
    $('#validator').addEventListener('submit', e => { e.preventDefault(); validar($('#code-input').value); });
    $('#canjes-more').addEventListener('click', () => { canjesShown += 12; renderCupones(); });
    document.addEventListener('change', e => {
      const sw = e.target.closest('[data-cupon]');
      if (sw) { const k = cupon(sw.dataset.cupon); k.activo = sw.checked; save(); toast(k.activo ? 'Recompensa activa' : 'Recompensa pausada', k.nombre); }
      const day = e.target.closest('[data-day]');
      if (day) { const t = day.closest('.hour-row'); $('.hour-times', t).classList.toggle('is-off', !day.checked); day.nextElementSibling.textContent = day.checked ? 'Abierto' : 'Cerrado'; }
    });

    // Asistentes
    $('#parche-select').addEventListener('change', e => { asisState.id = e.target.value; asisState.shown = 30; renderAsistentes(); });
    $$('#asis-tabs [data-tab]').forEach(b => b.addEventListener('click', () => { asisState.tab = b.dataset.tab; renderAsistentes(); }));
    $$('[data-asis]').forEach(b => b.addEventListener('click', () => { asisState.filtro = b.dataset.asis; asisState.shown = 30; renderAsistentes(); }));
    $('#asis-search').addEventListener('input', e => { asisState.q = e.target.value; renderAsistentes(); });
    $('#people-more').addEventListener('click', () => { asisState.shown += 30; renderAsistentes(); });
    $('#chat-form').addEventListener('submit', e => {
      e.preventDefault();
      const inp = $('#chat-input'), txt = inp.value.trim();
      const p = S.parches.find(x => x.id === asisState.id);
      if (!txt || !p) return;
      p.chat.push({ autor: 'biz', texto: txt.slice(0, 400), ts: NOW() });
      inp.value = ''; save(); renderChat(p);
      if (p.asistentes.length) setTimeout(() => {
        const who = p.asistentes[Math.floor(Math.random() * p.asistentes.length)];
        p.chat.push({ autor: who, texto: RESPUESTAS[Math.floor(Math.random() * RESPUESTAS.length)], ts: NOW() });
        save(); if (route === 'asistentes' && asisState.id === p.id && asisState.tab === 'chat') renderChat(p);
      }, 2200);
    });

    // Perfil: datos
    $('#form-datos').addEventListener('submit', e => {
      e.preventDefault();
      const ok = [
        setField($('#b-nombre'), $('#b-nombre').value.trim().length < 3 ? 'Mínimo 3 caracteres.' : ''),
        setField($('#b-tel'), !/^\d{7,10}$/.test($('#b-tel').value.replace(/\s/g, '')) ? 'Entre 7 y 10 dígitos.' : ''),
        setField($('#b-desc'), $('#b-desc').value.trim().length < 20 ? 'Cuenta un poco más (mínimo 20 caracteres).' : ''),
      ].every(Boolean);
      if (!ok) return;
      Object.assign(S.perfil, { nombre: $('#b-nombre').value.trim(), categoria: $('#b-categoria').value, tel: $('#b-tel').value.trim(), desc: $('#b-desc').value.trim() });
      save(); stamp('datos-stamp'); renderShell(); renderPreview();
      toast('Datos guardados', 'Ya salen en tus parches oficiales.');
    });
    $('#form-horarios').addEventListener('submit', e => {
      e.preventDefault();
      for (let d = 0; d < 7; d++) {
        S.perfil.horarios[d] = { abierto: $(`[data-day="${d}"]`).checked, open: $(`[data-open="${d}"]`).value || '19:00', close: $(`[data-close="${d}"]`).value || '00:00' };
      }
      save(); stamp('horarios-stamp'); toast('Horarios guardados', 'Los relámpagos usan este horario.');
    });

    // Perfil: fotos con encuadre
    const upd = () => { $('#img-cover').style.cssText = coverStyle(S.perfil.cover); $('#out-cz').textContent = S.perfil.cover.zoom.toFixed(2).replace('.', ',') + 'x'; $('#out-cy').textContent = S.perfil.cover.y; $('#frame-logo').innerHTML = logoHTML(); $('#out-lz').textContent = S.perfil.logo.zoom.toFixed(2).replace('.', ',') + 'x'; renderPreview(); };
    $('#cz').addEventListener('input', e => { S.perfil.cover.zoom = Number(e.target.value); upd(); });
    $('#cy').addEventListener('input', e => { S.perfil.cover.y = Number(e.target.value); upd(); });
    $('#lz').addEventListener('input', e => { S.perfil.logo.zoom = Number(e.target.value); upd(); });
    $('#file-cover').addEventListener('change', async e => { const f = e.target.files[0]; if (!f) return; try { S.perfil.cover = { src: await readImage(f), zoom: 1, y: 0 }; renderPerfil(); } catch (err) { toast('No pudimos leer la imagen', 'Prueba con un JPG o PNG.', true); } e.target.value = ''; });
    $('#file-logo').addEventListener('change', async e => { const f = e.target.files[0]; if (!f) return; try { S.perfil.logo = { src: await readImage(f, 400), zoom: 1 }; renderPerfil(); renderShell(); } catch (err) { toast('No pudimos leer la imagen', 'Prueba con un JPG o PNG.', true); } e.target.value = ''; });
    $('#logo-reset').addEventListener('click', () => { S.perfil.logo = { src: '', zoom: 1 }; renderPerfil(); renderShell(); });
    $('#save-fotos').addEventListener('click', () => { save(); stamp('fotos-stamp'); renderShell(); toast('Fotos guardadas', 'Así te ven en el mapa.'); });

    // Perfil: ubicación fija
    $('#ubic-edit').addEventListener('click', () => {
      moviendo = !moviendo;
      if (!perfilMarker) return;
      if (moviendo) perfilMarker.dragging.enable(); else { perfilMarker.dragging.disable(); perfilMarker.setLatLng([S.perfil.lat, S.perfil.lng]); $('#ubic-save').disabled = true; renderPerfil(); }
      $('#ubic-edit').textContent = moviendo ? 'Descartar' : 'Mover el pin';
      if (moviendo) toast('Arrastra el pin', 'Ponlo en la entrada del local y guarda.');
    });
    $('#ubic-save').addEventListener('click', () => {
      const ll = perfilMarker.getLatLng();
      S.perfil.lat = +ll.lat.toFixed(6); S.perfil.lng = +ll.lng.toFixed(6);
      S.parches.filter(p => p.lugar === 'capachos' && p.tipo !== 'otro' && activo(p) && !p.creado).forEach(p => { p.lat = S.perfil.lat; p.lng = S.perfil.lng; });
      moviendo = false; perfilMarker.dragging.disable();
      $('#ubic-edit').textContent = 'Mover el pin'; $('#ubic-save').disabled = true;
      save(); renderPerfil(); toast('Ubicación guardada', 'Tus parches oficiales usan el nuevo punto.');
    });

    // Diálogos
    $('#form-parche').addEventListener('submit', e => { if (e.submitter && e.submitter.value === 'cancel') return; submitParche(e); });
    $('#form-parche').addEventListener('focusout', e => { const id = e.target.id; if (RULES_P[id]) setField(e.target, RULES_P[id](e.target.value)); });
    $('#form-relampago').addEventListener('submit', e => { if (e.submitter && e.submitter.value === 'cancel') return; submitRelampago(e); });
    $$('#r-dur button').forEach(b => b.addEventListener('click', () => { relDur = Number(b.dataset.min); updRelSummary(); }));
    $('#form-cupon').addEventListener('submit', e => { if (e.submitter && e.submitter.value === 'cancel') return; submitCupon(e); });

    // El reloj corre: estados "en vivo" y la cuenta regresiva del relámpago
    setInterval(() => { if (route === 'resumen') { renderNoche(); renderShell(); } }, 30000);
    window.addEventListener('resize', () => { map && map.invalidateSize(); });
  }

  function init() {
    load();
    verificar();
    buildTimeSelect();
    bind();
    go();
    startGeo(false); // pide permiso de ubicación al iniciar
    const rel = relampagoActivo();
    if (rel) simularLlegadas(rel.id);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
