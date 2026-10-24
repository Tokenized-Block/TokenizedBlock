/* muter-slots-regleur.mjs — chaque borne du regleur (slots-regleur.js : slots, duels, rolls) est RETIREE ou FAUSSEE, une a la fois, dans une
 * COPIE (.mutant-slots-regleur-<pid>.js, a cote du module pour que ses imports relatifs marchent, effacee a la fin) ; test-slots-regleur doit
 * rougir. Le module du depot n est jamais ecrit. Usage : node muter-slots-regleur.mjs
 * 2026-10-24 : les ancres suivent le module v5 ; les correctifs des audits (panne RPC, tour sain, nonce too low, recu illisible, coupe du
 * lot, statut 0, duels, rolls, garde a trois contrats, ordre par echeance) ont chacun leurs mutants. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const original = fs.readFileSync(path.join(ICI, 'slots-regleur.js'), 'utf8');
const COPIE = path.join(ICI, '.mutant-slots-regleur-' + process.pid + '.js');
const lancer = () => {
  try { execFileSync(process.execPath, [path.join(ICI, 'test-slots-regleur-20261023.mjs')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, REGLEUR_MODULE: COPIE, TOUT_COMPTER: '' } }); return true; }
  catch (_) { return false; }
};
const M = [
  ['sans cle : le regleur tourne quand meme', "  if (!cle) return off(", "  if (false) return off("],
  ['10 spins par tx : plus de borne', "const lignes = plan.lignes.filter((l) => l.decision === 'LOT').slice(0, bornes.spinsParTx);", "const lignes = plan.lignes.filter((l) => l.decision === 'LOT');"],
  ['pot : tous les spins reglables, couverts ou non', "const lignes = plan.lignes.filter((l) => l.decision === 'LOT').slice(0, bornes.spinsParTx);", "const lignes = plan.lignes.filter((l) => l.decision === 'LOT' || l.decision === 'COURT').slice(0, bornes.spinsParTx);"],
  ['plafond du prix du gas retire', 'if (base + prio > bornes.maxFeeWei) {', 'if (false) {'],
  ['maxFee non borne au plafond', 'const maxFee = 2n * base + prio > bornes.maxFeeWei ? bornes.maxFeeWei : 2n * base + prio;', 'const maxFee = 2n * base + prio;'],
  ['pourboire non borne', 'if (prio > bornes.prioWeiMax) prio = bornes.prioWeiMax;', ''],
  ['plafond de gas par tx retire', 'if (gas > bornes.gasMaxParTx) {', 'if (false) {'],
  ['tx par heure : plus de borne', 'if (st.envoisHeure.length >= bornes.txParHeure) {', 'if (false) {'],
  ['pas d arret apres des echecs', 'if (st.echecsSuite >= bornes.echecsMax) {', 'if (false) {'],
  ['un succes ne remet pas les echecs a zero', '    st.echecsSuite = 0;\n', ''],
  ['chaine du noeud non verifiee', 'if (BigInt(id) !== BigInt(chainId)) {', 'if (false) {'],
  ['plusieurs tx en vol', "      if (st.enVol) { const fini = await suivreInclusion();", "      if (false) { const fini = await suivreInclusion();"],
  ['tx non incluse jamais relachee', 'if (maintenant() - v.a > bornes.inclusionMaxMs) { st.enVol = null; echec(', 'if (false) { st.enVol = null; echec('],
  ['nonce latest au lieu de pending', "rpc('eth_getTransactionCount', [adresse, 'pending'])", "rpc('eth_getTransactionCount', [adresse, 'latest'])"],
  ['« already known » compte comme un echec', "if (!/already known|known transaction/i.test(m)) {", 'if (true) {'],
  ['logs : plus de recul borne', 'const plancher = Math.max(Number(blocDeploiement) || 0, tete - bornes.reculLogs + 1);', 'const plancher = Math.max(Number(blocDeploiement) || 0, 0);'],
  ['logs : avant le deploiement', 'const plancher = Math.max(Number(blocDeploiement) || 0, tete - bornes.reculLogs + 1);', 'const plancher = Math.max(0, tete - bornes.reculLogs + 1);'],
  ['logs : relit tout a chaque tour', 'const de = st.scanne === null ? plancher : Math.max(plancher, st.scanne + 1 - 8);', 'const de = plancher;'],
  ['spin trop tot envoye', "filter(([id, s]) => Slots.etatReglement(s.t, tete).etat === 'REGLABLE' && !ecartes.has(id))", "filter(([id, s]) => Slots.etatReglement(s.t, tete).etat !== 'PERDU' && !ecartes.has(id))"],
  ['statut non relu (deja regle envoye)', '      if (v.status !== 1) { suivis.delete(id); continue; }\n', ''],
  ['simulation ignoree (un revert envoye quand meme)', 'if (!estRevert(e)) throw new Passagere(msg(e));', 'return { k: kk, estime: 200000n };'],
  ['gas sans marge', 'const gas = (choix.estime * 12n) / 10n;', 'const gas = choix.estime;'],
  ['la garde n est plus appelee', '      verifierEnvoi(tx, { contrat: c, chainId, bornes, duels: cD, rolls: cR });', '      /* garde retiree */'],
  ['la garde ne connait plus duels / rolls', '      verifierEnvoi(tx, { contrat: c, chainId, bornes, duels: cD, rolls: cR });', '      verifierEnvoi(tx, { contrat: c, chainId, bornes });'],
  ['garde : n importe quel selecteur aux slots', "if (!d.startsWith(SEL_SETTLE_MANY)) throw new Error('keeper: refused, only settleMany / settle are ever sent to the slots contract');", ''],
  ['garde : autre adresse admise (traitee en slots)', 'if (cS && to === cS) {', 'if (cS) {'],
  ['garde : valeur admise', "if (BigInt(tx.value ?? 0) !== 0n) throw new Error('keeper: refused, a keeper call carries no value');", ''],
  ['garde : autre chaine admise', "if (BigInt(tx.chainId) !== BigInt(chainId)) throw new Error('keeper: refused, wrong chain');", ''],
  ['garde : 11 ids admis', 'if (k < 1 || k > bornes.spinsParTx)', 'if (k < 1)'],
  ['garde : donnees non canoniques admises', "if ((d.length - 10) % 64 !== 0 || m.length < 3 || m[0] !== 32n || m[1] !== BigInt(m.length - 2)) throw new Error('keeper: refused, settleMany data is not canonical');", ''],
  ['garde : tout appel aux duels admis', "    if (d.startsWith(SEL_SETTLE) && d.length === 10 + 64) return 1;\n    throw new Error('keeper: refused, only settle(uint256) is ever sent to the duels contract');", '    return 1;'],
  ['garde : tout selecteur aux rolls', "(d.startsWith(SEL_CLOSE_DAY) || d.startsWith(SEL_DRAW_DAY)) && d.length === 10 + 64", 'd.length === 10 + 64'],
  ['garde : jour >= 2^32 admis', " && BigInt('0x' + d.slice(10)) < 2n ** 32n", ''],
  ['garde : destination inconnue admise', "throw new Error('keeper: refused, the destination is not a keeper contract');", 'return 1;'],
  ['etat() publie la cle', '        etat: st.etat, adresse: st.adresse,', '        etat: st.etat, cle, adresse: st.adresse,'],
  ['intervalle sans borne haute', 'return Math.max(bornes.intervalleMinMs, Math.min(bornes.intervalleMaxMs, v));', 'return Math.max(bornes.intervalleMinMs, v);'],
  ['intervalle sur la fenetre entiere', 'const v = Math.floor((Slots.secondesFenetre(msParBloc) * 1000) / 5);', 'const v = Math.floor(Slots.secondesFenetre(msParBloc) * 1000);'],
  /* ---- 2026-10-24 : les correctifs des audits */
  ['V1 : une panne RPC d eth_estimateGas compte comme un echec (0f9d8ec)', "st.compteurs.simulationsNonLues += 1; erreur('simulation not run", "echec('simulation refused: ' + e.message, 'simulationsNonLues'); erreur('simulation not run"],
  ['V1 : une panne RPC traitee comme un revert', 'if (!estRevert(e)) throw new Passagere(msg(e));', 'if (false) throw new Passagere(msg(e));'],
  ['tour sain : plus de remise a zero', 'if (info.sain && echecsCeTour === 0) { st.echecsSuite = 0;', 'if (false) { st.echecsSuite = 0;'],
  ['tour sain : remis a zero meme sans tout lire', 'if (info.sain && echecsCeTour === 0) { st.echecsSuite = 0;', 'if (echecsCeTour === 0) { st.echecsSuite = 0;'],
  ['V2 : « nonce too low » jamais verifie (0f9d8ec)', '/nonce too low|nonce has already been used|replacement transaction underpriced|replacement fee too low/i.test(m)', 'false'],
  ['V2 : le nonce latest n est pas lu', "              else if (BigInt(await rpc('eth_getTransactionCount', [adresse, 'latest'])) > nonce) retrouvee = true;\n", ''],
  ['V2 : la tx connue du noeud ignoree', "              else if (await rpc('eth_getTransactionByHash', [signe.hash])) retrouvee = true;\n", ''],
  ['V3 : un recu qui jette ne relache jamais (0f9d8ec)', 'if (maintenant() - v.a > bornes.inclusionMaxMs) { st.enVol = null; st.compteurs.recusIlisibles', 'if (false) { st.enVol = null; st.compteurs.recusIlisibles'],
  ['lot : plus de coupe en deux', 'return (await essai(ids.slice(0, m))) || (await essai(ids.slice(m)));', 'return null;'],
  ['lot : le spin fautif n est pas ecarte', 'ecartes.set(ids[0], s ? s.t : tete); st.compteurs.spinsEcartes += 1;', ''],
  ['statut 0 : le spin est abandonne (0f9d8ec)', '      if (v.status === 0) { info.sain = false; continue; }\n', ''],
  ['duels : rejoint a la tete = cible (simulation TooEarly)', '.filter(([, t]) => tete > t)', '.filter(([, t]) => tete >= t)'],
  ['duels : envoye a la tete cible + 256 (tomberait a + 257)', 'if (tete + 1 > t + FENETRE) duelsSuivis.delete(id);', 'if (tete > t + FENETRE) duelsSuivis.delete(id);'],
  ['duels : statut non relu (deja regle envoye)', '      if (s !== DUEL_JOINED) { duelsSuivis.delete(id); continue; }\n', ''],
  ['duels : statut 0 abandonne', '      if (s === 0) { info.sain = false; continue; }', ''],
  ['duels : les Joined jamais lus', 'if (Number.isSafeInteger(t) && !duelsSuivis.has(id)) duelsSuivis.set(id, t);', ''],
  ['rolls : un jour Open jamais ferme', "if (etat === 0) { out.push({ cible: 'rolls', to: cR, ids: [k], fin: Infinity, quoi: 'closeDay' }); continue; }", ''],
  ['rolls : drawDay a la tete cible + 256', 'if (tete + 1 <= t + FENETRE) out.push(', 'if (tete <= t + FENETRE) out.push('],
  ['rolls : jamais re-arme', "      else out.push({ cible: 'rolls', to: cR, ids: [k], fin: Infinity, quoi: 'closeDay' });", ''],
  ['rolls : drawDay avant la cible', '      if (tete <= t) continue;\n', ''],
  ['rolls : aujourd hui ferme', 'for (let d = a - 1; d >= Math.max(0, a - bornes.joursRecul); d--) {', 'for (let d = a; d >= Math.max(0, a - bornes.joursRecul); d--) {'],
  ['rolls : un jour sans acheteur ferme', "if (jours.acheteurs.get(k) === 0n) { jours.finis.add(k); continue; }", ''],
  ['ordre : plus par echeance', 'candidats.sort((a, b) => (a.fin - b.fin) || (rang[a.cible] - rang[b.cible]));', 'candidats.sort((a, b) => rang[a.cible] - rang[b.cible]);'],
  ['etat() sans activite par contrat', "duels: { contrat: cD, configure: !!duelsCfg, suivis: duelsSuivis.size, ...st.parContrat.duels },", "duels: { contrat: cD, configure: !!duelsCfg, suivis: duelsSuivis.size },"],
];
let survivants = 0, introuvables = 0, temoin = true;
try {
  fs.writeFileSync(COPIE, original);
  temoin = lancer();
  console.log((temoin ? 'ok  ' : 'KO  ') + 'temoin : la copie non mutee est verte');
  /* ⛔ pas de process.exit ici : il sauterait le finally et laisserait la copie mutee dans le depot (vu le 2026-10-23) */
  if (temoin) for (const [nom, de, vers] of M) {
    const k = original.split(de).length - 1;
    if (k !== 1) { introuvables += 1; console.log('??  ' + nom + ' — ancre trouvee ' + k + ' fois (attendu 1)'); continue; }
    fs.writeFileSync(COPIE, original.replace(de, () => vers));
    if (lancer()) { survivants += 1; console.log('SURVIT  ' + nom); } else console.log('tue ' + nom);
  }
} finally {
  fs.rmSync(COPIE, { force: true });
}
if (!temoin) process.exit(1);
console.log('\n' + M.length + ' mutants, ' + survivants + ' survivant(s), ' + introuvables + ' ancre(s) introuvable(s)');
process.exit(survivants || introuvables ? 1 : 0);
