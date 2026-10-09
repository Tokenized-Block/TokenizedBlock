/* test-reference-action-20261009.mjs — LE MULTIPLICATEUR B20 ET LA REFERENCE CHAINLINK, HORS RESEAU (rpc simule).
 *
 * A. les selecteurs sont RECALCULES par keccak, les constantes sont celles copiees de docs.base.org ;
 * B. les decodeurs, sur des reponses REELLES lues le 2026-10-09 (bloc 52 380 564) ;
 * C. TROIS ETATS par partie (LU / NON_LU / NON_DISPONIBLE) — un registre muet ne rend JAMAIS un multiplicateur, une action sans
 *    feed publie ne coute AUCUN appel de feed, une adresse hors registre ne coute AUCUN appel ; fraicheur (a jour, week-end,
 *    pause, perime) ; mise a jour programmee (ERC-8056) ;
 * D. l equivalent en actions en BigInt (brut * multiplicateur / 1e18, arrondi bas) — aucun flottant sur un montant brut ;
 * E. la ligne d avertissement (au-dela du seuil, pas a lui) — jamais sur une reference non lue ou absente ;
 * F. le planificateur : la reference s AJOUTE au resume, rien d autre ne change ; un plan sans resume reste identique ;
 * G. la page et le serveur : la route, la liste servie, le cablage du ticket ; les montants ENVOYES ne voient jamais le multiplicateur ;
 * H. mutants : (1) le multiplicateur applique aux puces de vente (un montant envoye) -> ROUGE ; (2) un registre muet rendu comme
 *    « × 1 » par le module -> ROUGE ; (3) la page qui ne garde plus l etat LU avant de multiplier -> ROUGE.
 * ⚠️ NE PROUVE PAS : qu un navigateur affiche la ligne (non execute ici), ni la valeur du jour en prod — voir le rapport.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { selecteur } from './keccak.js';
import { ACTIONS_COINBASE } from './paires.js';
import * as RA from './reference-action.js';
import { equivalentActions, etatMultiplicateur } from './multiplicateur-action.js';
import { ajouterReference, planRail } from './rails-api.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const lire = (f) => fs.readFileSync(path.join(ICI, f), 'utf8');
let n = 0, ko = 0;
function ok(cond, nom, vu) {
  n += 1;
  if (cond) { console.log('  ok   ' + nom); return; }
  ko += 1;
  console.log('  KO   ' + nom + (vu === undefined ? '' : '   vu: ' + JSON.stringify(vu, (k, v) => (typeof v === 'bigint' ? String(v) : v)).slice(0, 300)));
}
const sx = (s) => (s.startsWith('0x') ? s : '0x' + s);
const adrDe = (sym) => ACTIONS_COINBASE.find((a) => a.symbole === sym).adr.toLowerCase();
const NVDA = adrDe('NVDAc'), MRVL = adrDe('MRVLc');
const mot = (v) => BigInt(v).toString(16).padStart(64, '0');

console.log('— A. selecteurs et constantes');
ok(sx(selecteur('getOracleParams(address)')) === RA.SELECTEUR_GET_ORACLE_PARAMS, 'getOracleParams(address) recalcule = ' + RA.SELECTEUR_GET_ORACLE_PARAMS);
ok(sx(selecteur('latestRoundData()')) === RA.SELECTEUR_LATEST_ROUND_DATA, 'latestRoundData() recalcule');
ok(sx(selecteur('decimals()')) === RA.SELECTEUR_DECIMALS, 'decimals() recalcule');
ok(sx(selecteur('newUIMultiplier()')) === RA.SELECTEUR_NEW_UI_MULTIPLIER, 'newUIMultiplier() recalcule (0xdc767007, changelog Cobalt)');
ok(sx(selecteur('effectiveAt()')) === RA.SELECTEUR_EFFECTIVE_AT, 'effectiveAt() recalcule (0x97a4064f, changelog Cobalt)');
ok(RA.REGISTRE_ORACLE_COINBASE === '0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD', 'registre : la copie exacte de docs.base.org');
ok(RA.FEEDS_CHAINLINK.size === 10, '10 feeds (le tableau de docs.base.org), chacun rattache a une action de paires.js', RA.FEEDS_CHAINLINK.size);
ok(RA.FEEDS_CHAINLINK.get(NVDA) && RA.FEEDS_CHAINLINK.get(NVDA).feed === '0x04689a41629776563E6822F76f2e57D148d28513', 'NVDAc -> feed « Coinbase NVDA »');
ok(!RA.FEEDS_CHAINLINK.has(MRVL), 'MRVLc : aucun feed publie (troisieme etat, pas un repli)');
ok(RA.SEUIL_ECART_REFERENCE_BPS === 300, 'le seuil propose est une constante nommee (300 bps)');
ok(/PROPOSITION[^\n]*\n[^\n]*A CONFIRMER AVEC LUI/.test(lire('reference-action.js')) || /A CONFIRMER AVEC LUI/.test(lire('reference-action.js')), 'le commentaire du seuil dit que c est une proposition a confirmer avec le proprietaire');

console.log('— B. decodeurs, sur les reponses reelles');
const REG_NVDA = '0x0000000000000000000000000000000000000000000000000de29ff478c031490000000000000000000000000000000000000000000000000000000000000000';
const op = RA.decoderOracleParams(REG_NVDA);
ok(op && op.multiplicateur === 1000537939576369481n && op.pause === false, 'registre NVDAc : 1 000 537 939 576 369 481, pause false', op);
ok(RA.decoderOracleParams('0x') === null && RA.decoderOracleParams(REG_NVDA.slice(0, 66)) === null, 'reponse vide ou tronquee -> null');
ok(RA.decoderOracleParams('0x' + mot(1n) + mot(2n)) === null, 'un « bool » qui vaut 2 -> null (forme inattendue)');
ok(RA.decoderOracleParams('0x' + mot(0n) + mot(0n)) === null, 'un multiplicateur 0 -> null (jamais lu comme une valeur)');
const MAJ = 1791533467; /* 2026-10-09T08:11:07Z, updatedAt lu sur le feed NVDA */
const ROUND = '0x' + mot(36893488147419103761n) + mot(23488393543n) + mot(MAJ - 13) + mot(MAJ) + mot(36893488147419103761n);
const rd = RA.decoderRoundData(ROUND);
ok(rd && rd.reponse === 23488393543n && rd.majA === BigInt(MAJ), 'latestRoundData NVDA : 23 488 393 543, updatedAt 08:11:07Z', rd);
ok(RA.decoderRoundData('0x' + mot(1n) + 'f'.repeat(64) + mot(1n) + mot(1n) + mot(1n)) === null, 'une reponse negative (int256) -> null');

