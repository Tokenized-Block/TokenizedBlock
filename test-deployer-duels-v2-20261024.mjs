/* test-deployer-duels-v2-20261024.mjs — CE QUE PHIL SIGNERA pour deployer BlockDuelsV2, et la page qui le lui propose.
 * Le deploiement est UNE transaction de creation, figee dans duels-v2-deploiement.js (contracts/preparer-deploiement-duelsv2.mjs), proposee au
 * wallet connecte par deployer-duels-v2.html. banc-duels-v2-anvil envoie ces octets tels quels sur un anvil local et relit tout.
 * A. la fiche du depot : contrat BlockDuelsV2, Base ; les 4 arguments = ceux de la fiche v1 DEPLOYEE (duels-deploiement.js), egaux a
 *    duels-parametres.json et frais-creation.js ; source ACTUELLE ; regeneree a l identique ; adresse et bloc nuls ; la donnee = bytecode
 *    compile + arguments ; l artefact porte settleDefault / DefaultWon. A2. des parametres qui DIFFERENT de v1 : le preparateur refuse.
 * B. le refus de la page (duels-v2-config.js verifierEnregistrementV2, la MEME fonction) : octet change, empreinte fausse, argument affiche
 *    different, different de v1, deja deploye, pas prete, une fiche v1 (contrat BlockDuels), une autre chaine.
 * C. la page : UN seul envoi apres un appui, un wallet et une verification verte ; relit les adresses, tokenOk(USDC), nextId, 9000 / 700 bps,
 *    la fenetre 256 et settleDefault dans le code ; dit ce qui change par rapport a v1 et pourquoi ; noindex ; tout ce qu elle importe est servi.
 * ⛔ BORNE : rien ici ne prouve un deploiement sur Base ni un vrai wallet. La page n a PAS ete essayee avec un wallet connecte. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.isAbsolute(f) ? f : path.join(ICI, f)).href + '?v=' + Math.random());
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const lire = (f) => fs.readFileSync(path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const { DUELS_V2_DEPLOIEMENT: D } = await imp('duels-v2-deploiement.js');
const { DUELS_DEPLOIEMENT: V1 } = await imp('duels-deploiement.js');
const { encoderArgs, verifierEnregistrementV2, ORDRE_ARGS } = await imp(process.env.DUELS_V2_CONFIG || 'duels-v2-config.js');
const { USDC_BASE, FEE_WALLET } = await imp('frais-creation.js');
const P = await imp('duels-plan.js');
const ARTEFACT = path.join(ICI, 'contracts/out/BlockDuelsV2.sol/BlockDuelsV2.json');
const PARAMS = JSON.parse(lire('contracts/duels-parametres.json'));

console.log('— A. la fiche du depot');
ok(D.chaine === 8453 && D.contrat === 'BlockDuelsV2' && Object.isFrozen(D) && Object.isFrozen(D.constructeur) && JSON.stringify(D.ordre) === JSON.stringify(ORDRE_ARGS), 'A chaine 8453, contrat BlockDuelsV2, ordre de duels-config.js, objets figes');
ok(ORDRE_ARGS.every((k) => D.constructeur[k] === String(V1.constructeur[k]).toLowerCase()) && D.memesParametresQue === String(V1.adresse).toLowerCase(), 'A les 4 arguments = ceux de la fiche v1 DEPLOYEE (' + V1.adresse + ')');
ok(D.constructeur.usdc === USDC_BASE.toLowerCase() && D.constructeur.devWallet === FEE_WALLET.toLowerCase() && D.constructeur.rewardPool === PARAMS.rewardPool.toLowerCase() && D.constructeur.guardian === PARAMS.guardian.toLowerCase(),
  'A et = frais-creation.js (usdc, devWallet) et duels-parametres.json (rewardPool, guardian) — jamais tapes');
ok(D.pret === true && D.manquants.length === 0 && D.refus.length === 0 && D.adresse === null && D.bloc === null, 'A prete, rien ne manque, adresse ET bloc nuls (Phil n a pas signe)');
ok(sha(lire('contracts/src/BlockDuelsV2.sol')) === D.sha256Sources['src/BlockDuelsV2.sol'], 'A generee depuis la source ACTUELLE de BlockDuelsV2 (source modifiee sans regenerer = rouge)');
const art = JSON.parse(fs.readFileSync(ARTEFACT, 'utf8'));
const octets = Buffer.from(D.creation.slice(2), 'hex');
ok(D.creation === art.bytecode.object + encoderArgs(D.constructeur) && D.octetsArgs === 128, 'A donnee = bytecode compile + les 4 arguments RE-ENCODES (128 octets), rien d autre');
ok(octets.length === D.octetsCreation && sha(octets) === D.sha256Creation, 'A empreinte sha256 recalculee : ' + D.sha256Creation + ' (' + D.octetsCreation + ' octets)');
ok((art.deployedBytecode.object.length - 2) / 2 === D.octetsRuntime && D.octetsRuntime < 24576 && octets.length <= 49152, 'A runtime ' + D.octetsRuntime + ' octets < 24 Ko (EIP-170), creation sous EIP-3860');
ok(art.abi.some((x) => x.type === 'function' && x.name === 'settleDefault') && art.abi.some((x) => x.type === 'event' && x.name === 'DefaultWon') && !art.abi.some((x) => x.type === 'function' && /owner|withdraw|pause|sweep/i.test(x.name)),
  'A l artefact porte settleDefault et DefaultWon, et aucune fonction owner / withdraw / pause / sweep');
const preparer = (sortie, env = {}) => execFileSync(process.execPath, ['preparer-deploiement-duelsv2.mjs'], { cwd: path.join(ICI, 'contracts'), env: { ...process.env, SORTIE: sortie, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'duelsv2-dep-'));
try {
  preparer(path.join(tmp, 'meme.js'));
  ok(fs.readFileSync(path.join(tmp, 'meme.js'), 'utf8').replace(/\r\n/g, '\n') === lire('duels-v2-deploiement.js'), 'A le preparateur relance regenere la fiche du depot a l IDENTIQUE (deterministe)');
  console.log('— A2. des parametres qui different de v1 : refus');
  fs.writeFileSync(path.join(tmp, 'p.json'), JSON.stringify({ rewardPool: '0x' + '70'.repeat(20), guardian: PARAMS.guardian }));
  let refuse = null; try { preparer(path.join(tmp, 'x.js'), { PARAMETRES: path.join(tmp, 'p.json') }); } catch (e) { refuse = String(e.stderr || e.message); }
  ok(refuse && /rewardPool differs from the v1 duels record/.test(refuse) && !fs.existsSync(path.join(tmp, 'x.js')), 'A2 rewardPool different de v1 : exception, RIEN n est ecrit');
  fs.writeFileSync(path.join(tmp, 'q.json'), JSON.stringify({ rewardPool: PARAMS.rewardPool, guardian: '0x' + '6a'.repeat(20) }));
  refuse = null; try { preparer(path.join(tmp, 'y.js'), { PARAMETRES: path.join(tmp, 'q.json') }); } catch (e) { refuse = String(e.stderr || e.message); }
  ok(refuse && /guardian differs from the v1 duels record/.test(refuse), 'A2 guardian different de v1 : exception');
  fs.writeFileSync(path.join(tmp, 'r.json'), JSON.stringify({ rewardPool: PARAMS.rewardPool }));
  preparer(path.join(tmp, 'z.js'), { PARAMETRES: path.join(tmp, 'r.json') });
  const { DUELS_V2_DEPLOIEMENT: Z } = await imp(path.join(tmp, 'z.js'));
  ok(Z.pret === false && Z.creation === null && JSON.stringify(Z.manquants) === '["guardian"]', 'A2 guardian absent : pret false, creation null, manquants ["guardian"]');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

console.log('— B. le refus de la page (duels-v2-config.js)');
const s0 = sha(octets);
ok(verifierEnregistrementV2(D, s0, V1).intacte === true, 'B la fiche du depot, intacte, egale a v1 : acceptee');
const falsifie = (patch, v1 = V1) => { const d = { ...D, constructeur: { ...D.constructeur }, ...patch }; return verifierEnregistrementV2(d, sha(Buffer.from(String(d.creation).slice(2), 'hex')), v1); };
ok(!falsifie({ creation: D.creation.slice(0, -2) + (D.creation.endsWith('d4') ? 'd5' : 'd4') }).intacte, 'B un octet change (le gardien) : refuse, meme avec une empreinte recalculee dessus');
ok(!verifierEnregistrementV2(D, s0.replace(/^./, (c) => (c === 'a' ? 'b' : 'a')), V1).intacte, 'B une empreinte qui ne correspond pas : refuse');
ok(!falsifie({ constructeur: { ...D.constructeur, rewardPool: '0x' + 'ab'.repeat(20) } }).intacte, 'B un rewardPool AFFICHE different de l encode : refuse');
ok(!falsifie({}, { ...V1, constructeur: { ...V1.constructeur, devWallet: '0x' + 'ab'.repeat(20) } }).intacte && /devWallet differs from the v1/.test(falsifie({}, { ...V1, constructeur: { ...V1.constructeur, devWallet: '0x' + 'ab'.repeat(20) } }).pourquoi.join()),
  'B des arguments differents de la fiche v1 : refuse (« differs from the v1 duels contract »)');
ok(!falsifie({ adresse: '0x' + 'cd'.repeat(20) }).intacte && !falsifie({ pret: false }).intacte && !falsifie({ contrat: 'BlockDuels' }).intacte && !falsifie({ chaine: 84532 }).intacte,
  'B deja deploye, pas prete, une fiche v1, une autre chaine : refuse');
ok(!verifierEnregistrementV2(V1, sha(Buffer.from(V1.creation.slice(2), 'hex')), V1).intacte, 'B la fiche v1 elle-meme n allume pas la page v2');

console.log('— C. la page');
const page = lire('deployer-duels-v2.html');
const script = (page.match(/<script type="module">([\s\S]*?)<\/script>/) || ['', ''])[1];
const envois = script.match(/eth_sendTransaction[^\n]*/g) || [];
ok(envois.length === 1 && /params: \[\{ from: compte, data: D\.creation \}\]/.test(envois[0]) && !/\bto:/.test(envois[0]) && !/value/.test(envois[0]), 'C UN seul envoi : la donnee figee, sans `to` ni valeur');
ok(/if \(!compte \|\| !intacte \|\| envoi \|\| adresse\) return;/.test(script) && /\$\('#bDeployer'\)\.disabled = !compte \|\| !intacte \|\| envoi \|\| !!adresse;/.test(script), 'C rien ne part sans wallet, verification verte, ni si deja deploye');
ok(/crypto\.subtle\.digest\('SHA-256', octets\)/.test(script) && /const v = verifierEnregistrementV2\(D, h, V1\);\s*intacte = v\.intacte;/.test(script) && /import \{ verifierEnregistrementV2 \} from '\.\/duels-v2-config\.js'/.test(script),
  'C empreinte RECALCULEE dans le navigateur ; la verification est celle testee ci-dessus, contre la fiche v1');
