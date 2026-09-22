/* seuil-d-indexation.mjs — A PARTIR DE QUELLE TAILLE UN INDEX REMARQUE-T-IL UN MARCHE ?
 * ================================================================================================
 *   node seuil-d-indexation.mjs [jours]      defaut : 21
 *
 * ⛔⛔ CE QUE CE FICHIER NE REFAIT PAS. `sommes-nous-indexes.mjs` a etabli que nos 8 blocks sont
 *     inconnus de l index public pendant que 4 temoins sur 12 le sont. Ca donne un CONSTAT, pas un
 *     seuil : deux groupes de tailles differentes dont l un est liste ne disent pas OU est la
 *     bascule. Pour un seuil il faut une POPULATION etalee en taille, et la reponse de l index
 *     pour chaque individu.
 *
 * ⛔ D OU VIENT LA POPULATION, ET POURQUOI PAS DE L INDEX. Un index ne peut rien dire des marches
 *    qu il ignore : lui demander la liste, ce serait demander a l aveugle de compter les aveugles.
 *    La population vient donc de la CHAINE — tous les `Initialize` v4 de la fenetre dont une des
 *    deux devises est un B20 — et l index n est interroge qu ENSUITE, individu par individu.
 *    ⛔ ET SANS PLAFOND : `pourquoi-pas-indexes.mjs` s arretait a 14 temoins, ce qui suffisait pour
 *       comparer deux groupes et ne suffit pas pour situer une bascule.
 *
 * ⛔⛔ LE PIEGE QUI AURAIT EMPOISONNE TOUTE LA MESURE, MESURE AVANT D ECRIRE CE FICHIER.
 *     L endpoint groupe `dex/tokens/a,b,c` rend AU PLUS 30 paires — et ce plafond est PARTAGE entre
 *     les jetons demandes. Sonde du 2026-09-22 :
 *         WETH + USDC ensemble  -> 30 paires, dont USDC en baseToken : 0
 *         USDC seul             -> 30 paires, dont USDC en baseToken : 23
 *     Un jeton bavard EVINCE les autres, en silence, avec un HTTP 200. Grouper 30 B20 aurait donc
 *     fabrique des « non indexe » faux, et le seuil publie aurait ete bati sur des evictions.
 *     ⇒ UN APPEL PAR JETON, sur `token-pairs/v1/base/{adresse}`, qui rend un tableau propre.
 *
 * ⛔ CE QUE « INCONNU » NE PROUVE PAS. Sonde du 2026-09-22 : une adresse FABRIQUEE et notre jeton
 *    principal rendent la MEME reponse vide. Le silence de l index ne distingue donc pas « ce
 *    marche n existe pas » de « ce marche existe et l index l ignore ». Ici la chaine a deja repondu
 *    a la premiere question, donc le silence se lit comme « pas indexe » — mais uniquement PARCE
 *    QUE la population vient de la chaine. Sortie de ce cadre, la confusion est immediate.
 *
 * ⛔ L AGE EST UN CONFONDANT, PAS UN DETAIL. Une pool nee il y a deux heures n est pas absente
 *    parce qu elle est petite, mais parce qu elle est NEUVE. Les pools plus jeunes que `AGE_MIN_H`
 *    sont donc ECARTEES du verdict — et comptees a l ecran, pour que l ecart ne soit pas un tri
 *    silencieux.
 *
 * ⛔ ET LA TAILLE N EST PAS LE SEUL SUSPECT. Si tous les indexes partagent un hook que nous n avons
 *    pas, c est le hook qui explique, pas la taille — et un seuil publie la-dessus serait une
 *    convergence sur la mauvaise colonne. Le croisement listes/hook est donc imprime A COTE du
 *    seuil, toujours, meme quand il est ennuyeux.
 *
 * ⛔ DEUX TEMOINS, ET LE SCRIPT REFUSE DE CONCLURE SI L UN DES DEUX MENT :
 *      positif — un jeton Base dont on SAIT qu il est liste doit repondre « connu » ;
 *      negatif — une adresse fabriquee doit repondre « inconnu ».
 *    Sans le positif, une sonde cassee rendrait « personne n est indexe » et ca ressemblerait a un
 *    resultat. Sans le negatif, une sonde qui dit oui a tout passerait aussi.
 *
 * ⛔ LECTURE SEULE : aucune ecriture, aucune signature, aucune cle. Aucun montant n est converti en
 *    dollars par nos soins — les dollars affiches sont ceux que l index publie, et ils sont nommes
 *    comme tels.
 */
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

