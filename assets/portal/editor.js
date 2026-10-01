/* The Tenthpin site editor. 22 Sep 2026.

   One page, no build step, no library. It edits a DRAFT of the site content
   (the same object the site loads from assets/content/content.js), shows the
   draft live inside the real pages, and publishes it:
     - on this computer, through the review server (react-app/scripts/
       serve-dist.py), which writes the file where the site reads it and keeps
       every previous version;
     - anywhere else, as a download to upload to the host.

   The draft lives in localStorage ('tpcms_draft'), so closing the tab loses
   nothing. The site side of the contract is react-app/src/cms/live.js: this
   file never touches the page's markup, it only writes edits and hands them to
   window.__tpCms inside the page, which applies them. */
(function () {
'use strict'

/* ── small helpers ─────────────────────────────────────────────────────── */
const $ = (s, r) => (r || document).querySelector(s)
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s))
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const clone = (o) => JSON.parse(JSON.stringify(o))
const uid = (p) => p + '-' + Math.random().toString(36).slice(2, 9)
const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim()
const today = () => new Date().toISOString().slice(0, 10)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmtDate = (iso) => { if (!iso) return ''; const p = String(iso).split('-'); return p.length < 3 ? iso : (+p[2]) + ' ' + MONTHS[(+p[1]) - 1] + ' ' + p[0] }
const fmtWhen = (t) => { const d = new Date(t); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + ', ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') }
const short = (s, n) => { s = norm(s); return s.length > n ? s.slice(0, n - 1) + '…' : s }
const debounce = (fn, ms) => { let t; return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms) } }
const pathOf = (src) => { try { return new URL(src, location.href).pathname } catch (e) { return String(src || '') } }

