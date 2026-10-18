/* test-deployer-duels-20261018.mjs — CE QUE PHIL SIGNERA pour deployer BlockDuels, et la page qui le lui propose.
 *
 * Le deploiement est UNE transaction de creation, figee dans duels-deploiement.js (generee par contracts/preparer-deploiement-duels.mjs) et
 * proposee au wallet connecte par deployer-duels.html. banc-duels-fork envoie une donnee du MEME preparateur sur un fork.
 * A. l enregistrement du depot : usdc = USDC_BASE, devWallet = FEE_WALLET (frais-creation.js) = ceux de la fiche BlockRolls deployee ;
 *    rewardPool/guardian = contracts/duels-parametres.json (Phil) -- tant qu ils manquent : pret false, creation null, la liste des manquants ;
 *    il porte l empreinte de la SOURCE actuelle ; il se REGENERE a l identique ; adresse et bloc nuls. A2. avec des parametres complets
 *    (fichier temporaire) : pret true, l empreinte se recalcule, la donnee finit par les 4 arguments RE-ENCODES et commence par le bytecode
 *    compile ; des parametres refuses (rewardPool = dev, rewardPool nul, guardian = USDC) -> pret false.
 * B. le refus de la page (duels-config.js verifierEnregistrement, la MEME fonction) : un octet change, une empreinte fausse, un rewardPool
 *    AFFICHE different, une longueur, un contrat deja deploye, un enregistrement pas pret, une autre chaine.
 * C. la page : UN seul envoi (la donnee figee, sans `to` ni valeur), apres un appui, un wallet connecte et une verification verte ; elle
 *    relit USDC, DEV_WALLET, REWARD_POOL, GUARDIAN, tokenOk(USDC), nextId, WINNER_BPS, POOL_BPS ; aucune cle, aucun champ ; les chiffres
 *    viennent du module de plan ; noindex ; chaque module qu elle importe (transitivement) est dans SERVIS de serveur-web.js.
 * ⛔ BORNE : rien ici ne prouve un deploiement reel ni un vrai wallet. La page n a PAS ete essayee avec un wallet connecte. */
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

const { DUELS_DEPLOIEMENT: D } = await imp('duels-deploiement.js');
const { encoderArgs, verifierEnregistrement, refusParametres, ORDRE_ARGS } = await imp('duels-config.js');
const { USDC_BASE, FEE_WALLET } = await imp('frais-creation.js');
const { BLOCKROLLS_DEPLOIEMENT: BR } = await imp('blockrolls-deploiement.js');
const P = await imp('duels-plan.js');
const ARTEFACT = path.join(ICI, 'contracts/out/BlockDuels.sol/BlockDuels.json');
const PARAMS = JSON.parse(lire('contracts/duels-parametres.json'));

console.log('— A. l enregistrement du depot');
ok(D.chaine === 8453 && D.contrat === 'BlockDuels' && Object.isFrozen(D) && Object.isFrozen(D.constructeur) && JSON.stringify(D.ordre) === JSON.stringify(ORDRE_ARGS) && JSON.stringify(ORDRE_ARGS) === '["usdc","devWallet","rewardPool","guardian"]',
  'A chaine 8453, contrat BlockDuels, ordre (usdc, devWallet, rewardPool, guardian) = duels-config.js, objets figes');
ok(D.constructeur.usdc === USDC_BASE.toLowerCase() && D.constructeur.devWallet === FEE_WALLET.toLowerCase(), 'A usdc = USDC_BASE, devWallet = FEE_WALLET (frais-creation.js), jamais tapes');
ok(D.constructeur.usdc === BR.constructeur.usdc && D.constructeur.devWallet === BR.constructeur.devWallet && /^0x[0-9a-f]{40}$/.test(BR.adresse || ''),
  'A les MEMES usdc et devWallet que la fiche BlockRolls deployee (' + D.constructeur.devWallet + ')');
