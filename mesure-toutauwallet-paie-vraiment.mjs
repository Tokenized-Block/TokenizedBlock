/* mesure-toutauwallet-paie-vraiment.mjs — L EVENEMENT `ToutAuWallet` CORRESPOND-IL A DE L ARGENT ?
 *
 * ⛔⛔ POURQUOI CETTE SONDE EXISTE : MA PRECEDENTE A RATE SA CIBLE, ET JE LE DIS.
 *     `mesure-frais-sur-tous-les-hooks.mjs` a trouve le bon fait — le hook V8 emet `ToutAuWallet`
 *     quatre fois — puis son « test par transaction » a examine LES SIX PREMIERES TX TOUTES
 *     CATEGORIES CONFONDUES au lieu des quatre qui portent l evenement. Il a donc rendu « 0
 *     transfert vers a6cf » sur des transactions qui n avaient aucune raison d en porter.
 *   ⇒ DEUX defauts, pas un : mauvais echantillon, ET mauvais instrument. Le frais de ce hook est
 *     en ETH (`fraisVieWei` dans l artefact) ; or un mouvement d ETH par appel interne N EMET AUCUN
 *     LOG. Chercher un `Transfer` ERC-20 ne pouvait RIEN trouver, meme si tout marchait.
 *
 * ⇒ CE QUE CELLE-CI FAIT A LA PLACE. Pour chaque `ToutAuWallet` :
 *     1. on lit le SOLDE ETH d a6cf au bloc PRECEDENT et au bloc de l evenement ;
 *     2. une hausse au bloc exact de l evenement relie l evenement a de l ARGENT REEL ;
 *     3. on affiche tous les autres evenements de la meme transaction, pour voir ce qui va ensemble.
 *   C est la seule facon de voir cet ETH : `eth_getBalance` repond a des hauteurs passees, les
 *   traces sont refusees par le noeud public (mesure du 2026-09-26).
 *
 * ⛔ LA BORNE, ET ELLE EST SERIEUSE : un bloc peut contenir PLUSIEURS mouvements sur a6cf. Une hausse
 *   au bon bloc est donc CONSISTANTE avec ce frais, pas la preuve qu elle vient de lui.
 * ⛔ ET ELLE NE COMPARE PAS AU MONTANT DE L EVENEMENT, PARCE QU ELLE NE SAIT PAS LE LIRE : sans
 *   l ABI du hook, la position du montant dans `data` est une supposition. Une premiere version
 *   supposait « les 32 derniers octets » et annoncait 6,097e+29 ETH — LA MEME VALEUR SUR LES QUATRE
 *   evenements. Une sortie constante n est pas une mesure : elle a ete RETIREE, pas rafistolee.
 * ⛔ UN SOLDE NE PORTE PAS D EXPEDITEUR. Cette sonde dit COMBIEN et QUAND, jamais DE QUI.
 *
 * ⚠️ LECTURE SEULE. Aucune signature, aucune cle.
 */
import { readFileSync } from 'node:fs';

const RPC = process.env.TB_RPC || 'https://mainnet.base.org';
const A6CF = '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4';
const art = JSON.parse(readFileSync(new URL('./deploy-v8.json', import.meta.url), 'utf8'));
const HOOK = String(art.hook).toLowerCase();
const TOPIC = String(art.topicPreuve).toLowerCase();
const FRAIS_VIE = art.fraisVieWei ? BigInt(art.fraisVieWei) : null;

const souffler = (ms = 150) => new Promise((r) => setTimeout(r, ms));
let appels = 0;
async function rpc(method, params, essais = 4) {
  for (let i = 0; i < essais; i++) {
    appels++;
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const j = await r.json().catch(() => ({ error: { message: 'reponse non JSON (HTTP ' + r.status + ')' } }));
    if (!j.error) return j.result;
    const msg = j.error.message || String(j.error.code);
    if (!/rate limit|too many|429|limited|timeout/i.test(msg) || i === essais - 1) throw new Error(msg);
    await souffler(800 * (i + 1));
  }
}
const eth = (w) => (Number(w) / 1e18).toFixed(9);
const solde = async (b) => BigInt(await rpc('eth_getBalance', [A6CF, '0x' + b.toString(16)]));

console.log('═══ `ToutAuWallet` CORRESPOND-IL A DE L ARGENT REEL ? ═══\n');
console.log('  hook  : ' + art.hook + '   (lu dans deploy-v8.json)');
console.log('  topic : ' + TOPIC);
console.log('  frais de vie annonce : ' + (FRAIS_VIE === null ? '—' : eth(FRAIS_VIE) + ' ETH') + '\n');
console.log('  ⛔ le frais est en ETH : AUCUN log. On lit donc le SOLDE, pas des `Transfer`.\n');

const tete = parseInt(await rpc('eth_blockNumber', []), 16);
const JOURS = Number(process.env.TB_JOURS || 14);
const PORTEE = Math.floor((JOURS * 24 * 3600) / 2);
const FENETRE = 2000;                                    /* ⛔ plafond du noeud, mesure */
const debut = tete - PORTEE;
const nb = Math.ceil(PORTEE / FENETRE);

