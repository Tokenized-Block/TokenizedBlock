/* test-deployer-blockrolls-20261018.mjs — CE QUE PHIL SIGNERA pour deployer BlockRolls, et la page qui le lui propose.
 *
 * Le deploiement est UNE transaction de creation, figee dans blockrolls-deploiement.js (generee par contracts/preparer-deploiement-blockrolls.mjs)
 * et proposee au wallet connecte par deployer-blockrolls.html. banc-deployer-blockrolls-fork envoie cette meme donnee sur un fork.
 * A. l enregistrement : son empreinte se RECALCULE ; il finit par le Config RE-ENCODE depuis ses valeurs affichees ; chaque valeur est
 *    celle du depot (USDC_BASE, FEE_WALLET, HOOK_7030, poolIdDe, DEFAUTS) ; il porte l empreinte de la SOURCE actuelle ; il se REGENERE
 *    a l identique (le preparateur est relance vers un fichier temporaire et compare octet pour octet) ; adresse et bloc nuls ensemble.
 * B. le refus : la verification de la page (blockrolls-config.js verifierEnregistrement, la MEME fonction) refuse un enregistrement
 *    falsifie — un octet de la donnee, un prix affiche, une longueur, un contrat deja deploye.
 * C. la page : UN seul envoi (la donnee figee, sans `to` ni valeur), apres un appui, un wallet connecte et une verification verte ;
 *    les chiffres de la page sont DERIVES de l enregistrement (data-k), jamais tapes ; elle relit sur la chaine apres confirmation ;
 *    aucune cle, aucun champ a saisir ; le texte dit la fenetre de 256 blocs, Denim, le sequenceur, pas d owner, pas de remboursement.
 * ⛔ BORNE : rien ici ne prouve un deploiement reel ni un vrai wallet. La page n a PAS ete essayee avec un wallet connecte. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href + '?v=' + Math.random());
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const lire = (f) => fs.readFileSync(path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const { BLOCKROLLS_DEPLOIEMENT: D } = await imp('blockrolls-deploiement.js');
const { encoderConfig, verifierEnregistrement, ORDRE_CONFIG, usdc6, pct } = await imp('blockrolls-config.js');
const { USDC_BASE, FEE_WALLET } = await imp('frais-creation.js');
const { HOOK_7030 } = await imp('tokenomics.js');
const { poolIdDe } = await imp('volume-tirage.js');
const { FEE_POOL, TICK_SPACING_POOL } = await imp('lancer-pool.js');
const P = await imp('blockrolls-plan.js');

console.log('— A. l enregistrement');
const octets = Buffer.from(D.creation.slice(2), 'hex');
ok(/^0x[0-9a-f]+$/.test(D.creation) && octets.length === D.octetsCreation && sha(octets) === D.sha256Creation,
  'A l empreinte sha256 de la donnee se recalcule (' + D.sha256Creation.slice(0, 16) + '…, ' + D.octetsCreation + ' octets)');
const args = encoderConfig(D.constructeur);
ok(D.creation.endsWith(args) && args.length / 2 === D.octetsArgs && D.octetsArgs === 13 * 32, 'A elle finit par le Config RE-ENCODE depuis les valeurs affichees (13 mots = 416 octets)');
ok(JSON.stringify(D.ordre) === JSON.stringify(ORDRE_CONFIG) && Object.isFrozen(D) && Object.isFrozen(D.constructeur) && D.chaine === 8453 && D.contrat === 'BlockRolls', 'A chaine 8453, contrat BlockRolls, ordre des champs = blockrolls-config.js, objets figes');
const C = D.constructeur;
const ETH = '0x' + '0'.repeat(40);
ok(C.usdc === USDC_BASE.toLowerCase() && C.devWallet === FEE_WALLET.toLowerCase() && C.hook === HOOK_7030.toLowerCase(), 'A usdc = USDC_BASE, devWallet = FEE_WALLET (frais-creation.js), hook = HOOK_7030 (tokenomics.js)');
ok(C.unitPoolId === poolIdDe({ currency0: ETH, currency1: P.UNIT, fee: FEE_POOL, tickSpacing: TICK_SPACING_POOL, hooks: HOOK_7030 }) && C.unitPoolId === P.UNIT_POOL_ID, 'A unitPoolId = poolIdDe(ETH/UNIT, FEE_POOL, TICK_SPACING_POOL, hook) recalcule ici');
ok(C.rollPrice === P.DEFAUTS.rollPrice.toString() && C.passPrice === P.DEFAUTS.passPrice.toString() && C.passRolls === P.DEFAUTS.passRolls && C.passWindow === P.DEFAUTS.passWindowS && C.potShareBps === P.DEFAUTS.potShareBps
  && C.prize5 === P.DEFAUTS.prize5.toString() && C.prize4 === P.DEFAUTS.prize4.toString() && C.prize3 === P.DEFAUTS.prize3.toString() && C.minScore === P.DEFAUTS.minScore, 'A prix, parts et regles = DEFAUTS de blockrolls-plan.js');
ok(sha(lire('contracts/src/BlockRolls.sol')) === D.sha256Sources['src/BlockRolls.sol'], 'A generee depuis la source ACTUELLE du contrat (source modifiee sans regenerer = rouge)');
ok(D.adresse === null && D.bloc === null, 'A PAS deploye : adresse et bloc nuls (ils s ecrivent ENSEMBLE, relus sur la chaine)');
ok(octets.length - D.octetsArgs <= 49152 && octets.length > 5000, 'A le code de creation tient sous la limite EIP-3860 (49 152 octets)');
/* deterministe : le preparateur relance vers un fichier temporaire rend les MEMES octets */
if (fs.existsSync(path.join(ICI, 'contracts/out/BlockRolls.sol/BlockRolls.json'))) {
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'br-dep-')), 'blockrolls-deploiement.js');
  try {
    execFileSync(process.execPath, ['preparer-deploiement-blockrolls.mjs'], { cwd: path.join(ICI, 'contracts'), env: { ...process.env, SORTIE: tmp }, stdio: ['ignore', 'pipe', 'pipe'] });
    ok(fs.readFileSync(tmp, 'utf8') === lire('blockrolls-deploiement.js'), 'A le preparateur relance regenere l enregistrement a l IDENTIQUE (deterministe)');
  } catch (e) { ok(false, 'A le preparateur relance : ' + String(e.stderr || e.message).slice(0, 200)); }
  finally { fs.rmSync(path.dirname(tmp), { recursive: true, force: true }); }
} else console.log('  (artefact forge absent : regeneration NON verifiee ici)');

