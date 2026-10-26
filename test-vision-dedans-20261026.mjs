// test-vision-dedans-20261026.mjs — « VIEW INSIDE THE BRAIN » : la fenetre 3D ne montre que des champs REELS.
//
// Ce que ce banc exige (proprietaire, 2026-10-26, game57 item 4) :
//   A. effets directionnels 1:1 avec des champs reels : buy = nouveaux.achats (devant, chaud), sell = nouveaux.ventes (derriere,
//      froid), transfer = nouveaux.gm (cotes, miroitement), new holder = nouveaux.detenteurs (une particule) ; chaque effet porte
//      le champ et la valeur qui l ont fait naitre ;
//   B. une entree absente (ou nulle) ne produit AUCUN effet ;
//   C. la voix interieure : une phrase par battement, chaque morceau vient d un champ PRESENT du battement ; aucun champ invente
//      (cause, raison, baleine…) ne passe jamais dans la phrase ;
//   D. « Why » : l entree dominante porte sa vraie valeur, les neurones viennent de vu.indices / de l etat, « what changed » ne
//      compare que des champs tenus ;
//   E. « Take control » : instantane LOCAL, zero requete d ecriture (fetch / XHR / wallet stubbes, zero appel non-GET) ;
//   F. prefers-reduced-motion : pas de vol, pas de secousse, lumiere statique, aucune boucle requestAnimationFrame ;
//   G. app.html : la fenetre reprend le code du Control panel (bcBornerTaille), n est pas modale, range ses sections en etagere.
// ⛔ Lecture EOL-agnostique (le checkout de Phil est en CRLF) ; chaque extraction affirme avoir trouve sa fonction.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const D = await import(new URL(process.env.DEDANS_MODULE || './vision-dedans.js', import.meta.url).href);
const V = await import(new URL('./vision-cerveau.js', import.meta.url).href);
const C = await import(new URL('./cerveau.js', import.meta.url).href);
const { effetsDe, SENSATIONS, lumiereDe, poulsDe, echosDe, horizonDe, numeroBattement, voixDe, pourquoiDe, instantaneDedans,
  camLibre, orbiterCam, zoomerCam, projeterNeurones, poseCamera, planAnimation, voisinsDehors } = D;
const { etatInitial, pas, NEURONES } = C;

const ADR = '0xb2000000000000000000007afa7ed748b0874f27';
const FAITS = { vie: 12000, vieAvant: 11000, gm: 3, messages: 1, detenteurs: 2, mort: false, etatVie: 'LUE', gmAvant: 2, messagesAvant: 0,
  detenteursAvant: 1, achats: 2, ventes: 1, achatsAvant: 1, ventesAvant: 0, role: 'SENTINELLE', bloc: 53106615 };
const derouler = (f, k) => { let e = etatInitial(ADR); const h = []; for (let i = 0; i < k; i++) { const r = pas(e, f(i)); e = r.etat; h.push(r.vu); } return { h, e }; };
const { h: HISTO, e: ETAT } = derouler(() => FAITS, 8);
const VU = HISTO[0];   /* premier battement : achats 1→2, ventes 0→1, gm 2→3, detenteurs 1→2 sont NOUVEAUX */

