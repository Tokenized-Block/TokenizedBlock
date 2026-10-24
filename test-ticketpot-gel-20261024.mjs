/* test-ticketpot-gel-20261024.mjs — LES PARTS SIGNEES NE BOUGENT PLUS ; LE POT N EST JAMAIS SUR-ALLOUE ; LE DERNIER JOUR DE SEMAINE = POT DE SEMAINE.
 * Revue adverse 2026-10-24 (audit-ticketpot, constats 1 et 3), URGENT : l owner signe les premieres parts hebdo (S1, J2026-10-25) le lundi 26.
 * EXECUTE la vraie route /api/ticketpot/parts + /api/ticketpot/signature de serveur-web.js (le bloc decoupe, plus niveauSrv / joursTicketSrv
 *   decoupes aussi), montee par new Function avec les VRAIS modules (tirage-saison, niveaux-jeu, ticketpot-parts, ticketpot-plan, signeur) ;
 *   seuls la lecture de chaine (lireJour : pot ferme 100 USDC, verifier = cle de TEST publique), l horloge et les caches sont simules.
 * AFFIRME :
 *  [1a] le bonus de niveau de la semaine est calcule A LA DATE du dernier jour de la semaine : un jour avec ticket gagne APRES la semaine
 *       (mardi suivant) ne change pas les poids ; un jour gagne DANS la semaine, si (temoin : la borne n ignore pas tout) ;
 *  [1b] GEL : a la premiere signature d une cle (jour ou jour#S) la table exacte (poids | tickets, potAtClose, at) est gardee dans
 *       revenu.ticketpotGel ; ensuite les montants et digests ne changent plus (XP cumulee qui monte, ticket credite en retard) et la signature
 *       deja servie reste rendue ; une cle signee AVANT ce correctif (sans gel) est gelee a la premiere lecture si toutes ses signatures tiennent ;
 *  [1c] GARDE : un POST est refuse si la somme des montants deja gardes pour ce jour (cle jour ET cle jour#S, meme dayPot) + ce montant
 *       depasse potAtClose — quelle qu en soit la cause ; re-deposer la MEME part n est pas compte deux fois ;
 *  [2]  POST en mode JOUR refuse pour le dernier jour d une semaine (son pot est celui de la semaine) ; GET jour le dit (dernierJourSemaine) ;
 *       un autre jour, accepte ; attester-ticketpot.html (script EXECUTE) passe d elle-meme en mode semaine sur ce jour et dit pourquoi.
 *  MUTANTS (sur des COPIES en memoire de la source) : chaque correctif retire -> son scenario ROUGIT.
 * ⛔ NE PROUVE PAS : une signature du vrai wallet verifier, un claim reel, la lecture de chaine reelle, ni la persistance disque (revenu.json).
 *   Les compteurs XP (revenu.xpEtat) sont cumules sans historique par jour : un niveau franchi apres la semaine PAR CES COMPTEURS change
 *   encore les poids d une semaine NON signee — seul le gel le fige (scenario 1b). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { saisonDe, jourDe, JOUR_MS, joursEntre, entreesPeriode, SEUIL_VOLUME_JOUR_USD, ticketsJour } from './tirage-saison.js';
import { joursTicketParWallet, niveauWallet, bonusNiveauxSemaine } from './niveaux-jeu.js';
import { partsDuJour as partsTicketPot, verifierSignaturePart } from './ticketpot-parts.js';
import { dayDeJourId as dayDeJourIdPot } from './ticketpot-plan.js';
import { signerDigest, adresseDe } from './signeur-secp256k1.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const lire = (f) => fs.readFileSync(path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };

const CLE = '0x' + (0xA11CE).toString(16).padStart(64, '0'); /* cle de TEST publique des bancs du depot */
const VERIF = adresseDe(CLE).toLowerCase();
const CT = '0xf98621bf4313e47af35b3344bdda112a32391df1';
const A = '0x' + 'a1'.repeat(20), B = '0x' + 'b2'.repeat(20), C = '0x' + 'c3'.repeat(20);
const POT = 100000000n;
const DIM = 'J2026-10-25', MER = 'J2026-10-21';
const T_LUNDI = Date.UTC(2026, 9, 26, 10), T_MERCREDI = Date.UTC(2026, 9, 28, 12);

