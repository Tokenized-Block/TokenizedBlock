// test-marche-etranger-20261002 — detecteur de launchpads, part referrer o1, marque TB, choix de marche.
// ⛔ Hors ligne : les logs sont de VRAIS logs Base (fixture-lancements-etrangers-20261002.json, blocs 52 03x–52 07x).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classerLogs, filtresScan, interfaceClanker, frontO1, scannerLancements, decoderTexte, BANKR_INTEGRATEUR } from './lancements-etrangers.js';
import { hookDataReferentO1, O1_LAUNCH_HOOK_STANDARD, COMMENTAIRE_O1 } from './referent-o1.js';
import { paramsSwapExactInSingle, encodeV4Swap } from './pool.js';
import { planLaunchOL } from './openlaunch-launch.js';
import { readdirSync } from 'node:fs';
import { choisirMarche, phraseChoix, HOOK_MARCHE_OUVERT, MARCHE_OUVERT_ACTIF } from './marche-ouvert.js';
import { FEE_WALLET } from './frais-creation.js';
import { hookPaieDejaA6cf, HOOK_V8 } from './tokenomics.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

// ── 1. detecteur, sur de vrais logs ──
const logs = JSON.parse(readFileSync(new URL('./fixture-lancements-etrangers-20261002.json', import.meta.url)));
const l = classerLogs(logs);
const par = (j) => l.find((x) => x.jeton === j.toLowerCase());
const brian = par('0xB2000000000000000000002EEFeBd3dd6Ef2d601');
ok(brian && brian.launchpad === 'O1_STANDARD', 'BRIAN : o1 Standard (pas B20 auto, malgre son B20Created dans la meme tx)');
eq(l.filter((x) => x.jeton === brian.jeton).length, 1, 'un token = une ligne');
eq(new Set(l.map((x) => x.launchpad)), new Set(['O1_STANDARD', 'CLANKER', 'ZORA', 'DOPPLER', 'OPENLAUNCH', 'B20_AUTO']), 'six familles lues');
const self = par('0xb200000000000000000000ae0ff666aa17c6858c');
ok(self && self.launchpad === 'B20_AUTO', 'B20 cree directement a la factory = auto-lance');
ok(l.every((x) => /^0x[0-9a-f]{40}$/.test(x.jeton) && Number.isInteger(x.bloc)), 'adresses et blocs bien formes');
eq(l.find((x) => x.launchpad === 'CLANKER').indice, 'clanker.world', 'interface Clanker lue dans le contexte JSON du vrai log');
eq(interfaceClanker('0x' + Buffer.from('xx{"interface":"Bankr","platform":""}').toString('hex')), 'Bankr', 'interface bankr');
eq(filtresScan().length, 7, 'une requete par adresse (Zora : deux topics fusionnes)');
eq(frontO1('https://ipfs.launchblitz.ai/ipfs/Qm…'), 'LaunchBlitz', 'LaunchBlitz reconnu a son hote');
eq(frontO1('ipfs://Qm'), null, 'hote inconnu -> null, jamais devine');
const s32 = (t) => { const h = Buffer.from(t).toString('hex'); return '0x' + (32).toString(16).padStart(64, '0') + Buffer.byteLength(t).toString(16).padStart(64, '0') + h.padEnd(Math.ceil(h.length / 64) * 64 || 64, '0'); };
eq(decoderTexte(s32('héllo ✦')), 'héllo ✦', 'string ABI UTF-8');
eq(decoderTexte('0x'), '', 'illisible -> vide');

