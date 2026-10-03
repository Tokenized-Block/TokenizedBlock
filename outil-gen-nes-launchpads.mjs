/* outil-gen-nes-launchpads.mjs — GENERATEUR de jetons-nes-launchpads.js (liste blanche o1, R10 : C2 backlog F1/F2).
 * ⛔ LECTURE SEULE : eth_blockNumber (la tete) puis eth_getLogs par FENETRES de 2 000 blocs (limite de mainnet.base.org),
 *   a rythme leger (pause entre appels, fenetre divisee par 2 sur erreur, reprise avec attente). Aucune transaction,
 *   aucun eth_call, aucun fork. Une fenetre qui echoue pour de bon ARRETE tout : rien n est ecrit (l ancienne liste reste).
 * Cle : l evenement Launched de la fabrique o1 Launchpad STANDARD (un lancement = le jeton topics[1]). Un jeton est retenu
 *   s il est un B20 (0xb2 + 20 zeros), NE (B20Created de la fabrique 0xb20f…0000) dans la MEME transaction que son
 *   lancement, et si la pool du lancement (Initialize du PoolManager, id = poolId) est creee dans cette transaction avec
 *   ce jeton pour devise. Le cote cotation (quoteToken) n est jamais retenu. Exclus ensuite : l ensemble TB (classeBlock
 *   'TB' sans contexte : routeur, nos blocks, liste statique, TBLOCK/TBGAS, V1 de test), les devises connues, et tout jeton
 *   qui a une pool sur un de NOS hooks (estNotreHook) dans la plage lue.
 * ⛔ F5 (C2 R9b) : l exclusion TB charge les SOURCES TB : listes statiques (classeBlock), graines (GRAINE_ROUTEUR, GRAINE_NOS_BLOCKS,
 *   genese) ET les listes servies /api/blocks-routeur + /api/nos-blocks d un serveur (--sources-tb, 2 GET), chargees par le code
 *   meme du client (chargerIndexRouteur / chargerNosBlocksTb : sel re-verifie, retard et fraicheur bornes). Sources non lues : ARRET.
 * Usage : node outil-gen-nes-launchpads.mjs [--rpc URL] [--sources-tb URL] [--tete N] [--pause MS] [--rapport fichier.json] [--ecrire]
 *   Sans --ecrire : lit, compte, n ecrit que le rapport. La nouvelle liste doit contenir toute l ancienne (sinon arret). */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { topic } from './keccak.js';
import { estNotreHook } from './tokenomics.js';
import { FACTORY_B20, TOPIC_B20_CREATED, GRAINE_ROUTEUR, chargerIndexRouteur, chargerNosBlocksTb } from './index-routeur.js';
import { GRAINE_NOS_BLOCKS, NOS_BLOCKS_GENESE } from './origine.js';
import { RE_B20, classeBlock, estDeviseConnue } from './pool-sans-hook.js';

export const O1_STANDARD_FACTORY = '0x1176122eb77ad6a2339322cda7c4d7ea9bfa63dc';
/* Launched(address indexed token, bytes32 indexed poolId, address indexed originalCreator, address quoteToken,
 *          uint256 launchSupply, int24 tickSpacing) */
export const TOPIC_LAUNCHED = topic('Launched(address,bytes32,address,address,uint256,int24)');
export const POOL_MANAGER = '0x498581ff718922c3f8e6a244956af099b2652b2b';
export const TOPIC_INITIALIZE = topic('Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)');
/** Bloc de deploiement d o1 (la fabrique Standard a du code des 50 579 789). */
export const BLOC_DEPLOIEMENT_O1 = 50579785;
export const RPC_DEFAUT = 'https://mainnet.base.org';
export const SOURCES_TB_DEFAUT = 'https://tokenizedblock.space';