console.log('— C. trois etats, avec un rpc simule');
/* rpc simule : repond selon (to, selecteur) ; compte les appels */
function faux(regles) {
  const appels = [];
  const rpc = async (m, p) => {
    const to = String(p[0].to).toLowerCase(), data = String(p[0].data);
    appels.push(to + ' ' + data.slice(0, 10));
    for (const [cond, rep] of regles) if (cond(to, data)) { if (rep instanceof Error) throw rep; return typeof rep === 'function' ? rep() : rep; }
    throw new Error('unexpected call ' + to + ' ' + data.slice(0, 10));
  };
  return { rpc, appels };
}
const REG = RA.REGISTRE_ORACLE_COINBASE.toLowerCase(), FEED_NVDA = '0x04689a41629776563e6822f76f2e57d148d28513';
const estReg = (to) => to === REG, estFeed = (to) => to === FEED_NVDA;
const sel = (s) => (to, data) => data.startsWith(s);
const NORMAL = [
  [(to, d) => estReg(to) && d.startsWith(RA.SELECTEUR_GET_ORACLE_PARAMS), REG_NVDA],
  [(to, d) => d === RA.SELECTEUR_NEW_UI_MULTIPLIER, '0x' + mot(1000537939576369481n)],
  [(to, d) => d === RA.SELECTEUR_EFFECTIVE_AT, '0x' + mot(0n)],
  [(to, d) => estFeed(to) && d === RA.SELECTEUR_DECIMALS, '0x' + mot(8n)],
  [(to, d) => estFeed(to) && d === RA.SELECTEUR_LATEST_ROUND_DATA, ROUND],
];
const VENDREDI_11H = MAJ + 3 * 3600; /* vendredi 2026-10-09 11:11 UTC */
{
  const { rpc, appels } = faux(NORMAL);
  const r = await RA.lireReferenceAction({ rpc, jeton: NVDA, maintenantSec: VENDREDI_11H });
  ok(r.multiplicateur.etat === 'LU' && r.multiplicateur.valeur === '1000537939576369481' && r.multiplicateur.pause === false, 'NVDAc : multiplicateur LU, pause lue', r.multiplicateur);
  ok(r.reference.etat === 'LU' && r.reference.prixUsd === 234.88393543 && r.reference.majA === '2026-10-09T08:11:07.000Z', 'NVDAc : reference LU 234,88393543 $, majA exposee', r.reference);
  ok(r.reference.fraicheur === 'A_JOUR' && r.reference.ageS === 3 * 3600, 'NVDAc : a jour (3 h, sous le battement de 24 h), age expose');
  ok(r.programme.etat === 'AUCUN', 'aucune mise a jour programmee (effectiveAt = 0)');
  ok(appels.length === 5, 'BORNE : 5 appels exactement', appels);
  let jsonOk = true; try { JSON.stringify(r); } catch (_) { jsonOk = false; }
  ok(jsonOk, 'le resultat est JSON-sur (aucun BigInt : JSON.stringify ne jette pas)');
}
{
  const { rpc } = faux([[(to) => estReg(to), new Error('over rate limit')], ...NORMAL.slice(1)]);
  const r = await RA.lireReferenceAction({ rpc, jeton: NVDA, maintenantSec: VENDREDI_11H });
  ok(r.multiplicateur.etat === 'NON_LU' && !('valeur' in r.multiplicateur), '⛔ registre muet -> NON_LU, SANS valeur (jamais 1 par defaut)', r.multiplicateur);
  ok(r.reference.etat === 'LU' && r.reference.pauseLue === false, 'la reference reste lue, et dit que la pause n a pas ete lue');
}
{
  const { rpc } = faux([[(to) => estReg(to), '0x'], ...NORMAL.slice(1)]);
  const r = await RA.lireReferenceAction({ rpc, jeton: NVDA, maintenantSec: VENDREDI_11H });
  ok(r.multiplicateur.etat === 'NON_LU', 'registre qui rend `0x` -> NON_LU');
}
{
  const { rpc } = faux([...NORMAL.slice(0, 3), [(to) => estFeed(to), new Error('timeout')]]);
  const r = await RA.lireReferenceAction({ rpc, jeton: NVDA, maintenantSec: VENDREDI_11H });
  ok(r.reference.etat === 'NON_LU' && r.reference.prixUsd === undefined, 'feed muet -> reference NON_LU, sans prix', r.reference);
}
{
  const { rpc, appels } = faux([[(to, d) => estReg(to), '0x' + mot(10n ** 18n) + mot(0n)], ...NORMAL.slice(1, 3)]);
  const r = await RA.lireReferenceAction({ rpc, jeton: MRVL, maintenantSec: VENDREDI_11H });
  ok(r.reference.etat === 'NON_DISPONIBLE' && r.multiplicateur.etat === 'LU', 'MRVLc : reference NON_DISPONIBLE, multiplicateur LU', r);
  ok(appels.every((a) => !a.startsWith(FEED_NVDA)) && appels.length === 3, 'MRVLc : aucun appel de feed (3 appels)', appels);
}
{
  const { rpc, appels } = faux([]);
  const r = await RA.lireReferenceAction({ rpc, jeton: '0xb200000000000000000000000000000000000001', maintenantSec: VENDREDI_11H });
  ok(r.multiplicateur.etat === 'NON_DISPONIBLE' && r.reference.etat === 'NON_DISPONIBLE' && appels.length === 0, 'adresse hors registre : NON_DISPONIBLE partout, 0 appel');
}
{
  const { rpc } = faux([[(to) => estReg(to), '0x' + mot(1000537939576369481n) + mot(1n)], ...NORMAL.slice(1)]);
  const r = await RA.lireReferenceAction({ rpc, jeton: NVDA, maintenantSec: VENDREDI_11H });
  ok(r.reference.fraicheur === 'FIGE_PAUSE' && r.multiplicateur.pause === true, 'pause du registre -> reference FIGEE (et dite)', r.reference);
}
{
  const jour = (s) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(new Date(s * 1000));
  const SAMEDI = MAJ + 86400 + 6 * 3600; /* samedi 2026-10-10 14:11 UTC = 10:11 a New York */
  const { rpc } = faux(NORMAL);
  const r = await RA.lireReferenceAction({ rpc, jeton: NVDA, maintenantSec: SAMEDI });
  ok(jour(SAMEDI) === 'Sat', 'temoin : SAMEDI est bien un samedi a New York', jour(SAMEDI));
  ok(r.reference.fraicheur === 'DERNIERE_VALEUR', 'week-end -> derniere valeur gardee (« last close »)', r.reference);
  const MARDI = MAJ + 4 * 86400; /* mardi 2026-10-13 08:11 UTC, majA du vendredi : 4 jours */
  const r2 = await RA.lireReferenceAction({ rpc: faux(NORMAL).rpc, jeton: NVDA, maintenantSec: MARDI });
  ok(jour(MARDI) === 'Tue', 'temoin : MARDI est bien un mardi a New York', jour(MARDI));
  ok(r2.reference.fraicheur === 'PERIME', 'un jour ouvre, plus vieux que 25 h -> PERIME (jamais « a jour »)', r2.reference);
  const LUNDI = MAJ + 3 * 86400; /* lundi 08:11 UTC ; la frontiere tombe mardi 09:11 UTC */
  const limite = RA.fraicheurReference({ majA: LUNDI, maintenantSec: LUNDI + RA.HEARTBEAT_FEED_S + RA.MARGE_HEARTBEAT_S, pause: false });
  const passe = RA.fraicheurReference({ majA: LUNDI, maintenantSec: LUNDI + RA.HEARTBEAT_FEED_S + RA.MARGE_HEARTBEAT_S + 1, pause: false });
  ok(jour(LUNDI) === 'Mon', 'temoin : LUNDI est bien un lundi a New York', jour(LUNDI));
  ok(limite.fraicheur === 'A_JOUR' && passe.fraicheur === 'PERIME', 'la frontiere : 25 h pile = a jour, 25 h + 1 s = perime', [limite, passe]);
}
{
  const futur = VENDREDI_11H + 86400;
  const { rpc } = faux([NORMAL[0], [(to, d) => d === RA.SELECTEUR_NEW_UI_MULTIPLIER, '0x' + mot(2n * 10n ** 18n)], [(to, d) => d === RA.SELECTEUR_EFFECTIVE_AT, '0x' + mot(BigInt(futur))], ...NORMAL.slice(3)]);
  const r = await RA.lireReferenceAction({ rpc, jeton: NVDA, maintenantSec: VENDREDI_11H });
  ok(r.programme.etat === 'EN_ATTENTE' && r.programme.nouveau === '2000000000000000000', 'effectiveAt dans le futur -> mise a jour EN_ATTENTE, nouvelle valeur exposee', r.programme);
  ok(r.multiplicateur.valeur === '1000537939576369481', 'et le multiplicateur COURANT reste celui lu (pas le programme)');
}

