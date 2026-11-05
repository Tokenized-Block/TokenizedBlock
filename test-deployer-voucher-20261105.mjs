/* test-deployer-voucher-20261105.mjs — la page deployer-voucher.html, sa fiche (voucher-deploiement.js) et ses verifications pures
 * (voucher-config.js), HORS reseau. L envoi reel sur un fork : banc-deployer-voucher-fork-20261105.mjs.
 * A. la fiche : empreinte recalculee ; generee depuis la source ACTUELLE ; le preparateur la REGENERE a l identique ; adresse/bloc nuls.
 * B. voucher-config.js : signataire colle (vide, court, zero, checksum faux, = deployeur : refuses) ; creationAvec ; verifierRelecture
 *    (le runtime de l artefact comme code) accepte le vrai, refuse chaque ecart ; verifierFiche.
 * C. la page : la donnee envoyee = creationAvec(D, signataire) via envoi-creation.js (aucun eth_sendTransaction dans la page) ; Deploy
 *    eteint sans signataire valide ; relectures + eth_getCode ; variables d env apres une relecture bonne seulement ; aucune cle ;
 *    le texte dit les pouvoirs de l owner, le point de confiance, et qu il n y a PAS de 2e etape sur BlockSkins.
 * D. la page est SERVIE, et tout ce qu elle importe aussi (serveur-web.js SERVIS).
 * MUTANTS : sur des COPIES de voucher-config.js et de la page ; chacun doit faire rougir au moins une assertion.
 * ⛔ BORNE : aucun reseau, aucun wallet, aucune cle. ⛔ PORTABLE : process.exitCode. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const abs = (m) => pathToFileURL(path.join(ICI, m)).href;
const lire = (f) => fs.readFileSync(path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const { VOUCHER_DEPLOIEMENT: D } = await import(abs('voucher-deploiement.js'));
const { keccak256Hex } = await import(abs('keccak.js'));
const DOSSIER = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-voucher-'));
let nCopies = 0;
async function chargerConfig(src) {
  const f = path.join(DOSSIER, 'voucher-config-' + (nCopies += 1) + '.mjs');
  fs.writeFileSync(f, src.split("from './keccak.js'").join("from '" + abs('keccak.js') + "'"));
  return import(pathToFileURL(f).href);
}
const ART = path.join(ICI, 'contracts/out/BlockSkinsVoucher.sol/BlockSkinsVoucher.json');
const art = fs.existsSync(ART) ? JSON.parse(fs.readFileSync(ART, 'utf8')) : null;
const RUNTIME = art ? String(art.deployedBytecode.object).toLowerCase() : null;

/* ── A. la fiche (hors mutants) ── */
const A = {};
{
  const o = Buffer.from(D.code.slice(2), 'hex');
  A['A1 empreinte sha256 du code recalculee (' + D.octetsCode + ' octets)'] = sha(o) === D.sha256Code && o.length === D.octetsCode;
  A['A2 generee depuis la source ACTUELLE de BlockSkinsVoucher.sol'] = sha(lire('contracts/src/BlockSkinsVoucher.sol')) === D.sha256Sources['src/BlockSkinsVoucher.sol'];
  A['A3 chaine 8453, contrat BlockSkinsVoucher, ordre [signer], adresse et bloc nuls, objet fige'] = D.chaine === 8453 && D.contrat === 'BlockSkinsVoucher' && JSON.stringify(D.ordre) === '["signer"]' && D.adresse === null && D.bloc === null && Object.isFrozen(D);
  A['A4 le code tient sous EIP-3860 (49 152 octets)'] = o.length <= 49152;
  if (art) {
    A['A5 keccakRuntime = keccak du runtime de l artefact'] = keccak256Hex(Buffer.from(RUNTIME.slice(2), 'hex')) === D.keccakRuntime;
    const tmp = path.join(DOSSIER, 'fiche.js');
    try {
      execFileSync(process.execPath, ['preparer-deploiement-voucher.mjs'], { cwd: path.join(ICI, 'contracts'), env: { ...process.env, SORTIE: tmp }, stdio: ['ignore', 'pipe', 'pipe'] });
      A['A6 le preparateur relance regenere la fiche a l IDENTIQUE'] = fs.readFileSync(tmp, 'utf8').replace(/\r\n/g, '\n') === lire('voucher-deploiement.js');
    } catch (e) { A['A6 le preparateur relance : ' + String(e.stderr || e.message).slice(0, 120)] = false; }
  } else console.log('  (artefact forge absent : A5/A6 NON verifies ici)');
}

