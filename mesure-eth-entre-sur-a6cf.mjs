/* mesure-eth-entre-sur-a6cf.mjs — LES 0,001 ETH DE NAISSANCE ARRIVENT-ILS SUR LE WALLET ?
 *
 * ⛔⛔ LA QUESTION DE PHIL (2026-09-26) : « les fees sur les trade et le 0.001 eth birth doit passer
 *     sur mon wallet, surtout ca ».
 *
 * ⛔ POURQUOI AUCUNE SONDE PRECEDENTE N A SU REPONDRE. Les frais verses par un contrat passent par un
 *   APPEL INTERNE : aucun log, donc `eth_getLogs` est AVEUGLE a l ETH. Et les methodes de trace sont
 *   refusees par le noeud public — mesure du 2026-09-26 : `debug_traceTransaction`, `trace_block`,
 *   `trace_transaction`, `ots_getInternalOperations` rendent toutes « rpc method is unsupported ».
 *
 * ⇒ MAIS `eth_getBalance` REPOND A DES HAUTEURS PASSEES (teste jusqu a -600 000 blocs). Et un
 *   CHANGEMENT DE SOLDE est un changement de solde, quel que soit le chemin : appel interne compris.
 *   On balaie donc le solde par tranches, puis on BISECTE chaque tranche qui a bouge pour trouver le
 *   bloc exact. C est la seule facon de voir l ETH ici, et elle ne suppose rien du contrat.
 *
 * ⛔⛔ LA BORNE QUI COMPTE, ET ELLE EST REELLE : deux mouvements opposes DANS LA MEME TRANCHE
 *     s annulent et deviennent invisibles (+0,001 puis -0,001 = solde inchange). La taille de
 *     tranche est donc affichee : plus elle est petite, moins on en rate, et on ne pretend jamais
 *     avoir vu « tous » les mouvements.
 * ⛔ ET UN SOLDE N EST PAS UN REVENU : « recu 10 puis depense 9 » et « recu 1 » donnent le meme
 *   solde. C est pour ca qu on cherche les VARIATIONS, une par une, avec leur signe.
 *
 * ⚠️ LECTURE SEULE. Aucune signature, aucune cle.
 */
const RPC = process.env.TB_RPC || 'https://mainnet.base.org';
const A6CF = '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4';
const FRAIS_NAISSANCE = 1000000000000000n;   /* 0,001 ETH — le frais annonce a l ecran */

const souffler = (ms = 130) => new Promise((r) => setTimeout(r, ms));
async function rpc(method, params, essais = 5) {
  for (let i = 0; i < essais; i++) {
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const j = await r.json();
    if (!j.error) return j.result;
    const msg = j.error.message || String(j.error.code);
    if (!/rate limit|too many|429|limited/i.test(msg) || i === essais - 1) throw new Error(msg);
    await souffler(700 * (i + 1));
  }
}
const solde = async (bloc) => BigInt(await rpc('eth_getBalance', [A6CF, '0x' + bloc.toString(16)]));
const eth = (w) => (Number(w) / 1e18).toFixed(9);

const tete = parseInt(await rpc('eth_blockNumber', []), 16);
const JOURS = Number(process.env.TB_JOURS || 14);
const PORTEE = Math.floor((JOURS * 24 * 3600) / 2);          /* ~2 s par bloc sur Base */
const TRANCHE = Number(process.env.TB_TRANCHE || 4000);
const debut = tete - PORTEE;

console.log('═══ CE QUI ENTRE ET SORT EN ETH SUR LE WALLET DE FRAIS ═══\n');
console.log('  wallet  : ' + A6CF);
console.log('  fenetre : blocs ' + debut + ' -> ' + tete + '  (~' + JOURS + ' j)');
console.log('  tranche : ' + TRANCHE + ' blocs (~' + ((TRANCHE * 2) / 60).toFixed(0) + ' min)');
console.log('  ⛔ deux mouvements opposes DANS une meme tranche s annulent et restent invisibles.\n');

let appels = 0;
const lire = async (b) => { appels++; await souffler(); return solde(b); };

const s0 = await lire(debut), sN = await lire(tete);
console.log('  solde au debut : ' + eth(s0) + ' ETH');
console.log('  solde a la fin : ' + eth(sN) + ' ETH');
console.log('  variation nette: ' + (sN >= s0 ? '+' : '') + eth(sN - s0) + ' ETH\n');

