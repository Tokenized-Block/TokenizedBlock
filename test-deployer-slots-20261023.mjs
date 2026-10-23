/* test-deployer-slots-20261023.mjs — CE QUE LE PROPRIETAIRE SIGNERA pour deployer BlockSlots, et la page qui le lui propose.
 * A. la fiche (slots-deploiement.js, generee par contracts/preparer-deploiement-slots.mjs) : son empreinte se RECALCULE ; elle finit par le
 *    Config RE-ENCODE depuis ses valeurs affichees (20 mots) ; usdc / devWallet = ceux du depot ; prix, part et table = slots-parametres.json ;
 *    elle porte l empreinte de la SOURCE actuelle ; elle se REGENERE a l identique ; adresse et bloc nuls ensemble ; le preparateur REFUSE
 *    une table dont l esperance atteint la part du pot (lance sur des parametres trafiques, vers un fichier temporaire).
 * B. le refus de la page (slots-config.js verifierEnregistrement, la MEME fonction) : un octet, un prix affiche, une longueur, une adresse.
 * C. la page : UN envoi de creation (sans `to` ni valeur) apres un appui, un wallet et une verification verte ; elle relit USDC(),
 *    DEV_WALLET(), SPIN_PRICE(), POT_SHARE_BPS(), prizes() ; chaque chiffre vient d un data-k ; le texte dit pas d owner, pas de
 *    remboursement (et pourquoi), 256 blocs / Denim, le sequenceur, la garde d esperance.
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

const { SLOTS_DEPLOIEMENT: D } = await imp('slots-deploiement.js');
const { encoderConfig, verifierEnregistrement, ORDRE_CONFIG, usdc6, pct } = await imp('slots-config.js');
const { USDC_BASE, FEE_WALLET } = await imp('frais-creation.js');
const { BLOCKROLLS_DEPLOIEMENT: BR } = await imp('blockrolls-deploiement.js');
const S = await imp('slots-plan.js');
const P = JSON.parse(lire('contracts/slots-parametres.json'));

console.log('— A. la fiche');
const octets = Buffer.from(D.creation.slice(2), 'hex');
ok(/^0x[0-9a-f]+$/.test(D.creation) && octets.length === D.octetsCreation && sha(octets) === D.sha256Creation, 'A l empreinte sha256 se recalcule (' + D.sha256Creation.slice(0, 16) + '…, ' + D.octetsCreation + ' octets)');
const args = encoderConfig(D.constructeur);
ok(D.creation.endsWith(args) && args.length / 2 === D.octetsArgs && D.octetsArgs === 20 * 32, 'A elle finit par le Config RE-ENCODE (20 mots = 640 octets)');
ok(JSON.stringify(D.ordre) === JSON.stringify(ORDRE_CONFIG) && Object.isFrozen(D) && Object.isFrozen(D.constructeur) && D.chaine === 8453 && D.contrat === 'BlockSlots', 'A chaine 8453, contrat BlockSlots, ordre = slots-config.js, objets figes');
const C = D.constructeur;
ok(C.usdc === USDC_BASE.toLowerCase() && C.devWallet === FEE_WALLET.toLowerCase() && C.usdc === BR.constructeur.usdc && C.devWallet === BR.constructeur.devWallet, 'A usdc = USDC_BASE, devWallet = FEE_WALLET (frais-creation.js), les memes que BlockRolls deploye');
ok(C.spinPrice === String(P.spinPrice) && C.potShareBps === P.potShareBps && JSON.stringify(C.prizes) === JSON.stringify(P.prizes), 'A prix, part et table = contracts/slots-parametres.json');
ok(sha(lire('contracts/src/BlockSlots.sol')) === D.sha256Sources['src/BlockSlots.sol'], 'A generee depuis la source ACTUELLE du contrat');
ok(D.adresse === null && D.bloc === null, 'A pas deploye : adresse et bloc nuls ensemble');
ok(octets.length - D.octetsArgs <= 49152 && octets.length > 5000, 'A le code de creation tient sous EIP-3860 (49 152 octets)');
if (fs.existsSync(path.join(ICI, 'contracts/out/BlockSlots.sol/BlockSlots.json'))) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slots-dep-'));
  const tmp = path.join(dir, 'slots-deploiement.js');
  try {
    execFileSync(process.execPath, ['preparer-deploiement-slots.mjs'], { cwd: path.join(ICI, 'contracts'), env: { ...process.env, SORTIE: tmp }, stdio: ['ignore', 'pipe', 'pipe'] });
    ok(fs.readFileSync(tmp, 'utf8').replace(/\r\n/g, '\n') === lire('slots-deploiement.js'), 'A le preparateur relance regenere la fiche a l IDENTIQUE (deterministe)');
    /* une table trop genereuse (3 points -> 1 USDC) : le preparateur refuse, et n ecrit rien */
    const trop = path.join(dir, 'p.json'), sortie2 = path.join(dir, 'x.js');
    fs.writeFileSync(trop, JSON.stringify({ ...P, prizes: P.prizes.map((x, k) => (k === 3 || k === 4 ? '1200000' : x)) })); /* v2 : 1,2 USDC a 3 et 4 points -> ~0,28 > 0,25 */
    let refuse = false;
    try { execFileSync(process.execPath, ['preparer-deploiement-slots.mjs'], { cwd: path.join(ICI, 'contracts'), env: { ...process.env, SORTIE: sortie2, PARAMETRES: trop }, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { refuse = /expected payout must stay strictly under/.test(String(e.stderr)); }
    ok(refuse && !fs.existsSync(sortie2), 'A une table dont l esperance atteint la part du pot : le preparateur REFUSE et n ecrit rien');
  } catch (e) { ok(false, 'A le preparateur relance : ' + String(e.stderr || e.message).slice(0, 200)); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
} else console.log('  (artefact forge absent : regeneration NON verifiee ici)');

console.log('— B. le refus de la page');
ok(verifierEnregistrement(D, sha(octets)).intacte, 'B la fiche vraie est acceptee');
const falsifie = (patch) => { const d = { ...D, constructeur: { ...D.constructeur }, ...patch }; return verifierEnregistrement(d, sha(Buffer.from(d.creation.slice(2), 'hex'))); };
const dernier = D.creation.slice(-2) === '01' ? '02' : '01';
ok(!falsifie({ creation: D.creation.slice(0, -2) + dernier }).intacte, 'B un octet change dans la donnee (le dernier prix) : refuse, meme avec une empreinte recalculee');
ok(!verifierEnregistrement(D, sha(octets).replace(/^./, (c) => (c === 'a' ? 'b' : 'a'))).intacte, 'B une empreinte qui ne correspond pas : refuse');
ok(!falsifie({ constructeur: { ...D.constructeur, prizes: D.constructeur.prizes.map((x, k) => (k === 15 ? '999000000' : x)) } }).intacte, 'B un prix AFFICHE different de l encode : refuse');
ok(!falsifie({ constructeur: { ...D.constructeur, devWallet: '0x' + 'ab'.repeat(20) } }).intacte, 'B un wallet dev affiche different : refuse');
ok(!falsifie({ creation: D.creation + '00' }).intacte && !falsifie({ octetsArgs: 608 }).intacte, 'B une longueur qui ne correspond pas : refuse');
ok(!falsifie({ adresse: '0x' + 'cd'.repeat(20) }).intacte, 'B un contrat deja deploye : refuse');
ok(!falsifie({ contrat: 'BlockRolls' }).intacte && !falsifie({ chaine: 84532 }).intacte, 'B un autre contrat ou une autre chaine : refuse');
let jete = false; try { encoderConfig({ ...C, prizes: C.prizes.slice(0, 15) }); } catch (_) { jete = true; }
ok(jete, 'B une table de 15 prix ne s encode pas');

console.log('— C. la page');
const page = lire('deployer-slots.html');
const script = (page.match(/<script type="module">([\s\S]*?)<\/script>/) || ['', ''])[1];
const envois = script.match(/eth_sendTransaction[^\n]*/g) || [];
ok(envois.length === 3 && /params: \[\{ from: compte, data: D\.creation \}\]/.test(envois[0]) && !/\bto:/.test(envois[0]) && !/value/.test(envois[0]), 'C UN envoi de creation : la donnee figee, sans `to` ni valeur (+ le fund facultatif : approve EXACT + fund)');
ok(/approve\(address,uint256\)'\) \+ adresse\.slice\(2\)\.padStart\(64, '0'\) \+ mot\(FONDS\)/.test(envois[1]) && /fund\(uint256\)'\) \+ mot\(FONDS\)/.test(envois[2]), 'C le fund : approve EXACT du montant puis fund du meme montant');
ok(/if \(!compte \|\| !intacte \|\| envoi \|\| adresse\) return;/.test(script) && /\$\('#bDeployer'\)\.disabled = !compte \|\| !intacte \|\| envoi \|\| !!adresse;/.test(script), 'C rien ne part sans wallet, ni si la verification est rouge, ni si deja deploye');
ok(/crypto\.subtle\.digest\('SHA-256', octets\)/.test(script) && /const v = verifierEnregistrement\(D, h\);\s*intacte = v\.intacte;/.test(script) && /from '\.\/slots-config\.js'/.test(script), 'C l empreinte est RECALCULEE dans le navigateur, verification = slots-config.js');
ok(/String\(chaine\)\.toLowerCase\(\) === CHAINE_HEX/.test(script) && /wallet_switchEthereumChain/.test(script), 'C la page exige Base');
ok(['USDC()', 'DEV_WALLET()', 'SPIN_PRICE()', 'POT_SHARE_BPS()', 'prizes()'].every((s) => script.includes("'" + s + "'")) && /table\.join\(\) === C\.prizes\.map\(String\)\.join\(\)/.test(script), 'C apres confirmation, elle RELIT les 4 immuables et la table, et compare');
ok(!/private|mnemonic|seed|signTypedData|personal_sign|eth_sign\b/i.test(script) && !/<input/i.test(page), 'C aucune cle, aucune signature de message, aucun champ a saisir');
const ev = S.esperance(C.prizes, C.spinPrice);
const mots = { spin: usdc6(C.spinPrice), potShare: pct(C.potShareBps), devShare: pct(10000 - C.potShareBps), top: usdc6(C.prizes[15]), ev: usdc6(ev.brut), pWin: (ev.probGainBps / 100).toFixed(2), pMise: (ev.probMiseBps / 100).toFixed(2), window: '256', minutesNow: '8.5', secondsDenim: '51' };
ok(mots.spin === '0.50' && mots.potShare === '50' && mots.top === '5' && mots.ev === '0.127862' && mots.pWin === '21.05' && mots.pMise === '7.46', 'C les mots derives (v2) : spin 0.50, 50 %, jusqu a 5, esperance 0.127862, 21.05 % paient quelque chose, 7.46 % rendent la mise');
const cles = [...page.matchAll(/data-k="(\w+)"/g)].map((m) => m[1]);
ok(Object.keys(mots).every((k) => cles.includes(k)) && cles.every((k) => k in mots) && /for \(const e of document\.querySelectorAll\('b\[data-k\]'\)\) e\.textContent = MOTS\[e\.dataset\.k\]/.test(script), 'C chaque chiffre est un data-k rempli depuis la fiche (' + cles.length + ' emplacements)');
ok(/minutesNow: \(secondesFenetre\(2000\) \/ 60\)\.toFixed\(1\)/.test(script) && /secondsDenim: String\(Math\.round\(secondesFenetre\(200\)\)\)/.test(script), 'C les durees de la fenetre sont CALCULEES depuis les blocs (2 s et 200 ms)');
const html = page.replace(/<script[\s\S]*<\/script>/, '');
ok(!/0\.50 USDC|1000 USDC|0\.15/.test(html), 'C aucun prix ni esperance ecrit en dur dans le HTML');
ok(/No owner\. Nobody can take the pot/.test(page) && /No refund\./.test(page) && /A refund would let a player settle winners and take back losers/.test(page) && /once Base moves to 200 ms blocks \(Denim\)/.test(page)
  && /the Base sequencer, which builds the blocks, is the one party that could/.test(page) && /refuses to deploy a table whose average payout is not strictly below the share that enters the pot/.test(page), 'C le texte dit : pas d owner, pas de remboursement et pourquoi, Denim, le sequenceur, la garde d esperance');
ok(/<meta name="robots" content="noindex">/.test(page) && /paid game of chance/.test(page), 'C noindex ; la page dit que c est un jeu d argent');
console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions)');
process.exit(ko ? 1 : 0);