console.log('── on retrouve les `ToutAuWallet` (' + nb + ' passes) ──');
const evs = [];
let refusees = 0;
for (let i = 0; i < nb; i++) {
  const de = debut + i * FENETRE, a = Math.min(de + FENETRE - 1, tete);
  try {
    await souffler();
    const logs = await rpc('eth_getLogs', [{ address: HOOK, topics: [TOPIC],
      fromBlock: '0x' + de.toString(16), toBlock: '0x' + a.toString(16) }]);
    for (const l of logs || []) evs.push(l);
  } catch (e) { refusees++; }
  if ((i + 1) % 50 === 0) process.stdout.write('  ' + (i + 1) + '/' + nb + '…\r');
}
console.log('  ' + evs.length + ' evenement(s) trouve(s) · ' + refusees + ' passe(s) REFUSEE(S)            ');
if (refusees) console.log('    ⛔ ' + refusees + ' passe(s) non lue(s) : ce compte est un PLANCHER, pas un total.');
if (!evs.length) {
  console.log('\n  ⛔ AUCUN evenement : rien a verifier. Ce zero est borne par les passes refusees.');
  process.exit(0);
}

console.log('\n── chaque evenement, et le solde du wallet au meme bloc ──');
let relies = 0, totalHausses = 0n;
for (const l of evs) {
  const b = parseInt(l.blockNumber, 16);
  let avant, apres;
  try { await souffler(); avant = await solde(b - 1); apres = await solde(b); }
  catch (e) { console.log('  bloc ' + b + ' : solde NON LU (' + e.message.slice(0, 40) + ')'); continue; }
  const d = apres - avant;
  /* ⛔⛔ JE N INVENTE PLUS DE MONTANT, ET VOICI POURQUOI. La premiere version de cette sonde lisait
   *     les 32 DERNIERS octets de `data` et les annoncait comme le montant du frais. Elle a rendu
   *     « 6,097e+29 ETH » — absurde — et surtout LA MEME VALEUR SUR LES QUATRE EVENEMENTS.
   *   ⇒ UNE SORTIE CONSTANTE N EST PAS UNE MESURE. Quatre evenements de montants differents ne
   *     peuvent pas porter le meme nombre : ce mot n est donc pas un montant (pool id, constante,
   *     champ fixe — on ne sait pas, et c est le point). Sans l ABI du hook, la position du montant
   *     dans `data` est une SUPPOSITION, et une supposition affichee comme un chiffre est un
   *     mensonge poli. On affiche donc les mots BRUTS et on dit qu on ne sait pas les nommer. */
  const data = String(l.data || '0x').slice(2);
  const mots = data.match(/.{1,64}/g) || [];
  console.log('  bloc ' + b + '  tx ' + String(l.transactionHash).slice(0, 18) + '…');
  console.log('      solde a6cf : ' + eth(avant) + ' -> ' + eth(apres)
    + '   variation ' + (d > 0n ? '+' : '') + eth(d) + ' ETH');
  console.log('      donnees de l evenement : ' + mots.length + ' mot(s) de 32 octets, format INCONNU'
    + ' sans l ABI du hook' + (mots.length ? ' — 1er : 0x' + mots[0].slice(0, 16) + '…' : ''));
  if (d > 0n) {
    relies++; totalHausses += d;
    console.log('      ✅ le solde MONTE au bloc de l evenement.');
  } else if (d === 0n) {
    console.log('      ⛔ solde INCHANGE : soit deux mouvements opposes s annulent dans ce bloc, soit');
    console.log('        cet evenement ne verse pas au wallet. La sonde ne tranche pas entre les deux.');
  } else {
    console.log('      ⛔ le solde BAISSE : ce bloc porte une depense plus grosse que le frais.');
  }
}

console.log('\n── VERDICT ──');
console.log('  `ToutAuWallet` vus              : ' + evs.length);
console.log('  avec une HAUSSE du solde au meme bloc : ' + relies);
/* ⛔⛔ LE CHIFFRE QUI DECIDE DE LA BOUCLE CREATEUR, ET IL EST MINUSCULE. Partager un pot se discute ;
 *     partager un pot VIDE ne se discute pas. On le dit donc en ETH ET en ordre de grandeur, parce
 *     qu un nombre en 1e-6 ne se lit pas tout seul. */
console.log('  TOTAL des hausses concordantes  : +' + eth(totalHausses) + ' ETH sur ~' + JOURS + ' j');
console.log('    ⇒ une part createur de 20 % vaudrait ' + eth(totalHausses / 5n) + ' ETH sur la periode.');
console.log('    ⛔ CE N EST PAS LE PARTAGE QUI MANQUE, C EST LE POT. Un pourcentage d un pot vide');
console.log('      reste vide, quelle que soit la generosite du reglage.');
if (relies === evs.length && evs.length > 0) {
  console.log('  ✅ CHAQUE evenement tombe sur une hausse du wallet. L evenement n est pas decoratif :');
  console.log('    il accompagne de l argent qui arrive.');
} else if (relies === 0) {
  console.log('  ⛔⛔ AUCUN evenement ne tombe sur une hausse. L evenement serait alors DECORATIF —');
  console.log('    ou le versement passe ailleurs. A ne pas conclure sans regarder le contrat.');
} else {
  console.log('  ⚠️ ' + relies + '/' + evs.length + ' seulement. Les autres meritent un examen : un bloc charge peut');
  console.log('    masquer la hausse, ce n est pas forcement un versement manquant.');
}
console.log('\n⛔ CE QUE CETTE SONDE NE DIT PAS : que la hausse VIENT de cet evenement. Un bloc peut');
console.log('   porter plusieurs mouvements, et un solde ne porte pas d expediteur. Elle etablit une');
console.log('   CONCORDANCE bloc par bloc, ce qui est beaucoup plus qu une bisection en aveugle —');
console.log('   et beaucoup moins qu une trace.');
console.log('   ⛔ ET ELLE NE DIT RIEN DE LA PART CREATEUR : `ToutAuWallet` signifie 100 % au wallet.');
console.log('   Appels RPC : ' + appels);