console.log('— D. l equivalent en actions, en BigInt');
ok(equivalentActions(100000000n, 1000537939576369481n) === 100053793n, '1 NVDAc (8 dec) -> 1,00053793 action (arrondi bas)', equivalentActions(100000000n, 1000537939576369481n));
ok(equivalentActions(100n, 2n * 10n ** 18n) === 200n && equivalentActions(100n, 5n * 10n ** 17n) === 50n, 'les exemples de docs.base.org : 2-pour-1 -> 200, 1-pour-2 -> 50');
const grand = 123456789012345678901234567890n;
ok(equivalentActions(grand, 1000377118676784179n) === (grand * 1000377118676784179n) / 10n ** 18n, 'exact sur un brut de 30 chiffres (aucun flottant)');
ok(equivalentActions(100000000, 10n ** 18n) === null && equivalentActions(100n, 1e18) === null, 'un Number en entree -> null (jamais de flottant sur un brut)');
ok(equivalentActions(100n, null) === null && equivalentActions(100n, undefined) === null && equivalentActions(100n, 0n) === null, '⛔ multiplicateur absent ou nul -> null, JAMAIS « × 1 »');
ok(etatMultiplicateur.length === 1, 'etatMultiplicateur reste un classeur a un argument (le test d avant tient)');

