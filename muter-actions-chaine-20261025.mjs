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
const MUTANTS = [
  ['actions-chaine.js', "if (bas(code) !== '0xef') return refus(a, 'MARQUEUR'", "if (!/^0xb200/.test(a)) return refus(a, 'MARQUEUR'", 'le prefixe 0xb200 remplace le marqueur 0xef'],
  ['actions-chaine.js', "if (bas(code) !== '0xef') return refus(a, 'MARQUEUR'", "if (bas(code) === '0x') return refus(a, 'MARQUEUR'", '« il y a du code » au lieu de 0xef exactement'],
  ['actions-chaine.js', 'const log = memeEvenement.find((l) => bas(l.address) === FACTORY);', 'const log = memeEvenement[0];', 'un evenement de n importe quel emetteur suffit'],
  ['actions-chaine.js', "if (bas(t.from) !== bas(createur)) return refus(", "if (false) return refus(", 'tx.from n est plus verifie'],
  ['actions-chaine.js', "if (bas(t.to) !== bas(appele)) return refus(", "if (false) return refus(", 'tx.to n est plus verifie'],
  ['actions-chaine.js', "if (bas(recu.status) !== '0x1') return refus(", "if (false) return refus(", 'une tx echouee prouve'],
  ['actions-chaine.js', "if (p.etat !== 'NON_MESURE') cache.set(c.adr, p);", 'cache.set(c.adr, p);', 'un NON_MESURE est grave pour toujours'],
  ['actions-chaine.js', "if (neuves >= max) {", "if (false) {", 'plus de borne de preuves par tour'],
  ['actions-chaine.js', 'if (ecartBps === null || ecartBps > ECART_MAX_BPS) {', 'if (ecartBps === null) {', 'l ecart au prix moyen n est plus juge'],
  ['actions-chaine.js', 'if (p.usdcPool < USDC_MIN_POOL) {', 'if (false) {', 'le plancher de 500 USDC saute'],
  ['actions-chaine.js', 'if (refuseesExecution.has(p.pool)) {', 'if (false) {', 'la pool qui revertait sur fork recoit un Buy'],
  ['actions-chaine.js', "if (!pools.length && refusees) return { etat: 'NON_MESURE'", "if (false) return { etat: 'NON_MESURE'", 'un noeud muet devient « sans pool »'],
  ['actions-chaine.js', "if (c && bas(c.createur) === bas(CREATEUR_EMETTEUR)) mettre(", "if (c) mettre(", 'toute creation vue devient candidate'],
  ['actions-chaine.js', 'if (!admise(a)) {', 'if (false) {', 'une action hors registre recoit un Buy que la fiche refusera'],
  ['actions-emetteur.js', "if (suite === null || suite === undefined || suite === '') break;", 'break;', 'premiere page seulement (le bug du 2026-10-24)'],
  ['actions-emetteur.js', "if (d.etat !== 'OK') { echec =", "if (d.etat !== 'OK' && pages === 1) { echec =", 'une page manquante apres la premiere rend OK'],
  ['actions-emetteur.js', "if (typeof suite !== 'string' || vus.has(suite)) {", "if (typeof suite !== 'string') {", 'un jeton de page qui revient est suivi'],
  ['pools-actions-aerodrome.js', "if (String(r.factory || '').toLowerCase() !== FACTORY_ROUTEUR) return null;", '', 'une pool d une autre factory recoit un Buy'],
  ['pools-actions-aerodrome.js', "if (!s) return l;", "if (!s) return l; if (l) return l;", 'la route servie est ignoree'],
  ['routage.js', "if (routeAction && routeAction.achetable === false", "if (false && routeAction && routeAction.achetable === false", 'le refus du serveur ne retire plus le Buy'],
  ['routage.js', "if (v && v.raisonServie && v.raisonServie.phrase) return", "if (false) return", 'la raison mesuree n est plus dite'],
  ['serveur-web.js', 'for (const a of ac.prouvees) blocksConnus.add(a);', '', 'les prouvees ne sont plus demandees a DexScreener'],
  ['serveur-web.js', 'l.routeAction = r && (!t || r.r.pool === t.pool) ? r.r : null;', 'l.routeAction = null;', 'la route n arrive plus sur la ligne'],
  ['serveur-web.js', 'l.routeAction = r && (!t || r.r.pool === t.pool) ? r.r : null;', 'l.routeAction = r ? r.r : null;', 'une entree de table recoit un refus mesure sur une autre pool'],
  ['serveur-web.js', 'for (const p of ordre) {', 'for (const p of ordre) { if (POOLS_ACTIONS_AERODROME.has(p.adr)) continue;', 'la table echappe a la regle du Buy'],
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