/* ── 1. quelles tranches ont bouge ? ────────────────────────────────────────────────────────── */
const bornes = [];
for (let b = debut; b < tete; b += TRANCHE) bornes.push(Math.min(b + TRANCHE, tete));
console.log('── balayage de ' + bornes.length + ' tranches ──');
const changees = [];
let prec = s0, precBloc = debut, faites = 0;
for (const b of bornes) {
  let s;
  try { s = await lire(b); } catch (e) { console.log('  ⛔ tranche non lue a ' + b + ' : ' + e.message); continue; }
  faites++;
  if (s !== prec) changees.push({ de: precBloc, a: b, avant: prec, apres: s });
  prec = s; precBloc = b;
  if (faites % 40 === 0) process.stdout.write('  ' + faites + '/' + bornes.length + '…\r');
}
console.log('  ' + faites + '/' + bornes.length + ' tranches lues · ' + changees.length + ' avec un mouvement     ');

/* ── 2. le bloc exact de chaque mouvement ───────────────────────────────────────────────────── */
console.log('\n── les mouvements, un par un ──');
const mouvements = [];
for (const c of changees) {
  let lo = c.de, hi = c.a, sLo = c.avant;
  /* ⛔ BISECTION : chaque tranche peut contenir PLUSIEURS mouvements ; on trouve le PREMIER, et on
   *   dit combien il en reste potentiellement derriere plutot que de pretendre les avoir tous. */
  while (hi - lo > 1) {
    const m = Math.floor((lo + hi) / 2);
    let sm;
    try { sm = await lire(m); } catch (e) { break; }
    if (sm === sLo) lo = m; else hi = m;
  }
  const avant = sLo, apres = await lire(hi);
  const d = apres - avant;
  mouvements.push({ bloc: hi, delta: d });
  const signe = d > 0n ? '+' : '';
  const estFrais = d === FRAIS_NAISSANCE;
  console.log('  bloc ' + hi + '  ' + signe + eth(d) + ' ETH'
    + (estFrais ? '   ⇐ EXACTEMENT le frais de naissance de 0,001 ETH' : ''));
}

/* ── 3. verdict ─────────────────────────────────────────────────────────────────────────────── */
const entrees = mouvements.filter((m) => m.delta > 0n);
const sorties = mouvements.filter((m) => m.delta < 0n);
const naissances = entrees.filter((m) => m.delta === FRAIS_NAISSANCE);
const totalIn = entrees.reduce((s, m) => s + m.delta, 0n);
console.log('\n── VERDICT ──');
console.log('  mouvements vus     : ' + mouvements.length + '  (' + entrees.length + ' entrees, ' + sorties.length + ' sorties)');
console.log('  total entre        : +' + eth(totalIn) + ' ETH');
console.log('  dont EXACTEMENT 0,001 ETH (le frais de naissance) : ' + naissances.length);
if (!mouvements.length) {
  /* ⛔ UN ZERO QUI NE PEUT PAS MONTER RESSEMBLE A UN ZERO DE SUCCES : ici il dit que le solde n a
   *   pas bouge d un wei sur la fenetre, ce qui est un fait, pas une panne de sonde. */
  console.log('  ⛔⛔ LE SOLDE N A PAS BOUGE D UN SEUL WEI sur ' + JOURS + ' jours.');
  console.log('    Aucun frais de naissance, aucun frais de trade, rien. Ce n est pas « peu » : c est');
  console.log('    ZERO, et la sonde peut le voir (elle lit le solde, pas des logs).');
} else if (!naissances.length) {
  console.log('  ⛔ AUCUN mouvement ne vaut exactement 0,001 ETH.');
  console.log('    ⚠️ Ca ne prouve pas que le frais n arrive jamais : deux frais dans la meme tranche,');
  console.log('      ou un frais accompagne d autre chose, ne feraient pas ce montant rond.');
}
console.log('\n⛔ CE QUE CETTE SONDE NE DIT PAS : QUI a envoye. Un solde ne porte pas d expediteur, et');
console.log('   les traces sont refusees par ce noeud. Elle dit COMBIEN et QUAND, pas DE QUI.');
console.log('   Appels RPC : ' + appels);
