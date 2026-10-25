/* test-noter-duels-v2-20261024.mjs - LA FICHE V2 N EST INSCRITE QUE SI LE RECU, LA DONNEE SIGNEE ET LES RELECTURES CONCORDENT.
 * AFFIRME (noter(), pur, avec des stubs, sur la fiche PRETE du depot) : (1) un recu 0x1 d une creation dont l input == creation de la fiche,
 *   relectures = fiche, tokenOk(USDC) vrai, nextId 1, 9000 / 700 / 256, settleDefault dans le code -> le texte porte adresse + bloc, rien
 *   d autre ne change (et une fiche en CRLF garde ses CRLF) ; (2) refus pour chaque ecart, un a la fois ; (3) les relectures couvrent les 4
 *   adresses et les 3 constantes. NE PROUVE PAS : un deploiement reel (banc-duels-v2-anvil le fait sur un anvil local). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const { noter, RELECTURES, CONSTANTES, SELECTEUR_DEFAUT } = await import(pathToFileURL(process.env.NOTER_V2 || path.join(ICI, 'contracts/noter-deploiement-duelsv2.mjs')).href);
const { DUELS_V2_DEPLOIEMENT: REELLE } = await import('./duels-v2-deploiement.js');
/* 2026-10-25 : BlockDuelsV2 deploye (bloc 53 064 205), la fiche du depot porte adresse + bloc. Le banc tourne sur la MEME fiche ramenee a
 * l etat d avant (memes octets de creation, adresse et bloc remis a null ; texte : les deux lignes remises a null) -- il teste toujours la
 * vraie donnee signee, et ne peut pas passer a vide parce que l adresse est deja ecrite. */
const F = Object.freeze({ ...REELLE, adresse: null, bloc: null });
let n = 0, ko = 0;
const vu = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const texteDepot = fs.readFileSync(path.join(ICI, 'duels-v2-deploiement.js'), 'utf8').replace(/\r\n/g, '\n');
const texte = texteDepot.replace(/^(\s*)adresse: '0x[0-9a-f]{40}',$/m, '$1adresse: null,').replace(/^(\s*)bloc: \d+, \/\*[^\n]*\*\/$/m, '$1bloc: null,');
const art = JSON.parse(fs.readFileSync(path.join(ICI, 'contracts/out/BlockDuelsV2.sol/BlockDuelsV2.json'), 'utf8'));
const C = F.constructeur, A = '0x' + 'ab'.repeat(20), DE = '0x' + 'cd'.repeat(20), H = '0x' + '77'.repeat(32), HB = '0x' + '5b'.repeat(32);
const bon = () => ({ fiche: F, texte, tx: { hash: H, from: DE, to: null, input: F.creation, chainId: '0x2105' }, recu: { status: '0x1', contractAddress: A, blockNumber: '0x3253f4b', blockHash: HB },
  chaineNoeud: '0x2105', hashBlocNoeud: HB,
  relectures: { 'USDC()': C.usdc, 'DEV_WALLET()': C.devWallet, 'REWARD_POOL()': C.rewardPool, 'GUARDIAN()': C.guardian }, usdcAdmis: true, nextId: '1',
  constantes: { 'WINNER_BPS()': '9000', 'POOL_BPS()': '700', 'SETTLE_WINDOW()': '256' }, code: art.deployedBytecode.object });
