/* mesure-frais-sur-tous-les-hooks.mjs — LE HOOK VERSE-T-IL LA PART CREATEUR, SUR TOUS LES BLOCKS ?
 *
 * ⛔⛔ LA QUESTION DE PHIL (2026-09-26) : « la question le hook applique-t-il dime() = 20 reste
 *     ouverte — on n a pas vu un seul versement de frais en jeton a examiner, SI TU REGARDES SUR
 *     TOUS LES CREATED BLOCK LIVE ».
 *
 * ⛔ POURQUOI MA SONDE PRECEDENTE NE POUVAIT PAS REPONDRE. Elle partait de la BOITE DE RECEPTION
 *   d a6cf : « quels jetons sont arrives sur le wallet ? ». Elle n y a trouve que des airdrops. Mais
 *   un wallet ne voit que ce qu on lui envoie — si le hook ne verse rien, la boite est vide, et une
 *   boite vide ne dit pas POURQUOI. Partir du wallet, c est partir du mauvais bout.
 *
 * ⇒ ON PART DU HOOK. Le hook EMET un evenement quand il prend un frais : le depot le sait, c est
 *   ecrit dans `deploy-v8.json` (`topicPreuve`, le topic de `ToutAuWallet`, grave dans le bytecode
 *   du V7 et ABSENT de celui du V6). `eth_getLogs` filtre par ADRESSE : une seule passe couvre donc
 *   TOUS les blocks a la fois, sans avoir a les enumerer. C est exactement ce que Phil demande.
 *
 * ⛔ ET ON INTERROGE LES SEPT HOOKS, pas seulement le dernier. Le depot contient sept artefacts de
 *   deploiement ; je ne SAIS PAS lequel les blocks vivants utilisent vraiment, et supposer « le plus
 *   recent » serait exactement le genre de raccourci qui a deja coute une journee. On demande a la
 *   chaine lequel a emis quelque chose.
 *
 * ⛔⛔ LA BORNE QUI COMPTE, ET ELLE EST REELLE : cette sonde lit les EVENEMENTS DU HOOK. Un hook qui
 *     prelevrait un frais SANS RIEN EMETTRE serait invisible pour elle. Un silence ici veut donc
 *     dire « aucun evenement », jamais « aucun frais ». La difference est ecrite dans le verdict.
 * ⛔ ET UN HOOK MUET NE SE DISTINGUE PAS D UN HOOK JAMAIS UTILISE : zero evenement peut vouloir dire
 *   « personne ne s en sert » (ce que les 685 pools / 0 chez nous disent deja) ou « il s en sert sans
 *   le dire ». La sonde compte donc TOUS les evenements, pas seulement ceux qu elle reconnait : un
 *   topic inconnu est AFFICHE, jamais avale.
 *
 * ⚠️ LECTURE SEULE. Aucune signature, aucune cle.
 */
import { readFileSync } from 'node:fs';

const RPC = process.env.TB_RPC || 'https://mainnet.base.org';
const A6CF = '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4';
const TOPIC_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const adrDeTopic = (t) => '0x' + String(t).slice(26).toLowerCase();

/* ── les hooks, LUS dans les artefacts, jamais recopies de memoire ─────────────────────────────
 * ⛔ REGLE DU DEPOT : ne jamais completer une adresse de memoire. Elles sortent des fichiers. */
const HOOKS = [];
for (const v of [2, 3, 4, 5, 6, 7, 8]) {
  try {
    const j = JSON.parse(readFileSync(new URL('./deploy-v' + v + '.json', import.meta.url), 'utf8'));
    if (j.hook) HOOKS.push({ v: 'V' + v, adr: String(j.hook).toLowerCase(), brut: j.hook,
      dime: j.dimeCreateurPourCent, topicPreuve: j.topicPreuve ? String(j.topicPreuve).toLowerCase() : null });
  } catch (e) { console.log('⛔ deploy-v' + v + '.json non lu : ' + e.message); }
}
if (!HOOKS.length) { console.log('⛔ AUCUN artefact de hook lu — la sonde ne peut rien dire.'); process.exit(2); }

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

