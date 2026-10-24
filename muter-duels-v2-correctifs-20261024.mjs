/* muter-duels-v2-correctifs-20261024.mjs — les correctifs de la revue BlockDuelsV2 (2026-10-24) faussees une a la fois dans une COPIE ecrite a
 *   cote de l original (imports relatifs), passee au banc par variable d environnement, puis effacee. Le banc doit ROUGIR (code != 0).
 *   n°1 Settle des le bloc resultat (duels-v2-plan.js, app.html) · n°2 la fenetre suit le temps de bloc (temps-de-bloc.js, temps-de-bloc-court.js,
 *   serveur-web.js) · n°3 une seule creation (envoi-creation.js, les 3 pages) · n°4 noter (noeud Base, hash du bloc).
 * Le fichier du depot n est jamais ecrit. Usage : node muter-duels-v2-correctifs-20261024.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const SUIVI = 'test-duels-v2-suivi-20261024.mjs', BASC = 'test-temps-de-bloc-bascule-20261024.mjs', ENV_T = 'test-deployer-envoi-unique-20261024.mjs', NOT_T = 'test-noter-duels-v2-20261024.mjs', ONG_T = 'test-deployer-envoi-onglets-20261025.mjs';
const P = ['duels-v2-plan.js', 'DUELS_V2_MODULE', SUIVI], AP = ['app.html', 'APP_HTML', SUIVI];
const TB = ['temps-de-bloc.js', 'TEMPS_DE_BLOC', BASC], TC = ['temps-de-bloc-court.js', 'TEMPS_COURT', BASC], SW = ['serveur-web.js', 'SERVEUR_WEB', BASC];
const E = ['envoi-creation.js', 'ENVOI_CREATION', ENV_T], PG2 = ['deployer-duels-v2.html', 'PAGE_DUELS_V2', ENV_T], PG1 = ['deployer-duels.html', 'PAGE_DUELS', ENV_T], PGS = ['deployer-slots.html', 'PAGE_SLOTS', ENV_T];
const NO = ['contracts/noter-deploiement-duelsv2.mjs', 'NOTER_V2', NOT_T];
const EO = ['envoi-creation.js', 'ENVOI_CREATION', ONG_T], PO2 = ['deployer-duels-v2.html', 'PAGE_DUELS_V2', ONG_T], PO1 = ['deployer-duels.html', 'PAGE_DUELS', ONG_T], POS = ['deployer-slots.html', 'PAGE_SLOTS', ONG_T];
const DISABLED = "$('#bDeployer').disabled = !compte || !intacte || envoi || !!adresse || !E.peutEnvoyer();";
const M = [
  /* n°1 — le module de plan */
  [P, 'fusion : le servi l emporte toujours', 'if (rang(d) >= rang(l)) { reste.delete(k); return d; }', '{ reste.delete(k); return d; }'],
  [P, 'fusion : le local l emporte toujours', 'if (rang(d) >= rang(l)) { reste.delete(k); return d; }', 'if (false) { reste.delete(k); return d; }'],
  [P, 'recu : SETTLED ignore', "} else if (ev.type === 'SETTLED') {", "} else if (ev.type === 'SETTLED_X') {"],
  [P, 'recu : DEFAULT_WON a un autre gagnant accepte', 'if (!b.joiner || bas(ev.winner) !== bas(b.creator)) return null;', 'if (!b.joiner) return null;'],
  [P, 'suivi : 1 s avant le bloc resultat (plus un demi-bloc)', 'return Math.min(1000, Math.max(100, Math.round((s * 1000) / 2)));', 'return 1000;'],
  [P, 'suivi : le duel jamais relu sur la chaine', "if (s && s !== 'Open' && s !== 'Joined' && s !== 'None') d = { ...d, finChaine: s };", ''],
  [P, 'suivi : s arrete au bloc resultat', "if (!['ATTENTE', 'REGLABLE', 'NON_LU'].includes(e.etat)", "if (!['ATTENTE', 'NON_LU'].includes(e.etat)"],
  [P, 'etat : finChaine ignore', 'if (d && d.finChaine) return { etat: FINI_CHAINE, statut: d.finChaine };', ''],
  [P, 'compte a rebours : la fenetre entiere, pas ce qui reste', "if (e.etat === 'REGLABLE') return secondesPour(e.blocsRestants, sParBloc);", "if (e.etat === 'REGLABLE') return secondesPour(V1.FENETRE, sParBloc);"],
  [P, 'suivi : une tete illisible arrete le suivi', "if (!['ATTENTE', 'REGLABLE', 'NON_LU'].includes(e.etat)", "if (!['ATTENTE', 'REGLABLE'].includes(e.etat)"],
  /* n°1 — la carte */
  [AP, 'duelsDe : la liste servie seule (recus ignores)', "if (!Duels.fusionnerLocaux || !duelsCfg.locaux || !duelsCfg.locaux.size || !j || !j.ok) return lus(cle);", 'return lus(cle);'],
  [AP, 'actionDuel : le recu n est pas garde', '  noterRecuDuel(evs);\n  if (action === \'JOIN\') {', "  if (action === 'JOIN') {"],
  [AP, 'join : le suivi n est pas lance', '      duelsCfg.focus = String(jn.id); void suivreDuelApp(String(jn.id));', '      duelsCfg.focus = String(jn.id);'],
  [AP, 'carte : la tete servie seule', 'const tete = Math.max(Number(j.tete), Number(duelsCfg.teteLocale) || 0);', 'const tete = Number(j.tete);'],
  [AP, 'actionDuel : la tete du cache de rpc seule', '  tete = Math.max(tete, Number(duelsCfg.teteLocale) || 0);\n', ''],
  [AP, 'join : la chaine n est pas relue', "      if (st !== 'Open') { dit(", '      if (false) { dit('],
  [AP, 'teteFraiche : le cache de 4 s', "const h = await rpcReseau('eth_blockNumber', []), nb", "const h = await rpc('eth_blockNumber', []), nb"],
  [AP, 'carte : pas de compte a rebours', "if (tc) { const pc = document.createElement('p');", "if (false) { const pc = document.createElement('p');"],
  [AP, 'suivi : pas de repeint au changement d etat', 'if (x.change) void peindreDuels(); else majCompteDuel(k, x.texte);', 'majCompteDuel(k, x.texte);'],
  [AP, 'suivi : la tete locale n est pas tenue', 'if (Number.isSafeInteger(x.tete)) duelsCfg.teteLocale = Math.max(Number(duelsCfg.teteLocale) || 0, x.tete);', ''],
  /* n°2 — le temps de bloc */
  [TB, 'prudente : toujours la longue', 'return c < l * (1 - ECART_PRUDENT) ? c : l;', 'return l;'],
  [TB, 'prudente : toujours la courte', 'return c < l * (1 - ECART_PRUDENT) ? c : l;', 'return c;'],
  [TB, 'borne basse : sans la seconde d arrondi', 'return plausible((d - 1) / n);', 'return plausible(d / n);'],
  [TC, 'courte : TTL ignore', 'if (!force && s.lu !== null && horloge() - s.lu < ttlMs) return s.sParBloc;', ''],
  [TC, 'courte : rafale apres un echec', '        s.lu = horloge();\n        return s.sParBloc;', '        return s.sParBloc;'],
  [SW, 'route : la mesure longue (avant le correctif)', 'sParBloc: sParBlocServi(), blocksDe: blocsDuCreateur', 'sParBloc: tempsDeBlocSrv.sParBloc, blocksDe: blocsDuCreateur'],
  [SW, 'route : la mesure courte jamais relue', '      void mesureCourteSrv.lire();\n      rendreD(reponseDuelsV2(', '      rendreD(reponseDuelsV2('],
  [SW, '/api/tirage : le json d avant', 'tempsDeBloc: tempsDeBlocServiJson(),', 'tempsDeBloc: tempsDeBlocJson(),'],
  /* n°3 — une seule creation */
  [E, 'surBase : le changement cru sur parole', 'try { return (await chaine()) === bas(chaineHex); } catch (_) { return false; }', 'return true;'],
  [E, 'le hash n est pas garde', '      garder(tx);\n', ''],
  [E, 'peutEnvoyer ignore le hash', 'peutEnvoyer: () => { relire(); return !bloque(); }', "peutEnvoyer: () => { relire(); const b = bloque(); return !b || b.etat === 'DEJA_ENVOYE'; }"],
  [E, 'envoyer ignore le hash garde', "    if (s.tx) return { etat: 'DEJA_ENVOYE', tx: s.tx };\n", ''],
  [EO, 'erreur sans hash : on renvoie', "        marquerIncertain();\n        return { etat: 'INCERTAIN', message: String", "        return { etat: 'INCERTAIN', message: String"],
  [E, 'recu 0x0 : le hash reste (Deploy jamais rallume)', '    oublier(tx);\n', ''],
  /* « le stockage n est pas relu au chargement » retire (2026-10-25) : EQUIVALENT, chaque question (etat, peutEnvoyer, envoyer, verifier) relit */
  [E, 'pas de verrou en vol', "    if (s.enVol) return { etat: 'EN_COURS' };\n    if (s.vu === 'ATTENTE')", "    if (s.vu === 'ATTENTE')"],
  [E, 'refus 4001 pris pour une erreur', "        if (e && e.code === 4001) { if (bas(lireStock()) === MA_MARQUE) ecrireStock(null); return { etat: 'DECLINE' }; }\n", ''],
  [PG2, 'page v2 : Deploy rallume apres un envoi', DISABLED, "$('#bDeployer').disabled = !compte || !intacte || envoi || !!adresse;"],
  [PG2, 'page v2 : pas de Check again', "$('#bRevoir').hidden = !(tx || bloque) || !!adresse;", "$('#bRevoir').hidden = true;"],
  [PG1, 'page v1 : Deploy rallume apres un envoi', DISABLED, "$('#bDeployer').disabled = !compte || !intacte || envoi || !!adresse;"],
  [PG1, 'page v1 : pas de Check again', "$('#bRevoir').hidden = !(tx || bloque) || !!adresse;", "$('#bRevoir').hidden = true;"],
  [PGS, 'page slots : Deploy rallume apres un envoi', DISABLED, "$('#bDeployer').disabled = !compte || !intacte || envoi || !!adresse;"],
  [PGS, 'page slots : pas de Check again', "$('#bRevoir').hidden = !(tx || bloque) || !!adresse;", "$('#bRevoir').hidden = true;"],
  /* dv2Review 2026-10-25 — deux onglets, page rechargee pendant la demande, « Check again » hors de Base */
  [EO, 'envoyer : le hash d un autre onglet pas relu avant de demander au wallet', "  async function envoyer(from, { avant = null, envoye = null } = {}) {\n    relire();\n", '  async function envoyer(from, { avant = null, envoye = null } = {}) {\n'],
  [EO, 'envoyer : pas relu apres le changement de reseau (course)', "      relire();\n      { const b = bloque(); if (b && b.etat !== 'EN_COURS') return b; }\n", ''],
  [EO, 'peutEnvoyer ne relit pas le stockage', 'peutEnvoyer: () => { relire(); return !bloque(); }', 'peutEnvoyer: () => !bloque()'],
  [EO, 'etat ne relit pas le stockage', 'etat: () => { relire(); return {', 'etat: () => { return {'],
  [EO, 'pas de marque avant eth_sendTransaction', '      ecrireStock(MA_MARQUE);\n', ''],
  [EO, 'refus 4001 : la marque reste', "{ if (bas(lireStock()) === MA_MARQUE) ecrireStock(null); return { etat: 'DECLINE' }; }", "{ return { etat: 'DECLINE' }; }"],
  [EO, 'INCERTAIN pas garde dans le stockage', 'if (!v || v === MA_MARQUE) ecrireStock(INCERTAIN);', ''],
  [EO, 'la marque d une autre page ignoree', "if (v.startsWith(ATTENTE)) { s.vu = v === MA_MARQUE && s.enVol ? null : 'ATTENTE'; return; }", 'if (v.startsWith(ATTENTE)) { s.vu = null; return; }'],
  [EO, 'INCERTAIN du stockage ignore', "s.vu = v === INCERTAIN ? 'INCERTAIN' : null;", 's.vu = null;'],
  [EO, 'un hash adopte n est pas garde (stockage seul)', 'if (HASH.test(v)) { if (!s.tx) s.tx = v; s.vu = null; return; }', 'if (HASH.test(v)) { s.vu = null; return; }'],
  [EO, 'verifier : eth_chainId pas relu', "if (c !== bas(chaineHex)) return { etat: 'HORS_BASE'", "if (false) return { etat: 'HORS_BASE'"],
  [EO, 'verifier : demande un changement de reseau', "let c = null; try { c = await chaine(); } catch (_) { c = null; }", "let c = null; try { await surBase(); c = await chaine(); } catch (_) { c = null; }"],
  [EO, 'verifier : sans hash, rien (ATTENTE perdu)', "      return s.vu === 'ATTENTE' ? { etat: 'ATTENTE' } : { etat: 'RIEN' };", "      return { etat: 'RIEN' };"],
  [EO, 'un 0x0 efface n importe quel hash', 'if (bas(lireStock()) === tx) ecrireStock(null);', 'ecrireStock(null);'],
  [EO, 'liberer efface un hash garde', 'if (s.tx || s.enVol) return false;', 'if (s.enVol) return false; s.tx = null; ecrireStock(null);'],
  [EO, 'liberer n efface pas le stockage', 'if (v === INCERTAIN || v.startsWith(ATTENTE)) ecrireStock(null);', ''],
  [EO, 'phrase ATTENTE sans l historique du wallet', "look up this wallet\u2019s history on a block explorer. If a deployment was sent, do not deploy again: send its transaction hash to the team. If nothing was sent, press \u201cNothing was sent\u201d.';\n  if (e === 'INCERTAIN')", "press Check again.';\n  if (e === 'INCERTAIN')"],
  ...[[PO2, 'v2'], [PO1, 'v1'], [POS, 'slots']].flatMap(([PG, nm]) => [
    [PG, 'page ' + nm + ' : pas de « Nothing was sent »', "$('#bLiberer').hidden = !bloque || !!adresse;", "$('#bLiberer').hidden = true;"],
    [PG, 'page ' + nm + ' : « Check again » exige un hash', '  { const st = E.etat(); if (!st.tx && !st.attente && !st.incertain) return; }', '  if (!E.etat().tx) return;'],
    [PG, 'page ' + nm + ' : rien dit au chargement', '\nannoncer();\n</script>', '\n</script>'],
    [PG, 'page ' + nm + ' : pas de repeint sur `storage`', "try { window.addEventListener('storage', () => { if (!envoi) { peindre(); annoncer(); } }); } catch (_) {}", ''],
    [PG, 'page ' + nm + ' : Deploy bloque sans rien dire', '  if (compte && intacte && !envoi && !adresse && !E.peutEnvoyer()) { peindre(); annoncer(); return; }\n', ''],
    [PG, 'page ' + nm + ' : la phrase du wallet hors de Base perdue', "  if (['INCERTAIN', 'ATTENTE', 'HORS_BASE', 'DEJA_ENVOYE'].includes(r.etat))", "  if (['INCERTAIN', 'ATTENTE', 'DEJA_ENVOYE'].includes(r.etat))"],
  ]),
  [AP, 'suivi : la copie finChaine ecrase le resultat d un Settle', '!loc?.finChaine && !loc?.settled && ', '!loc?.finChaine && '],  /* n°4 — noter */
  [NO, 'noter : noeud d une autre chaine accepte', "if (chaineNoeud !== '0x2105') return refus(", 'if (false) return refus('],
  [NO, 'noter : hash du bloc non compare', 'if (bas(hashBlocNoeud) !== hb) return refus(', 'if (false) return refus('],
  [NO, 'noter : eth_chainId du noeud jamais lu', "let chaineNoeud = null; try { chaineNoeud = bas(await rpc('eth_chainId', [])); } catch (_) { chaineNoeud = null; }", "let chaineNoeud = '0x2105';"],
  [NO, 'noter : en-tete du bloc jamais lu', "try { const b = await rpc('eth_getBlockByNumber', [recu.blockNumber, false]); hashBlocNoeud = b && b.hash ? bas(b.hash) : null; } catch (_) { hashBlocNoeud = null; }", 'hashBlocNoeud = bas(recu.blockHash);'],
];
let tues = 0, survivants = 0, introuvables = 0;
for (const t of new Set(M.map((m) => m[0][2]))) {
  const r = spawnSync(process.execPath, [t], { cwd: ICI, encoding: 'utf8', timeout: 600000 });
  console.log((r.status === 0 ? 'ok  ' : 'KO  ') + 'temoin ' + t + ' vert sur les originaux');
  if (r.status !== 0) { console.log(String(r.stdout).slice(-1500)); process.exit(1); }
}
for (const [[fichier, env, test], nom, de, vers] of M) {
  const src = fs.readFileSync(path.join(ICI, fichier), 'utf8').replace(/\r\n/g, '\n');
  const k = src.split(de).length - 1;
  if (k !== 1) { introuvables += 1; console.log('??  ' + nom + ' — ancre trouvee ' + k + ' fois (attendu 1)'); continue; }
  const ext = path.extname(fichier), copie = path.join(ICI, path.dirname(fichier), '.mut-dv2c-' + process.pid + '-' + path.basename(fichier, ext) + ext);
  try {
    fs.writeFileSync(copie, src.replace(de, () => vers));
    const r = spawnSync(process.execPath, [test], { cwd: ICI, encoding: 'utf8', timeout: 600000, env: { ...process.env, [env]: copie } });
    const kos = (String(r.stdout).match(/^KO {2}[^\n]*/gm) || []).slice(0, 2).map((l) => l.slice(4, 90));
    if (r.status === 0) { survivants += 1; console.log('SURVIT  ' + nom + ' (' + fichier + ')'); }
    else { tues += 1; console.log('tue ' + nom + ' — ' + (kos.join(' | ') || String(r.stderr).split('\n').find((l) => /Error/.test(l)) || 'code ' + r.status)); }
  } finally { fs.rmSync(copie, { force: true }); }
}
console.log('\n' + M.length + ' mutants, ' + tues + ' tues, ' + survivants + ' survivant(s), ' + introuvables + ' ancre(s) introuvable(s)');
process.exit(survivants || introuvables ? 1 : 0);
