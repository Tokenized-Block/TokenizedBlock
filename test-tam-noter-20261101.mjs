/* test-tam-noter-20261101.mjs — banc de contracts/noter-deploiement-tamart.mjs + la bascule du Mint (2026-11-01).
 *   Faux rpc seulement : rien n est lu sur la chaine, rien n est signe ni envoye. Toute ecriture se fait sur une COPIE de la fiche
 *   (dossier temporaire) ; la fiche du depot est hachee avant/apres et doit etre INCHANGEE.
 *   1. la bonne tx -> adresse + bloc ecrits par l ecrivain du preparateur ; la copie notee rend mintVisible vrai et planMintTam
 *      construit approve(USDC -> TamArt, 5 000 000) puis mint ;
 *   2. les mutants (beneficiaire faux, status 0x0, input different, + 9 autres) sont TOUS refuses et n ecrivent rien ;
 *   3. sans adresse : pas de Mint ; 4. la CLI, de bout en bout, contre un faux rpc HTTP local, sur une copie. */
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { noter, noterDepuisRpc } from './contracts/noter-deploiement-tamart.mjs';
import { texteFicheTamart } from './contracts/fiche-tamart.mjs';
import { TAMART_DEPLOIEMENT as FICHE } from './tamart-deploiement.js';
import { FEE_WALLET, USDC_BASE } from './frais-creation.js';
import { selecteur } from './keccak.js';
import * as V from './tam-vue.js';
import * as TP from './tam-plan.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const CHEMIN = path.join(ICI, 'tamart-deploiement.js');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const bas = (x) => String(x).toLowerCase();
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const SHA_AVANT = sha(CHEMIN);
const TEXTE = fs.readFileSync(CHEMIN, 'utf8');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tam-noter-'));

const HASH = '0x' + 'ab'.repeat(32), DE = '0x' + '77'.repeat(20), TAM = '0x' + 'c0'.repeat(20);
const mot = (h) => '0x' + String(h).replace(/^0x/, '').padStart(64, '0');
const motN = (x) => '0x' + BigInt(x).toString(16).padStart(64, '0');
const bon = () => ({
  tx: { hash: HASH, from: DE, to: null, input: FICHE.creation },
  recu: { transactionHash: HASH, status: '0x1', contractAddress: TAM, blockNumber: '0x' + (12345678).toString(16) },
  appels: { 'PRICE()': motN(5000000), 'beneficiaire()': mot(bas(FEE_WALLET)), 'USDC()': mot(bas(USDC_BASE)) },
});
/* le faux rpc : sert un scenario ; une valeur `Error` = la lecture echoue */
const fauxRpc = (sc) => async (m, p) => {
  let v;
  if (m === 'eth_getTransactionByHash') v = sc.tx;
  else if (m === 'eth_getTransactionReceipt') v = sc.recu;
  else if (m === 'eth_call') { assert.strictEqual(bas(p[0].to), bas(sc.recu.contractAddress)); v = Object.entries(sc.appels).find(([s]) => selecteur(s) === p[0].data)?.[1]; }
  else throw new Error('unexpected ' + m);
  if (v instanceof Error) throw v;
  return v === undefined ? null : v;
};

/* ── 0. l ecrivain : la fiche du depot est exactement son texte ── */
ok(texteFicheTamart(FICHE) === TEXTE.replace(/\r\n/g, '\n'), 'la fiche du depot = texteFicheTamart(fiche), octet pour octet (LF)');
ok(FICHE.adresse === null && FICHE.bloc === null, 'temoin : la fiche du depot n a pas d adresse');

/* ── 1. la bonne tx ── */
const v = await noterDepuisRpc({ rpc: fauxRpc(bon()), txHash: HASH, fiche: FICHE, texte: TEXTE });
ok(v.ok === true, 'la bonne tx est notee : ' + (v.pourquoi || 'ok'));
ok(v.adresse === TAM && v.bloc === 12345678, 'adresse = contractAddress du recu, bloc = blockNumber');
const lignesA = TEXTE.replace(/\r\n/g, '\n').split('\n'), lignesB = v.texte.split('\n');
const diff = lignesA.map((l, i) => (l !== lignesB[i] ? i : -1)).filter((i) => i >= 0);
ok(lignesA.length === lignesB.length && diff.length === 2, 'exactement DEUX lignes changent (adresse, bloc) : ' + diff.length);
ok(lignesB[diff[0]] === "  adresse: '" + TAM + "'," && lignesB[diff[1]].startsWith('  bloc: 12345678, /* tx ' + HASH + ' signed by ' + DE), 'les deux lignes : adresse puis bloc (+ tx et signataire)');
const COPIE = path.join(TMP, 'tamart-deploiement.js');
fs.writeFileSync(COPIE, v.texte);
const { TAMART_DEPLOIEMENT: NOTEE } = await import(pathToFileURL(COPIE).href);
ok(NOTEE.creation === FICHE.creation && NOTEE.sha256Creation === FICHE.sha256Creation, 'la copie notee garde la creation figee');
ok(texteFicheTamart({ ...NOTEE, tx: HASH, signataire: DE }) === v.texte, 'la copie notee est encore le texte de son ecrivain');

