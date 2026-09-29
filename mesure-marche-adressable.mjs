/* mesure-marche-adressable.mjs — COMBIEN VAUT NOTRE 0,1 %, ET SUR QUELLE PART DU VOLUME ?
 *
 * Lancer :  node mesure-marche-adressable.mjs
 *
 * ⛔⛔ LA QUESTION QUE CET INSTRUMENT EXISTE POUR EMPECHER D ESCAMOTER. « Si on capte juste un peu du
 *     volume c est dingue » est une phrase testable, et elle repose sur un chiffre que personne
 *     n avait mesure. Notre 0,1 % vit dans `sweepTokenWithFee`, une fonction DU ROUTEUR Aerodrome CL,
 *     et notre app construit un calldata VERS ce routeur. Donc :
 *       — un swap qui arrive au pool VIA CE ROUTEUR est sur la surface exacte que notre app construit ;
 *       — un swap qui arrive autrement ne passe pas par NOTRE calldata aujourd hui.
 *     Cet instrument SEPARE ces deux-la, et c est tout ce qu il fait.
 *
 * ⛔⛔ CE QU IL NE DIT PAS, ET CE QUE SA PREMIERE VERSION AFFIRMAIT A TORT. Elle appelait la seconde
 *     moitie « HORS D ATTEINTE D UNE INTERFACE ». C est FAUX, mesure le 2026-09-29 apres que Phil ait
 *     soupconne une lecture fausse : plusieurs des plus gros senders ont CINQ payeurs de gas
 *     distincts sur cinq transactions lues — ce sont des routeurs/agregateurs utilises par plein de
 *     gens, pas des bots. Leur flux passe donc par une interface, juste pas la notre. Et notre propre
 *     routeur ne montre que 2 payeurs sur 5 : une part du « servable » est du flux d agregateur qui
 *     TRAVERSE Aerodrome. « Via notre routeur » n est donc NI « notre interface » NI « tout
 *     l adressable ».
 *   ⇒ Le bon axe est bot / interface, et il exige de lire les TRANSACTIONS (`tx.from` dit qui a paye
 *     le gas ; un log ne le dit pas). C est `mesure-volume-par-structure.mjs`. Il a rendu 44,95 %
 *     INTERFACE contre 13,37 % ici : trois fois et demi.
 *   ⛔ UNE ETIQUETTE FAUSSE DANS UN INSTRUMENT COMMITE EST UN CHIFFRE FAUX PUBLIE. Celle-ci a vecu
 *     une heure dans le depot.
 *
 * ⛔ LECTURE SEULE : aucun envoi, aucune signature, aucune preparation de transaction.
 * ⛔ TROIS ETATS, JAMAIS DEUX. Une fenetre refusee est COMPTEE et DITE ; un total incomplet est
 *   annonce comme MINIMUM. Un zero de lecture n est jamais un zero de marche.
 * ⛔ RIEN N EST FIGE ICI : les pools viennent de `/api/prix-usd`, la liste des actions de `paires.js`,
 *   le routeur de `calldata-aerodrome.js`, le topic est CALCULE par keccak256. Une adresse recopiee
 *   dans ce fichier pourrirait des que la pool servie changerait.
 * ⚠️ BORNE PRINCIPALE : « via le routeur » est une borne SUPERIEURE de l adressable, pas une
 *   prevision. Ces flux comparent les prix d execution ; notre 0,1 % nous rend strictement moins
 *   bons que la route directe pour qui compare. Le chiffre dit ce qui est ATTEIGNABLE, jamais gagne.
 */
import { readFileSync } from 'node:fs';
import { topic } from './keccak.js';

const RPC = process.env.RPC_BASE || 'https://mainnet.base.org';
const SITE = process.env.SITE_TBLOCK || 'https://tokenizedblock.space';
const EN_TETE = { 'content-type': 'application/json', 'x-ms-monitor': '1' };
const BPS = 10n;              /* 0,1 % — decision de Phil du 2026-09-28, ecrite ici, pas importee */
const GLISSEMENT_MAX = 300;   /* la porte de `porte-achat.js` — recopiee pour etre CONFRONTEE, pas suivie */
const LARGEUR = 2000n;        /* plafond MESURE d `eth_getLogs` sur mainnet.base.org */
const BLOCS = BigInt(process.env.BLOCS || 43200);   /* ~24 h a 2 s/bloc */

