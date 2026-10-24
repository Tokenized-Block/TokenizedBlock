/* banc-rolls-regles-anvil-20261024.mjs — LES REGLES VIVANTES DE BLOCKROLLS DE BOUT EN BOUT, sur le BYTECODE SIGNE, a SON adresse, sur un anvil
 *   LOCAL (aucun reseau, rien ne touche Base). Usage : (dans contracts/) forge build ; node banc-rolls-regles-anvil-20261024.mjs [port]
 *   Le banc lance anvil lui-meme (--chain-id 8453), l arrete a la fin et efface le dossier ~/.foundry/anvil/tmp qu il a cree.
 * DECOR (lu dans les fichiers, jamais tape) : la fiche blockrolls-deploiement.js donne la `creation` signee (bytecode + arguments du
 *   constructeur : USDC, DEV_WALLET, HOOK 7030, UNIT_POOL_ID, prix, regles), l adresse et le signataire (commentaire de la fiche). A l adresse
 *   USDC de la fiche : le runtime de UsdcT (contracts/test/BlockRolls.t.sol) ; a l adresse du HOOK : HookStub, ou createurs(UNIT_POOL_ID) rend le
 *   compte anvil #1 (le « createur de UNIT » du banc). Le nonce du signataire qui donne l adresse de la fiche est CHERCHE (adresse CREATE
 *   recalculee), puis la creation est envoyee depuis ce compte impersonne : le contrat deploye EST celui de la fiche, a la meme adresse.
 * DEROULE : 1. serveur-web.js lance contre cet anvil : /api/tirage sert currentRules version 1 (= le constructeur), unitCreator = #1, MAX_PRIZE ;
 *   2. un AUTRE compte appelle setRules : refuse (NotCreator, statut 0x0), rien ne change ; 3. #1 appelle setRules(7, 4, 2, 1 USDC, min 3) :
 *   rulesVersion 2 ; le serveur sert les NOUVELLES regles (au plus 30 s + une requete) — la fiche, elle, dit toujours 5/3/1/0,50 ;
 *   4. rolls-regles.js lireReglesRolls (le lecteur de l app) lit la meme chose directement ; 5. un roll cree AVANT le changement garde la
 *   version 1 (rolls(id).rulesVersion), un roll d apres la version 2 : « un changement ne vaut que pour les rolls d apres ».
 * NE PROUVE PAS : Base (sequenceur, noeuds publics) ; le vrai hook 7030 (un stub rend le createur) ; le vide du pot par setRules + rolls
 *   (PoC forge contracts/test/AuditRollsDuels20261024.t.sol test_V_SetRulesDrain, qui controle le hash). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href);
const { selecteur, keccak256Hex } = await imp('keccak.js');
const { BLOCKROLLS_DEPLOIEMENT: D } = await imp('blockrolls-deploiement.js');
/* le lecteur de l app (absent avant le correctif : le banc tourne quand meme, l etape 4 rougit) ; les lectures du banc lui-meme sont a part */
const R = await imp('rolls-regles.js').catch(() => null);
const B = { appelCreateur: () => selecteur('unitCreator()'), appelVersion: () => selecteur('rulesVersion()'),
  lireAdresse: (h) => (/^0x[0-9a-f]{64}$/i.test(String(h)) ? '0x' + String(h).slice(-40).toLowerCase() : null), lireVersion: (h) => (/^0x[0-9a-f]{64}$/i.test(String(h)) ? Number(BigInt(h)) : null) };
const PORT = Number(process.argv[2]) || 9617;
const URL_RPC = 'http://127.0.0.1:' + PORT;
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (!c) ko++; console.log((c ? '  ok  ' : '  KO  ') + m); };
const art = (f, c) => JSON.parse(fs.readFileSync(path.join(ICI, 'contracts', 'out', f, c + '.json'), 'utf8'));
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const hexOct = (h) => Uint8Array.from(Buffer.from(String(h).replace(/^0x/, ''), 'hex'));
let idr = 0;
const rpc = async (method, params = []) => {
  const r = await fetch(URL_RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idr, method, params }) }).then((x) => x.json());
  if (r.error) throw new Error(method + ': ' + (r.error.message || JSON.stringify(r.error)));
  return r.result;
};
const attendreRecu = async (h) => { let r = null; for (let k = 0; k < 100 && !r; k++) { r = await rpc('eth_getTransactionReceipt', [h]); if (!r) await new Promise((o) => setTimeout(o, 100)); } return r; };
const envoyer = async (from, to, data) => attendreRecu(await rpc('eth_sendTransaction', [{ from, ...(to ? { to } : {}), data, gas: '0x' + (8_000_000).toString(16) }]));

