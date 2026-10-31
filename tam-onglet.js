/* tam-onglet.js — TAM phase C : l onglet TAM (le DOM, le canvas, les gestes, le son). Importe par app.html A L OUVERTURE de l onglet.
 *   La logique prouvee vit dans tam-vue.js (projection, couches, verdict du rejeu, carte, regle du Mint) et tam-plan.js (le plan du mint).
 *   ⛔ Rien n est signe ici : le mint passe par le « Pay with » de l app (ctx.preparer / ctx.envoyer), que le WALLET signe.
 *   ⛔ Sans adresse TamArt (tamart-deploiement.js), AUCUN bouton Mint : une phrase dans « How it works », pas un controle inerte. */
import { generer, certifier, rejouer, decoder } from './tam-moteur.js';
import { PORTEUSES } from './tam-moteur.js';
import * as V from './tam-vue.js';
import { adresseTam, PRIX_TAM, SIG_TAM, appelLecture, decoderBytes, decoderMot, decoderAdresse, octetsDe } from './tam-plan.js';
import { TAMART_DEPLOIEMENT } from './tamart-deploiement.js';
import { planJeuUsdc } from './misables.js';
import { projectCam } from './map3d.js';
import { navGesture } from './vision-inside.js';
import { keccak256Hex } from './keccak.js';
import { FEE_WALLET } from './frais-creation.js';

const CSS = `
#v-tam{--tam-fond:#0b0d17;--tam-carte:rgba(255,255,255,.04);--tam-bord:rgba(255,255,255,.12);--tam-txt:#e8ecf5;--tam-doux:#9aa3b8;--tam-acc:#7fd1ff}
#v-tam .tamCarte{background:var(--tam-carte);border:1px solid var(--tam-bord);border-radius:14px;padding:14px;margin:0 0 14px}
#v-tam h2{font-size:1.15rem;margin:0 0 4px}#v-tam h3{font-size:1rem;margin:0 0 8px}
#v-tam .tamDoux{color:var(--tam-doux);font-size:.86rem;margin:4px 0}
#v-tam .tamRang{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0}
#v-tam button,#v-tam select{min-height:44px;min-width:44px;border-radius:10px;border:1px solid var(--tam-bord);background:rgba(255,255,255,.06);color:var(--tam-txt);padding:0 12px;font:inherit;font-size:.92rem;max-width:100%}
#v-tam button[aria-pressed="true"]{background:rgba(127,209,255,.18);border-color:var(--tam-acc)}
#v-tam .tamPrim{background:var(--tam-acc);color:#06121d;border-color:var(--tam-acc);font-weight:600}
#v-tam .tamScene{position:relative;width:100%;aspect-ratio:1/1;max-height:62vh;border-radius:12px;overflow:hidden;background:var(--tam-fond);touch-action:none}
#v-tam .tamScene canvas{width:100%;height:100%;display:block}
#v-tam .tamInfo{position:absolute;left:8px;top:6px;font-size:.78rem;color:var(--tam-doux);pointer-events:none}
#v-tam .tamPuces{display:flex;flex-wrap:wrap;gap:6px}
#v-tam .tamPuce{display:inline-flex;align-items:center;gap:6px}
#v-tam .tamPuce i{width:12px;height:12px;border-radius:50%;display:inline-block}
#v-tam .tamPuce[aria-pressed="false"]{opacity:.45}
#v-tam input[type=range]{width:100%;min-height:44px}
#v-tam .tamSeries{width:100%;height:120px;display:block;background:var(--tam-fond);border-radius:10px}
#v-tam .tamGrille{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:6px;margin-top:8px}
#v-tam .tamGrille figure{margin:0;background:var(--tam-fond);border-radius:8px;overflow:hidden}
#v-tam .tamGrille canvas{width:100%;aspect-ratio:1/1;display:block}
#v-tam .tamGrille figcaption{font-size:.72rem;color:var(--tam-doux);padding:2px 6px}
#v-tam dl{display:grid;grid-template-columns:minmax(90px,34%) 1fr;gap:6px 10px;margin:0}#v-tam dt{color:var(--tam-doux);font-size:.85rem}#v-tam dd{margin:0;font-size:.9rem;overflow-wrap:anywhere}
#v-tam .tamGal{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
#v-tam .tamOeuvre canvas{width:100%;aspect-ratio:1/1;background:var(--tam-fond);border-radius:8px;display:block}
#v-tam .tamBadge{font-weight:600}#v-tam .tamBadge.ok{color:#7ee2a8}#v-tam .tamBadge.ko{color:#ff8a8a}
#v-tam .tamSigne{border:1px dashed var(--tam-acc);border-radius:10px;padding:10px;margin:8px 0;font-size:.88rem;overflow-wrap:anywhere}
#v-tam details summary{min-height:44px;display:flex;align-items:center;cursor:pointer}
#v-tam *{box-sizing:border-box}#v-tam{overflow-x:hidden}
`;