ok(/String\(chaine\)\.toLowerCase\(\) === CHAINE_HEX/.test(script) && /wallet_switchEthereumChain/.test(script), 'C la page exige Base avant d envoyer');
ok(/recu\.status !== '0x1' \|\| !recu\.contractAddress/.test(script) && ["'USDC()'", "'DEV_WALLET()'", "'REWARD_POOL()'", "'GUARDIAN()'", "'tokenOk(address)'", "'nextId()'", "'WINNER_BPS()'", "'POOL_BPS()'", "'SETTLE_WINDOW()'", "'settleDefault(uint256)'", "'eth_getCode'"].every((s) => script.includes(s))
  && /prochain === 1n/.test(script) && /parts\.fenetre === BigInt\(FENETRE\) && regleV2/.test(script), 'C apres confirmation : 4 adresses, tokenOk(USDC), nextId 1, 9000 / 700 bps, fenetre 256, settleDefault dans le code — relus');
ok(!/private|mnemonic|seed|signTypedData|personal_sign|eth_sign\b/i.test(script) && !/<input/i.test(page), 'C aucune cle, aucune signature de message, aucun champ a saisir');
ok(/won by default by the creator/.test(page) && /\+454\.4 USDC/.test(page) && /568 USDC/.test(page) && /test_V_DuelEV/.test(page) && /A tie <b>not<\/b> settled in the window goes to the creator by default/.test(page),
  'C la page dit CE QUI CHANGE (defaut au createur, egalite non reglee comprise) et POURQUOI (le PoC v1 : +454.4 / -568 USDC)');