console.log('═══ LE HOOK VERSE-T-IL LA PART CREATEUR ? — LU SUR LE HOOK, TOUS BLOCKS CONFONDUS ═══\n');
console.log('  hooks interroges (lus dans les artefacts) :');
for (const h of HOOKS) console.log('    ' + h.v.padEnd(3) + ' ' + h.brut + '   dime declaree : ' + (h.dime ?? '—'));
const TOPIC_TOUT_AU_WALLET = HOOKS.map((h) => h.topicPreuve).find(Boolean) || null;
console.log('\n  topic `ToutAuWallet` (lu dans l artefact) : ' + (TOPIC_TOUT_AU_WALLET || '⛔ ABSENT des artefacts'));
if (!TOPIC_TOUT_AU_WALLET) {
  console.log('    ⚠️ Sans lui on ne pourra pas NOMMER l evenement — on comptera quand meme tous les');
  console.log('      topics emis, ce qui suffit a dire s il y a des frais ou non.');
}

const tete = parseInt(await rpc('eth_blockNumber', []), 16);
const JOURS = Number(process.env.TB_JOURS || 14);
const PORTEE = Math.floor((JOURS * 24 * 3600) / 2);              /* ~2 s par bloc sur Base */
/* ⛔ 2000 BLOCS, ET C EST LE NOEUD QUI LE DIT : mesure du depot (`index-blocks.js`), pas un choix.
 *   Au-dela, Base rend HTTP 413 — et un refus se lirait comme un vide. */
const FENETRE = 2000;
const debut = tete - PORTEE;
const nbFenetres = Math.ceil(PORTEE / FENETRE);
console.log('\n  fenetre : blocs ' + debut + ' -> ' + tete + '  (~' + JOURS + ' j, ' + nbFenetres + ' passes de ' + FENETRE + ')');
console.log('  ⛔ un refus de fenetre est COMPTE et affiche : « pas regarde » n est pas « rien trouve ».\n');

const adresses = HOOKS.map((h) => h.adr);
const parHook = new Map(HOOKS.map((h) => [h.adr, { ...h, logs: [] }]));
let lues = 0, refusees = 0;
const refus = [];

console.log('── balayage ──');
for (let i = 0; i < nbFenetres; i++) {
  const de = debut + i * FENETRE;
  const a = Math.min(de + FENETRE - 1, tete);
  try {
    await souffler();
    const logs = await rpc('eth_getLogs', [{ address: adresses,
      fromBlock: '0x' + de.toString(16), toBlock: '0x' + a.toString(16) }]);
    lues++;
    for (const l of logs || []) {
      const e = parHook.get(String(l.address).toLowerCase());
      if (e) e.logs.push(l);
    }
  } catch (err) {
    refusees++;
    if (refus.length < 4) refus.push(de + '-' + a + ' : ' + err.message.slice(0, 60));
  }
  if ((i + 1) % 25 === 0) process.stdout.write('  ' + (i + 1) + '/' + nbFenetres + ' passes…\r');
}
console.log('  ' + lues + '/' + nbFenetres + ' passes lues · ' + refusees + ' REFUSEES                    ');
for (const r of refus) console.log('    ⛔ ' + r);
if (refusees > 0) {
  console.log('    ⛔ ' + refusees + ' passe(s) NON LUE(S) = ~' + (refusees * FENETRE * 2 / 3600).toFixed(1)
    + ' h de chaine jamais regardee. Tout zero ci-dessous est borne par ca.');
}

/* ── ce que chaque hook a emis ───────────────────────────────────────────────────────────────── */
console.log('\n── ce que chaque hook a EMIS ──');
let totalLogs = 0, hookActif = null;
for (const h of HOOKS) {
  const e = parHook.get(h.adr);
  totalLogs += e.logs.length;
  if (e.logs.length) hookActif = e;
  const topics = new Map();
  for (const l of e.logs) {
    const t = String((l.topics || [])[0] || '(sans topic)').toLowerCase();
    topics.set(t, (topics.get(t) || 0) + 1);
  }
  console.log('  ' + h.v.padEnd(3) + ' ' + h.brut + '  ->  ' + e.logs.length + ' evenement(s)');
  for (const [t, n] of topics) {
    const nom = t === TOPIC_TOUT_AU_WALLET ? '  ⇐ `ToutAuWallet` : 100 % AU WALLET, 0 % AU CREATEUR'
      : '  ⚠️ topic INCONNU — pas avale, affiche';
    console.log('        ' + n + ' x ' + t + nom);
  }
}

/* ── le test qui tranche : la meme transaction paie-t-elle quelqu un d autre ? ─────────────────
 * ⛔ UN EVENEMENT N EST PAS UN VERSEMENT. Meme nomme `ToutAuWallet`, il faut que la TRANSACTION le
 *   confirme : si la part creatrice existait, la tx porterait un second transfert du meme jeton. */
