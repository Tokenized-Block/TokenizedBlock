/* muter-duels-deploiement.mjs — les gardes du DEPLOIEMENT de BlockDuels (duels-config.js, noter, page, SERVIS) sont faussees une a la fois,
 * dans une COPIE du depot (fichiers de la racine + le strict necessaire de contracts/, dans un dossier temporaire) ; test-deployer-duels ou
 * test-noter-duels doit rougir. Le depot n est jamais touche. Usage : node muter-duels-deploiement.mjs */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const SRC = path.dirname(fileURLToPath(import.meta.url));
const ICI = fs.mkdtempSync(path.join(os.tmpdir(), 'mut-duels-dep-'));
for (const f of fs.readdirSync(SRC, { withFileTypes: true })) if (f.isFile() && /\.(m?js|html|json|txt)$/.test(f.name)) fs.copyFileSync(path.join(SRC, f.name), path.join(ICI, f.name));
for (const f of ['contracts/preparer-deploiement-duels.mjs', 'contracts/noter-deploiement-duels.mjs', 'contracts/duels-parametres.json', 'contracts/src/BlockDuels.sol', 'contracts/out/BlockDuels.sol/BlockDuels.json']) {
  fs.mkdirSync(path.dirname(path.join(ICI, f)), { recursive: true });
  fs.copyFileSync(path.join(SRC, f), path.join(ICI, f));
}
const TESTS = ['test-deployer-duels-20261018.mjs', 'test-noter-duels-20261018.mjs'];
const lancer = () => {
  for (const t of TESTS) {
    try { execFileSync(process.execPath, [t], { cwd: ICI, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }); }
    catch (e) { const s = String(e.stdout || '') + String(e.stderr || ''); return { vert: false, test: t, raison: ((s.match(/^KO {2}([^\n]*)/m) || s.match(/AssertionError[^:]*: ([^\n]*)/) || s.match(/(Error[^\n]*)/) || ['', '?'])[1]) }; }
  }
  return { vert: true };
};
const M = [
  ['duels-config.js', 'EXIGE la page signe une donnee qui ne finit pas par les valeurs affichees', "if (attendu && !D.creation.endsWith(attendu)) pourquoi.push('the creation data does not end with the displayed arguments');", ''],
  ['duels-config.js', 'empreinte sha256 non comparee', "if (bas(sha256Hex) !== bas(D.sha256Creation)) pourquoi.push('sha256 fingerprint differs from the record');", ''],
  ['duels-config.js', 'EXIGE rewardPool = wallet dev admis', "if (bas(c.rewardPool) === bas(c.devWallet)) r.push(", "if (false) r.push("],
  ['duels-config.js', 'guardian = USDC admis', "if (bas(c.guardian) === bas(c.usdc)) r.push('guardian must not be the USDC contract');", ''],
  ['duels-config.js', 'adresse nulle admise', "for (const k of ORDRE_ARGS) if (ZERO.test(bas(c[k]))) r.push(k + ' cannot be zero');", ''],
  ['duels-config.js', 'deja deploye : redeploiement propose', "if (D.adresse !== null && D.adresse !== undefined) pourquoi.push('already deployed at ' + D.adresse);", ''],
  ['duels-config.js', 'enregistrement pas pret accepte', "if (D && D.pret !== true) pourquoi.push(", "if (false) pourquoi.push("],
  ['duels-config.js', 'ordre rewardPool / guardian inverse', "['usdc', 'devWallet', 'rewardPool', 'guardian']", "['usdc', 'devWallet', 'guardian', 'rewardPool']"],
  ['contracts/noter-deploiement-duels.mjs', 'EXIGE noter : input non compare octet pour octet', "if (!tx || bas(tx.input) !== bas(fiche.creation)) return refus(", "if (!tx) return refus("],
  ['contracts/noter-deploiement-duels.mjs', 'noter : nextId non verifie', "if (nextId !== '1') return refus(", "if (false) return refus("],
  ['contracts/noter-deploiement-duels.mjs', 'noter : tokenOk(USDC) non verifie', "if (usdcAdmis !== true) return refus('tokenOk(USDC) is not true on chain');", ''],
  ['contracts/noter-deploiement-duels.mjs', 'noter : REWARD_POOL non relu', "  { sig: 'REWARD_POOL()', champ: 'rewardPool' },\n", ''],
  ['contracts/noter-deploiement-duels.mjs', 'noter : status 0x0 accepte', "if (!recu || recu.status !== '0x1') return refus('the receipt is not status 0x1');", "if (!recu) return refus('the receipt is not status 0x1');"],
  ['deployer-duels.html', 'EXIGE page : bouton allume sans verification', "$('#bDeployer').disabled = !compte || !intacte || envoi || !!adresse;", "$('#bDeployer').disabled = !compte || envoi || !!adresse;"],
  ['deployer-duels.html', 'page : REWARD_POOL non relu', "rewardPool: await lireAdr(a, 'REWARD_POOL()'), ", ''],
  ['deployer-duels.html', 'page : indexable', '<meta name="robots" content="noindex">', ''],
  ['deployer-duels.html', 'page : envoie une valeur', "params: [{ from: compte, data: D.creation }]", "params: [{ from: compte, data: D.creation, value: '0x1' }]"],
  ['deployer-duels.html', 'page : 7 % tape a la main', '<b data-k="pool">…</b>%', '7%'],
  ['serveur-web.js', 'EXIGE SERVIS sans duels-plan.js (page morte)', "'deployer-duels.html', 'duels-deploiement.js', 'duels-config.js', 'duels-plan.js',", "'deployer-duels.html', 'duels-deploiement.js', 'duels-config.js',"],
  ['serveur-web.js', 'SERVIS sans la page', "'deployer-duels.html', 'duels-deploiement.js', 'duels-config.js', 'duels-plan.js',", "'duels-deploiement.js', 'duels-config.js', 'duels-plan.js',"],
];
let survivants = 0, introuvables = 0;
try {
  const t = lancer();
  console.log((t.vert ? 'ok  ' : 'KO  ') + 'temoin : la copie non mutee est verte' + (t.vert ? '' : ' (' + t.test + ' : ' + t.raison + ')'));
  if (!t.vert) process.exit(1);
  for (const [fichier, nom, de, vers] of M) {
    const p = path.join(ICI, fichier), original = fs.readFileSync(p, 'utf8');
    const n = original.split(de).length - 1;
    if (n !== 1) { introuvables += 1; console.log('??  ' + nom + ' — ancre trouvee ' + n + ' fois dans ' + fichier + ' (attendu 1)'); continue; }
    fs.writeFileSync(p, original.replace(de, () => vers));
    const r = lancer();
    fs.writeFileSync(p, original);
    if (r.vert) { survivants += 1; console.log('SURVIT  ' + nom); }
    else console.log('tue ' + nom + ' — ' + r.test.replace(/-20261018\.mjs$/, '') + ' : ' + String(r.raison).slice(0, 100));
  }
} finally {
  fs.rmSync(ICI, { recursive: true, force: true });
}
console.log('\n' + M.length + ' mutants, ' + survivants + ' survivant(s), ' + introuvables + ' ancre(s) introuvable(s)');
process.exit(survivants || introuvables ? 1 : 0);
