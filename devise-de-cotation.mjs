/* devise-de-cotation.mjs — CONTRE QUOI S APPARIENT LES MARCHES QUE L INDEX CONNAIT ?
 * ================================================================================================
 *   node devise-de-cotation.mjs
 *
 * ⛔⛔ LA QUESTION QUI A MOTIVE CE FICHIER, ET ELLE ETAIT BLOQUANTE. Nos pools s apparient contre de
 *     l ETH NATIF — `address(0)` en Uniswap v4 — et pas contre du WETH. Si l index public ne
 *     connaissait QUE des paires WETH, alors nos blocks ne pourraient JAMAIS etre listes, meme en
 *     echangeant tous les jours. Le conseil tire de la mesure du 24 h serait inutile, et il vaut
 *     mieux le savoir AVANT de le donner a quelqu un qui va payer du gas pour le suivre.
 *
 * ⛔ ON INTERROGE LES JETONS **LISTES** DU PANEL, pas un echantillon frais. Ce sont eux qui prouvent
 *    ce que l index sait lire : demander a des jetons inconnus contre quoi ils sont apparies ne
 *    dirait rien sur ce que l index accepte.
 *
 * ⛔⛔ ON COMPTE DES JETONS DE BASE **DISTINCTS**, PAS DES PAIRES — ET CE N EST PAS UN DETAIL.
 *     Premiere version de cette mesure : « 15 paires contre GOOGLc », lu comme « GOOGLc est une
 *     devise de cotation du marche ». C ETAIT FAUX : les 15 paires venaient d UN SEUL jeton qui a
 *     quinze pools. Compter des paires fait passer une coincidence pour une structure. Le compte
 *     par jeton distinct est imprime EN PREMIER, et le compte de paires a cote pour memoire.
 *
 * ⛔ LE PREFIXE `0xb20` NE PROUVE RIEN. N importe qui peut se faire miner une adresse qui commence
 *    par ces caracteres. Le seul marqueur infalsifiable est le BYTECODE : un B20 natif rend
 *    exactement `0xef`, un octet que EIP-3541 rend impossible a deployer pour un contrat EVM.
 *    ⇒ Chaque devise a prefixe b20 est VERIFIEE par `eth_getCode`, avec deux temoins.
 * ⛔ ET SEUL UN NOEUD BASE OFFICIEL SERT CES LECTURES : publicnode / drpc / 1rpc rendent `0x` pour
 *    les B20, donc un « pas de marqueur » lu ailleurs serait un faux negatif.
 *
 * ⛔ LECTURE SEULE : aucune ecriture, aucune signature, aucune cle.
 */
import { readFileSync, existsSync } from 'node:fs';

const RPC = process.env.TB_RPC || 'https://mainnet.base.org';
const PANEL = 'panel-indexation.json';
const WETH = '0x4200000000000000000000000000000000000006';
const ZERO = '0x0000000000000000000000000000000000000000';
/** ⛔ FABRIQUEE EXPRES : elle porte le prefixe b20 et ne doit correspondre a rien. */
const TEMOIN_FAUX_B20 = '0xb20000000000000000000000000000000000dead';

let id = 1;
async function rpc(m, p) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: id++, method: m, params: p }) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

/** TROIS etats, jamais deux : une lecture ratee n est pas un « non ». */
async function marqueurB20(adr) {
  let code;
  try { code = await rpc('eth_getCode', [adr, 'latest']); }
  catch (e) { return { etat: 'NON_LU', pourquoi: e.message }; }
  const c = String(code).toLowerCase();
  if (c === '0xef') return { etat: 'B20_NATIF' };
  if (c === '0x') return { etat: 'AUCUN_CODE' };
  return { etat: 'EVM_ORDINAIRE', octets: (c.length - 2) / 2 };
}

