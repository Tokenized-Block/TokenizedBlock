/* muter-slots-regleur.mjs — chaque borne du regleur (slots-regleur.js : slots, duels, rolls) est RETIREE ou FAUSSEE, une a la fois, dans une
 * COPIE (.mutant-slots-regleur-<pid>.js, a cote du module pour que ses imports relatifs marchent, effacee a la fin) ; test-slots-regleur doit
 * rougir. Le module du depot n est jamais ecrit. Usage : node muter-slots-regleur.mjs
 * 2026-10-24 : les ancres suivent le module v5 ; les correctifs des audits (panne RPC, tour sain, nonce too low, recu illisible, coupe du
 * lot, statut 0, duels, rolls, garde a trois contrats, ordre par echeance) ont chacun leurs mutants.
 * 2026-10-24 (revue keeper, defaut 6) : ⛔ les ancres sont PORTABLES. Une ancre qui contient un saut de ligne est cherchee avec \r?\n
 *   (motif()), jamais un saut de ligne nu : sur un checkout core.autocrlf=true (CRLF), 8 ancres etaient « introuvables » et le script
 *   sortait 1. La COPIE garde les fins de ligne du module (rien n est normalise : seule l ancre est remplacee). Les correctifs de la revue
 *   (revert explique, plafond par contrat, egalites / rejoignant / mise, recu illisible compte, buyerCount 0, contrat nomme) ont chacun
 *   leurs mutants (marques « revue »). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const original = fs.readFileSync(path.join(ICI, 'slots-regleur.js'), 'utf8');
const COPIE = path.join(ICI, '.mutant-slots-regleur-' + process.pid + '.js');
/* revue fix2 (2026-10-24, round 3) : la copie passe aussi par test-keeper-fix3-20261024.mjs (eviction, budgets, fenetre d un duel deja
 *   SUIVI : le mutant « cible + 256 » n est plus tue par test-slots-regleur seul, la decouverte refusant deja un duel hors fenetre) */
