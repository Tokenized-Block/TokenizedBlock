/* Le circuit memoire reel de la mouche (hemibrain v1.2, Janelia FlyEM, CC BY 4.0) branche en LECTURE SEULE sur le cours d une action
 * tokenisee. Le cours vient de /api/actions/reference/<adresse> (flux Chainlink lu par le serveur). Les neurones et les synapses sont
 * mesures ; la dynamique (propagation au prorata, APL = garder les 10 % de Kenyon les plus actives) et l attribution hausse/baisse aux PN
 * sont NOS choix, dits sur la page. Rien n est signe, rien n est conseille. */
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';

/* Ordre : volume 24 h mesure par Coinbase search_tokens le 2026-11-07 (mesures/coinbase-actions-20261107.json). Les ADRESSES viennent du
 * registre, jamais d ici. */
const ORDRE = ['SNDKc', 'MSTRc', 'SPCXc', 'NVDAc', 'AMZNc', 'GOOGLc', 'METAc', 'MSFTc', 'TSLAc', 'MUc', 'AAPLc', 'PLTRc'];
const ACTIONS = ORDRE.map((s) => [...POOLS_ACTIONS_AERODROME.entries()].find(([, t]) => t.symbole === s)).filter(Boolean)
  .map(([adresse, t]) => ({ adresse, symbole: t.symbole }));

const COULEUR = { PN: '#4fd1c5', KC: '#f6c453', MBON: '#f472b6', DAN: '#a78bfa', APL: '#f87171' };
const FAMILLES = ['PN', 'KC', 'MBON', 'DAN', 'APL'];
const PART_KC = 0.10, OUBLI = 0.82, GAIN = 0.9, PERIODE_MS = 30000;

const toile = document.getElementById('toile'), ctx = toile.getContext('2d');
const $ = (id) => document.getElementById(id);
const nf = (x, d = 2) => x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const heure = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

let N = [], ent = [], act, tampon, choisie = ACTIONS[0], dernierPrix = null, horloge = null;

function noter(texte, sim) {
  const p = document.createElement('p'); if (sim) p.className = 'sim';
  p.textContent = heure() + ' · ' + texte; $('journal').prepend(p);
  while ($('journal').children.length > 60) $('journal').lastChild.remove();
}

/* Placement deterministe : PN a gauche, Kenyon au centre, MBON a droite, dopamine en arc dessous, APL au coeur. */
function placer(neurones) {
  const W = toile.width, H = toile.height, par = {};
  for (const n of neurones) (par[n.famille] = par[n.famille] || []).push(n);
  const nuage = (liste, cx, cy, rx, ry) => liste.forEach((n, i) => {
    const t = i * 2.399963, r = Math.sqrt((i + 0.5) / liste.length);
    n.x = cx + rx * r * Math.cos(t); n.y = cy + ry * r * Math.sin(t);
  });
  nuage(par.PN || [], W * 0.15, H * 0.42, W * 0.11, H * 0.30);
  nuage(par.KC || [], W * 0.50, H * 0.36, W * 0.15, H * 0.24);
  nuage(par.MBON || [], W * 0.85, H * 0.40, W * 0.07, H * 0.22);
  (par.DAN || []).forEach((n, i, l) => { const t = Math.PI * (0.12 + 0.76 * (i / Math.max(1, l.length - 1))), j = (i % 5) * 9;
    n.x = W * 0.5 - (W * 0.38 + j) * Math.cos(t); n.y = H * 0.50 + (H * 0.36 + j) * Math.sin(t) * 0.9; });
  (par.APL || []).forEach((n) => { n.x = W * 0.50; n.y = H * 0.70; });
}

function preparer(circuit) {
  N = circuit.neurones.map((n) => ({ ...n }));
  const index = new Map(N.map((n, i) => [n.id, i]));
  const entrant = N.map(() => []), totalEntrant = new Float64Array(N.length);
  for (const [a, b, w] of circuit.aretes) { const i = index.get(a), j = index.get(b); entrant[j].push([i, w]); totalEntrant[j] += w; }
  ent = entrant.map((l, j) => l.map(([i, w]) => [i, w / totalEntrant[j]]));
  act = new Float64Array(N.length); tampon = new Float64Array(N.length);
  /* les aretes dessinees : les 1 800 plus fortes, pour que la toile reste lisible */
  N.aretes = circuit.aretes.map(([a, b, w]) => [index.get(a), index.get(b), w]).sort((x, y) => y[2] - x[2]).slice(0, 1800);
  N.wMax = N.aretes[0][2];
  placer(N);
}