/** Sous cet age, une pool absente de l index ne prouve rien : elle n a pas eu le temps.
 * ⛔⛔ 12 h ET PAS 48, ET LE CHIFFRE VIENT D UNE MESURE, PAS D UNE INTUITION. Premiere execution de
 *     ce fichier, fenetre de 7 heures sur tout Base : 294 pools B20, 100 jetons distincts, et
 *     87 SUR 100 DEJA INDEXES alors qu aucun n avait 48 h. L index ne met donc pas des jours a
 *     voir un marche — il le voit en heures. Un garde-fou a 48 h ecartait 100 % de la population
 *     pour se proteger d un delai qui n existe pas.
 * ⛔ ET CE N EST PAS UN REGLAGE POUR OBTENIR UN RESULTAT : le garde-fou existe pour ne pas appeler
 *    « ignore » ce qui n a pas eu le temps. La mesure dit que le temps necessaire se compte en
 *    heures ; 12 h reste GENEREUX par rapport a elle. Il se remonte par argument si un jour la
 *    latence mesuree remonte. */
const AGE_MIN_H = Number(process.env.TB_AGE_MIN_H || 12);
/** ⛔ AU-DELA, ON ECHANTILLONNE — ET ON LE DIT. Deux journees de Base rendent plusieurs centaines de
 *  jetons ; un tableau d adresses de cette taille fait echouer `eth_getLogs`, et le halving se met
 *  a thrasher. L echantillon est pris A PAS CONSTANT dans l ordre de NAISSANCE, jamais par taille :
 *  trier par taille avant d echantillonner choisirait la reponse. */
const MAX_JETONS = Number(process.env.TB_MAX_JETONS || 300);
/** ⛔ LU A LA SONDE, PAS A LA DOC : `dex/tokens` plafonne a 30 paires TOUTES ADRESSES CONFONDUES. */
const TEMOIN_POSITIF = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'; /* USDC sur Base */
/** ⛔ FABRIQUEE EXPRES, jamais recopiee d ailleurs : elle ne doit correspondre a rien. */
const TEMOIN_NEGATIF = '0xb20000000000000000000000000000000000dead';

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

/**
 * Ce que l index sait d UN jeton. Un appel, un jeton.
 * ⛔ TROIS ETATS, JAMAIS DEUX. « CONNU », « INCONNU » et « ILLISIBLE » — une requete qui echoue
 *    n est pas un « non ». La confondre avec l absence ferait baisser le seuil a chaque panne
 *    reseau, et la panne ressemblerait a une decouverte.
 */
async function demanderIndex(jeton) {
  for (let e = 0; e < 4; e++) {
    try {
      const r = await fetch('https://api.dexscreener.com/token-pairs/v1/base/' + jeton);
      if (r.status === 429) { await new Promise((f) => setTimeout(f, 1500 * (e + 1))); continue; }
      if (!r.ok) { await new Promise((f) => setTimeout(f, 700 * (e + 1))); continue; }
      const j = await r.json();
      if (!Array.isArray(j)) return { etat: 'ILLISIBLE', pourquoi: 'reponse non tabulaire' };
      /* ⛔ ON FILTRE SUR `base` MALGRE L URL : la sonde a montre que l endpoint groupe rend des
       *    paires d AUTRES chaines (WETH a rendu des paires `ink` en premier). Une garde qui ne
       *    coute rien et qui, le jour ou elle sert, evite de mesurer une autre blockchain. */
      const paires = j.filter((p) => String(p.chainId).toLowerCase() === 'base');
      if (!paires.length) return { etat: 'INCONNU', paires: 0 };
      const somme = (f) => paires.reduce((s, p) => s + (Number(f(p)) || 0), 0);
      return {
        etat: 'CONNU',
        paires: paires.length,
        liquiditeUsd: somme((p) => p.liquidity && p.liquidity.usd),
        volume24Usd: somme((p) => p.volume && p.volume.h24),
        txns24: somme((p) => p.txns && p.txns.h24 && (p.txns.h24.buys + p.txns.h24.sells)),
      };
    } catch (_) { await new Promise((f) => setTimeout(f, 700 * (e + 1))); }
  }
  return { etat: 'ILLISIBLE', pourquoi: '4 tentatives echouees' };
}