vu(F.pret === true && F.adresse === null && F.bloc === null && /^\s*adresse: null,$/m.test(texte) && /^\s*bloc: null,$/m.test(texte), 'la fiche (ramenee a avant le deploiement) est prete, sans adresse, texte compris');
vu((REELLE.adresse === null && REELLE.bloc === null && texteDepot === texte) || (/^0x[0-9a-f]{40}$/.test(String(REELLE.adresse)) && Number.isSafeInteger(REELLE.bloc) && REELLE.bloc > 0 && texteDepot !== texte),
  'la fiche du depot : adresse et bloc tous deux nuls, ou tous deux ecrits (et alors ramenes a null ci-dessus)');
{
  /* la fiche deployee est EXACTEMENT ce que noter() ecrit : rejouee depuis ses propres lignes (tx, signataire, adresse, bloc lus dans le
   *   fichier, jamais tapes) sur la fiche ramenee a avant, le texte rendu est octet pour octet celui du depot */
  const m = texteDepot.match(/^\s*bloc: (\d+), \/\* tx (0x[0-9a-f]{64}) signed by (0x[0-9a-f]{40}) \*\/$/m);
  if (REELLE.adresse !== null) {
    const x = bon();
    x.tx.hash = m && m[2]; x.tx.from = m && m[3]; x.recu.contractAddress = REELLE.adresse; x.recu.blockNumber = '0x' + Number(REELLE.bloc).toString(16);
    const r = noter(x);
    vu(!!m && Number(m[1]) === REELLE.bloc && r.ok === true && r.adresse === REELLE.adresse && r.bloc === REELLE.bloc && r.texte === texteDepot, 'la fiche deployee = la sortie de noter() rejouee sur ses propres tx / signataire / adresse / bloc (' + REELLE.adresse + ', bloc ' + REELLE.bloc + ')');
  } else console.log('  (fiche pas deployee : rejeu de la sortie du noteur sans objet)');
}
vu(art.methodIdentifiers['settleDefault(uint256)'] === SELECTEUR_DEFAUT && art.deployedBytecode.object.includes('63' + SELECTEUR_DEFAUT), 'le selecteur cherche (' + SELECTEUR_DEFAUT + ') est celui de l ABI compilee, PUSH4 present dans le runtime');
const v = noter(bon());
vu(v.ok === true && v.adresse === A && v.bloc === 52772683, 'inscrit : adresse + bloc');
vu(v.ok && v.texte.includes("  adresse: '" + A + "',") && v.texte.includes('  bloc: 52772683, /* tx ' + H + ' signed by ' + DE + ' */'), 'les deux lignes reecrites, tx et signataire notes');
vu(v.ok && v.texte.split('\n').length === texte.split('\n').length && v.texte.replace(/\n  adresse:[^\n]*\n  bloc:[^\n]*/, '') === texte.replace(/\n  adresse: null,\n  bloc: null,/, ''), 'rien d autre ne change');
const vCr = noter({ ...bon(), texte: texte.replace(/\n/g, '\r\n') });
vu(vCr.ok && vCr.texte.split('\n').every((l, i, t) => i === t.length - 1 || l.endsWith('\r')), 'une fiche en CRLF garde ses CRLF (les deux lignes reecrites comprises)');
const refuse = (patch, m) => { const x = bon(); patch(x); const r = noter(x); vu(r.ok === false && typeof r.pourquoi === 'string' && r.pourquoi.length > 10, m + ' : refuse (' + (r.pourquoi || '').slice(0, 70) + ')'); };
refuse((x) => { x.fiche = { ...F, adresse: A, bloc: 1 }; }, 'adresse deja ecrite');
refuse((x) => { x.fiche = { ...F, contrat: 'BlockDuels' }; }, 'une fiche v1');
refuse((x) => { x.tx.input = F.creation.slice(0, -2) + (F.creation.endsWith('a') ? 'b' : 'a'); }, 'input different d un octet');
refuse((x) => { x.tx.to = A; }, 'to present');
refuse((x) => { x.tx.chainId = '0x1'; }, 'une autre chaine');
refuse((x) => { x.recu.status = '0x0'; }, 'status 0x0');
refuse((x) => { delete x.recu.contractAddress; }, 'pas de contractAddress');
refuse((x) => { x.relectures['REWARD_POOL()'] = '0x' + '99'.repeat(20); }, 'rewardPool relu different');
refuse((x) => { x.relectures['GUARDIAN()'] = null; }, 'relecture non lue');
refuse((x) => { x.usdcAdmis = false; }, 'USDC non admis');
refuse((x) => { x.nextId = '2'; }, 'nextId different de 1');
refuse((x) => { x.constantes['SETTLE_WINDOW()'] = '255'; }, 'fenetre relue 255');
refuse((x) => { x.constantes['WINNER_BPS()'] = '9700'; }, 'part du gagnant relue 9700');
refuse((x) => { x.code = '0x6080'; }, 'code sans settleDefault (un v1 deploye par erreur)');
refuse((x) => { x.code = null; }, 'code non lu');
/* revue 2026-10-24 (LOW) : le NOEUD lu doit etre Base (eth_chainId du noeud, pas celui que la tx declare) et son bloc du recu doit avoir le
 *   MEME hash que le recu (un recu d une autre chaine, ou d une branche abandonnee, est refuse) */