function monter(srcSrv, etat, horloge) {
  const bloc = srcSrv.slice(srcSrv.indexOf("if (chemin === '/api/ticketpot/parts' || chemin === '/api/ticketpot/signature') {"), srcSrv.indexOf("if (chemin === '/api/jeu/niveau') {"));
  const niv = srcSrv.slice(srcSrv.indexOf('const joursTicketCache = '), srcSrv.indexOf('setInterval(() => {', srcSrv.indexOf('function niveauSrv(')));
  if (bloc.length < 500 || niv.length < 200) throw new Error('decoupe introuvable');
  class D extends Date { constructor(...a) { if (a.length) super(...a); else super(horloge.t); } static now() { return horloge.t; } }
  const passe = { obtenir: (k, f) => Promise.resolve().then(f), invalider() {} };
  const deps = {
    revenu: etat, Date: D, TICKETPOT_DEPLOIEMENT: { adresse: CT }, dayDeJourIdPot, saisonDe, jourDe, JOUR_MS, joursEntre, entreesPeriode, SEUIL_VOLUME_JOUR_USD,
    bonusNiveauxSemaine, joursTicketParWallet, niveauWallet, ticketsJour, partsTicketPot, verifierSignaturePart,
    jourChaineTP: passe, partsCacheTP: passe, rpcServeur: null,
    lireJourTicketPot: async () => ({ ferme: true, enPause: false, potAtClose: POT, reste: POT, verifier: VERIF }),
    couvertureParts: () => ({ complete: true }), BLOCKROLLS_DEPLOIEMENT: { adresse: null }, horodatageBloc: async () => null, BLOCKSKINS_SRV: null,
  };
  const noms = Object.keys(deps);
  const corps = 'let revenuSale = false;\n' + niv + '\nreturn async function route(chemin, req, res) {\n' + bloc + '\n};';
  return new Function(...noms, corps)(...noms.map((k) => deps[k]));
}
function appeler(route, method, url, corps) {
  return new Promise((fin) => {
    const ecoute = {};
    const req = { method, url, on: (ev, f) => { ecoute[ev] = f; }, destroy() {} };
    const res = { code: 0, writeHead(c) { this.code = c; }, end(b) { let j = null; try { j = JSON.parse(b); } catch (_) { j = null; } fin({ code: this.code, corps: j }); } };
    void route(new URL(url, 'http://x').pathname, req, res);
    if (method === 'POST') { ecoute.data(JSON.stringify(corps)); ecoute.end(); }
  });
}
const parts = async (route, jourId, sem) => (await appeler(route, 'GET', '/api/ticketpot/parts?day=' + jourId + (sem ? '&week=1' : ''))).corps;
async function signer(route, jourId, sem, wallet, partsLues) {
  const p = (partsLues || (await parts(route, jourId, sem))).parts.find((x) => x.wallet === wallet);
  if (!p) return { code: 0, corps: { ok: false, pourquoi: 'pas de part' } };
  return appeler(route, 'POST', '/api/ticketpot/signature', { day: jourId, wallet, signature: signerDigest(CLE, p.digest), week: !!sem });
}
/* l etat : A et B ont un ticket (>= 10 $) les 3 premiers jours de la semaine S1 ; B a 20 XP de rolls (+ 3 jours x 3 = 29 XP : niveau 2, L3 a 30) */
function etatBase() {
  const jours = {};
  for (const j of ['J2026-10-19', 'J2026-10-20', MER]) jours[j] = { [A]: { usd: 20, hashes: ['0x' + '1'.repeat(64)] }, [B]: { usd: 20, hashes: ['0x' + '2'.repeat(64)] } };
  return { jours, passes: {}, xpEtat: { xp: { [B]: { roll: 20 } }, vus: {} }, depuis: '2026-10-16T00:00:00.000Z' };
}
const montants = (r) => Object.fromEntries(((r && r.parts) || []).map((p) => [p.wallet, p.amount]));