/** Les mouvements de TOUS les jetons en un seul balayage — `address` accepte un tableau cote RPC.
 * ⛔ HALVING ADAPTATIF : le noeud repond textuellement « eth_getLogs is limited to a 2,000 range ».
 *    Le plafond porte sur la PLAGE, donc une fenetre trop bavarde se coupe en deux plutot que de
 *    rendre un trou. Ce qui reste illisible est COMPTE, jamais assimile a zero. */
async function mouvementsDeTous(jetons, de, a) {
  const par = new Map(jetons.map((j) => [j, { n: 0, adresses: new Set() }]));
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
    }
  }
  for (let b = de; b <= a; b += PAS_LOGS) await balayer(b, Math.min(b + PAS_LOGS - 1, a));
  return { par, blocsNonLus, appels };
}

/* ══ 0. LES TEMOINS PASSENT AVANT TOUT LE RESTE ══════════════════════════════════════════════
 * ⛔ Les lancer A LA FIN reviendrait a balayer la chaine pendant dix minutes pour decouvrir ensuite
 *    que la sonde ne repondait pas. Ils passent en premier, et un echec arrete tout. */
console.log('=== 0. LES TEMOINS — la sonde repond-elle AVANT qu on lui fasse confiance ? ===');
const tPos = await demanderIndex(TEMOIN_POSITIF);
const tNeg = await demanderIndex(TEMOIN_NEGATIF);
console.log('   positif (un jeton Base liste)  : ' + tPos.etat
  + (tPos.etat === 'CONNU' ? ' · ' + tPos.paires + ' paire(s)' : ''));
console.log('   negatif (adresse fabriquee)    : ' + tNeg.etat);
if (tPos.etat !== 'CONNU') {
  console.log('\n⛔ Le temoin POSITIF n a pas repondu « connu ». Une sonde muette rendrait « personne '
    + 'n est indexe », et ca ressemblerait a un resultat. On s arrete AVANT de mesurer.');
  process.exit(1);
}
if (tNeg.etat !== 'INCONNU') {
  console.log('\n⛔ Le temoin NEGATIF est « connu » : la sonde dit oui a une adresse qui n existe pas. '
    + 'Tout seuil calcule avec elle serait du bruit. On s arrete.');
  process.exit(1);
}

/* ══ 1. LA POPULATION VIENT DE LA CHAINE ═════════════════════════════════════════════════════ */
const JOURS = Number(process.argv[2] || 21);
const tete = Number(BigInt(await rpc('eth_blockNumber', [])));
const DE = tete - Math.round(JOURS * BLOCS_PAR_JOUR);
console.log('\n=== 1. LA POPULATION (la chaine, pas l index) ===');
console.log('   fenetre : ' + DE + ' → ' + tete + '  (' + JOURS + ' j)');

const pools = [];
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
    pools.push({ poolId: l.topics[1], jeton, hook, bloc: Number(BigInt(l.blockNumber)) });
  }
}
console.log('   fenetres : ' + fenetres + ' · ratees : ' + ratees
  + (ratees ? '  ⛔ POPULATION INCOMPLETE — un seuil bati dessus serait biaise' : '  ✅ complete'));
console.log('   pools B20 trouvees : ' + pools.length);