console.log('— E. la ligne d avertissement');
const lu = (prix, fr = 'A_JOUR') => ({ seuilEcartBps: 300, reference: { etat: 'LU', prixUsd: prix, fraicheur: fr, ageS: 600 } });
const p300 = RA.phraseReference(lu(100), 103, 'NVDAc'), p301 = RA.phraseReference(lu(100), 103.01, 'NVDAc'), pBas = RA.phraseReference(lu(100), 96.9, 'NVDAc');
ok(p300.alerte === false && p300.ecartBps === 300, 'a 300 bps pile : pas d alerte (strictement au-dela)', p300);
ok(p301.alerte === true && /above the reference/.test(p301.texte) && /check the price before you review/.test(p301.texte), 'a 301 bps : alerte, sens dit', p301);
ok(pBas.alerte === true && /below the reference/.test(pBas.texte), 'sous la reference : alerte « below »');
ok(RA.phraseReference({ reference: { etat: 'NON_LU' } }, 50).alerte === false, 'reference non lue : jamais d alerte');
ok(/No Chainlink reference price is published for MRVLc/.test(RA.phraseReference({ reference: { etat: 'NON_DISPONIBLE' } }, 50, 'MRVLc').texte), 'reference absente : dite, pas d alerte');
ok(/last value, held while markets are closed/.test(RA.phraseReference(lu(100, 'DERNIERE_VALEUR'), 100).texte), 'week-end : « last value, held while markets are closed »');
ok(/FROZEN/.test(RA.phraseReference(lu(100, 'FIGE_PAUSE'), 100).texte) && /STALE/.test(RA.phraseReference(lu(100, 'PERIME'), 100).texte), 'pause : FROZEN ; perime : STALE');
ok(/not current/.test(RA.phraseReference(lu(100, 'PERIME'), 120).texte), 'une alerte contre une reference perimee le dit');
ok(!/live/i.test(RA.phraseReference(lu(100), 100).texte), 'le mot « live » n apparait jamais');