const ADR_A = '0x' + 'a1'.repeat(20), DEPLOYEUR = '0x' + 'd0'.repeat(20), SIGNER = '0x' + '5e'.repeat(20);
async function scenarios(srcConfig, page) {
  const R = {};
  try {
    const V = await chargerConfig(srcConfig);
    /* B. signataire */
    const refus = (t, mot) => { const v = V.validerSignataire(t, { deployeur: DEPLOYEUR }); return !v.ok && String(v.pourquoi).includes(mot); };
    R['B1 signataire vide refuse'] = refus('', 'paste');
    R['B2 signataire de 39 caracteres refuse'] = refus(SIGNER.slice(0, 41), 'whole address');
    R['B3 adresse zero refusee'] = refus('0x' + '0'.repeat(40), 'zero');
    const cs = V.checksum('0x' + 'ab'.repeat(20));
    const faux = cs.replace(/[a-f]/, (c) => c.toUpperCase());
    R['B4 checksum EIP-55 faux refuse, juste accepte'] = refus(faux, 'checksum') && V.validerSignataire(cs).ok && cs !== cs.toLowerCase();
    R['B5 le wallet qui deploie refuse comme signataire'] = refus(DEPLOYEUR.toUpperCase().replace('0X', '0x'), 'dedicated');
    R['B6 checksum de l exemple EIP-55 (0x5aAeb6…)'] = V.checksum('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed') === '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
    let jete = false; try { V.creationAvec(D, '0x12'); } catch (_) { jete = true; }
    R['B7 creationAvec = code + abi.encode(signer), refuse une adresse invalide'] = V.creationAvec(D, SIGNER) === D.code + SIGNER.slice(2).padStart(64, '0') && jete && (V.creationAvec(D, SIGNER).length - 2) / 2 === D.octetsCode + 32;
    /* verifierRelecture : le runtime de l artefact comme code deploye */
    if (RUNTIME) {
      const mot = (a) => '0x' + a.slice(2).padStart(64, '0');
      const lu = { 'signer()': mot(SIGNER), 'owner()': mot(DEPLOYEUR), 'pendingOwner()': mot('0x' + '0'.repeat(40)), 'totalSupply()': '0x' + '0'.repeat(64), 'domainSeparator()': V.separateurAttendu(ADR_A) };
      const rel = (patch = {}, o = {}) => V.verifierRelecture(D, { adresse: ADR_A, code: RUNTIME, lu: { ...lu, ...patch }, signataire: SIGNER, deployeur: DEPLOYEUR, ...o });
      R['B8 relecture conforme acceptee'] = rel().bon;
      R['B9 signer() different refuse'] = !rel({ 'signer()': mot(DEPLOYEUR) }).bon;
      R['B10 owner() different refuse'] = !rel({ 'owner()': mot(SIGNER) }).bon;
      R['B11 pendingOwner() non vide refuse'] = !rel({ 'pendingOwner()': mot(SIGNER) }).bon;
      R['B12 totalSupply() = 1 refuse'] = !rel({ 'totalSupply()': '0x' + '1'.padStart(64, '0') }).bon;
      R['B13 domainSeparator() d une autre adresse refuse'] = !rel({ 'domainSeparator()': V.separateurAttendu(SIGNER) }).bon;
      R['B14 code different refuse'] = !rel({}, { code: RUNTIME.slice(0, -2) + (RUNTIME.slice(-2) === '00' ? '01' : '00') }).bon && !rel({}, { code: '0x' }).bon;
    }
    R['B15 verifierFiche : vraie acceptee ; empreinte, chaine, deja deployee refusees'] = V.verifierFiche(D, D.sha256Code).intacte && !V.verifierFiche(D, '0'.repeat(64)).intacte
      && !V.verifierFiche({ ...D, chaine: 84532 }, D.sha256Code).intacte && !V.verifierFiche({ ...D, adresse: ADR_A }, D.sha256Code).intacte;
    const env = V.variablesEnv(ADR_A, SIGNER);
    R['B16 variablesEnv : l adresse du contrat, la cle jamais (seulement son adresse)'] = env[0] === 'SHOPIFY_VOUCHER_CONTRACT=' + ADR_A && env[1].startsWith('SHOPIFY_VOUCHER_SIGNER_KEY=<') && env[1].includes(SIGNER);

    /* C. la page */
    const script = (page.match(/<script type="module">([\s\S]*?)<\/script>/) || ['', ''])[1];
    R['C1 la page n a AUCUN eth_sendTransaction : la creation part par envoi-creation.js'] = !/eth_sendTransaction/.test(script) && /from '\.\/envoi-creation\.js'/.test(script);
    R['C2 la donnee envoyee = creationAvec(D, signataire)'] = /E = envoiPour\(creationAvec\(D, signataire\)\);/.test(script) && /creerEnvoiCreation\(\{ eth, chaineHex: CHAINE_HEX, creation, cle: CLE, stockage \}\)/.test(script);
    R['C3 Deploy eteint sans wallet, fiche verte, signataire valide, et apres un envoi'] = /\$\('#bDeployer'\)\.disabled = !compte \|\| !intacte \|\| !signataire \|\| envoi \|\| !!adresse \|\| !E\.peutEnvoyer\(\);/.test(script)
      && /if \(!compte \|\| !intacte \|\| !signataire \|\| envoi \|\| adresse \|\| !E\.peutEnvoyer\(\)\) return;/.test(script);
    R['C4 le signataire est valide avec le wallet connecte comme deployeur'] = /validerSignataire\(\$\('#iSigner'\)\.value, \{ deployeur: compte \}\)/.test(script);
    R['C5 empreinte recalculee dans le navigateur, verifiee par verifierFiche'] = /crypto\.subtle\.digest\('SHA-256', octets\)/.test(script) && /const v = verifierFiche\(D, h\);/.test(script);
    R['C6 apres le recu : eth_getCode + LECTURES, verifierRelecture avec le wallet connecte'] = /method: 'eth_getCode', params: \[a, 'latest'\]/.test(script) && /for \(const \[nom, data\] of LECTURES\)/.test(script)
      && /verifierRelecture\(D, \{ adresse: a, code, lu, signataire, deployeur: compte \}\)/.test(script);
    R['C7 les variables d env ne s affichent qu apres une relecture BONNE (adresse du recu)'] = /if \(v\.bon\) \{\s*adresse = a;\s*\$\('#rEnv'\)\.textContent = variablesEnv\(a, signataire\)/.test(script) && /<div id="dEnv" hidden>/.test(page);
    R['C8 aucune cle, aucune signature de message'] = !/private|mnemonic|seed|signTypedData|personal_sign|eth_sign\b/i.test(script) && /Never paste the key itself/.test(page);
    R['C9 le champ du signataire se fige pendant et apres un envoi'] = /\$\('#iSigner'\)\.disabled = envoi \|\| !!tx \|\| !!adresse;/.test(script);
    R['C10 le texte : owner = qui deploie, ses 3 pouvoirs, ce qu il ne peut pas, le point de confiance'] = /The wallet that deploys becomes the owner/.test(page) && /change the signer address/.test(page) && /cancel an order that was never claimed/.test(page)
      && /The owner cannot mint, cannot move anyone's token, and holds no funds/.test(page) && /The trust point, said plainly/.test(page);
    R['C11 le texte : PAS de 2e signature sur BlockSkins (et pourquoi), l app ne montre pas encore ces skins'] = /No second signature on BlockSkins/.test(page) && /BlockSkins has no minter role to grant/.test(page) && /the app does not display it yet/.test(page);
    R['C12 noindex'] = /<meta name="robots" content="noindex">/.test(page);
  } catch (e) { R['(exception) ' + String(e && e.message).slice(0, 100)] = false; }
  return R;
}

/* ── D. servie (hors mutants) ── */
{
  const srv = lire('serveur-web.js');
  const bloc = srv.match(/const SERVIS\s*=\s*\[([\s\S]*?)\];/);
  const servis = new Set(bloc ? [...bloc[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : []);
  const importsDe = (t) => [...t.matchAll(/(?:^|\s)import\s+(?:[^'";]*?from\s*)?['"](\.\/[^'"]+)['"]/g)].map((m) => m[1].slice(2));
  const vus = new Set(), manquants = [];
  const suivre = (f, depuis) => { if (!servis.has(f)) { manquants.push(f + ' (importe par ' + depuis + ')'); return; } if (vus.has(f)) return; vus.add(f); for (const i of importsDe(lire(f))) suivre(i, f); };
  suivre('deployer-voucher.html', 'temoin');
  A['D1 deployer-voucher.html et ses ' + (vus.size - 1) + ' modules sont servis' + (manquants.length ? ' -- MANQUANTS : ' + manquants.join(', ') : '')] = manquants.length === 0 && ['voucher-deploiement.js', 'voucher-config.js', 'envoi-creation.js', 'keccak.js', 'frais-creation.js'].every((f) => vus.has(f));
  const avant = manquants.length; suivre('ce-module-n-existe-pas.js', 'temoin');
  A['D2 temoin : un module absent de la liste EST signale'] = manquants.length === avant + 1;
}

let n = 0, ko = 0;
const SRC = lire('voucher-config.js'), PAGE = lire('deployer-voucher.html');
const R = { ...A, ...(await scenarios(SRC, PAGE)) };
for (const [k, v] of Object.entries(R)) { n += 1; if (v) console.log('ok  ' + k); else { ko += 1; console.log('KO  ' + k); } }

const remplacer = (s, a, b) => { if (!s.includes(a)) throw new Error('mutant sans cible : ' + a.slice(0, 60)); return s.split(a).join(b); };
const MUTANTS = [
  ['config', 'checksum ignore', "checksum(t) !== t) return", 'false) return'],
  ['config', 'adresse zero acceptee', "if (a === ZERO) return { ok: false, adresse: null, pourquoi: 'the zero address cannot sign' };", ''],
  ['config', 'deployeur accepte comme signataire', 'if (deployeur && a === String(deployeur).toLowerCase())', 'if (false)'],
  ['config', 'signer encode sur 20 octets', "return D.code + v.adresse.slice(2).padStart(64, '0');", "return D.code + v.adresse.slice(2);"],
  ['config', 'code deploye non compare', "ecarts.push('deployed code differs from the compiled runtime');", ';'],
  ['config', 'signer non compare', "ecarts.push('signer() differs');", ';'],
  ['config', 'owner non compare', "ecarts.push('owner() is not the deploying wallet');", ';'],
  ['config', 'pendingOwner non compare', "ecarts.push('pendingOwner() is not empty');", ';'],
  ['config', 'totalSupply non compare', "ecarts.push('totalSupply() is not 0');", ';'],
  ['config', 'domainSeparator non compare', "ecarts.push('domainSeparator() differs');", ';'],
  ['config', 'empreinte de la fiche ignoree', "if (sha256Code !== D.sha256Code) pourquoi.push('fingerprint differs');", ''],
  ['config', 'fiche deja deployee acceptee', "if (D && D.adresse) pourquoi.push('already deployed');", ''],
  ['config', 'la cle dans les variables', "'SHOPIFY_VOUCHER_SIGNER_KEY=<the private key of ' + String(signataire).toLowerCase()", "'SHOPIFY_VOUCHER_SIGNER_KEY=' + 'x'"],
  ['page', 'Deploy sans signataire', '!compte || !intacte || !signataire || envoi || !!adresse', '!compte || !intacte || envoi || !!adresse'],
  ['page', 'env avant relecture', 'if (v.bon) {\n    adresse = a;', '{\n    adresse = a;'],
  ['page', 'envoi du code sans signataire', 'E = envoiPour(creationAvec(D, signataire));', 'E = envoiPour(D.code);'],
  ['page', 'deployeur non passe a la validation', "validerSignataire($('#iSigner').value, { deployeur: compte })", "validerSignataire($('#iSigner').value, {})"],
];
let tues = 0;
for (const [ou, nom, a, b] of MUTANTS) {
  let rouges = [];
  try {
    const Rm = await scenarios(ou === 'config' ? remplacer(SRC, a, b) : SRC, ou === 'page' ? remplacer(PAGE, a, b) : PAGE);
    rouges = Object.entries(Rm).filter(([, v]) => !v).map(([k]) => k);
  } catch (e) { rouges = ['(chargement) ' + String(e && e.message).slice(0, 80)]; }
  n += 1;
  if (rouges.length) { tues += 1; console.log('ok  mutant tue : ' + nom + ' -> ' + rouges.slice(0, 2).join(', ')); } else { ko += 1; console.log('KO  mutant VIVANT : ' + nom); }
}
try { fs.rmSync(DOSSIER, { recursive: true, force: true }); } catch (_) { /* dossier temporaire du banc */ }
console.log((ko ? 'ECHEC ' : 'OK ') + (n - ko) + '/' + n + ', mutants ' + tues + '/' + MUTANTS.length
  + ' tues - NE PROUVE PAS la page dans un navigateur ni un vrai wallet (envoi sur fork : banc-deployer-voucher-fork-20261105.mjs)');
if (ko) process.exitCode = 1;
