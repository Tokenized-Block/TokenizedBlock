/* ce-qui-garde-liste.mjs — QU EST-CE QUI GARDE UN MARCHE DANS L INDEX ?
 * ================================================================================================
 *   node ce-qui-garde-liste.mjs [jours]      defaut : 14
 *
 * ⛔⛔ CE QUE `seuil-d-indexation.mjs` A LAISSE OUVERT, ET POURQUOI IL LE DISAIT LUI-MEME. Il a
 *     montre une falaise d AGE — 100 % d indexes entre 12 et 24 h, 0 % entre 24 et 48 h — en
 *     ecrivant a cote qu elle compare des jetons DIFFERENTS, donc qu elle ne peut pas prouver un
 *     RETRAIT. Suivre des cohortes n est pas suivre des individus.
 *
 * ⛔ CE FICHIER NE PREND PAS LA MEME QUESTION. « A partir de quelle taille » etait deja une
 *    mauvaise question — la mesure l a refutee. Celle-ci se coupe en DEUX, parce que « ce qui
 *    garde » melange deux choses que rien n oblige a aller ensemble :
 *      NECESSAIRE  — tout jeton LISTE a-t-il echange recemment ? (si un seul liste est muet
 *                    depuis longtemps, le silence ne fait pas perdre la place)
 *      SUFFISANT   — tout jeton qui a echange recemment est-il LISTE ? (si un seul echange
 *                    recemment sans etre liste, echanger ne suffit pas a en gagner une)
 *    Les deux se mesurent separement. Un « seuil » unique les confondrait, et c est exactement
 *    l erreur qui a coute deux instruments la semaine derniere.
 *
 * ⛔⛔ LA VARIABLE EXPLICATIVE VIENT DE LA CHAINE, JAMAIS DE L INDEX, ET C EST LE POINT LE PLUS
 *     IMPORTANT DE CE FICHIER. `txns.h24` publie par l index tombe a zero DES QU IL CESSE
 *     D INDEXER — par construction. L utiliser pour expliquer l absence reviendrait a expliquer le
 *     silence par le silence, et le graphique serait parfait. On date donc la derniere activite
 *     par le dernier `Transfer` ON-CHAIN, que l index ne controle pas.
 *
 * ⛔ CE QU UN INSTANTANE NE PEUT PAS TRANCHER, ET IL FAUT LE DIRE AVANT DE MONTRER LE RESULTAT :
 *    le SENS de la fleche. « echanger recemment garde la place » et « avoir la place amene des
 *    echanges » produisent le MEME tableau. Aucune ligne de ce fichier ne les separe.
 *    ⇒ C est pour ca qu il ECRIT UN PANEL sur disque : la liste exacte des jetons observes, avec
 *      leur etat du jour. Une execution ulterieure relit ce fichier et mesure LES MEMES jetons —
 *      alors seulement on verra des individus PERDRE leur place, ou la garder en se taisant.
 *      Le panel est la seule chose ici qui pourra un jour prouver un retrait.
 *
 * ⛔ DEUX TEMOINS avant toute mesure : un jeton Base liste doit repondre « connu », une adresse
 *    FABRIQUEE doit repondre « inconnu ». Sinon on s arrete sans rien conclure.
 * ⛔ LECTURE SEULE : aucune ecriture on-chain, aucune signature, aucune cle.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { V4_ADRESSES } from './lancer-pool.js';
import { HOOKS, PAS_LOGS, topicDe } from './veille-frais.js';
import { BLOCS_PAR_JOUR } from './comparer-frais.js';

const RPC = process.env.TB_RPC || 'https://mainnet.base.org';
const POOLM = V4_ADRESSES[8453].poolm;
const TOPIC_INITIALIZE = topicDe('Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)');
const TOPIC_TRANSFER = topicDe('Transfer(address,address,uint256)');
const NOS_HOOKS = new Set(Object.values(HOOKS).map((a) => String(a).toLowerCase()));
const estB20 = (a) => /^0xb20/i.test(String(a));
const adr = (t) => '0x' + String(t || '').slice(26).toLowerCase();
const TEMOIN_POSITIF = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'; /* USDC sur Base */
const TEMOIN_NEGATIF = '0xb20000000000000000000000000000000000dead'; /* fabriquee expres */
const MAX_JETONS = Number(process.env.TB_MAX_JETONS || 300);
const PANEL = 'panel-indexation.json';