/* ⛔ UN JETON PEUT AVOIR PLUSIEURS POOLS. On indexe par JETON — c est le jeton que l index connait
 *    ou ignore, pas la pool. On garde la naissance LA PLUS ANCIENNE : c est depuis elle que l index
 *    a eu le temps de le voir. */
const parJeton = new Map();
for (const p of pools) {
  const e = parJeton.get(p.jeton);
  if (!e) parJeton.set(p.jeton, { jeton: p.jeton, bloc: p.bloc, hooks: new Set([p.hook]), pools: 1 });
  else { e.pools++; e.hooks.add(p.hook); if (p.bloc < e.bloc) e.bloc = p.bloc; }
}
let jetons = [...parJeton.values()];
console.log('   jetons B20 distincts : ' + jetons.length);
/* ⛔ L ECHANTILLONNAGE SE DIT A L ECRAN, TOUJOURS. Un plafond silencieux ferait lire « toute la
 *    population » a quelqu un qui regarde un sous-ensemble — et c est exactement comme ca qu un
 *    chiffre partiel se met a circuler comme un total. */
const nombreTotal = jetons.length;
if (jetons.length > MAX_JETONS) {
  jetons.sort((a, b) => a.bloc - b.bloc);
  const pas = jetons.length / MAX_JETONS;
  const pris = [];
  for (let i = 0; pris.length < MAX_JETONS && Math.floor(i * pas) < jetons.length; i++) {
    pris.push(jetons[Math.floor(i * pas)]);
  }
  /* ⛔⛔ NOS JETONS SONT TOUJOURS DANS L ECHANTILLON, ET CE N EST PAS UN PRIVILEGE : ils sont le
   *     SUJET de la mesure, pas le fond de population. Ils sont rares (7 sur plusieurs milliers),
   *     donc un tirage a pas constant les rate presque surement — et l instrument rendrait alors
   *     « aucun jeton de notre cote », ce qui se lit comme un resultat et n en est pas un.
   *     Les inclure d office ne biaise pas le fond : ils sont comptes A PART au §6. */
  const dejaLa = new Set(pris.map((j) => j.jeton));
  const notres = jetons.filter((j) => [...j.hooks].some((h) => NOS_HOOKS.has(h)) && !dejaLa.has(j.jeton));
  console.log('   ⛔ ECHANTILLON : ' + pris.length + ' jetons sur ' + jetons.length
    + ', pris a pas constant dans l ordre de NAISSANCE (jamais par taille — trier par taille avant '
    + 'd echantillonner choisirait la reponse). Les comptes qui suivent portent sur l echantillon.');
  if (notres.length) {
    console.log('   + ' + notres.length + ' de NOS jetons ajoutes d office : ils sont le sujet de la '
      + 'mesure, et un tirage a pas constant les raterait presque surement.');
  }
  jetons = pris.concat(notres);
}
if (jetons.length < 12) {
  console.log('\n⛔ Moins de 12 jetons : une population trop petite ne situe pas une bascule, elle '
    + 'donne deux paquets. On s arrete plutot que d appeler « seuil » un ecart entre deux groupes.');
  process.exit(1);
}

/* ══ 2. LA TAILLE, MESUREE SUR LA CHAINE ═════════════════════════════════════════════════════ */
console.log('\n=== 2. LA TAILLE DE CHAQUE MARCHE (chaine) ===');
const mv = await mouvementsDeTous(jetons.map((j) => j.jeton), DE, tete);
console.log('   appels : ' + mv.appels + ' · blocs non lus : ' + mv.blocsNonLus
  + (mv.blocsNonLus ? '  ⛔ LES TAILLES SONT DES PLANCHERS' : '  ✅ lecture complete'));
for (const j of jetons) {
  const e = mv.par.get(j.jeton) || { n: 0, adresses: new Set() };
  j.transferts = e.n;
  j.adresses = e.adresses.size;
  j.ageH = ((tete - j.bloc) * 24) / BLOCS_PAR_JOUR;
  j.aNous = [...j.hooks].some((h) => NOS_HOOKS.has(h));
}