// scanner hors ligne : rpc simule = la fixture, contractURI LaunchBlitz pour BRIAN, integrateur bankr pour le Doppler
{
  const dop = l.find((x) => x.launchpad === 'DOPPLER');
  const appels = { getLogs: 0, rates: 0 };
  const rpc = async (m, p) => {
    if (m === 'eth_getLogs') {
      appels.getLogs++;
      if (appels.getLogs === 3) throw new Error('429');
      const f = p[0];
      return logs.filter((x) => x.address.toLowerCase() === f.address && f.topics[0].includes(x.topics[0].toLowerCase())
        && parseInt(x.blockNumber, 16) >= parseInt(f.fromBlock, 16) && parseInt(x.blockNumber, 16) <= parseInt(f.toBlock, 16));
    }
    if (m === 'eth_call' && p[0].data === '0xe8a3d485') return p[0].to === brian.jeton ? s32('https://ipfs.launchblitz.ai/ipfs/QmX') : s32('');
    if (m === 'eth_call' && p[0].data.startsWith('0x1652e7b7')) {
      return '0x' + '0'.repeat(64 * 9) + BANKR_INTEGRATEUR.slice(2).padStart(64, '0');
    }
    throw new Error('inattendu ' + m);
  };
  const blocs = logs.map((x) => parseInt(x.blockNumber, 16));
  const r = await scannerLancements({ rpc, deBloc: Math.min(...blocs), aBloc: Math.max(...blocs), pas: 100000 });
  eq(r.ratees, 1, 'une fenetre ratee est COMPTEE');
  ok(r.fenetres >= 7, 'fenetres comptees');
  const b2 = r.lancements.find((x) => x.jeton === brian.jeton);
  if (b2) eq(b2.nom, 'LaunchBlitz (via o1)', 'o1 + metadonnees launchblitz = LaunchBlitz');
  const d2 = r.lancements.find((x) => x.jeton === dop.jeton);
  if (d2) eq(d2.launchpad, 'BANKR', 'Doppler + integrateur bankr = bankr');
  ok(b2 || d2, 'au moins une famille affinee malgre la fenetre ratee');
  const r2 = await scannerLancements({ rpc: async (m, p) => { if (m === 'eth_getLogs') return rpc(m, p); throw new Error('x'); },
    deBloc: Math.min(...blocs), aBloc: Math.max(...blocs), pas: 100000, maxAffinage: 0 });
  ok(r2.nonAffines > 0 && r2.lancements.every((x) => x.affinage === 'NON_LU' || !['O1_STANDARD', 'DOPPLER', 'B20_AUTO', 'O1_TAX'].includes(x.launchpad)),
    'plafond d affinage : DIT, pas devine');
}

// ── 2. part referrer o1 : octets exacts, drapeau OFF par defaut ──
const cleO1 = { currency0: '0x0000000000000000000000000000000000000000', currency1: brian.jeton, fee: 0, tickSpacing: 200, hooks: O1_LAUNCH_HOOK_STANDARD };
eq(hookDataReferentO1({ cle: cleO1 }), '', 'drapeau OFF : aucun hookData');
const hd = hookDataReferentO1({ cle: cleO1, actif: true });
eq(hd, FEE_WALLET.slice(2).toLowerCase().padStart(64, '0') + COMMENTAIRE_O1, 'abi.encode(a6cf, bytes32 commentaire)');
eq(hd.length, 128, '64 octets');
eq(hookDataReferentO1({ cle: { ...cleO1, hooks: '0x9c7155d7216454d9d894f792c8b5c564f2c66acc' }, actif: true }), '', 'hook Tax : pas de referrer');
eq(hookDataReferentO1({ cle: { ...cleO1, hooks: '0x0000000000000000000000000000000000000000' }, actif: true }), '', 'pool sans hook : rien');
const base = { cle: cleO1, zeroForOne: true, montant: 10n ** 16n, sortieMin: 1n };
eq(paramsSwapExactInSingle(base), paramsSwapExactInSingle({ ...base, hookData: '' }), 'hookData vide : octets IDENTIQUES a avant');
const avec = paramsSwapExactInSingle({ ...base, hookData: hd });
// ⛔ FIGE depuis `cast abi-encode "f(((address,address,uint24,int24,address),bool,uint128,uint128,bytes))" …` (foundry) :
const CAST_ABI = '00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000b2000000000000000000002eefebd3dd6ef2d601000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c80000000000000000000000001f91c998e7c2f4b690d75bdbf6502bdcd6e02acc0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000002386f26fc10000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000040000000000000000000000000a6cf99d35949c6cb911adb910078f4ca46f0f5d4746f6b656e697a6564626c6f636b000000000000000000000000000000000000';
eq(avec, CAST_ABI, 'octets IDENTIQUES a l ABI de reference (cast)');
eq(avec.length, paramsSwapExactInSingle(base).length + 128, 'longueur + 64 octets de donnees');
eq(avec.slice(-192, -128), (64).toString(16).padStart(64, '0'), 'longueur bytes = 64');
eq(avec.slice(-128), hd, 'donnees en queue');
assert.throws(() => paramsSwapExactInSingle({ ...base, hookData: 'zz' })); n++;
ok(encodeV4Swap({ ...base, deadline: 1n, actions: [], hookData: hd }).includes(hd), 'encodeV4Swap transmet hookData');