const I = (d, extra) => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/>${extra || ''}</svg>`
const ICON = {
  pages: I('M3 3.5h14v13H3zM3 7h14M7 7v9.5'),
  cases: I('M3 6.5h14v10H3zM7.5 6.5V4h5v2.5M3 11h14'),
  news: I('M3.5 3.5h10v13h-10zM13.5 7h3v8a1.5 1.5 0 0 1-3 0M6 7h5M6 10h5M6 13h3'),
  events: I('M3 5h14v11.5H3zM3 8.5h14M7 3v4M13 3v4', '<rect x="6" y="11" width="3" height="3"/>'),
  pictures: I('M3 4h14v12H3zM3 13l4-4 3 3 2-2 5 5', '<circle cx="13" cy="7.5" r="1.5"/>'),
  settings: I('M4 6h12M4 14h12', '<circle cx="8" cy="6" r="2" fill="#fff"/><circle cx="12" cy="14" r="2" fill="#fff"/>'),
  publish: I('M10 13V3.5M6 7.5l4-4 4 4M3.5 12.5v4h13v-4'),
  help: I('M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM7.8 7.7a2.3 2.3 0 0 1 4.4 1c0 1.6-2.2 1.9-2.2 3.3M10 14.4h.01'),
  undo: I('M7.5 5 4 8.5 7.5 12M4.5 8.5H12a4 4 0 0 1 0 8h-2'),
  redo: I('M12.5 5 16 8.5 12.5 12M15.5 8.5H8a4 4 0 0 0 0 8h2'),
  text: I('M4 5V3.5h12V5M10 3.5v13M7.5 16.5h5'),
  image: I('M3 4h14v12H3zM3 13l4-4 3 3 2-2 5 5', '<circle cx="13" cy="7.5" r="1.5"/>'),
  link: I('M8.5 11.5a3.5 3.5 0 0 0 5 0l2.3-2.3a3.5 3.5 0 0 0-5-5L9.6 5.4M11.5 8.5a3.5 3.5 0 0 0-5 0l-2.3 2.3a3.5 3.5 0 0 0 5 5l1.1-1.1'),
  hide: I('M3 3l14 14M8.3 8.4a2.5 2.5 0 0 0 3.3 3.3M5.6 5.7C3.9 6.9 2.8 8.5 2.5 10c.8 3.6 4.5 6 7.5 6 1.5 0 3-.5 4.3-1.4M9 4.1c.3 0 .7-.1 1-.1 3 0 6.7 2.4 7.5 6-.2 1-.7 2-1.4 2.9'),
  box: I('M3.5 3.5h13v13h-13z'),
  desktop: I('M2.5 3.5h15v10h-15zM7 16.5h6M10 13.5v3'),
  tablet: I('M5 2.5h10v15H5zM9 15h2'),
  phone: I('M6.5 2.5h7v15h-7zM9.2 15h1.6'),
  open: I('M11 3.5h5.5V9M16.5 3.5 9 11M14 12v4.5H3.5V6H8'),
  plus: I('M10 4v12M4 10h12'),
  up: I('M10 15.5v-11M5.5 9 10 4.5 14.5 9'),
  down: I('M10 4.5v11M5.5 11 10 15.5 14.5 11'),
  trash: I('M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l.8 11h7.4l.8-11'),
  check: I('M4 10.5l3.8 3.8L16 6'),
  info: I('M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM10 9v4.5M10 6.5h.01'),
  warn: I('M10 3 18 16.5H2zM10 8v4M10 14.2h.01'),
  upload: I('M10 13V4M6.5 7.5 10 4l3.5 3.5M3.5 13v3.5h13V13'),
  download: I('M10 4v9M6.5 9.5 10 13l3.5-3.5M3.5 13v3.5h13V13'),
  clock: I('M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM10 6v4.5l3 2'),
  list: I('M7 5h10M7 10h10M7 15h10M3 5h.01M3 10h.01M3 15h.01'),
  cursor: I('M4.5 3.5 15 9l-4.6 1.4L8.8 15z'),
  hand: I('M7 9.5V4.2a1.2 1.2 0 0 1 2.4 0V9M9.4 8.6V3.4a1.2 1.2 0 0 1 2.4 0V9M11.8 8.8V4.6a1.2 1.2 0 0 1 2.4 0v6.6a5.5 5.5 0 0 1-5.5 5.5 5.3 5.3 0 0 1-4.3-2.2L2.9 11.4a1.2 1.2 0 0 1 1.9-1.5L7 12.2'),
  zh: I('M3 5h8M7 3.5V5M5 5c.4 2.6 2 4.7 4.5 6M9.5 5c-.6 2.9-2.6 5.4-6 6.8M11 16.5l3-7.5 3 7.5M12.2 14h3.6'),
  back: I('M16 10H4M8.5 5.5 4 10l4.5 4.5'),
  people: I('M7.5 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2.5 16.5c.5-3 2.5-4.6 5-4.6s4.5 1.6 5 4.6M13.5 3.3a3 3 0 0 1 0 5.4M15 11.8c1.5.6 2.4 2.2 2.6 4.7'),
  logos: I('M3 3.5h6v6H3zM11 3.5h6v6h-6zM3 11.5h6v5H3zM11 11.5h6v5h-6z'),
  faq: I('M3.5 4h13v9.5H9l-3.5 3v-3h-2zM8 7.3a2 2 0 0 1 3.9.6c0 1.3-1.9 1.5-1.9 2.6M10 12h.01'),
}

/* ── the pages of the site, in the order the menus read them ─────────── */
const PAGES = [
  ['/', 'Home'], ['/aboutus2/', 'About us'], ['/servicesv2/', 'Services'], ['/rise-move2/', 'Rise and Move'],
  ['/sapgrow2/', 'GROW with SAP'], ['/s4hana2/', 'S/4HANA transition'], ['/ams2/', 'AMS and run support'], ['/ai-sap2/', 'AI in SAP'],
  ['/industries/', 'Industries'], ['/lifesciences2/', 'Life sciences'], ['/industries/manufacturing/', 'Manufacturing'],
  ['/industries/automotive/', 'Automotive'], ['/industries/engineering-construction/', 'Engineering and construction'], ['/partnership2/', 'Partners'],
  ['/events/', 'Past events'], ['/contact/', 'Contact'], ['/news/', 'News and insights'],
]
const ALIAS = { '/home2/': '/', '/industries/life-sciences/': '/lifesciences2/' }
const pageName = (r) => (PAGES.find((p) => p[0] === r) || [0, r === '*' ? 'Every page' : r])[1]
const DEVICES = { desktop: 1440, tablet: 834, phone: 390 }

/* ── state: the published content and the draft ─────────────────────── */
const EMPTY = () => ({ banner: { on: false }, events: [], news: [], edits: [], zh: {}, lists: {}, settings: {} })
function fill(c) {
  c = c && typeof c === 'object' ? c : {}
  const e = EMPTY()
  Object.keys(e).forEach((k) => { if (c[k] == null || typeof c[k] !== typeof e[k] || Array.isArray(c[k]) !== Array.isArray(e[k])) c[k] = e[k] })
  c.edits = c.edits.filter((x) => x && x.k)
  c.edits.forEach((x) => { if (!x.id) x.id = uid('e') })
  return c
}
let PUB = fill(clone(window.TP_CONTENT || {}))
function loadDraft() { try { const d = JSON.parse(localStorage.getItem('tpcms_draft') || 'null'); return d && typeof d === 'object' ? fill(d) : null } catch (e) { return null } }
let D = loadDraft() || clone(PUB)
const UNDO = [], REDO = []
let lastKey = '', lastAt = 0
const SERVER = { checked: false, writable: false }
const S = { view: 'pages', route: '/', device: 'desktop', mode: 'edit', scope: 'sec' }

function persist() { try { localStorage.setItem('tpcms_draft', JSON.stringify(D)) } catch (e) { toast('This browser would not keep the draft. Publish or download before closing.') } }
/* every change goes through here: one undo step per burst of typing */
function change(fn, key) {
  const now = Date.now()
  if (!(key && key === lastKey && now - lastAt < 2500)) { UNDO.push(JSON.stringify(D)); if (UNDO.length > 120) UNDO.shift(); REDO.length = 0 }
  lastKey = key || ''; lastAt = now
  fn(D)
  D.updatedAt = new Date().toISOString()
  persist(); toFrame(); status()
}
function restoreFrom(json) { D = fill(JSON.parse(json)); persist(); toFrame(); status(); rerender() }
function undo() { if (!UNDO.length) return toast('Nothing to undo.'); REDO.push(JSON.stringify(D)); lastKey = ''; restoreFrom(UNDO.pop()); toast('Undone.') }
function redo() { if (!REDO.length) return; UNDO.push(JSON.stringify(D)); lastKey = ''; restoreFrom(REDO.pop()) }

/* what differs between the draft and the live site */
const cmp = (o) => JSON.stringify(o == null ? null : o)
function pending() {
  const out = []
  const pe = new Map(PUB.edits.map((e) => [e.id, cmp(e)])), de = new Map(D.edits.map((e) => [e.id, cmp(e)]))
  de.forEach((s, id) => { if (pe.get(id) !== s) out.push({ k: 'edit', e: JSON.parse(s) }) })
  pe.forEach((s, id) => { if (!de.has(id)) out.push({ k: 'undone', e: JSON.parse(s) }) })
  const NAMES = { news: 'News and insights', events: 'Events', settings: 'Settings', zh: '中文 wording', banner: 'Event banner' }
  Object.keys(NAMES).forEach((k) => { if (cmp(D[k]) !== cmp(PUB[k])) out.push({ k: 'part', name: NAMES[k] }) })
  new Set(Object.keys(D.lists).concat(Object.keys(PUB.lists))).forEach((k) => { if (cmp(D.lists[k]) !== cmp(PUB.lists[k])) out.push({ k: 'part', name: LIST_NAMES[k] || k }) })
  return out
}

/* ── toast and modal ─────────────────────────────────────────────────── */
let toastT = null
function toast(msg, action) {
  const t = $('#toast')
  t.innerHTML = '<span>' + esc(msg) + '</span>' + (action ? '<button type="button">' + esc(action.label) + '</button>' : '')
  if (action) t.querySelector('button').onclick = () => { t.classList.remove('on'); action.run() }
  t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), action ? 6000 : 2800)
}
function modal(html, onMount) {
  const m = $('#modal')
  m.innerHTML = '<div class="modal" role="dialog" aria-modal="true"><div class="modal-in">' + html + '</div></div>'
  const close = () => { m.innerHTML = ''; document.removeEventListener('keydown', onKey, true) }
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }
  document.addEventListener('keydown', onKey, true)
  $('.modal', m).addEventListener('mousedown', (e) => { if (e.target.classList.contains('modal')) close() })
  $$('[data-close]', m).forEach((b) => { b.onclick = close })
  if (onMount) onMount(m, close)
  return close
}

/* ── the server (this computer) or a static host ─────────────────────── */
async function checkServer() {
  try {
    const r = await fetch('/__cms/ping', { cache: 'no-store' })
    const j = await r.json()
    SERVER.writable = !!(j && j.ok && j.writable)
  } catch (e) { SERVER.writable = false }
  SERVER.checked = true
  status()
}

/* ── the frame: the real page, with the draft applied ────────────────── */
const F = { w: null, d: null, sel: null, hv: null, sb: null, raf: 0, pending: 0 }
function cms() { return F.w && F.w.__tpCms }
function toFrame() { try { if (cms()) cms().set(clone(D)) } catch (e) { /* page reloading */ } }

/* ── top bar ──────────────────────────────────────────────────────────── */
function status() {
  const n = pending().length
  const el = $('#status'); if (!el) return
  el.innerHTML = n
    ? '<span class="pill warn"><span class="dot"></span>' + n + ' change' + (n === 1 ? '' : 's') + ' not live yet</span><span>Saved as a draft on this computer</span>'
    : '<span class="pill ok"><span class="dot"></span>Everything is live</span>'
  const nb = $('#nav a[data-view="publish"] .n')
  if (nb) { nb.textContent = n; nb.hidden = !n }
  $('#undoBtn').disabled = !UNDO.length; $('#redoBtn').disabled = !REDO.length
  if (S.view === 'pages') peCount()
}

/* ── the navigation ───────────────────────────────────────────────────── */
const VIEWS = [
  /* 29 Sep 2026 (Arifee): Case studies left the site; its screen is kept in
     SCREENS for the day it returns, and Past events takes its place */
  ['pages', 'Pages', ICON.pages], ['pastEvents', 'Past events', ICON.events], ['people', 'People', ICON.people], ['logos', 'Client logos', ICON.logos], ['faq', 'Questions', ICON.faq],
  ['news', 'News and insights', ICON.news], ['events', 'Coming-up events', ICON.events],
  ['zh', '中文 wording', ICON.zh], ['pictures', 'Pictures', ICON.pictures], ['settings', 'Settings', ICON.settings],
  ['publish', 'Publish', ICON.publish], ['help', 'Help', ICON.help],
]
function drawNav() {
  $('#nav').innerHTML = '<nav aria-label="Editor">' + VIEWS.map(([k, t, ic], i) =>
    (i === 1 ? '<div class="grp">Lists</div>' : k === 'zh' ? '<div class="grp">Site</div>' : '') +
    '<a href="#' + k + '" data-view="' + k + '"' + (S.view === k ? ' aria-current="page"' : '') + '>' + ic + '<span>' + t + '</span>' + (k === 'publish' ? '<span class="n" hidden></span>' : '') + '</a>').join('') +
    '</nav><div class="foot">Changes save as a draft as you go. They reach the website when you press Publish.</div>'
  $$('#nav a').forEach((a) => { a.onclick = (e) => { e.preventDefault(); go(a.dataset.view) } })
}
function go(v) {
  S.view = v
  history.replaceState(null, '', '#' + v + (v === 'pages' ? '?page=' + encodeURIComponent(S.route) : ''))
  $$('#nav a').forEach((a) => { if (a.dataset.view === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current') })
  rerender(); status()
}
function rerender() {
  const m = $('#main')
  if (S.view === 'pages') { if (!$('.pe', m)) pagesView(); else { inspector(); peCount() } return }
  F.w = null; F.d = null; F.sel = null
  const V = { cases: () => listScreen('cases'), pastEvents: () => listScreen('pastEvents'), people: () => listScreen('people'), logos: () => listScreen('logos'), faq: () => listScreen('faq'), news: newsView, events: eventsView, zh: zhView, pictures: picturesView, settings: settingsView, publish: publishView, help: helpView }
  ;(V[S.view] || helpView)()
}

/* ═══ PAGES: the page editor ═════════════════════════════════════════════ */
function pagesView() {
  const m = $('#main')
  m.innerHTML = `<div class="pe">
    <div class="pe-bar">
      <div class="pg"><label class="vh" for="pgSel">Page</label><select class="in" id="pgSel">${PAGES.map(([r, t]) => '<option value="' + r + '"' + (r === S.route ? ' selected' : '') + '>' + esc(t) + '</option>').join('')}</select></div>
      <div class="seg" id="modeSeg" role="group" aria-label="What a click does">
        <button type="button" data-v="edit" aria-pressed="${S.mode === 'edit'}" title="Click anything on the page to change it">${ICON.cursor}Edit</button>
        <button type="button" data-v="browse" aria-pressed="${S.mode === 'browse'}" title="Click links and buttons as a visitor would">${ICON.hand}Click through</button>
      </div>
      <div class="seg" id="devSeg" role="group" aria-label="Screen size">
        ${Object.keys(DEVICES).map((k) => '<button type="button" data-v="' + k + '" aria-pressed="' + (S.device === k) + '" title="' + k[0].toUpperCase() + k.slice(1) + '">' + ICON[k] + '<span class="vh">' + k + '</span></button>').join('')}
      </div>
      <div class="seg" id="langSeg" role="group" aria-label="Language">
        <button type="button" data-v="en" aria-pressed="true">EN</button><button type="button" data-v="zh" aria-pressed="false">中文</button>
      </div>
      <span class="sp"></span>
      <button class="b sm" id="chgBtn" type="button">${ICON.list}<span>Changes on this page</span><b id="chgN"></b></button>
      <a class="b sm ghost" id="openBtn" target="_blank" rel="noopener" title="Open this page with the draft in a new tab">${ICON.open}</a>
    </div>
    <div class="pe-stage" id="stage">
      <div class="frame" id="frame"><iframe id="ifr" title="The page you are editing"></iframe></div>
      <div class="loading" id="loading">Loading the page</div>
      <div class="mode-tip" id="tip">Click anything on the page to change it</div>
    </div>
    <aside class="insp" id="insp" aria-label="Change the selected part"></aside>
  </div>`
  $('#pgSel').onchange = (e) => loadPage(e.target.value)
  $$('#modeSeg button').forEach((b) => { b.onclick = () => setMode(b.dataset.v) })
  $$('#devSeg button').forEach((b) => { b.onclick = () => { S.device = b.dataset.v; $$('#devSeg button').forEach((x) => x.setAttribute('aria-pressed', x === b)); fit() } })
  $$('#langSeg button').forEach((b) => { b.onclick = () => setLang(b.dataset.v) })
  $('#chgBtn').onclick = toggleDrawer
  $('#ifr').addEventListener('load', onFrameLoad)
  window.addEventListener('resize', fit)
  fit(); loadPage(S.route); inspector()
}
function fit() {
  const st = $('#stage'), fr = $('#frame'); if (!st || !fr) return
  const W = DEVICES[S.device], sw = st.clientWidth - 28, sh = st.clientHeight - 28
  const k = Math.min(1, sw / W)
  fr.style.width = W + 'px'; fr.style.height = Math.round(sh / k) + 'px'
  fr.style.transform = 'translateX(-50%) scale(' + k + ')'
}
function loadPage(route) {
  S.route = ALIAS[route] || route
  F.sel = null; inspector()
  const ifr = $('#ifr'); if (!ifr) return
  $('#loading').hidden = false
  ifr.src = S.route + '?draft=1&edit=1'
  $('#openBtn').href = S.route + '?draft=1'
  if ($('#pgSel').value !== S.route) $('#pgSel').value = S.route
  history.replaceState(null, '', '#pages?page=' + encodeURIComponent(S.route))
}
function setMode(v) {
  S.mode = v
  $$('#modeSeg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === v))
  $('#tip').textContent = v === 'edit' ? 'Click anything on the page to change it' : 'Clicking works as it does for visitors. Switch back to Edit to change things.'
  if (F.d) F.d.documentElement.classList.toggle('tpe-editing', v === 'edit')
  if (cms()) cms().edit(v === 'edit')
  if (v !== 'edit') { hideBox(F.hv); F.sel = null; hideBox(F.sb); inspector() }
}
function setLang(v) {
  if (!F.d) return
  const b = F.d.querySelector('.lang button[data-lang="' + v + '"]')
  if (b) b.click()
  syncLang()
  if (F.sel) setTimeout(inspector, 60)
}
function syncLang() {
  const zh = F.d && F.d.documentElement.lang === 'zh'
  $$('#langSeg button').forEach((b) => b.setAttribute('aria-pressed', (b.dataset.v === 'zh') === !!zh))
}

const FRAME_CSS = `.bmws{display:none!important}body{padding-top:0!important}#nav,.nav{top:0!important}
.tpe-box{position:fixed;left:0;top:0;pointer-events:none;z-index:2147483600;display:none;box-sizing:border-box;border:2px solid rgba(46,107,255,.8);background:rgba(46,107,255,.05)}
.tpe-box.sel{border-color:#2E6BFF;background:rgba(46,107,255,.03);box-shadow:0 0 0 9999px rgba(13,21,38,.08)}
.tpe-box i{position:absolute;left:-2px;bottom:100%;height:22px;padding:0 8px;background:#2E6BFF;color:#fff;font:600 12px/22px Inter,system-ui,sans-serif;font-style:normal;white-space:nowrap}
.tpe-box.sel i{background:#142644}
.tpe-box.low i{bottom:auto;top:100%}
html.tpe-editing,html.tpe-editing *{cursor:pointer!important}`

function onFrameLoad() {
  const ifr = $('#ifr'); if (!ifr) return
  let w, d
  try { w = ifr.contentWindow; d = ifr.contentDocument } catch (e) { return }
  $('#loading').hidden = true
  if (!w || !d || !w.__tpCms) { F.w = null; F.d = null; return }
  F.w = w; F.d = d; F.sel = null
  const st = d.createElement('style'); st.textContent = FRAME_CSS; d.head.appendChild(st)
  F.hv = d.createElement('div'); F.hv.className = 'tpe-box'; F.hv.setAttribute('data-cms-skip', ''); F.hv.innerHTML = '<i></i>'
  F.sb = d.createElement('div'); F.sb.className = 'tpe-box sel'; F.sb.setAttribute('data-cms-skip', ''); F.sb.innerHTML = '<i></i>'
  d.body.appendChild(F.hv); d.body.appendChild(F.sb)
  d.documentElement.classList.toggle('tpe-editing', S.mode === 'edit')
  toFrame(); cms().edit(S.mode === 'edit')
  d.addEventListener('mousemove', onMove, true)
  d.addEventListener('mouseleave', () => hideBox(F.hv), true)
  ;['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick', 'auxclick', 'submit', 'contextmenu'].forEach((t) => d.addEventListener(t, onBlock, true))
  d.addEventListener('keydown', (e) => { if (e.key === 'Escape') { F.sel = null; hideBox(F.sb); inspector() } if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo() } }, true)
  w.addEventListener('scroll', track, { passive: true })
  w.addEventListener('resize', track)
  w.addEventListener('tp:pagemount', onFrameNav)
  syncLang()
  onFrameNav()
}
function onFrameNav() {
  if (!cms()) return
  const r = cms().route()
  if (r !== S.route) { S.route = r; if ($('#pgSel')) $('#pgSel').value = r; $('#openBtn').href = r + '?draft=1'; history.replaceState(null, '', '#pages?page=' + encodeURIComponent(r)) }
  F.sel = null; hideBox(F.sb); inspector(); peCount()
  if ($('#drawer')) drawDrawer()
}
function hideBox(b) { if (b) b.style.display = 'none' }
function place(b, el, label) {
  if (!b || !el || !el.isConnected) return hideBox(b)
  const r = el.getBoundingClientRect()
  if (!r.width && !r.height) return hideBox(b)
  b.style.display = 'block'
  b.style.transform = 'translate(' + Math.round(r.left - 3) + 'px,' + Math.round(r.top - 3) + 'px)'
  b.style.width = Math.round(r.width + 6) + 'px'; b.style.height = Math.round(r.height + 6) + 'px'
  b.classList.toggle('low', r.top < 28)
  b.firstChild.textContent = label
}
function track() {
  cancelAnimationFrame(F.raf)
  F.raf = F.w.requestAnimationFrame(() => { if (F.sel) place(F.sb, F.sel.el, labelOf(F.sel)); hideBox(F.hv) })
}
function onMove(e) {
  if (S.mode !== 'edit') return
  const x = e.clientX, y = e.clientY, t = e.target
  cancelAnimationFrame(F.pending)
  F.pending = F.w.requestAnimationFrame(() => {
    const hit = resolve(x, y, t)
    if (!hit || (F.sel && hit.el === F.sel.el)) return hideBox(F.hv)
    place(F.hv, hit.el, labelOf(hit))
  })
}
function onBlock(e) {
  if (S.mode !== 'edit') return
  if (e.target && e.target.closest && e.target.closest('.tpe-box')) return
  e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation()
  if (e.type === 'click') { const hit = resolve(e.clientX, e.clientY, e.target); if (hit) select(hit) }
}

/* what a click means: the words under the pointer, else a picture, else the
   box that was clicked */
const STOP = /^(A|BUTTON|LABEL|LI|P|H[1-6]|FIGCAPTION|TD|TH|DT|DD|BLOCKQUOTE|SUMMARY|OPTION|LEGEND|CAPTION|SELECT)$/
function textAt(x, y) {
  const d = F.d; let r = null
  if (d.caretRangeFromPoint) r = d.caretRangeFromPoint(x, y)
  else if (d.caretPositionFromPoint) { const p = d.caretPositionFromPoint(x, y); if (p) { r = d.createRange(); r.setStart(p.offsetNode, p.offset) } }
  const n = r && r.startContainer
  if (!n || n.nodeType !== 3 || !n.nodeValue.trim()) return null
  if (n.parentElement && n.parentElement.closest('.bmws, .tpe-box, script, style')) return null
  const rr = d.createRange(); rr.selectNodeContents(n)
  for (const b of rr.getClientRects()) if (x >= b.left - 2 && x <= b.right + 2 && y >= b.top - 2 && y <= b.bottom + 2) return n
  return null
}
function blockOf(el) {
  let e = el
  while (e && e !== F.d.body) {
    if (e.namespaceURI === 'http://www.w3.org/2000/svg' && e.tagName === 'text') return e
    if (STOP.test(e.tagName)) return e
    const disp = F.w.getComputedStyle(e).display
    if (disp !== 'inline' && disp !== 'contents') return e
    e = e.parentElement
  }
  return el
}
function resolve(x, y, t) {
  if (!F.d || !t || t.nodeType !== 1 || t.closest('.bmws, .tpe-box')) return null
  const n = textAt(x, y)
  if (n) return { type: 'text', el: blockOf(n.parentElement) }
  const img = F.d.elementsFromPoint(x, y).find((el) => el.tagName === 'IMG' && !el.closest('.bmws'))
  if (img) return { type: 'img', el: img }
  if (t === F.d.body || t === F.d.documentElement || t.id === 'root') return null
  return { type: 'box', el: t }
}
const TAGNAME = { H1: 'Page title', H2: 'Heading', H3: 'Heading', H4: 'Heading', H5: 'Heading', H6: 'Heading', P: 'Paragraph', A: 'Link', BUTTON: 'Button', LI: 'List item', IMG: 'Picture', FIGURE: 'Picture frame', ARTICLE: 'Card', SECTION: 'Section', FOOTER: 'Footer', HEADER: 'Header', NAV: 'Menu', UL: 'List', OL: 'List', FORM: 'Form', LABEL: 'Label', SPAN: 'Words', B: 'Words', EM: 'Words', STRONG: 'Words', SMALL: 'Small print', FIGCAPTION: 'Caption', text: 'Label' }
function nameOf(el) {
  if (!el) return ''
  if (el.tagName === 'SECTION') return 'Section'
  if (el.tagName === 'A' && /\b(cta|b|btn|button)\b|-cta\b/.test(el.className)) return 'Button'
  return TAGNAME[el.tagName] || 'Block'
}
function labelOf(hit) { return hit.type === 'img' ? 'Picture' : nameOf(hit.el) }
function select(hit) {
  F.sel = hit
  S.scope = 'sec'
  hideBox(F.hv); place(F.sb, hit.el, labelOf(hit))
  inspector()
  /* words: straight into the first box, ready to type */
  const t = $('#insp textarea[data-run]'); if (t && hit.type === 'text') { t.focus({ preventScroll: true }); t.setSelectionRange(t.value.length, t.value.length) }
}

/* ── the inspector: change the selected part ─────────────────────────── */
function runsOf(el) {
  const out = [], w = F.d.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (!n.nodeValue.trim() || (n.parentElement && n.parentElement.closest('script,style,.tpe-box,[data-cms-skip]')) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) })
  let n; while ((n = w.nextNode()) && out.length < 14) out.push(n)
  return out
}
function scopeFor(el) {
  const sec = cms().sec(el)
  if (sec === '@nav' || sec === '@foot') return { r: '*', s: sec, fixed: 'Every page' }
  if (!sec) return { r: S.route, s: '', fixed: 'This page' }
  return S.scope === 'page' ? { r: S.route, s: '' } : { r: S.route, s: sec }
}
function findEdit(k, f, sc) { return D.edits.find((x) => x.k === k && x.r === sc.r && x.s === sc.s && (k === 't' ? norm(x.f) === norm(f) : x.f === f)) }
const INSP_HELLO = `<div class="hello">
  <h3>Click anything on the page to change it</h3>
  <p>Words change as you type. Pictures swap from your library or a new upload. Anything can be hidden.</p>
  <ul>
    <li><i>${ICON.text}</i><span>Click words to rewrite them. Blue words are kept blue.</span></li>
    <li><i>${ICON.image}</i><span>Click a picture to replace it.</span></li>
    <li><i>${ICON.link}</i><span>Click a button or link to change where it goes.</span></li>
    <li><i>${ICON.hide}</i><span>Hide any card, line or whole section. It can always come back.</span></li>
    <li><i>${ICON.zh}</i><span>Switch to 中文 at the top to change the Chinese words.</span></li>
  </ul>
</div>`
function inspector() {
  const box = $('#insp'); if (!box) return
  const sel = F.sel
  if (!sel || !sel.el || !sel.el.isConnected || !cms()) { box.innerHTML = INSP_HELLO; return }
  const el = sel.el, c = cms(), sc = scopeFor(el), zh = F.d.documentElement.lang === 'zh'
  const img = sel.type === 'img' ? el : (el.tagName === 'IMG' ? el : null)
  const a = el.closest('a[href]')
  const runs = img ? [] : runsOf(el)
  const secEl = el.closest('main section[id]')
  const crumbs = []
  let e = el
  for (let i = 0; e && i < 6 && e !== F.d.body && e.id !== 'root' && e.tagName !== 'MAIN'; i++) { crumbs.push(e); if (e.tagName === 'SECTION' || e.tagName === 'FOOTER' || e.id === 'nav') break; e = e.parentElement }
  const hidden = el.hasAttribute('data-cms-hide')
  let html = `<div class="insp-h"><div class="k">${img ? ICON.image : a ? ICON.link : runs.length ? ICON.text : ICON.box}<span>${esc(nameOf(el) === 'Words' ? 'Words' : nameOf(el))}</span></div>
    <h3>${esc(img ? (img.getAttribute('alt') || 'A picture') : short(el.textContent, 70) || nameOf(el))}</h3>
    <div class="crumbs" role="group" aria-label="Select a bigger part">${crumbs.map((x, i) => '<button type="button" data-i="' + i + '"' + (i === 0 ? ' aria-current="true"' : '') + '>' + esc(i === 0 ? 'This' : nameOf(x)) + '</button>').join('')}</div></div>
    <div class="insp-b">`
  if (hidden) html += `<div class="flag warn">${ICON.hide}<span>This is hidden on the website. It shows faded here so you can bring it back.</span></div>`
  if (runs.length) {
    html += `<div class="scope">` + (sc.fixed
      ? `<div class="note">${sc.fixed === 'Every page' ? 'This is part of the ' + (sc.s === '@nav' ? 'menu' : 'footer') + ', so a change shows on <b>every page</b>.' : 'A change here shows wherever these words appear on this page.'}</div>`
      : `<div class="seg" role="group" aria-label="Where to change it"><button type="button" data-sc="sec" aria-pressed="${S.scope !== 'page'}">In this section</button><button type="button" data-sc="page" aria-pressed="${S.scope === 'page'}">Everywhere on this page</button></div>`) + `</div>`
    if (zh) html += `<div class="flag">${ICON.zh}<span>You are changing the 中文 words. Switch to EN at the top for the English.</span></div>`
    const multi = runs.length > 1
    runs.forEach((n, i) => {
      const p = n.parentElement, blue = p && (p.tagName === 'EM' || p.closest('em')), bold = p && /^(B|STRONG)$/.test(p.tagName)
      const orig = c.orig(n), cur = norm(n.nodeValue), changed = norm(orig) !== cur
      const lab = (blue ? '<span class="blue">Blue words</span>' : bold ? 'Bold words' : 'Words') + (multi && !blue ? ' <small>part ' + (i + 1) + '</small>' : '')
      const cnt = p && p.hasAttribute('data-count') ? '<div class="was">This number counts up on the page. Type the final figure.</div>' : ''
      html += `<div class="run${changed ? ' changed' : ''}" data-run="${i}"><div class="lab">${lab}${changed ? '<button type="button" class="b sm ghost" data-reset="' + i + '">Undo</button>' : ''}</div>
        <textarea class="in" rows="${Math.min(6, Math.max(1, Math.ceil(cur.length / 38)))}" data-run="${i}">${esc(cur)}</textarea>
        ${changed ? '<div class="was">Was: <s>' + esc(short(orig, 160)) + '</s></div>' : ''}${cnt}</div>`
    })
    if (runs.length >= 14) html += '<div class="note" style="margin-top:12px">This part holds a lot of text. Click a smaller piece on the page to change it.</div>'
  }
  if (img) {
    const o = c.imgOrig(img), changed = pathOf(o.src) !== pathOf(img.getAttribute('src'))
    const shown = Math.round(img.getBoundingClientRect().width)
    html += `<div class="imgbox"><img src="${esc(img.currentSrc || img.getAttribute('src'))}" alt=""><div class="cap" id="imgCap">${esc(pathOf(img.getAttribute('src')).split('/').pop())}</div></div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="b pri" type="button" id="repImg">${ICON.image}Replace picture</button>${changed ? '<button class="b" type="button" id="resImg">Use the original</button>' : ''}</div>
      <label class="fld"><span>Describe the picture</span><textarea class="in" id="altImg" rows="2">${esc(img.getAttribute('alt') || '')}</textarea><small>Read out to people who cannot see it, and used by search engines. Shown about ${shown} px wide here; a picture at least ${Math.min(2400, shown * 2)} px wide stays sharp.</small></label>`
  }
  if (a) {
    const href = c.linkOrig(a) || '', cur = a.getAttribute('href') || '', mail = /^mailto:/.test(cur)
    html += `<label class="fld" style="margin-top:18px"><span>${mail ? 'Email address it opens' : 'Goes to'}</span><input class="in" id="hrefIn" list="pagesList" value="${esc(mail ? cur.replace(/^mailto:/, '').split('?')[0] : cur)}"><small>${mail ? 'The email app opens addressed to this.' : 'A page of this site (pick from the list), a section like #contact, or a full web address.'}${cur !== href ? ' Was: ' + esc(href) : ''}</small></label>
      <datalist id="pagesList">${PAGES.map(([r, t]) => '<option value="' + r + '">' + esc(t) + '</option>').join('')}</datalist>`
  }
  if (!runs.length && !img && !a) html += `<p class="note">This part has no words or picture of its own. Click inside it to change what it holds, or hide the whole thing below.</p>`
  html += `<div class="card" style="margin-top:20px"><div class="card-b" style="padding:14px"><label class="chk"><input type="checkbox" id="hideIt"${hidden ? ' checked' : ''}> Hide this ${esc(nameOf(el).toLowerCase())} on the website</label><div class="note" style="margin-top:6px">${secEl && el === secEl ? 'The whole section disappears.' : 'Only this disappears; everything around it stays.'}</div></div></div>`
  html += `</div><div class="insp-f"><button class="b sm" type="button" id="resetAll">${ICON.undo}Undo every change to this</button><button class="b sm ghost" type="button" id="deselect">Done</button></div>`
  box.innerHTML = html
  /* wire it */
  $$('.crumbs button', box).forEach((b) => { b.onclick = () => { const x = crumbs[+b.dataset.i]; F.sel = { type: x.tagName === 'IMG' ? 'img' : 'box', el: x }; place(F.sb, x, labelOf(F.sel)); inspector() } })
  $$('[data-sc]', box).forEach((b) => { b.onclick = () => moveScope(el, runs, b.dataset.sc) })
  const typed = debounce((i, v) => setText(el, runs[i], v), 220)
  $$('textarea[data-run]', box).forEach((t) => { t.addEventListener('input', () => typed(+t.dataset.run, t.value)); t.addEventListener('blur', () => { setTimeout(() => { if (F.sel && F.sel.el === el) refreshRunMarks() }, 260) }) })
  $$('[data-reset]', box).forEach((b) => { b.onclick = () => { const n = runs[+b.dataset.reset]; removeTextEdits(el, [n]); setTimeout(inspector, 30) } })
  if (img) {
    /* the size of the file itself, not of the smaller copy the page chose */
    const probe = new Image(), name = pathOf(img.getAttribute('src')).split('/').pop(), shown = Math.round(img.getBoundingClientRect().width)
    probe.onload = () => {
      const cap = $('#imgCap'); if (!cap || !F.sel || F.sel.el !== img) return
      cap.textContent = name + ' · ' + probe.naturalWidth + ' × ' + probe.naturalHeight + ' px'
      if (probe.naturalWidth && probe.naturalWidth < shown * 1.5) cap.insertAdjacentHTML('beforeend', '<span class="soft">Smaller than this spot needs, so it may look soft. Use one at least ' + Math.min(2400, shown * 2) + ' px wide.</span>')
    }
    probe.src = img.getAttribute('src')
    $('#repImg').onclick = () => openPicker((src) => setImage(img, src))
    if ($('#resImg')) $('#resImg').onclick = () => { removeEdit('i', pathOf(c.imgOrig(img).src), scopeFor(img), true); setTimeout(inspector, 30) }
    $('#altImg').addEventListener('input', debounce(() => setAlt(img, $('#altImg').value), 300))
  }
  if (a) $('#hrefIn').addEventListener('input', debounce(() => setHref(a, $('#hrefIn').value), 400))
  $('#hideIt').onchange = (ev) => setHide(el, ev.target.checked)
  $('#resetAll').onclick = () => { resetElement(el, runs, img, a); setTimeout(inspector, 40) }
  $('#deselect').onclick = () => { F.sel = null; hideBox(F.sb); inspector() }
}
function refreshRunMarks() {
  if (!F.sel) return
  const box = $('#insp'), c = cms()
  $$('.run', box).forEach((r) => {
    const i = +r.dataset.run, n = runsOf(F.sel.el)[i]; if (!n) return
    r.classList.toggle('changed', norm(c.orig(n)) !== norm(n.nodeValue))
  })
  place(F.sb, F.sel.el, labelOf(F.sel))
}

/* ── writing edits ──────────────────────────────────────────────────── */
function setText(el, node, value) {
  if (!node || !cms()) return
  const orig = norm(cms().orig(node)), sc = scopeFor(el), t = norm(value)
  change((d) => {
    const e = findEdit('t', orig, sc)
    if (!t || t === orig) { if (e) d.edits.splice(d.edits.indexOf(e), 1); return }
    if (e) { e.t = t; e.at = Date.now() } else d.edits.push({ id: uid('e'), k: 't', r: sc.r, s: sc.s, f: orig, t, at: Date.now() })
  }, 'text:' + orig + ':' + sc.r + sc.s)
  setTimeout(refreshRunMarks, 30)
}
function removeTextEdits(el, nodes) {
  const c = cms(), keys = new Set(nodes.map((n) => norm(c.orig(n)))), sc = scopeFor(el)
  change((d) => { d.edits = d.edits.filter((x) => !(x.k === 't' && keys.has(norm(x.f)) && ((x.r === sc.r && x.s === sc.s) || (x.r === S.route && !x.s) || x.r === '*'))) })
}
function moveScope(el, runs, v) {
  const from = scopeFor(el); S.scope = v; const to = scopeFor(el)
  const keys = new Set(runs.map((n) => norm(cms().orig(n))))
  change((d) => { d.edits.forEach((x) => { if (x.k === 't' && keys.has(norm(x.f)) && x.r === from.r && x.s === from.s) { x.r = to.r; x.s = to.s } }) })
  inspector()
}
function removeEdit(k, f, sc, quiet) {
  change((d) => { d.edits = d.edits.filter((x) => !(x.k === k && x.f === f && x.r === sc.r && x.s === sc.s)) })
  if (!quiet) toast('Back to the original.')
}
function setImage(img, src) {
  const c = cms(), o = c.imgOrig(img), f = pathOf(o.src), sc = scopeFor(img)
  change((d) => {
    let e = d.edits.find((x) => x.k === 'i' && x.f === f && x.r === sc.r && x.s === sc.s)
    if (pathOf(src) === f) { if (e) d.edits.splice(d.edits.indexOf(e), 1); return }
    if (e) e.t = src; else d.edits.push({ id: uid('e'), k: 'i', r: sc.r, s: sc.s, f, t: src, at: Date.now() })
  })
  toast('Picture replaced.')
  setTimeout(inspector, 120)
}
function setAlt(img, alt) {
  const c = cms(), f = pathOf(c.imgOrig(img).src), sc = scopeFor(img)
  change((d) => {
    let e = d.edits.find((x) => x.k === 'i' && x.f === f && x.r === sc.r && x.s === sc.s)
    if (!e) { e = { id: uid('e'), k: 'i', r: sc.r, s: sc.s, f, t: pathOf(img.getAttribute('src')) === f ? f : img.getAttribute('src'), at: Date.now() }; d.edits.push(e) }
    e.a = norm(alt)
  }, 'alt:' + f)
}
function setHref(a, v) {
  const c = cms(), f = c.linkOrig(a) || '', sc = scopeFor(a), x = norm(c.textOrig(a))
  let t = norm(v)
  if (/^mailto:/.test(f) && t && !/^mailto:/.test(t)) t = 'mailto:' + t
  change((d) => {
    const e = d.edits.find((y) => y.k === 'l' && y.f === f && y.r === sc.r && y.s === sc.s && y.x === x)
    if (!t || t === f) { if (e) d.edits.splice(d.edits.indexOf(e), 1); return }
    if (e) e.t = t; else d.edits.push({ id: uid('e'), k: 'l', r: sc.r, s: sc.s, f, x, t, at: Date.now() })
  }, 'href:' + f + x)
}
function setHide(el, on) {
  const c = cms(), secEl = el.closest('main section[id]'), sc = scopeFor(el)
  const whole = secEl && el === secEl
  const rec = whole ? { k: 'h', r: S.route, s: secEl.id, g: '#' } : { k: 'h', r: sc.r, s: sc.s, g: c.sig(el), tg: el.tagName.toLowerCase() }
  change((d) => {
    d.edits = d.edits.filter((x) => !(x.k === 'h' && x.r === rec.r && x.s === rec.s && x.g === rec.g))
    if (on) d.edits.push(Object.assign({ id: uid('e'), at: Date.now() }, rec))
  })
  toast(on ? 'Hidden on the website. It shows faded here so you can bring it back.' : 'It shows on the website again.')
  setTimeout(inspector, 60)
}
function resetElement(el, runs, img, a) {
  const c = cms(), keys = new Set(runs.map((n) => norm(c.orig(n))))
  const fImg = img ? pathOf(c.imgOrig(img).src) : null, fA = a ? c.linkOrig(a) : null, sig = c.sig(el)
  change((d) => {
    d.edits = d.edits.filter((x) => {
      if (x.r !== S.route && x.r !== '*') return true
      if (x.k === 't' && keys.has(norm(x.f))) return false
      if (x.k === 'i' && fImg && x.f === fImg) return false
      if (x.k === 'l' && fA != null && x.f === fA) return false
      if (x.k === 'h' && (x.g === sig || (x.g === '#' && el.tagName === 'SECTION' && x.s === el.id))) return false
      return true
    })
  })
  toast('Back to the original.')
}

/* ── the changes on this page ─────────────────────────────────────────── */
function pageEdits() { return D.edits.filter((x) => x.r === S.route || x.r === '*') }
function peCount() { const n = $('#chgN'); if (n) n.textContent = pageEdits().length ? ' (' + pageEdits().length + ')' : '' }
function toggleDrawer() {
  const st = $('#stage'); if (!st) return
  const open = $('#drawer'); if (open) { open.remove(); return }
  const dr = document.createElement('div'); dr.className = 'drawer'; dr.id = 'drawer'
  st.appendChild(dr); drawDrawer()
}
function drawDrawer() {
  const dr = $('#drawer'); if (!dr) return
  const list = pageEdits().slice().sort((a, b) => (b.at || 0) - (a.at || 0))
  const seen = new Set()
  if (cms()) { const w = F.d.createTreeWalker(F.d.getElementById('root'), NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) seen.add(norm(cms().orig(n))) }
  const icon = { t: ICON.text, i: ICON.image, l: ICON.link, h: ICON.hide }
  const where = (x) => x.r === '*' ? 'Every page' + (x.s === '@nav' ? ', menu' : x.s === '@foot' ? ', footer' : '') : x.s ? 'Section ' + x.s : 'Whole page'
  dr.innerHTML = `<div class="drawer-h"><h3>Changes on ${esc(pageName(S.route))} and every page</h3><button class="b sm ghost" type="button" data-x>Close</button></div>
    <div class="drawer-b">${list.length ? list.map((x) => {
      const lost = x.k === 't' && cms() && !seen.has(norm(x.f)) && !seen.has(norm(x.t))
      const body = x.k === 't' ? '<s>' + esc(short(x.f, 90)) + '</s> → <em>' + esc(short(x.t, 90)) + '</em>'
        : x.k === 'i' ? 'Picture <s>' + esc(x.f.split('/').pop()) + '</s> → <em>' + esc(String(x.t).split('/').pop()) + '</em>' + (x.a ? '<small>Described as: ' + esc(short(x.a, 80)) + '</small>' : '')
          : x.k === 'l' ? 'Link <s>' + esc(x.f) + '</s> → <em>' + esc(x.t) + '</em>' + (x.x ? '<small>On “' + esc(short(x.x, 50)) + '”</small>' : '')
            : x.g === '#' ? 'Section <em>' + esc(x.s) + '</em> hidden' : 'Hidden: <em>' + esc(short(String(x.g).split('|').slice(1).join('|'), 80)) + '</em>'
      return '<div class="chg' + (lost ? ' lost' : '') + '"><i>' + (lost ? ICON.warn : icon[x.k] || ICON.box) + '</i><div class="w">' + body + '<small>' + esc(where(x)) + (lost ? ' · not found on this page: the original words may have changed in the code' : '') + '</small></div><button class="b sm ghost" type="button" data-undo="' + esc(x.id) + '">Undo</button></div>'
    }).join('') : '<div class="empty">No changes on this page yet. Click anything on the page to change it.</div>'}</div>`
  $('[data-x]', dr).onclick = () => dr.remove()
  $$('[data-undo]', dr).forEach((b) => { b.onclick = () => { change((d) => { d.edits = d.edits.filter((x) => x.id !== b.dataset.undo) }); drawDrawer(); inspector() } })
}

/* ═══ PICTURES: the library and the picker ══════════════════════════════ */
let MEDIA = null
async function loadMedia(force) {
  if (MEDIA && !force) return MEDIA
  let items = []
  try {
    const r = await fetch(SERVER.writable ? '/__cms/media' : '/assets/content/media.json', { cache: 'no-store' })
    const j = await r.json(); items = (j.items || j || []).filter((x) => !x.video)
  } catch (e) { items = [] }
  MEDIA = items
  return MEDIA
}
async function upload(files) {
  if (!SERVER.writable) { toast('Uploading works in the editor on this computer. On the live host, add the picture to assets/media/uploads first.'); return [] }
  const done = []
  for (const f of files) {
    if (!/^image\//.test(f.type)) { toast(f.name + ' is not a picture.'); continue }
    if (f.size > 15 * 1024 * 1024) { toast(f.name + ' is larger than 15 MB. Save a smaller copy first.'); continue }
    try {
      const r = await fetch('/__cms/upload?name=' + encodeURIComponent(f.name), { method: 'POST', body: f })
      const j = await r.json()
      if (j.ok) done.push(j.src); else toast(j.error || 'The upload failed.')
    } catch (e) { toast('The upload failed.') }
  }
  if (done.length) { await loadMedia(true); toast(done.length === 1 ? 'Picture uploaded.' : done.length + ' pictures uploaded.') }
  return done
}
function mediaGrid(items, picked) {
  return items.length ? '<div class="mgrid">' + items.map((m) => '<button type="button" class="mcell' + (m.upload ? ' up' : '') + '" data-src="' + esc(m.src) + '" aria-pressed="' + (m.src === picked) + '"><span class="ph" style="background-image:url(\'' + esc(m.src) + '\')"></span><span class="nm">' + esc(m.name) + (m.w ? ' · ' + m.w + ' px' : '') + '</span></button>').join('') + '</div>'
    : '<div class="empty">No pictures found.</div>'
}
function dropZone() {
  return SERVER.writable ? '<label class="drop" id="drop"><input type="file" accept="image/*" multiple hidden id="upIn"><b>Drop pictures here, or click to choose</b><span>JPG, PNG or WEBP. Wide photographs look best at 2000 px or more.</span></label>'
    : '<div class="flag">' + ICON.info + '<span>Uploading new pictures works in the editor on this computer (the one the site is built on). Here you can choose from the pictures already on the site.</span></div>'
}
function wireDrop(root, after) {
  const dz = $('#drop', root); if (!dz) return
  const up = async (files) => { const done = await upload(Array.from(files)); if (done.length) after(done) }
  $('#upIn', root).onchange = (e) => up(e.target.files)
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('on') })
  dz.addEventListener('dragleave', () => dz.classList.remove('on'))
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('on'); up(e.dataTransfer.files) })
}
async function openPicker(onPick) {
  let picked = null
  const close = modal(`<div class="modal-h"><h3>Choose a picture</h3><input class="in" id="mq" placeholder="Search by name" style="max-width:260px"><button class="b sm ghost" type="button" data-close>Close</button></div>
    <div class="modal-b">${dropZone()}<div id="mg"><div class="empty">Loading the pictures</div></div></div>
    <div class="modal-f"><button class="b" type="button" data-close>Cancel</button><button class="b pri" type="button" id="usePic" disabled>Use this picture</button></div>`, (m, closeIt) => {
    const draw = () => {
      const q = norm($('#mq', m).value).toLowerCase()
      $('#mg', m).innerHTML = mediaGrid((MEDIA || []).filter((x) => !q || x.name.toLowerCase().includes(q)), picked)
      $$('.mcell', m).forEach((c) => { c.onclick = () => { picked = c.dataset.src; $$('.mcell', m).forEach((x) => x.setAttribute('aria-pressed', x === c)); $('#usePic', m).disabled = false }; c.ondblclick = () => { closeIt(); onPick(c.dataset.src) } })
    }
    loadMedia().then(draw)
    $('#mq', m).addEventListener('input', draw)
    wireDrop(m, (done) => { picked = done[0]; draw(); $('#usePic', m).disabled = false })
    $('#usePic', m).onclick = () => { if (picked) { closeIt(); onPick(picked) } }
  })
  return close
}
function picturesView() {
  $('#main').innerHTML = `<div class="pad"><div class="hrow"><div><h1 class="h">Pictures</h1><p class="lede">Every picture the website can use. Upload new ones here, then click any picture on a page to put one in its place.</p></div></div>
    <div style="margin-top:22px">${dropZone()}</div><input class="in" id="mq" placeholder="Search by name" style="max-width:320px;margin-bottom:14px"><div id="mg"><div class="empty">Loading the pictures</div></div></div>`
  const draw = () => {
    const q = norm($('#mq').value).toLowerCase()
    $('#mg').innerHTML = mediaGrid((MEDIA || []).filter((x) => !q || x.name.toLowerCase().includes(q)))
    $$('.mcell').forEach((c) => { c.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(c.dataset.src); toast('Copied the address: ' + c.dataset.src) } })
  }
  loadMedia().then(draw)
  $('#mq').addEventListener('input', draw)
  wireDrop($('#main'), draw)
}

/* ═══ NEWS AND EVENTS: the two lists the site has always read ═════════ */
function listView(cfg) {
  const items = D[cfg.key].slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  $('#main').innerHTML = `<div class="pad"><div class="hrow"><div><h1 class="h">${cfg.title}</h1><p class="lede">${cfg.lede}</p></div><button class="b pri" type="button" id="addIt">${ICON.plus}${cfg.add}</button></div>
    <div class="split"><div class="card"><div class="list" id="lst">${items.length ? items.map((x) => '<div class="item"><span class="th" style="' + (cfg.thumb && cfg.thumb(x) ? 'background-image:url(\'' + esc(cfg.thumb(x)) + '\')' : '') + '"></span><div><b>' + esc(x.title || 'Untitled') + '</b><small>' + esc(cfg.meta(x)) + '</small></div><div class="acts">' + cfg.badge(x) + '<button class="b sm" type="button" data-ed="' + esc(x.id) + '">Edit</button></div></div>').join('') : '<div class="empty">Nothing here yet. Add the first one.</div>'}</div></div>
    <div class="stick" id="form"><div class="card"><div class="card-b note">Choose one to edit, or add a new one.</div></div></div></div></div>`
  $('#addIt').onclick = () => openForm(null)
  $$('[data-ed]').forEach((b) => { b.onclick = () => openForm(D[cfg.key].find((x) => x.id === b.dataset.ed)) })
  function openForm(x) {
    const v = x ? clone(x) : cfg.blank()
    $('#form').innerHTML = `<div class="card"><div class="card-h"><h3>${x ? 'Edit' : cfg.add}</h3>${x ? '<button class="b sm bad" type="button" id="delIt">' + ICON.trash + 'Delete</button>' : ''}</div><div class="card-b">${cfg.fields.map((f) => field(f, v)).join('')}</div>
      <div class="insp-f"><button class="b pri" type="button" id="saveIt">Save</button><button class="b" type="button" id="cancelIt">Cancel</button></div></div>`
    $('#cancelIt').onclick = () => listView(cfg)
    if ($('#delIt')) $('#delIt').onclick = () => { if (confirm('Delete “' + (x.title || 'this') + '”? You can undo it with the Undo button at the top.')) { change((d) => { d[cfg.key] = d[cfg.key].filter((y) => y.id !== x.id) }); toast('Deleted. Press Undo at the top to bring it back.'); listView(cfg) } }
    $('#saveIt').onclick = () => {
      const out = readFields(cfg.fields, v)
      const err = cfg.check && cfg.check(out); if (err) return toast(err)
      change((d) => { const i = d[cfg.key].findIndex((y) => y.id === out.id); if (i >= 0) d[cfg.key][i] = out; else d[cfg.key].push(out) })
      toast('Saved to the draft. Publish to put it on the website.'); listView(cfg)
    }
    $$('[data-pic]', $('#form')).forEach((b) => { b.onclick = () => openPicker((src) => {
      const id = b.dataset.pic
      $('#' + id).value = src; $('#' + id + '_th').style.backgroundImage = "url('" + src + "')"; $('#' + id + '_nm').textContent = src.split('/').pop()
    }) })
    const f0 = $('#form .in'); if (f0) f0.focus()
  }
}
function field(f, v) {
  const val = f.get ? f.get(v) : v[f.k]
  const id = 'f_' + f.k
  let input
  if (f.type === 'area' || f.type === 'lines') input = '<textarea class="in" id="' + id + '" rows="' + (f.rows || 3) + '">' + esc(val == null ? '' : val) + '</textarea>'
  else if (f.type === 'select') input = '<select class="in" id="' + id + '">' + f.opts.map((o) => { const [v, t] = Array.isArray(o) ? o : [o, o]; return '<option value="' + esc(v) + '"' + (v === val ? ' selected' : '') + '>' + esc(t) + '</option>' }).join('') + '</select>'
  else if (f.type === 'pic') {
    const src = picSrc(val)
    return '<div class="fld"><span>' + esc(f.label) + '</span><div class="picrow"><span class="th" id="' + id + '_th"' + (src ? ' style="background-image:url(\'' + esc(src) + '\')"' : '') + '></span><div><button class="b sm" type="button" data-pic="' + id + '">' + ICON.image + 'Choose a picture</button><small id="' + id + '_nm">' + esc(val ? String(val).split('/').pop() : 'None chosen yet') + '</small></div></div><input type="hidden" id="' + id + '" value="' + esc(val || '') + '">' + (f.help ? '<small>' + esc(f.help) + '</small>' : '') + '</div>'
  } else if (f.type === 'parts') {
    return '<div class="fld"><span>' + esc(f.label) + '</span>' + f.names.map((n, i) => '<label class="sub"><small>' + (i + 1) + ' · ' + esc(n) + '</small><textarea class="in" rows="2" id="' + id + '_' + i + '">' + esc((val || [])[i] || '') + '</textarea></label>').join('') + (f.help ? '<small>' + esc(f.help) + '</small>' : '') + '</div>'
  }
  else if (f.type === 'check') return '<label class="chk fld"><input type="checkbox" id="' + id + '"' + (val ? ' checked' : '') + '> ' + esc(f.label) + '</label>'
  else input = '<input class="in" id="' + id + '" type="' + (f.type || 'text') + '" value="' + esc(val == null ? '' : val) + '"' + (f.ph ? ' placeholder="' + esc(f.ph) + '"' : '') + '>'
  return '<label class="fld"><span>' + esc(f.label) + '</span>' + input + (f.help ? '<small>' + esc(f.help) + '</small>' : '') + '</label>'
}
function readFields(fields, v) {
  const out = clone(v)
  fields.forEach((f) => {
    if (f.type === 'parts') { out[f.k] = f.names.map((_, i) => { const t = $('#f_' + f.k + '_' + i); return t ? norm(t.value) : '' }); return }
    const el = $('#f_' + f.k); if (!el) return
    const raw = f.type === 'check' ? el.checked : el.value
    if (f.set) f.set(out, raw); else out[f.k] = f.type === 'number' ? (+raw || undefined) : f.type === 'check' ? raw : String(raw).trim()
  })
  return out
}
const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean)
function newsView() {
  listView({
    key: 'news', title: 'News and insights', add: 'Add an article', lede: 'Articles, event notes and insights on the News page. A draft article shows as “arriving soon” without a link until you tick Published.',
    meta: (x) => [x.type, fmtDate(x.date), x.tag].filter(Boolean).join(' · '),
    badge: (x) => '<span class="pill ' + (x.published ? 'ok' : 'off') + '">' + (x.published ? 'Published' : 'Draft') + '</span>',
    blank: () => ({ id: uid('n'), type: 'Programme news', title: '', date: today(), tag: '', published: false, excerpt: '', body: [], link: '' }),
    check: (x) => (!x.title ? 'The article needs a title.' : ''),
    fields: [
      { k: 'title', label: 'Title' },
      { k: 'type', label: 'Kind', type: 'select', opts: ['Programme news', 'Event note', 'Blog', 'Insight'] },
      { k: 'date', label: 'Date', type: 'date' }, { k: 'tag', label: 'Tag', ph: 'SAP, Events, Insights' },
      { k: 'minutes', label: 'Reading time in minutes', type: 'number' },
      { k: 'excerpt', label: 'Summary on the card', type: 'area', rows: 3 },
      { k: 'body', label: 'The article, one paragraph per line', type: 'lines', rows: 8, get: (v) => (v.body || []).join('\n'), set: (o, raw) => { o.body = lines(raw) } },
      { k: 'link', label: 'Link instead of the article (optional)', help: 'If set, the card opens this address instead of showing the article.' },
      { k: 'published', label: 'Published', type: 'check' },
    ],
  })
}
function eventsView() {
  listView({
    key: 'events', title: 'Coming-up events', add: 'Add an event', lede: 'Events that are still to come. They show in their own band on the Past events page until their date passes. Past events, with their pictures, have their own screen.',
    thumb: null,
    meta: (x) => [x.city, fmtDate(x.date), x.role].filter(Boolean).join(' · '),
    badge: (x) => { const up = (x.endDate || x.date || '') >= today(); return '<span class="pill ' + (up ? '' : 'off') + '">' + (up ? 'Coming up' : 'Past') + '</span>' },
    blank: () => ({ id: uid('ev'), title: '', city: '', venue: '', date: today(), endDate: '', time: '', role: '', summary: '', access: '', agenda: [], link: '', linkText: '', link2: '', linkText2: '', img: '', alt: '', phases: { before: [], during: [], after: [] } }),
    check: (x) => (!x.title ? 'The event needs a title.' : !x.date ? 'The event needs a date.' : ''),
    fields: [
      { k: 'title', label: 'Title' }, { k: 'city', label: 'City' }, { k: 'venue', label: 'Venue' },
      { k: 'date', label: 'Date', type: 'date' }, { k: 'endDate', label: 'Last day (leave empty for a one-day event)', type: 'date' },
      { k: 'time', label: 'Time', ph: '09:00 to 18:00 SGT' }, { k: 'role', label: 'Our role', ph: 'Silver Sponsor' },
      { k: 'summary', label: 'Summary', type: 'area' },
      { k: 'access', label: 'Who can attend (optional)', type: 'area', rows: 2, ph: 'Open to SVCA members; registration is subject to approval.' },
      { k: 'agenda', label: 'Agenda, one item per line (optional)', type: 'lines', rows: 6, help: 'Put the time, a bar, then the item: 10:15|Session 1 · Speaker name', get: (v) => (v.agenda || []).join('\n'), set: (o, raw) => { o.agenda = lines(raw) } },
      { k: 'link', label: 'Link', ph: '/contact/ or a registration address', help: 'Paste registration links exactly as given; tracking parts such as ?source= must stay.' }, { k: 'linkText', label: 'Link words', ph: 'Register' },
      { k: 'link2', label: 'Second link (optional)', ph: 'An event page' }, { k: 'linkText2', label: 'Second link words', ph: 'Event page' },
      { k: 'img', label: 'Poster (optional)', type: 'pic', help: 'The event poster, square or portrait. Visitors can click it to see it full size.' }, { k: 'alt', label: 'Poster description, read out to blind visitors', ph: 'Seminar poster: title, date and venue' },
      { k: 'before', label: 'Before the event, one item per line', type: 'lines', get: (v) => ((v.phases || {}).before || []).join('\n'), set: (o, raw) => { o.phases = o.phases || {}; o.phases.before = lines(raw) } },
      { k: 'during', label: 'During, one item per line', type: 'lines', get: (v) => ((v.phases || {}).during || []).join('\n'), set: (o, raw) => { o.phases = o.phases || {}; o.phases.during = lines(raw) } },
      { k: 'after', label: 'After, one item per line', type: 'lines', get: (v) => ((v.phases || {}).after || []).join('\n'), set: (o, raw) => { o.phases = o.phases || {}; o.phases.after = lines(raw) } },
    ],
  })
}

/* ═══ LISTS: case studies, people, client logos, questions ══════════════
   Each of these pages reads its list through useCmsList, so the editor takes
   the code's own items from the page (window.__tpLists) and writes only what
   differs: the order, the fields that changed, off:true to take one down,
   and whole new items. The real page sits on the right and shows every
   change as it is made. To make another list editable: read it through
   useCmsList(key, items-with-ids) in the page, and add a screen below. */
const SVC_OPTS = [['rise', 'Rise-Move'], ['grow', 'SAP Grow'], ['s4', 'S/4HANA Transition'], ['ams', 'AMS / Run Support'], ['ai', 'AI in SAP']]
const IND_OPTS = [['life', 'Life Sciences'], ['mfg', 'Manufacturing'], ['auto', 'Automotive'], ['other', 'Other sectors']]
const optName = (opts, v) => (opts.find((o) => o[0] === v) || [0, v || ''])[1]
const picSrc = (v) => (!v ? '' : /^(\/|https?:)/.test(v) ? v : '/assets/media/' + v)
const bare = (t) => String(t || '').replace(/\.$/, '')
const TAGS_FIELD = (help) => ({ k: 'sig', label: 'Situation tags, one per line', type: 'lines', rows: 3, help, get: (v) => (v.sig || []).join('\n'), set: (o, raw) => { o.sig = lines(raw) } })
const SCREENS = {
  pastEvents: {
    title: 'Past events', route: '/events/',
    lede: 'The events on the Past events page, newest first. Change, add, hide or reorder them. The page on the right shows each change as you make it.',
    lists: {
      pastEvents: {
        name: 'Past events', one: 'event', add: 'Add an event', where: '#past', item: (id) => '#' + CSS.escape(id),
        lede: 'One row per event: its pictures on one side, the date, place, title, our role and what we showed on the other.',
        thumb: (x) => picSrc(x.img), title: (x) => x.h || 'Untitled', meta: (x) => [x.when, x.place].filter(Boolean).join(' · '),
        blank: () => ({ id: uid('ev'), when: '', place: '', role: '', h: '', s: '', pts: [], img: '', alt: '', img2: '', alt2: '', img3: '', alt3: '' }),
        fields: [
          { k: 'h', label: 'Title', ph: 'Future-Ready Finance: From Compliance to AI and Real-Time Visibility' },
          { k: 'when', label: 'Date', ph: '15 September 2026', help: 'As it should read on the page. Put the newest event first in the list.' },
          { k: 'place', label: 'Place', ph: 'SBF Center, Singapore' },
          { k: 'role', label: 'Our role', ph: 'Exhibitor and speaker' },
          { k: 's', label: 'One line about it', type: 'area', rows: 2 },
          { k: 'pts', label: 'What we showed, one per line', type: 'lines', rows: 4, get: (v) => (v.pts || []).join('\n'), set: (o, raw) => { o.pts = lines(raw) } },
          { k: 'img', label: 'Main picture', type: 'pic', help: 'A landscape photograph, at least 1200 px wide.' },
          { k: 'alt', label: 'Describe the main picture', type: 'area', rows: 2, help: 'Read out to people who cannot see it, and used by search engines.' },
          { k: 'img2', label: 'Second picture (optional)', type: 'pic' },
          { k: 'alt2', label: 'Describe the second picture', type: 'area', rows: 2 },
          { k: 'img3', label: 'Third picture (optional)', type: 'pic' },
          { k: 'alt3', label: 'Describe the third picture', type: 'area', rows: 2 },
        ],
      },
    },
  },
  cases: {
    title: 'Case studies', route: '/casestudiesv2/',
    lede: 'Change, add, hide or reorder them. The page on the right shows each change as you make it.',
    note: 'The page\'s headings count these for you: add a story and “Four programmes” becomes “Five programmes”.',
    lists: {
      cases: {
        name: 'Featured stories', one: 'story', add: 'Add a story', where: '#stories', item: (id) => '#' + CSS.escape(id),
        lede: 'The stories with a photograph near the top of the page. Each one is also told in five parts further down, and listed first in the library.',
        thumb: (x) => picSrc(x.img), title: (x) => bare(x.h), meta: (x) => optName(SVC_OPTS, x.svc) + ' · ' + optName(IND_OPTS, x.ind),
        blank: () => ({ id: uid('story'), svc: 'rise', ind: 'mfg', h: '', s1: '', short: '', s: '', s2: '', sig: [], parts: ['', '', '', '', ''], img: '', alt: '' }),
        fields: [
          { k: 'h', label: 'Title', ph: 'Validated migration, without losing control' },
          { k: 's1', label: 'The line under the title', type: 'area', rows: 2 },
          { k: 'svc', label: 'Service', type: 'select', opts: SVC_OPTS }, { k: 'ind', label: 'Industry', type: 'select', opts: IND_OPTS },
          { k: 'img', label: 'Picture', type: 'pic', help: 'A landscape photograph, at least 1200 px wide.' },
          { k: 'alt', label: 'Describe the picture', type: 'area', rows: 2, help: 'Read out to people who cannot see it, and used by search engines.' },
          { k: 'short', label: 'Short name on its tab', ph: 'Validated migration', help: 'The tab in “Every story is told in the same five parts”.' },
          { k: 'parts', label: 'The five parts', type: 'parts', names: ['Context', 'Stuck point', 'Delivery', 'Outcome', 'SAP in context'], help: 'One sentence each. They read one at a time under the drawings.' },
          { k: 's2', label: 'Summary on its library card', type: 'area', rows: 2 },
          TAGS_FIELD('Visitors filter the library by these. Reuse the wording of tags already there so stories group together.'),
          { k: 's', label: 'Longer summary', type: 'area', rows: 3, help: 'Found by the library search, and shown on the library card when the summary above is empty.' },
        ],
      },
      programmes: {
        name: 'Library programmes', one: 'programme', add: 'Add a programme', where: '#library', item: (id) => '#' + CSS.escape(id),
        lede: 'The further programmes in the searchable library, after the featured stories.',
        title: (x) => bare(x.h), meta: (x) => optName(SVC_OPTS, x.svc) + ' · ' + optName(IND_OPTS, x.ind),
        blank: () => ({ id: uid('prog'), svc: 's4', ind: 'mfg', k: '', h: '', s: '', s2: '', sig: [] }),
        fields: [
          { k: 'h', label: 'Title', ph: 'Nineteen legal entities, one template' },
          { k: 'k', label: 'Label on the card', ph: 'Global template' },
          { k: 'svc', label: 'Service', type: 'select', opts: SVC_OPTS }, { k: 'ind', label: 'Industry', type: 'select', opts: IND_OPTS },
          { k: 's2', label: 'Summary on the card', type: 'area', rows: 2 },
          TAGS_FIELD('Visitors filter the library by these. Reuse the wording of tags already there so programmes group together.'),
          { k: 's', label: 'Longer summary', type: 'area', rows: 3, help: 'Found by the library search, and shown on the card when the summary above is empty.' },
        ],
      },
    },
  },
  people: {
    title: 'People', route: '/aboutus2/',
    lede: 'The portraits on the About us page. Add names once each person approves.',
    lists: {
      portraits: {
        name: 'Portraits', one: 'portrait', add: 'Add a person', where: '.a2-portrait',
        thumb: (x) => picSrc(x.img), title: (x) => x.n || x.b || 'Untitled', meta: (x) => [x.n ? x.b : '', x.s].filter(Boolean).join(' · '),
        blank: () => ({ id: uid('person'), n: '', b: '', s: '', img: '' }),
        fields: [
          { k: 'n', label: 'Name', help: 'Leave empty until the name is approved: the role shows in its place.' },
          { k: 'b', label: 'Role', ph: 'Delivery Lead · S/4HANA' },
          { k: 's', label: 'City', ph: 'Kuala Lumpur' },
          { k: 'img', label: 'Portrait', type: 'pic', help: 'A portrait photograph, taller than wide, at least 1000 px wide.' },
        ],
      },
    },
  },
  logos: {
    title: 'Client logos', route: '/',
    lede: 'The logos that run along the top of the home page. Add one only when the client has cleared it.',
    lists: {
      logos: {
        name: 'Logos', one: 'logo', add: 'Add a logo', where: '#trust', logo: true,
        thumb: (x) => x.src, title: (x) => x.n || 'Untitled', meta: (x) => String(x.src || '').split('/').pop(),
        blank: () => ({ id: uid('logo'), n: '', src: '' }),
        fields: [
          { k: 'n', label: 'Company name', help: 'Read out to people who cannot see the logo.' },
          { k: 'src', label: 'Logo', type: 'pic', help: 'An SVG, or a PNG on a transparent background, trimmed close to the logo.' },
        ],
      },
    },
  },
  faq: {
    title: 'Questions', route: '/',
    lede: 'The questions and answers near the end of the home page.',
    lists: {
      faq: {
        name: 'Questions', one: 'question', add: 'Add a question', where: '.h2-faq',
        title: (x) => x.q || 'Untitled', meta: (x) => short(x.a, 90),
        blank: () => ({ id: uid('q'), q: '', a: '' }),
        fields: [
          { k: 'q', label: 'Question', ph: 'How long does a move to S/4HANA take?' },
          { k: 'a', label: 'Answer', type: 'area', rows: 7 },
        ],
      },
    },
  },
}
/* which screen a list belongs to, for the Publish summary */
const LIST_NAMES = {}
Object.keys(SCREENS).forEach((s) => Object.keys(SCREENS[s].lists).forEach((k) => { LIST_NAMES[k] = SCREENS[s].title + (Object.keys(SCREENS[s].lists).length > 1 ? ', ' + SCREENS[s].lists[k].name.toLowerCase() : '') }))
const LS = { screen: null, tab: null, edit: null, defs: null }
const blank = (v) => v == null || v === '' || v === false || (Array.isArray(v) && v.every((x) => blank(x)))
const same = (a, b) => (blank(a) && blank(b)) || cmp(a) === cmp(b)
const lsDefs = (key) => (LS.defs && LS.defs[key]) || []
function lsList(key) {
  const defs = lsDefs(key), l = Array.isArray(D.lists[key]) ? D.lists[key] : null
  const byId = new Map(defs.map((d) => [d.id, d]))
  if (!l) return defs.map((d) => Object.assign(clone(d), { _d: 1 }))
  const seen = new Set(l.map((x) => x && x.id))
  return l.filter((x) => x && x.id != null).map((x) => { const d = byId.get(x.id); return d ? Object.assign(clone(d), clone(x), { _d: 1 }) : clone(x) })
    .concat(defs.filter((d) => !seen.has(d.id)).map((d) => Object.assign(clone(d), { _d: 1 })))
}
const lsDef = (key, id) => lsDefs(key).find((d) => d.id === id)
function lsChanged(key, x) { const d = lsDef(key, x.id); return !!d && Object.keys(x).some((k) => k !== '_d' && k !== 'id' && !same(x[k], d[k])) }
/* the list as the content file keeps it: only what differs from the code */
function lsWrite(d, key, items) {
  const defs = lsDefs(key)
  let plain = items.length === defs.length
  const out = items.map((x, i) => {
    const def = lsDef(key, x.id)
    if (!def) { plain = false; const o = clone(x); delete o._d; if (!o.off) delete o.off; return o }
    const o = { id: x.id }
    Object.keys(x).forEach((k) => { if (k !== '_d' && k !== 'id' && !same(x[k], def[k])) o[k] = x[k] })
    if (!o.off) delete o.off
    if (Object.keys(o).length > 1 || defs[i] !== def) plain = false
    return o
  })
  if (plain) delete d.lists[key]; else d.lists[key] = out
}
function listScreen(name) {
  const sc = SCREENS[name]
  if (LS.screen !== name) { LS.screen = name; LS.tab = Object.keys(sc.lists)[0]; LS.edit = null }
  LS.defs = null
  $('#main').innerHTML = `<div class="lv">
    <div class="lv-l" id="lsL"><div class="empty">Loading the page</div></div>
    <div class="pe-stage lv-r" id="lsStage"><div class="frame" id="lsFrame"><iframe id="lsIfr" title="The page with your changes"></iframe></div><div class="loading" id="lsLoad">Loading the page</div></div>
  </div>`
  const ifr = $('#lsIfr'), keys = Object.keys(sc.lists)
  ifr.addEventListener('load', () => {
    let w, n = 0
    try { w = ifr.contentWindow } catch (e) { return }
    const wait = () => {
      if (S.view !== name || !$('#lsIfr')) return
      const L = w && w.__tpLists
      if (w && w.__tpCms && L && keys.every((k) => L[k])) {
        LS.defs = {}; keys.forEach((k) => { LS.defs[k] = clone(L[k]) })
        F.w = w; F.d = ifr.contentDocument
        const st = F.d.createElement('style'); st.textContent = '.bmws{display:none!important}body{padding-top:0!important}#nav,.nav{top:0!important}'; F.d.head.appendChild(st)
        toFrame(); $('#lsLoad').hidden = true; lsDraw(); lsScroll(LS.edit)
        return
      }
      if (++n > 90) { $('#lsLoad').textContent = 'The page did not load. Reload the editor to try again.'; return }
      setTimeout(wait, 150)
    }
    wait()
  })
  ifr.src = sc.route + '?draft=1'
  lsFit()
  window.removeEventListener('resize', lsFit); window.addEventListener('resize', lsFit)
}
function lsFit() {
  const st = $('#lsStage'), fr = $('#lsFrame'); if (!st || !fr) return
  const W = 1440, k = Math.min(1, (st.clientWidth - 28) / W)
  fr.style.width = W + 'px'; fr.style.height = Math.round((st.clientHeight - 28) / k) + 'px'
  fr.style.transform = 'translateX(-50%) scale(' + k + ')'
}
function lsScroll(id) {
  if (!F.d || !LS.screen) return
  const cfg = SCREENS[LS.screen].lists[LS.tab]
  let el = null
  try { el = (id && cfg.item && F.d.querySelector(cfg.item(id))) || F.d.querySelector(cfg.where) } catch (e) { /* not on the page */ }
  if (el) el.scrollIntoView({ block: id && cfg.item ? 'center' : 'start', behavior: 'instant' })
}
function lsDraw() {
  const box = $('#lsL'); if (!box || !LS.defs) return
  const sc = SCREENS[LS.screen], key = LS.tab, cfg = sc.lists[key], items = lsList(key), keys = Object.keys(sc.lists)
  if (LS.edit) return lsForm(box, key, cfg, items)
  box.innerHTML = `<h1 class="h">${esc(sc.title)}</h1><p class="lede">${esc(sc.lede)}</p>
    ${keys.length > 1 ? '<div class="seg lv-tabs" role="group" aria-label="Which list">' + keys.map((k) => '<button type="button" data-t="' + k + '" aria-pressed="' + (k === key) + '">' + esc(sc.lists[k].name) + '<b>' + lsList(k).filter((x) => !x.off).length + '</b></button>').join('') + '</div>' : ''}
    ${cfg.lede ? '<p class="note" style="margin-top:12px">' + esc(cfg.lede) + '</p>' : ''}
    <div class="card" style="margin-top:14px"><div class="list">${items.map((x, i) => {
      const src = cfg.thumb && cfg.thumb(x)
      const th = cfg.thumb ? '<span class="th' + (cfg.logo ? ' logo' : '') + '"' + (src ? ' style="background-image:url(\'' + esc(src) + '\')"' : '') + '></span>' : '<span class="th ic">' + ICON.list + '</span>'
      const tag = x.off ? '<span class="pill off">Hidden</span>' : !x._d ? '<span class="pill">New</span>' : lsChanged(key, x) ? '<span class="pill warn">Changed</span>' : ''
      return '<div class="item' + (x.off ? ' off' : '') + '">' + th + '<div><b>' + esc(cfg.title(x) || 'Untitled') + '</b><small>' + esc(cfg.meta ? cfg.meta(x) : '') + '</small></div><div class="acts">' + tag +
        '<button class="b sm ghost" type="button" data-mv="' + i + ':-1"' + (i === 0 ? ' disabled' : '') + ' title="Move up">' + ICON.up + '<span class="vh">Move up</span></button>' +
        '<button class="b sm ghost" type="button" data-mv="' + i + ':1"' + (i === items.length - 1 ? ' disabled' : '') + ' title="Move down">' + ICON.down + '<span class="vh">Move down</span></button>' +
        '<button class="b sm" type="button" data-ed="' + esc(x.id) + '">Edit</button></div></div>'
    }).join('') || '<div class="empty">Nothing here yet.</div>'}</div></div>
    <div style="margin-top:14px"><button class="b pri" type="button" id="lsAdd">${ICON.plus}${esc(cfg.add)}</button></div>
    ${sc.note ? '<p class="note" style="margin-top:16px">' + esc(sc.note) + '</p>' : ''}`
  $$('[data-t]', box).forEach((b) => { b.onclick = () => { LS.tab = b.dataset.t; lsDraw(); lsScroll() } })
  $$('[data-mv]', box).forEach((b) => { b.onclick = () => {
    const [i, dir] = b.dataset.mv.split(':').map(Number)
    change((d) => { const it = lsList(key); const [a] = it.splice(i, 1); it.splice(i + dir, 0, a); lsWrite(d, key, it) })
    lsDraw(); lsScroll()
  } })
  $$('[data-ed]', box).forEach((b) => { b.onclick = () => { LS.edit = b.dataset.ed; lsDraw(); lsScroll(LS.edit) } })
  $('#lsAdd').onclick = () => {
    const x = cfg.blank()
    change((d) => { const it = lsList(key); it.push(x); lsWrite(d, key, it) })
    LS.edit = x.id; lsDraw(); lsScroll()
  }
}
function lsForm(box, key, cfg, items) {
  const x = items.find((y) => y.id === LS.edit)
  if (!x) { LS.edit = null; return lsDraw() }
  const all = cfg.fields.concat([{ k: 'off', label: 'Hide it on the website', type: 'check' }])
  box.innerHTML = `<button class="b sm ghost" type="button" id="lsBack" style="margin-left:-12px">${ICON.back}All ${esc(cfg.name.toLowerCase())}</button>
    <h1 class="h" style="margin-top:6px">${x._d ? 'Change this ' + esc(cfg.one) : 'New ' + esc(cfg.one)}</h1>
    <p class="lede">It changes on the right as you type.${x._d ? '' : ' It appears on the page once it is filled in.'}</p>
    <div class="card" style="margin-top:16px"><div class="card-b" id="lsF">${all.map((f) => field(f, x)).join('')}</div>
    <div class="insp-f"><button class="b pri" type="button" id="lsDone">Done</button>${x._d ? (lsChanged(key, x) ? '<button class="b" type="button" id="lsReset">' + ICON.undo + 'Back to the original</button>' : '') : '<button class="b bad" type="button" id="lsDel">' + ICON.trash + 'Delete</button>'}</div></div>`
  if (cfg.logo) $$('.picrow .th', box).forEach((t) => t.classList.add('logo'))
  const save = debounce(() => {
    if (LS.edit !== x.id) return
    const out = readFields(all, x)
    change((d) => { lsWrite(d, key, lsList(key).map((y) => (y.id === out.id ? out : y))) }, 'ls:' + out.id)
    if (x._d && !$('#lsReset') && $('#lsDone')) { $('#lsDone').insertAdjacentHTML('afterend', '<button class="b" type="button" id="lsReset">' + ICON.undo + 'Back to the original</button>'); wireReset() }
  }, 300)
  $$('#lsF input, #lsF textarea, #lsF select').forEach((el) => { el.addEventListener('input', save); el.addEventListener('change', save) })
  $$('[data-pic]', box).forEach((b) => { b.onclick = () => openPicker((src) => {
    const id = b.dataset.pic
    $('#' + id).value = src; $('#' + id + '_th').style.backgroundImage = "url('" + src + "')"; $('#' + id + '_nm').textContent = src.split('/').pop()
    save()
  }) })
  const back = () => { LS.edit = null; lsDraw(); lsScroll() }
  $('#lsBack').onclick = back; $('#lsDone').onclick = back
  function wireReset() {
    const r = $('#lsReset'); if (!r) return
    r.onclick = () => { change((d) => { lsWrite(d, key, lsList(key).map((y) => (y.id === x.id ? Object.assign(clone(lsDef(key, x.id)), { _d: 1 }) : y))) }); toast('Back to the original.'); lsDraw() }
  }
  wireReset()
  if ($('#lsDel')) $('#lsDel').onclick = () => { change((d) => { lsWrite(d, key, lsList(key).filter((y) => y.id !== x.id)) }); toast('Deleted. Undo at the top brings it back.'); back() }
  const f0 = $('#lsF .in'); if (f0 && !x._d) f0.focus()
}

/* ═══ 中文 WORDING: Chinese for the words the code has none for ═════════
   Headings and the main copy carry Chinese written into the code (data-zh).
   Every other line is read off the real page here and can be given Chinese;
   the site keeps them as one dictionary, English to Chinese, so the same
   words get the same Chinese on every page. A translator can take the lot as
   a spreadsheet and bring it back. */
const ZH = { route: '/', only: 'missing', q: '', scans: {}, busy: false }
const ALLPAGES = '*'
function zhView() {
  $('#main').innerHTML = `<div class="pad wide"><div class="hrow"><div><h1 class="h">中文 wording</h1><p class="lede">Headings and the main copy already switch to Chinese. These are the other lines on each page. Type the Chinese beside the English; the same English gets the same Chinese everywhere on the site.</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="b" type="button" id="zhDl">${ICON.download}Download for a translator</button><button class="b" type="button" id="zhUp">${ICON.upload}Load translations</button><input type="file" id="zhFile" accept=".csv,text/csv" hidden></div></div>
    <div class="zh-bar"><label class="vh" for="zhPg">Page</label><select class="in" id="zhPg">${PAGES.map(([r, t]) => '<option value="' + r + '"' + (r === ZH.route ? ' selected' : '') + '>' + esc(t) + '</option>').join('')}<option value="${ALLPAGES}"${ZH.route === ALLPAGES ? ' selected' : ''}>Every page</option></select>
      <div class="seg" id="zhOnly" role="group" aria-label="Show"><button type="button" data-v="missing" aria-pressed="${ZH.only === 'missing'}">Still in English</button><button type="button" data-v="all" aria-pressed="${ZH.only === 'all'}">All lines</button></div>
      <input class="in" id="zhQ" placeholder="Search the English or 中文" value="${esc(ZH.q)}"></div>
    <div class="zh-sum" id="zhSum"></div>
    <div class="card"><div id="zhList"><div class="empty">Reading the page</div></div></div>
    <iframe id="zhIfr" class="zh-scan" title="Page reader" aria-hidden="true" tabindex="-1"></iframe></div>`
  $('#zhPg').onchange = (e) => { ZH.route = e.target.value; zhLoad() }
  $$('#zhOnly button').forEach((b) => { b.onclick = () => { ZH.only = b.dataset.v; $$('#zhOnly button').forEach((x) => x.setAttribute('aria-pressed', x === b)); zhDraw() } })
  $('#zhQ').addEventListener('input', debounce(() => { ZH.q = $('#zhQ').value; zhDraw() }, 200))
  $('#zhDl').onclick = zhDownload
  $('#zhUp').onclick = () => $('#zhFile').click()
  $('#zhFile').onchange = (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => zhImport(String(r.result)); r.readAsText(f, 'utf-8'); e.target.value = '' }
  zhLoad()
}
async function zhLoad() {
  if (ZH.route !== ALLPAGES) { if (!ZH.scans[ZH.route]) { $('#zhList').innerHTML = '<div class="empty">Reading the page</div>'; await zhScan(ZH.route) } return zhDraw() }
  const todo = PAGES.filter(([r]) => !ZH.scans[r])
  for (let i = 0; i < todo.length; i++) {
    if (S.view !== 'zh' || ZH.route !== ALLPAGES) return
    $('#zhList').innerHTML = '<div class="empty">Reading ' + (i + 1) + ' of ' + todo.length + ': ' + esc(todo[i][1]) + '</div>'
    await zhScan(todo[i][0])
  }
  zhDraw()
}
/* read one page in a hidden frame, in English, and collect its lines */
function zhScan(route) {
  return new Promise((done) => {
    const ifr = $('#zhIfr'); if (!ifr) return done()
    let lang0 = null
    try { lang0 = sessionStorage.getItem('tp-lang'); sessionStorage.setItem('tp-lang', 'en') } catch (e) { /* blocked storage */ }
    const finish = () => {
      try { if (lang0 == null) sessionStorage.removeItem('tp-lang'); else sessionStorage.setItem('tp-lang', lang0) } catch (e) { /* blocked storage */ }
      if ($('#zhIfr')) $('#zhIfr').onload = null
      done()
    }
    ifr.onload = () => {
      let n = 0
      const poll = () => {
        if (!$('#zhIfr')) return finish()
        let w, d
        try { w = ifr.contentWindow; d = ifr.contentDocument } catch (e) { return finish() }
        const root = d && d.getElementById('root')
        if (w && w.__tpCms && root && root.querySelector('main section, main h1, h1') && n > 8) { ZH.scans[route] = zhCollect(w, d, root); return finish() }
        if (++n > 120) { ZH.scans[route] = { rows: [], built: 0, failed: true }; return finish() }
        setTimeout(poll, 150)
      }
      poll()
    }
    ifr.src = route + '?draft=1'
  })
}
const ACRONYM = /^[A-Z0-9][A-Z0-9/&.+\-·' ]*$/
function zhCollect(w, d, root) {
  const c = w.__tpCms, rows = new Map(); let built = 0
  const tw = d.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let t
  while ((t = tw.nextNode())) {
    const p = t.parentElement; if (!p || p.closest('.bmws, script, style, noscript, [data-cms-skip]')) continue
    const en = norm(t.nodeValue)
    if (!en || !/[A-Za-z]{2}/.test(en) || (ACRONYM.test(en) && en.length <= 14)) continue
    if (p.closest('[data-zh]')) { built++; continue }
    const r = rows.get(en)
    if (r) r.n++; else rows.set(en, { en, n: 1, where: c.sec(t) })
  }
  /* field hints (placeholders) are words a visitor reads too */
  root.querySelectorAll('[placeholder]').forEach((el) => {
    const en = norm(el.getAttribute('placeholder'))
    if (!en || !/[A-Za-z]{2}/.test(en) || el.closest('[data-zh]')) return
    const r = rows.get(en)
    if (r) r.n++; else rows.set(en, { en, n: 1, where: c.sec(el), hint: true })
  })
  return { rows: [...rows.values()], built }
}
function zhRows() {
  if (ZH.route !== ALLPAGES) return ((ZH.scans[ZH.route] || {}).rows || []).map((r) => Object.assign({ page: ZH.route }, r))
  const m = new Map()
  PAGES.forEach(([rt]) => ((ZH.scans[rt] || {}).rows || []).forEach((r) => { if (!m.has(r.en)) m.set(r.en, Object.assign({ page: rt }, r)) }))
  return [...m.values()]
}
function zhDraw() {
  const list = $('#zhList'); if (!list) return
  const rows = zhRows(), done = rows.filter((r) => D.zh[r.en]).length
  const built = ZH.route === ALLPAGES ? PAGES.reduce((a, [rt]) => a + ((ZH.scans[rt] || {}).built || 0), 0) : (ZH.scans[ZH.route] || {}).built || 0
  const q = norm(ZH.q).toLowerCase()
  const show = rows.filter((r) => (ZH.only === 'all' || !D.zh[r.en]) && (!q || r.en.toLowerCase().includes(q) || String(D.zh[r.en] || '').toLowerCase().includes(q)))
  $('#zhSum').innerHTML = rows.length
    ? '<b>' + (rows.length - done) + '</b> of ' + rows.length + ' lines ' + (ZH.route === ALLPAGES ? 'on the site' : 'on ' + esc(pageName(ZH.route))) + ' still show in English in 中文. ' + (built ? built + ' more already switch by themselves.' : '')
    : ((ZH.scans[ZH.route] || {}).failed ? 'This page could not be read.' : '')
  list.innerHTML = show.length ? show.slice(0, 400).map((r, i) => '<div class="zrow' + (D.zh[r.en] ? ' done' : '') + '"><div class="en">' + esc(r.en) + '<small>' + esc((ZH.route === ALLPAGES ? pageName(r.page) + ' · ' : '') + zhWhere(r.where) + (r.hint ? ' · hint inside a form field' : '')) + (r.n > 1 ? ' · ' + r.n + ' times' : '') + '</small></div><textarea class="in" rows="' + Math.min(4, Math.max(1, Math.ceil(r.en.length / 60))) + '" data-zi="' + i + '" placeholder="中文">' + esc(D.zh[r.en] || '') + '</textarea></div>').join('') +
      (show.length > 400 ? '<div class="empty">Showing the first 400. Search to find the rest.</div>' : '')
    : '<div class="empty">' + (rows.length ? (ZH.only === 'missing' && !q ? 'Every line here has Chinese.' : 'Nothing matches.') : 'Reading the page') + '</div>'
  $$('textarea[data-zi]', list).forEach((t) => {
    const r = show[+t.dataset.zi]
    t.addEventListener('input', debounce(() => {
      const v = norm(t.value)
      change((d) => { if (v) d.zh[r.en] = v; else delete d.zh[r.en] }, 'zh:' + r.en)
      t.closest('.zrow').classList.toggle('done', !!v)
    }, 350))
  })
}
const zhWhere = (s) => (s === '@nav' ? 'Menu' : s === '@foot' ? 'Footer' : s ? 'Section ' + s : 'Page')
const cell = (s) => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"'
function zhDownload() {
  const rows = zhRows()
  if (!rows.length) return toast('Read a page first: choose one, or Every page.')
  const csv = '﻿' + [['English', '中文', 'Page', 'Where'].map(cell).join(',')].concat(rows.map((r) => [r.en, D.zh[r.en] || '', pageName(r.page), zhWhere(r.where)].map(cell).join(','))).join('\r\n')
  download('tenthpin-chinese-' + (ZH.route === ALLPAGES ? 'every-page' : (pageName(ZH.route) || 'page').toLowerCase().replace(/[^a-z0-9]+/g, '-')) + '.csv', csv, 'text/csv;charset=utf-8')
  toast('Downloaded. Fill the 中文 column, save as CSV UTF-8, then Load translations.')
}
function parseCSV(t) {
  const rows = []; let row = [], f = '', q = false
  t = String(t).replace(/^﻿/, '')
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { f += '"'; i++ } else q = false } else f += ch }
    else if (ch === '"') q = true
    else if (ch === ',') { row.push(f); f = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = '' }
    else f += ch
  }
  if (f || row.length) { row.push(f); rows.push(row) }
  return rows
}
function zhImport(text) {
  const rows = parseCSV(text).filter((r) => r.some((x) => norm(x)))
  if (!rows.length) return toast('That file is empty.')
  const head = rows[0].map((x) => norm(x).toLowerCase())
  let ie = head.indexOf('english'), iz = head.findIndex((x) => x === '中文' || x === 'chinese')
  const body = ie >= 0 || iz >= 0 ? rows.slice(1) : rows
  if (ie < 0) ie = 0; if (iz < 0) iz = 1
  let n = 0
  change((d) => { body.forEach((r) => { const en = norm(r[ie]), zh = norm(r[iz]); if (en && zh && d.zh[en] !== zh) { d.zh[en] = zh; n++ } }) })
  toast(n ? n + ' translation' + (n === 1 ? '' : 's') + ' loaded into the draft. Publish to put them live.' : 'No new translations in that file.')
  zhDraw()
}

/* ═══ SETTINGS ═══════════════════════════════════════════════════════════ */
async function settingsView() {
  const st = D.settings
  $('#main').innerHTML = `<div class="pad"><h1 class="h">Settings</h1><p class="lede">The details the whole website uses.</p>
    <div class="split"><div>
      <div class="card"><div class="card-h"><h3>How people reach you</h3></div><div class="card-b">
        <label class="fld"><span>Email address</span><input class="in" id="s_email" value="${esc(st.email || '')}" placeholder="info@tenthpinmc.com"><small>Changes the address everywhere it is written or linked, and where the booking form sends. Leave empty for info@tenthpinmc.com.</small></label>
        <label class="fld"><span>WhatsApp number</span><input class="in" id="s_wa" value="${esc(st.whatsapp || '')}" placeholder="60123456789"><small>Country code first, digits only. When set, a WhatsApp button appears at the bottom corner of every page.</small></label>
      </div></div>
      <div class="card"><div class="card-h"><h3>The capability drawing on the home page</h3></div><div class="card-b">
        <div class="note" style="margin-bottom:12px">Four styles were built for review. Choose the one that ships.</div>
        <div class="seg" id="s_cap" role="group" aria-label="Drawing style">${[['1', '3D glass'], ['2', 'Flat'], ['3', 'Particles'], ['4', 'Dots']].map(([v, t]) => '<button type="button" data-v="' + v + '" aria-pressed="' + (String(st.capVersion || 4) === v) + '">' + t + '</button>').join('')}</div>
        <label class="chk fld"><input type="checkbox" id="s_capsw"${st.capSwitch === 'off' ? '' : ' checked'}> Show the style switch under the drawing (for reviewing only)</label>
      </div></div>
    </div>
    <div class="card"><div class="card-h"><h3>How each page shows in Google</h3></div><div class="card-b" id="metaBox"><div class="note">Loading the pages</div></div></div>
    </div></div>`
  const save = debounce(() => change((d) => {
    d.settings.email = norm($('#s_email').value); d.settings.whatsapp = $('#s_wa').value.replace(/[^0-9]/g, '')
    d.settings.capSwitch = $('#s_capsw').checked ? 'on' : 'off'
  }, 'settings'), 350)
  ;['#s_email', '#s_wa'].forEach((s) => $(s).addEventListener('input', save))
  $('#s_capsw').onchange = save
  $$('#s_cap button').forEach((b) => { b.onclick = () => { $$('#s_cap button').forEach((x) => x.setAttribute('aria-pressed', x === b)); change((d) => { d.settings.capVersion = +b.dataset.v }); toast('Saved. The home page shows this style after you publish.') } })
  /* the titles as the pages carry them now, as the placeholders */
  const defs = await Promise.all(PAGES.map(async ([r]) => {
    try { const t = await (await fetch(r, { cache: 'no-store' })).text(); const doc = new DOMParser().parseFromString(t, 'text/html'); return [r, doc.title, (doc.querySelector('meta[name="description"]') || {}).content || ''] } catch (e) { return [r, '', ''] }
  }))
  const meta = st.meta || {}
  $('#metaBox').innerHTML = '<div class="note" style="margin-bottom:6px">The blue title and the two lines under it in search results. Leave a field empty to keep what the page has now.</div>' +
    defs.map(([r, t, d]) => '<div style="padding:14px 0;border-top:1px solid var(--line)"><b style="font:600 14px var(--g)">' + esc(pageName(r)) + '</b>' +
      '<label class="fld"><span>Title</span><input class="in" data-mt="' + r + '" value="' + esc((meta[r] || {}).title || '') + '" placeholder="' + esc(t) + '"></label>' +
      '<label class="fld"><span>Description</span><textarea class="in" rows="2" data-md="' + r + '" placeholder="' + esc(d) + '">' + esc((meta[r] || {}).desc || '') + '</textarea></label></div>').join('')
  const saveMeta = debounce(() => change((d) => {
    const m = {}
    $$('[data-mt]').forEach((i) => { const r = i.dataset.mt, t = norm(i.value), ds = norm($('[data-md="' + r + '"]').value); if (t || ds) m[r] = { title: t, desc: ds } })
    d.settings.meta = m
  }, 'meta'), 400)
  $$('[data-mt],[data-md]').forEach((i) => i.addEventListener('input', saveMeta))
}

/* ═══ PUBLISH ════════════════════════════════════════════════════════════ */
function contentFile(obj) {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
  return '/* ============================================================================\n   TENTHPIN MC · SITE CONTENT · published from the site editor on ' + stamp + '\n   Every edit, list, setting, news entry and event the site shows. Edit it in\n   the editor (/portal.html), not by hand. The site reads it before it starts.\n   ========================================================================== */\nwindow.TP_CONTENT = ' + JSON.stringify(obj, null, 2) + ';\n'
}
function parseContent(txt) {
  const m = String(txt).match(/TP_CONTENT\s*=\s*(\{[\s\S]*\})\s*;?\s*$/) || String(txt).match(/^\s*(\{[\s\S]*\})\s*$/)
  if (!m) throw new Error('not a content file')
  return fill(JSON.parse(m[1]))
}
function download(name, text, type) {
  const u = URL.createObjectURL(new Blob([text], { type: type || 'text/javascript' })), a = document.createElement('a')
  a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000)
}
function forPublish() { const o = clone(D); delete o.updatedAt; delete o.publishedAt; return o }
async function publishNow(note) {
  if (!SERVER.writable) {
    download('content.js', contentFile(forPublish()))
    toast('Downloaded content.js. Upload it to assets/content/ on the website host to put it live.')
    return false
  }
  try {
    const r = await fetch('/__cms/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: forPublish(), note: note || '' }) })
    const j = await r.json()
    if (!j.ok) { toast(j.error || 'Publishing failed.'); return false }
    PUB = fill(clone(D)); status()
    toast('Published. The website shows it now.')
    return true
  } catch (e) { toast('Publishing failed: the editor could not reach this computer\'s site server.'); return false }
}
function confirmPublish() {
  const p = pending()
  if (!p.length) return toast('Everything is already live.')
  modal(`<div class="modal-h"><h3>Publish ${p.length} change${p.length === 1 ? '' : 's'}</h3><button class="b sm ghost" type="button" data-close>Close</button></div>
    <div class="modal-b">${SERVER.writable ? '<p class="note">They go live on this website as soon as you press Publish. The version before is kept, so you can always go back.</p>' : '<div class="flag">' + ICON.info + '<span>This copy of the editor cannot write to the website directly. Publish downloads <b>content.js</b>: upload it to <b>assets/content/</b> on the website host and the changes go live.</span></div>'}
      <label class="fld"><span>A note for the history (optional)</span><input class="in" id="pubNote" placeholder="Updated the Contact page wording"></label></div>
    <div class="modal-f"><button class="b" type="button" data-close>Not yet</button><button class="b pri" type="button" id="goPub">${SERVER.writable ? 'Publish now' : 'Download the update'}</button></div>`, (m, close) => {
    $('#goPub', m).onclick = async () => { $('#goPub', m).disabled = true; const ok = await publishNow($('#pubNote', m).value); close(); if (S.view === 'publish') publishView(); if (ok && S.view === 'pages' && $('#ifr')) $('#ifr').src = S.route + '?draft=1&edit=1' }
    setTimeout(() => $('#pubNote', m).focus(), 30)
  })
}
async function publishView() {
  const p = pending()
  $('#main').innerHTML = `<div class="pad"><h1 class="h">Publish</h1><p class="lede">Everything you change is kept as a draft on this computer. Publishing puts it on the website.</p>
    <div class="pubhero"><div><h3>${p.length ? p.length + ' change' + (p.length === 1 ? '' : 's') + ' waiting' : 'Everything is live'}</h3><p>${p.length ? 'Look them over below, then publish.' : 'The website shows exactly what the editor shows.'}</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="b" href="${S.route}?draft=1" target="_blank" rel="noopener">${ICON.open}Preview</a><button class="b pri lg" type="button" id="pubGo"${p.length ? '' : ' disabled'}>${ICON.publish}Publish</button></div></div>
    <div class="card" style="margin-top:18px"><div class="card-h"><h3>What changes</h3></div><div class="list">${p.length ? p.map((x) => {
      if (x.k === 'part') return '<div class="item"><span class="pill">' + ICON.list + '</span><div><b>' + esc(x.name) + '</b><small>Updated</small></div><span></span></div>'
      const e = x.e, what = e.k === 't' ? '“' + short(e.f, 60) + '” → “' + short(e.t, 60) + '”' : e.k === 'i' ? 'Picture ' + e.f.split('/').pop() + ' → ' + String(e.t).split('/').pop() : e.k === 'l' ? 'Link ' + e.f + ' → ' + e.t : 'Hidden: ' + (e.g === '#' ? 'section ' + e.s : short(String(e.g).split('|').slice(1).join(' '), 70))
      return '<div class="item"><span class="pill' + (x.k === 'undone' ? ' off' : '') + '">' + (x.k === 'undone' ? 'Undone' : 'New') + '</span><div><b>' + esc(what) + '</b><small>' + esc(pageName(e.r)) + '</small></div><span></span></div>'
    }).join('') : '<div class="empty">Nothing waiting.</div>'}</div></div>
    <div class="card"><div class="card-h"><h3>Earlier versions</h3>${SERVER.writable ? '' : '<span class="muted">Kept by the editor on the computer the site is built on</span>'}</div><div id="hist">${SERVER.writable ? '<div class="empty">Loading</div>' : '<div class="empty">Every publish on the build computer keeps the version before it, and any of them can be restored there.</div>'}</div></div>
    <div class="card"><div class="card-h"><h3>Move the content</h3></div><div class="list">
      <div class="item nt"><div><b>Download the content file</b><small>content.js with everything in the draft. Upload it to assets/content/ on a website host.</small></div><button class="b sm" type="button" id="dlIt">${ICON.download}Download</button></div>
      <div class="item nt"><div><b>Open a content file</b><small>Load a content.js someone sent you into the draft, to check it before publishing.</small></div><button class="b sm" type="button" id="imIt">${ICON.upload}Open</button><input type="file" id="imFile" accept=".js,.json" hidden></div>
      <div class="item nt"><div><b>Throw the draft away</b><small>Go back to what the website shows now.</small></div><button class="b sm bad" type="button" id="rvIt"${p.length ? '' : ' disabled'}>Throw away</button></div>
    </div></div></div>`
  $('#pubGo').onclick = confirmPublish
  $('#dlIt').onclick = () => download('content.js', contentFile(forPublish()))
  $('#imIt').onclick = () => $('#imFile').click()
  $('#imFile').onchange = (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { const obj = parseContent(r.result); change((d) => { Object.assign(d, obj) }); toast('Opened into the draft. Publish to make it live.'); publishView() } catch (x) { toast('That is not a content file.') } }; r.readAsText(f) }
  $('#rvIt').onclick = () => { if (confirm('Throw away every change that is not live yet?')) { change((d) => { Object.keys(d).forEach((k) => delete d[k]); Object.assign(d, clone(PUB)) }); toast('Draft thrown away. Undo at the top brings it back.'); publishView() } }
  if (SERVER.writable) {
    try {
      const j = await (await fetch('/__cms/history', { cache: 'no-store' })).json()
      const items = j.items || []
      $('#hist').innerHTML = items.length ? items.map((v, i) => '<div class="ver"><div><b>' + esc(fmtWhen(v.when * 1000)) + (i === 0 ? ' · live now' : '') + '</b><small>' + esc(v.note || 'Published') + '</small></div><div style="display:flex;gap:6px"><button class="b sm" type="button" data-look="' + esc(v.name) + '">Restore</button></div></div>').join('') : '<div class="empty">No earlier versions yet. Each publish keeps one.</div>'
      $$('[data-look]').forEach((b) => { b.onclick = async () => {
        const txt = await (await fetch('/__cms/history/' + encodeURIComponent(b.dataset.look), { cache: 'no-store' })).text()
        try { const obj = parseContent(txt); change((d) => { Object.keys(d).forEach((k) => delete d[k]); Object.assign(d, obj) }); toast('That version is now your draft. Publish to put it back on the website.'); publishView() } catch (e) { toast('That version could not be read.') }
      } })
    } catch (e) { $('#hist').innerHTML = '<div class="empty">The history could not be loaded.</div>' }
  }
}

/* ═══ HELP ═══════════════════════════════════════════════════════════════ */
function helpView() {
  $('#main').innerHTML = `<div class="pad"><h1 class="h">How the editor <em>works</em></h1><p class="lede">Three steps: change, check, publish.</p>
    <div class="split"><div>
      <div class="card"><div class="card-h"><h3>1 · Change</h3></div><div class="card-b note">
        <p>Open <b>Pages</b>, choose a page, and click the thing you want to change. Words change as you type. Blue words stay blue. For a picture, press Replace picture and choose one, or drop a new one in. For a button, change where it goes. Anything can be hidden, and brought back.</p>
        <p style="margin-top:10px">Lists have their own screens, where you can also add, hide and reorder: <b>Past events</b>, <b>People</b>, <b>Client logos</b>, <b>Questions</b>, <b>News and insights</b> and <b>Coming-up events</b>. Contact details, the WhatsApp button and how pages show in Google are in <b>Settings</b>.</p></div></div>
      <div class="card"><div class="card-h"><h3>2 · Check</h3></div><div class="card-b note">
        <p>Everything you do shows at once in the page on screen, and is kept as a draft in this browser. Switch between computer, tablet and phone sizes at the top of Pages. <b>Preview</b> opens the page with your draft in a new tab. <b>Undo</b> steps back through every change.</p></div></div>
      <div class="card"><div class="card-h"><h3>3 · Publish</h3></div><div class="card-b note">
        <p>Press <b>Publish</b>. On the computer the website is built on, the change goes live straight away and the version before it is kept under Publish, Earlier versions. On any other copy, Publish downloads <b>content.js</b> to upload to <b>assets/content/</b> on the host.</p></div></div>
    </div><div class="stick"><div class="card"><div class="card-h"><h3>Good to know</h3></div><div class="card-b note">
      <p><b>Changing the English does not change the 中文.</b> Switch to 中文 at the top of Pages and change the Chinese there, or use <b>中文 wording</b> for everything at once.</p>
      <p style="margin-top:10px"><b>Where a change applies.</b> Words in the menu and footer change on every page. Elsewhere, choose this section or the whole page.</p>
      <p style="margin-top:10px"><b>If a change stops showing,</b> the original words were rewritten in the code. It is listed under Changes on this page with a warning, so you can redo it.</p>
      <p style="margin-top:10px"><b>Shortcuts:</b> Cmd Z undo, Shift Cmd Z redo, Esc to deselect.</p>
    </div></div></div></div></div>`
}

/* ── what the tests (tools/qa-0910/portal-test.mjs) reach in through ─── */
const API = { $, $$, esc, clone, uid, norm, short, debounce, ICON, PAGES, change, toast, modal, openPicker, field, readFields, lines, get D() { return D }, get PUB() { return PUB }, get sel() { return F.sel }, go, server: SERVER }

/* ── start ─────────────────────────────────────────────────────────── */
function start() {
  $('#welcome').hidden = true; $('#app').hidden = false
  try { localStorage.setItem('tpcms_in', '1'); sessionStorage.setItem('tplSeen', '1') } catch (e) { /* private window */ }
  $('#undoBtn').innerHTML = ICON.undo + '<span class="vh">Undo</span>'; $('#redoBtn').innerHTML = ICON.redo + '<span class="vh">Redo</span>'
  $('#undoBtn').onclick = undo; $('#redoBtn').onclick = redo
  $('#publishBtn').onclick = confirmPublish
  $('#previewBtn').onclick = () => window.open(S.route + '?draft=1', '_blank', 'noopener')
  const q = new URLSearchParams((location.hash.split('?')[1] || '') || location.search)
  const page = q.get('page')
  if (page) S.route = ALIAS[page] || page
  /* on a phone the page is shown at phone size, so it can be read and clicked */
  if (window.innerWidth < 900) S.device = 'phone'
  const v = (location.hash.slice(1).split('?')[0]) || 'pages'
  S.view = VIEWS.some((x) => x[0] === v) ? v : 'pages'
  drawNav(); rerender(); status(); checkServer()
  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase(), typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)
    if ((e.metaKey || e.ctrlKey) && k === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo() }
    if ((e.metaKey || e.ctrlKey) && k === 's') { e.preventDefault(); toast('Your work saves by itself as a draft. Press Publish to put it live.') }
    if (e.key === 'Escape' && F.sel && !$('#modal').innerHTML) { F.sel = null; hideBox(F.sb); inspector() }
  })
  window.addEventListener('storage', (e) => { if (e.key === 'tpcms_draft' && e.newValue) { const d = loadDraft(); if (d) { D = d; toFrame(); status() } } })
}
/* 23 Sep 2026 (Bazil: "edit suppose to be at the portal login"): the Edit tab
   carries ?page= so the editor opens on the page you were reading, and that
   used to walk straight past the front door; being remembered per browser
   walked past it too. The portal now always opens on its Go in screen, and the
   page you came from is carried through it, so one click lands you where you
   were. A deep link to a view (#people) still opens straight into that view. */
const direct = /^#[a-z]/.test(location.hash)
if (direct) start()
else { $('#welcome').hidden = false; $('#goIn').onclick = start; $('#goIn').focus() }
window.TPE = API
})()