/* ══ 3. CE QUE L INDEX EN SAIT — UN APPEL PAR JETON ══════════════════════════════════════════ */
console.log('\n=== 3. CE QUE L INDEX EN SAIT (un appel par jeton, jamais groupe) ===');
let connus = 0, inconnus = 0, illisibles = 0;
for (let i = 0; i < jetons.length; i++) {
  const r = await demanderIndex(jetons[i].jeton);
  jetons[i].index = r;
  if (r.etat === 'CONNU') connus++; else if (r.etat === 'INCONNU') inconnus++; else illisibles++;
  if ((i + 1) % 25 === 0 || i === jetons.length - 1) {
    console.log('   ' + (i + 1) + '/' + jetons.length + ' · connus ' + connus
      + ' · inconnus ' + inconnus + ' · illisibles ' + illisibles);
  }
  await new Promise((f) => setTimeout(f, 220));
}
if (illisibles) {
  console.log('   ⛔ ' + illisibles + ' jeton(s) ILLISIBLES — ecartes du seuil, jamais comptes '
    + 'comme « non indexes » : une panne reseau ferait baisser le seuil et ressemblerait a une trouvaille.');
}

/* ══ 4. L AGE AVANT LA TAILLE ════════════════════════════════════════════════════════════════ */
const lisibles = jetons.filter((j) => j.index.etat !== 'ILLISIBLE');
const tropJeunes = lisibles.filter((j) => j.ageH < AGE_MIN_H);
const murs = lisibles.filter((j) => j.ageH >= AGE_MIN_H);
console.log('\n=== 4. L AGE, ECARTE AVANT DE PARLER DE TAILLE ===');
console.log('   ecartes car nes il y a moins de ' + AGE_MIN_H + ' h : ' + tropJeunes.length
  + ' (dont ' + tropJeunes.filter((j) => j.index.etat === 'CONNU').length + ' deja indexes)');
console.log('   retenus pour le seuil : ' + murs.length);
if (murs.length < 12) {
  console.log('\n⛔ Trop peu de jetons assez ages. On s arrete plutot que de publier un seuil tire '
    + 'de quelques individus.');
  process.exit(1);
}

/* ══ 4bis. LA PRESENCE DANS L INDEX SE PERD-ELLE AVEC L AGE ? ════════════════════════════════
 * ⛔⛔ CETTE SECTION EXISTE PARCE QUE J AI FAILLI CONCLURE D UN COMPTEUR DE PROGRESSION. A la
 *     premiere execution, le decompte affiche tous les 25 jetons montait bien plus vite vers la
 *     fin de la liste — et la liste est triee par NAISSANCE croissante. Lu au vol, ca disait « les
 *     jeunes sont plus indexes que les vieux », ce qui est l inverse d un delai d indexation.
 *     ⛔ Un compteur de progression n est pas une mesure : il n a ni bornes, ni temoin, ni
 *        denominateur par tranche. Le lire comme un resultat, c est exactement le defaut que je
 *        repete. La tranche d age est donc calculee ICI, avec son denominateur, ou pas du tout.
 * ⛔ CE QUE CETTE SECTION NE PEUT PAS DIRE : si la presence se perd, ces chiffres ne disent pas
 *    QUAND elle se perd pour un jeton donne — ils comparent des jetons DIFFERENTS d ages
 *    differents. Il faudrait suivre les MEMES jetons dans le temps pour parler de retrait. */
console.log('\n=== 4bis. LA PRESENCE TIENT-ELLE DANS LE TEMPS ? (tranches d age) ===');
{
  const bornes = [0, 6, 12, 24, 48, 96, Infinity];
  for (let i = 0; i < bornes.length - 1; i++) {
    const g = lisibles.filter((j) => j.ageH >= bornes[i] && j.ageH < bornes[i + 1]);
    if (!g.length) continue;
    const c = g.filter((j) => j.index.etat === 'CONNU').length;
    const nom = bornes[i + 1] === Infinity ? '≥ ' + bornes[i] + ' h' : bornes[i] + '–' + bornes[i + 1] + ' h';
    console.log('   ' + nom.padStart(10) + ' : ' + String(g.length).padStart(4) + ' jeton(s) · '
      + String(c).padStart(4) + ' indexe(s) · ' + String(Math.round((c / g.length) * 100)).padStart(3) + ' %');
  }
  console.log('   ⛔ ces tranches comparent des jetons DIFFERENTS, pas le meme jeton dans le temps :');
  console.log('      elles peuvent montrer un retrait, ou simplement que les cohortes different.');
}