// ── 3. REGLE DU FONDATEUR (2026-10-02 13:27) : aucune etiquette « not official » / « non officiel » /
//       « pool sans frais TB » NULLE PART dans l UI. On lit app.html ET tous les modules servis a la racine.
const INTERDIT = /not[\s_-]*official|non[\s_-]*officiel|pool sans frais tb/i;
ok(INTERDIT.test('Not official: x') && INTERDIT.test('non officiel') && INTERDIT.test('Pool sans frais TB') && INTERDIT.test('NOT_OFFICIAL'), 'temoin positif : le detecteur voit les formes interdites');
ok(!INTERDIT.test('official TokenizedBlock market') && !INTERDIT.test('Outside market'), 'temoin negatif : le texte normal passe');
const ici = new URL('./', import.meta.url);
const servis = readdirSync(ici).filter((f) => /\.(js|html)$/.test(f));
const fautifs = servis.filter((f) => INTERDIT.test(readFileSync(new URL(f, ici), 'utf8')));
eq(fautifs, [], 'aucun fichier .js/.html de la racine ne porte le libelle interdit');
ok(servis.includes('app.html') && servis.length > 50, 'la lecture a bien porte sur l app (' + servis.length + ' fichiers)');
ok(!servis.includes('marque-tb.js'), 'marque-tb.js retire (plus aucun usage, ni UI ni routage ni API)');
// ⛔ 14:21 : le refus de marque de la console OpenLaunch (partenaire) est RESTAURE tel qu avant la
//    branche — seul le libelle « Not official » du profil disparait. Le module doit etre identique au
//    parent 7135acd : on le verifie par son comportement (refus) ET par son temoin (un nom libre passe).
const olArgs = { lanceur: '0x' + '11'.repeat(20), startTick: 196200, lpFee: 30000, salt: '0x' + '00'.repeat(32) };
for (const [nom, symbole] of [['TokenizedBlock', 'TBLOCK'], ['x', 'TBGAS'], ['x', 'TB']]) {
  const r = planLaunchOL({ ...olArgs, nom, symbole });
  ok(r.etat === 'REFUSE' && /belongs to TokenizedBlock/.test(r.pourquoi), 'console OpenLaunch : refus de marque restaure (' + nom + '/' + symbole + ')');
}
ok(planLaunchOL({ ...olArgs, nom: 'My Token', symbole: 'MYTKN' }).etat === 'OK', 'temoin negatif : un nom libre passe la console OpenLaunch');

// ── 4. choix de marche : jamais un prix pire en silence ──
// ⛔ Crosscheck Zero 1 : choisirMarche n est PAS encore une garantie -> elle ne doit etre appelee NULLE PART.
const appelants = servis.filter((f) => f !== 'marche-ouvert.js' && /\bchoisirMarche\s*\(/.test(readFileSync(new URL(f, ici), 'utf8')));
eq(appelants, [], 'choisirMarche : aucun appelant dans l app (no-op)');
const srcMo = readFileSync(new URL('marche-ouvert.js', ici), 'utf8');
ok(/\bchoisirMarche\s*\(/.test(srcMo), 'temoin positif : le detecteur voit bien la definition');
ok(/N EST PAS ENCORE UNE GARANTIE/.test(srcMo) && /POOLS CANDIDATES/.test(srcMo), 'commentaire de tete : pas une garantie, doit prendre les pools candidates');
ok(HOOK_MARCHE_OUVERT === null && MARCHE_OUVERT_ACTIF === false, 'non deploye, drapeau OFF');
eq(choisirMarche({ devisEtranger: 100n, devisA6cf: 200n }).choix, 'ETRANGER', 'drapeau OFF : rien ne change');
eq(choisirMarche({ devisEtranger: 100n, devisA6cf: 100n, actif: true }).choix, 'A6CF', 'egalite : pool TB');
eq(choisirMarche({ devisEtranger: 100n, devisA6cf: 101n, actif: true }).choix, 'A6CF', 'mieux : pool TB');
const pire = choisirMarche({ devisEtranger: 100n, devisA6cf: 99n, actif: true });
eq([pire.choix, pire.ecart], ['ETRANGER', -1n], '1 wei de moins : on garde l autre ET on le dit');
ok(/less/.test(phraseChoix(pire)), 'ecart affiche');
ok(/0.2 %/.test(phraseChoix(choisirMarche({ devisEtranger: 1n, devisA6cf: 2n, actif: true }), 'BRIAN')), 'frais nomme');
eq(choisirMarche({ devisEtranger: null, devisA6cf: null, actif: true }).choix, 'AUCUN', 'rien lu');
eq(choisirMarche({ devisEtranger: 5n, devisA6cf: null, actif: true }).choix, 'ETRANGER', 'TB non lu : pas de pari');

ok(hookPaieDejaA6cf(HOOK_V8, 'ACHAT'), 'temoin : V8 paie deja a6cf');
ok(!hookPaieDejaA6cf('0x1f91c998e7c2f4b690d75bdbf6502bdcd6e02acc', 'ACHAT'), 'hook o1 : NE paie PAS a6cf (le referrer n est pas un frais TB a la place du routeur)');
ok(!hookPaieDejaA6cf('0x0000000000000000000000000000000000000000', 'ACHAT'), 'marche ouvert non deploye : adresse nulle ne passe pas pour lui');

console.log('test-marche-etranger-20261002 : ' + n + ' assertions, OK');