const bas = (a) => String(a || '').toLowerCase();
const hex = (n) => '0x' + Number(n).toString(16);
const adr = (mot) => '0x' + bas(mot).replace(/^0x/, '').slice(-40);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Lit tous les journaux [de, a] d une adresse et d un topic0, par fenetres. Sur erreur : fenetre / 2 (tout de suite si
 *  elle est trop grande, apres `essais` reprises sinon) jusqu a `min`, puis `essais` reprises avec attente croissante ;
 *  au-dela, exception (l appelant n ecrit rien). La fenetre regrandit apres un succes. Chaque journal est verifie (adresse, topic0, bloc dans la fenetre). `garder` filtre ce qui est conserve. */
export async function balayer({ rpc, adresse, topic0, de, a, fenetre = 2000, min = 25, essais = 4, pauseMs = 150,
  attendre = dormir, garder = () => true, journal = null }) {
  if (!(Number.isInteger(de) && Number.isInteger(a) && de >= 0 && a >= de)) throw new Error(`plage invalide ${de}..${a}`);
  const logs = []; let appels = 0, divisions = 0, fenetres = 0, lus = 0, w = fenetre, x = de, rate = 0, plafond = Infinity, suite = 0, erreurs = 0;
  while (x <= a) {
    const y = Math.min(a, x + w - 1);
    let res;
    try {
      appels += 1;
      res = await rpc('eth_getLogs', [{ address: adresse, topics: [topic0], fromBlock: hex(x), toBlock: hex(y) }]);
      if (!Array.isArray(res)) throw new Error('reponse eth_getLogs non tableau');
      for (const l of res) {
        const b = parseInt(l.blockNumber, 16);
        if (bas(l.address) !== bas(adresse) || bas(l.topics && l.topics[0]) !== bas(topic0) || !(b >= x && b <= y) || l.removed)
          throw new Error(`journal hors filtre dans ${x}-${y}`);
      }
    } catch (e) {
      /* trop grande (413, « range », « limit »…) : moitie tout de suite ; autre erreur (debit, panne) : reprises a la meme
       *   taille avec attente croissante, puis moitie ; a la taille minimale, `essais` reprises puis ARRET. */
      rate += 1;
      const taille = /413|range|too (many|large)|limit|exceed/i.test(String((e && e.message) || e));
      if ((taille || rate > essais) && w > min) { plafond = w; suite = 0; rate = 0; w = Math.max(min, Math.floor(w / 2)); divisions += 1; await attendre(pauseMs); continue; }
      if (rate > essais) throw new Error(`fenetre ${x}-${y} ratee apres ${essais} reprises : ${String((e && e.message) || e)}`);
      erreurs += 1; await attendre(pauseMs * 2 ** rate);
      continue;
    }
    rate = 0; fenetres += 1; lus += res.length;
    for (const l of res) if (garder(l)) logs.push(l);
    x = y + 1;
    /* regrandit sans revenir a une taille qui vient d echouer (sauf apres 50 succes de suite) */
    suite += 1; if (suite >= 50) { plafond = Infinity; suite = 0; }
    if (w < fenetre && w * 2 < plafond) w = Math.min(fenetre, w * 2);
    if (journal && fenetres % 100 === 0) journal({ adresse, bloc: y, a, fenetres, lus, gardes: logs.length, divisions, erreurs, w });
    if (x <= a) await attendre(pauseMs);
  }
  return { logs, appels, divisions, fenetres, lus, erreurs };
}

export function decoderLaunched(l) {
  const mots = String(l.data || '').replace(/^0x/, '').match(/.{64}/g) || [];
  return { jeton: adr(l.topics[1]), poolId: bas(l.topics[2]), createur: adr(l.topics[3] || ''), quote: mots[0] ? adr(mots[0]) : null,
    tx: bas(l.transactionHash), bloc: parseInt(l.blockNumber, 16) };
}
export function decoderInitialize(l) {
  const mots = String(l.data || '').replace(/^0x/, '').match(/.{64}/g) || [];
  return { id: bas(l.topics[1]), c0: adr(l.topics[2]), c1: adr(l.topics[3]), hook: mots[2] ? adr(mots[2]) : null,
    tx: bas(l.transactionHash), bloc: parseInt(l.blockNumber, 16) };
}