let idRpc = 1;
async function rpc(m, p) {
  let dernier = 'inconnu';
  for (let e = 0; e < 10; e++) {
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: idRpc++, method: m, params: p }) });
    const j = await r.json();
    if (!j.error) return j.result;
    dernier = j.error.message || '';
    if (!/rate limit|limit exceeded|too many|capacity/i.test(dernier)) throw new Error(dernier);
    await new Promise((f) => setTimeout(f, 600 * (e + 1)));
  }
  throw new Error(dernier);
}

/** TROIS etats, jamais deux : une requete qui echoue n est pas un « non ». */
async function demanderIndex(jeton) {
  for (let e = 0; e < 4; e++) {
    try {
      const r = await fetch('https://api.dexscreener.com/token-pairs/v1/base/' + jeton);
      if (r.status === 429) { await new Promise((f) => setTimeout(f, 1500 * (e + 1))); continue; }
      if (!r.ok) { await new Promise((f) => setTimeout(f, 700 * (e + 1))); continue; }
      const j = await r.json();
      if (!Array.isArray(j)) return { etat: 'ILLISIBLE' };
      const paires = j.filter((p) => String(p.chainId).toLowerCase() === 'base');
      if (!paires.length) return { etat: 'INCONNU' };
      const somme = (f) => paires.reduce((s, p) => s + (Number(f(p)) || 0), 0);
      return { etat: 'CONNU', paires: paires.length,
        liquiditeUsd: somme((p) => p.liquidity && p.liquidity.usd),
        /* ⛔ DESCRIPTIF SEULEMENT. Ce compteur vient de l index : il ne sert JAMAIS de variable
         *    explicative, il ne fait que decrire ce que l index croit voir chez ceux qu il voit. */
        txns24: somme((p) => p.txns && p.txns.h24 && (p.txns.h24.buys + p.txns.h24.sells)) };
    } catch (_) { await new Promise((f) => setTimeout(f, 700 * (e + 1))); }
  }
  return { etat: 'ILLISIBLE' };
}

/** Compte les Transfer ET RETIENT LE DERNIER BLOC — c est le dernier qui porte la question ici. */
async function activiteDeTous(jetons, de, a) {
  const par = new Map(jetons.map((j) => [j, { n: 0, adresses: new Set(), dernier: 0 }]));
  let blocsNonLus = 0, appels = 0;
  async function balayer(d, f) {
    appels++;
    let logs;
    try {
      logs = await rpc('eth_getLogs', [{ address: jetons, topics: [TOPIC_TRANSFER],
        fromBlock: '0x' + d.toString(16), toBlock: '0x' + f.toString(16) }]);
    } catch (e) {
      if (f - d + 1 > 25) {
        const m = d + Math.floor((f - d) / 2);
        await balayer(d, m); await balayer(m + 1, f);
        return;
      }
      blocsNonLus += f - d + 1;
      return;
    }
    for (const l of logs || []) {
      const e = par.get(String(l.address).toLowerCase());
      if (!e) continue;
      e.n++;
      e.adresses.add(adr(l.topics[1]));
      e.adresses.add(adr(l.topics[2]));
      const b = Number(BigInt(l.blockNumber));
      if (b > e.dernier) e.dernier = b;
    }
  }
  for (let b = de; b <= a; b += PAS_LOGS) await balayer(b, Math.min(b + PAS_LOGS - 1, a));
  return { par, blocsNonLus, appels };
}

/* ══ 0. LES TEMOINS D ABORD ══════════════════════════════════════════════════════════════════ */
console.log('=== 0. LES TEMOINS ===');
const tPos = await demanderIndex(TEMOIN_POSITIF);
const tNeg = await demanderIndex(TEMOIN_NEGATIF);
console.log('   positif : ' + tPos.etat + ' · negatif : ' + tNeg.etat);
if (tPos.etat !== 'CONNU' || tNeg.etat !== 'INCONNU') {
  console.log('\n⛔ Un temoin ment. On s arrete AVANT de mesurer — une sonde cassee rendrait un '
    + 'resultat qui ressemble a une decouverte.');
  process.exit(1);
}