if (!existsSync(PANEL)) {
  console.log('⛔ ' + PANEL + ' absent. Lancer d abord `node ce-qui-garde-liste.mjs 14` : cette '
    + 'mesure porte sur les jetons que l index CONNAIT, et c est le panel qui les nomme.');
  process.exit(1);
}
const p = JSON.parse(readFileSync(PANEL, 'utf8'));
const listes = p.jetons.filter((x) => x.etat === 'CONNU');
console.log('panel du ' + p.quand + ' · bloc de tete ' + p.blocTete);
console.log('jetons LISTES a interroger : ' + listes.length + '\n');
if (listes.length < 5) {
  console.log('⛔ moins de 5 jetons listes : on ne tire pas de structure de si peu. On s arrete.');
  process.exit(1);
}

/* ══ 1. CE QUE L INDEX PUBLIE SUR CHACUN ═════════════════════════════════════════════════════ */
const parDevise = new Map();
let lus = 0, rates = 0, pairesV4 = 0, pairesTotal = 0;
for (const x of listes) {
  let j = null;
  for (let e = 0; e < 3 && !j; e++) {
    try { const r = await fetch('https://api.dexscreener.com/token-pairs/v1/base/' + x.jeton); if (r.ok) j = await r.json(); }
    catch (_) { /* on retente */ }
    if (!j) await new Promise((f) => setTimeout(f, 800));
  }
  if (!Array.isArray(j)) { rates++; continue; }
  const base = j.filter((q) => String(q.chainId).toLowerCase() === 'base');
  if (!base.length) { rates++; continue; }
  lus++;
  for (const pr of base) {
    pairesTotal++;
    if ((pr.labels || []).some((l) => /v4/i.test(l))) pairesV4++;
    const q = String((pr.quoteToken && pr.quoteToken.address) || '?').toLowerCase();
    const e = parDevise.get(q) || { sym: (pr.quoteToken && pr.quoteToken.symbol) || '?', jetons: new Set(), paires: 0 };
    e.jetons.add(x.jeton); e.paires++;
    parDevise.set(q, e);
  }
  await new Promise((f) => setTimeout(f, 220));
}
console.log('jetons lus : ' + lus + ' · rates : ' + rates
  + (rates ? '  ⛔ les rates ne comptent NI POUR NI CONTRE' : '  ✅ tous lus'));
if (lus < 5) { console.log('\n⛔ trop peu de jetons lus pour conclure. On s arrete.'); process.exit(1); }

/* ══ 2. LE CLASSEMENT — PAR JETONS DISTINCTS, D ABORD ════════════════════════════════════════ */
console.log('\ndevise de cotation        jetons DISTINCTS   (paires)');
const classe = [...parDevise].sort((a, b) => b[1].jetons.size - a[1].jetons.size || b[1].paires - a[1].paires);
for (const [q, e] of classe) {
  console.log('  ' + String(e.sym).padEnd(18) + String(e.jetons.size).padStart(10)
    + ('(' + e.paires + ')').padStart(12) + (/^0xb20/i.test(q) ? '   prefixe b20 — a verifier' : ''));
}
/* ⛔ L ECART ENTRE LES DEUX COLONNES EST LE PIEGE, ET IL EST NOMME A L ECRAN. */
const menteurs = classe.filter(([, e]) => e.paires >= 5 && e.jetons.size <= 2);
for (const [, e] of menteurs) {
  console.log('  ⛔ « ' + e.sym + ' » a ' + e.paires + ' paires mais seulement ' + e.jetons.size
    + ' jeton(s) distinct(s) : ce n est PAS une devise du marche, c est un jeton qui a beaucoup '
    + 'de pools. Compter les paires ferait passer cette coincidence pour une structure.');
}