console.log('— B. le refus de la page (la meme fonction, blockrolls-config.js)');
const v0 = verifierEnregistrement(D, sha(octets));
ok(v0.intacte && v0.pourquoi.length === 0, 'B l enregistrement vrai est accepte');
const falsifie = (patch) => { const d = { ...D, constructeur: { ...D.constructeur }, ...patch }; return verifierEnregistrement(d, sha(Buffer.from(d.creation.slice(2), 'hex'))); };
const dernier = D.creation.slice(-2) === '03' ? '04' : '03';
ok(!falsifie({ creation: D.creation.slice(0, -2) + dernier }).intacte, 'B un octet change dans la donnee (le minScore) : refuse, meme avec une empreinte recalculee dessus');
ok(!verifierEnregistrement(D, sha(octets).replace(/^./, (c) => (c === 'a' ? 'b' : 'a'))).intacte, 'B une empreinte qui ne correspond pas : refuse');
ok(!falsifie({ constructeur: { ...D.constructeur, prize5: '6000000' } }).intacte, 'B un prix AFFICHE different de l encode : refuse (la page ne peut pas dire 6 et signer 5)');
ok(!falsifie({ constructeur: { ...D.constructeur, devWallet: '0x' + 'ab'.repeat(20) } }).intacte, 'B un wallet dev affiche different : refuse');
ok(!falsifie({ creation: D.creation + '00' }).intacte && !falsifie({ octetsArgs: 415 }).intacte, 'B une longueur qui ne correspond pas : refuse');
ok(!falsifie({ adresse: '0x' + 'cd'.repeat(20) }).intacte, 'B un contrat deja deploye (adresse ecrite) : refuse (jamais un deuxieme par erreur)');
ok(!falsifie({ contrat: 'BlockSkins' }).intacte && !falsifie({ chaine: 84532 }).intacte, 'B un autre contrat ou une autre chaine : refuse');

console.log('— C. la page');
const page = lire('deployer-blockrolls.html');
const script = (page.match(/<script type="module">([\s\S]*?)<\/script>/) || ['', ''])[1];
const envois = script.match(/eth_sendTransaction[^\n]*/g) || [];
ok(envois.length === 3 && /params: \[\{ from: compte, data: D\.creation \}\]/.test(envois[0]) && !/\bto:/.test(envois[0]) && !/value/.test(envois[0]),
  'C UN envoi de creation : la donnee figee, sans `to` ni valeur (les deux autres envois sont le fund facultatif : approve EXACT + fund)');
ok(/approve\(address,uint256\)'\) \+ adresse\.slice\(2\)\.padStart\(64, '0'\) \+ mot\(FONDS\)/.test(envois[1]) && /fund\(uint256\)'\) \+ mot\(FONDS\)/.test(envois[2]) && /const FONDS = 50_000_000n;/.test(script),
  'C le fund : approve EXACT du montant au contrat relu, puis fund du meme montant');
ok(/if \(!compte \|\| !intacte \|\| envoi \|\| adresse\) return;/.test(script) && /\$\('#bDeployer'\)\.disabled = !compte \|\| !intacte \|\| envoi \|\| !!adresse;/.test(script),
  'C rien ne part sans wallet connecte, ni si la verification est rouge, ni si un contrat est deja deploye');
ok(/crypto\.subtle\.digest\('SHA-256', octets\)/.test(script) && /const v = verifierEnregistrement\(D, h\);\s*intacte = v\.intacte;/.test(script) && /import \{ verifierEnregistrement, usdc6, pct \} from '\.\/blockrolls-config\.js'/.test(script),
  'C l empreinte est RECALCULEE dans le navigateur et la verification est CELLE testee ci-dessus (blockrolls-config.js)');
