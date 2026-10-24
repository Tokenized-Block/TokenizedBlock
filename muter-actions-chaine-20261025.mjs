/* muter-actions-chaine-20261025.mjs — CHAQUE GARDE DE LA DECOUVERTE DOIT FAIRE ROUGIR SON BANC QUAND ON LA RETIRE.
 * Les mutants sont appliques sur des COPIES (dossier temporaire), jamais sur l arbre de travail. Le banc mute doit ECHOUER ; le banc
 * non mute (temoin) doit PASSER dans la meme copie, sinon la copie elle-meme est fausse et rien n est prouve.
 * Usage : node muter-actions-chaine-20261025.mjs */
import { readdirSync, copyFileSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const BANC = 'test-actions-chaine-20261025.mjs';
/* ⛔ 2026-10-25 (revue) : l ancien mutant n°2 (« `0x` -> refus ») traitait comme VOULU le comportement que la revue a trouve faux (un
 *   `0x` de-listait une action pour toujours). Il est REFAIT a l endroit : le mutant remet « `0x` = refus » et le banc doit rougir. */
const MUTANTS = [
  ['actions-chaine.js', "if (bas(code) !== '0xef') return refusTx('MARQUEUR'", "if (!/^0xb200/.test(a)) return refusTx('MARQUEUR'", 'le prefixe 0xb200 remplace le marqueur 0xef'],
  ['actions-chaine.js', "if (!/^0x[0-9a-fA-F]+$/.test(code)) return nonMesure(a, 'CODE_VIDE'", "if (false) return nonMesure(a, 'CODE_VIDE'", '`0x` redevient un refus MARQUEUR (le defaut HIGH de la revue)'],
  ['actions-chaine.js', "if (bas(code) !== '0xef') return refusTx('MARQUEUR'", "if (false) return refusTx('MARQUEUR'", 'tout code present est accepte (0xef n est plus exige)'],
  ['actions-chaine.js', 'const log = memeEvenement.find((l) => bas(l.address) === FACTORY);', 'const log = memeEvenement[0];', 'un evenement de n importe quel emetteur suffit'],
  ['actions-chaine.js', "if (bas(t.from) !== bas(createur)) return refusTx(", "if (false) return refusTx(", 'tx.from n est plus verifie'],
  ['actions-chaine.js', "if (bas(t.to) !== bas(appele)) return refusTx(", "if (false) return refusTx(", 'tx.to n est plus verifie'],
  ['actions-chaine.js', "if (bas(recu.status) !== '0x1') return refusTx(", "if (false) return refusTx(", 'une tx echouee prouve'],
  ['actions-chaine.js', "return nonMesure(a, 'RECU_AUTRE'", "return refus(a, 'RECU_AUTRE'", 'un recu decale redevient un refus'],
  ['actions-chaine.js', "return nonMesure(a, 'TX_AUTRE'", "return refus(a, 'TX_AUTRE'", 'une tx decalee redevient un refus'],
  ['actions-chaine.js', "catch (e) { return nonMesure(a, 'LOG_ILLISIBLE'", "catch (e) { throw e; return nonMesure(a, 'LOG_ILLISIBLE'", 'un log mal forme leve au lieu d etre NON_MESURE'],
  ['actions-chaine.js', "catch (e) { p = nonMesure(c.adr, 'EXCEPTION'", "catch (e) { throw e; p = nonMesure(c.adr, 'EXCEPTION'", 'une exception d une preuve fait tomber le tour'],
  ['actions-chaine.js', 'if (verdictGravable(p)) cache.set(c.adr, p);', 'cache.set(c.adr, p);', 'un NON_MESURE est grave pour toujours'],
  ['actions-chaine.js', "if (p.code === 'MARQUEUR') return /^0x[0-9a-f]+$/", "if (false) return /^0x[0-9a-f]+$/", 'un ancien MARQUEUR (sans code lu) revient du disque'],
  ['actions-chaine.js', "if (p.etat !== 'REFUSE' || !REFUS_DEFINITIFS.includes(p.code)) return false;", "if (p.etat !== 'REFUSE') return false;", 'RECU_AUTRE / TX_AUTRE reviennent du disque'],
  ['actions-chaine.js', 'if (autre) { txJuge = autre; p = null; }', 'if (false) { txJuge = autre; p = null; }', 'un refus n est jamais rejuge sur une autre tx'],
  ['actions-chaine.js', "if (TX.test(String(tx || '')) && !c.txs.includes(bas(tx)) && c.txs.length < 4) c.txs.push(bas(tx));", '', 'les tx annoncees ne sont plus gardees'],
  ['actions-chaine.js', "if (r === null || r === undefined || r === '0x' || r === '')", 'if (r === undefined)', 'le lecteur des preuves s arrete sur un null / `0x`'],
  ['actions-chaine.js', '} catch (e) { erreur = e; }', '} catch (e) { throw e; }', 'le lecteur des preuves s arrete sur la premiere erreur (publicnode archive)'],
  ['actions-chaine.js', "if (neuves >= max) {", "if (false) {", 'plus de borne de preuves par tour'],
  ['actions-chaine.js', 'if (perteBps > perteMaxBps) {', 'if (false) {', 'le cote vente n est plus juge (LIc -16,6 % garde son Buy)'],
  ['actions-chaine.js', 'if (perteBps > perteMaxBps) {', 'if (perteBps >= perteMaxBps) {', 'la borne de 2 % decalee d un bps'],
  ['actions-chaine.js', "code: 'VENTE_NON_COTEE',", "code: 'VENTE_NON_COTEE', achetable: true,", 'une vente qui reverte garde un Buy'],
  ['actions-chaine.js', 'if (enCache && (enCache.pool || maintenant - enCache.t < POOL_ABSENTE_TTL_MS)) {', 'if (enCache && (maintenant - enCache.t < POOL_ABSENTE_TTL_MS)) {', 'une pool trouvee est relue (cache non permanent)'],
  ['actions-chaine.js', 'const enCache = cachePools ? cachePools.get(cle) : null;', 'const enCache = null;', 'getPool n est plus mis en cache'],
  ['actions-chaine.js', '|| maintenant - v.t > ROUTE_SERVIE_MAX_MS) return ROUTE_EN_COURS;', ') return ROUTE_EN_COURS;', 'un verdict perime donne encore un Buy'],
  ['actions-chaine.js', 'if (table && v.r.pool && v.r.pool !== table.pool) return ROUTE_EN_COURS;', '', 'une entree de table recoit un verdict mesure sur une autre pool'],
  ['actions-chaine.js', 'if (!v || !v.r ||', 'if (!v) return null; if (!v.r ||', 'une action sans verdict retombe sur DexScreener (fail-open)'],
  ['actions-chaine.js', 'if (ecartBps === null || ecartBps > ECART_MAX_BPS) {', 'if (ecartBps === null) {', 'l ecart au prix moyen n est plus juge'],
  ['actions-chaine.js', 'if (p.usdcPool < USDC_MIN_POOL) {', 'if (false) {', 'le plancher de 500 USDC saute'],
  ['actions-chaine.js', 'if (refuseesExecution.has(p.pool)) {', 'if (false) {', 'la pool qui revertait sur fork recoit un Buy'],
  ['actions-chaine.js', "if (!pools.length && refusees) return { etat: 'NON_MESURE'", "if (false) return { etat: 'NON_MESURE'", 'un noeud muet devient « sans pool »'],
  ['actions-chaine.js', "if (c && bas(c.createur) === bas(CREATEUR_EMETTEUR)) mettre(", "if (c) mettre(", 'toute creation vue devient candidate'],
  ['actions-chaine.js', 'if (!admise(a)) {', 'if (false) {', 'une action hors registre recoit un Buy que la fiche refusera'],
  ['actions-emetteur.js', "if (suite === null || suite === undefined || suite === '') break;", 'break;', 'premiere page seulement (le bug du 2026-10-24)'],
  ['actions-emetteur.js', "if (d.etat !== 'OK') { echec =", "if (d.etat !== 'OK' && pages === 1) { echec =", 'une page manquante apres la premiere rend OK'],
  ['actions-emetteur.js', "if (typeof suite !== 'string' || vus.has(suite)) {", "if (typeof suite !== 'string') {", 'un jeton de page qui revient est suivi'],
  ['actions-emetteur.js', 'const d = decodeActionsEmetteur(obj);', 'if (adresses.length && obj && Array.isArray(obj.tokens) && !obj.tokens.length && !obj.next_page_token) break; const d = decodeActionsEmetteur(obj);', 'une page vide apres un jeton redevient une fin de liste'],
  ['actions-emetteur.js', 'if (repetees) { echec =', 'if (false) { echec =', 'une page qui repete la precedente rend OK'],
  ['serveur-web.js', "signal: AbortSignal.timeout(10000) })", '})', 'la liste de l emetteur est lue sans delai'],
  ['serveur-web.js', 'l.routeAction = estAction(a) ? routePourLigne({', 'l.routeAction = false ? routePourLigne({', 'la route n arrive plus sur la ligne'],
  ['serveur-web.js', 'const estAction = (a) => ac.prouvees.has(a) || marqueesSet.has(a) ||', 'const estAction = (a) => ac.prouvees.has(a) || false ||', 'une action marquee non prouvee retombe sur DexScreener'],
  ['serveur-web.js', '(Number(POOLS_ACTIONS_AERODROME.has(y.adr)) - Number(POOLS_ACTIONS_AERODROME.has(x.adr)))', '(Number(POOLS_ACTIONS_AERODROME.has(x.adr)) - Number(POOLS_ACTIONS_AERODROME.has(y.adr)))', 'la table est lue en dernier'],
  ['serveur-web.js', "&& verdictGravable(p)) preuvesActions.set", ") preuvesActions.set", 'le disque rend les refus non definitifs'],
  ['serveur-web.js', 'routes: [...routesActions].map(([adr, v]) => ({ adr, r: v.r, t: v.t })), pools: [...poolsActionsCache]', 'routes: [], pools: []', 'les verdicts de route ne sont pas persistes'],
  ['serveur-web.js', "routeAction({ appel: appelEpingle, adr: p.adr, cachePools: poolsActionsCache, bloc })", "routeAction({ appel: appelEpingle, adr: p.adr, bloc })", 'le cache des getPool n est pas branche'],
  ['serveur-web.js', "rpcRails('eth_call', [{ to, data }, '0x' + bloc.toString(16)])", "rpcRails('eth_call', [{ to, data }, 'latest'])", 'les deux jambes ne sont plus au meme bloc'],
  ['serveur-web.js', 'lecteurPreuves([rpcServeur, ...replisPreuves])', 'lecteurPreuves([rpcServeur])', 'les vieux recus n ont plus de lecteur de repli'],
  ['serveur-web.js', "const champsAttendus = ['emetteurEtat', 'actionsChaine', 'routesFermees'];", "const champsAttendus = ['emetteurEtat', 'actionsChaine'];", 'un corps d avant le fail-closed est servi au demarrage'],
  ['app.html', 'const entreeRoutage = { aMarche, dex: dexLu, poolAdr: poolAdrLu, routeAction: routeActionLue };', 'const entreeRoutage = { aMarche, dex: dexLu, poolAdr: poolAdrLu, routeAction: null };', 'la fiche de la carte garde un Buy que le Market retire'],
  ['rolls-en-action.js', "if (phraseAllerRetour(action)) return refuse('this stock cannot pay a roll here: '", "if (false) return refuse('this stock cannot pay a roll here: '", 'un roll se paie dans une action a -16 %'],
  ['rolls-en-action.js', "if (phraseAllerRetour(action)) return refuse('the prize cannot be converted", "if (false) return refuse('the prize cannot be converted", 'un gain se convertit dans une action a -16 %'],
  ['pools-actions-aerodrome.js', "if (String(r.factory || '').toLowerCase() !== FACTORY_ROUTEUR) return null;", '', 'une pool d une autre factory recoit un Buy'],
  ['pools-actions-aerodrome.js', "if (!s) return l;", "if (!s) return l; if (l) return l;", 'la route servie est ignoree'],
  ['routage.js', "if (routeAction && routeAction.achetable === false", "if (false && routeAction && routeAction.achetable === false", 'le refus du serveur ne retire plus le Buy'],
  ['routage.js', "if (v && v.raisonServie && v.raisonServie.phrase) return", "if (false) return", 'la raison mesuree n est plus dite'],
  ['serveur-web.js', 'for (const a of ac.prouvees) blocksConnus.add(a);', '', 'les prouvees ne sont plus demandees a DexScreener'],
  ['serveur-web.js', 'for (const p of appelEpingle ? ordre : []) {', 'for (const p of appelEpingle ? ordre : []) { if (POOLS_ACTIONS_AERODROME.has(p.adr)) continue;', 'la table echappe a la regle du Buy'],
  ['actions-chaine.js', 'sansUnites: prouvees.length - avecUnites - unitesNonLues,', 'sansUnites: prouvees.length - avecUnites,', 'une supply non lue compte comme « aucune unite »'],
  ['app.html', "(d.actionsChaine.sansUnites > 0 ? ', '", "(false ? ', '", 'le Market tait les actions sans unites'],];

function copie() {
  const d = mkdtempSync(join(tmpdir(), 'mut-actions-'));
  for (const f of readdirSync(ICI)) if (/\.(m?js|html)$/.test(f)) copyFileSync(join(ICI, f), join(d, f));
  return d;
}
const lancer = (d) => spawnSync(process.execPath, [join(d, BANC)], { cwd: d, encoding: 'utf8', timeout: 120000 });

let tues = 0, survivants = [];
const d = copie();
try {
  const t = lancer(d);
  if (t.status !== 0) { console.error('TEMOIN ROUGE dans la copie : rien ne peut etre conclu\n' + (t.stderr || t.stdout).slice(0, 600)); process.exit(2); }
  console.log('temoin (non mute) : vert');
  for (const [f, avant, apres, nom] of MUTANTS) {
    const p = join(d, f), orig = readFileSync(p, 'utf8');
    if (!orig.includes(avant)) { console.log('  ??  ancre introuvable : ' + f + ' — ' + nom); survivants.push(nom + ' (ancre introuvable)'); continue; }
    writeFileSync(p, orig.replace(avant, apres));
    const r = lancer(d);
    writeFileSync(p, orig);
    if (r.status !== 0) { tues += 1; console.log('  tue   ' + nom); } else { survivants.push(nom); console.log('  VIT   ' + nom); }
  }
} finally { rmSync(d, { recursive: true, force: true }); }
console.log('\n' + tues + '/' + MUTANTS.length + ' mutants tues' + (survivants.length ? ' · survivants : ' + survivants.join(' | ') : ''));
process.exit(survivants.length ? 1 : 0);