/* ══ 1. LA POPULATION ════════════════════════════════════════════════════════════════════════ */
const JOURS = Number(process.argv[2] || 14);
const tete = Number(BigInt(await rpc('eth_blockNumber', [])));
const DE = tete - Math.round(JOURS * BLOCS_PAR_JOUR);
console.log('\n=== 1. LA POPULATION (chaine) ===');
console.log('   fenetre : ' + DE + ' → ' + tete + '  (' + JOURS + ' j)');
const parJeton = new Map();
let fenetres = 0, ratees = 0;
for (let b = DE; b <= tete; b += PAS_LOGS) {
  const fin = Math.min(b + PAS_LOGS - 1, tete);
  fenetres++;
  let logs;
  try {
    logs = await rpc('eth_getLogs', [{ address: POOLM, topics: [TOPIC_INITIALIZE],
      fromBlock: '0x' + b.toString(16), toBlock: '0x' + fin.toString(16) }]);
  } catch (e) { ratees++; continue; }
  for (const l of logs || []) {
    const d = String(l.data).replace(/^0x/, '');
    const hook = '0x' + d.slice(64 * 2 + 24, 64 * 3).toLowerCase();
    const c0 = adr(l.topics[2]), c1 = adr(l.topics[3]);
    const jeton = estB20(c1) ? c1 : estB20(c0) ? c0 : null;
    if (!jeton) continue;
    const e = parJeton.get(jeton);
    const bloc = Number(BigInt(l.blockNumber));
    if (!e) parJeton.set(jeton, { jeton, bloc, hooks: new Set([hook]) });
    else { e.hooks.add(hook); if (bloc < e.bloc) e.bloc = bloc; }
  }
}
console.log('   fenetres : ' + fenetres + ' · ratees : ' + ratees
  + (ratees ? '  ⛔ POPULATION INCOMPLETE' : '  ✅ complete'));
let jetons = [...parJeton.values()];
console.log('   jetons B20 distincts : ' + jetons.length);
if (jetons.length > MAX_JETONS) {
  jetons.sort((a, b) => a.bloc - b.bloc);
  const pas = jetons.length / MAX_JETONS;
  const pris = [];
  for (let i = 0; pris.length < MAX_JETONS && Math.floor(i * pas) < jetons.length; i++) pris.push(jetons[Math.floor(i * pas)]);
  const dejaLa = new Set(pris.map((j) => j.jeton));
  const notres = jetons.filter((j) => [...j.hooks].some((h) => NOS_HOOKS.has(h)) && !dejaLa.has(j.jeton));
  console.log('   ⛔ ECHANTILLON : ' + pris.length + ' sur ' + jetons.length + ', a pas constant dans '
    + 'l ordre de NAISSANCE (jamais par taille) · + ' + notres.length + ' des notres d office');
  jetons = pris.concat(notres);
}

/* ══ 2. DATER LA DERNIERE ACTIVITE, SUR LA CHAINE ════════════════════════════════════════════ */
console.log('\n=== 2. LA DERNIERE ACTIVITE (chaine, pas l index) ===');
const act = await activiteDeTous(jetons.map((j) => j.jeton), DE, tete);
console.log('   appels : ' + act.appels + ' · blocs non lus : ' + act.blocsNonLus
  + (act.blocsNonLus ? '  ⛔ LES DATES SONT DES PLANCHERS' : '  ✅ lecture complete'));
for (const j of jetons) {
  const e = act.par.get(j.jeton) || { n: 0, adresses: new Set(), dernier: 0 };
  j.transferts = e.n;
  j.adresses = e.adresses.size;
  /* ⛔ `dernier === 0` veut dire « pas un seul Transfer DANS LA FENETRE », pas « jamais ».
   *    Le distinguer d un silence de 3 h est tout l objet de la mesure. */
  j.silenceH = e.dernier ? ((tete - e.dernier) * 24) / BLOCS_PAR_JOUR : null;
  j.ageH = ((tete - j.bloc) * 24) / BLOCS_PAR_JOUR;
  j.aNous = [...j.hooks].some((h) => NOS_HOOKS.has(h));
}

/* ══ 3. L INDEX ══════════════════════════════════════════════════════════════════════════════ */
console.log('\n=== 3. L INDEX (un appel par jeton) ===');
let connus = 0, inconnus = 0, illisibles = 0;
for (let i = 0; i < jetons.length; i++) {
  jetons[i].index = await demanderIndex(jetons[i].jeton);
  const e = jetons[i].index.etat;
  if (e === 'CONNU') connus++; else if (e === 'INCONNU') inconnus++; else illisibles++;
  if ((i + 1) % 50 === 0 || i === jetons.length - 1) {
    console.log('   ' + (i + 1) + '/' + jetons.length + ' · connus ' + connus + ' · inconnus '
      + inconnus + ' · illisibles ' + illisibles);
  }
  await new Promise((f) => setTimeout(f, 220));
}
const lisibles = jetons.filter((j) => j.index.etat !== 'ILLISIBLE');
if (illisibles) console.log('   ⛔ ' + illisibles + ' illisible(s), ecartes — jamais comptes comme « non indexes ».');

