/* test-deployer-ticketpot-20261018.mjs — CE QUE PHIL SIGNERA pour deployer TicketPot, et la page qui le lui propose.
 *
 * Le deploiement est UNE transaction de creation, figee dans ticketpot-deploiement.js (generee par contracts/preparer-deploiement-ticketpot.mjs)
 * et proposee au wallet connecte par deployer-ticketpot.html. banc-ticketpot-fork envoie une donnee du MEME preparateur sur un fork.
 * A. l enregistrement du depot : usdc = USDC_BASE ; verifier/guardian = contracts/ticketpot-parametres.json (Phil) -- tant qu ils manquent :
 *    pret false, creation null, la liste des manquants ; il porte l empreinte de la SOURCE actuelle ; il se REGENERE a l identique ;
 *    adresse et bloc nuls. A2. avec des parametres complets (fichier temporaire) : pret true, l empreinte se recalcule, la donnee finit par
 *    les 3 arguments RE-ENCODES, elle commence par le bytecode compile ; des parametres refuses (guardian = verifier, verifier = wallet des
 *    frais, guardian nul) -> pret false.
 * B. le refus de la page (ticketpot-config.js verifierEnregistrement, la MEME fonction) : un octet change, une empreinte fausse, un verifier
 *    AFFICHE different, une longueur, un contrat deja deploye, un enregistrement pas pret, une autre chaine.
 * C. la page : UN seul envoi (la donnee figee, sans `to` ni valeur), apres un appui, un wallet connecte et une verification verte ; elle
 *    relit USDC, verifier, guardian, owner (= le signataire), les delais et le domaine EIP-712 ; aucune cle, aucun champ ; les durees
 *    viennent du module de plan ; le texte dit : aucun retrait, parts egales, close, 48 h, le verifier ne bouge pas de fonds.
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

const { TICKETPOT_DEPLOIEMENT: D } = await imp('ticketpot-deploiement.js');
const { encoderArgs, verifierEnregistrement, refusParametres, ORDRE_ARGS } = await imp('ticketpot-config.js');
const { USDC_BASE, FEE_WALLET } = await imp('frais-creation.js');
const P = await imp('ticketpot-plan.js');
const ARTEFACT = path.join(ICI, 'contracts/out/TicketPot.sol/TicketPot.json');
const PARAMS = JSON.parse(lire('contracts/ticketpot-parametres.json'));

console.log('— A. l enregistrement du depot');
ok(D.chaine === 8453 && D.contrat === 'TicketPot' && Object.isFrozen(D) && Object.isFrozen(D.constructeur) && JSON.stringify(D.ordre) === JSON.stringify(ORDRE_ARGS) && JSON.stringify(ORDRE_ARGS) === '["usdc","verifier","guardian"]',
  'A chaine 8453, contrat TicketPot, ordre (usdc, verifier, guardian) = ticketpot-config.js, objets figes');
ok(D.constructeur.usdc === USDC_BASE.toLowerCase() && D.feeWallet === FEE_WALLET.toLowerCase(), 'A usdc = USDC_BASE, feeWallet = FEE_WALLET (frais-creation.js), jamais tapes');
const phil = { verifier: /^0x[0-9a-fA-F]{40}$/.test(String(PARAMS.verifier || '')), guardian: /^0x[0-9a-fA-F]{40}$/.test(String(PARAMS.guardian || '')) };
if (!phil.verifier || !phil.guardian) {
  ok(D.pret === false && D.creation === null && D.sha256Creation === null && JSON.stringify(D.manquants) === JSON.stringify(['verifier', 'guardian'].filter((k) => !phil[k])),
    'A parametres de Phil incomplets (' + JSON.stringify(D.manquants) + ') : pret false, AUCUNE donnee de creation (rien a signer par erreur)');
} else ok(D.pret === true && D.constructeur.verifier === PARAMS.verifier.toLowerCase() && D.constructeur.guardian === PARAMS.guardian.toLowerCase(), 'A parametres de Phil remplis : pret, verifier et guardian = ticketpot-parametres.json');
ok(sha(lire('contracts/src/TicketPot.sol')) === D.sha256Sources['src/TicketPot.sol'], 'A generee depuis la source ACTUELLE du contrat (source modifiee sans regenerer = rouge)');
ok(D.adresse === null && D.bloc === null, 'A PAS deploye : adresse et bloc nuls (ils s ecrivent ENSEMBLE, relus sur la chaine)');
const preparer = (sortie, parametres) => execFileSync(process.execPath, ['preparer-deploiement-ticketpot.mjs'], { cwd: path.join(ICI, 'contracts'), env: { ...process.env, SORTIE: sortie, ...(parametres ? { PARAMETRES: parametres } : {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-dep-'));
let D2 = null;
try {
  if (fs.existsSync(ARTEFACT)) {
    preparer(path.join(tmp, 'meme.js'));
    ok(fs.readFileSync(path.join(tmp, 'meme.js'), 'utf8') === lire('ticketpot-deploiement.js'), 'A le preparateur relance regenere l enregistrement du depot a l IDENTIQUE (deterministe)');

    console.log('— A2. avec des parametres complets (fichier temporaire, adresses de test)');
    const V = '0x' + '5e'.repeat(20), G = '0x' + '6a'.repeat(20);
    fs.writeFileSync(path.join(tmp, 'p.json'), '﻿' + JSON.stringify({ verifier: V.toUpperCase().replace('0X', '0x'), guardian: G }));
    preparer(path.join(tmp, 'pret.js'), path.join(tmp, 'p.json'));
    ({ TICKETPOT_DEPLOIEMENT: D2 } = await imp(path.join(tmp, 'pret.js')));
    const octets = Buffer.from(D2.creation.slice(2), 'hex');
    ok(D2.pret === true && D2.constructeur.verifier === V && D2.constructeur.guardian === G, 'A2 pret ; un BOM et des majuscules dans le json ne sont pas une erreur (adresses en minuscules)');
    ok(octets.length === D2.octetsCreation && sha(octets) === D2.sha256Creation, 'A2 l empreinte sha256 de la donnee se recalcule (' + D2.sha256Creation.slice(0, 16) + '…, ' + D2.octetsCreation + ' octets)');
    ok(D2.creation.endsWith(encoderArgs(D2.constructeur)) && D2.octetsArgs === 96, 'A2 elle finit par les 3 arguments RE-ENCODES (96 octets)');
    const art = JSON.parse(fs.readFileSync(ARTEFACT, 'utf8'));
    ok(D2.creation === art.bytecode.object + encoderArgs(D2.constructeur), 'A2 donnee = bytecode compile + arguments, rien d autre');
    ok(octets.length - 96 <= 49152 && (art.deployedBytecode.object.length - 2) / 2 < 8192, 'A2 sous EIP-3860 ; runtime ' + (art.deployedBytecode.object.length - 2) / 2 + ' octets < 8 Ko');
    ok(JSON.stringify(D2.sha256Sources) === JSON.stringify(D.sha256Sources) && D2.feeWallet === D.feeWallet, 'A2 meme source et meme wallet des frais que l enregistrement du depot');
    for (const [nom, p, motif] of [['guardian = verifier', { verifier: V, guardian: V }, /own key/], ['verifier = wallet des frais', { verifier: FEE_WALLET, guardian: G }, /server key/], ['guardian nul', { verifier: V, guardian: '0x' + '0'.repeat(40) }, /guardian cannot be zero/], ['verifier nul', { verifier: '0x' + '0'.repeat(40), guardian: G }, /verifier cannot be zero/]]) {
      fs.writeFileSync(path.join(tmp, 'x.json'), JSON.stringify(p));
      preparer(path.join(tmp, 'x.js'), path.join(tmp, 'x.json'));
      const { TICKETPOT_DEPLOIEMENT: X } = await imp(path.join(tmp, 'x.js'));
      ok(X.pret === false && X.creation === null && X.refus.some((r) => motif.test(r)), 'A2 ' + nom + ' : pret false, creation null (' + X.refus.join('; ') + ')');
    }
  } else console.log('  (artefact forge absent : regeneration NON verifiee ici)');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

console.log('— B. le refus de la page (la meme fonction, ticketpot-config.js)');
ok(!verifierEnregistrement(D, 'x').intacte || D.pret, 'B l enregistrement du depot pas pret : refuse par la page');
if (D2) {
  const s2 = sha(Buffer.from(D2.creation.slice(2), 'hex'));
  const v0 = verifierEnregistrement(D2, s2);
  ok(v0.intacte && v0.pourquoi.length === 0, 'B un enregistrement pret et intact est accepte');
  const falsifie = (patch) => { const d = { ...D2, constructeur: { ...D2.constructeur }, ...patch }; return verifierEnregistrement(d, sha(Buffer.from(String(d.creation).slice(2), 'hex'))); };
  const dernier = D2.creation.slice(-2) === '6a' ? '6b' : '6a';
  ok(!falsifie({ creation: D2.creation.slice(0, -2) + dernier }).intacte, 'B un octet change dans la donnee (le guardian) : refuse, meme avec une empreinte recalculee dessus');
  ok(!verifierEnregistrement(D2, s2.replace(/^./, (c) => (c === 'a' ? 'b' : 'a'))).intacte, 'B une empreinte qui ne correspond pas : refuse');
  ok(!falsifie({ constructeur: { ...D2.constructeur, verifier: '0x' + 'ab'.repeat(20) } }).intacte, 'B un verifier AFFICHE different de l encode : refuse (la page ne peut pas dire une cle et en signer une autre)');
  ok(!falsifie({ creation: D2.creation + '00' }).intacte && !falsifie({ octetsArgs: 95 }).intacte, 'B une longueur qui ne correspond pas : refuse');
  ok(!falsifie({ adresse: '0x' + 'cd'.repeat(20) }).intacte, 'B un contrat deja deploye (adresse ecrite) : refuse (jamais un deuxieme par erreur)');
  ok(!falsifie({ pret: false }).intacte && !falsifie({ contrat: 'BlockRolls' }).intacte && !falsifie({ chaine: 84532 }).intacte, 'B pas pret, un autre contrat ou une autre chaine : refuse');
  ok(refusParametres({ usdc: D2.constructeur.usdc, verifier: D2.constructeur.verifier, guardian: D2.constructeur.verifier }).length === 1, 'B refusParametres : guardian = verifier refuse');
}

console.log('— C. la page');
const page = lire('deployer-ticketpot.html');
const script = (page.match(/<script type="module">([\s\S]*?)<\/script>/) || ['', ''])[1];
const envois = script.match(/eth_sendTransaction[^\n]*/g) || [];
ok(envois.length === 1 && /params: \[\{ from: compte, data: D\.creation \}\]/.test(envois[0]) && !/\bto:/.test(envois[0]) && !/value/.test(envois[0]), 'C UN seul envoi : la donnee figee, sans `to` ni valeur');
ok(/if \(!compte \|\| !intacte \|\| envoi \|\| adresse\) return;/.test(script) && /\$\('#bDeployer'\)\.disabled = !compte \|\| !intacte \|\| envoi \|\| !!adresse;/.test(script),
  'C rien ne part sans wallet connecte, ni si la verification est rouge, ni si un contrat est deja deploye');
