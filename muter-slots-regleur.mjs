/* muter-slots-regleur.mjs — chaque borne du regleur des slots (slots-regleur.js) est RETIREE ou FAUSSEE, une a la fois, dans une COPIE
 * (.mutant-slots-regleur-<pid>.js, a cote du module pour que ses imports relatifs marchent, effacee a la fin) ; test-slots-regleur doit
 * rougir. Le module du depot n est jamais ecrit. Usage : node muter-slots-regleur.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const original = fs.readFileSync(path.join(ICI, 'slots-regleur.js'), 'utf8');
const COPIE = path.join(ICI, '.mutant-slots-regleur-' + process.pid + '.js');
const lancer = () => {
  try { execFileSync(process.execPath, [path.join(ICI, 'test-slots-regleur-20261023.mjs')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, REGLEUR_MODULE: COPIE } }); return true; }
  catch (_) { return false; }
};
const M = [
  ['sans cle : le regleur tourne quand meme', "  if (!cle) return off(", "  if (false) return off("],
  ['10 spins par tx : plus de borne', 'const ids = plan.lot.slice(0, bornes.spinsParTx);', 'const ids = plan.lot.slice();'],
  ['pot : tous les spins reglables, couverts ou non', 'const ids = plan.lot.slice(0, bornes.spinsParTx);', "const ids = plan.lignes.filter((l) => l.decision === 'LOT' || l.decision === 'COURT').map((l) => l.id).slice(0, bornes.spinsParTx);"],
  ['plafond du prix du gas retire', 'if (base + prio > bornes.maxFeeWei) {', 'if (false) {'],
  ['maxFee non borne au plafond', 'const maxFee = 2n * base + prio > bornes.maxFeeWei ? bornes.maxFeeWei : 2n * base + prio;', 'const maxFee = 2n * base + prio;'],
  ['pourboire non borne', 'if (prio > bornes.prioWeiMax) prio = bornes.prioWeiMax;', ''],
  ['plafond de gas par tx retire', 'if (gas > bornes.gasMaxParTx) {', 'if (false) {'],
  ['tx par heure : plus de borne', 'if (st.envoisHeure.length >= bornes.txParHeure) {', 'if (false) {'],
  ['pas d arret apres des echecs', 'if (st.echecsSuite >= bornes.echecsMax) {', 'if (false) {'],
  ['un succes ne remet pas les echecs a zero', '    st.echecsSuite = 0;\n', ''],
  ['chaine du noeud non verifiee', 'if (BigInt(id) !== BigInt(chainId)) {', 'if (false) {'],
  ['plusieurs tx en vol', "      if (st.enVol) { const fini = await suivreInclusion();", "      if (false) { const fini = await suivreInclusion();"],
  ['tx non incluse jamais relachee', 'if (maintenant() - v.a > bornes.inclusionMaxMs) {', 'if (false) {'],
  ['nonce latest au lieu de pending', "rpc('eth_getTransactionCount', [adresse, 'pending'])", "rpc('eth_getTransactionCount', [adresse, 'latest'])"],
  ['« already known » compte comme un echec', "if (!/already known|known transaction/i.test(msg(e))) {", 'if (true) {'],
  ['logs : plus de recul borne', 'const plancher = Math.max(Number(blocDeploiement) || 0, tete - bornes.reculLogs + 1);', 'const plancher = Math.max(Number(blocDeploiement) || 0, 0);'],
  ['logs : avant le deploiement', 'const plancher = Math.max(Number(blocDeploiement) || 0, tete - bornes.reculLogs + 1);', 'const plancher = Math.max(0, tete - bornes.reculLogs + 1);'],
  ['logs : relit tout a chaque tour', 'const de = st.scanne === null ? plancher : Math.max(plancher, st.scanne + 1 - 8);', 'const de = plancher;'],
  ['spin trop tot envoye', "filter(([, s]) => Slots.etatReglement(s.t, tete).etat === 'REGLABLE')", "filter(([, s]) => Slots.etatReglement(s.t, tete).etat !== 'PERDU')"],
  ['statut non relu (deja regle envoye)', '        if (v.status !== 1) { suivis.delete(id); continue; }\n', ''],
  ['simulation ignoree', "catch (e) { echec('simulation refused: ' + msg(e), 'simulationsRefusees'); return { fait: false, pourquoi: 'simulation refused' }; }", "catch (e) { estime = 200000n; }"],
  ['gas sans marge', 'const gas = (estime * 12n) / 10n;', 'const gas = estime;'],
  ['la garde n est plus appelee', '      verifierEnvoi(tx, { contrat: c, chainId, bornes });', '      /* garde retiree */'],
  ['garde : n importe quel selecteur', "if (!d.startsWith(SEL_SETTLE_MANY)) throw new Error('keeper: refused, only settleMany / settle are ever sent');", ''],
  ['garde : autre adresse admise', "if (bas(tx.to) !== bas(contrat)) throw new Error('keeper: refused, the destination is not the slots contract');", ''],
  ['garde : valeur admise', "if (BigInt(tx.value ?? 0) !== 0n) throw new Error('keeper: refused, a keeper call carries no value');", ''],
  ['garde : autre chaine admise', "if (BigInt(tx.chainId) !== BigInt(chainId)) throw new Error('keeper: refused, wrong chain');", ''],
  ['garde : 11 ids admis', 'if (k < 1 || k > bornes.spinsParTx)', 'if (k < 1)'],
  ['garde : donnees non canoniques admises', "if ((d.length - 10) % 64 !== 0 || m.length < 3 || m[0] !== 32n || m[1] !== BigInt(m.length - 2)) throw new Error('keeper: refused, settleMany data is not canonical');", ''],
  ['etat() publie la cle', '      etat: st.etat, adresse: st.adresse,', '      etat: st.etat, cle, adresse: st.adresse,'],
  ['intervalle sans borne haute', 'return Math.max(bornes.intervalleMinMs, Math.min(bornes.intervalleMaxMs, v));', 'return Math.max(bornes.intervalleMinMs, v);'],
  ['intervalle sur la fenetre entiere', 'const v = Math.floor((Slots.secondesFenetre(msParBloc) * 1000) / 5);', 'const v = Math.floor(Slots.secondesFenetre(msParBloc) * 1000);'],
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