/* Un pas : chaque neurone recoit la moyenne ponderee (par synapses) de ses entrees ; APL ne laisse vivre que les 10 % de Kenyon en tete. */
function pas(entree) {
  for (let j = 0; j < N.length; j++) {
    let s = 0; for (const [i, w] of ent[j]) s += w * act[i];
    tampon[j] = Math.min(1, OUBLI * act[j] + GAIN * s * (1 - OUBLI) + (entree[j] || 0));
  }
  const kc = []; for (let j = 0; j < N.length; j++) if (N[j].famille === 'KC') kc.push(j);
  const seuil = kc.map((j) => tampon[j]).sort((a, b) => b - a)[Math.floor(kc.length * PART_KC)] || 0;
  let actifsKc = 0;
  for (const j of kc) { if (tampon[j] <= seuil) tampon[j] = 0; else actifsKc++; }
  const apl = N.findIndex((n) => n.famille === 'APL'); if (apl >= 0) tampon[apl] = Math.min(1, actifsKc / (kc.length * PART_KC));
  [act, tampon] = [tampon, act];
}

/* Une variation de cours devient une impulsion : la hausse sur les PN d identifiant pair, la baisse sur les impairs (choix arbitraire),
 * l intensite suit la loi de Weber-Fechner (log de la variation relative), et la dopamine recoit l ampleur. */
function impulsion(variation) {
  const e = new Float64Array(N.length), force = Math.min(1, Math.log1p(Math.abs(variation) * 100) / Math.log1p(8));
  const pair = variation > 0 ? 0n : 1n;
  N.forEach((n, j) => {
    if (n.famille === 'PN' && BigInt(n.id) % 2n === pair) e[j] = force * (0.6 + 0.4 * ((j * 7919) % 97) / 97);
    if (n.famille === 'DAN') e[j] = force * 0.35;
  });
  return { e, force };
}

let impulsionsRestantes = 0, impulsionCourante = null;
function lancer(variation, sim, prix) {
  const { e, force } = impulsion(variation);
  impulsionCourante = e; impulsionsRestantes = 6;
  const sens = variation > 0 ? 'hausse' : 'baisse';
  noter(`${sim ? 'SIMULATION · ' : ''}${choisie.symbole} ${variation > 0 ? '+' : '−'}${nf(Math.abs(variation) * 100, 1)} % (${sens})`
    + `${prix ? ' à ' + nf(prix) + ' $' : ''} → entrée ${nf(force * 100, 0)} % (Weber–Fechner)`, sim);
  setTimeout(() => { const m = mesurer(); noter(`… Kenyon actives ${m.KC.n}/${m.KC.total}, sortie la plus forte : ${m.top}`, sim); }, 1600);
}

function mesurer() {
  const r = {}; for (const f of FAMILLES) r[f] = { s: 0, n: 0, total: 0 };
  let top = null;
  N.forEach((n, j) => { const x = r[n.famille]; x.total++; x.s += act[j]; if (act[j] > 0.05) x.n++;
    if (n.famille === 'MBON' && (!top || act[j] > act[top])) top = j; });
  r.top = top != null && act[top] > 0.02 ? `${N[top].type} (${nf(act[top] * 100, 0)} %)` : 'aucune';
  return r;
}