/* ── 2. la bascule du Mint, sur la copie NOTEE ── */
ok(V.mintVisible(FICHE) === false, 'fiche du depot (sans adresse) : pas de Mint');
ok(V.mintVisible(NOTEE) === true, 'fiche notee (adresse + bloc) : mintVisible = true');
ok(TP.adresseTam(NOTEE) === TAM, 'adresseTam(fiche notee) = l adresse du recu');
const LU = { prix: 5000000n, beneficiaire: bas(FEE_WALLET), usdc: bas(USDC_BASE) };
const OEUVRE = new Uint8Array([0x54, 0x41, 0x4d, 1, 0, 0, 0, 9, 9]);
const GRAINE = '0x' + '5e'.repeat(32);
const plan = TP.planMintTam({ deploiement: NOTEE, lu: LU, octets: OEUVRE, graine: GRAINE, paramsJson: '{"a":1}' });
ok(plan.etat === 'PRET' && plan.appels.length === 2, 'planMintTam(fiche notee) : PRET, deux appels');
const [ap, mi] = plan.appels;
ok(bas(ap.to) === bas(USDC_BASE) && ap.data.slice(0, 10) === selecteur('approve(address,uint256)'), '1er appel : approve sur USDC');
ok(ap.data.slice(10, 74) === TAM.slice(2).padStart(64, '0') && BigInt('0x' + ap.data.slice(74, 138)) === 5000000n && ap.data.length === 138, 'approve(TamArt, 5 000 000) exactement');
ok(mi.to === TAM && mi.data.slice(0, 10) === selecteur('mint(bytes,bytes32,bytes)') && mi.value === '0x0', '2e appel : TamArt.mint, value 0');
ok(mi.data.slice(74, 138) === GRAINE.slice(2), 'mint porte la graine');
const sans = TP.planMintTam({ deploiement: FICHE, lu: LU, octets: OEUVRE, graine: GRAINE, paramsJson: '{"a":1}' });
ok(sans.etat === 'REFUSE' && sans.code === 'PAS_DEPLOYE' && sans.appels.length === 0, 'sans adresse : PAS_DEPLOYE, aucun appel');
ok(V.mintVisible({ ...NOTEE, bloc: null }) === false, 'adresse sans bloc : pas de Mint');