/* ══ 4. NECESSAIRE ? — tout jeton LISTE a-t-il echange recemment ? ═══════════════════════════ */
console.log('\n=== 4. LE SILENCE FAIT-IL PERDRE LA PLACE ? (necessaire) ===');
const listes = lisibles.filter((j) => j.index.etat === 'CONNU');
const ignores = lisibles.filter((j) => j.index.etat === 'INCONNU');
console.log('   listes : ' + listes.length + ' · ignores : ' + ignores.length);
if (!listes.length || !ignores.length) {
  console.log('   ⛔ un seul cote est peuple — il n y a rien a comparer. On s arrete.');
  process.exit(1);
}
const muets = listes.filter((j) => j.silenceH === null);
const silences = listes.filter((j) => j.silenceH !== null).map((j) => j.silenceH).sort((a, b) => a - b);
console.log('   parmi les LISTES :');
console.log('     · ' + muets.length + ' n ont AUCUN transfert dans la fenetre'
  + (muets.length
    ? '  ⛔ le silence ne fait donc PAS perdre la place a tout le monde'
    : '  ✅ tous ont bouge au moins une fois'));
if (silences.length) {
  const q = (p) => silences[Math.min(silences.length - 1, Math.floor(p * silences.length))];
  console.log('     · silence depuis le dernier echange — median ' + q(0.5).toFixed(1)
    + ' h · 90e centile ' + q(0.9).toFixed(1) + ' h · MAXIMUM ' + silences[silences.length - 1].toFixed(1) + ' h');
  console.log('     ⇒ LECTURE : aucun jeton liste n est muet depuis plus de '
    + silences[silences.length - 1].toFixed(1) + ' h. C est la borne que le silence ne franchit pas'
    + (muets.length ? ' PARMI CEUX QUI ONT BOUGE — les ' + muets.length + ' muets la contredisent.' : '.'));
}

/* ══ 5. SUFFISANT ? — tout jeton qui a echange recemment est-il LISTE ? ══════════════════════ */
console.log('\n=== 5. ECHANGER RECEMMENT SUFFIT-IL ? (suffisant) ===');
{
  const FENETRES = [6, 12, 24, 48, 96];
  for (const h of FENETRES) {
    const recents = lisibles.filter((j) => j.silenceH !== null && j.silenceH <= h);
    if (!recents.length) continue;
    const c = recents.filter((j) => j.index.etat === 'CONNU').length;
    console.log('   actifs dans les ' + String(h).padStart(3) + ' dernieres h : '
      + String(recents.length).padStart(4) + ' jeton(s) · ' + String(c).padStart(4) + ' liste(s) · '
      + String(Math.round((c / recents.length) * 100)).padStart(3) + ' %');
  }
  const recents24 = lisibles.filter((j) => j.silenceH !== null && j.silenceH <= 24);
  const rates = recents24.filter((j) => j.index.etat === 'INCONNU');
  console.log('   ⇒ ' + rates.length + ' jeton(s) ont echange dans les 24 h et NE SONT PAS listes'
    + (rates.length ? '  ⛔ echanger recemment NE SUFFIT PAS.' : '  ✅ echanger recemment suffit, sur cette fenetre.'));
}

/* ══ 6. NOS JETONS SUR LA MEME ECHELLE ═══════════════════════════════════════════════════════ */
console.log('\n=== 6. NOS JETONS ===');
const nous = lisibles.filter((j) => j.aNous);
if (!nous.length) {
  console.log('   ⛔ AUCUN des notres dans la fenetre — ce n est pas « 0 % », c est « rien a mesurer ».');
} else {
  for (const j of nous.sort((a, b) => (a.silenceH ?? 1e9) - (b.silenceH ?? 1e9))) {
    console.log('   ' + j.jeton.slice(0, 10) + '… silence '
      + (j.silenceH === null ? 'AUCUN transfert' : j.silenceH.toFixed(1) + ' h').padStart(16)
      + ' · ' + String(j.transferts).padStart(5) + ' transferts · '
      + (j.index.etat === 'CONNU' ? 'LISTE' : 'ignore'));
  }
  /* ⛔ LE TAUX DE BASE EST RAPPELE ICI, parce que c est precisement son absence qui a fait prendre
   *    « 0 sur 8 » pour une anomalie alors que c etait le resultat le plus probable. */
  const base = ignores.length + listes.length ? listes.length / (listes.length + ignores.length) : 0;
  const p0 = Math.pow(1 - base, nous.length);
  console.log('   taux de base de la population : ' + (base * 100).toFixed(1) + ' % · '
    + 'P(observer 0 liste sur nos ' + nous.length + ') = ' + (p0 * 100).toFixed(1) + ' %');
  console.log('   ⛔ un compte sans son denominateur n est pas une mesure, c est une impression.');
}