/* ══ A. 1:1 AVEC DES CHAMPS REELS ══ */
{
  ok(VU.nouveaux.achats === 1 && VU.nouveaux.ventes === 1 && VU.nouveaux.gm === 1 && VU.nouveaux.detenteurs === 1, 'A: le battement de reference porte bien 4 nouveautes');
  const e = effetsDe(VU);
  eq(e.map((x) => x.champ).sort(), ['nouveaux.achats', 'nouveaux.detenteurs', 'nouveaux.gm', 'nouveaux.ventes'], 'A: un effet par champ non nul, ni plus ni moins');
  const par = Object.fromEntries(e.map((x) => [x.effet, x]));
  ok(par.buy.direction === 'front' && par.buy.temperature === 'warm', 'A: buy arrive de face, chaud');
  ok(par.sell.direction === 'back' && par.sell.temperature === 'cold', 'A: sell arrive de dos, froid');
  ok(par.transfer.direction === 'sides' && par.transfer.forme === 'shimmer', 'A: transfer miroite sur les cotes');
  ok(par.holder.forme === 'particle' && par.holder.particules === 1, 'A: un nouveau holder ajoute UNE particule');
  for (const x of e) {
    const [a, b] = x.champ.split('.');
    ok(VU[a][b] === x.valeur && x.valeur > 0, 'A: l effet ' + x.effet + ' porte la valeur exacte de ' + x.champ);
  }
  eq(SENSATIONS.map((s) => s.champ), ['nouveaux.achats', 'nouveaux.ventes', 'nouveaux.gm', 'nouveaux.detenteurs'], 'A: la table des sensations est fixe');
  const trois = effetsDe({ tick: 5, phase: 'CALME', nouveaux: { detenteurs: 3 } });
  ok(trois.length === 1 && trois[0].particules === 3, 'A: 3 nouveaux holders = 3 particules');
}

/* ══ B. UNE ENTREE ABSENTE NE PRODUIT RIEN ══ */
{
  eq(effetsDe(null), [], 'B: pas de battement, pas d effet');
  eq(effetsDe({ tick: 3, phase: 'CALME' }), [], 'B: sans `nouveaux`, aucun effet');
  eq(effetsDe({ tick: 3, phase: 'CALME', nouveaux: { achats: 0, ventes: 0, gm: 0, detenteurs: 0 } }), [], 'B: des zeros ne font rien');
  eq(effetsDe({ tick: 3, phase: 'CALME', nouveaux: { achats: null, ventes: undefined, gm: NaN, detenteurs: '2' } }), [], 'B: un champ illisible ne fait rien');
  eq(effetsDe({ tick: 3, phase: 'CALME', nouveaux: { ventes: 2 } }).map((x) => x.effet), ['sell'], 'B: seule la vente presente agit');
  eq(effetsDe({ tick: 3, phase: 'MORT', nouveaux: { achats: 4 } }), [], 'B: un block mort ne ressent rien (comme phraseBattement)');
  const l0 = lumiereDe(null);
  ok(l0.neutre === true && l0.teinte === null, 'B: sans battement, lumiere neutre');
  ok(lumiereDe({ tick: 1, phase: 'NON_LU', spikes: 9 }).neutre === true, 'B: NON_LU ne colore pas la scene');
  ok(lumiereDe({ tick: 1, phase: 'MORT', spikes: 0 }).neutre === true, 'B: MORT ne colore pas la scene');
  const l1 = lumiereDe({ tick: 1, phase: 'EXCITE', spikes: 64 });
  ok(l1.neutre === false && l1.phase === 'EXCITE' && l1.force === 0.5, 'B: la lumiere = la phase decidee, sa force = spikes / 128');
  eq(horizonDe({ tick: 1 }), { deg: 0, virage: null }, 'B: sans virage, l horizon ne penche pas');
  ok(horizonDe({ tick: 1, virage: -0.5 }).deg < 0 && horizonDe({ tick: 1, virage: 0.5 }).deg > 0, 'B: le virage penche l horizon de son cote');
  ok(Math.abs(horizonDe({ tick: 1, virage: 99 }).deg) <= 20, 'B: l inclinaison est bornee');
  ok(numeroBattement(VU) === VU.tick && numeroBattement(null) === null, 'B: UN numero de battement, celui du battement montre');
  const ec = echosDe(HISTO, 7);
  ok(ec.length === 5 && ec[0].tick === HISTO[6].tick && ec[4].tick === HISTO[2].tick, 'B: les echos = les 5 battements d avant, du plus recent au plus ancien');
  eq(echosDe(HISTO, 1).map((x) => x.tick), [HISTO[0].tick], 'B: pas d echo invente avant le premier battement');
  const moi = { adr: ADR, wx: 0, wy: 0, wz: 0 };
  const hab = [moi, { adr: '0x' + '1'.repeat(40), sym: 'AAA', wx: 100, wy: 0, wz: 0, phase: 'CALME' }, { adr: '0x' + '2'.repeat(40), sym: 'BBB', wx: 0, wy: 300, wz: 0 },
    { adr: '0x' + '3'.repeat(40), wx: NaN, wy: 0, wz: 0 }];
  const vd = voisinsDehors(moi, hab, new Set());
  ok(vd.length === 2 && vd.every((v) => v.lu === false), 'B: Outside — ses vrais voisins, aucun allume sans lecture');
  ok(vd[0].adr === hab[1].adr && Math.hypot(vd[1].x, vd[1].y, vd[1].z) > Math.hypot(vd[0].x, vd[0].y, vd[0].z), 'B: les distances du monde sont gardees (le plus proche reste le plus proche)');
  const vl = voisinsDehors(moi, hab, new Set([hab[2].adr]));
  eq(vl.filter((v) => v.lu).map((v) => v.adr), [hab[2].adr], 'B: seul un voisin REELLEMENT lu est allume');
  eq(voisinsDehors(null, hab, new Set()), [], 'B: sans position, aucun voisin invente');
  ok(poulsDe(null).force === 0 && poulsDe(VU).force === Math.round(VU.spikes / NEURONES * 1000) / 1000, 'B: le pouls = la part de neurones qui ont tire');
}