/** F5 : l ensemble TB COMPLET pour l exclusion. `routeur` / `nos` = les reponses servies de /api/blocks-routeur et /api/nos-blocks.
 *  Exception si l une n est pas LUE (rien n est ecrit). */
export function ensembleTb({ routeur, nos, maintenantMs = Date.now() }) {
  const r = chargerIndexRouteur(routeur, maintenantMs); const n = chargerNosBlocksTb(nos, maintenantMs);
  if (!r.lu || !n.lu) throw new Error('sources TB non lues (routeur : ' + (r.pourquoi || 'lu') + ' ; nos-blocks : ' + (n.pourquoi || 'lu') + ') : rien n est ecrit');
  const graines = new Set([...GRAINE_ROUTEUR.map((g) => g.jeton), ...GRAINE_NOS_BLOCKS.map((g) => g.jeton), ...NOS_BLOCKS_GENESE].map(bas));
  /* classeBlock voit maintenant les listes statiques ET les deux listes servies (estNeDuRouteur / estNotreBlockServi) */
  const estTb = (a) => graines.has(bas(a)) || classeBlock(a) === 'TB' || estDeviseConnue(a);
  return { estTb, taille: { routeur: (routeur.blocks || []).length, nos: (nos.blocks || []).length, graines: graines.size } };
}

/** Le tri : quels lancements donnent un jeton de la liste. Entrees decodees ; sortie triee, sans doublon. */
export function deriver({ lances, nes, inits, estTb = (a) => classeBlock(a) === 'TB' || estDeviseConnue(a), estNotre = estNotreHook }) {
  const neDans = new Map();
  for (const n of nes) { const t = adr(n.topics ? n.topics[1] : n.jeton); const tx = bas(n.transactionHash || n.tx);
    if (!neDans.has(t)) neDans.set(t, new Set()); neDans.get(t).add(tx); }
  const poolDe = new Map(); const surNosHooks = new Set(); const poolsNosHooks = [];
  for (const i of inits) {
    if (!poolDe.has(i.id)) poolDe.set(i.id, i);
    if (estNotre(i.hook)) { surNosHooks.add(i.c0); surNosHooks.add(i.c1); poolsNosHooks.push(i); }
  }
  const exclus = { nonB20: [], quote: [], neAilleurs: [], sansPool: [], tb: [], surNosHooks: [] };
  const garde = new Set();
  for (const L of lances) {
    const t = L.jeton;
    if (!(RE_B20.test(t) && /^0x[0-9a-f]{40}$/.test(t))) { exclus.nonB20.push(t); continue; }
    if (L.quote && t === L.quote) { exclus.quote.push(t); continue; }
    if (!(neDans.get(t) || new Set()).has(L.tx)) { exclus.neAilleurs.push(t); continue; }
    const p = poolDe.get(L.poolId);
    if (!p || p.tx !== L.tx || (p.c0 !== t && p.c1 !== t)) { exclus.sansPool.push(t); continue; }
    if (estTb(t)) { exclus.tb.push(t); continue; }
    if (surNosHooks.has(t)) { exclus.surNosHooks.push(t); continue; }
    garde.add(t);
  }
  const quotesB20 = [...new Set(lances.map((L) => L.quote).filter((q) => q && RE_B20.test(q) && !garde.has(q)))].sort();
  for (const k of Object.keys(exclus)) exclus[k] = [...new Set(exclus[k])].sort();
  return { jetons: [...garde].sort(), exclus, quotesB20HorsListe: quotesB20, poolsNosHooks };
}

