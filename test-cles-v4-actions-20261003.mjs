/* test-cles-v4-actions-20261003.mjs — LES 20 POOLS v4 USDC DES ACTIONS TOKENISEES : cles LUES, servies, et les rails qui les suivent.
 *
 * ⛔⛔ MESURE (prod, 2026-10-03) : `/api/cle/<action>` rendait POOLID_ABSENT pour BEc, HIMSc, AMDc… (Initialize de 2 a 12 jours,
 *   hors des 40 x 999 blocs balayes) ; la fiche ne lisait ni n achetait ces 20, et l API rails refusait « no measured deep
 *   Aerodrome pool ». Avec la cle exacte, planEchange rendait APPROBATIONS 0,5 % USDC (achat 19/19, vente 18/19 ; CAKEc
 *   NON_TROUVEE, ASTSc vente : devis reverte — les rates sont dits, pas lisses).
 * A. HORS RESEAU : 20 logs, chacun decode par decoderInitialize (poolId RECALCULE), USDC d un cote et une action du registre de
 *    l autre, sans hook, frais LP <= 10 % (le filtre a pieges de vieDuBlock les garde), aucune action en double, aucune des 12
 *    Aerodrome sauf MSTRc (dans les deux). Temoin : un log altere est refuse. serveur-web.js pre-remplit le cache PAR JETON et
 *    sert le fichier. rails-api : le repli v4 est ecrit (USDC>ACTION, ETH>ACTION, ACTION>USDC) et la table Aerodrome garde la main.
 * B. MUTANT : un log dont on change le fee ne pre-remplit RIEN (le decodeur le jette) — la garde n est pas decorative.
 * C. TEMOIN ON-CHAIN (lecture seule) : le poolId de BEc existe dans le StateView (sqrtPriceX96 != 0) ; un poolId invente rend 0.
 * ⛔ BORNE : ne prouve ni un swap reel ni un frais percu ; prouve que la cle est la bonne et que le chemin est branche. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href);
const { LOGS_INITIALIZE_ACTIONS } = await imp('cles-v4-actions.js');
const { LOGS_INITIALIZE_MESURES } = await imp('cles-v4-mesurees.js');
const { decoderInitialize } = await imp('pools-du-jeton.js');
const P = await imp('paires.js');
const { POOLS_ACTIONS_AERODROME } = await imp('pools-actions-aerodrome.js');
const { USDC_BASE } = await imp('frais-creation.js');
/* la borne du filtre a pieges n est pas exportee : on la LIT dans marche.js (un chiffre recopie ici deriverait en silence) */
const FRAIS_LP_MAX_MARCHE = Number((fs.readFileSync(path.join(ICI, 'marche.js'), 'utf8').match(/const FRAIS_LP_MAX_MARCHE = (\d+)/) || [])[1]);
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const USDC = USDC_BASE.toLowerCase(), ETH = '0x' + '0'.repeat(40);
const parAdr = new Map(P.ACTIONS_COINBASE.map((a) => [String(a.adr).toLowerCase(), a.symbole]));

console.log('— A. hors reseau');
ok(LOGS_INITIALIZE_ACTIONS.length === 20 && Object.isFrozen(LOGS_INITIALIZE_ACTIONS) && LOGS_INITIALIZE_ACTIONS.every(Object.isFrozen), '20 logs, figes');
const dec = LOGS_INITIALIZE_ACTIONS.map(decoderInitialize);
ok(dec.every((d) => d && !d.erreur && d.poolId && d.cle), 'les 20 se decodent et leur poolId se RECALCULE (' + dec.filter((d) => d && d.erreur).map((d) => d.erreur).join(' ; ') + ')');
const actions = dec.map((d) => (d.cle.currency0 === USDC ? d.cle.currency1 : d.cle.currency0));
ok(dec.every((d) => d.cle.currency0 === USDC || d.cle.currency1 === USDC), 'USDC d un cote, toujours');
ok(actions.every((a) => parAdr.has(a)), 'une action du registre de l autre : ' + actions.map((a) => parAdr.get(a)).join(' '));
ok(new Set(actions).size === 20, 'aucune action en double');
ok(dec.every((d) => d.cle.hooks === ETH), 'sans hook (0x0) : le routeur prend son frais d interface, 0,5 % en USDC');
ok(dec.every((d) => d.cle.fee <= FRAIS_LP_MAX_MARCHE && d.cle.fee >= 30000), 'frais LP de 3 % a ' + (FRAIS_LP_MAX_MARCHE / 10000) + ' % : passe le filtre a pieges (max lu ' + Math.max(...dec.map((d) => d.cle.fee)) + ')');
const dansAero = actions.filter((a) => POOLS_ACTIONS_AERODROME.has(a)).map((a) => parAdr.get(a));
ok(dansAero.length === 1 && dansAero[0] === 'MSTRc', 'une seule est aussi dans la table Aerodrome : ' + dansAero.join(' ') + ' (la table garde la main)');
ok(LOGS_INITIALIZE_MESURES.length === 21 && decoderInitialize(LOGS_INITIALIZE_MESURES[0]).cle.currency1 === '0xb2000000000000000000002feb517dfec7415344'
  && LOGS_INITIALIZE_ACTIONS.every((l) => LOGS_INITIALIZE_MESURES.includes(l)), 'LOGS_INITIALIZE_MESURES = OUSD en [0] + les 20');