/* ══ 5. LE SEUIL ═════════════════════════════════════════════════════════════════════════════
 * ⛔ ON NE CHERCHE PAS « LE » CHIFFRE, ON CHERCHE LA ZONE. Un seuil se lit entre le plus GROS
 *    ignore et le plus PETIT connu. Si ces deux-la se chevauchent, il n y a pas de seuil de taille
 *    — et c est un resultat, pas un echec de la mesure. */
function seuilSur(nom, cle) {
  const co = murs.filter((j) => j.index.etat === 'CONNU').map((j) => j[cle]).sort((a, b) => a - b);
  const ig = murs.filter((j) => j.index.etat === 'INCONNU').map((j) => j[cle]).sort((a, b) => a - b);
  if (!co.length || !ig.length) {
    console.log('   ' + nom.padEnd(22) + '⛔ un seul cote est peuple (' + co.length + ' connus, '
      + ig.length + ' ignores) — il n y a rien a separer');
    return;
  }
  const plusGrosIgnore = ig[ig.length - 1], plusPetitConnu = co[0];
  const chevauche = plusPetitConnu <= plusGrosIgnore;
  console.log('   ' + nom.padEnd(22) + 'plus PETIT connu : ' + plusPetitConnu
    + ' · plus GROS ignore : ' + plusGrosIgnore
    + (chevauche
      ? '  ⛔ SE CHEVAUCHENT — cet axe ne separe pas'
      : '  ✅ separation nette entre ' + plusGrosIgnore + ' et ' + plusPetitConnu));
  /* ⛔ Le chevauchement se dit AUSSI en nombre : « nette » sur deux individus ne vaut rien. */
  const dedans = ig.filter((x) => x >= plusPetitConnu).length;
  console.log(' '.repeat(25) + ig.length + ' ignores, ' + co.length + ' connus · '
    + dedans + ' ignore(s) au-dessus du plus petit connu');
}
console.log('\n=== 5. LE SEUIL, SUR TROIS AXES ===');
seuilSur('transferts', 'transferts');
seuilSur('adresses distinctes', 'adresses');
seuilSur('pools ouvertes', 'pools');

/* ══ 6. LE CONFONDANT — la taille est-elle VRAIMENT la variable ? ════════════════════════════
 * ⛔ SI TOUS LES INDEXES PARTAGENT UN HOOK QUE NOUS N AVONS PAS, c est le hook qui explique et le
 *    seuil de taille est une coincidence lue dans la mauvaise colonne. Ce croisement s imprime
 *    TOUJOURS, meme quand il est ennuyeux — c est quand il est ennuyeux qu il est le plus utile. */
console.log('\n=== 6. LE CONFONDANT — est-ce bien la TAILLE ? ===');
const nous = murs.filter((j) => j.aNous), eux = murs.filter((j) => !j.aNous);
/* ⛔⛔ UN GROUPE VIDE N EST PAS UN GROUPE A 0 %. « 0 jeton · 0 indexe » se lit comme un resultat
 *     accablant alors que ca veut dire « on n a rien regarde ». C est le meme defaut que « aucune
 *     preuve » dit sans avoir cherche : la phrase est vraie et ce qu elle fait croire est faux. */