/* ══ 3. NOTRE CONFIGURATION EST-ELLE CELLE QUE L INDEX LIT ? ═════════════════════════════════ */
const eth = parDevise.get(ZERO);
const weth = parDevise.get(WETH.toLowerCase());
console.log('\n=== NOTRE CONFIGURATION : ETH NATIF `address(0)` EN v4 ===');
console.log('  jetons listes apparies contre ETH natif : ' + (eth ? eth.jetons.size : 0) + ' / ' + lus);
console.log('  jetons listes apparies contre WETH      : ' + (weth ? weth.jetons.size : 0) + ' / ' + lus);
console.log('  paires marquees v4 : ' + pairesV4 + ' / ' + pairesTotal);
if (eth && eth.jetons.size > 0 && pairesV4 > 0) {
  console.log('  ✅ l index LIT des paires Uniswap v4 contre de l ETH natif — c est exactement notre');
  console.log('     configuration. Aucun blocage structurel : nos pools PEUVENT etre listees.');
} else {
  console.log('  ⛔ aucune paire v4 contre ETH natif chez les listes : nos pools ne pourraient pas');
  console.log('     etre listees, et le conseil « echanger chaque jour » serait sans effet pour nous.');
}

/* ══ 4. LES DEVISES A PREFIXE b20 SONT-ELLES DE VRAIS B20 ? ══════════════════════════════════ */
const suspects = classe.filter(([q]) => /^0xb20/i.test(q)).map(([q, e]) => [e.sym, q]);
console.log('\n=== LE MARQUEUR, PAS LE PREFIXE ===');
if (!suspects.length) {
  console.log('  aucune devise a prefixe b20 chez les listes — rien a verifier.');
} else {
  /* ⛔ LES TEMOINS PASSENT AVEC LES CIBLES, pas avant ni apres : un `eth_getCode` qui rendrait
   *    « 0xef » pour tout le monde, ou « 0x » pour tout le monde, se verrait immediatement. */
  const cibles = [...suspects, ['TEMOIN WETH (contrat EVM)', WETH], ['TEMOIN adresse fabriquee', TEMOIN_FAUX_B20]];
  let vrais = 0, temoinOk = 0;
  for (const [nom, adr] of cibles) {
    const m = await marqueurB20(adr);
    const dit = m.etat === 'B20_NATIF' ? '✅ B20 NATIF (0xef exact)'
      : m.etat === 'AUCUN_CODE' ? 'aucun code — pas un contrat'
        : m.etat === 'NON_LU' ? '⛔ NON LU (' + m.pourquoi + ') — ni pour ni contre'
          : '⛔ bytecode EVM ordinaire (' + m.octets + ' octets) — PAS un B20';
    console.log('  ' + String(nom).padEnd(30) + dit);
    if (m.etat === 'B20_NATIF' && !/^TEMOIN/.test(nom)) vrais++;
    if (/TEMOIN WETH/.test(nom) && m.etat === 'EVM_ORDINAIRE') temoinOk++;
    if (/TEMOIN adresse/.test(nom) && m.etat === 'AUCUN_CODE') temoinOk++;
  }
  console.log('  ⇒ ' + vrais + ' devise(s) a prefixe b20 sur ' + suspects.length + ' portent le marqueur exact.');
  if (temoinOk !== 2) {
    console.log('  ⛔ UN TEMOIN A MENTI : la lecture de bytecode n est pas fiable sur ce noeud, et');
    console.log('     aucun des verdicts ci-dessus ne doit etre cru. Rejouer sur un noeud Base officiel.');
  }
}

/* ══ 5. LES BORNES ══════════════════════════════════════════════════════════════════════════ */
console.log('\n=== LES BORNES ===');
console.log('  · cette mesure ne regarde QUE les jetons que l index connait deja : elle dit contre');
console.log('    quoi les marches LISTES sont apparies, jamais pourquoi les autres ne le sont pas.');
console.log('  · une devise utilisee par 1 ou 2 jetons n est pas une pratique du marche, meme avec');
console.log('    beaucoup de paires — voir le piege nomme plus haut.');
console.log('  · `eth_getCode` prouve le MARQUEUR, pas ce que le jeton represente : « AAPLc » porte');
console.log('    un nom, et rien ici ne dit qu une action Apple existe derriere.');