const TOPIC_SWAP = topic('Swap(address,address,int256,int256,uint160,uint128,int24)');
const ici = (f) => new URL(f, import.meta.url);
const srcPaires = readFileSync(ici('./paires.js'), 'utf8');
const mR = /ROUTEUR_AERODROME_CL = '(0x[0-9a-fA-F]{40})'/.exec(readFileSync(ici('./calldata-aerodrome.js'), 'utf8'));
if (!mR) { console.log('⛔ routeur introuvable dans calldata-aerodrome.js — je ne mesure rien'); process.exit(2); }
const ROUTEUR = mR[1].toLowerCase();
const ROUTEUR_TOPIC = '0x' + '0'.repeat(24) + ROUTEUR.slice(2);
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

console.log('routeur (lu dans le depot) : ' + ROUTEUR);
console.log('topic Swap (calcule)       : ' + TOPIC_SWAP);
console.log('RPC ' + RPC + (process.env.RPC_BASE ? '  (RPC_BASE lu)' : '  (defaut)'));

let id = 0;
async function appel(method, params, url = RPC) {
  try {
    const r = await fetch(url, { method: 'POST', headers: EN_TETE,
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
    if (r.status !== 200) return { etat: 'NON_MESURE', pourquoi: 'HTTP ' + r.status };
    const j = await r.json();
    if (j.error) {
      const m = JSON.stringify(j.error).slice(0, 100);
      return { etat: /revert|execution reverted/i.test(m) ? 'REVERT' : 'NON_MESURE', pourquoi: m };
    }
    return { etat: 'OK', res: j.result };
  } catch (e) { return { etat: 'NON_MESURE', pourquoi: String((e && e.message) || e).slice(0, 80) }; }
}
/* ⛔ RETRY OBLIGATOIRE SUR LES LECTURES D IDENTITE. Sans lui, un throttling transitoire rendait
 *   `token0()` illisible, le cote USDC passait a « inconnu », et cinq pools etaient annoncees
 *   « 0 swap / 0 USDC ». Le total en avait ete DEFLATE de moitie. « Pas lu » n est pas « pas la ». */
const SECOURS = ['https://base-rpc.publicnode.com'];
async function lireTenace(to, data) {
  for (const url of [RPC, ...SECOURS]) {
    for (let k = 0; k < 3; k += 1) {
      const r = await appel('eth_call', [{ to, data }, 'latest'], url);
      if (r.etat === 'OK') return r;
      await pause(500 * (k + 1));
    }
  }
  return { etat: 'NON_MESURE', pourquoi: 'tous les endpoints ont refuse' };
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const adrDe = (h) => '0x' + String(h || '').replace(/^0x/, '').slice(24, 64).toLowerCase();
function int256(m) { const v = BigInt('0x' + m); return v >= (1n << 255n) ? v - (1n << 256n) : v; }
const abs = (x) => (x < 0n ? -x : x);
const usd = (v) => (Number(v) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 0 });

/* ── 1. quelles actions notre app sert-elle AVEC frais, maintenant ? ────────────────────────── */
const actions = [...srcPaires.matchAll(/symbole: '([^']+)', nom: '[^']*', adr: '(0xb2[0-9a-fA-F]{38})'/g)]
  .map((m) => ({ sym: m[1], adr: m[2].toLowerCase() }));
console.log('\nactions dans paires.js : ' + actions.length);
const servies = [], horsFrais = [], nonLues = [];
for (const a of actions) {
  let j = null;
  try { j = await (await fetch(SITE + '/api/prix-usd?adr=' + a.adr, { headers: { 'x-ms-monitor': '1' } })).json(); }
  catch (_) { j = null; }
  if (!j || j.ok !== true) { nonLues.push(a.sym); await pause(200); continue; }
  const porte = j.famille === 'aerodrome' && typeof j.glissementBps === 'number' && j.glissementBps <= GLISSEMENT_MAX;
  (porte && j.pool ? servies : horsFrais).push({ ...a, pool: j.pool && j.pool.toLowerCase(),
    famille: j.famille, gl: j.glissementBps });
  await pause(200);
}
console.log('servies AVEC frais : ' + servies.length + '  ·  hors frais : ' + horsFrais.length
  + ' (' + horsFrais.map((h) => h.sym + ' ' + (h.famille === 'aerodrome' ? h.gl + ' bps' : h.famille)).join(', ') + ')');
if (nonLues.length) console.log('⛔ ' + nonLues.length + ' action(s) au prix NON LU : ' + nonLues.join(', ')
  + ' — exclues, et c est un TROU, pas un zero.');
if (!servies.length) { console.log('⛔ aucune pool servie — rien a mesurer, et ce n est pas « zero volume »'); process.exit(2); }

/* ── 2. de quel cote est l USDC dans chaque pool ? ──────────────────────────────────────────── */
for (const s of servies) {
  const [t0, t1] = [await lireTenace(s.pool, '0x0dfe1681'), await lireTenace(s.pool, '0xd21220a7')];
  const a0 = t0.etat === 'OK' ? adrDe(t0.res) : null, a1 = t1.etat === 'OK' ? adrDe(t1.res) : null;
  if (a0 === null || a1 === null) { s.usdcEst0 = null; s.cote = 'NON_LU'; }
  else if (a0 === USDC) { s.usdcEst0 = true; s.cote = 'USDC=token0'; }
  else if (a1 === USDC) { s.usdcEst0 = false; s.cote = 'USDC=token1'; }
  else { s.usdcEst0 = null; s.cote = 'HORS_USDC'; }
}

/* ── 3. les deux marches, separes ───────────────────────────────────────────────────────────── */
const t = await appel('eth_blockNumber', []);
if (t.etat !== 'OK') { console.log('⛔ tete de chaine illisible — je ne conclus rien'); process.exit(2); }
const tete = BigInt(t.res), depuis = tete > BLOCS ? tete - BLOCS : 0n;
console.log('\nfenetre ' + depuis + '..' + tete + '  (' + BLOCS + ' blocs, ~' + (Number(BLOCS) * 2 / 3600).toFixed(1) + ' h a 2 s/bloc)\n');
console.log('jeton      swaps tot      volume tot     swaps rout     volume rout    part rout   fenetres');

let vT = 0n, vR = 0n, nT = 0, nR = 0, refuses = 0, sansVolume = [];
for (const s of servies) {
  let pT = 0n, pR = 0n, sT = 0, sR = 0, lues = 0, ref = 0;
  for (let x = depuis; x <= tete; x += LARGEUR) {
    const y = x + LARGEUR - 1n > tete ? tete : x + LARGEUR - 1n;
    const r = await appel('eth_getLogs', [{ fromBlock: '0x' + x.toString(16), toBlock: '0x' + y.toString(16),
      address: s.pool, topics: [TOPIC_SWAP] }]);
    if (r.etat !== 'OK') { ref += 1; await pause(500); continue; }
    lues += 1;
    for (const l of r.res) {
      const d = String(l.data || '').replace(/^0x/, '');
      if (d.length < 320 || !l.topics[1]) continue;
      /* ⛔ LE SWAP EST COMPTE DANS TOUS LES CAS ; seul le VOLUME exige de savoir quel cote lire. */
      sT += 1;
      const rout = String(l.topics[1]).toLowerCase() === ROUTEUR_TOPIC;
      if (rout) sR += 1;
      if (s.usdcEst0 === null) continue;
      const v = abs(int256(s.usdcEst0 ? d.slice(0, 64) : d.slice(64, 128)));
      pT += v; if (rout) pR += v;
    }
    await pause(150);
  }
  if (s.usdcEst0 === null) sansVolume.push(s.sym + ' (' + s.cote + ', ' + sT + ' swaps)');
  vT += pT; vR += pR; nT += sT; nR += sR; refuses += ref;
  const part = pT === 0n ? null : Number(pR * 10000n / pT) / 100;
  console.log(s.sym.padEnd(10) + String(sT).padStart(10) + usd(pT).padStart(16) + String(sR).padStart(15)
    + usd(pR).padStart(16) + (part === null ? '[n/a]' : part.toFixed(2) + ' %').padStart(12)
    + '   ' + lues + '/' + (lues + ref));
}

console.log('\n=== LES DEUX MARCHES ===');
console.log('fenetres refusees : ' + refuses + (refuses ? '  ⛔ tous les totaux ci-dessous sont des MINIMUMS' : '  (aucune)'));
if (sansVolume.length) {
  console.log('⛔⛔ ' + sansVolume.length + ' pool(s) comptent leurs swaps mais PAS leur volume : ' + sansVolume.join(' · '));
  console.log('    ⇒ le total USDC est INCOMPLET, et ce manque n est pas un zero.');
}
console.log('volume TOTAL, nos ' + servies.length + ' pools       : ' + usd(vT) + ' USDC  (' + nT.toLocaleString('en-US') + ' swaps)');
console.log('dont VIA LE ROUTEUR (servable)   : ' + usd(vR) + ' USDC  (' + nR.toLocaleString('en-US') + ' swaps)');
console.log('part servable                    : ' + (vT === 0n ? '[n/a]' : (Number(vR * 10000n / vT) / 100).toFixed(2) + ' %'));
/* ⛔⛔ CETTE LIGNE DISAIT « hors d atteinte d une interface », ET C ETAIT FAUX. Mesure du meme jour,
 *     apres que Phil ait soupconne une lecture fausse : le sender `0x83d55acd…`, 3 376 swaps, a
 *     CINQ payeurs de gas distincts sur cinq transactions lues — c est un ROUTEUR/AGREGATEUR utilise
 *     par plein de gens, pas un bot. Idem `0xca7de682…` et `0x9e9ae7f8…`. Leur flux passe par une
 *     interface : il n est pas hors d atteinte PAR NATURE, il passe juste par une AUTRE interface.
 *     Et symetriquement, notre propre routeur ne montre que 2 payeurs sur 5 : une partie du
 *     « servable » est du flux d agregateur qui TRAVERSE Aerodrome, donc pas notre interface non plus.
 *   ⇒ « via notre routeur » n est ni « notre interface » ni « tout l adressable ». Le bon axe est
 *     bot / interface, et il se lit dans `mesure-volume-par-structure.mjs` : 44,95 % INTERFACE,
 *     40,03 % BOT, 15,00 % AMBIGU sur trois pools et 6,7 h. Trois fois et demi mon premier chiffre.
 *   ⛔ ON NE RENOMME PAS SEULEMENT L ETIQUETTE : une etiquette fausse dans un instrument commite est
 *     un chiffre faux publie. */
console.log('⛔ NON ROUTE PAR NOUS : ' + usd(vT - vR) + ' USDC — arrive au pool sans passer par NOTRE');
console.log('   routeur. ⛔⛔ CE N EST PAS « hors d atteinte » : une grande partie passe par d AUTRES');
console.log('   routeurs/agregateurs, donc par une interface. Pour trancher bot / interface, lancer');
console.log('   `mesure-volume-par-structure.mjs` — il lit les TRANSACTIONS, pas les evenements.');

const j0 = Number(vR) / 1e6 * Number(BPS) / 10000;
/* ⛔⛔ CETTE LIGNE ETAIT FAUSSE D UN FACTEUR 2, DANS LE SENS FLATTEUR. J avais ecrit
 *     `365*24*3600*2 / BLOCS / 2`, ce qui donne le nombre de SECONDES par an divise par le nombre de
 *     BLOCS — donc une fenetre de 4 000 blocs comptait 7 884 fois par an au lieu de 3 942. Un bloc
 *     Base dure ~2 s : une fenetre dure `BLOCS * 2` secondes, et il y en a `SECONDES_AN / (BLOCS*2)`
 *     par an. Une annualisation optimiste par accident reste une sur-vente.
 *   ⚠️ ET ELLE SUPPOSE 2 s/bloc, ce qui n est pas mesure ici : la duree reelle de la fenetre
 *     pourrait etre lue sur les timestamps des deux blocs. Tant que ce n est pas fait, le facteur
 *     annuel est une CONVENTION, et il est annonce comme telle. */
const SECONDES_AN = 365 * 24 * 3600;
const SEC_PAR_BLOC = 2;
const fenetresParAn = SECONDES_AN / (Number(BLOCS) * SEC_PAR_BLOC);
console.log('\n0,1 % du SERVABLE, par taux de capture du servable  ('
  + fenetresParAn.toFixed(0) + ' fenetres/an a ' + SEC_PAR_BLOC + ' s/bloc, convention NON mesuree) :');
for (const p of [1, 5, 10, 25, 50]) {
  console.log('   ' + String(p).padStart(3) + ' %  ->  ' + (j0 * p / 100).toLocaleString('en-US', { maximumFractionDigits: 2 }).padStart(10)
    + ' USD / fenetre   (' + (j0 * p / 100 * fenetresParAn).toLocaleString('en-US', { maximumFractionDigits: 0 })
    + ' USD / an si le volume tenait)');
}
console.log('\nborne : UNE fenetre, non repetee. La profondeur de ces pools BOUGE (mesure : la liquidite');
console.log('de SPCXc/USDC a varie de 20,8e12 a 11,4e12 en 15 minutes).');
console.log('borne : seules les pools que NOTRE app sert avec frais sont comptees. Les autres pools des');
console.log('memes jetons sont INVISIBLES ici — le marche total est PLUS GRAND que ce tableau.');
console.log('borne : le taux de capture est une HYPOTHESE. Le taux MESURE est 0 % — a6cf n a jamais');
console.log('recu un seul jeton d action (mesure du 2026-09-29 : 132 fenetres lues, 0 refusee).');