/* ══ C. LA VOIX NE DIT QUE CE QUI EST DANS LE BATTEMENT ══ */
{
  const v = voixDe(VU);
  ok(typeof v.texte === 'string' && /^[A-Z]/.test(v.texte) && /\.$/.test(v.texte) && (v.texte.match(/[.!?](\s|$)/g) || []).length === 1, 'C: une seule phrase');
  const chemin = (o, p) => p.split('.').reduce((x, k) => (x && typeof x === 'object' ? x[k] : undefined), o);
  /* un battement truffe de champs qui ressemblent a des causes : aucun ne doit passer dans la voix */
  const PIEGES = { cause: 'whale dumped', raison: 'news', pourquoi: 'rug pull', whale: true, message: 'pump it', because: 'x' };
  const brut = [VU, ...HISTO, { tick: 9, phase: 'NON_LU' }, { tick: 10, phase: 'MORT', nouveaux: { achats: 3 } }, { tick: 11, phase: 'CALME', delta: -0.04, nouveaux: { ventes: 2 } }];
  for (const b of brut) {
    const x = voixDe({ ...b, ...PIEGES });
    for (const t of x.traces) {
      if (t.cle === 'rien') { ok(t.valeur === null, 'C: « rien » ne porte aucune valeur'); continue; }
      ok(chemin(b, t.cle) === t.valeur, 'C: le morceau « ' + t.dit + ' » vient du champ present ' + t.cle);
    }
    ok(!/whale|news|rug|pump|because|due to/i.test(x.texte), 'C: aucune cause inventee dans « ' + x.texte + ' »');
  }
  const vide = voixDe({ tick: 4, phase: 'CALME', nouveaux: {} });
  eq(vide.traces.map((t) => t.cle), ['rien'], 'C: sans donnee, une ligne neutre et factuelle');
  ok(voixDe(null).texte && voixDe(null).traces.length === 0, 'C: sans battement, rien d affirme');
}

