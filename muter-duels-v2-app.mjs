/* muter-duels-v2-app.mjs — les gardes de BlockDuelsV2 COTE APP (module de plan, lecteur du serveur, brain, carte d app.html, route de
 * serveur-web.js) et de son DEPLOIEMENT (verification de la page, noter) sont faussees une a la fois dans une COPIE ecrite a cote de
 * l original (pour ses imports relatifs), passee au banc par variable d environnement, puis effacee. Le banc doit ROUGIR (code != 0).
 * Le fichier du depot n est jamais ecrit. Usage : node muter-duels-v2-app.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const APP_T = 'test-duels-v2-app-20261024.mjs', DEP_T = 'test-deployer-duels-v2-20261024.mjs', NOT_T = 'test-noter-duels-v2-20261024.mjs';
const P = ['duels-v2-plan.js', 'DUELS_V2_MODULE', APP_T], SV = ['duels-v2-serveur.js', 'DUELS_V2_SERVEUR', APP_T], BR = ['brain-jeu.js', 'BRAIN_JEU_MODULE', APP_T];
const AP = ['app.html', 'APP_HTML', APP_T], SW = ['serveur-web.js', 'SERVEUR_WEB', APP_T], CF = ['duels-v2-config.js', 'DUELS_V2_CONFIG', DEP_T], NO = ['contracts/noter-deploiement-duelsv2.mjs', 'NOTER_V2', NOT_T];
const M = [
  [P, 'etat : REMBOURSABLE garde (plus de defaut)', "return e.etat === 'REMBOURSABLE' ? { etat: DEFAULT_CREATOR } : e;", 'return e;'],
  [P, 'actions : le defaut devient un REFUND', "if (e.etat === DEFAULT_CREATOR) return ['SETTLE_DEFAULT'];", "if (e.etat === DEFAULT_CREATOR) return ['REFUND'];"],
  [P, 'planSettleDefault DANS la fenetre', "if (e.etat === 'REGLABLE') return refuse('still inside the window", "if (false) return refuse('still inside the window"],
  [P, 'la ligne dit 256 s (les blocs pour des secondes)', "'Settle within about ' + n + ' s", "'Settle within about ' + V1.FENETRE + ' s"],
  [P, 'planJoin sans temps de bloc mesure', 'if (!avertissement) return refuse(PHRASE_SANS_MESURE);', ''],
  [P, 'JSON : un defaut a un autre que le createur accepte', 'if (bas(x.winner) !== d.creator) return null;', ''],
  [P, 'selecteur settleDefault faux', "export const SIG_SETTLE_DEFAULT = 'settleDefault(uint256)';", "export const SIG_SETTLE_DEFAULT = 'settleDefaults(uint256)';"],
  [P, 'duelsOuverts toujours vrai', 'export const duelsOuverts = (j) => !!(j && j.version === VERSION && j.ok === true && ADR.test(bas(j.contrat)));', 'export const duelsOuverts = (j) => true;'],
  [P, 'planRefund d un duel rejoint', 'if (duel && duel.joiner) return refuse(', 'if (false) return refuse('],
  [P, 'GAGNE_DEFAUT pas fini', 'export const FINIS = Object.freeze([...V1.FINIS, GAGNE_DEFAUT]);', 'export const FINIS = Object.freeze([...V1.FINIS]);'],
  [P, 'texte apres la fenetre = celui de v1', "export const APRES_FENETRE = 'After that, the creator wins by default.';", "export const APRES_FENETRE = 'After that, both are refunded in full.';"],
  [P, 'DefaultWon : gagnant lu dans le mauvais topic', "winner: '0x' + bas(l.topics[2])", "winner: '0x' + bas(l.topics[1])"],
  [SV, 'serveur : Defaulted pas final (relu a chaque tour)', 'return { statut, duel, final: STATUTS_FINAUX_V2.includes(statut) };', 'return { statut, duel, final: false };'],
  [SV, 'serveur : gain par defaut = la mise', 'payout: V2.partage(r.stake).gagnant }', 'payout: r.stake }'],
  [SV, 'serveur : Defaulted sans joueur accepte', "if (['Joined', 'Settled', 'Defaulted'].includes(statut) && !pris) return null;", "if (['Joined', 'Settled'].includes(statut) && !pris) return null;"],
  [SV, 'serveur : la ligne avant join non servie', 'avantJoin: V2.phraseAvantJoin(sParBloc)', 'avantJoin: null'],
  [SV, 'serveur : fiche sans bloc acceptee', 'return ADR.test(c) && Number.isSafeInteger(fiche.bloc) && fiche.bloc > 0 ? c : null;', 'return ADR.test(c) ? c : null;'],
  [BR, 'brain : join v2 sans la ligne', "(v2 ? plan.avertissement + ' ' : '')", "''"],
  [BR, 'brain : join v2 par le plan v1 (sans mesure)', '(v2 ? DuelsV2.planJoin : planJoin)', 'planJoin'],
  [BR, 'brain : le defaut propose au createur seulement', '|| x.etat === DuelsV2.DEFAULT_CREATOR ||', '|| (x.etat === DuelsV2.DEFAULT_CREATOR && bas(d.creator) === moi) ||'],
  [BR, 'brain : etats v1 en v2', '(v2 ? DuelsV2.etatDuel : etatDuel)', 'etatDuel'],
  [BR, 'brain : les defauts des autres avant les siens', '|| (bas(p.d.creator) === moi ? 0 : 1) - (bas(q.d.creator) === moi ? 0 : 1)', '|| 0'],
  [AP, 'brain de l app : version non passee', 'if (duels) Object.assign(duels, { version: jd.version === DuelsV2.VERSION ? DuelsV2.VERSION : 1, sParBloc: sParBlocApp });', ''],
  [AP, 'app : module toujours v1', 'const moduleDuels = (j) => (j && j.version === DuelsV2.VERSION ? DuelsV2 : DuelsV1);', 'const moduleDuels = (j) => DuelsV1;'],
  [AP, 'carte : pas de ligne avant le join', "+ (Duels.phraseAvantJoin && d.creator !== moi ? ' ' + (Duels.phraseAvantJoin(sParBlocApp) || Duels.PHRASE_SANS_MESURE) : ''));", ');'],
  [AP, 'carte : Accept sans mesure', '  ouverts = ouverts && !(Duels.phraseAvantJoin && Duels.phraseAvantJoin(sParBlocApp) === null);\n', ''],
  [AP, 'carte : join sans le temps de bloc', '\n    plan = Duels.planJoin({ contrat, duel: d, guess: face.guess, moi, maintenant, sParBloc: sParBlocApp });', '\n    plan = Duels.planJoin({ contrat, duel: d, guess: face.guess, moi, maintenant });'],
  [AP, 'chat : join sans le temps de bloc', 'const plan = Duels.planJoin({ contrat, duel: d, guess: face.guess, moi, maintenant, sParBloc: sParBlocApp });', 'const plan = Duels.planJoin({ contrat, duel: d, guess: face.guess, moi, maintenant });'],
  [AP, 'carte : Settle by default non branche', "  else if (action === 'SETTLE_DEFAULT' && Duels.planSettleDefault) plan = Duels.planSettleDefault({ contrat, id: d.id, targetBlock: d.targetBlock, blocActuel: tete });\n", ''],
  [AP, 'carte : apres le join, la carte quitte le duel', '      duelsCfg.focus = String(jn.id); void suivreDuelApp', '      void suivreDuelApp'],
  /* 2026-10-24 (revue n°1) : le join v2 ne fait plus d attente aveugle (le duel est suivi) — ancres de la branche v2 */
  [AP, 'carte : apres le join, le texte de v1', "Settle shows here as soon as it is in (anyone may). ' + (Duels.APRES_FENETRE || '')", "Settle shows here as soon as it is in (anyone may; after that both are refunded).'"],
  [AP, 'How it works : la phrase v1 reste', "if (rf) rf.textContent = 'Not accepted in time: the stake goes back to its creator. ' + fen + ', even on a tie.';", ''],
  [SW, 'route : v2 jamais essaye', 'const lv2 = duelsV2();', 'const lv2 = null;'],
  [CF, 'page : arguments differents de v1 acceptes', "if (v1) for (const k of ORDRE_ARGS) if (bas(v1.constructeur && v1.constructeur[k]) !== bas(D.constructeur && D.constructeur[k])) pourquoi.push(k + ' differs from the v1 duels contract');", ''],
  [CF, 'page : une fiche v1 acceptee', "if (!D || D.contrat !== CONTRAT_V2) pourquoi.push('not a BlockDuelsV2 record');", ''],
  [CF, 'page : empreinte non comparee', "if (bas(sha256Hex) !== bas(D.sha256Creation)) pourquoi.push('sha256 fingerprint differs from the record');", ''],
  [CF, 'page : redeploiement propose', "if (D.adresse !== null && D.adresse !== undefined) pourquoi.push('already deployed at ' + D.adresse);", ''],
  [NO, 'noter : code sans settleDefault accepte', "if (typeof code !== 'string' || !bas(code).includes('63' + SELECTEUR_DEFAUT)) return refus(", 'if (false) return refus('],
  [NO, 'noter : autre chaine acceptee', "if (tx.chainId !== undefined && tx.chainId !== null && bas(tx.chainId) !== '0x2105') return refus(", 'if (false) return refus('],
  [NO, 'noter : constantes non relues', 'for (const c of CONSTANTES) if (constantes[c.sig] !== c.attendu) return refus(', 'for (const c of CONSTANTES) if (false) return refus('],
  [NO, 'noter : input non compare', 'if (!tx || bas(tx.input) !== bas(fiche.creation)) return refus(', 'if (!tx) return refus('],
  [NO, 'noter : CRLF perdus', "const cr = (l) => (l.endsWith('\\r') ? '\\r' : '');", "const cr = (l) => '';"],
];
let tues = 0, survivants = 0, introuvables = 0;
const temoins = new Set();
for (const [[fichier, env, test]] of M) temoins.add(test);
for (const t of temoins) {
  const r = spawnSync(process.execPath, [t], { cwd: ICI, encoding: 'utf8' });
  console.log((r.status === 0 ? 'ok  ' : 'KO  ') + 'temoin ' + t + ' vert sur les originaux');
  if (r.status !== 0) { console.log(String(r.stdout).slice(-1500)); process.exit(1); }
}
for (const [[fichier, env, test], nom, de, vers] of M) {
  const src = fs.readFileSync(path.join(ICI, fichier), 'utf8').replace(/\r\n/g, '\n');
  const k = src.split(de).length - 1;
  if (k !== 1) { introuvables += 1; console.log('??  ' + nom + ' — ancre trouvee ' + k + ' fois (attendu 1)'); continue; }
  const ext = path.extname(fichier), copie = path.join(ICI, path.dirname(fichier), '.mut-dv2-' + process.pid + '-' + path.basename(fichier, ext) + ext);
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