/* ══ 7. LE PANEL — la seule chose ici qui pourra prouver un RETRAIT ══════════════════════════
 * ⛔⛔ TOUT CE QUI PRECEDE EST UN INSTANTANE, ET UN INSTANTANE NE DONNE PAS LE SENS DE LA FLECHE :
 *     « echanger garde la place » et « avoir la place amene des echanges » rendent le MEME
 *     tableau. On ecrit donc la liste EXACTE des jetons observes avec leur etat du jour. Une
 *     execution ulterieure relira ce fichier et mesurera LES MEMES individus — alors seulement on
 *     verra quelqu un PERDRE sa place, ou la garder en se taisant.
 * ⛔ ET SI LE PANEL EXISTE DEJA, ON LE COMPARE AVANT DE L ECRASER : ecraser en silence detruirait
 *    la seule donnee que ce fichier existe pour produire. */
console.log('\n=== 7. LE PANEL ===');
const aujourdhui = jetons.filter((j) => j.index.etat !== 'ILLISIBLE').map((j) => ({
  jeton: j.jeton, bloc: j.bloc, aNous: j.aNous,
  transferts: j.transferts, silenceH: j.silenceH === null ? null : Number(j.silenceH.toFixed(2)),
  etat: j.index.etat,
}));
if (existsSync(PANEL)) {
  let avant = null;
  try { avant = JSON.parse(readFileSync(PANEL, 'utf8')); } catch (_) { avant = null; }
  if (avant && Array.isArray(avant.jetons)) {
    const parAvant = new Map(avant.jetons.map((x) => [x.jeton, x]));
    let perdus = 0, gagnes = 0, revus = 0;
    const exemples = [];
    for (const x of aujourdhui) {
      const a = parAvant.get(x.jeton);
      if (!a) continue;
      revus++;
      if (a.etat === 'CONNU' && x.etat === 'INCONNU') { perdus++; if (exemples.length < 6) exemples.push('PERDU  ' + x.jeton.slice(0, 10) + '… silence ' + x.silenceH + ' h'); }
      if (a.etat === 'INCONNU' && x.etat === 'CONNU') { gagnes++; if (exemples.length < 6) exemples.push('GAGNE  ' + x.jeton.slice(0, 10) + '… silence ' + x.silenceH + ' h'); }
    }
    console.log('   panel precedent : ' + avant.quand + ' · ' + revus + ' jeton(s) revus');
    console.log('   ⇒ ' + perdus + ' ont PERDU leur place · ' + gagnes + ' l ont GAGNEE');
    for (const e of exemples) console.log('     ' + e);
    if (!revus) console.log('   ⛔ aucun jeton en commun : les deux executions ne portent pas sur les memes individus, '
      + 'donc rien ne se compare. Relancer avec la meme fenetre.');
  }
} else {
  console.log('   aucun panel precedent — celui-ci est le PREMIER point. Il ne prouve rien tout seul :');
  console.log('   c est la PROCHAINE execution qui pourra montrer un retrait.');
}
/* ⛔ LA DATE EST PRISE DE L HORLOGE, JAMAIS ECRITE EN DUR. Un panel dont la date est figee dans le
 *    code se relit un mois plus tard en affirmant la date du jour ou il a ete ECRIT — et c est
 *    precisement le chiffre qu on viendra lire pour savoir combien de temps a passe.
 * ⛔ Le bloc de tete est garde A COTE : lui ne depend d aucune horloge locale, et c est lui qui
 *    permet de calculer l ecart reel entre deux executions si les horloges divergent. */
writeFileSync(PANEL, JSON.stringify({ quand: new Date().toISOString(),
  blocTete: tete, jours: JOURS, jetons: aujourdhui }, null, 1));
console.log('   ecrit : ' + PANEL + ' (' + aujourdhui.length + ' jetons)');

/* ══ 8. LES BORNES ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n=== 8. LES BORNES ===');
console.log('   · LE SENS DE LA FLECHE N EST PAS TRANCHE ICI. Un instantane ne distingue pas');
console.log('     « echanger garde la place » de « avoir la place amene des echanges ». Seul le');
console.log('     panel, relu plus tard, le pourra.');
console.log('   · `txns.h24` de l index n a servi a RIEN d explicatif : il tombe a zero des que');
console.log('     l index cesse d indexer, donc il expliquerait le silence par le silence.');
console.log('   · un Transfer n est pas un swap — une distribution en produit aussi.');
console.log('   · « aucun transfert » veut dire « aucun DANS LA FENETRE », jamais « jamais ».');