const BANCS = ['test-slots-regleur-20261023.mjs', 'test-keeper-fix3-20261024.mjs'];
const lancer = () => {
  try { for (const b of BANCS) execFileSync(process.execPath, [path.join(ICI, b)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, REGLEUR_MODULE: COPIE, TOUT_COMPTER: '' } }); return true; }
  catch (_) { return false; }
};
/* une ancre texte -> une regexp : le texte echappe, chaque saut de ligne accepte \r?\n (LF comme CRLF) */
const motif = (de) => new RegExp(de.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n/g, '\\r?\\n'), 'g');
const M = [
  ['sans cle : le regleur tourne quand meme', "  if (!cle) return off(", "  if (false) return off("],
  ['10 spins par tx : plus de borne', "const lignes = plan.lignes.filter((l) => l.decision === 'LOT').slice(0, bornes.spinsParTx);", "const lignes = plan.lignes.filter((l) => l.decision === 'LOT');"],
  ['pot : tous les spins reglables, couverts ou non', "const lignes = plan.lignes.filter((l) => l.decision === 'LOT').slice(0, bornes.spinsParTx);", "const lignes = plan.lignes.filter((l) => l.decision === 'LOT' || l.decision === 'COURT').slice(0, bornes.spinsParTx);"],
  ['plafond du prix du gas retire', 'if (base + prio > bornes.maxFeeWei) {', 'if (false) {'],
  ['maxFee non borne au plafond', 'const maxFee = 2n * base + prio > bornes.maxFeeWei ? bornes.maxFeeWei : 2n * base + prio;', 'const maxFee = 2n * base + prio;'],
  ['pourboire non borne', 'if (prio > bornes.prioWeiMax) prio = bornes.prioWeiMax;', ''],
  ['plafond de gas par tx retire', 'if (gas > bornes.gasMaxParTx) {', 'if (false) {'],
  ['tx par heure : plus de borne', 'if (listes[x].length && st.envoisHeure[x].length >= plafondHeure(bornes, x)) {', 'if (false) {'],
  ['pas d arret apres des echecs', 'if (st.echecsSuite >= bornes.echecsMax) {', 'if (false) {'],
  ['un succes ne remet pas les echecs a zero', '    st.echecsSuite = 0;\n', ''],
  ['chaine du noeud non verifiee', 'if (BigInt(id) !== BigInt(chainId)) {', 'if (false) {'],
  ['plusieurs tx en vol', "      if (st.enVol) { const fini = await suivreInclusion();", "      if (false) { const fini = await suivreInclusion();"],
  ['tx non incluse jamais relachee', "if (maintenant() - v.a > bornes.inclusionMaxMs) { st.enVol = null; echec(nomTx(v) + ': tx ' + v.hash + ' not included", "if (false) { st.enVol = null; echec(nomTx(v) + ': tx ' + v.hash + ' not included"],
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
  ['V3 : un recu qui jette ne relache jamais (0f9d8ec)', "if (maintenant() - v.a > bornes.inclusionMaxMs) { st.enVol = null; echec(nomTx(v) + ': receipt", "if (false) { st.enVol = null; echec(nomTx(v) + ': receipt"],
  ['lot : plus de coupe en deux', 'return (await essai(ids.slice(0, m))) || (await essai(ids.slice(m)));', 'return null;'],
  ['lot : le spin fautif n est pas ecarte', 'ecartes.set(ids[0], s ? s.t : tete); st.compteurs.spinsEcartes += 1;', ''],
  ['statut 0 : le spin est abandonne (0f9d8ec)', '      if (v.status === 0) { info.sain = false; continue; }\n', ''],
  ['duels : envoye a la tete cible + 256 (tomberait a + 257)', 'if (tete + 1 > d.t + FENETRE) duelsSuivis.delete(id);', 'if (tete > d.t + FENETRE) duelsSuivis.delete(id);'],
  /* revue fix2 round 3 : ancres suivies (classement une fois, puis statut relu des seuls candidats) */
  ['duels : statut non relu avant envoi (deja regle envoye)', '        if (v.s !== DUEL_JOINED) { closDuel(id); continue; }\n        d.luTour = tourN;', '        d.luTour = tourN;'],
  ['duels : statut non relu au classement (deja regle classe)', '        if (v.s !== DUEL_JOINED) { closDuel(id); continue; }\n        Object.assign(d,', '        Object.assign(d,'],
  ['duels : statut 0 abandonne (classement)', 'if (!v || v.s === 0) { info.sain = false; continue; } /* illisible', 'if (!v) { info.sain = false; continue; } /* illisible'],
  ['duels : statut 0 abandonne (avant envoi)', '        if (!v || v.s === 0) { info.sain = false; continue; }\n        if (v.s !== DUEL_JOINED) { closDuel(id); continue; }\n        d.luTour', '        if (!v) { info.sain = false; continue; }\n        if (v.s !== DUEL_JOINED) { closDuel(id); continue; }\n        d.luTour'],
  ['duels : les Joined jamais lus', 'decouvrir(String(BigInt(l.topics[1])), Number(m[5]), tete, { guessB: m.slice(0, 5).map(Number) });', ''],
  ['rolls : un jour Open jamais ferme', "if (etat === 0) { out.push({ cible: 'rolls', to: cR, ids: [k], fin: Infinity, quoi: 'closeDay', avant }); continue; }", ''],
  ['rolls : drawDay a la tete cible + 256', 'if (tete + 1 <= t + FENETRE) out.push(', 'if (tete <= t + FENETRE) out.push('],
  ['rolls : jamais re-arme', "      else out.push({ cible: 'rolls', to: cR, ids: [k], fin: Infinity, quoi: 'closeDay', avant });", ''],
  ['rolls : drawDay avant la cible', '      if (tete <= t) continue;\n', ''],
  ['rolls : aujourd hui ferme', 'for (let d = a - 1; d >= Math.max(0, a - bornes.joursRecul); d--) {', 'for (let d = a; d >= Math.max(0, a - bornes.joursRecul); d--) {'],
  ['rolls : un jour sans acheteur ferme', "if (jours.acheteurs.get(k) === 0n) { jours.finis.add(k); continue; }", ''],
  ['ordre : plus par echeance (slots, duels, rolls)', 'if (k && (!pris || k.fin < listes[pris][q[pris]].fin)) pris = x;', 'if (k && !pris) pris = x;'],
  ['etat() sans activite par contrat', "plafondHeure: plafondHeure(bornes, 'duels'), ...st.parContrat.duels },", "plafondHeure: plafondHeure(bornes, 'duels') },"],
  /* ---- 2026-10-24 : la revue keeper (verdict FAIL), defauts 1 a 7 */
  ['revue 1 : un revert mine n est jamais explique (518653b)', 'try { pourquoi = await expliquer(v, entier(r.blockNumber)); }', 'try { pourquoi = null; }'],
  ['revue 1 : tout revert de duel est explique', 'return Number(m[2]) === DUEL_SETTLED ?', 'return true ?'],
  ['revue 1 : jour tire par un autre non explique', "if (etat === 2) return 'day ' + v.ids[0] + ' already drawn by another transaction';", ''],
  ['revue 1 : jour arme APRES notre bloc explique', ' && t - ROLLS_DELAI_CIBLE <= blocRecu', ''],
  ['revue 1 : cible illisible apres le revert comptee tout de suite', 'if (maintenant() - v.revertA <= bornes.inclusionMaxMs) {', 'if (false) {'],
  ['revue 1 : cible illisible apres le revert jamais comptee', 'if (maintenant() - v.revertA <= bornes.inclusionMaxMs) {', 'if (true) {'],
  ['revue 1 : plus de delai (settle a cible + 1, la course)', "(d.vainqueur === 'createur' && tete >= d.t + bornes.delaiDuelBlocs)", "(d.vainqueur === 'createur')"],
  ['revue 2 : egalite envoyee (traitee en createur gagnant)', "if (v === 'egalite') { closDuel(id); st.compteurs.duelsEgalites += 1; continue; }", "if (v === 'egalite') { d.vainqueur = 'createur'; continue; }"],
  ['revue 2 : rejoignant gagnant envoye sans attendre la fin', "((d.vainqueur === 'rejoignant' || (d.vainqueur === null && d.sansHash)) && presse(d))", "(d.vainqueur === 'rejoignant' || (d.vainqueur === null && d.sansHash && presse(d)))"],
  ['revue 2 : vainqueur inverse', "a > b ? 'createur' : 'rejoignant'", "a > b ? 'rejoignant' : 'createur'"],
  ['revue 2 : face du hash entier (pas les 40 premiers chiffres)', "keccak256(new TextEncoder().encode('0x' + s.slice(2, 42)))", 'keccak256(new TextEncoder().encode(s))'],
  ['revue 2 : marge de fin sans les tours mesures', 'Math.max(bornes.margeFinDuelBlocs, tours)', 'bornes.margeFinDuelBlocs'],
  ['revue 2 : duels par echeance seulement (pas par mise)', 'prets.sort((a, b) => (Number(b.presse) - Number(a.presse)) || (a.presse ? a.fin - b.fin : (b.mise > a.mise ? 1 : b.mise < a.mise ? -1 : a.fin - b.fin)));', 'prets.sort((a, b) => a.fin - b.fin);'],
  ['revue 2 : un duel presse ne passe plus devant', 'prets.sort((a, b) => (Number(b.presse) - Number(a.presse)) || ', 'prets.sort((a, b) => '],
  ['revue 2 : un seul plafond pour les trois contrats (518653b)', 'st.envoisHeure[x].length >= plafondHeure(bornes, x)', 'CONTRATS.reduce((s, y) => s + st.envoisHeure[y].length, 0) >= plafondHeure(bornes, x)'],
  ['revue 3 : la relache d un recu illisible n est pas comptee (518653b)', "echec(nomTx(v) + ': receipt of tx ' + v.hash + ' unreadable for ' + Math.round(bornes.inclusionMaxMs / 1000) + ' s, released (outcome unknown, counted as a failure)', 'recusIlisibles', v.cible);", 'st.compteurs.recusIlisibles += 1;'],
  ['revue 3 : etat().degrade jamais dit', "degrade: st.etat === 'ON' && st.echecsSuite > 0 ?", 'degrade: false ?'],
  ['revue 4 : buyerCount 0 garde pour toujours (518653b)', '        if (n === 0n && a <= d + 1) continue;\n', ''],
  ['revue 7 : le message d arret ne nomme plus le contrat', "' failures in a row (last, ' + (contrat || 'keeper') + ': '", "' failures in a row (last: '"],
];
let survivants = 0, introuvables = 0, temoin = true;
try {
  fs.writeFileSync(COPIE, original);
  temoin = lancer();
  console.log((temoin ? 'ok  ' : 'KO  ') + 'temoin : la copie non mutee est verte (fins de ligne du module : ' + (/\r\n/.test(original) ? 'CRLF' : 'LF') + ')');
  /* ⛔ pas de process.exit ici : il sauterait le finally et laisserait la copie mutee dans le depot (vu le 2026-10-23) */
  if (temoin) for (const [nom, de, vers] of M) {
    const re = motif(de), k = (original.match(re) || []).length;
    if (k !== 1) { introuvables += 1; console.log('??  ' + nom + ' — ancre trouvee ' + k + ' fois (attendu 1)'); continue; }
    fs.writeFileSync(COPIE, original.replace(new RegExp(re.source), () => vers));
    if (lancer()) { survivants += 1; console.log('SURVIT  ' + nom); } else console.log('tue ' + nom);
  }
} finally {
  fs.rmSync(COPIE, { force: true });
}
if (!temoin) process.exit(1);
console.log('\n' + M.length + ' mutants, ' + survivants + ' survivant(s), ' + introuvables + ' ancre(s) introuvable(s)');
process.exit(survivants || introuvables ? 1 : 0);