/* 2026-10-18 : rempli sur decision de Phil (rewardPool = Brain UNIT, guardian = dev) — le _lisez-moi dit d ou viennent les adresses */
ok('_lisez-moi' in PARAMS && /PHIL/i.test(PARAMS['_lisez-moi']), 'A duels-parametres.json porte un _lisez-moi qui nomme la decision de Phil');
const phil = { rewardPool: /^0x[0-9a-fA-F]{40}$/.test(String(PARAMS.rewardPool || '')), guardian: /^0x[0-9a-fA-F]{40}$/.test(String(PARAMS.guardian || '')) };
if (!phil.rewardPool || !phil.guardian) {
  ok(D.pret === false && D.creation === null && D.sha256Creation === null && JSON.stringify(D.manquants) === JSON.stringify(['rewardPool', 'guardian'].filter((k) => !phil[k])),
    'A parametres de Phil incomplets (' + JSON.stringify(D.manquants) + ') : pret false, AUCUNE donnee de creation (rien a signer par erreur)');
} else ok(D.pret === true && D.constructeur.rewardPool === PARAMS.rewardPool.toLowerCase() && D.constructeur.guardian === PARAMS.guardian.toLowerCase(), 'A parametres de Phil remplis : pret, rewardPool et guardian = duels-parametres.json');
ok(sha(lire('contracts/src/BlockDuels.sol')) === D.sha256Sources['src/BlockDuels.sol'], 'A generee depuis la source ACTUELLE du contrat (source modifiee sans regenerer = rouge)');
/* 2026-10-18 18:20 UTC : deploye par Phil (0x6b76…602c, bloc 52 778 966) ; adresse et bloc ecrits ENSEMBLE par noter-deploiement-duels */
ok((D.adresse === null && D.bloc === null) || (/^0x[0-9a-f]{40}$/.test(String(D.adresse)) && Number.isSafeInteger(D.bloc) && D.bloc > 0), 'A adresse et bloc : tous deux nuls, ou tous deux ecrits (jamais l un sans l autre)');
const preparer = (sortie, parametres) => execFileSync(process.execPath, ['preparer-deploiement-duels.mjs'], { cwd: path.join(ICI, 'contracts'), env: { ...process.env, SORTIE: sortie, ...(parametres ? { PARAMETRES: parametres } : {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'duels-dep-'));
let D2 = null;
const RP = '0x' + '70'.repeat(20), G = '0x' + '6a'.repeat(20);
try {
  ok(fs.existsSync(ARTEFACT), 'A artefact forge BlockDuels present (sinon la regeneration ne serait pas verifiee)');
  preparer(path.join(tmp, 'meme.js'));
  /* apres la signature, la fiche porte adresse + bloc (noter) ; le preparateur rend null : on compare tout SAUF ces deux lignes */
  const sansAdr = (t) => String(t).replace(/^[ \t]*adresse: [^\r\n]*/m, 'ADR').replace(/^[ \t]*bloc: [^\r\n]*/m, 'BLOC').replace(/\r\n/g, '\n');
  ok(sansAdr(fs.readFileSync(path.join(tmp, 'meme.js'), 'utf8')) === sansAdr(lire('duels-deploiement.js')), 'A le preparateur relance regenere l enregistrement du depot a l IDENTIQUE, hors adresse/bloc (deterministe)');

  console.log('— A2. avec des parametres complets (fichier temporaire, adresses de test)');
  fs.writeFileSync(path.join(tmp, 'p.json'), String.fromCharCode(0xfeff) + JSON.stringify({ rewardPool: RP, guardian: G.toUpperCase().replace('0X', '0x') }));
  preparer(path.join(tmp, 'pret.js'), path.join(tmp, 'p.json'));
  ({ DUELS_DEPLOIEMENT: D2 } = await imp(path.join(tmp, 'pret.js')));
  const octets = Buffer.from(D2.creation.slice(2), 'hex');
  ok(D2.pret === true && D2.constructeur.rewardPool === RP && D2.constructeur.guardian === G, 'A2 pret ; un BOM et des majuscules dans le json ne sont pas une erreur (adresses en minuscules)');
  ok(octets.length === D2.octetsCreation && sha(octets) === D2.sha256Creation, 'A2 l empreinte sha256 de la donnee se recalcule (' + D2.sha256Creation.slice(0, 16) + '…, ' + D2.octetsCreation + ' octets)');
  ok(D2.creation.endsWith(encoderArgs(D2.constructeur)) && D2.octetsArgs === 128, 'A2 elle finit par les 4 arguments RE-ENCODES (128 octets)');
  const art = JSON.parse(fs.readFileSync(ARTEFACT, 'utf8'));
  ok(D2.creation === art.bytecode.object + encoderArgs(D2.constructeur), 'A2 donnee = bytecode compile + arguments, rien d autre');
  ok(octets.length - 128 <= 49152 && (art.deployedBytecode.object.length - 2) / 2 < 24576, 'A2 sous EIP-3860 ; runtime ' + (art.deployedBytecode.object.length - 2) / 2 + ' octets < 24 Ko (EIP-170)');
  ok(JSON.stringify(D2.sha256Sources) === JSON.stringify(D.sha256Sources), 'A2 meme source que l enregistrement du depot');
  const Z = '0x' + '0'.repeat(40);
  for (const [nom, p, motif] of [['rewardPool = wallet dev', { rewardPool: FEE_WALLET, guardian: G }, /dev wallet/], ['rewardPool nul', { rewardPool: Z, guardian: G }, /rewardPool cannot be zero/], ['guardian nul', { rewardPool: RP, guardian: Z }, /guardian cannot be zero/], ['guardian = USDC', { rewardPool: RP, guardian: USDC_BASE }, /guardian must not be the USDC/], ['rewardPool = USDC', { rewardPool: USDC_BASE, guardian: G }, /rewardPool must not be the USDC/]]) {
    fs.writeFileSync(path.join(tmp, 'x.json'), JSON.stringify(p));
    preparer(path.join(tmp, 'x.js'), path.join(tmp, 'x.json'));
    const { DUELS_DEPLOIEMENT: X } = await imp(path.join(tmp, 'x.js'));
    ok(X.pret === false && X.creation === null && X.refus.some((r) => motif.test(r)), 'A2 ' + nom + ' : pret false, creation null (' + X.refus.join('; ') + ')');
  }
  fs.writeFileSync(path.join(tmp, 'y.json'), JSON.stringify({ rewardPool: RP }));
  preparer(path.join(tmp, 'y.js'), path.join(tmp, 'y.json'));
  const { DUELS_DEPLOIEMENT: Y } = await imp(path.join(tmp, 'y.js'));
  ok(Y.pret === false && JSON.stringify(Y.manquants) === '["guardian"]' && Y.creation === null, 'A2 guardian absent : pret false, manquants ["guardian"]');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

console.log('— B. le refus de la page (la meme fonction, duels-config.js)');
ok(!verifierEnregistrement(D, 'x').intacte || D.pret, 'B l enregistrement du depot pas pret : refuse par la page');
if (D2) {
  const s2 = sha(Buffer.from(D2.creation.slice(2), 'hex'));
  const v0 = verifierEnregistrement(D2, s2);
  ok(v0.intacte && v0.pourquoi.length === 0, 'B un enregistrement pret et intact est accepte');
  const falsifie = (patch) => { const d = { ...D2, constructeur: { ...D2.constructeur }, ...patch }; return verifierEnregistrement(d, sha(Buffer.from(String(d.creation).slice(2), 'hex'))); };
  const dernier = D2.creation.slice(-2) === '6a' ? '6b' : '6a';
  ok(!falsifie({ creation: D2.creation.slice(0, -2) + dernier }).intacte, 'B un octet change dans la donnee (le guardian) : refuse, meme avec une empreinte recalculee dessus');
  ok(!verifierEnregistrement(D2, s2.replace(/^./, (c) => (c === 'a' ? 'b' : 'a'))).intacte, 'B une empreinte qui ne correspond pas : refuse');
  ok(!falsifie({ constructeur: { ...D2.constructeur, rewardPool: '0x' + 'ab'.repeat(20) } }).intacte, 'B un rewardPool AFFICHE different de l encode : refuse (la page ne peut pas dire un pot et en signer un autre)');
  ok(!falsifie({ constructeur: { ...D2.constructeur, devWallet: '0x' + 'ab'.repeat(20) } }).intacte, 'B un devWallet AFFICHE different de l encode : refuse');
  ok(!falsifie({ creation: D2.creation + '00' }).intacte && !falsifie({ octetsArgs: 127 }).intacte, 'B une longueur qui ne correspond pas : refuse');
  ok(!falsifie({ adresse: '0x' + 'cd'.repeat(20) }).intacte, 'B un contrat deja deploye (adresse ecrite) : refuse (jamais un deuxieme par erreur)');
  ok(!falsifie({ pret: false }).intacte && !falsifie({ contrat: 'BlockRolls' }).intacte && !falsifie({ chaine: 84532 }).intacte, 'B pas pret, un autre contrat ou une autre chaine : refuse');
  ok(refusParametres({ ...D2.constructeur, rewardPool: D2.constructeur.devWallet }).length === 1, 'B refusParametres : rewardPool = dev refuse');
}

console.log('— C. la page');
const page = lire('deployer-duels.html');
const script = (page.match(/<script type="module">([\s\S]*?)<\/script>/) || ['', ''])[1];
const envois = script.match(/eth_sendTransaction[^\n]*/g) || [];
ok(envois.length === 1 && /params: \[\{ from: compte, data: D\.creation \}\]/.test(envois[0]) && !/\bto:/.test(envois[0]) && !/value/.test(envois[0]), 'C UN seul envoi : la donnee figee, sans `to` ni valeur');
ok(/if \(!compte \|\| !intacte \|\| envoi \|\| adresse\) return;/.test(script) && /\$\('#bDeployer'\)\.disabled = !compte \|\| !intacte \|\| envoi \|\| !!adresse;/.test(script),
  'C rien ne part sans wallet connecte, ni si la verification est rouge, ni si un contrat est deja deploye');
ok(/if \(!D\.pret \|\| !D\.creation\) throw new Error\('not ready'\);/.test(script) && /Not ready: /.test(script), 'C un enregistrement pas pret n allume rien et dit ce qui manque');
ok(/crypto\.subtle\.digest\('SHA-256', octets\)/.test(script) && /const v = verifierEnregistrement\(D, h\);\s*intacte = v\.intacte;/.test(script) && /import \{ verifierEnregistrement \} from '\.\/duels-config\.js'/.test(script),
  'C l empreinte est RECALCULEE dans le navigateur et la verification est CELLE testee ci-dessus (duels-config.js)');
ok(/String\(chaine\)\.toLowerCase\(\) === CHAINE_HEX/.test(script) && /wallet_switchEthereumChain/.test(script), 'C la page exige Base avant d envoyer');
ok(/recu\.status !== '0x1' \|\| !recu\.contractAddress/.test(script) && ["'USDC()'", "'DEV_WALLET()'", "'REWARD_POOL()'", "'GUARDIAN()'", "'tokenOk(address)'", "'nextId()'", "'WINNER_BPS()'", "'POOL_BPS()'"].every((s) => script.includes(s))
  && /prochain === 1n/.test(script) && /parts\.winner === WINNER_BPS && parts\.pool === POOL_BPS/.test(script), 'C apres confirmation, elle RELIT les 4 adresses, tokenOk(USDC), nextId = 1 et le partage 9000 / 700 bps');
ok(!/private|mnemonic|seed|signTypedData|personal_sign|eth_sign\b/i.test(script) && !/<input/i.test(page), 'C aucune cle, aucune signature de message, aucun champ a saisir');
const cles = [...page.matchAll(/data-k="(\w+)"/g)].map((m) => m[1]);
const attendus = ['minStake', 'minMinutes', 'maxDays', 'delay', 'winner', 'pool', 'dev', 'window'];
ok(attendus.every((k) => cles.includes(k)) && cles.every((k) => attendus.includes(k)), 'C chaque chiffre de la page est un data-k rempli depuis le module de plan (' + cles.length + ' emplacements)');
ok(Number(P.WINNER_BPS) / 100 === 90 && Number(P.POOL_BPS) / 100 === 7 && Number(P.BPS - P.WINNER_BPS - P.POOL_BPS) / 100 === 3 && P.MIN_EXPIRY / 60 === 10 && P.MAX_EXPIRY / 86400 === 7,
  'C les mots rendus : 90 % / 7 % / 3 %, 10 minutes, 7 jours (decision de Phil 2026-10-18)');
ok(/No owner, no withdrawal, no upgrade, no fee change/.test(page) && /refunded in full to both sides/.test(page) && /A tie returns both stakes in full, with no fee/.test(page) && /guardian can only admit or remove a token/.test(page) && /Base sequencer/.test(page),
  'C le texte dit : aucun owner / retrait / mise a jour / frais modifiables, remboursement a 256 blocs, egalite sans frais, le gardien, le sequenceur');
ok(/<meta name="robots" content="noindex">/.test(page), 'C noindex');

console.log('— D. la page est SERVIE, et tout ce qu elle importe aussi (sinon : 404, page morte)');
const srv = lire('serveur-web.js');
const bloc = srv.match(/const SERVIS\s*=\s*\[([\s\S]*?)\];/);
const servis = new Set(bloc ? [...bloc[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : []);
ok(servis.size > 20 && servis.has('app.html'), 'D la liste SERVIS est lue dans serveur-web.js (' + servis.size + ' entrees, app.html dedans)');
const importsDe = (t) => [...t.matchAll(/(?:^|\s)import\s+(?:[^'";]*?from\s*)?['"](\.\/[^'"]+)['"]/g)].map((m) => m[1].slice(2));
const vus = new Set(), manquants = [];
const suivre = (f, depuis) => { if (!servis.has(f)) { manquants.push(f + ' (importe par ' + depuis + ')'); return; } if (vus.has(f)) return; vus.add(f); for (const i of importsDe(lire(f))) suivre(i, f); };
suivre('deployer-duels.html', 'temoin');
ok(manquants.length === 0 && vus.has('duels-plan.js') && vus.has('blockrolls-plan.js') && vus.has('duels-deploiement.js') && vus.has('duels-config.js'),
  'D deployer-duels.html et ses ' + (vus.size - 1) + ' modules (transitivement) sont tous servis' + (manquants.length ? ' -- MANQUANTS : ' + manquants.join(', ') : ''));
const avant = manquants.length;
suivre('ce-module-n-existe-pas.js', 'temoin');
ok(manquants.length === avant + 1, 'D temoin : un module absent de la liste EST signale');
console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions)');
process.exit(ko ? 1 : 0);