ok(/String\(chaine\)\.toLowerCase\(\) === CHAINE_HEX/.test(script) && /wallet_switchEthereumChain/.test(script), 'C la page exige Base avant d envoyer');
ok(/recu\.status !== '0x1' \|\| !recu\.contractAddress/.test(script) && /'USDC\(\)'/.test(script) && /'DEV_WALLET\(\)'/.test(script) && /'ROLL_PRICE\(\)'/.test(script) && /'PASS_PRICE\(\)'/.test(script) && /'unitCreator\(\)'/.test(script) && /'currentRules\(\)'/.test(script)
  && /every\(\(k\) => relu\[k\] === String\(C\[k\]\)\.toLowerCase\(\)\)/.test(script), 'C apres confirmation, elle RELIT USDC(), DEV_WALLET(), HOOK(), UNIT_POOL_ID(), ROLL_PRICE(), PASS_PRICE(), unitCreator(), currentRules() et compare');
ok(!/private|mnemonic|seed|signTypedData|personal_sign|eth_sign\b/i.test(script) && !/<input/i.test(page), 'C aucune cle, aucune signature de message, aucun champ a saisir');
/* les chiffres : DERIVES de l enregistrement. On rejoue la derivation et on verifie que chaque mot attendu a sa place (data-k) */
const mots = { roll: usdc6(C.rollPrice), potShare: pct(C.potShareBps), devShare: pct(10000 - C.potShareBps), prize5: usdc6(C.prize5), prize4: usdc6(C.prize4), prize3: usdc6(C.prize3), minScore: String(C.minScore),
  pass: usdc6(C.passPrice), passRolls: String(C.passRolls), passHours: String(C.passWindow / 3600), passPot: usdc6(BigInt(C.passPrice) * BigInt(C.potShareBps) / 10000n), passDev: usdc6(BigInt(C.passPrice) - BigInt(C.passPrice) * BigInt(C.potShareBps) / 10000n), window: '256' };
ok(mots.roll === '0.50' && mots.potShare === '50' && mots.devShare === '50' && mots.prize5 === '5' && mots.prize4 === '5' && mots.prize3 === '5' && mots.minScore === '3' && mots.pass === '10' && mots.passRolls === '30' && mots.passHours === '24' && mots.passPot === '5' && mots.passDev === '5',
  'C les mots derives de l enregistrement sont bien « 0.50 USDC roll, 50 % / 50 %, prix 5/5/5, score min 3, pass 10 = 5 + 5, 30 rolls, 24 h »');
const cles = [...page.matchAll(/data-k="(\w+)"/g)].map((m) => m[1]);
ok(Object.keys(mots).every((k) => cles.includes(k)) && cles.every((k) => k in mots) && /for \(const e of document\.querySelectorAll\('b\[data-k\]'\)\) e\.textContent = MOTS\[e\.dataset\.k\]/.test(script),
  'C chaque chiffre de la page est un data-k rempli depuis MOTS (derive de D.constructeur) : ' + cles.length + ' emplacements, aucun chiffre tape');
ok(!/0\.50 USDC|5 USDC for 5|10 USDC a pass/.test(page.replace(/<script[\s\S]*<\/script>/, '')), 'C aucun prix n est ecrit en dur dans le HTML (ils viennent de l enregistrement)');
ok(/No owner\. Nobody can take the pots/.test(page) && /No refund\./.test(page) && /about 8\.5 minutes today, about 51 seconds once Base moves to 200 ms blocks \(Denim\)/.test(page)
  && /the Base sequencer, which builds the blocks, is the one party that could/.test(page) && /only by the creator of UNIT as the TokenizedBlock hook names it/.test(page) && /at most 1000 USDC a prize, minimum score 3 to 5/.test(page),
  'C le texte dit : pas d owner, pas de remboursement, 256 blocs (8,5 min / 51 s Denim), le sequenceur, le createur de UNIT et ses bornes');
const sol = lire('contracts/src/BlockRolls.sol');
ok(/SETTLE_WINDOW = 256;/.test(sol) && /MAX_PRIZE = 1000_000000;/.test(sol) && /MIN_SCORE_FLOOR = 3;/.test(sol) && /BANDS = 6;/.test(sol) && /ORBITS = 10;/.test(sol) && /FACETS = 19;/.test(sol) && /MATERIALS = 9;/.test(sol) && /ORNAMENTS = 8;/.test(sol),
  'C chaque borne annoncee (256 blocs, 1000 USDC, score 3..5, 6/10/19/9/8) est une constante du contrat');
ok(/<meta name="robots" content="noindex">/.test(page) && /paid game of chance/.test(page), 'C noindex ; la page dit que c est un jeu d argent');
const srv = lire('serveur-web.js');
console.log('  (serveur-web.js ' + (/deployer-blockrolls\.html/.test(srv) ? 'sert' : 'ne sert PAS encore') + ' la page : il est edite par une autre session, non modifie ici ; a servir : deployer-blockrolls.html, blockrolls-deploiement.js, blockrolls-config.js, keccak.js)');
console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions)');
process.exit(ko ? 1 : 0);
