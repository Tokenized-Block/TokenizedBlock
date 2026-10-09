/* test-lectures-paralleles-20261004.mjs — LES LECTURES INDEPENDANTES D UN PLAN PARTENT ENSEMBLE, ET LE PLAN RESTE LE MEME.
 *
 * POURQUOI. Mesure du 2026-10-04 sur le planificateur de prod : 5 s pour un plan a un saut, 27 a 56 s pour deux sauts. Compte sur
 *   fork : 7 a 27 lectures par plan, une seule en vol. Les lectures qui ne dependent pas l une de l autre partent maintenant
 *   ensemble, au plus 4 a la fois (lectures-en-vol.js).
 *
 * CE QUE CE FICHIER TIENT, HORS RESEAU, avec un faux noeud qui met 40 ms par appel, COMPTE les appels et le nombre en vol :
 *   A. lectures-en-vol.js : l ordre du resultat est celui de la liste, la borne est tenue, rien ne reste en vol au retour.
 *   B. echange.js `meilleureClePourMontant` : MEME reponse que la version en file (une COPIE de l ancienne fonction vit ici, c est
 *      la reference) — meilleur devis, premier candidat a egalite, candidat qui leve saute, memes champs dans le meme ordre —
 *      en moins de la moitie du temps, jamais plus de 4 lectures en vol.
 *   C. marche.js : les decimales sont lues une fois puis gardees (jamais un echec, jamais un 0, jamais d une chaine a l autre) ;
 *      prix, supply et liquidite sont relus a chaque fois ; decimales + supply (+ liquidite) partent ensemble.
 *   D. echange.js : `poolActuelleDuBlock` (copie de reference) et les deux autorisations de `finaliser`.
 *   E. plan-franchissement.js `poolAerodromeDe` : MEME reponse que la copie de l ancienne fonction, la plus profonde gagne.
 *   F. rails-api.js `planRail` : un plan entier (action v4 > block, 23 lectures) rend la MEME reponse que sa variante en file
 *      (borne forcee a 1), n a jamais plus de 4 lectures en vol, lit ses deux marches ensemble.
 *   G. MUTANTS (sur des copies) : chaque garde retiree fait rougir son assertion.
 *
 * ⛔ CE QUE CE FICHIER NE PROUVE PAS : le temps en production. Un faux noeud a 40 ms n a ni limite de debit ni file d attente ;
 *   les noeuds publics en ont. Le gain reel se mesure apres un deploiement (outils-tblock/temps-routes-prod.mjs), pas ici.
 * ⛔ Les temps compares ici sont pris DANS LE MEME PROCESSUS, l un contre l autre (rapport), jamais contre un chiffre absolu :
 *   une machine chargee ralentit les deux. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f, dir = ICI) => import(pathToFileURL(path.join(dir, f)).href);
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (x) => JSON.stringify(x, (_, v) => (typeof v === 'bigint' ? 'n:' + v.toString() : v));
const mot = (x) => '0x' + BigInt(x).toString(16).padStart(64, '0');
const chrono = async (f) => { const t0 = performance.now(); let r, e = null; try { r = await f(); } catch (x) { e = x; } return { r, e, ms: Math.round(performance.now() - t0) }; };
const DELAI = 40;

/** Le faux noeud. `repondre(appel)` rend { v } (la reponse), { e } (l appel leve) et peut porter { ms } (son delai a lui).
 *  Il note pour chaque appel son rang de depart et de fin (`seq`), et tient le nombre d appels en vol. */