/* anvil : lance ICI, arrete a la fin ; son dossier tmp neuf est efface */
const ANVIL = path.join(os.homedir(), '.foundry', 'bin', process.platform === 'win32' ? 'anvil.exe' : 'anvil');
const TMP = path.join(os.homedir(), '.foundry', 'anvil', 'tmp');
const avant = new Set(fs.existsSync(TMP) ? fs.readdirSync(TMP) : []);
const anvil = spawn(ANVIL, ['--port', String(PORT), '--chain-id', '8453', '--silent'], { stdio: 'ignore' });
let serveur = null, vol = null;
const fin = () => {
  try { if (serveur) serveur.kill(); } catch (_) {}
  try { anvil.kill(); } catch (_) {}
  try { if (vol) fs.rmSync(vol, { recursive: true, force: true }); } catch (_) {}
  setTimeout(() => { try { if (fs.existsSync(TMP)) for (const d of fs.readdirSync(TMP)) if (!avant.has(d)) fs.rmSync(path.join(TMP, d), { recursive: true, force: true }); } catch (_) {} }, 1500);
};
try {
  let pret = false; for (let k = 0; k < 100 && !pret; k++) { try { pret = (await rpc('eth_chainId')) === '0x2105'; } catch (_) { await new Promise((o) => setTimeout(o, 200)); } }
  ok(pret, 'anvil local pret, chainId 8453 (port ' + PORT + ')');
  const comptes = await rpc('eth_accounts');
  const CREATEUR = comptes[1].toLowerCase(), AUTRE = comptes[2].toLowerCase(), JOUEUR = comptes[3].toLowerCase();
  const k = D.constructeur, ROLLS = String(D.adresse).toLowerCase();
  const signataire = (/signed by (0x[0-9a-f]{40})/i.exec(fs.readFileSync(path.join(ICI, 'blockrolls-deploiement.js'), 'utf8')) || [])[1];
  ok(/^0x[0-9a-f]{40}$/i.test(String(signataire)), 'le signataire est lu dans la fiche (' + signataire + ')');
  /* le decor : UsdcT a l adresse USDC de la fiche, HookStub a l adresse du hook, createurs(UNIT_POOL_ID) = CREATEUR (slot du mapping c = 0) */
  await rpc('anvil_setCode', [k.usdc, art('BlockRolls.t.sol', 'UsdcT').deployedBytecode.object]);
  await rpc('anvil_setCode', [k.hook, art('BlockRolls.t.sol', 'HookStub').deployedBytecode.object]);
  await rpc('anvil_setStorageAt', [k.hook, keccak256Hex(hexOct(String(k.unitPoolId).slice(2) + mot(0))), '0x' + mot(BigInt(CREATEUR))]);
  /* le nonce qui donne l adresse de la fiche : CREATE = keccak(rlp([signataire, nonce]))[12:] */
  const rlpN = (x) => (x === 0 ? '80' : x < 0x80 ? x.toString(16).padStart(2, '0') : (() => { let h = x.toString(16); if (h.length % 2) h = '0' + h; return (0x80 + h.length / 2).toString(16) + h; })());
  let nonce = -1;
  for (let x = 0; x < 100000 && nonce < 0; x++) { const corps = '94' + signataire.slice(2).toLowerCase() + rlpN(x); if (keccak256Hex(hexOct((0xc0 + corps.length / 2).toString(16) + corps)).slice(-40) === ROLLS.slice(2)) nonce = x; }
  ok(nonce >= 0, 'nonce du signataire qui donne ' + ROLLS + ' : ' + nonce + ' (recalcule)');
  await rpc('anvil_setNonce', [signataire, '0x' + nonce.toString(16)]);
  await rpc('anvil_setBalance', [signataire, '0x' + (10n ** 18n).toString(16)]);
  await rpc('anvil_impersonateAccount', [signataire]);
  const rd = await envoyer(signataire, null, D.creation);
  await rpc('anvil_stopImpersonatingAccount', [signataire]);
  ok(rd && rd.status === '0x1' && String(rd.contractAddress).toLowerCase() === ROLLS, 'la creation SIGNEE de la fiche, deployee a son adresse (' + (rd && rd.contractAddress) + ')');
  const appel = async (data) => rpc('eth_call', [{ to: ROLLS, data }, 'latest']);
  ok(B.lireAdresse(await appel(B.appelCreateur())) === CREATEUR, 'unitCreator() = le compte que le hook nomme (' + CREATEUR + ')');

  /* 1. le serveur contre cet anvil */
  vol = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-rolls-regles-anvil-'));
  const portS = 30000 + Math.floor(Math.random() * 15000);
  const env = { ...process.env, NODE_OPTIONS: '', PORT: String(portS), BASE_RPC: URL_RPC, BASE_RPC_LECTURE: URL_RPC, RAILWAY_VOLUME_MOUNT_PATH: vol, TB_NOS_CREATEURS: '', TB_REPLIS: '0' };
  delete env.SLOTS_KEEPER_KEY; delete env.TB_RPC_TEST; delete env.BASE_RPC_ARCHIVE;
  serveur = spawn(process.execPath, [process.env.SERVEUR_MODULE || path.join(ICI, 'serveur-web.js')], { cwd: ICI, stdio: 'ignore', env });
  const SRV = 'http://127.0.0.1:' + portS;
  let up = false; for (let i = 0; i < 120 && !up; i++) { try { up = (await fetch(SRV + '/sante', { signal: AbortSignal.timeout(2000) })).ok; } catch (_) { await new Promise((o) => setTimeout(o, 500)); } }
  ok(up, 'serveur-web.js demarre contre l anvil');
  const tirage = async () => { try { return (await (await fetch(SRV + '/api/tirage', { signal: AbortSignal.timeout(20000) })).json()).rolls; } catch (_) { return null; } };
  const attendre = async (f, s) => { let r = null; for (let i = 0; i < s; i++) { r = await tirage(); if (r && f(r)) return r; await new Promise((o) => setTimeout(o, 1000)); } return r; };
  const r1 = await attendre((r) => r.regles && r.regles.version === 1, 40);
  const fiche = [k.prize5, k.prize4, k.prize3, k.prize2].map(String).join();
  ok(r1 && r1.regles && r1.regles.version === 1 && r1.prizes.join() === fiche && r1.minScore === Number(k.minScore) && r1.regles.createur === CREATEUR && r1.regles.maxPrize === '1000000000',
    '1. /api/tirage : currentRules version 1 = le constructeur (' + (r1 && r1.prizes) + ', min ' + (r1 && r1.minScore) + '), createur, MAX_PRIZE 1000 USDC — lus sur le contrat');
  /* un roll AVANT le changement (version 1) */
  const usdcT = k.usdc; /* UsdcT : mint ouvert a tous (decor du banc) */
  const r0 = await envoyer(JOUEUR, usdcT, selecteur('mint(address,uint256)') + mot(BigInt(JOUEUR)) + mot(10e6));
  const ra = await envoyer(JOUEUR, usdcT, selecteur('approve(address,uint256)') + mot(BigInt(ROLLS)) + mot(10e6));
  const rr1 = await envoyer(JOUEUR, ROLLS, selecteur('roll(uint8[5])') + [0, 0, 0, 0, 0].map(mot).join(''));
  ok(r0.status === '0x1' && ra.status === '0x1' && rr1.status === '0x1', 'un roll paye AVANT le changement (0.50 USDC, compte #3)');
  /* 2. un autre compte : refuse */
  const sr = selecteur('setRules(uint64,uint64,uint64,uint64,uint8)') + [7e6, 4e6, 2e6, 1e6, 3].map(mot).join('');
  const rAutre = await envoyer(AUTRE, ROLLS, sr);
  ok(rAutre && rAutre.status === '0x0' && B.lireVersion(await appel(B.appelVersion())) === 1, '2. setRules par un AUTRE compte : refuse (statut 0x0), rulesVersion reste 1');
  /* 3. le createur de UNIT change les regles */
  const rCr = await envoyer(CREATEUR, ROLLS, sr);
  ok(rCr && rCr.status === '0x1' && B.lireVersion(await appel(B.appelVersion())) === 2, '3. setRules(7, 4, 2, 1 USDC, min 3) par le createur de UNIT : rulesVersion 2');
  const r2 = await attendre((r) => r.regles && r.regles.version === 2, 60);
  ok(r2 && r2.prizes && r2.prizes.join() === '7000000,4000000,2000000,1000000' && r2.minScore === 3 && r2.regles.version === 2,
    '3. /api/tirage sert les NOUVELLES regles (' + (r2 && r2.prizes) + ', min ' + (r2 && r2.minScore) + ') ; la fiche dit toujours ' + fiche + ', min ' + k.minScore);
  /* 4. le lecteur de l app, directement */
  const l = R ? await R.lireReglesRolls({ rpc, contrat: ROLLS }).catch(() => null) : null;
  ok(l && l.version === 2 && l.prizes.join() === '7000000,4000000,2000000,1000000' && l.minScore === 3 && l.createur === CREATEUR, '4. rolls-regles.js lireReglesRolls lit la meme chose (version 2, createur)');
  /* 5. un roll APRES : version 2 ; celui d avant garde la 1 — rolls(id) : (player, targetBlock, state, packed, rulesVersion) */
  const rr2 = await envoyer(JOUEUR, ROLLS, selecteur('roll(uint8[5])') + [0, 0, 0, 0, 0].map(mot).join(''));
  const versionDuRoll = async (id) => { const h = String(await appel(selecteur('rolls(uint256)') + mot(id))).slice(2); return h.length >= 320 ? Number(BigInt('0x' + h.slice(256, 320))) : null; };
  const v1 = await versionDuRoll(1), v2 = await versionDuRoll(2);
  ok(rr2.status === '0x1' && v1 === 1 && v2 === 2, '5. rolls(1).rulesVersion = ' + v1 + ' (avant), rolls(2).rulesVersion = ' + v2 + ' (apres) : un changement ne vaut que pour les rolls d apres');
} catch (e) { ok(false, 'exception : ' + String(e && e.message || e).slice(0, 200)); }
finally { fin(); }
console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