function dessiner() {
  const W = toile.width, H = toile.height;
  ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = 'rgba(5,7,13,0.35)'; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  for (const [i, j, w] of N.aretes) {
    const a = act[i]; const base = 0.025 + 0.05 * (w / N.wMax);
    ctx.strokeStyle = COULEUR[N[i].famille]; ctx.globalAlpha = Math.min(0.9, base + a * 0.45 * (0.3 + w / N.wMax));
    ctx.lineWidth = 0.4 + a * 1.2; ctx.beginPath(); ctx.moveTo(N[i].x, N[i].y); ctx.lineTo(N[j].x, N[j].y); ctx.stroke();
  }
  for (let j = 0; j < N.length; j++) {
    const n = N[j], a = act[j], r = (n.famille === 'APL' ? 7 : n.famille === 'MBON' ? 3.2 : 2.2) + a * 5;
    ctx.globalAlpha = 0.35 + a * 0.65; ctx.fillStyle = COULEUR[n.famille];
    if (a > 0.08) { ctx.shadowColor = COULEUR[n.famille]; ctx.shadowBlur = 14 * a; } else ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}

function jauges() {
  const m = mesurer(), noms = { PN: 'PN', KC: 'Kenyon', MBON: 'MBON', DAN: 'Dopa.', APL: 'APL' };
  $('jauges').innerHTML = FAMILLES.map((f) => { const p = m[f].total ? m[f].s / m[f].total : 0;
    return `<div><span>${noms[f]}</span><span class="barre"><i style="width:${Math.min(100, p * 100 * 3)}%;background:${COULEUR[f]}"></i></span><span>${nf(p * 100, 1)} %</span></div>`; }).join('');
  $('sortie').textContent = `Sortie MBON la plus active : ${m.top}`;
}

let dernierPas = 0;
function boucle(t) {
  if (t - dernierPas > 120) {
    dernierPas = t;
    const e = impulsionsRestantes > 0 ? impulsionCourante : null; if (impulsionsRestantes > 0) impulsionsRestantes--;
    pas(e || []);
    if (Math.floor(t / 500) !== Math.floor((t - 120) / 500)) jauges();
  }
  dessiner(); requestAnimationFrame(boucle);
}

async function lireCours() {
  const action = choisie;
  try {
    const r = await fetch('/api/actions/reference/' + action.adresse, { cache: 'no-store' }).then((x) => x.json());
    if (action !== choisie) return;
    const ref = r && r.reference;
    if (!r || !r.ok || !ref || ref.etat !== 'LU' || typeof ref.prixUsd !== 'number') {
      $('etat').textContent = 'cours non lu : ' + ((r && r.pourquoi) || (ref && ref.pourquoi) || 'réponse vide'); return;
    }
    $('prix').textContent = nf(ref.prixUsd) + ' $';
    $('etat').textContent = `${ref.libelle} · mis à jour ${new Date(ref.majA).toLocaleString('fr-FR')}${ref.pourquoi ? ' · ' + ref.pourquoi : ''}`;
    if (dernierPrix == null) noter(`${action.symbole} lu à ${nf(ref.prixUsd)} $ (Chainlink)${ref.fraicheur === 'DERNIERE_VALEUR' ? ', marché fermé : la mouche ne reçoit rien tant que le cours ne bouge pas' : ''}`);
    else if (ref.prixUsd !== dernierPrix) lancer(ref.prixUsd / dernierPrix - 1, false, ref.prixUsd);
    dernierPrix = ref.prixUsd;
  } catch (e) { $('etat').textContent = 'cours non lu : ' + (e && e.message || e); }
}

function choisir(i) {
  choisie = ACTIONS[i]; dernierPrix = null; $('prix').textContent = '—'; $('etat').textContent = 'lecture…';
  clearInterval(horloge); lireCours(); horloge = setInterval(lireCours, PERIODE_MS);
}

async function demarrer() {
  $('choix').innerHTML = ACTIONS.map((a, i) => `<option value="${i}">${a.symbole}</option>`).join('');
  $('choix').addEventListener('change', (e) => choisir(Number(e.target.value)));
  const curseur = $('ampleur'), afficher = () => { const v = Number(curseur.value) / 10; $('valeur').textContent = (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v), 1) + ' %'; };
  curseur.addEventListener('input', afficher); afficher();
  $('injecter').addEventListener('click', () => { const v = Number(curseur.value) / 1000; if (v) lancer(v, true, null); });
  const circuit = await fetch('cerveau-mouche-circuit.json').then((r) => r.json());
  preparer(circuit);
  noter(`circuit chargé : ${N.length} neurones, ${circuit.aretes.length} connexions ≥ ${circuit.seuilSynapses} synapses`);
  requestAnimationFrame(boucle);
  choisir(0);
}
demarrer().catch((e) => noter('erreur : ' + (e && e.message || e)));