console.log('— F. le planificateur : on AJOUTE, on ne change rien');
{
  const plan = { ok: true, route: 'USDC>ACTION', etat: 'APPROBATIONS', aSigner: [{ to: '0x1', data: '0xab', value: '0x0' }],
    resume: { paye: '1000000', payeDevise: 'usdc', recoitAuMoins: '420000', quote: '425000' } };
  const avant = JSON.parse(JSON.stringify(plan));
  const ref = { multiplicateur: { etat: 'LU', valeur: '1000537939576369481' }, reference: { etat: 'LU', prixUsd: 234.88393543, majA: 'x', fraicheur: 'A_JOUR', feed: FEED_NVDA } };
  const r = ajouterReference(plan, { de: '0xusdc', vers: NVDA, nd: 'USDC', nv: 'ACTION', decimalesAction: 8, ref });
  const { reference, ...resteResume } = r.resume;
  ok(JSON.stringify({ ...r, resume: resteResume }) === JSON.stringify(avant), 'tout le plan est IDENTIQUE hors `resume.reference` (etat, appels, minimum)');
  ok(Math.abs(reference.prixImpliqueUsd - 1 / 0.00425) < 1e-9 && reference.ecartBps === Math.round(((1 / 0.00425 - 234.88393543) / 234.88393543) * 10000), 'prix implicite et ecart calcules depuis paye/quote', reference);
  ok(/interface fee/.test(reference.ecartInclut), 'l ecart dit ce qu il inclut (notre frais, l impact de prix)');
  const sansDevis = ajouterReference({ resume: { paye: '1', recoitAuMoins: '1' } }, { de: NVDA, vers: '0xusdc', nd: 'ACTION', nv: 'USDC', decimalesAction: 8, ref });
  ok(sansDevis.resume.reference.ecartBps === null && /no USDC quote/.test(sansDevis.resume.reference.ecartInclut), 'sans devis (Aerodrome) : pas d ecart, et pourquoi');
  const nonLu = ajouterReference({ resume: { paye: '1000000', quote: '425000' } }, { de: '0xusdc', vers: NVDA, nd: 'USDC', nv: 'ACTION', decimalesAction: 8, ref: null });
  ok(nonLu.resume.reference.etat === 'NON_LU' && nonLu.resume.reference.ecartBps === null, 'reference pas lue a temps : NON_LU, pas d ecart');
  const sansResume = { etat: 'REFUSE', resume: null };
  ok(ajouterReference(sansResume, { ref }) === sansResume && sansResume.resume === null, 'un plan sans resume reste tel quel');
}
{
  const q = { de: 'USDC', vers: NVDA, montant: '0', compte: '0x4200000000000000000000000000000000000006' };
  const deps = { rpc: async () => { throw new Error('no network in this test'); }, chaine: 8453 };
  let lue = 0;
  const a = await planRail(q, deps), b = await planRail(q, { ...deps, reference: async () => { lue += 1; return null; } });
  ok(JSON.stringify(a) === JSON.stringify(b) && a.etat === 'REFUSE', 'planRail : refus identique avec ou sans lecteur de reference', [a, b]);
}