/** Le module genere (fins de ligne LF, contenu deterministe : il ne depend que de la plage et des jetons). */
export function ecrireModule({ jetons, de, tete, comptes }) {
  const PREF = '0xb2' + '0'.repeat(20);
  const tri = [...jetons].sort();
  if (new Set(tri).size !== tri.length) throw new Error('doublon dans la liste');
  for (const j of tri) if (!(j.length === 42 && j.startsWith(PREF) && /^[0-9a-f]{18}$/.test(j.slice(PREF.length)))) throw new Error('pas un B20 : ' + j);
  const suf = tri.map((j) => j.slice(PREF.length));
  const lignes = []; for (let i = 0; i < suf.length; i += 6) lignes.push(suf.slice(i, i + 6).join(' '));
  const c = comptes;
  return [
    '/* jetons-nes-launchpads.js — B20 NES D UN LANCEMENT o1 Standard (liste blanche : les SEULS jetons tiers liberes, avec PEXRA).',
    ' * ⛔ GENERE par outil-gen-nes-launchpads.mjs — ne pas editer a la main. Lecture seule (eth_getLogs par fenetres) de journaux',
    ` *   publics de Base, blocs ${de} -> ${tete} : ${c.lancements} Launched de la fabrique o1 Standard 0x1176…63dc ; jeton retenu`,
    ' *   = B20 ne (B20Created, fabrique 0xb20f…0000) dans la MEME transaction que son lancement ET que sa pool (Initialize,',
    ' *   id = poolId, ce jeton pour devise) ; jamais le cote cotation.',
    ` *   Exclus : ${c.nonB20} hors B20, ${c.neAilleurs} nes ailleurs, ${c.sansPool} sans pool, ${c.tb} ensemble TB, ${c.surNosHooks} pool sur nos hooks.`,
    ' * ⛔ Un jeton de cette liste n est libere QUE s il est absent de l ensemble TB et que toutes les sources TB sont lues',
    ' *   (pool-sans-hook.js) ; la liste est figee : un lancement plus recent reste traite en block (fail-closed). */',
    `export const DE_NES_LAUNCHPADS = ${de};`,
    `export const TETE_NES_LAUNCHPADS = ${tete};`,
    `export const COMPTES_NES_LAUNCHPADS = Object.freeze(${JSON.stringify(c)});`,
    'const SUFFIXES = `',
    ...lignes,
    '`;',
    "export const NES_LAUNCHPADS_O1 = Object.freeze(SUFFIXES.split(/\\s+/).filter(Boolean).map((s) => '0xb2' + '0'.repeat(20) + s));",
    '',
  ].join('\n');
}