const dit = (g, nom) => {
  if (!g.length) {
    console.log('   ' + nom.padEnd(22) + '⛔ AUCUN jeton de ce cote dans la fenetre — ce n est pas '
      + '« 0 % indexe », c est « rien a mesurer ». Aucune conclusion ne se tire d ici.');
    return;
  }
  const c = g.filter((j) => j.index.etat === 'CONNU').length;
  console.log('   ' + nom.padEnd(22) + g.length + ' jeton(s) · ' + c + ' indexe(s)'
    + ' (' + Math.round((c / g.length) * 100) + ' %)');
};
dit(nous, 'sur NOS hooks');
dit(eux, 'sur d AUTRES hooks');
/* ⛔⛔ NOS JETONS, UN PAR UN, SUR L ECHELLE DE LA POPULATION. Une MOYENNE mentirait ici : « 131
 *     transferts sur 7 jetons » se lit « 19 chacun » alors que ca peut etre 131 sur un seul et zero
 *     sur six. Le seul reproche qu on puisse faire a la taille se fait jeton par jeton, compare au
 *     PLUS PETIT indexe de la population — s il y a des notres au-dessus de lui, la taille est
 *     refutee directement, sans modele et sans moyenne. */
if (nous.length) {
  const co = murs.filter((j) => j.index.etat === 'CONNU');
  const minT = Math.min(...co.map((j) => j.transferts));
  const minA = Math.min(...co.map((j) => j.adresses));
  console.log('   — nos jetons, un par un (transferts · adresses · indexe) :');
  let auDessus = 0;
  for (const j of nous.sort((a, b) => b.transferts - a.transferts)) {
    const plusGros = j.transferts >= minT && j.adresses >= minA;
    if (plusGros) auDessus++;
    console.log('     ' + j.jeton.slice(0, 10) + '… ' + String(j.transferts).padStart(6) + ' · '
      + String(j.adresses).padStart(5) + ' · ' + (j.index.etat === 'CONNU' ? 'OUI' : 'non')
      + (plusGros ? '   ⛔ plus gros que le plus petit INDEXE de la population' : ''));
  }
  console.log('   le plus petit INDEXE de la population : ' + minT + ' transfert(s) · ' + minA + ' adresse(s)');
  console.log('   ⇒ ' + auDessus + ' de nos ' + nous.length + ' jeton(s) sont au-dessus de lui sur LES DEUX axes'
    + (auDessus ? ' — la taille ne peut pas expliquer leur absence.' : '.'));
}
const hooksConnus = new Set(murs.filter((j) => j.index.etat === 'CONNU').flatMap((j) => [...j.hooks]));
console.log('   hooks distincts cote indexe : ' + hooksConnus.size);
if (hooksConnus.size <= 1) {
  console.log('   ⛔ UN SEUL hook du cote indexe : la taille et le hook varient ENSEMBLE, et cette '
    + 'mesure ne peut pas les separer. Le seuil ci-dessus est suspect tant que ce compte vaut 1.');
} else {
  console.log('   ✅ plusieurs hooks sont indexes : le hook seul n explique pas la presence.');
}

/* ══ 7. CE QUE CET INSTRUMENT NE PEUT PAS DIRE ═══════════════════════════════════════════════ */
console.log('\n=== 7. LES BORNES ===');
console.log('   · un index n est pas la chaine : son silence ne dit rien de l existence du marche,');
console.log('     il dit que CET index l ignore. La sonde rend la meme reponse vide pour une adresse');
console.log('     fabriquee et pour un marche reel mais ignore.');
console.log('   · un transfert n est pas un swap : une distribution en produit aussi. C est pour ca');
console.log('     que les ADRESSES DISTINCTES sont mesurees a cote — un arrosage les fait monter');
console.log('     sans va-et-vient, un vrai marche fait monter les deux.');
console.log('   · une seule fenetre, un seul index, un seul jour : rien ici ne prouve que le seuil');
console.log('     est stable dans le temps. Il faudrait le remesurer pour le dire.');
if (ratees || mv.blocsNonLus) {
  console.log('   ⛔ · des blocs n ont pas ete lus : toutes les tailles sont des PLANCHERS, donc le');
  console.log('        seuil affiche est un MAJORANT — le vrai est plus bas ou egal.');
}