async function scenarios(src) {
  const R = {};
  const essai = async (nom, f) => { try { R[nom] = await f(); } catch (e) { R[nom] = false; R[nom + ':err'] = String(e && e.message || e); } };
  /* [1a] B gagne un jour avec ticket le MARDI APRES la semaine -> le niveau de la semaine ne bouge pas */
  await essai('1a-apres-semaine', async () => {
    const h = { t: T_MERCREDI }, e = etatBase(); e.jours['J2026-10-27'] = { [B]: { usd: 15, hashes: ['0x' + '3'.repeat(64)] } };
    const r = await parts(monter(src, e, h), DIM, true);
    return r && r.ok === true && r.poids[A] === 3 && r.poids[B] === 3 && montants(r)[A] === '50000000' && montants(r)[B] === '50000000';
  });
  await essai('1a-temoin-dans-semaine', async () => {
    const h = { t: T_MERCREDI }, e = etatBase(); e.jours['J2026-10-22'] = { [B]: { usd: 15, hashes: ['0x' + '3'.repeat(64)] } };
    const r = await parts(monter(src, e, h), DIM, true);
    return r && r.ok === true && r.poids[A] === 3 && r.poids[B] === 5; /* 4 jours + niveau 3 (32 XP) : +1 */
  });
  /* [1b] lundi : A signe la semaine ; puis l XP cumulee de B franchit L3 (une action de plus) -> rien ne bouge, la signature tient */
  await essai('1b-gel-semaine', async () => {
    const h = { t: T_LUNDI }, e = etatBase(), route = monter(src, e, h);
    const t1 = await parts(route, DIM, true);
    const s = await signer(route, DIM, true, A, t1);
    if (!(s.code === 200 && s.corps.ok)) return false;
    const g = (e.ticketpotGel || {})[DIM + '#S'];
    const gelOk = !!g && g.poids && g.poids[A] === 3 && g.poids[B] === 3 && String(g.potAtClose) === POT.toString() && /^\d{4}-\d{2}-\d{2}T/.test(String(g.at));
    e.xpEtat.xp[B].roll = 21; h.t = T_MERCREDI; e.jours['J2026-10-27'] = { [B]: { usd: 15, hashes: ['0x' + '3'.repeat(64)] } };
    const t2 = await parts(route, DIM, true);
    const pa1 = t1.parts.find((p) => p.wallet === A), pa2 = t2.parts.find((p) => p.wallet === A), pb1 = t1.parts.find((p) => p.wallet === B), pb2 = t2.parts.find((p) => p.wallet === B);
    const sb = await signer(route, DIM, true, B, t2);
    return gelOk && pa2.digest === pa1.digest && pa2.amount === '50000000' && typeof pa2.signature === 'string' && pb2.digest === pb1.digest && pb2.amount === '50000000' && sb.code === 200 && sb.corps.ok === true;
  });
  await essai('1b-gel-jour', async () => {
    const h = { t: Date.UTC(2026, 9, 22, 9) }, e = etatBase(), route = monter(src, e, h);
    const s = await signer(route, MER, false, A);
    if (!(s.code === 200 && s.corps.ok)) return false;
    const g = (e.ticketpotGel || {})[MER];
    e.jours[MER][C] = { usd: 30, hashes: ['0x' + '4'.repeat(64)] }; /* un ticket credite EN RETARD sur ce jour deja signe */
    const t2 = await parts(route, MER, false);
    return !!g && Array.isArray(g.tickets) && g.tickets.length === 2 && t2.parts.length === 2 && montants(t2)[A] === '50000000' && !!t2.parts.find((p) => p.wallet === A).signature && !montants(t2)[C];
  });
  await essai('1b-gel-paresseux', async () => {
    const h = { t: Date.UTC(2026, 9, 22, 9) }, e = etatBase(), route = monter(src, e, h);
    const t1 = await parts(route, 'J2026-10-20', false), pa = t1.parts.find((p) => p.wallet === A);
    e.ticketpotSig = { 'J2026-10-20': { [A]: { digest: pa.digest, signature: signerDigest(CLE, pa.digest), amount: pa.amount, deadline: pa.deadline, ticket: pa.ticket, recue: '2026-10-21T08:00:00.000Z' } } };
    const t2 = await parts(route, 'J2026-10-20', false); /* premiere lecture apres le correctif : gele */
    e.jours['J2026-10-20'][C] = { usd: 30, hashes: ['0x' + '5'.repeat(64)] };
    const t3 = await parts(route, 'J2026-10-20', false);
    return !!(e.ticketpotGel || {})['J2026-10-20'] && t2.parts.length === 2 && t3.parts.length === 2 && t3.parts.find((p) => p.wallet === A).digest === pa.digest && !!t3.parts.find((p) => p.wallet === A).signature;
  });
  /* [1c] la garde : parts du jour deja gardees (avant le correctif) pour le dimanche + part hebdo -> refuse ; somme forgee sur la meme cle -> refuse */
  await essai('1c-garde-deux-modes', async () => {
    const h = { t: T_LUNDI }, e = etatBase(), route = monter(src, e, h);
    e.ticketpotSig = { [DIM]: { [A]: { digest: '0x' + '0'.repeat(64), signature: '0x' + '1'.repeat(130), amount: '50000000' }, [B]: { digest: '0x' + '0'.repeat(64), signature: '0x' + '1'.repeat(130), amount: '50000000' } } };
    const s = await signer(route, DIM, true, A);
    return s.code === 400 && s.corps.ok === false && !((e.ticketpotSig[DIM + '#S'] || {})[A]);
  });
  await essai('1c-garde-meme-cle', async () => {
    const h = { t: Date.UTC(2026, 9, 22, 9) }, e = etatBase(), route = monter(src, e, h);
    e.ticketpotSig = { [MER]: { [C]: { digest: '0x' + '0'.repeat(64), signature: '0x' + '1'.repeat(130), amount: '90000000' } } };
    const s = await signer(route, MER, false, A);
    return s.code === 400 && s.corps.ok === false && !e.ticketpotSig[MER][A];
  });
  await essai('1c-temoin-pot-plein', async () => {
    const h = { t: T_LUNDI }, e = etatBase(), route = monter(src, e, h);
    const a1 = await signer(route, DIM, true, A), b1 = await signer(route, DIM, true, B), a2 = await signer(route, DIM, true, A);
    const somme = Object.values(e.ticketpotSig[DIM + '#S']).reduce((s, x) => s + BigInt(x.amount), 0n);
    return a1.corps.ok === true && b1.corps.ok === true && a2.corps.ok === true && somme === POT;
  });
  /* [2] mode jour sur le dernier jour de la semaine */
  await essai('2-refus-jour-dimanche', async () => {
    const h = { t: T_LUNDI }, e = etatBase(); e.jours[DIM] = { [A]: { usd: 20, hashes: ['0x' + '6'.repeat(64)] } };
    const route = monter(src, e, h), g = await parts(route, DIM, false);
    const s = await signer(route, DIM, false, A, g);
    return g.ok === true && g.dernierJourSemaine === true && s.code === 400 && s.corps.etat === 'REFUSE' && /week/i.test(s.corps.pourquoi) && !((e.ticketpotSig || {})[DIM] || {})[A];
  });
  await essai('2-temoin-jour-ordinaire', async () => {
    const h = { t: Date.UTC(2026, 9, 22, 9) }, e = etatBase(), route = monter(src, e, h), g = await parts(route, MER, false);
    const s = await signer(route, MER, false, A, g);
    return g.dernierJourSemaine === false && s.code === 200 && s.corps.ok === true;
  });
  return R;
}