refuse((x) => { x.chaineNoeud = '0x7a69'; }, 'le noeud lu n est pas Base (eth_chainId 0x7a69), la tx dit 0x2105');
refuse((x) => { x.chaineNoeud = null; }, 'eth_chainId du noeud non lu');
refuse((x) => { x.chaineNoeud = '0x2105 '; }, 'eth_chainId du noeud mal forme');
refuse((x) => { x.hashBlocNoeud = '0x' + '5c'.repeat(32); }, 'le bloc du recu a un autre hash sur le noeud');
refuse((x) => { x.hashBlocNoeud = null; }, 'le bloc du recu non lu sur le noeud');
refuse((x) => { delete x.recu.blockHash; x.hashBlocNoeud = undefined; }, 'recu sans blockHash');
vu(noter({ ...bon(), hashBlocNoeud: '0x' + '5B'.repeat(32) }).ok === true, 'hash du bloc compare sans la casse (meme hash en majuscules : inscrit)');
{
  /* lireChaine lit eth_chainId DU NOEUD et l en-tete du bloc du recu (la MEME fonction que la CLI et le banc anvil) */
  const { lireChaine } = await import(pathToFileURL(process.env.NOTER_V2 || path.join(ICI, 'contracts/noter-deploiement-duelsv2.mjs')).href);
  const vus = [];
  const rpc = async (m, p) => { vus.push(m + (p && p[0] !== undefined ? ':' + String(p[0]) : ''));
    if (m === 'eth_chainId') return '0x7a69';
    if (m === 'eth_getTransactionByHash') return bon().tx;
    if (m === 'eth_getTransactionReceipt') return bon().recu;
    if (m === 'eth_getBlockByNumber') return p[0] === '0x3253f4b' ? { number: p[0], hash: '0x' + '5c'.repeat(32) } : null;
    if (m === 'eth_getCode') return bon().code;
    return '0x' + '0'.repeat(64); };
  let lu = null; try { lu = await lireChaine(rpc, H, F); } catch (e) { lu = { erreur: String(e.message) }; }
  vu(lu.chaineNoeud === '0x7a69' && lu.hashBlocNoeud === '0x' + '5c'.repeat(32) && vus.includes('eth_chainId') && vus.includes('eth_getBlockByNumber:0x3253f4b'), 'lireChaine lit eth_chainId du noeud et le hash du bloc du recu (' + lu.chaineNoeud + ', ' + String(lu.hashBlocNoeud).slice(0, 10) + ')');
  vu(noter({ ...bon(), chaineNoeud: lu.chaineNoeud }).ok === false && noter({ ...bon(), hashBlocNoeud: lu.hashBlocNoeud }).ok === false, 'ce que lireChaine lit d un noeud local / d un autre bloc : noter REFUSE');
}
vu(JSON.stringify(RELECTURES.map((r) => r.sig)) === JSON.stringify(['USDC()', 'DEV_WALLET()', 'REWARD_POOL()', 'GUARDIAN()']) && JSON.stringify(CONSTANTES.map((c) => c.sig + '=' + c.attendu)) === '["WINNER_BPS()=9000","POOL_BPS()=700","SETTLE_WINDOW()=256"]', 'les 4 relectures d adresses et les 3 constantes');
console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) ; NE PROUVE PAS un deploiement reel');
if (ko) process.exitCode = 1;