console.log('— G. la page et le serveur');
const html = lire('app.html'), srv = lire('serveur-web.js');
ok(/if \(chemin\.startsWith\('\/api\/actions\/reference\/'\)\) \{/.test(srv) && /req\.method !== 'GET'\) \{ rendreR\(405/.test(srv), 'serveur : la route GET /api/actions/reference/ existe, GET seulement');
ok(/if \(referencesEnVol >= 3\) return \{ ok: false, occupe: true/.test(srv) && /Date\.now\(\) - c\.t < 60000/.test(srv), 'serveur : 3 lectures en vol au plus, cache 60 s');
ok(/const complet = r\.multiplicateur\.etat === 'LU' && \(r\.reference\.etat === 'LU' \|\| r\.reference\.etat === 'NON_DISPONIBLE'\);/.test(srv), 'serveur : un NON_LU n est jamais mis en cache');
ok(/'reference-action\.js',/.test(srv), 'serveur : reference-action.js est dans la liste servie (import de la page)');
ok((srv.match(/reference: lireReferenceServeur \}/g) || []).length === 2, 'serveur : les deux appels du planificateur recoivent le lecteur de reference');
ok(/import \{ phraseReference \} from '\.\/reference-action\.js';/.test(html) && /import \{ equivalentActions \} from '\.\/multiplicateur-action\.js';/.test(html), 'page : les deux imports');
const iRef = html.indexOf('id="bcTicketRef"'), iGo = html.indexOf('id="bcTicketGo"');
ok(iRef > 0 && iRef < iGo, 'page : la ligne de reference est AVANT le bouton de revue');
ok(/fetch\('\/api\/actions\/reference\/' \+ a/.test(html), 'page : le ticket lit la reference sur le serveur');
ok(!/bcTicketGo'\)\.disabled = [^;]*alerte/.test(html) && !/alerte[^;\n]*disabled/.test(html), 'page : l alerte ne desactive rien');

/* LES MONTANTS ENVOYES : les fonctions qui fabriquent un montant pour la chaine, et la ligne des puces de vente. */
function corps(src, debut) {
  const i = src.indexOf(debut);
  if (i < 0) return null;
  const re = /\n(?:async function |function |\$\('#)/g; re.lastIndex = i + debut.length;
  const m = re.exec(src);
  return src.slice(i, m ? m.index : src.length);
}
function verifierMontantsBruts(src) {
  const fautes = [];
  for (const d of ['async function bcProposerSwap(', 'async function bcProposerEnvoi(', 'async function bcExecuterTexte(', "$('#bcTicket').addEventListener('submit'"]) {
    const c = corps(src, d);
    if (c === null) fautes.push('introuvable : ' + d);
    else if (/equivalentActions|multiplicateur|\.multiplier/i.test(c)) fautes.push('le multiplicateur entre dans ' + d);
  }
  const puces = src.split('\n').filter((l) => /for \(const p of \[25n, 50n, 100n\]\) puce\(/.test(l));
  if (puces.length !== 1) fautes.push('ligne des puces de vente : ' + puces.length + ' trouvee(s)');
  else if (!/puce\(p \+ ' %', bcDecimal\(so\.block \* p \/ 100n, so\.dec\)\)/.test(puces[0]) || /equivalentActions|multiplicateur/.test(puces[0])) fautes.push('les puces de vente ne prennent plus le solde BRUT');
  for (const l of src.split('\n').filter((x) => /equivalentActions\(/.test(x) && !/^\s*(\/\/|\*|\/\*)/.test(x) && !/^import /.test(x))) {
    if (/puce\(|montant|enUnitesBrutes|bcProposer|value:|aSigner/.test(l)) fautes.push('equivalentActions sur une ligne de montant : ' + l.trim().slice(0, 100));
  }
  return fautes;
}
function verifierGardeLu(src) {
  const i = src.indexOf('const eq = equivalentActions(so.block, BigInt(mu.valeur));');
  if (i < 0) return ['equivalentActions(so.block, BigInt(mu.valeur)) introuvable'];
  const avant = src.slice(Math.max(0, i - 600), i);
  return /else if \(mu\.etat !== 'LU' \|\| !\/\^\[0-9\]\+\$\/\.test\(String\(mu\.valeur \|\| ''\)\)\) parts = 'share equivalent not read/.test(avant) ? [] : ['la page multiplie sans garder l etat LU'];
}
ok(verifierMontantsBruts(html).length === 0, 'page : aucun montant envoye ne voit le multiplicateur ; les puces de vente prennent le brut', verifierMontantsBruts(html));
ok(verifierGardeLu(html).length === 0, 'page : la multiplication n a lieu que sur un multiplicateur LU (sinon « share equivalent not read »)', verifierGardeLu(html));
ok(/the count above is the raw token amount/.test(html), 'page : le nombre principal reste le brut, et c est dit');

console.log('— H. mutants');
{
  const avant = 'puce(p + \' %\', bcDecimal(so.block * p / 100n, so.dec))';
  ok(html.split(avant).length === 2, 'H motif du mutant 1 present une seule fois');
  const mut = html.replace(avant, 'puce(p + \' %\', bcDecimal(equivalentActions(so.block, BigInt(refP.d.multiplicateur.valeur)) * p / 100n, so.dec))');
  ok(verifierMontantsBruts(mut).length > 0, 'H mutant 1 « le multiplicateur applique au montant de vente envoye » : ROUGE', verifierMontantsBruts(mut));
}
{
  const src = lire('reference-action.js');
  const avant = "multiplicateur = { etat: 'NON_LU', pourquoi:";
  ok(src.split(avant).length === 2, 'H motif du mutant 2 present une seule fois');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-ref-'));
  for (const f of fs.readdirSync(ICI)) if (/\.js$/.test(f) && !/^(serveur-web|vendor|mcp-ext-apps)/.test(f)) fs.copyFileSync(path.join(ICI, f), path.join(tmp, f));
  fs.writeFileSync(path.join(tmp, 'reference-action.js'), src.replace(avant, "multiplicateur = { etat: 'LU', valeur: '1000000000000000000', pause: false, pourquoi:"));
  const M = await import(pathToFileURL(path.join(tmp, 'reference-action.js')).href);
  const { rpc } = faux([[(to) => estReg(to), new Error('over rate limit')], ...NORMAL.slice(1)]);
  const r = await M.lireReferenceAction({ rpc, jeton: NVDA, maintenantSec: VENDREDI_11H });
  const rouge = !(r.multiplicateur.etat === 'NON_LU' && !('valeur' in r.multiplicateur));
  ok(rouge, 'H mutant 2 « registre muet rendu comme × 1 » : ROUGE (le module rendrait LU 1e18)', r.multiplicateur);
  fs.rmSync(tmp, { recursive: true, force: true });
}
{
  const avant = "else if (mu.etat !== 'LU' || !/^[0-9]+$/.test(String(mu.valeur || ''))) parts = 'share equivalent not read";
  ok(html.split(avant).length === 2, 'H motif du mutant 3 present une seule fois');
  const mut = html.replace(avant, "else if (false) parts = 'share equivalent not read").replace('BigInt(mu.valeur));', "BigInt(mu.valeur || '1000000000000000000'));");
  ok(verifierGardeLu(mut).length > 0, 'H mutant 3 « la page multiplie un multiplicateur non lu comme 1 » : ROUGE', verifierGardeLu(mut));
}

console.log((ko ? '✗' : '✓') + ' test-reference-action-20261009 : ' + (n - ko) + '/' + n);
console.log('   ⚠️ NE PROUVE PAS : l affichage dans un navigateur, ni les valeurs du jour sur la chaine (sonde separee, rapport).');
process.exit(ko ? 1 : 0);