const altere = { ...LOGS_INITIALIZE_ACTIONS[0], data: '0x' + '0'.repeat(60) + 'c350' + LOGS_INITIALIZE_ACTIONS[0].data.slice(66) };
ok(decoderInitialize(altere).erreur === 'poolId ne se recalcule pas', 'TEMOIN : un log au fee change est REFUSE par le decodeur');

const srv = fs.readFileSync(path.join(ICI, 'serveur-web.js'), 'utf8').replace(/\r\n/g, '\n');
const i0 = srv.indexOf('for (const l of LOGS_INITIALIZE_MESURES) {\n  const p = decoderInitialize(l);\n  if (!p || p.erreur || !p.cle || !p.poolId) continue;');
ok(i0 > 0 && srv.indexOf('async function resoudreClePool(', i0) > i0 && /for \(const j of p\.jetons\) \{[\s\S]{0,400}clesPool\.set\(t, r\);/.test(srv.slice(i0, i0 + 1200)),
  'serveur-web.js : le cache PAR JETON de /api/cle est pre-rempli depuis les logs, avant resoudreClePool');
ok(/'cles-v4-actions\.js',/.test(srv) && /'cles-v4-mesurees\.js',/.test(srv), 'les deux modules sont servis (import de cles-v4-mesurees.js dans l app)');
const rails = fs.readFileSync(path.join(ICI, 'rails-api.js'), 'utf8').replace(/\r\n/g, '\n');
ok(/if \(!t && \(nd === 'ETH' \|\| nd === 'USDC'\)\) \{\n\s+const marcheV = await marcheDe\(vers\);/.test(rails), 'rails-api : sans table Aerodrome, la pool v4 de l action est LUE (marcheDe)');
ok(/quoteDe\(marcheV\.cle, vers\) !== USDC\) return normaliser\(route, \{ etat: 'REFUSE'/.test(rails), 'rails-api : une pool v4 qui ne cote pas en USDC est refusee, nommee');
ok(/chemin = \[\{ de: ETH, vers: USDC, famille: 'uniswap-v4' \}, \{ de: USDC, vers, famille: 'uniswap-v4' \}\];/.test(rails), 'rails-api : ETH > ACTION = ETH -> USDC -> action, deux sauts v4, une tx');
ok(/if \(nd === 'ACTION' && nv === 'USDC'\) \{\n\s+const marcheA = await marcheDe\(de\);/.test(rails) && /sens: 'VENTE', montant: m,\n\s+marcheLu: marcheA/.test(rails), 'rails-api : ACTION > USDC vend sur la pool v4 lue');
const iT = rails.indexOf('const t = POOLS_ACTIONS_AERODROME.get(vers);'), iV4 = rails.indexOf("if (!t && (nd === 'ETH' || nd === 'USDC')) {");
ok(iT > 0 && iV4 > iT && /if \(!t\) return normaliser\(route, \{ etat: 'REFUSE', pourquoi: 'no measured deep Aerodrome pool/.test(rails), 'la table Aerodrome est lue d abord ; le repli v4 ne joue que sans elle ; sinon le refus nomme d avant');

console.log('— B. mutant : un log au fee change ne pre-remplit rien');
const pre = new Function('LOGS', 'decoderInitialize', srv.slice(i0, srv.indexOf('async function resoudreClePool(', i0)).replace('for (const l of LOGS_INITIALIZE_MESURES)', 'const clesPool = new Map(); for (const l of LOGS)') + '\nreturn clesPool;');
const rempli = pre(LOGS_INITIALIZE_ACTIONS, decoderInitialize);
ok(rempli.size === 20 && [...rempli.values()].every((r) => r.ok === true && r.cles.length === 1 && r.mesure === true), 'le bloc extrait du serveur remplit 20 jetons, une cle chacun (' + rempli.size + ')');
ok(pre([altere], decoderInitialize).size === 0, 'MUTANT : le log altere ne remplit RIEN');
const be = actions[dec.findIndex((d) => parAdr.get(d.cle.currency0 === USDC ? d.cle.currency1 : d.cle.currency0) === 'BEc')];
ok(rempli.get(be) && rempli.get(be).cles[0].fee === 50000 && rempli.get(be).cles[0].tickSpacing === 500, 'BEc : fee 50000, tickSpacing 500 (lus au bloc 51966303)');

const idBe = dec.find((d) => (d.cle.currency0 === USDC ? d.cle.currency1 : d.cle.currency0) === be).poolId;
/* ⛔ mesure prod (1er deploiement) : 16/20 cles USDC INVISIBLES — le cache du volume (une autre pool par jeton) passait avant clesPool. */
const iR = srv.indexOf('(function fusionnerClesMesurees() {'), iL = srv.indexOf('(function relireCles() {');
ok(iL > 0 && iR > iL && /if \(!c\.cles\.some\(\(x\) => String\(x\.poolId\)\.toLowerCase\(\) === k\.poolId\)\) \{ c\.cles\.push\(k\); ajoutees \+= 1; \}/.test(srv),
  'serveur-web.js : apres relecture du volume, chaque cle mesuree est FUSIONNEE dans l entree du jeton (poolId absent -> ajoutee, rien retire)');
{
  const corps = srv.slice(iR, srv.indexOf('})();', iR) + 5);
  const clesCache = new Map([[be, { ok: true, cles: [{ poolId: '0x' + 'cd'.repeat(32), currency0: '0x' + '4b'.repeat(20), currency1: be, fee: 8388608, tickSpacing: 200, hooks: '0x' + 'bd'.repeat(20) }] }]]);
  new Function('clesPool', 'clesCache', 'console', corps)(rempli, clesCache, { log() {} });
  ok(clesCache.get(be).cles.length === 2 && clesCache.get(be).cles[1].poolId === idBe && clesCache.get(be).cles[0].hooks === '0x' + 'bd'.repeat(20),
    'bloc extrait et execute : l entree volume de BEc (pool a hook tiers) GARDE sa cle et GAGNE la pool USDC mesuree');
  new Function('clesPool', 'clesCache', 'console', corps)(rempli, clesCache, { log() {} });
  ok(clesCache.get(be).cles.length === 2, 'idempotent : une seconde fusion n ajoute rien');
}

console.log('— C. temoin on-chain (lecture seule)');
const slot0 = async (id) => {
  for (let e = 0; e < 4; e += 1) {
    try {
      const r = await fetch('https://mainnet.base.org', { method: 'POST', headers: { 'content-type': 'application/json', 'x-ms-monitor': '1' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: '0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71', data: '0xc815641c' + id.slice(2) }, 'latest'] }) }).then((x) => x.json());
      if (r.result && r.result.length >= 66) return BigInt(r.result.slice(0, 66));
    } catch (_) {}
    await new Promise((o) => setTimeout(o, 700 * (e + 1)));
  }
  return null;
};
const sBe = await slot0(idBe), sFaux = await slot0('0x' + 'ab'.repeat(32));
ok(sBe !== null && sBe > 0n, 'StateView.getSlot0(poolId BEc) : sqrtPriceX96 non nul (' + (sBe === null ? 'NON LU' : sBe.toString().slice(0, 12) + '…') + ') — la pool existe');
ok(sFaux === 0n, 'TEMOIN : un poolId invente rend sqrtPriceX96 = 0 (' + sFaux + ')');

console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