/** Tout le generateur, RPC injecte. Ne fait qu exceptions ou retourne { module, rapport }. */
export async function generer({ rpc, de = BLOC_DEPLOIEMENT_O1, tete = null, pauseMs = 150, attendre = dormir, ancienne = null, journal = null,
  fenetres = { launched: 2000, nes: 2000, init: 2000 }, sourcesTb = null }) {
  if (!sourcesTb) throw new Error('sources TB requises (/api/blocks-routeur + /api/nos-blocks) : rien n est ecrit');
  const tb = ensembleTb(sourcesTb);
  const t = tete == null ? parseInt(await rpc('eth_blockNumber', []), 16) : Number(tete);
  if (!(Number.isInteger(t) && t >= de)) throw new Error('tete invalide : ' + t);
  const o = { de, a: t, pauseMs, attendre, journal };
  const sL = await balayer({ ...o, rpc, adresse: O1_STANDARD_FACTORY, topic0: TOPIC_LAUNCHED, fenetre: fenetres.launched });
  const lances = sL.logs.map(decoderLaunched);
  const voulus = new Set(lances.map((L) => L.jeton));
  const ids = new Set(lances.map((L) => L.poolId));
  const sN = await balayer({ ...o, rpc, adresse: FACTORY_B20, topic0: TOPIC_B20_CREATED, fenetre: fenetres.nes,
    garder: (l) => voulus.has(adr(l.topics[1])) });
  const sI = await balayer({ ...o, rpc, adresse: POOL_MANAGER, topic0: TOPIC_INITIALIZE, fenetre: fenetres.init,
    garder: (l) => { const i = decoderInitialize(l); return ids.has(i.id) || estNotreHook(i.hook); } });
  const r = deriver({ lances, nes: sN.logs, inits: sI.logs.map(decoderInitialize), estTb: tb.estTb });
  const comptes = { lancements: lances.length, jetons: r.jetons.length,
    ...Object.fromEntries(Object.entries(r.exclus).map(([k, v]) => [k, v.length])) };
  if (r.jetons.length === 0) throw new Error('liste vide : rien n est ecrit');
  if (ancienne) { const manque = ancienne.filter((j) => !r.jetons.includes(bas(j)));
    if (manque.length) throw new Error(`${manque.length} jeton(s) de l ancienne liste absents (ex. ${manque[0]}) : rien n est ecrit`); }
  const module = ecrireModule({ jetons: r.jetons, de, tete: t, comptes });
  const rapport = { de, tete: t, comptes, jetons: r.jetons, exclus: r.exclus, quotesB20HorsListe: r.quotesB20HorsListe,
    poolsNosHooks: r.poolsNosHooks, appels: { launched: sL.appels, nes: sN.appels, init: sI.appels },
    divisions: { launched: sL.divisions, nes: sN.divisions, init: sI.divisions },
    reprises: { launched: sL.erreurs, nes: sN.erreurs, init: sI.erreurs },
    journauxLus: { launched: sL.lus, nes: sN.lus, init: sI.lus }, ancienne: ancienne ? ancienne.length : null, sourcesTb: tb.taille };
  return { module, rapport, jetons: r.jetons };
}

export function rpcHttp(url, delaiMs = 30000) {
  let id = 0;
  return async (methode, params) => {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(delaiMs),
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: methode, params }) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (j.error) throw new Error(JSON.stringify(j.error));
    return j.result;
  };
}

async function principal(argv) {
  const opt = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const cible = fileURLToPath(new URL('./jetons-nes-launchpads.js', import.meta.url));
  const ancienne = (await import(pathToFileURL(cible).href)).NES_LAUNCHPADS_O1;
  /* F5 : les sources TB servies d abord (2 GET, lecture seule) ; sans elles rien n est lu ni ecrit */
  const base = String(opt('--sources-tb', SOURCES_TB_DEFAUT)).replace(/\/+$/, '');
  const lire = async (c) => { const r = await fetch(base + c, { signal: AbortSignal.timeout(30000), cache: 'no-store' });
    if (!r.ok) throw new Error(c + ' : HTTP ' + r.status); return r.json(); };
  const sourcesTb = { routeur: await lire('/api/blocks-routeur'), nos: await lire('/api/nos-blocks') };
  const { module, rapport } = await generer({ rpc: rpcHttp(opt('--rpc', RPC_DEFAUT)), tete: opt('--tete'),
    pauseMs: Number(opt('--pause', 150)), ancienne, journal: (j) => console.error(JSON.stringify(j)), sourcesTb });
  const rap = opt('--rapport'); if (rap) writeFileSync(rap, JSON.stringify(rapport, null, 1));
  console.log(JSON.stringify({ de: rapport.de, tete: rapport.tete, comptes: rapport.comptes, appels: rapport.appels,
    divisions: rapport.divisions, poolsNosHooks: rapport.poolsNosHooks.length, ancienne: rapport.ancienne, sourcesTb: rapport.sourcesTb }));
  if (argv.includes('--ecrire')) {
    const avant = readFileSync(cible, 'utf8');
    if (avant.replace(/\r\n/g, '\n') !== module) writeFileSync(cible, module);
    console.log('ecrit', cible);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal(process.argv.slice(2)).catch((e) => { console.error('ARRET, rien n est ecrit :', String((e && e.message) || e)); process.exitCode = 1; });
}