ok(/No owner, no withdrawal, no pause, no upgrade, no fee change/.test(page) && /<meta name="robots" content="noindex">/.test(page), 'C aucun pouvoir au-dela de v1, dit ; noindex');
const cles = [...page.matchAll(/data-k="(\w+)"/g)].map((m) => m[1]);
ok(cles.length >= 4 && cles.every((k) => ['winner', 'pool', 'dev', 'window'].includes(k)) && Number(P.WINNER_BPS) === 9000 && P.FENETRE === 256, 'C chaque chiffre de la page est un data-k rempli depuis duels-plan.js (' + cles.length + ' emplacements)');

console.log('— D. la page est SERVIE, et tout ce qu elle importe aussi');
const srv = lire('serveur-web.js');
const bloc = srv.match(/const SERVIS\s*=\s*\[([\s\S]*?)\];/);
const servis = new Set(bloc ? [...bloc[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : []);
const importsDe = (t) => [...t.matchAll(/(?:^|\s)import\s+(?:[^'";]*?from\s*)?['"](\.\/[^'"]+)['"]/g)].map((m) => m[1].slice(2));
const vus = new Set(), manquants = [];
const suivre = (f, depuis) => { if (!servis.has(f)) { manquants.push(f + ' (importe par ' + depuis + ')'); return; } if (vus.has(f)) return; vus.add(f); for (const i of importsDe(lire(f))) suivre(i, f); };
suivre('deployer-duels-v2.html', 'temoin');
ok(manquants.length === 0 && ['duels-v2-deploiement.js', 'duels-v2-config.js', 'duels-config.js', 'duels-deploiement.js', 'duels-plan.js'].every((f) => vus.has(f)), 'D deployer-duels-v2.html et ses ' + (vus.size - 1) + ' modules sont servis' + (manquants.length ? ' -- MANQUANTS : ' + manquants.join(', ') : ''));
vus.clear(); manquants.length = 0;
suivre('duels-v2-plan.js', 'app.html');
ok(manquants.length === 0 && vus.has('temps-de-bloc.js') && vus.has('duels-plan-app.js'), 'D duels-v2-plan.js (importe par app.html et brain-jeu.js) et ses modules sont servis' + (manquants.length ? ' -- MANQUANTS : ' + manquants.join(', ') : ''));
const avant = manquants.length; suivre('ce-module-n-existe-pas.js', 'temoin');
ok(manquants.length === avant + 1, 'D temoin : un module absent de la liste EST signale');
console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions)');
if (ko) process.exitCode = 1;