const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v === true ? '' : v); }
  for (const k of kids) if (k) e.append(k);
  return e;
};
const reduit = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };
const hexDe = (u8) => '0x' + [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * @param {HTMLElement} racine  le conteneur de l onglet (#tamRacine)
 * @param {object} ctx  { rpc, compte(), payer: { lignes(), taille(l, usdc), soldes, dec, sym(l), qte(brut, dec), lire(moi) }, preparer(o), envoyer(pj, c, dit) }
 */
export function monter(racine, ctx = {}) {
  if (racine.dataset.tamMonte === '1') return racine.__tam;
  racine.dataset.tamMonte = '1';
  if (!document.getElementById('tamCss')) document.head.append(el('style', { id: 'tamCss', text: CSS }));
  const S = { P: null, o: null, c: null, choix: null, z: null, n: 0, D: 0, couches: null, t: 0, rotation: !reduit(), dessines: 0, cam: null, survol: null,
    sale: true, son: null, dom: null, ser: null, nMintees: 0 };

  /* ── l explorateur ── */
  const selFam = el('select', { 'aria-label': 'Family', id: 'tamFamille' }, ...PORTEUSES.map((f) => el('option', { value: f, text: V.nomFamille(f) })));
  const selDim = el('select', { 'aria-label': 'Dimensions', id: 'tamDims' });
  const bCerveau = el('button', { type: 'button', id: 'tamCerveau', text: 'Let the brain choose' });
  const bRot = el('button', { type: 'button', id: 'tamRotation', 'aria-pressed': String(S.rotation), text: 'Hidden rotation' });
  const bVue = el('button', { type: 'button', text: 'Reset view' });
  const bSon = el('button', { type: 'button', id: 'tamSon', 'aria-pressed': 'false', text: 'Sound: off' });
  const cv = el('canvas', { id: 'tamCanvas', 'aria-label': 'The work in 3-D' });
  const info = el('div', { class: 'tamInfo' });
  const scene = el('div', { class: 'tamScene' }, cv, info);
  const etatLigne = el('p', { class: 'tamDoux', id: 'tamEtat', 'aria-live': 'polite' });

  /* ── les couches ── */
  const curseur = el('input', { type: 'range', min: '2', max: '3', step: '1', value: '3', id: 'tamCurseur', 'aria-label': 'Dimensions shown' });
  const curseurTxt = el('span', { class: 'tamDoux' });
  const puces = el('div', { class: 'tamPuces', id: 'tamPuces', role: 'group', 'aria-label': 'Layers' });
  const bToutes = el('button', { type: 'button', text: 'All layers' });
  const bIsoler = el('button', { type: 'button', 'aria-pressed': 'false', text: 'Isolate' });
  const cvSeries = el('canvas', { class: 'tamSeries', 'aria-label': 'Each layer over time' });
  const grille = el('div', { class: 'tamGrille', id: 'tamGrille' });
  const eclate = el('details', {}, el('summary', { text: 'Exploded view: every pair of layers' }), grille);

  const dl = el('dl', { id: 'tamCarteOeuvre' });
  const zMint = el('div', { id: 'tamMint', hidden: true });
  const gal = el('div', { class: 'tamGal', id: 'tamGalerie' });
  const galEtat = el('p', { class: 'tamDoux', id: 'tamGalerieEtat' });

  racine.replaceChildren(
    el('div', { class: 'tamCarte' },
      el('h2', { text: 'TAM — math art' }),
      el('p', { class: 'tamDoux', text: 'Strange attractors, fractals and the golden angle, combined by the brain and drawn in 3-D. Up to 12 dimensions, shown one layer at a time.' }),
      el('div', { class: 'tamRang' }, selFam, selDim, bCerveau),
      scene,
      el('div', { class: 'tamRang' }, bRot, bVue, bSon),
      el('p', { class: 'tamDoux', text: 'Drag to orbit · Shift-drag or two fingers to pan · wheel or pinch to zoom.' }),
      etatLigne),
    el('div', { class: 'tamCarte' },
      el('h3', { text: 'Layers' }),
      el('p', { class: 'tamDoux', text: 'One colour per dimension. Turn layers on and off, isolate one, or grow the shape from 3-D to all of its dimensions.' }),
      curseur, curseurTxt, puces, el('div', { class: 'tamRang' }, bToutes, bIsoler), cvSeries, eclate),
    el('div', { class: 'tamCarte' }, el('h3', { text: 'This work' }), dl, zMint),
    el('div', { class: 'tamCarte' }, el('h3', { text: 'Minted works' }), galEtat, gal,
      el('details', {}, el('summary', { text: 'How it works' }), el('p', { class: 'tamDoux', text: 'Each work is stored on Base byte for byte, with its seed and parameters. Anyone can replay the parameters in this page and compare the result with the stored bytes. Minting costs 5 USDC, paid to the TokenizedBlock fee wallet; it opens when the TamArt contract is deployed.' }))));

  /* ── charger une oeuvre (params) ── */
  function charger(P, choix = null, octetsServeur = null) {
    let o;
    try { o = generer(P); } catch (e) { etatLigne.textContent = 'This combination could not be computed.'; return; }
    if (!o.bornee) { etatLigne.textContent = 'This combination escapes to infinity: nothing to draw.'; return; }
    S.P = o.params; S.o = o; S.D = o.D; S.n = o.n; S.choix = choix;
    S.c = certifier(o, []);
    S.z = V.standardiser(o.brut, o.n, o.D); S.ser = V.series(S.z, o.n, o.D);
    S.couches = V.etatCouches(S.D); S.t = 0; S.dessines = reduit() ? S.n : 0; S.survol = null;
    S.octets = octetsServeur; S.stocke = (() => { try { const d = decoder(octetsDe(octetsServeur) || rejouer(P).octets); return d.positions; } catch (_) { return null; } })();
    curseur.min = String(Math.min(S.D, 2)); curseur.max = String(S.D); curseur.value = String(S.D);
    peindrePuces(); peindreCarte(); peindreGrille(); peindreMint();
    etatLigne.textContent = V.combinaison(S.P) + '.';
    racine.dataset.dims = String(S.D);
    S.sale = true;
  }
  function optionsDims() {
    const f = selFam.value, o = [];
    if (f === 'lorenz96') o.push(['6', '6-D'], ['8', '8-D'], ['12', '12-D']);
    else if (f === 'clifford' || f === 'dejong') o.push(['1', '2-D map']);
    else o.push(['1', '3-D'], ['2', '6-D (2 coupled)'], ['3', '9-D (3 coupled)'], ['4', '12-D (4 coupled)']);
    selDim.replaceChildren(...o.map(([v, t]) => el('option', { value: v, text: t })));
  }
  function depuisExplorateur() {
    const f = selFam.value, d = Number(selDim.value);
    charger(V.paramsExplorateur({ famille: f, copies: f === 'lorenz96' ? 1 : d, dim96: d }));
  }
  selFam.addEventListener('change', () => { optionsDims(); depuisExplorateur(); });
  selDim.addEventListener('change', depuisExplorateur);
  bCerveau.addEventListener('click', async () => {
    etatLigne.textContent = 'The brain is choosing from the latest block…';
    let j = null;
    try { j = await fetch('/api/tam/choix', { cache: 'no-store' }).then((r) => r.json()); } catch (_) { j = null; }
    if (!j || j.ok !== true) { etatLigne.textContent = 'The brain\'s choice could not be read' + (j && j.pourquoi ? ': ' + j.pourquoi : '') + '.'; return; }
    S.nMintees = Number(j.comparees) || 0;
    /* les selecteurs disent la porteuse choisie (pas l ancienne selection) */
    selFam.value = j.params.famille; optionsDims();
    selDim.value = j.params.famille === 'lorenz96' ? String(j.params.dim) : j.params.operateur === 'couplage' ? String(j.params.k) : '1';
    charger(j.params, { graine: j.graine, bloc: j.bloc, cerveau: j.cerveau, empreinteEtat: j.empreinteEtat, essai: j.params.essai, rejets: j.rejets, certificats: j.certificats }, j.octets);
  });

  /* ── couches ── */
  function peindrePuces() {
    puces.replaceChildren(...S.couches.actives.map((a, j) => el('button', { type: 'button', class: 'tamPuce', 'aria-pressed': String(a), 'data-dim': String(j), 'aria-label': 'Layer x' + (j + 1) },
      el('i', { style: 'background:' + V.couleurDim(j) }), document.createTextNode('x' + (j + 1)))));
    const v = V.dimsVisibles(S.couches).length;
    curseurTxt.textContent = v + ' of ' + S.D + ' dimensions shown';
    racine.dataset.visibles = V.dimsVisibles(S.couches).join(',');
  }
  puces.addEventListener('click', (e) => {
    const b = e.target.closest('[data-dim]'); if (!b) return;
    const j = Number(b.getAttribute('data-dim'));
    S.couches = bIsoler.getAttribute('aria-pressed') === 'true' ? V.isoler(S.couches, j) : V.basculer(S.couches, j);
    peindrePuces(); peindreGrille(); majSon(); S.sale = true;
  });
  bToutes.addEventListener('click', () => { S.couches = V.toutes(S.couches); curseur.value = String(S.D); peindrePuces(); peindreGrille(); majSon(); S.sale = true; });
  bIsoler.addEventListener('click', () => bIsoler.setAttribute('aria-pressed', String(bIsoler.getAttribute('aria-pressed') !== 'true')));
  curseur.addEventListener('input', () => { S.couches = V.jusqua(S.couches, Number(curseur.value)); peindrePuces(); peindreGrille(); majSon(); S.sale = true; });

  /* ── rotation, camera ── */
  bRot.addEventListener('click', () => { S.rotation = !S.rotation; bRot.setAttribute('aria-pressed', String(S.rotation)); racine.dataset.rotation = S.rotation ? 'on' : 'off'; S.sale = true; });
  racine.dataset.rotation = S.rotation ? 'on' : 'off';
  bVue.addEventListener('click', () => { S.cam = null; S.t = 0; S.sale = true; });
  const CAM0 = { yaw: 0.6, pitch: 0.35, dist: 1.7, ox: 0, oy: 0 };
  const ptrs = new Map(); let pinch = null;
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, shift: e.shiftKey || e.button === 2 }); });
  cv.addEventListener('pointerup', (e) => { ptrs.delete(e.pointerId); pinch = null; });
  cv.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); pinch = null; });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) { survolScene(e); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch !== null) S.cam = navGesture(S.cam, CAM0, { dz: (pinch - d) / 30 });
      pinch = d; S.cam = navGesture(S.cam, CAM0, { dx: dx / 2, dy: dy / 2, pan: true });
    } else S.cam = navGesture(S.cam, CAM0, { dx, dy, pan: p.shift });
    S.sale = true;
  });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); S.cam = navGesture(S.cam, CAM0, { dz: Math.sign(e.deltaY) }); S.sale = true; }, { passive: false });

  /* ── dessin 3-D ── */
  let proj = null, projSx = null, projSy = null, dominant = null;
  function positions() {
    const tous = S.couches.actives.every(Boolean);
    if (tous && S.t === 0 && S.stocke && S.stocke.length === S.n * 3) return S.stocke; /* arrete, toutes couches : l oeuvre STOCKEE */
    return V.projeterVivant({ z: S.z, n: S.n, D: S.D, actives: S.couches.actives, angles: S.P.angles, t: S.t });
  }
  function dimDominante() {
    const d = new Int8Array(S.n), act = S.couches.actives;
    for (let i = 0; i < S.n; i++) { let b = -1, m = -1; for (let j = 0; j < S.D; j++) if (act[j]) { const v = Math.abs(S.z[i * S.D + j]); if (v > m) { m = v; b = j; } } d[i] = b; }
    return d;
  }
  function dessiner() {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1), L = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== L || cv.height !== H) { cv.width = L; cv.height = H; }
    const g = cv.getContext('2d'); g.fillStyle = '#0b0d17'; g.fillRect(0, 0, L, H);
    if (!S.o) return;
    const cam = S.cam || CAM0, pos = positions(); proj = pos; dominant = dimDominante();
    const sc = Math.min(L, H) * 0.42, n = Math.min(S.n, Math.max(2, Math.floor(S.dessines)));
    projSx = new Float32Array(S.n); projSy = new Float32Array(S.n);
    const pz = new Float32Array(S.n);
    /* la camera du cerveau (navGesture) : dist en multiples de l echelle de la scene, pan en px ecran */
    const camPx = { ...cam, dist: cam.dist * sc, ox: (cam.ox || 0) * dpr, oy: (cam.oy || 0) * dpr };
    for (let i = 0; i < S.n; i++) {
      const u = projectCam(camPx, pos[3 * i] * sc, -pos[3 * i + 1] * sc, pos[3 * i + 2] * sc, L, H, 1);
      projSx[i] = u ? u.sx : NaN; projSy[i] = u ? u.sy : NaN; pz[i] = u ? u.zc : 0;
    }
    const nuage = S.P.ordre === 1;
    g.lineWidth = Math.max(1, dpr * 1.1); g.lineCap = 'round';
    let cour = -2;
    g.beginPath();
    for (let i = 1; i < n; i++) {
      if (!Number.isFinite(projSx[i]) || !Number.isFinite(projSx[i - 1])) continue;
      const c = dominant[i];
      if (c !== cour) { g.stroke(); g.beginPath(); g.strokeStyle = c >= 0 ? V.couleurDim(c) : '#556'; g.globalAlpha = 0.8; cour = c; g.moveTo(projSx[i - 1], projSy[i - 1]); }
      if (nuage) { g.moveTo(projSx[i], projSy[i]); g.lineTo(projSx[i] + 0.6, projSy[i]); } else g.lineTo(projSx[i], projSy[i]);
    }
    g.stroke(); g.globalAlpha = 1;
    if (S.survol !== null && Number.isFinite(projSx[S.survol])) { g.fillStyle = '#fff'; g.beginPath(); g.arc(projSx[S.survol], projSy[S.survol], 5 * dpr, 0, 2 * Math.PI); g.fill(); }
    info.textContent = S.D + '-D · ' + V.dimsVisibles(S.couches).length + ' layers on' + (S.rotation && S.D > 3 ? ' · hidden planes turning' : '') + (S.t === 0 && S.stocke && S.couches.actives.every(Boolean) ? ' · stored view' : ' · live view');
  }
  function survolScene(e) {
    if (!projSx) return;
    const r = cv.getBoundingClientRect(), k = cv.width / r.width;
    const i = V.indexProche(projSx, projSy, (e.clientX - r.left) * k, (e.clientY - r.top) * k, 16 * k);
    if (i !== S.survol) { S.survol = i; S.sale = true; peindreSurvol(); }
  }

  /* ── series et grille eclatee (memes couleurs, meme point survole) ── */
  function peindreSeries() {
    const r = cvSeries.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1), L = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
    if (cvSeries.width !== L || cvSeries.height !== H) { cvSeries.width = L; cvSeries.height = H; }
    const g = cvSeries.getContext('2d'); g.clearRect(0, 0, L, H); if (!S.ser) return;
    const n = Math.min(S.n, Math.max(2, Math.floor(S.dessines)));
    for (const j of V.dimsVisibles(S.couches)) {
      g.strokeStyle = V.couleurDim(j); g.lineWidth = dpr; g.beginPath();
      for (let i = 0; i < n; i += 2) { const x = (i / (S.n - 1)) * L, y = H - 4 - S.ser[j][i] * (H - 8); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
    }
    if (S.survol !== null) { const x = (S.survol / (S.n - 1)) * L; g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  }
  let panneaux = [];
  function peindreGrille() {
    const paires = V.pairesVisibles(S.couches);
    panneaux = paires.map(([a, b]) => { const c = el('canvas', { 'data-paire': a + ',' + b }); return { a, b, c, f: el('figure', {}, c, el('figcaption', { text: 'x' + (a + 1) + ' · x' + (b + 1) })) }; });
    grille.replaceChildren(...panneaux.map((p) => p.f));
    racine.dataset.panneaux = String(panneaux.length);
    peindrePanneaux();
  }
  function peindrePanneaux() {
    if (!eclate.open || !S.ser) return;
    const n = Math.min(S.n, Math.max(2, Math.floor(S.dessines)));
    for (const p of panneaux) {
      const T = 160; if (p.c.width !== T) { p.c.width = T; p.c.height = T; }
      const g = p.c.getContext('2d'); g.fillStyle = '#0b0d17'; g.fillRect(0, 0, T, T);
      const A = S.ser[p.a], B = S.ser[p.b];
      g.fillStyle = V.couleurDim(p.a); for (let i = 0; i < n; i += 2) g.fillRect(4 + A[i] * (T - 8), T - 4 - B[i] * (T - 8), 1.2, 1.2);
      if (S.survol !== null) { g.fillStyle = '#fff'; g.beginPath(); g.arc(4 + A[S.survol] * (T - 8), T - 4 - B[S.survol] * (T - 8), 4, 0, 2 * Math.PI); g.fill(); }
    }
  }
  eclate.addEventListener('toggle', peindrePanneaux);
  grille.addEventListener('pointermove', (e) => {
    const c = e.target.closest('canvas[data-paire]'); if (!c || !S.ser) return;
    const [a, b] = c.getAttribute('data-paire').split(',').map(Number), r = c.getBoundingClientRect(), T = c.width, k = T / r.width;
    const A = S.ser[a], B = S.ser[b], xs = new Float32Array(S.n), ys = new Float32Array(S.n);
    for (let i = 0; i < S.n; i++) { xs[i] = 4 + A[i] * (T - 8); ys[i] = T - 4 - B[i] * (T - 8); }
    const i = V.indexProche(xs, ys, (e.clientX - r.left) * k, (e.clientY - r.top) * k, 10);
    if (i !== S.survol) { S.survol = i; S.sale = true; peindreSurvol(); }
  });
  function peindreSurvol() { racine.dataset.survol = S.survol === null ? '' : String(S.survol); peindreSeries(); peindrePanneaux(); }

  /* ── la carte ── */
  function peindreCarte() {
    const c = S.choix && S.choix.certificats ? { ...S.c, ...S.choix.certificats } : S.c;
    const lignes = V.carte({ P: S.P, c, choix: S.choix, nMintees: S.choix ? S.nMintees : 0 });
    dl.replaceChildren(...lignes.flatMap((l) => [el('dt', { text: l.k }), el('dd', { text: l.v })]));
  }

  /* ── le son (optionnel, coupe par defaut) ── */
  function majSon() {
    if (!S.son) return;
    const vis = new Set(V.dimsVisibles(S.couches));
    S.son.voix.forEach((v, j) => v.g.gain.setTargetAtTime(vis.has(j) ? 0.03 : 0, S.son.ctx.currentTime, 0.05));
  }
  function arreterSon() { if (S.son) { try { S.son.ctx.close(); } catch (_) { /* rien */ } S.son = null; } bSon.setAttribute('aria-pressed', 'false'); bSon.textContent = 'Sound: off'; }
  bSon.addEventListener('click', () => {
    if (S.son) { arreterSon(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC || !S.o) return;
    const ctx = new AC(), maitre = ctx.createGain(); maitre.gain.value = 0.5; maitre.connect(ctx.destination);
    const GAMME = [0, 2, 4, 7, 9]; /* pentatonique : chaque dimension une voix */
    const voix = Array.from({ length: Math.min(S.D, 12) }, (_, j) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
      o.frequency.value = 196 * 2 ** ((GAMME[j % 5] + 12 * Math.floor(j / 5)) / 12); g.gain.value = 0; o.connect(g); g.connect(maitre); o.start();
      return { o, g, f0: o.frequency.value };
    });
    S.son = { ctx, voix }; bSon.setAttribute('aria-pressed', 'true'); bSon.textContent = 'Sound: on'; majSon();
  });

  /* ── la boucle : seulement onglet visible et page visible ── */
  let dernier = 0, idx = 0;
  function boucle(ts) {
    requestAnimationFrame(boucle);
    const vol = racine.closest('.volet');
    if (document.hidden || (vol && !vol.classList.contains('on'))) { if (S.son) arreterSon(); return; }
    const dt = dernier ? Math.min(0.1, (ts - dernier) / 1000) : 0; dernier = ts;
    if (S.o && S.dessines < S.n) { S.dessines = Math.min(S.n, S.dessines + S.n * dt / 3); S.sale = true; }
    if (S.o && S.rotation && S.D > 3) { S.t += dt * 0.35; S.sale = true; racine.dataset.t = S.t.toFixed(3); }
    if (S.son && S.ser) { idx = (idx + 1) % S.n; const vis = new Set(V.dimsVisibles(S.couches)); S.son.voix.forEach((v, j) => { v.o.frequency.setTargetAtTime(v.f0 * (0.85 + 0.3 * S.ser[j][idx]), S.son.ctx.currentTime, 0.03); if (!vis.has(j)) v.g.gain.value = 0; }); }
    if (S.sale) { S.sale = false; dessiner(); peindreSeries(); if (S.dessines < S.n || S.rotation) peindrePanneaux(); }
  }
  requestAnimationFrame(boucle);
  new ResizeObserver(() => { S.sale = true; }).observe(scene);

  /* ── le Mint (seulement adresse connue ; seulement une oeuvre choisie par le cerveau) ── */
  function peindreMint() {
    const visible = V.mintVisible(TAMART_DEPLOIEMENT) && !!(S.choix && S.octets);
    zMint.hidden = !visible; racine.dataset.mint = visible ? 'on' : 'off';
    if (!visible) { zMint.replaceChildren(); return; }
    const selPay = el('select', { 'aria-label': 'Pay with', id: 'tamPayer' }, el('option', { value: 'usdc', text: 'USDC' }));
    const dit = el('p', { class: 'tamDoux', 'aria-live': 'polite' });
    const signe = el('div', { class: 'tamSigne', hidden: true });
    const bMint = el('button', { type: 'button', class: 'tamPrim', id: 'tamMintBouton', text: 'Mint this work — 5 USDC' });
    zMint.replaceChildren(el('div', { class: 'tamRang' }, el('label', { class: 'tamDoux', for: 'tamPayer', text: 'Pay with' }), selPay, bMint), signe, dit);
    void optionsPayer(selPay);
    bMint.addEventListener('click', () => preparerMint({ selPay, signe, dit }));
  }
  async function optionsPayer(sel) {
    const P = ctx.payer, c = ctx.compte && ctx.compte();
    if (!P || !c) return;
    try { await P.lire(String(c).toLowerCase()); } catch (_) { return; }
    for (const l of P.lignes()) {
      const e = P.taille(l, PRIX_TAM), s = P.soldes.get(l.jeton), d = P.dec.get(l.jeton);
      if (!e.ok || s == null || d == null || s < e.est) continue;
      sel.append(el('option', { value: l.jeton, text: P.sym(l) + ' — about ' + P.qte(e.est, d) + ' for 5 USDC' }));
    }
  }
  async function lireContrat(contrat) {
    const lire = async (sig) => ctx.rpc('eth_call', [appelLecture(contrat, sig), 'latest']);
    const [p, b, u] = await Promise.all([lire(SIG_TAM.PRICE), lire(SIG_TAM.beneficiaire), lire(SIG_TAM.USDC)]);
    return { prix: BigInt(decoderMot(p)), beneficiaire: decoderAdresse(b), usdc: decoderAdresse(u) };
  }
  async function preparerMint({ selPay, signe, dit }) {
    const c = ctx.compte && ctx.compte();
    if (!c) { dit.textContent = 'Connect a wallet to mint.'; return; }
    const contrat = adresseTam(TAMART_DEPLOIEMENT);
    /* ⛔ on ne signe que des octets REJOUES ici : le serveur a choisi, la page recalcule */
    const r = rejouer(S.P), oct = octetsDe(S.octets);
    if (!r.ok || !V.verdictRejeu(r.octets, oct).identique) { dit.textContent = 'This page could not replay the brain\'s work to the same bytes, so nothing is offered to sign.'; return; }
    let lu; try { lu = await lireContrat(contrat); } catch (_) { dit.textContent = 'The TamArt contract could not be read.'; return; }
    const paramsJson = JSON.stringify(S.P);
    const jeu = { genre: 'tam', contrat, deploiement: TAMART_DEPLOIEMENT, lu, octets: oct, graine: S.choix.graine, paramsJson };
    const planUsdc = planJeuUsdc(jeu);
    if (planUsdc.etat !== 'PRET') { dit.textContent = planUsdc.pourquoi + '.'; return; }
    let pj;
    if (selPay.value === 'usdc') pj = { ok: true, plan: planUsdc, sym: 'USDC', phrase: 'Pay with USDC: 5 USDC.' };
    else {
      const ligne = ctx.payer.lignes().find((l) => l.jeton === selPay.value);
      pj = ligne ? await ctx.preparer({ ligne, c, planUsdc, jeu }) : { ok: false, pourquoi: 'that token is not offered.' };
    }
    if (!pj.ok) { dit.textContent = 'Not ready: ' + pj.pourquoi; return; }
    const rs = planUsdc.resume, fee = String(FEE_WALLET).toLowerCase();
    signe.hidden = false;
    signe.replaceChildren(
      el('p', { text: 'You sign: 5 USDC to the TokenizedBlock fee wallet ' + fee + ' (TamArt ' + contrat + ' moves it, in the mint).' }),
      el('p', { text: 'The work: ' + rs.octets + ' bytes, keccak ' + rs.empreinte + '. Seed ' + rs.graine + '.' }),
      el('p', { text: pj.phrase + ' ' + pj.plan.appels.length + ' calls: ' + pj.plan.appels.map((a) => a.quoi).join(' · ') + '.' }),
      el('button', { type: 'button', class: 'tamPrim', text: 'Sign in my wallet', onclick: async () => {
        dit.textContent = 'Waiting for your wallet…';
        const res = await ctx.envoyer(pj, c, (t) => { dit.textContent = t; });
        dit.textContent = res && (res.etat === 'CONFIRME' || res.etat === 'OK' || res.etat === 'PRET') ? 'Minted. It appears in the gallery once the block is read.' : 'Not minted: ' + String((res && (res.pourquoi || res.etat)) || 'no answer') + '.';
        void galerie();
      } }));
  }

  /* ── la galerie : lue sur la chaine, GRATUIT ── */
  async function galerie() {
    const contrat = adresseTam(TAMART_DEPLOIEMENT);
    if (!contrat) { galEtat.textContent = 'No work is minted yet: the TamArt contract is not deployed.'; gal.replaceChildren(); racine.dataset.galerie = 'pas-deploye'; return; }
    let ids = [];
    try { const j = await fetch('/api/tam/oeuvres', { cache: 'no-store' }).then((r) => r.json()); if (j && Array.isArray(j.oeuvres)) ids = j.oeuvres.map((o) => o.tokenId); } catch (_) { ids = []; }
    if (!ids.length) { try { const n = Number(BigInt(decoderMot(await ctx.rpc('eth_call', [appelLecture(contrat, SIG_TAM.totalSupply), 'latest'])))); ids = Array.from({ length: Math.min(n, 60) }, (_, i) => i + 1); } catch (_) { ids = []; } }
    galEtat.textContent = ids.length ? ids.length + ' work' + (ids.length === 1 ? '' : 's') + ', read from Base.' : 'No work minted yet.';
    S.nMintees = ids.length;
    gal.replaceChildren(...ids.map((id) => carteOeuvre(contrat, id)));
  }
  function carteOeuvre(contrat, id) {
    const c = el('canvas'), badge = el('span', { class: 'tamBadge' }), txt = el('p', { class: 'tamDoux' });
    const bRejouer = el('button', { type: 'button', text: 'Replay' });
    const f = el('div', { class: 'tamOeuvre' }, c, el('b', { text: 'TAM #' + id }), txt, el('div', { class: 'tamRang' }, bRejouer, badge));
    let donnees = null, params = null;
    (async () => {
      try {
        const [d, p, g] = await Promise.all([SIG_TAM.donnees, SIG_TAM.params, SIG_TAM.graine].map((s) => ctx.rpc('eth_call', [appelLecture(contrat, s, id), 'latest'])));
        donnees = decoderBytes(d); params = new TextDecoder().decode(decoderBytes(p));
        const dec = decoder(donnees); dessinerVignette(c, dec);
        txt.textContent = donnees.length + ' bytes · keccak ' + keccak256Hex(donnees).slice(0, 12) + '… · seed ' + decoderMot(g).slice(0, 10) + '…';
      } catch (_) { txt.textContent = 'Not read.'; }
    })();
    bRejouer.addEventListener('click', () => {
      if (!donnees || !params) { badge.className = 'tamBadge ko'; badge.textContent = 'not read'; return; }
      let r = null; try { r = rejouer(JSON.parse(params)); } catch (_) { r = null; }
      const v = V.verdictRejeu(r && r.ok ? r.octets : null, donnees);
      badge.className = 'tamBadge ' + (v.identique ? 'ok' : 'ko'); badge.textContent = v.texte;
    });
    return f;
  }
  function dessinerVignette(c, d) {
    const T = 200; c.width = T; c.height = T; const g = c.getContext('2d'); g.fillStyle = '#0b0d17'; g.fillRect(0, 0, T, T);
    g.strokeStyle = '#7fd1ff'; g.lineWidth = 0.8; g.beginPath();
    for (let i = 0; i < d.n; i++) { const x = (d.positions[3 * i] + 1) / 2 * T, y = (1 - (d.positions[3 * i + 1] + 1) / 2) * T; if (i === 0 || d.ordre === 1) g.moveTo(x, y); if (d.ordre === 1) g.lineTo(x + 0.5, y); else g.lineTo(x, y); }
    g.stroke();
  }

  optionsDims(); depuisExplorateur(); void galerie();
  racine.__tam = { S, charger };
  return racine.__tam;
}