ok(/if \(!D\.pret \|\| !D\.creation\) throw new Error\('not ready'\);/.test(script) && /Not ready: /.test(script), 'C un enregistrement pas pret n allume rien et dit ce qui manque');
ok(/crypto\.subtle\.digest\('SHA-256', octets\)/.test(script) && /const v = verifierEnregistrement\(D, h\);\s*intacte = v\.intacte;/.test(script) && /import \{ verifierEnregistrement \} from '\.\/ticketpot-config\.js'/.test(script),
  'C l empreinte est RECALCULEE dans le navigateur et la verification est CELLE testee ci-dessus (ticketpot-config.js)');
ok(/String\(chaine\)\.toLowerCase\(\) === CHAINE_HEX/.test(script) && /wallet_switchEthereumChain/.test(script), 'C la page exige Base avant d envoyer');
ok(/recu\.status !== '0x1' \|\| !recu\.contractAddress/.test(script) && ["'USDC()'", "'verifier()'", "'guardian()'", "'owner()'", "'GRACE()'", "'FUNDING_DELAY()'", "'ADMIN_DELAY()'", "'totalPots()'", "'domainSeparator()'"].every((s) => script.includes(s))
  && /owner === compte\.toLowerCase\(\)/.test(script) && /domaine === domaineSeparateur\(D\.chaine, a\)/.test(script), 'C apres confirmation, elle RELIT USDC, verifier, guardian, owner (= le signataire), les 3 delais, totalPots et le domaine EIP-712 du serveur');