/* la page du verifier, script EXECUTE */
async function page(srcPage, search, reponses) {
  const s0 = srcPage.indexOf('<script type="module">') + '<script type="module">'.length, s1 = srcPage.indexOf('</script>', s0);
  const el = {};
  const $el = (id) => (el[id] = el[id] || { id, value: '', checked: false, hidden: false, disabled: false, textContent: '', className: '', ecoute: {}, addEventListener(ev, f) { this.ecoute[ev] = f; }, append() {} });
  const document = { querySelector: (s) => $el(s.replace(/^#/, '')), createElement: () => ({ textContent: '', className: '' }) };
  const vus = [];
  const fetch = async (u) => { vus.push(u); const q = new URL(u, 'http://x').searchParams; return { json: async () => reponses(q.get('day'), q.get('week') === '1') }; };
  const corps = srcPage.slice(s0, s1).replace(/\bvoid lire\(\);\s*$/, 'return lire();');
  await new Function('document', 'location', 'fetch', 'window', 'URLSearchParams', corps)(document, { search }, fetch, {}, URLSearchParams);
  for (let k = 0; k < 5; k++) await new Promise((r) => setImmediate(r));
  return { el, vus };
}
const repPage = (day, week) => {
  const dernier = day === DIM;
  if (week && !dernier) return { ok: false, etat: 'REFUSE', pourquoi: 'the week pot lives on the LAST day of its week: ' + DIM };
  return { ok: true, ferme: true, mode: week ? 'SEMAINE' : 'JOUR', jourId: day, dernierJourSemaine: dernier, potAtClose: '100000000', verifier: VERIF,
    parts: [{ wallet: A, amount: week ? '50000000' : '100000000', signature: null, jourId: day }] };
};
async function scenariosPage(srcPage) {
  const R = {};
  try {
    const d = await page(srcPage, '?day=' + DIM, repPage);
    R['2-page-dimanche'] = d.el.semaine.checked === true && d.vus.some((u) => u.includes('day=' + DIM) && u.includes('week=1')) && /last day of its week/i.test(d.el.etat.textContent) && /weekly/i.test(d.el.etat.textContent);
    R['2-page-dimanche:texte'] = d.el.etat.textContent;
    const m = await page(srcPage, '?day=' + MER, repPage);
    R['2-page-temoin-mercredi'] = m.el.semaine.checked === false && !m.vus.some((u) => u.includes('week=1'));
    const w = await page(srcPage, '?day=' + DIM + '&week=1', repPage);
    R['2-page-lien-week'] = w.el.semaine.checked === true && w.vus.every((u) => u.includes('week=1'));
  } catch (e) { R['2-page-dimanche'] = false; R['2-page:err'] = String(e && e.message || e); }
  return R;
}

const SRV = lire('serveur-web.js'), PAGE = lire('attester-ticketpot.html');
const R = await scenarios(SRV);
const RP = await scenariosPage(PAGE);
const sections = {};
for (const [k, v] of Object.entries({ ...R, ...RP })) {
  if (k.includes(':')) continue;
  ok(v === true, k + (R[k + ':err'] || RP[k + ':err'] ? ' (' + (R[k + ':err'] || RP[k + ':err']) + ')' : '') + (k === '2-page-dimanche' ? ' — « ' + RP['2-page-dimanche:texte'] + ' »' : ''));
  const s = k.split('-')[0]; sections[s] = sections[s] || { ok: 0, ko: 0 }; sections[s][v === true ? 'ok' : 'ko'] += 1;
}

/* MUTANTS sur des copies en memoire : chaque correctif retire, son scenario doit rougir */
const MUTANTS = [
  { nom: 'niveau au jour courant (joursTicketSrv) au lieu du dernier jour de la semaine', de: /joursTicketParWallet\(jours, passes, jourId, SEUIL_VOLUME_JOUR_USD\)/, vers: 'joursTicketSrv()', rougit: '1a-apres-semaine' },
  { nom: 'gel jamais lu', de: /let gel = gelTP\(cleTP\);/, vers: 'let gel = null;', rougit: '1b-gel-semaine' },
  { nom: 'gel jamais ecrit au POST', de: /if \(!gelTP\(cleSig\)\) gelerTP\(cleSig, r\);/, vers: '', rougit: '1b-gel-jour' },
  { nom: 'gel paresseux retire', de: /if \(!gel && j\.ferme && sigsTenues\(\)\) gel = gelerTP\(cleTP, \{ mode: semaine \? 'SEMAINE' : 'JOUR', poids, parts: partsBrutes, potAtClose: j\.potAtClose \}\);/, vers: '', rougit: '1b-gel-paresseux' },
  { nom: 'garde : seulement la meme cle (pas l autre mode)', de: /for \(const k of \[jourId, jourId \+ '#S'\]\)/, vers: 'for (const k of [cleSig])', rougit: '1c-garde-deux-modes' },
  { nom: 'garde retiree', de: /if \(dejaGarde \+ BigInt\(p\.amount\) > BigInt\(r\.potAtClose\)\)/, vers: 'if (false)', rougit: '1c-garde-meme-cle' },
  { nom: 'garde qui compte deux fois la part re-deposee', de: /if \(k === cleSig && w === wallet\) continue;/, vers: '', rougit: '1c-temoin-pot-plein' },
  { nom: 'refus du mode jour le dernier jour retire', de: /if \(!semaine && dernierDeSemaine\(jourId\)\)/, vers: 'if (false)', rougit: '2-refus-jour-dimanche' },
];
let tues = 0;
for (const m of MUTANTS) {
  const present = m.de.test(SRV);
  if (!present) { ok(false, 'MUTANT ' + m.nom + ' : motif absent de la source'); continue; }
  const Rm = await scenarios(SRV.replace(m.de, m.vers));
  const t = Rm[m.rougit] !== true;
  if (t) tues += 1;
  ok(t, 'MUTANT ' + m.nom + ' -> ' + m.rougit + ' ROUGIT');
}
const MUTANTS_PAGE = [
  { nom: 'page : pas de bascule auto en semaine', de: /if \(!\$\('#semaine'\)\.checked && j\.dernierJourSemaine === true && !choixManuel\)/, vers: 'if (false)', rougit: '2-page-dimanche' },
];
for (const m of MUTANTS_PAGE) {
  if (!m.de.test(PAGE)) { ok(false, 'MUTANT ' + m.nom + ' : motif absent'); continue; }
  const Rm = await scenariosPage(PAGE.replace(m.de, m.vers));
  const t = Rm[m.rougit] !== true; if (t) tues += 1;
  ok(t, 'MUTANT ' + m.nom + ' -> ' + m.rougit + ' ROUGIT');
}
console.log('sections ' + JSON.stringify(sections) + ' ; mutants tues ' + tues + '/' + (MUTANTS.length + MUTANTS_PAGE.length));
console.log(n + ' assertions, ' + ko + ' KO — NE PROUVE PAS une signature du vrai verifier, un claim reel, ni la chaine reelle');
if (ko) process.exitCode = 1;