/* ══ D. « WHY » ══ */
{
  const c = V.champ({ adr: ADR, faits: FAITS, vu: HISTO[HISTO.length - 1], voisins: [], nourritureLue: true });
  const last = HISTO[HISTO.length - 1], avant = HISTO[HISTO.length - 2];
  const w = pourquoiDe({ c, faits: FAITS, vu: last, vuAvant: avant, etat: ETAT, capMap: 0.5 });
  ok(w && w.dominante && typeof w.dominante.cle === 'string', 'D: une entree dominante');
  const e = c.entrees.find((x) => x.cle === w.dominante.cle);
  ok(e.lu && w.dominante.valeur === e.valeur && w.dominante.brut === e.brut, 'D: la dominante porte sa vraie valeur lue');
  ok(w.dominante.apport === V.apportDe(FAITS, w.dominante.cle), 'D: son poids = apportDe (cerveau.js), pas une copie');
  eq(w.neurones.tires, last.indices.slice(0, 8), 'D: les neurones qui ont tire viennent de vu.indices');
  ok(Array.isArray(w.neurones.proches) && w.neurones.proches.length <= 5, 'D: les plus proches du seuil viennent de l etat tenu');
  ok(w.changements.every((x) => ['phase', 'spikes', 'virage', 'vitesse', 'delta', 'nouveaux.achats', 'nouveaux.ventes', 'nouveaux.gm', 'nouveaux.messages', 'nouveaux.detenteurs'].includes(x.champ)), 'D: what changed ne compare que des champs tenus');
  ok(w.regard.virage === last.virage && w.regard.capMap === 0.5, 'D: ou il regarde = son virage et son cap reels');
  const sans = pourquoiDe({ c, faits: FAITS, vu: last, vuAvant: null, etat: null, capMap: null });
  ok(sans.changements.length === 0 && sans.neurones.proches === null && sans.regard.capMap === null, 'D: sans battement precedent ni etat, rien n est invente');
  const mauvaisEtat = pourquoiDe({ c, faits: FAITS, vu: avant, vuAvant: null, etat: ETAT, capMap: null });
  ok(mauvaisEtat.neurones.proches === null, 'D: un etat d un autre battement n est pas montre');
  ok(pourquoiDe({ c: null, faits: null, vu: null }) === null, 'D: rien a expliquer sans battement');
}