ok(!/private|mnemonic|seed|signTypedData|personal_sign|eth_sign\b/i.test(script) && !/<input/i.test(page), 'C aucune cle, aucune signature de message, aucun champ a saisir');
const cles = [...page.matchAll(/data-k="(\w+)"/g)].map((m) => m[1]);
ok(cles.length >= 3 && cles.every((k) => ['fundingHours', 'graceDays', 'adminHours'].includes(k)) && /import \{ domaineSeparateur, GRACE_S, FUNDING_DELAY_S \} from '\.\/ticketpot-plan\.js'/.test(script)
  && P.GRACE_S / 86400 === 7 && P.FUNDING_DELAY_S / 3600 === 12, 'C chaque duree de la page est un data-k rempli depuis le module de plan (7 j, 12 h, 48 h) : ' + cles.length + ' emplacements');
const sol = lire('contracts/src/TicketPot.sol');
ok(/GRACE = 7 days;/.test(sol) && /FUNDING_DELAY = 12 hours;/.test(sol) && /ADMIN_DELAY = 48 hours;/.test(sol), 'C chaque duree annoncee est une constante du contrat');
ok(/No withdrawal, for anyone/.test(page) && /One claim per wallet per day/.test(page) && /it never holds or moves funds/.test(page) && /becomes the owner/.test(page) && /pot ÷ tickets/.test(page) && /rolls into the current day/.test(page),
  'C le texte dit : aucun retrait, un claim par wallet et par jour, le verifier ne bouge pas de fonds, l owner, parts egales, le reste roule');
ok(/<meta name="robots" content="noindex">/.test(page), 'C noindex');
const srv = lire('serveur-web.js');
console.log('  (serveur-web.js ' + (/deployer-ticketpot\.html/.test(srv) ? 'sert' : 'ne sert PAS encore') + ' la page : edite par le lead, non modifie ici ; a servir : deployer-ticketpot.html, ticketpot-deploiement.js, ticketpot-config.js, ticketpot-plan.js, keccak.js)');
console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions)');
process.exit(ko ? 1 : 0);