if (hookActif) {
  console.log('\n── LA PREUVE PAR LA TRANSACTION (sur les ' + Math.min(hookActif.logs.length, 6) + ' premiers) ──');
  const vues = new Set();
  for (const l of hookActif.logs) {
    if (vues.size >= 6) break;
    if (vues.has(l.transactionHash)) continue;
    vues.add(l.transactionHash);
    let rec;
    try { await souffler(); rec = await rpc('eth_getTransactionReceipt', [l.transactionHash]); }
    catch (e) { console.log('  ' + l.transactionHash.slice(0, 20) + '… receipt NON LU : ' + e.message.slice(0, 40)); continue; }
    const transferts = (rec.logs || []).filter((x) => (x.topics || [])[0] === TOPIC_TRANSFER);
    const versA6cf = transferts.filter((x) => adrDeTopic(x.topics[2]) === A6CF);
    const jetonsDeFrais = new Set(versA6cf.map((x) => String(x.address).toLowerCase()));
    /* ⛔ LE VOISIN DOIT ETRE DANS LE MEME JETON : un transfert d un AUTRE jeton dans la meme tx est
     *   un swap, une route, n importe quoi — pas une part creatrice. */
    const voisins = transferts.filter((x) => jetonsDeFrais.has(String(x.address).toLowerCase())
      && adrDeTopic(x.topics[2]) !== A6CF);
    console.log('  tx ' + l.transactionHash.slice(0, 20) + '…  ' + transferts.length + ' transfert(s), '
      + versA6cf.length + ' vers a6cf, ' + voisins.length + ' voisin(s) du MEME jeton');
    for (const v of voisins.slice(0, 3)) {
      const m = BigInt(v.data || '0x0');
      const total = versA6cf.reduce((s, x) => s + BigInt(x.data || '0x0'), 0n) + m;
      const part = total > 0n ? Number((m * 10000n) / total) / 100 : null;
      console.log('      -> ' + adrDeTopic(v.topics[2]).slice(0, 12) + '…  ' + m
        + (part === null ? '' : '  (' + part.toFixed(2) + ' % du couple)'));
    }
  }
}

/* ── verdict ─────────────────────────────────────────────────────────────────────────────────── */
console.log('\n── VERDICT ──');
console.log('  evenements emis par nos SEPT hooks, sur ~' + JOURS + ' j : ' + totalLogs);
if (totalLogs === 0) {
  /* ⛔⛔ UN ZERO QUI NE PEUT PAS MONTER RESSEMBLE A UN ZERO DE SUCCES. Celui-ci peut monter : il
   *     suffirait d un seul swap sur une pool a nous. Il dit donc quelque chose de reel. */
  console.log('  ⛔⛔ AUCUN de nos hooks n a emis le moindre evenement sur la fenetre.');
  console.log('    ⇒ La question « le hook verse-t-il 20 % au createur ? » N A PAS D OBJET aujourd hui :');
  console.log('      le hook ne preleve rien parce que PERSONNE NE TRADE dans nos pools. C est');
  console.log('      coherent avec les 685 pools B20 en 24 h dont 0 sur notre hook.');
  console.log('    ⛔ CE QUE CE ZERO NE DIT PAS : qu un hook ne prendrait pas un frais en silence.');
  console.log('      La sonde lit des EVENEMENTS. Un prelevement muet lui echappe — c est sa borne.');
} else if (TOPIC_TOUT_AU_WALLET && parHook.get(hookActif.adr).logs
    .some((l) => String((l.topics || [])[0]).toLowerCase() === TOPIC_TOUT_AU_WALLET)) {
  console.log('  ⛔ Le hook actif emet `ToutAuWallet` : le frais part a 100 % au wallet.');
  console.log('    ⇒ `dime()` rend 20, mais C EST UN GETTER MORT : la repartition ne le lit plus.');
  console.log('      Le createur ne touche RIEN aujourd hui. Regarder les % ci-dessus pour confirmer');
  console.log('      par la transaction — un evenement n est pas un versement.');
} else {
  console.log('  ⚠️ Des evenements existent mais AUCUN ne porte le topic `ToutAuWallet`.');
  console.log('    ⇒ Lire les topics inconnus ci-dessus AVANT de conclure quoi que ce soit.');
}
console.log('\n⛔ CE QUE CETTE SONDE NE DIT PAS : ce que le hook fait en interne. Elle lit des');
console.log('   evenements et des transferts, pas du code — la source des hooks n est pas ici.');
console.log('   Appels RPC : ' + appels);