/* ── 3. les mutants : chacun refuse, aucun texte rendu ── */
const MUTANTS = [
  ['beneficiaire faux', (s) => { s.appels['beneficiaire()'] = mot('0x' + 'de'.repeat(20)); }, /beneficiaire\(\)/],
  ['status 0x0', (s) => { s.recu.status = '0x0'; }, /status 0x0/],
  ['input different (1 octet)', (s) => { const i = s.tx.input; s.tx.input = i.slice(0, 200) + (i[200] === '0' ? '1' : '0') + i.slice(201); }, /byte for byte/],
  ['input avec un octet de plus', (s) => { s.tx.input += '00'; }, /byte for byte/],
  ['PRICE 4 999 999', (s) => { s.appels['PRICE()'] = motN(4999999); }, /PRICE\(\)/],
  ['USDC faux', (s) => { s.appels['USDC()'] = mot('0x' + '12'.repeat(20)); }, /USDC\(\)/],
  ['beneficiaire illisible (eth_call echoue)', (s) => { s.appels['beneficiaire()'] = new Error('rpc'); }, /beneficiaire\(\)/],
  ['tx avec un to', (s) => { s.tx.to = TAM; }, /not a contract creation/],
  ['recu absent', (s) => { s.recu = null; }, /receipt/],
  ['recu d une autre tx', (s) => { s.recu.transactionHash = '0x' + 'cd'.repeat(32); }, /receipt/],
  ['tx introuvable', (s) => { s.tx = null; }, /not found/],
  ['pas de contractAddress', (s) => { s.recu.contractAddress = null; }, /contractAddress/],
];
for (const [nom, muter, re] of MUTANTS) {
  const s = bon(); muter(s);
  const r = await noterDepuisRpc({ rpc: fauxRpc(s), txHash: HASH, fiche: FICHE, texte: TEXTE });
  ok(r.ok === false && r.texte === undefined && re.test(r.pourquoi), 'mutant refuse : ' + nom + ' -> ' + r.pourquoi);
}
/* mutants de la fiche (sur des copies en memoire) */
const s0 = bon();
const fiche = (m) => noter({ fiche: { ...FICHE, ...m }, texte: texteFicheTamart({ ...FICHE, ...m }), txHash: HASH, tx: s0.tx, recu: s0.recu, lu: { PRICE: s0.appels['PRICE()'], beneficiaire: s0.appels['beneficiaire()'], USDC: s0.appels['USDC()'] } });
ok(fiche({}).ok === true, 'temoin des mutants de fiche : la fiche intacte passe');
ok(/already carries/.test(fiche({ adresse: TAM, bloc: 1 }).pourquoi || ''), 'fiche deja notee : refus (pas de reecriture)');
ok(/USDC_BASE \/ FEE_WALLET/.test(fiche({ constructeur: { usdc: bas(USDC_BASE), beneficiaire: '0x' + 'de'.repeat(20) } }).pourquoi || ''), 'fiche au beneficiaire change : refus');
ok(/sha256Creation/.test(fiche({ sha256Creation: '00'.repeat(32) }).pourquoi || ''), 'sha256Creation qui ne colle pas : refus');
const edite = noter({ fiche: FICHE, texte: TEXTE.replace('prix: 5000000', 'prix: 5000001'), txHash: HASH, tx: s0.tx, recu: s0.recu, lu: { PRICE: s0.appels['PRICE()'], beneficiaire: s0.appels['beneficiaire()'], USDC: s0.appels['USDC()'] } });
ok(edite.ok === false && /writer/.test(edite.pourquoi), 'fiche editee a la main : refus');
const deux = noter({ fiche: NOTEE, texte: v.texte, txHash: HASH, tx: s0.tx, recu: s0.recu, lu: {} });
ok(deux.ok === false && /already carries/.test(deux.pourquoi), 'noter deux fois : le second refuse');

/* ── 4. la CLI de bout en bout : faux rpc HTTP local, ecriture sur une COPIE ── */
const lancerCli = (sc, copie, tx = HASH) => new Promise((res) => {
  const srv = http.createServer(async (req, rep) => {
    let b = ''; for await (const c of req) b += c;
    const q = JSON.parse(b);
    let out; try { out = { jsonrpc: '2.0', id: q.id, result: await fauxRpc(sc)(q.method, q.params) }; } catch (e) { out = { jsonrpc: '2.0', id: q.id, error: { message: e.message } }; }
    rep.setHeader('content-type', 'application/json'); rep.end(JSON.stringify(out));
  }).listen(0, '127.0.0.1', () => {
    execFile(process.execPath, [path.join(ICI, 'contracts', 'noter-deploiement-tamart.mjs'), 'http://127.0.0.1:' + srv.address().port], { env: { ...process.env, TX: tx, FICHE_CHEMIN: copie } }, (err, so, se) => { srv.close(); res({ code: err ? err.code : 0, so, se }); });
  });
});
const C1 = path.join(TMP, 'cli-bon.js'); fs.writeFileSync(C1, TEXTE);
const c1 = await lancerCli(bon(), C1);
ok(c1.code === 0 && /adresse 0xc0c0/.test(c1.so), 'CLI, bonne tx : exit 0, adresse ecrite');
ok(fs.readFileSync(C1, 'utf8') === v.texte, 'CLI : la copie = le texte de noter(), octet pour octet');
for (const [nom, muter] of MUTANTS.slice(0, 3)) {
  const C = path.join(TMP, 'cli-mutant.js'); fs.writeFileSync(C, TEXTE);
  const s = bon(); muter(s);
  const r = await lancerCli(s, C);
  ok(r.code === 1 && /REFUSED/.test(r.se) && fs.readFileSync(C, 'utf8') === TEXTE, 'CLI, mutant ' + nom + ' : exit 1, REFUSED, copie intacte : ' + JSON.stringify(r));
}
const C2 = path.join(TMP, 'cli-sans-tx.js'); fs.writeFileSync(C2, TEXTE);
const c2 = await lancerCli(bon(), C2, '');
ok(c2.code === 2 && fs.readFileSync(C2, 'utf8') === TEXTE, 'CLI sans TX= : exit 2, rien ecrit');

ok(sha(CHEMIN) === SHA_AVANT, 'la fiche du DEPOT est inchangee (sha256 avant = apres)');
fs.rmSync(TMP, { recursive: true, force: true });
console.log('test-tam-noter-20261101 : ' + n + '/' + n + ' OK');
