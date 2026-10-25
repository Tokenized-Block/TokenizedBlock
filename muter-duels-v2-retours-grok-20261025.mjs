/* muter-duels-v2-retours-grok-20261025.mjs — les correctifs des 7 retours du test live de Grok Bot sur Duels v2 (R1..R7) faussees une a la
 *   fois dans une COPIE ecrite a cote de l original (imports relatifs), passee au banc test-duels-v2-retours-grok-20261025.mjs par variable
 *   d environnement, puis effacee. Le banc doit ROUGIR (code != 0). Le fichier du depot n est jamais ecrit.
 *   Usage : node muter-duels-v2-retours-grok-20261025.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const B = 'test-duels-v2-retours-grok-20261025.mjs';
const P = ['duels-v2-plan.js', 'DUELS_V2_MODULE', B], SV = ['duels-v2-serveur.js', 'DUELS_V2_SERVEUR', B], AP = ['app.html', 'APP_HTML', B], SW = ['serveur-web.js', 'SERVEUR_WEB', B], BR = ['brain-jeu.js', 'BRAIN_JEU', B];
const M = [
  /* R5 — Settle seulement s il tombe dans la fenetre */
  [P, 'R5 etat : la marge ignoree', 'const m = marge(margeBlocs), sur = e.blocsRestants - m;', 'const m = marge(margeBlocs), sur = e.blocsRestants;'],
  [P, 'R5 planSettle sans marge', "if (r.etat === 'REGLABLE' && r.blocsRestants < marge(margeBlocs)) return refuse(", 'if (false) return refuse('],
  [P, 'R5 inclusion : 0 bloc (le bloc de tete deja lu)', 'Math.max(1, Math.ceil(MARGE_INCLUSION_S / s))', '0'],
  [P, 'R5 age de la tete ignore', 'return Math.ceil(age / 1000 / s) + Math.max(1,', 'return Math.max(1,'],
  [P, 'R5 actionsDuel : la marge donnee pas transmise', 'const e = etatDuel(d, tete, maintenant, margeBlocs), m = bas(moi)', 'const e = etatDuel(d, tete, maintenant), m = bas(moi)'],
  [P, 'R5 trop tard : pas de phrase au compte a rebours', '  if (e && e.etat === TROP_TARD) return phraseTropTard(e.blocsAvantDefaut);\n', ''],
  [AP, 'R5 app : l age de la tete servie ignore', '  if (j && Number(j.tete) > 0 && Number.isFinite(Date.parse(j.lu))) sources.push({ n: Number(j.tete), t: Date.parse(j.lu) });\n', ''],
  [AP, 'R5 actionDuel : planSettle sans la marge', 'blocActuel: tete, margeBlocs: margeD });', 'blocActuel: tete });'],
  [AP, 'R5 actionDuel : actionsDuel sans la marge', 'if (!Duels.actionsDuel(d, moi, tete, maintenant, Duels.duelsOuverts(j), margeD).includes(action)) {', 'if (!Duels.actionsDuel(d, moi, tete, maintenant, Duels.duelsOuverts(j)).includes(action)) {'],
  [AP, 'R5 carte : pas de compte a rebours sur TROP_TARD', " || e.etat === 'TROP_TARD') {", ') {'],
  [AP, 'R5 Sign du brain : pas re-verifie', "if (p.kind === 'DUEL_SETTLE' && Duels.blocsMargeSettle) {", "if (false && Duels.blocsMargeSettle) {"],
  [BR, 'R5 brain : planSettle sans la marge', 'blocActuel: D.block, margeBlocs: margeDuel });', 'blocActuel: D.block });'],
  /* R1 — le recu du create */
  [P, 'R1 recu : CREATED ignore', '      x = duelDepuisCree(ev);\n', '      x = null;\n'],
  [P, 'R1 recu : mise sous MISE_MIN acceptee', ' || stake < V1.MISE_MIN) return null;', ') return null;'],
  [P, 'R1 recu : un evenement d un duel inconnu accepte', '    if (!b) return null; /* un evenement d un duel inconnu', '    if (false) return null; /* un evenement d un duel inconnu'],
  [AP, 'R1 noterRecuDuel : base exigee (avant)', 'const nd = Duels.duelDepuisRecu(base || null, evs.filter((x) => String(x.id) === id));', 'const nd = base ? Duels.duelDepuisRecu(base, evs) : null;'],
  [AP, 'R1 defierDuel : le recu n est pas garde', '    noterRecuDuel(evsCree);\n', ''],
  /* R2 — la lecture avant la reponse, plusieurs noeuds */
  [SV, 'R2 lireAvantReponse n attend pas', 'try { return await Promise.race([p.then((v) => v === true, () => false), delai]); }', 'try { return false; }'],
  [SV, 'R2 force soumis aux 15 s', '    if (force) {\n      if (s.file) return s.file;', '    if (false) {\n      if (s.file) return s.file;'],
  [SV, 'R2 force sans borne', 'const borne = Math.min(forceMinMs, intervalleMs);', 'const borne = 0;'],
  /* revue 2026-10-25, defaut 2 : un tour force demarre APRES la requete */
  [SV, 'd2 force rend le tour EN VOL (l ancien comportement)', '    if (force) {\n      if (s.file) return s.file;', '    if (force) {\n      if (s.enVol && s.promesse) return s.promesse;\n      if (s.file) return s.file;'],
  [SV, 'd2 force sous la borne : un tour fini pris pour frais (l ancien angle mort)', 'if (!s.enVol && !(s.debut > 0 && horloge() - s.debut < borne)) return demarrer();',
    'if (!s.enVol && s.debut > 0 && horloge() - s.debut < borne) return Promise.resolve(false);\n      if (!s.enVol) return demarrer();'],
  [SV, 'd2 la file pas partagee (un tour par requete)', '      if (s.file) return s.file;\n', ''],
  [SV, 'd2 la pause de la borne sautee', 'if (s.debut > 0 && reste > 0) await attendre(reste);', ''],
  [SV, 'd2 un tour rate dit frais', 'p.then((v) => v === true, () => false)', 'p.then(() => true, () => false)'],
  [SV, 'X3 la file videe APRES son tour B (un ?frais=1 arrive pendant B servi par B)', '        s.file = null;\n        return s.enVol && s.promesse ? s.promesse : demarrer();',
    '        const b = s.enVol && s.promesse ? s.promesse : demarrer();\n        try { return await b; } finally { s.file = null; }'],
  /* revue 2026-10-25, defaut 3 : l heure servie est celle de la tete */
  [SV, 'd3 lu servi = fin du dernier tour (meme rate)', 'lu: new Date(s.luTete).toISOString()', 'lu: new Date(s.lu).toISOString()'],
  [SV, 'd3 luTete = fin du tour reussi', 's.tete = tete; s.luTete = luTete;', 's.tete = tete; s.luTete = horloge();'],
  /* revue 2026-10-25, defaut 4 : rpc() ne rajeunit pas une tete plus ancienne */
  [AP, 'd4 rpc() rajeunit une tete plus ancienne (avant)', 'if (Number.isSafeInteger(n) && n >= rpcTete.n) rpcTete = { n, t: Date.now(), v: res };', 'if (Number.isSafeInteger(n)) rpcTete = { n: Math.max(n, rpcTete.n), t: Date.now(), v: res };'],
  /* revue 2026-10-25 : le Sign refuse un duel absent */
  [AP, 'Sign : duel absent passe en silence (avant)', "if (!dd) { bcEtape(m, 'Not sent: duel #' + (idD || '?') + ' is not in the duels list just read. Open the Duels card to check it.', 'non'); return; }\n      if (dd.joiner) {", 'if (dd && dd.joiner) {'],
  [AP, 'Sign : bloc cible null pris pour 0 (Number(null) = 0, entier)', 'Number.isSafeInteger(Number(dd.targetBlock)) && Number(dd.targetBlock) > 0 ? await teteFraiche()', 'Number.isSafeInteger(Number(dd.targetBlock)) ? await teteFraiche()'],
  [SV, 'R2 tour en vol pas partage', 'if (s.enVol && s.promesse) return s.promesse;', 'if (s.enVol) return Promise.resolve();'],
  [SV, 'R2 frais : forme lache', "/[?&]frais=1(?:&|$)/", '/frais=1/'],
  [SW, 'R2 lecteur sur rpcServeur (base.org seul)', 'creerLecteurDuelsV2({ rpc: rpcDuelsV2, contrat: c })', 'creerLecteurDuelsV2({ rpc: rpcServeur, contrat: c })'],
  [SW, 'R2 route : la lecture pas attendue', 'try { await lireAvantReponse(lv2, { frais: demandeFraiche(req.url) }); }', 'try { void lv2.lire(); }'],
  [SW, 'R2 noeuds : publicnode retire', "[...(REPLIS_PUBLICS_COUPES ? [] : ['https://base-rpc.publicnode.com']), ...RPC_LIST,", '[...RPC_LIST,'],
  [AP, 'R2 app : jamais ?frais=1', "fetch(frais ? '/api/duels?frais=1' : '/api/duels',", "fetch('/api/duels',"],
  /* R3 */
  [AP, 'R3 la ligne cachee au createur', "+ (Duels.phraseAvantJoin ? ' ' + (Duels.phraseAvantJoin(sParBlocApp)", "+ (Duels.phraseAvantJoin && d.creator !== moi ? ' ' + (Duels.phraseAvantJoin(sParBlocApp)"],
  [AP, 'R3 la phrase recollee a la branche « Open » (le ternaire d avant)', "' (90%).')\n", "' (90%).'\n"],
  /* R4 */
  [AP, 'R4 ?duel= pas lu', "const id = String(paramsLien.get('duel') || '');", "const id = '';"],
  [AP, 'R4 id du lien pas verifie', 'if (!/^[1-9][0-9]{0,29}$/.test(id)) return;', 'if (!id) return;'],
  [AP, 'R4 pas de Copy link', "const lien = e.etat === 'OUVERT';", 'const lien = false;'],
  [AP, 'R4 Copy link sur tout duel', "const lien = e.etat === 'OUVERT';", 'const lien = true;'],
  /* R6 */
  [P, 'R6 pas de recul', 'return k ? Math.min(RECUL_MAX_MS, base * 2 ** k) : base;', 'return base;'],
  [P, 'R6 recul sans plafond', 'return k ? Math.min(RECUL_MAX_MS, base * 2 ** k) : base;', 'return k ? base * 2 ** k : base;'],
  [P, 'R6 recul jamais remis a zero', 'echecs = rate ? echecs + 1 : 0;', 'echecs = rate ? echecs + 1 : echecs;'],
  [P, 'R6 un appel par pas (le statut pas compte)', 'Math.round(Math.max(1, Number(appels) || 1) * blocMs)', 'Math.round(blocMs)'],
  [P, 'R6 la pause d avant (pasSuiviMs seul)', 'await attendre(pauseSuiviMs(e.etat, sp(), { appels, echecs }));', 'await attendre(pasSuiviMs(e.etat, sp()));'],
  [P, 'R6 tete illisible pas comptee comme echec', 'tete = Math.max(tete || 0, t); else rate = true;', 'tete = Math.max(tete || 0, t);'],
  /* R7 */
  [AP, 'R7 Cancel n efface pas la ligne', "if (action === 'CANCEL' || action === 'REFUND') { const f = $('#duelForme');", "if (false) { const f = $('#duelForme');"],
  [AP, 'R7 efface la ligne d un autre duel', "if (f && f.dataset && f.dataset.duel === String(d.id)) {", 'if (f) {'],
];
let tues = 0, survivants = 0, introuvables = 0;
const r0 = spawnSync(process.execPath, [B], { cwd: ICI, encoding: 'utf8' });
console.log((r0.status === 0 ? 'ok  ' : 'KO  ') + 'temoin ' + B + ' vert sur les originaux');
if (r0.status !== 0) { console.log(String(r0.stdout).slice(-1500)); process.exit(1); }
for (const [[fichier, env, test], nom, de, vers] of M) {
  const src = fs.readFileSync(path.join(ICI, fichier), 'utf8').replace(/\r\n/g, '\n');
  const k = src.split(de).length - 1;
  if (k !== 1) { introuvables += 1; console.log('??  ' + nom + ' — ancre trouvee ' + k + ' fois (attendu 1)'); continue; }
  const ext = path.extname(fichier), copie = path.join(ICI, path.dirname(fichier), '.mut-grok-' + process.pid + '-' + path.basename(fichier, ext) + ext);
  try {
    fs.writeFileSync(copie, src.replace(de, () => vers));
    const r = spawnSync(process.execPath, [test], { cwd: ICI, encoding: 'utf8', env: { ...process.env, [env]: copie } });
    const kos = (String(r.stdout).match(/^KO {2}[^\n]*/gm) || []).slice(0, 2).map((l) => l.slice(4, 90));
    if (r.status === 0) { survivants += 1; console.log('SURVIT  ' + nom + ' (' + fichier + ')'); }
    else { tues += 1; console.log('tue ' + nom + ' — ' + (kos.join(' | ') || String(r.stderr).split('\n').find((l) => /Error/.test(l)) || 'code ' + r.status)); }
  } finally { fs.rmSync(copie, { force: true }); }
}
console.log('\n' + M.length + ' mutants, ' + tues + ' tues, ' + survivants + ' survivant(s), ' + introuvables + ' ancre(s) introuvable(s)');
process.exit(survivants || introuvables ? 1 : 0);