function noeud(repondre) {
  const s = { appels: 0, enVol: 0, max: 0, seq: 0, journal: [] };
  const rpc = async (methode, params) => {
    const p0 = (params && params[0]) || {};
    const a = { methode, to: String(p0.to || '').toLowerCase(), data: String(p0.data || ''), de: p0.from || null, debut: ++s.seq, fin: null };
    s.appels += 1; s.enVol += 1; if (s.enVol > s.max) s.max = s.enVol;
    s.journal.push(a);
    try {
      const r = repondre(a) || {};
      await pause(typeof r.ms === 'number' ? r.ms : DELAI);
      if (r.e) throw new Error(r.e);
      return r.v;
    } finally { s.enVol -= 1; a.fin = ++s.seq; }
  };
  return { rpc, s };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-lectures-'));
const lire = (f) => fs.readFileSync(path.join(ICI, f), 'utf8');
const copie = () => { const dir = fs.mkdtempSync(path.join(tmp, 'm-')); for (const f of fs.readdirSync(ICI)) if (/\.js$/.test(f) && !/^(serveur-web|vendor|mcp-ext-apps)/.test(f)) fs.copyFileSync(path.join(ICI, f), path.join(dir, f)); return dir; };
/** Une copie du depot ou UNE chaine d UN fichier est remplacee. `une` = la chaine y etait exactement une fois (sinon le mutant ne mute rien). */
const muter = (fichier, de, vers) => { const src = lire(fichier); const dir = copie(); const une = src.split(de).length === 2; fs.writeFileSync(path.join(dir, fichier), src.replace(de, () => vers)); return { dir, une }; };

const L = await imp('lectures-en-vol.js');
const E = await imp('echange.js');
const M = await imp('marche.js');
const P = await imp('pool.js');
const PF = await imp('plan-franchissement.js');
const C = await imp('calldata-aerodrome.js');
const K = await imp('keccak.js');
const { CLES_PRIX } = await imp('prix-eth.js');
const { USDC_BASE } = await imp('frais-creation.js');
const { V4_ADRESSES, PERMIT2 } = await imp('lancer-pool.js');
const { HOOK_V8 } = await imp('tokenomics.js');
const { ACTIONS_COINBASE } = await imp('paires.js');
const { POOLS_ACTIONS_AERODROME } = await imp('pools-actions-aerodrome.js');
const { LOGS_INITIALIZE_ACTIONS } = await imp('cles-v4-actions.js');
const { decoderInitialize } = await imp('pools-du-jeton.js');
const { capitalisation } = await imp('pointsdevie.js');

const ETH = '0x0000000000000000000000000000000000000000';
const USDC = USDC_BASE.toLowerCase();
const SV = V4_ADRESSES[8453].stateView;
const QUOTEUR = String(E.QUOTEUR[8453]).toLowerCase(), ROUTEUR = String(E.ROUTEUR[8453]).toLowerCase();
const COMPTE = '0x00000000000000000000000000000000c0ffee77';
const BLOCK = '0xb200000000000000000000000000000000000001';
const SEL = { slot0: '0x' + P.selecteur('getSlot0(bytes32)'), liq: '0x' + P.selecteur('getLiquidity(bytes32)'), dec: '0x' + P.selecteur('decimals()'),
  supply: '0x' + P.selecteur('totalSupply()'), allowance: '0x' + P.selecteur('allowance(address,address)'), allowanceP2: '0x' + P.selecteur('allowance(address,address,address)') };
ok(L.LECTURES_EN_VOL_MAX === 4, 'la borne commune vaut 4 (le nombre de noeuds de la liste large du serveur)');
const N = L.LECTURES_EN_VOL_MAX;

console.log('— A. lectures-en-vol.js');
{
  /* les dernieres taches finissent les premieres : le resultat doit quand meme etre dans l ordre de la liste */
  let enVol = 0, max = 0; const departs = [];
  const issues = await L.enVolBorne([0, 1, 2, 3, 4, 5, 6, 7, 8], async (x, i) => {
    departs.push(i); enVol += 1; if (enVol > max) max = enVol;
    await pause((9 - x) * 6); enVol -= 1;
    return x * 10;
  }, 4);
  ok(issues.length === 9 && issues.every((x, i) => x.ok && x.valeur === i * 10), 'A enVolBorne : les issues sont dans l ORDRE DE LA LISTE, meme quand les dernieres finissent d abord');
  ok(max === 4, 'A enVolBorne : jamais plus de 4 taches en vol, et 4 sont bien parties ensemble (max en vol : ' + max + ')');
  ok(J(departs) === J([0, 1, 2, 3, 4, 5, 6, 7, 8]), 'A enVolBorne : les taches sont LANCEES dans l ordre de la liste');
  const mixte = await L.enVolBorne(['a', 'b', 'c', 'd'], (x) => { if (x === 'b') throw new Error('avant le premier await'); return x === 'c' ? Promise.reject(new Error('rejet')) : Promise.resolve(x); }, 4);
  ok(mixte[0].ok && mixte[0].valeur === 'a' && !mixte[1].ok && /avant le premier await/.test(mixte[1].erreur.message) && !mixte[2].ok && /rejet/.test(mixte[2].erreur.message) && mixte[3].ok,
    'A enVolBorne : une tache qui leve (meme avant son premier await) rend son erreur A SA PLACE et n arrete pas les autres');
  for (const b of [0, -3, NaN, 'x']) {
    let v = 0, mx = 0;
    const r = await L.enVolBorne([1, 2, 3], async (x) => { v += 1; if (v > mx) mx = v; await pause(2); v -= 1; return x; }, b);
    ok(r.length === 3 && r.every((x) => x.ok) && mx === 1, 'A enVolBorne : une borne insensee (' + String(b) + ') vaut 1 — ni blocage, ni lectures sans limite');
  }
  ok(J(await L.enVolBorne([], async () => 1, 4)) === '[]' && J(await L.enVolBorne(null, async () => 1, 4)) === '[]', 'A enVolBorne : une liste vide (ou absente) rend une liste vide');

  ok(J(await L.lireEnsemble([async () => { await pause(20); return 'a'; }, async () => 'b', () => 'c'])) === J(['a', 'b', 'c']), 'A lireEnsemble : les valeurs sont rendues dans l ordre de la liste');
  /* la lecture 0 rate TARD, la lecture 1 rate TOT : l erreur rendue est celle de la lecture 0 (l ordre de la liste) */
  let vol = 0;
  const lent = async (ms, e) => { vol += 1; await pause(ms); vol -= 1; if (e) throw new Error(e); return ms; };
  const r = await chrono(() => L.lireEnsemble([() => lent(60, 'erreur de la lecture 0'), () => lent(5, 'erreur de la lecture 1'), () => lent(30, null)]));
  ok(r.e && /erreur de la lecture 0/.test(r.e.message), 'A lireEnsemble : l erreur levee est la PREMIERE dans l ordre de la liste, pas la premiere arrivee');
  ok(vol === 0, 'A lireEnsemble : quand elle leve, plus AUCUNE lecture n est en vol (elle a attendu les autres)');

  /* lecteurBorne : dix appels d un coup, borne 3 */
  const f = noeud((a) => (a.data === 'ko' ? { e: 'refus du noeud' } : { v: 'r' + a.data, ms: 15 }));
  const borne = L.lecteurBorne(f.rpc, 3);
  const dix = await Promise.all(Array.from({ length: 10 }, (_, i) => borne('eth_call', [{ to: '0x1', data: String(i) }, 'latest'])));
  ok(f.s.max === 3 && f.s.appels === 10, 'A lecteurBorne : dix appels demandes d un coup, jamais plus de 3 en vol (max : ' + f.s.max + ')');
  ok(J(dix) === J(Array.from({ length: 10 }, (_, i) => 'r' + i)), 'A lecteurBorne : chaque appelant recoit SA reponse');
  ok(J(f.s.journal.map((a) => a.data)) === J(Array.from({ length: 10 }, (_, i) => String(i))), 'A lecteurBorne : les appels partent dans l ordre ou ils ont ete demandes (file)');
  const suite = await Promise.allSettled([borne('eth_call', [{ to: '0x1', data: 'ko' }]), borne('eth_call', [{ to: '0x1', data: 'ko' }]), borne('eth_call', [{ to: '0x1', data: 'ko' }]),
    borne('eth_call', [{ to: '0x1', data: 'apres' }]), borne('eth_call', [{ to: '0x1', data: 'apres2' }])]);
  ok(suite[0].status === 'rejected' && /refus du noeud/.test(suite[0].reason.message) && suite[3].status === 'fulfilled' && suite[3].value === 'rapres' && suite[4].value === 'rapres2' && f.s.enVol === 0,
    'A lecteurBorne : une erreur passe telle quelle, et libere sa place (les appels suivants aboutissent)');
  const casse = L.lecteurBorne(() => { throw new Error('lecteur casse'); }, 2);
  const c1 = await chrono(() => casse('eth_call', []));
  const c2 = await chrono(() => casse('eth_call', []));
  const c3 = await chrono(() => casse('eth_call', []));
  ok(c1.e && c2.e && c3.e && /lecteur casse/.test(c3.e.message), 'A lecteurBorne : un lecteur qui leve sans promesse rend un rejet, et ne bloque pas la file (3 appels, borne 2)');
}

console.log('— B. meilleureClePourMontant : la meme reponse que la version en file');
/* ⛔ LA REFERENCE : la fonction telle qu elle etait AVANT (commit 9ab857e), recopiee ici mot pour mot — un devis apres l autre. */
async function referenceMeilleureCle({ rpc, chaine, de, vers, montant, candidates = CLES_PRIX } = {}) {
  const Q = E.QUOTEUR[Number(chaine)];
  const adr = (x) => String(x || '').toLowerCase();
  const estAdr = (x) => /^0x[0-9a-f]{40}$/.test(adr(x));
  if (!Q) return { etat: 'REFUSE', cle: null, pourquoi: 'no v4 quoter on this network here' };
  if (!estAdr(de) || !estAdr(vers)) {
    return { etat: 'REFUSE', cle: null, pourquoi: 'both tokens must be whole addresses' };
  }
  if (adr(de) === adr(vers)) {
    return { etat: 'REFUSE', cle: null, pourquoi: 'the two tokens are the same' };
  }
  let m;
  try { m = BigInt(montant); } catch (_) { m = 0n; }
  if (m <= 0n) return { etat: 'REFUSE', cle: null, pourquoi: 'the amount must be above zero' };

  const liste = Array.isArray(candidates) ? candidates : [];
  let best = null, cotees = 0;
  for (const k of liste) {
    const cle = P.cleDePool(adr(de), adr(vers), k);
    const zeroForOne = adr(cle.currency0) === adr(de);
    let quote;
    try {
      const r = await rpc('eth_call', [{ to: Q, data: P.encodeQuote({ cle, zeroForOne, montant: m }) }, 'latest']);
      quote = BigInt('0x' + String(r).slice(2, 66));
    } catch (_) {
      continue;
    }
    if (quote <= 0n) continue;
    cotees += 1;
    if (!best || quote > best.quote) {
      best = { cle, zeroForOne, quote, fee: k.fee, tickSpacing: k.tickSpacing };
    }
  }
  if (!best) {
    return { etat: 'NON_MESURE', cle: null, zeroForOne: null, quote: null,
      essayees: liste.length, cotees,
      pourquoi: 'no v4 pool among the ' + liste.length + ' tried combinations quoted this pair at this '
        + 'size — that is what we looked at, not proof that none exists' };
  }
  return { etat: 'OK', ...best, essayees: liste.length, cotees, pourquoi: null };
}
/** Le faux noeud des devis : il repond PAR CALLDATA (pas par rang d appel) — la reponse d un candidat ne depend donc pas de l ordre
 *  d arrivee. `reponses[i]` : un entier (le devis), null (l appel leve), ou { v, e, ms }. */
function devisPour(de, vers, montant, candidats, reponses) {
  const t = new Map();
  candidats.forEach((k, i) => {
    const cle = P.cleDePool(de, vers, k);
    t.set(P.encodeQuote({ cle, zeroForOne: String(cle.currency0).toLowerCase() === de, montant }), reponses[i]);
  });
  return (a) => {
    const r = t.get(a.data);
    if (a.to !== QUOTEUR || r === undefined) return { e: 'appel inattendu' };
    if (r === null) return { e: 'pool absente' };
    return typeof r === 'bigint' ? { v: mot(r) } : r;
  };
}
const K9 = [{ fee: 100, tickSpacing: 1 }, { fee: 500, tickSpacing: 10 }, { fee: 3000, tickSpacing: 60 }, { fee: 10000, tickSpacing: 200 }, { fee: 0, tickSpacing: 200 },
  { fee: 5000, tickSpacing: 200 }, { fee: 30000, tickSpacing: 200 }, { fee: 2500, tickSpacing: 50 }, { fee: 8000, tickSpacing: 160 }];
const SCENARIOS = {
  meilleur: { de: ETH, vers: USDC, candidats: CLES_PRIX, reponses: [10n, 90n, 20n, 5n] },
  /* le 2e ET le 3e candidat rendent 90 ; le 2e repond TARD (120 ms), le 3e TOT (10 ms) : juger a l arrivee choisirait le 3e */
  egalite: { de: ETH, vers: USDC, candidats: CLES_PRIX, reponses: [50n, { v: mot(90n), ms: 120 }, { v: mot(90n), ms: 10 }, 5n] },
  leve: { de: ETH, vers: USDC, candidats: CLES_PRIX, reponses: [null, 50n, null, 80n] },
  zeros: { de: ETH, vers: USDC, candidats: CLES_PRIX, reponses: [0n, 0n, 7n, 0n] },
  rien: { de: ETH, vers: USDC, candidats: CLES_PRIX, reponses: [null, null, null, null] },
  toutZero: { de: ETH, vers: USDC, candidats: CLES_PRIX, reponses: [0n, 0n, 0n, 0n] },
  illisible: { de: ETH, vers: USDC, candidats: CLES_PRIX, reponses: [{ v: '0x' }, 30n, { v: undefined }, 20n] },
  neuf: { de: ETH, vers: USDC, candidats: K9, reponses: [3n, 9n, 27n, 81n, 243n, 99n, 81n, 243n, 1n] },
  inverse: { de: USDC, vers: ETH, candidats: CLES_PRIX, reponses: [10n, 90n, 20n, 5n] },
  avecHook: { de: ETH, vers: BLOCK, candidats: [{ fee: 0, tickSpacing: 200, hooks: HOOK_V8 }].concat(CLES_PRIX), reponses: [70n, null, null, null, null] },
  /* la cle lue ET une cle de prix rendent le meme devis : la cle lue, PREMIERE de la liste, doit gagner */
  hookEgalite: { de: ETH, vers: BLOCK, candidats: [{ fee: 0, tickSpacing: 200, hooks: HOOK_V8 }].concat(CLES_PRIX), reponses: [{ v: mot(70n), ms: 90 }, 70n, 70n, 70n, 70n] },
};
async function comparer(nom, Mod = E) {
  const sc = SCENARIOS[nom], montant = 1000n;
  const a = noeud(devisPour(sc.de, sc.vers, montant, sc.candidats, sc.reponses)), b = noeud(devisPour(sc.de, sc.vers, montant, sc.candidats, sc.reponses));
  const ref = await chrono(() => referenceMeilleureCle({ rpc: a.rpc, chaine: 8453, de: sc.de, vers: sc.vers, montant, candidates: sc.candidats }));
  const neuf = await chrono(() => Mod.meilleureClePourMontant({ rpc: b.rpc, chaine: 8453, de: sc.de, vers: sc.vers, montant, candidates: sc.candidats }));
  const tri = (s) => J(s.journal.map((x) => x.data).sort());
  return { ref, neuf, a: a.s, b: b.s, memeReponse: !ref.e && !neuf.e && J(ref.r) === J(neuf.r), memesAppels: a.s.appels === b.s.appels && tri(a.s) === tri(b.s), enVolAuRetour: b.s.enVol };
}
const mesures = {};
for (const nom of Object.keys(SCENARIOS)) {
  const x = await comparer(nom); mesures[nom] = x;
  ok(x.memeReponse, 'B « ' + nom + ' » : reponse IDENTIQUE a la version en file, champs et ordre des champs compris (' + String(x.neuf.r && x.neuf.r.etat) + ')');
  ok(x.memesAppels && x.enVolAuRetour === 0, 'B « ' + nom + ' » : les MEMES appels (' + x.b.appels + '), ni un de plus ni un de moins, et rien en vol au retour');
  ok(x.a.max === 1 && x.b.max <= N, 'B « ' + nom + ' » : la reference lit en file (1 en vol), la fonction jamais plus de ' + N + ' (max : ' + x.b.max + ')');
}
{
  const g = mesures.meilleur.neuf.r;
  ok(g.etat === 'OK' && g.quote === 90n && g.fee === CLES_PRIX[1].fee && g.cotees === 4 && g.essayees === 4, 'B le meilleur devis gagne (90, 2e candidat)');
  ok(J(Object.keys(g)) === J(['etat', 'cle', 'zeroForOne', 'quote', 'fee', 'tickSpacing', 'essayees', 'cotees', 'pourquoi']), 'B les champs rendus : etat, cle, zeroForOne, quote, fee, tickSpacing, essayees, cotees, pourquoi');
  const eg = mesures.egalite.neuf.r;
  ok(eg.quote === 90n && eg.fee === CLES_PRIX[1].fee && eg.tickSpacing === CLES_PRIX[1].tickSpacing, 'B a devis EGAL, le PREMIER candidat de la liste gagne — meme quand il repond 110 ms apres l autre');
  const he = mesures.hookEgalite.neuf.r;
  ok(he.etat === 'OK' && String(he.cle.hooks).toLowerCase() === HOOK_V8.toLowerCase() && he.fee === 0, 'B a devis egal, la cle LUE (premiere de la liste) passe avant les cles de prix sans hook');
  const lv = mesures.leve.neuf.r;
  ok(lv.etat === 'OK' && lv.quote === 80n && lv.cotees === 2 && lv.essayees === 4, 'B un candidat qui leve est saute, sans arreter les autres (2 cotees sur 4 essayees)');
  ok(mesures.zeros.neuf.r.cotees === 1 && mesures.zeros.neuf.r.quote === 7n, 'B un devis de zero ne compte pas comme une cotation');
  ok(mesures.rien.neuf.r.etat === 'NON_MESURE' && mesures.rien.neuf.r.cle === null && mesures.rien.neuf.r.cotees === 0 && mesures.rien.neuf.r.essayees === 4, 'B aucun candidat cote : NON_MESURE (pas REFUSE), 0 cotee sur 4 essayees');
  ok(mesures.illisible.neuf.r.quote === 30n && mesures.illisible.neuf.r.cotees === 2, 'B une reponse illisible (0x, ou rien) est sautee comme une lecture ratee');
  ok(mesures.inverse.neuf.r.zeroForOne === false && mesures.meilleur.neuf.r.zeroForOne === true, 'B la direction est toujours derivee de la paire (les deux sens different)');
  ok(mesures.neuf.b.max === N, 'B neuf candidats : exactement ' + N + ' devis en vol au plus (max : ' + mesures.neuf.b.max + ')');
  const q = mesures.meilleur, nf = mesures.neuf;
  ok(q.neuf.ms * 2 < q.ref.ms, 'B TEMPS, 4 candidats a ' + DELAI + ' ms : ' + q.ref.ms + ' ms en file, ' + q.neuf.ms + ' ms ensemble (moins de la moitie)');
  ok(nf.neuf.ms * 2 < nf.ref.ms, 'B TEMPS, 9 candidats a ' + DELAI + ' ms : ' + nf.ref.ms + ' ms en file, ' + nf.neuf.ms + ' ms ensemble (moins de la moitie)');
  /* un candidat mal forme : les deux versions levent la meme erreur ; la fonction n a alors rien lu */
  const f = noeud(() => ({ v: mot(1n) }));
  const kr = await chrono(() => referenceMeilleureCle({ rpc: noeud(() => ({ v: mot(1n) })).rpc, chaine: 8453, de: ETH, vers: USDC, montant: 5n, candidates: [CLES_PRIX[0], null] }));
  const kn = await chrono(() => E.meilleureClePourMontant({ rpc: f.rpc, chaine: 8453, de: ETH, vers: USDC, montant: 5n, candidates: [CLES_PRIX[0], null] }));
  ok(J(kr.r) === J(kn.r) && String(kr.e && kr.e.name) === String(kn.e && kn.e.name) && (kn.e ? f.s.appels === 0 : true),
    'B un candidat mal forme (null) : meme issue que la version en file (' + (kn.e ? kn.e.name + ', et aucune lecture envoyee' : 'pas d erreur') + ')');
  const refus = noeud(() => ({ v: mot(1n) }));
  const rf = await E.meilleureClePourMontant({ rpc: refus.rpc, chaine: 8453, de: ETH, vers: ETH, montant: 5n });
  ok(rf.etat === 'REFUSE' && refus.s.appels === 0, 'B un refus d entree n envoie toujours AUCUN appel');
}

console.log('— C. marche.js : les decimales gardees, le reste relu');
{
  M.oublierDecimales();
  const T = '0xb2000000000000000000000000000000000000c1', T0 = '0xb2000000000000000000000000000000000000c0', T255 = '0xb2000000000000000000000000000000000000cf';
  let panne = true;
  const f = noeud((a) => {
    if (a.data !== SEL.dec) return { e: 'appel inattendu' };
    if (a.to === T0) return { v: mot(0) };
    if (a.to === T255) return { v: mot(255) };
    if (a.to === T && panne) return { e: 'rate limit' };
    return { v: mot(8), ms: 1 };
  });
  const p1 = await chrono(() => M.decimalesLues({ rpc: f.rpc, stateView: SV, jeton: T }));
  ok(p1.e && /rate limit/.test(p1.e.message), 'C decimales : une lecture ratee LEVE (elle ne rend pas une valeur inventee)');
  panne = false;
  const avant = f.s.appels;
  const d1 = await M.decimalesLues({ rpc: f.rpc, stateView: SV, jeton: T });
  ok(d1 === 8 && f.s.appels === avant + 1, 'C decimales : la panne n a PAS ete gardee — la lecture suivante repart sur la chaine et rend 8');
  const d2 = await M.decimalesLues({ rpc: f.rpc, stateView: SV, jeton: T.toUpperCase().replace('0X', '0x') });
  ok(d2 === 8 && f.s.appels === avant + 1, 'C decimales : la 2e demande (meme jeton, autre casse) ne lit plus rien');
  const d3 = await M.decimalesLues({ rpc: f.rpc, stateView: V4_ADRESSES[84532].stateView, jeton: T });
  ok(d3 === 8 && f.s.appels === avant + 2, 'C decimales : la meme adresse sur une AUTRE chaine (autre StateView) est relue');
  const z1 = await M.decimalesLues({ rpc: f.rpc, stateView: SV, jeton: T0 }), nz = f.s.appels, z2 = await M.decimalesLues({ rpc: f.rpc, stateView: SV, jeton: T0 });
  ok(z1 === 0 && z2 === 0 && f.s.appels === nz + 1, 'C decimales : un 0 est rendu tel quel mais JAMAIS garde (c est la forme d une non-reponse)');
  const h1 = await M.decimalesLues({ rpc: f.rpc, stateView: SV, jeton: T255 }), nh = f.s.appels, h2 = await M.decimalesLues({ rpc: f.rpc, stateView: SV, jeton: T255 });
  ok(h1 === 255 && h2 === 255 && f.s.appels === nh + 1, 'C decimales : une valeur hors bornes (255) n est pas gardee non plus');
  M.oublierDecimales();
  const na = f.s.appels; await M.decimalesLues({ rpc: f.rpc, stateView: SV, jeton: T });
  ok(f.s.appels === na + 1, 'C decimales : `oublierDecimales()` vide la memoire');
}
/* une action tokenisee a pool v4 USDC (cle LUE dans cles-v4-actions.js) : c est le chemin `vieEnDevise` */
const aero = new Set([...POOLS_ACTIONS_AERODROME.keys()].map((k) => String(k).toLowerCase()));
const ACTION = String(ACTIONS_COINBASE.find((a) => !aero.has(String(a.adr).toLowerCase())).adr).toLowerCase();
const CLE_ACTION = LOGS_INITIALIZE_ACTIONS.map(decoderInitialize).map((d) => d && d.cle).find((c) => c && [String(c.currency0).toLowerCase(), String(c.currency1).toLowerCase()].includes(ACTION));
const ID_ACTION = P.poolId({ currency0: CLE_ACTION.currency0, currency1: CLE_ACTION.currency1, fee: Number(CLE_ACTION.fee), tickSpacing: Number(CLE_ACTION.tickSpacing), hooks: CLE_ACTION.hooks }).slice(2);
function marcheAction(etat) {
  return (a) => {
    if (a.data === SEL.slot0 + ID_ACTION) return { v: mot(etat.sqrt) + '0'.repeat(64 * 3) };
    if (a.data.startsWith(SEL.slot0)) return { v: mot(0) + '0'.repeat(64 * 3) };
    if (a.data === SEL.dec) return etat.panneDec ? { e: 'rate limit' } : { v: mot(a.to === USDC ? 6 : 8) };
    if (a.data === SEL.supply) return etat.panneSupply ? { e: 'rate limit' } : { v: mot(etat.supply) };
    if (a.data.startsWith(SEL.liq)) return { v: mot(10n ** 18n) };
    return { v: mot(0) };
  };
}
async function lireAction(Mod, etat) {
  const f = noeud(marcheAction(etat));
  const r = await chrono(() => Mod.vieDuBlock({ rpc: f.rpc, stateView: SV, jeton: ACTION, clesExactes: [CLE_ACTION], deviseDAbord: true }));
  return { v: r.r, ms: r.ms, s: f.s };
}
{
  M.oublierDecimales();
  const etat = { sqrt: 1n << 96n, supply: 10n ** 16n };
  const froid = await lireAction(M, etat);
  const prix = P.prixDepuisSqrt({ sqrtPriceX96: etat.sqrt, decDevise: 6, decBlock: 8, deviseEst0: String(CLE_ACTION.currency0).toLowerCase() === USDC });
  const attendue = capitalisation({ supply: etat.supply, decimales: 8, prix, devise: 'USDC' }).valeur;
  ok(froid.v.etat === 'LUE' && froid.v.devise === 'USDC' && froid.v.decimales === 8 && froid.v.decDevise === 6 && froid.v.vie === attendue && froid.v.sqrtPriceX96 === etat.sqrt
    && String(froid.v.deviseAdr).toLowerCase() === USDC && froid.v.paire === 'DEVISE', 'C marche d une action : LUE en USDC, decimales 8 et 6, capitalisation = supply x prix (' + attendue + ')');
  ok(froid.s.appels === 4 && froid.s.max === 3 && froid.s.enVol === 0, 'C … premiere lecture : 4 appels (prix, 2 decimales, supply), dont 3 partis ENSEMBLE apres le prix (max en vol : ' + froid.s.max + ')');
  /* la meme chose en file, sur le meme faux noeud : 4 appels l un apres l autre */
  const file = noeud(marcheAction(etat));
  const enFile = await chrono(async () => { for (const d of [SEL.slot0 + ID_ACTION, SEL.dec, SEL.dec, SEL.supply]) await file.rpc('eth_call', [{ to: ACTION, data: d }, 'latest']); });
  ok(froid.ms < enFile.ms * 0.75, 'C … TEMPS : ' + enFile.ms + ' ms pour ces 4 appels en file, ' + froid.ms + ' ms ici (2 allers-retours)');
  const chaud = await lireAction(M, etat);
  ok(chaud.s.appels === 2 && J(chaud.v) === J(froid.v), 'C … 2e lecture : 2 appels seulement (prix + supply), et la MEME reponse');
  const plus = await lireAction(M, { sqrt: etat.sqrt, supply: 3n * 10n ** 16n });
  ok(plus.v.vie === capitalisation({ supply: 3n * 10n ** 16n, decimales: 8, prix, devise: 'USDC' }).valeur && plus.v.vie !== froid.v.vie, 'C … la SUPPLY est relue a chaque fois (jamais gardee) : elle triple, la capitalisation triple');
  const cher = await lireAction(M, { sqrt: 2n << 96n, supply: etat.supply });
  ok(cher.v.sqrtPriceX96 === (2n << 96n) && cher.v.vie !== froid.v.vie, 'C … le PRIX est relu a chaque fois (jamais garde)');
  M.oublierDecimales();
  const panne = await lireAction(M, { sqrt: etat.sqrt, supply: etat.supply, panneSupply: true });
  ok(panne.v.etat !== 'LUE' && panne.s.enVol === 0, 'C … supply illisible : pas de marche LUE (etat ' + panne.v.etat + '), et rien en vol au retour');
  M.oublierDecimales();
  const panneD = await lireAction(M, { sqrt: etat.sqrt, supply: etat.supply, panneDec: true });
  ok(panneD.v.etat !== 'LUE' && panneD.s.enVol === 0, 'C … decimales illisibles (memoire vide) : pas de marche LUE non plus — jamais 18 par defaut');
}
/* un block cote en ETH sur le hook V8 : c est la fin de `vieDuBlock` (decimales, supply, liquidite) */
const CLE_BLOCK = P.cleDePool(ETH, BLOCK, { fee: 0, tickSpacing: 200, hooks: HOOK_V8 });
const ID_BLOCK = P.poolId(CLE_BLOCK).slice(2);
function marcheBlock(etat) {
  return (a) => {
    if (a.data === SEL.slot0 + ID_BLOCK) return { v: mot(1n << 96n) + '0'.repeat(64 * 3) };
    if (a.data.startsWith(SEL.slot0)) return { v: mot(0) + '0'.repeat(64 * 3) };
    if (a.data === SEL.dec) return etat.panneDec ? { e: 'rate limit' } : { v: mot(18) };
    if (a.data === SEL.supply) return etat.panneSupply ? { e: 'rate limit' } : { v: mot(10n ** 27n) };
    if (a.data === SEL.liq + ID_BLOCK) return etat.panneLiq ? { e: 'rate limit' } : { v: mot(5n * 10n ** 18n) };
    return { v: mot(0) };
  };
}
async function lireBlock(Mod, etat) {
  const f = noeud(marcheBlock(etat));
  const r = await chrono(() => Mod.vieDuBlock({ rpc: f.rpc, stateView: SV, jeton: BLOCK, clesExactes: [CLE_BLOCK] }));
  return { v: r.r, ms: r.ms, s: f.s };
}
{
  M.oublierDecimales();
  const b = await lireBlock(M, {});
  ok(b.v.etat === 'LUE' && b.v.devise === 'ETH' && b.v.decimales === 18 && b.v.liquidite === 5n * 10n ** 18n && String(b.v.cle.hooks).toLowerCase() === HOOK_V8.toLowerCase() && b.v.vie === 10 ** 9,
    'C marche d un block (ETH, hook V8) : LUE, decimales 18, liquidite rendue, capitalisation 1e9 ETH au prix 1');
  ok(b.s.appels === 4 && b.s.max === 3 && b.s.enVol === 0, 'C … 4 appels : le prix, puis decimales + supply + liquidite ENSEMBLE (max en vol : ' + b.s.max + ')');
  M.oublierDecimales();
  const s = await lireBlock(M, { panneSupply: true });
  ok(s.v.etat === 'NON_LUE' && /decimals or supply unread/.test(String(s.v.pourquoi)) && s.s.enVol === 0, 'C … supply illisible : NON_LUE « decimals or supply unread », comme avant, et rien en vol au retour');
  M.oublierDecimales();
  const d = await lireBlock(M, { panneDec: true });
  ok(d.v.etat === 'NON_LUE' && /decimals or supply unread/.test(String(d.v.pourquoi)), 'C … decimales illisibles : NON_LUE (jamais 18 par defaut)');
  M.oublierDecimales();
  const l = await lireBlock(M, { panneLiq: true });
  ok(l.v.etat === 'LUE' && l.v.liquidite === null, 'C … liquidite illisible : le marche reste LU, la liquidite vaut null (non lue, pas zero)');
}

console.log('— D. echange.js : poolActuelleDuBlock et les autorisations');
/* ⛔ LA REFERENCE : `poolActuelleDuBlock` telle qu elle etait AVANT (9ab857e) — prix puis liquidite, en file. */
async function referencePoolActuelle({ rpc, stateView, cle, hooks }) {
  let ratees = 0;
  const motLu = (r) => (r && String(r).length >= 66 ? BigInt(String(r).slice(0, 66)) : null);
  for (const h of hooks) {
    const c = { currency0: cle.currency0, currency1: cle.currency1, fee: 0, tickSpacing: 200, hooks: h };
    const id = P.poolId(c).slice(2);
    let s0, lq;
    try {
      s0 = motLu(await rpc('eth_call', [{ to: stateView, data: '0x' + P.selecteur('getSlot0(bytes32)') + id }, 'latest']));
      lq = motLu(await rpc('eth_call', [{ to: stateView, data: '0x' + P.selecteur('getLiquidity(bytes32)') + id }, 'latest']));
    } catch { ratees += 1; continue; }
    if (s0 === null || lq === null) { ratees += 1; continue; }
    if (s0 !== 0n && lq > 0n) return { cle: c, ratees };
  }
  return { cle: null, ratees };
}
const H1 = '0x00000000000000000000000000000000000a11cc', H2 = '0x00000000000000000000000000000000000b22cc';
const idHook = (h) => P.poolId({ currency0: ETH, currency1: BLOCK, fee: 0, tickSpacing: 200, hooks: h }).slice(2);
function poolsParHook(table) {
  const t = new Map();
  for (const [h, x] of Object.entries(table)) { t.set(SEL.slot0 + idHook(h), x.s0); t.set(SEL.liq + idHook(h), x.lq); }
  return (a) => { const r = t.get(a.data); if (r === undefined || r === null) return { e: 'rate limit' }; return typeof r === 'bigint' ? { v: mot(r) } : r; };
}
const HOOKS_SC = {
  premierVivant: { [H1]: { s0: 5n, lq: 9n }, [H2]: { s0: 5n, lq: 9n } },
  prixIllisible: { [H1]: { s0: null, lq: 9n }, [H2]: { s0: 5n, lq: 9n } },
  liquiditeCourte: { [H1]: { s0: 5n, lq: { v: '0x' } }, [H2]: { s0: 5n, lq: 9n } },
  sansLiquidite: { [H1]: { s0: 5n, lq: 0n }, [H2]: { s0: 0n, lq: 0n } },
  sansPrix: { [H1]: { s0: 0n, lq: 9n }, [H2]: { s0: 5n, lq: 9n } },
  toutIllisible: { [H1]: { s0: null, lq: null }, [H2]: { s0: 5n, lq: null } },
};
async function comparerHooks(nom, Mod = E) {
  const a = noeud(poolsParHook(HOOKS_SC[nom])), b = noeud(poolsParHook(HOOKS_SC[nom]));
  const args = { stateView: SV, cle: { currency0: ETH, currency1: BLOCK }, hooks: [H1, H2] };
  const ref = await chrono(() => referencePoolActuelle({ rpc: a.rpc, ...args }));
  const neuf = await chrono(() => Mod.poolActuelleDuBlock({ rpc: b.rpc, ...args }));
  return { ref, neuf, a: a.s, b: b.s, meme: J(ref.r) === J(neuf.r) };
}
{
  const h = {};
  for (const nom of Object.keys(HOOKS_SC)) {
    h[nom] = await comparerHooks(nom);
    ok(h[nom].meme && h[nom].b.enVol === 0, 'D poolActuelleDuBlock « ' + nom + ' » : reponse identique a la version en file (ratees : ' + h[nom].neuf.r.ratees + ', pool ' + (h[nom].neuf.r.cle ? 'trouvee' : 'absente') + ')');
  }
  ok(h.premierVivant.b.appels === 2 && h.premierVivant.a.appels === 2 && h.premierVivant.b.max === 2, 'D … premier hook vivant : 2 appels, partis ENSEMBLE — le hook suivant n est PAS lu (aucune lecture en plus)');
  ok(h.sansLiquidite.neuf.r.cle === null && h.sansLiquidite.neuf.r.ratees === 0, 'D … un prix sans liquidite n est pas une pool : rien de rendu, et 0 lecture ratee');
}
/* les deux autorisations de `finaliser`, par une VENTE de block (cote en ETH, hook V8) : un devis, puis les deux autorisations */
function venteBlock(etat) {
  return (a) => {
    if (a.to === QUOTEUR) return { v: mot(10n ** 15n) };
    if (a.to === BLOCK && a.data.startsWith(SEL.allowance)) return etat.panne === 1 ? { e: 'rate limit' } : { v: mot(etat.pose ? (1n << 255n) : 0n) };
    if (a.to === PERMIT2.toLowerCase() && a.data.startsWith(SEL.allowanceP2)) return etat.panne === 2 ? { e: 'rate limit', ms: 5 } : { v: mot(etat.pose ? (1n << 159n) : 0n) + mot(etat.pose ? (1n << 47n) : 0n).slice(2) + mot(0).slice(2) };
    if (a.to === ROUTEUR) return { v: '0x' };
    return { e: 'appel inattendu ' + a.to + ' ' + a.data.slice(0, 10) };
  };
}
async function vendre(Mod, etat) {
  const f = noeud(venteBlock(etat));
  const r = await chrono(() => Mod.planEchange({ rpc: f.rpc, chaine: 8453, jeton: BLOCK, compte: COMPTE, sens: 'VENTE', montant: 10n ** 18n,
    marcheLu: { etat: 'LUE', cle: CLE_BLOCK }, maintenant: 1900000000000 }));
  const lectures = f.s.journal.filter((a) => a.data.startsWith(SEL.allowance) || a.data.startsWith(SEL.allowanceP2));
  return { p: r.r, e: r.e, ms: r.ms, s: f.s, lectures, ensemble: lectures.length === 2 && lectures[1].debut < lectures[0].fin };
}
{
  const v = await vendre(E, {});
  ok(!v.e && v.p.etat === 'APPROBATIONS' && v.p.etapes.length === 2 && v.p.etapes[0].to === BLOCK && String(v.p.etapes[1].to).toLowerCase() === PERMIT2.toLowerCase(),
    'D vente d un block sans autorisation : APPROBATIONS, les deux etapes dans l ordre (le jeton vers Permit2, puis Permit2 vers le routeur)' + (v.e ? ' — ' + v.e.message : v.p.etat === 'APPROBATIONS' ? '' : ' — ' + v.p.etat + ' ' + v.p.pourquoi));
  ok(v.s.appels === 3 && v.ensemble && v.s.max === 2, 'D … 3 appels (un devis, deux autorisations) ; les deux autorisations sont parties ENSEMBLE (max en vol : ' + v.s.max + ')');
  const p1 = await vendre(E, { panne: 1 }), p2 = await vendre(E, { panne: 2 });
  ok(p1.p.etat === 'NON_MESURE' && p1.p.pourquoi === 'an approval could not be read' && p1.s.enVol === 0, 'D … 1re autorisation illisible : NON_MESURE « an approval could not be read », rien en vol au retour');
  ok(p2.p.etat === 'NON_MESURE' && p2.p.pourquoi === 'an approval could not be read' && p2.s.enVol === 0, 'D … 2e autorisation illisible (et qui rate AVANT que la 1re reponde) : NON_MESURE aussi, rien en vol au retour');
  const pose = await vendre(E, { pose: true });
  ok(pose.p.etat === 'PRET' && pose.p.etapes.length === 0 && !!pose.p.tx, 'D temoin : autorisations posees, le plan continue jusqu a PRET (les autorisations sont lues, jamais supposees)');
  const pose2 = await vendre(E, {});
  ok(pose2.p.etat === 'APPROBATIONS' && pose2.lectures.length === 2, 'D … et elles sont RELUES au plan suivant (jamais gardees) : sans autorisation, de nouveau APPROBATIONS');
}

console.log('— E. poolAerodromeDe : la meme reponse que la version en file');
/* ⛔ LA REFERENCE : `poolAerodromeDe` telle qu elle etait AVANT (9ab857e) — un espacement apres l autre. */
const nulle = (a) => /^0x0{40}$/i.test(String(a || ''));
const ADR40 = /^0x[0-9a-fA-F]{40}$/;
async function referencePoolAerodrome({ rpc, a, b, espacements = PF.ESPACEMENTS_CL } = {}) {
  const appel = async (to, data) => rpc('eth_call', [{ to, data }, 'latest']);
  const bas = (x) => String(x || '').toLowerCase();
  if (!ADR40.test(String(a || '')) || !ADR40.test(String(b || ''))) {
    return { etat: 'REFUSE', pourquoi: 'both tokens must be whole addresses' };
  }
  let essayes = 0, refus = 0;
  const trouvees = [];
  for (const ts of espacements) {
    const c = C.calldataGetPool({ tokenA: a, tokenB: b, tickSpacing: ts });
    if (c.etat !== 'PRET') continue;
    essayes += 1;
    let r;
    try { r = await appel(c.to, c.data); } catch (_) { refus += 1; continue; }
    const adresse = '0x' + String(r).slice(-40);
    if (nulle(adresse)) continue;
    let prof = null;
    try { prof = BigInt(String(await appel(a, K.selecteur('balanceOf(address)') + adresse.slice(2).toLowerCase().padStart(64, '0')))); }
    catch (_) { prof = null; }
    trouvees.push({ adresse, ts, prof });
  }
  if (trouvees.length) {
    const lues = trouvees.filter((x) => x.prof !== null);
    if (trouvees.length > 1 && !lues.length) {
      return { etat: 'NON_MESURE', essayes, refus,
        pourquoi: trouvees.length + ' pools were found but none of their depths could be read, so which one is real is unknown' };
    }
    const choisie = lues.length ? lues.reduce((m, x) => (x.prof > m.prof ? x : m)) : trouvees[0];
    let t0 = null;
    try { t0 = '0x' + String(await appel(choisie.adresse, K.selecteur('token0()'))).slice(-40); }
    catch (_) { t0 = null; }
    if (!t0 || !ADR40.test(t0)) {
      return { etat: 'NON_MESURE', pourquoi: 'the pool was found but token0() could not be read, '
        + 'so the swap direction is unknown — and a direction is never guessed' };
    }
    return { etat: 'PRET', pool: bas(choisie.adresse), tickSpacing: choisie.ts, token0: bas(t0),
      entreeEst0: bas(t0) === bas(a), essayes, refus, trouvees: trouvees.length,
      profondeur: choisie.prof === null ? null : String(choisie.prof) };
  }
  if (refus > 0) {
    return { etat: 'NON_MESURE', essayes, refus,
      pourquoi: refus + ' of the ' + essayes + ' tick spacings could not be read, so "no pool" '
        + 'would be our blindness and not a fact about the chain' };
  }
  return { etat: 'REFUSE', essayes, refus,
    pourquoi: 'the factory knows no pool for this pair on any of the ' + essayes
      + ' declared tick spacings' };
}
const X = '0xb2000000000000000000000000000000000000a1';
const PA = '0x00000000000000000000000000000000000000a1', PB = '0x00000000000000000000000000000000000000b2', PC = '0x00000000000000000000000000000000000000c3';
function factory({ pools = {}, profs = {}, refuse = [], profIllisible = false, token0 = USDC, token0Illisible = false }) {
  const parData = new Map(PF.ESPACEMENTS_CL.map((ts) => [C.calldataGetPool({ tokenA: USDC, tokenB: X, tickSpacing: ts }).data, ts]));
  const selBal = K.selecteur('balanceOf(address)'), selT0 = K.selecteur('token0()');
  return (a) => {
    if (parData.has(a.data)) { const ts = parData.get(a.data); return refuse.includes(ts) ? { e: 'rate limit' } : { v: mot(pools[ts] ? BigInt(pools[ts]) : 0n) }; }
    if (a.data.startsWith(selBal)) { const p = '0x' + a.data.slice(-40); return profIllisible ? { e: 'rate limit' } : { v: mot(profs[p] === undefined ? 0n : profs[p]) }; }
    if (a.data === selT0) return token0Illisible ? { e: 'rate limit' } : { v: mot(BigInt(token0)) };
    return { e: 'appel inattendu' };
  };
}
const AERO_SC = {
  plusProfonde: { pools: { 1: PA, 10: PB }, profs: { [PA]: 0n, [PB]: 845308n * 10n ** 6n } },
  egalite: { pools: { 10: PA, 100: PB, 200: PC }, profs: { [PA]: 7n, [PB]: 9n, [PC]: 9n } },
  uneSeule: { pools: { 50: PA }, profs: { [PA]: 12n } },
  refusEtPool: { pools: { 10: PB }, profs: { [PB]: 5n }, refuse: [1, 2000] },
  aveugle: { pools: {}, refuse: [80] },
  aucune: { pools: {} },
  profondeursIllisibles: { pools: { 1: PA, 10: PB }, profIllisible: true },
  uneSansProfondeur: { pools: { 100: PC }, profIllisible: true },
  sensIllisible: { pools: { 10: PB }, profs: { [PB]: 5n }, token0Illisible: true },
  sensInverse: { pools: { 10: PB }, profs: { [PB]: 5n }, token0: X },
};
async function comparerAero(nom, Mod = PF) {
  const a = noeud(factory(AERO_SC[nom])), b = noeud(factory(AERO_SC[nom]));
  const ref = await chrono(() => referencePoolAerodrome({ rpc: a.rpc, a: USDC, b: X }));
  const neuf = await chrono(() => Mod.poolAerodromeDe({ rpc: b.rpc, a: USDC, b: X }));
  const tri = (s) => J(s.journal.map((x) => x.to + x.data).sort());
  return { ref, neuf, a: a.s, b: b.s, meme: !ref.e && !neuf.e && J(ref.r) === J(neuf.r), memesAppels: a.s.appels === b.s.appels && tri(a.s) === tri(b.s) };
}
{
  const r = {};
  for (const nom of Object.keys(AERO_SC)) {
    r[nom] = await comparerAero(nom);
    ok(r[nom].meme && r[nom].memesAppels && r[nom].b.enVol === 0 && r[nom].b.max <= N && r[nom].a.max === 1,
      'E « ' + nom + ' » : reponse identique a la version en file (' + r[nom].neuf.r.etat + '), memes appels (' + r[nom].b.appels + '), jamais plus de ' + N + ' en vol (max : ' + r[nom].b.max + ')');
  }
  ok(r.plusProfonde.neuf.r.pool === PB && r.plusProfonde.neuf.r.tickSpacing === 10 && r.plusProfonde.neuf.r.trouvees === 2, 'E la pool la plus PROFONDE gagne (espacement 10), pas la premiere trouvee');
  ok(r.egalite.neuf.r.pool === PB && r.egalite.neuf.r.tickSpacing === 100, 'E a profondeur EGALE, la premiere dans l ordre des espacements gagne (100 avant 200)');
  ok(r.refusEtPool.neuf.r.etat === 'PRET' && r.refusEtPool.neuf.r.refus === 2 && r.refusEtPool.neuf.r.essayes === 9, 'E deux espacements illisibles et une pool trouvee : PRET, et les 2 refus sont COMPTES');
  ok(r.aveugle.neuf.r.etat === 'NON_MESURE' && r.aveugle.neuf.r.refus === 1, 'E aucune pool mais une lecture ratee : NON_MESURE (notre cecite, pas un fait)');
  ok(r.aucune.neuf.r.etat === 'REFUSE' && r.aucune.neuf.r.essayes === 9, 'E aucune pool, tout lu : REFUSE (les 9 espacements essayes)');
  ok(r.sensInverse.neuf.r.entreeEst0 === false && r.plusProfonde.neuf.r.entreeEst0 === true, 'E le sens vient toujours de token0() lu sur la pool');
  ok(r.plusProfonde.b.max === N, 'E les espacements sont lus a ' + N + ' de front (max en vol : ' + r.plusProfonde.b.max + ')');
  ok(r.plusProfonde.neuf.ms * 2 < r.plusProfonde.ref.ms, 'E TEMPS, 12 appels a ' + DELAI + ' ms : ' + r.plusProfonde.ref.ms + ' ms en file, ' + r.plusProfonde.neuf.ms + ' ms ensemble (moins de la moitie)');
}

console.log('— F. planRail : un plan entier (action v4 > block)');
/* Le faux noeud d un plan : toute pool v4 demandee existe (prix 1), tout devis rend 1e15, aucune autorisation n est posee.
 * ⛔ BORNE : il ne prouve aucun PRIX — seulement que le plan lit la meme chose, dans les memes bornes, et rend la meme reponse. */
function chaineDuPlan(etat = {}) {
  return (a) => {
    const ms = etat.ms;
    if (a.to === QUOTEUR) return { v: mot(10n ** 15n), ms };
    if (a.data.startsWith(SEL.slot0)) return { v: mot(etat.sansPool ? 0n : (1n << 96n)) + '0'.repeat(64 * 3), ms };
    if (a.data.startsWith(SEL.liq)) return { v: mot(10n ** 18n), ms };
    if (a.data === SEL.dec) return { v: mot(a.to === USDC ? 6 : (a.to === ACTION ? 8 : 18)), ms };
    if (a.data === SEL.supply) return { v: mot(10n ** 24n), ms };
    if (a.data.startsWith(SEL.allowance)) return { v: mot(0), ms };
    if (a.data.startsWith(SEL.allowanceP2)) return { v: mot(0) + mot(0).slice(2) + mot(0).slice(2), ms };
    return { v: mot(0), ms };
  };
}
async function planifier(dir, etat = {}, clesBlock = async () => [CLE_BLOCK]) {
  const R = await imp('rails-api.js', dir), Mm = await imp('marche.js', dir);
  Mm.oublierDecimales();
  const f = noeud(chaineDuPlan(etat));
  const clesDe = async (x) => (String(x).toLowerCase() === ACTION ? (etat.actionSansCle ? [] : [CLE_ACTION]) : clesBlock(x));
  const r = await chrono(() => R.planRail({ de: ACTION, vers: BLOCK, montant: '1000000', compte: COMPTE }, { rpc: f.rpc, clesDe, maintenant: 1900000000000 }));
  /* les lectures de marche : decimales et supply de l action (A), decimales et supply du block (B) */
  const marche = (jeton) => f.s.journal.filter((x) => x.to === jeton && (x.data === SEL.dec || x.data === SEL.supply));
  const mA = marche(ACTION), mB = marche(BLOCK);
  return { p: r.r, e: r.e, ms: r.ms, s: f.s, ensemble: mA.length > 0 && mB.length > 0 && Math.min(...mB.map((x) => x.debut)) < Math.max(...mA.map((x) => x.fin)) };
}
const FILE = muter('lectures-en-vol.js', 'export const LECTURES_EN_VOL_MAX = 4;', 'export const LECTURES_EN_VOL_MAX = 1;');
{
  const plan = await planifier(ICI);
  ok(!plan.e && plan.p.route === 'ACTION>BLOCK' && plan.p.etat === 'APPROBATIONS' && plan.p.via === 'planEchangeMultiSauts' && plan.p.aSigner.length === 2 && plan.p.resume && plan.p.resume.sauts === 3,
    'F le plan : route ACTION>BLOCK, trois sauts v4 (action > USDC > ETH > block), APPROBATIONS — 2 autorisations a signer' + (plan.p.etat === 'APPROBATIONS' ? '' : ' — ' + plan.p.etat + ' ' + plan.p.pourquoi));
  ok(plan.s.max === N && plan.s.enVol === 0, 'F jamais plus de ' + N + ' lectures en vol sur TOUT le plan, et ' + N + ' sont bien parties ensemble (max : ' + plan.s.max + ', ' + plan.s.appels + ' lectures)');
  ok(plan.ensemble, 'F les deux marches (l action et le block) sont lus ENSEMBLE : le block est demande avant que l action ait fini de repondre');
  /* la variante EN FILE : le meme depot, la borne forcee a 1 — c est l ordre d avant, une lecture apres l autre */
  const file = await planifier(FILE.dir);
  ok(FILE.une && file.s.max === 1, 'F variante en file (borne forcee a 1) : une seule lecture en vol');
  ok(J(file.p) === J(plan.p), 'F la reponse du plan est IDENTIQUE a celle de la variante en file (octet pour octet, apres JSON)');
  ok(file.s.appels === plan.s.appels, 'F et il lit exactement le meme nombre de fois : ' + plan.s.appels + ' lectures des deux cotes');
  ok(plan.ms < file.ms * 0.75, 'F TEMPS, ' + plan.s.appels + ' lectures a ' + DELAI + ' ms : ' + file.ms + ' ms en file, ' + plan.ms + ' ms ensemble');
  /* la cle lue du block gagne l egalite du 3e saut : si une cle de prix SANS hook gagnait, le plan serait refuse (pas de pool sans hook pour un block) */
  ok(!/Not tradable|no market the app can trade/.test(String(plan.p.pourquoi || '')), 'F a devis egal sur le saut ETH > block, c est la cle LUE (hook V8) qui est retenue — pas une cle de prix sans hook');
  /* A est refuse (aucune pool), la lecture de B LEVE : la reponse doit rester le refus de A, comme quand B n etait jamais lu */
  const refusA = await planifier(ICI, { sansPool: true, ms: 1, actionSansCle: true }, async () => { throw new Error('B could not be listed'); });
  ok(!refusA.e && refusA.p.etat === 'REFUSE' && /the block market could not be read: no initialized pool/.test(String(refusA.p.pourquoi)),
    'F le marche de l action est refuse ET la lecture du block leve : la reponse reste le refus de l ACTION (etat ' + refusA.p.etat + ')');
  const erreurB = await planifier(ICI, {}, async () => { throw new Error('B could not be listed'); });
  ok(erreurB.p.etat === 'NON_MESURE' && /B could not be listed/.test(String(erreurB.p.pourquoi)), 'F le marche de l action est bon et la lecture du block leve : NON_MESURE, avec la raison du block (comme avant)');
}

console.log('— G. MUTANTS (sur des copies du depot)');
async function mutant(nom, fichier, de, vers, rougeSi) {
  const m = muter(fichier, de, vers);
  let rouge = false;
  try { rouge = !!(await rougeSi(m.dir)); } catch (_) { rouge = true; }
  ok(m.une && rouge, 'G mutant « ' + nom + ' » : ROUGE' + (m.une ? '' : ' (⛔ la chaine a muter n est pas dans ' + fichier + ' exactement une fois)'));
}
{
  await mutant('egalite : le dernier gagne (>= au lieu de >)', 'echange.js', 'if (!best || quote > best.quote) {\n      best = { cle: e.cle,'.replace('\n', os.EOL === '\r\n' && lire('echange.js').includes('\r\n') ? '\r\n' : '\n'), 'if (!best || quote >= best.quote) {\n      best = { cle: e.cle,',
    async (dir) => !(await comparer('egalite', await imp('echange.js', dir))).memeReponse);
  await mutant('les devis sont juges dans l ordre inverse de la liste', 'echange.js', 'for (const [i, e] of essais.entries()) {', 'for (const [i, e] of [...essais.entries()].reverse()) {',
    async (dir) => !(await comparer('hookEgalite', await imp('echange.js', dir))).memeReponse);
  await mutant('un candidat qui leve ARRETE le balayage', 'echange.js', "if (!issues[i].ok) continue; /* ⛔ une combinaison absente ne dit rien des autres */", 'if (!issues[i].ok) break;',
    async (dir) => !(await comparer('leve', await imp('echange.js', dir))).memeReponse);
  await mutant('devis sans borne (99 a la fois)', 'echange.js', '  }, LECTURES_EN_VOL_MAX);', '  }, 99);',
    async (dir) => (await comparer('neuf', await imp('echange.js', dir))).b.max > N);
  await mutant('devis de nouveau en file (1 a la fois)', 'echange.js', '  }, LECTURES_EN_VOL_MAX);', '  }, 1);',
    async (dir) => { const x = await comparer('neuf', await imp('echange.js', dir)); return x.memeReponse && !(x.neuf.ms * 2 < x.ref.ms) && x.b.max !== N; });
  await mutant('enVolBorne ignore sa borne', 'lectures-en-vol.js', '{ length: borneSaine(borne, elements.length) }', '{ length: elements.length }',
    async (dir) => { const Lm = await imp('lectures-en-vol.js', dir); let v = 0, mx = 0; await Lm.enVolBorne([1, 2, 3, 4, 5, 6, 7, 8, 9], async () => { v += 1; if (v > mx) mx = v; await pause(5); v -= 1; }, 4); return mx > 4 && (await comparer('neuf', await imp('echange.js', dir))).b.max > N; });
  await mutant('lireEnsemble avale les erreurs', 'lectures-en-vol.js', 'for (const x of issues) if (!x.ok) throw x.erreur;', '',
    /* ⛔ 2026-10-09 (revue de sauvetage) : ce mutant SURVIVAIT — via `finaliser`, `BigInt(undefined)` echoue dans le meme `try` et
     *   cache l erreur avalee. On le juge maintenant DIRECTEMENT : lireEnsemble doit REJETER, avec la premiere erreur de la liste. */
    async (dir) => {
      const Lm = await imp('lectures-en-vol.js', dir);
      const lente = async (ms, e) => { await pause(ms); if (e) throw new Error(e); return ms; }; /* locale : un nom absent leverait et passerait pour « rouge » */
      try { await Lm.lireEnsemble([() => lente(20, 'erreur 0'), () => lente(1, null)]); return true; } /* aucune erreur levee : avalee */
      catch (e) { return !/erreur 0/.test(String(e && e.message)); }
    });
/* ⛔ TEMOIN du juge ci-dessus, sur le module NON mute : il doit etre VERT (sinon le mutant « rouge » ne prouverait rien) */
{
  const Lv = await imp('lectures-en-vol.js');
  let leve = null;
  try { await Lv.lireEnsemble([async () => { await pause(20); throw new Error('erreur 0'); }, async () => 1]); } catch (e) { leve = e; }
  ok(leve && /erreur 0/.test(leve.message), 'G temoin : lireEnsemble NON mute rejette avec la premiere erreur de la liste');
}
  await mutant('lecteurBorne ne borne plus', 'lectures-en-vol.js', 'if (enVol < max) lancer(); else file.push(lancer);', 'lancer();',
    async (dir) => (await planifier(dir)).s.max > N);
  await mutant('planRail lit avec le lecteur recu, sans borne', 'rails-api.js', "typeof rpcRecu === 'function' ? lecteurBorne(rpcRecu, LECTURES_EN_VOL_MAX) : rpcRecu;", 'rpcRecu;',
    async (dir) => { const x = await planifier(dir); return x.s.max > N && J(x.p) === J((await planifier(ICI)).p); });
  await mutant('les deux marches de nouveau en file', 'rails-api.js', 'enVolBorne(jetons, (a) => marcheDe(a), jetons.length);', 'enVolBorne(jetons, (a) => marcheDe(a), 1);',
    async (dir) => { const x = await planifier(dir); return !x.ensemble && x.p.etat === 'APPROBATIONS'; });
  await mutant('une erreur du 2e marche passe devant le refus du 1er (Promise.all)', 'rails-api.js', 'const marchesDe = (...jetons) => enVolBorne(jetons, (a) => marcheDe(a), jetons.length);',
    'const marchesDe = async (...jetons) => (await Promise.all(jetons.map((a) => marcheDe(a)))).map((valeur) => ({ ok: true, valeur }));',
    async (dir) => { const x = await planifier(dir, { sansPool: true, ms: 1, actionSansCle: true }, async () => { throw new Error('B could not be listed'); }); return x.p.etat !== 'REFUSE'; });
  await mutant('un 0 de decimales est garde', 'marche.js', 'if (Number.isInteger(d) && d >= 1 && d <= 36) {', 'if (Number.isInteger(d) && d >= 0 && d <= 36) {',
    async (dir) => { const Mm = await imp('marche.js', dir); const f = noeud(() => ({ v: mot(0), ms: 1 })); const T0 = '0xb2000000000000000000000000000000000000c0'; await Mm.decimalesLues({ rpc: f.rpc, stateView: SV, jeton: T0 }); await Mm.decimalesLues({ rpc: f.rpc, stateView: SV, jeton: T0 }); return f.s.appels !== 2; });
  await mutant('la memoire des decimales ignore la chaine', 'marche.js', "const k = String(stateView || '').toLowerCase() + ':' + String(jeton || '').toLowerCase();", "const k = String(jeton || '').toLowerCase();",
    async (dir) => { const Mm = await imp('marche.js', dir); const f = noeud(() => ({ v: mot(8), ms: 1 })); const T = '0xb2000000000000000000000000000000000000c1'; await Mm.decimalesLues({ rpc: f.rpc, stateView: SV, jeton: T }); await Mm.decimalesLues({ rpc: f.rpc, stateView: V4_ADRESSES[84532].stateView, jeton: T }); return f.s.appels !== 2; });
  await mutant('la memoire des decimales n est jamais remplie', 'marche.js', 'decimalesConnues.set(k, d);', '',
    async (dir) => { const Mm = await imp('marche.js', dir); Mm.oublierDecimales(); const e = { sqrt: 1n << 96n, supply: 10n ** 16n }; await lireAction(Mm, e); return (await lireAction(Mm, e)).s.appels !== 2; });
  await mutant('decimales + supply de nouveau en file (marche d une action)', 'marche.js', "async () => BigInt(String(await rpc('eth_call', [{ to: jeton, data: '0x' + selecteur('totalSupply()') }, 'latest'])).slice(0, 66)),\n      ]);".replace('\n', lire('marche.js').includes('\r\n') ? '\r\n' : '\n'),
    "async () => BigInt(String(await rpc('eth_call', [{ to: jeton, data: '0x' + selecteur('totalSupply()') }, 'latest'])).slice(0, 66)),\n      ], 1);",
    async (dir) => { const Mm = await imp('marche.js', dir); Mm.oublierDecimales(); const x = await lireAction(Mm, { sqrt: 1n << 96n, supply: 10n ** 16n }); return x.v.etat === 'LUE' && x.s.max === 1; });
  await mutant('decimales + supply + liquidite de nouveau en file (marche d un block)', 'marche.js', '], (f) => f());', '], (f) => f(), 1);',
    async (dir) => { const Mm = await imp('marche.js', dir); Mm.oublierDecimales(); const x = await lireBlock(Mm, {}); return x.v.etat === 'LUE' && x.s.max === 1; });
  await mutant('la liquidite d une pool prise pour son prix', 'echange.js', 'lq = mot(brutLq);', 'lq = mot(brutS0);',
    async (dir) => !(await comparerHooks('sansLiquidite', await imp('echange.js', dir))).meme);
  await mutant('un getPool qui leve n est plus compte', 'plan-franchissement.js', 'if (!x.ok) { refus += 1; continue; }', 'if (!x.ok) continue;',
    async (dir) => !(await comparerAero('aveugle', await imp('plan-franchissement.js', dir))).meme);
  await mutant('espacements sans borne (99 a la fois)', 'plan-franchissement.js', '  }, LECTURES_EN_VOL_MAX);', '  }, 99);',
    async (dir) => (await comparerAero('plusProfonde', await imp('plan-franchissement.js', dir))).b.max > N);
  await mutant('espacements de nouveau en file', 'plan-franchissement.js', '  }, LECTURES_EN_VOL_MAX);', '  }, 1);',
    async (dir) => { const x = await comparerAero('plusProfonde', await imp('plan-franchissement.js', dir)); return x.meme && !(x.neuf.ms * 2 < x.ref.ms) && x.b.max === 1; });
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions)');
process.exit(ko ? 1 : 0);