/* ══ E. TAKE CONTROL : INSTANTANE LOCAL, ZERO ECRITURE ══ */
{
  const snap = instantaneDedans({ adr: ADR, etat: ETAT, histo: HISTO, i: 7 });
  ok(snap && Object.isFrozen(snap) && Object.isFrozen(snap.potentiels) && snap.potentiels.length === NEURONES, 'E: instantane fige des 128 potentiels');
  ETAT.potentiels[0] = 999;
  ok(snap.potentiels[0] !== 999, 'E: l instantane est une COPIE (le cerveau vivant ne le modifie pas)');
  ok(snap.indices.join() === HISTO[7].indices.join() && snap.tick === HISTO[7].tick, 'E: il fige le battement montre');
  let cam = camLibre();
  cam = orbiterCam(cam, 30, -10); cam = zoomerCam(cam, 100);
  ok(cam.dist >= 0.2 && cam.dist <= 6 && Math.abs(cam.pitch) <= 1.4, 'E: camera libre bornee');
  const pos = Array.from({ length: NEURONES }, (_, i) => [Math.cos(i), Math.sin(i) * 0.5, Math.sin(i)]);
  const p = projeterNeurones(pos, cam, 360, 300);
  ok(p.every((x) => Number.isFinite(x.x) && Number.isFinite(x.y) && x.n >= 0 && x.n < NEURONES), 'E: projection finie, indices conserves');

  const app = lire('./app.html');
  const fonction = (entete) => { const i = app.indexOf(entete); ok(i > 0, 'E: extraction trouvee : ' + entete); const f = /\n\}/.exec(app.slice(i)); return app.slice(i, i + f.index + 2); };
  const src = ['function bvPrendreControle() {', 'function bvGesteControle(dx, dy, dz) {', 'function bvRetourLive() {'].map(fonction).join('\n');
  const appels = [];
  const fetchStub = (url, o = {}) => { appels.push({ via: 'fetch', methode: String((o && o.method) || 'GET').toUpperCase(), url }); return Promise.resolve({ ok: true, json: async () => ({}) }); };
  class XHR { open(m, u) { appels.push({ via: 'xhr', methode: String(m).toUpperCase(), url: u }); } send() {} setRequestHeader() {} }
  const ethereum = { request: (a) => { appels.push({ via: 'wallet', methode: 'WALLET', url: a && a.method }); return Promise.resolve(null); } };
  const sav = { fetch: globalThis.fetch, XMLHttpRequest: globalThis.XMLHttpRequest, window: globalThis.window, navigator: globalThis.navigator };
  globalThis.fetch = fetchStub; globalThis.XMLHttpRequest = XHR; globalThis.window = { ethereum, fetch: fetchStub }; 
  try {
    const el = () => ({ hidden: false, textContent: '', style: {}, classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, focus() {} });
    const els = {};
    const $ = (s) => (els[s] = els[s] || el());
    const vision = { jouer: true, controle: null, i: 7 };
    let peint = 0;
    const f = new Function('vision', '$', 'visionCible', 'instantaneDedans', 'camLibre', 'orbiterCam', 'zoomerCam', 'peindreVision', 'bvReduit',
      src + '\nreturn { bvPrendreControle, bvGesteControle, bvRetourLive };')(vision, $, () => ({ adr: ADR, etat: ETAT, histo: HISTO }), instantaneDedans,
      camLibre, orbiterCam, zoomerCam, () => { peint++; }, () => false);
    f.bvPrendreControle();
    ok(vision.controle && vision.controle.snap && vision.jouer === false, 'E: Take control fige un instantane et met le direct en pause');
    for (let k = 0; k < 20; k++) f.bvGesteControle(k * 3, -k, k % 2 ? 1 : -1);
    ok(peint > 0, 'E: les gestes repeignent la scene');
    f.bvRetourLive();
    ok(vision.controle === null && vision.jouer === true, 'E: Back to live reprend le direct');
  } finally { Object.assign(globalThis, sav); }
  eq(appels.filter((a) => a.methode !== 'GET'), [], 'E: zero appel non-GET (fetch / XHR / wallet)');
  eq(appels, [], 'E: et meme aucun appel reseau');
  const bloc = src.replace(/\/\*[\s\S]*?\*\//g, '');
  ok(!/fetch\s*\(|XMLHttpRequest|sendBeacon|ethereum|eth_|wallet_|\brpc\s*\(|bcSigner|method\s*:/.test(bloc), 'E: le code de Take control ne nomme aucune ecriture');
  const mod = lire(process.env.DEDANS_MODULE || './vision-dedans.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  ok(!/Math\.random|Date\.now|new Date|performance\.now|fetch\s*\(|XMLHttpRequest|localStorage|document\.|window\./.test(mod), 'E: vision-dedans.js est pur');
}

/* ══ F. PREFERS-REDUCED-MOTION ══ */
{
  eq(planAnimation(true), { vol: false, secousse: false, lumiere: 'statique', boucle: false }, 'F: mouvement reduit = rien ne bouge');
  eq(planAnimation(false), { vol: true, secousse: true, lumiere: 'vivante', boucle: true }, 'F: sinon, vol, secousse, lumiere vivante');
  const a = poseCamera('dedans', 0, true), b = poseCamera('dedans', 1, true), c = poseCamera('dedans', 1, false);
  eq(a, b, 'F: mouvement reduit — la camera est d emblee a sa pose finale (pas de vol)');
  eq(b, c, 'F: la pose finale est la meme avec ou sans mouvement');
  ok(poseCamera('dedans', 0, false).dist > poseCamera('dedans', 1, false).dist, 'F: sans reduction, la camera vole vers l interieur');
  ok(poseCamera('dehors', 0.3, false).dist > 1.5, 'F: Outside = la camera hors du block');
  ok(poulsDe(HISTO[3], { reduit: true }).anime === false && poulsDe(HISTO[3]).anime === true, 'F: le pouls ne bat pas a l ecran en mouvement reduit');
  const app = lire('./app.html');
  const i = app.indexOf('function bvDemarrerBoucle() {'); ok(i > 0, 'F: extraction trouvee : bvDemarrerBoucle');
  const f = /\n\}/.exec(app.slice(i)); const src = app.slice(i, i + f.index + 2);
  for (const reduit of [true, false]) {
    let raf = 0, peint = 0; const vision = { boucle: null, vol: null };
    const g = new Function('vision', 'planAnimation', 'bvReduit', 'requestAnimationFrame', 'cancelAnimationFrame', 'bvPeindre3D', 'performance',
      src + '\nreturn bvDemarrerBoucle;')(vision, planAnimation, () => reduit, () => { raf++; return 1; }, () => {}, () => { peint++; }, { now: () => 0 });
    g();
    if (reduit) ok(raf === 0 && peint === 1, 'F: mouvement reduit — aucune boucle rAF, une seule peinture statique');
    else ok(raf === 1, 'F: sinon, la boucle demarre');
  }
  ok(/@media \(prefers-reduced-motion:reduce\)\{[^}]*#bvPop/.test(app), 'F: la fenetre a sa regle CSS de mouvement reduit');
}

/* ══ G. LA FENETRE ══ */
{
  const app = lire('./app.html');
  ok(/<dialog class="bvPop" id="bvPop" data-fenetre="panneau"/.test(app), 'G: la fenetre porte la forme du panneau');
  ok(/id="bvPoignee"[^>]*role="separator"/.test(app) && /id="bvReduire"/.test(app) && /id="bvAgrandir"/.test(app), 'G: bord a tirer, replier, agrandir');
  const i = app.indexOf('function fenetreCommeLePanneau('); ok(i > 0, 'G: extraction trouvee : fenetreCommeLePanneau');
  const corps = app.slice(i, i + /\n\}/.exec(app.slice(i)).index);
  ok(/bcBornerTaille\(/.test(corps) && /bcAxeTaille\(\)/.test(corps) && /bcNavPx\(\)/.test(corps), 'G: elle reutilise les bornes et l axe du Control panel');
  ok(/fenetreCommeLePanneau\(\{ d: \$\('#bvPop'\)/.test(app), 'G: la fenetre Brain est branchee dessus');
  const o = app.indexOf('function ouvrirVision(source) {'); ok(o > 0, 'G: extraction trouvee : ouvrirVision');
  const ov = app.slice(o, o + /\n\}/.exec(app.slice(o)).index);
  ok(!/showModal/.test(ov) && /dl\.show\(\)/.test(ov), 'G: pas une modale');
  ok(/id="bvEtagere"[^>]*role="tablist"/.test(app) && /id="bvOnglets"/.test(app), 'G: une etagere et des onglets');
  const livres = [...app.matchAll(/data-livre="([a-zA-Z]+)"/g)].map((m) => m[1]);
  for (const l of ['parle', 'lit', 'details', 'neurones', 'autour', 'siEtAlors', 'pourquoi']) ok(livres.includes(l), 'G: le livre ' + l + ' est sur l etagere');
  ok(/<canvas id="bv3d"/.test(app) && !/<svg id="bvChamp"/.test(app), 'G: la scene est le moteur 3D, le schema plat est retire');
  ok(/id="bvHumeur"[^>]*type="button"/.test(app.replace(/type="button"([^>]*)id="bvHumeur"/, 'id="bvHumeur"$1 type="button"')), 'G: l humeur est cliquable');
  ok(/id="bvControle"/.test(app) && /id="bvRetourLive"/.test(app), 'G: Take control / Back to live');
}

console.log('test-vision-dedans-20261026 : ' + n + ' assertions, OK');
