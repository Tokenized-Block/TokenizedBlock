/* test-missions-attestation-20261017.mjs - LE VERIFIER SIGNE SEULEMENT CE QU IL A PROUVE, ET CE QU IL SIGNE SE RECUPERE EN SA CLE.
 * AFFIRME (EXECUTE, fausse chaine) : (1) parcours complet -> signature dont l adresse recuperee = verifier() du contrat, held = minimum exact,
 *   deadline = windowEnd + 50 min ; (2) refus : contrat absent (PAS_OUVERT), cle qui n est pas le verifier, createur qui joue sa mission,
 *   tache d un autre wallet, detention sous le minimum (avec les chiffres), solde qui bouge sans log (NON_MESURE), paire exigee et non tenue.
 * Cle de TEST publique 0xA11CE (celle des tests forge). NE PROUVE PAS : une vraie chaine (archive) ni un claim on-chain de cette signature
 *   (la parite digest JS == contrat et l acceptation par claim() sont prouvees ailleurs : test-verificateur-missions, SigneurSecp256k1.t.sol). */
import { strict as assert } from 'node:assert';
import { attester, DELAI_SIGNATURE, TOPIC_TASK_POSTED } from './missions-attestation.js';
import { readFileSync, existsSync } from 'node:fs';
import { topic, selecteur } from './keccak.js';
import { SEL } from './missions-lecture.js';
import { adresseDe, recupererAdresse } from './signeur-secp256k1.js';
import { donneesClaim, digestClaim, TOPIC_TRANSFER } from './verificateur-missions.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const CLE = '0x' + (0xA11CEn).toString(16).padStart(64, '0');
const VERIF = adresseDe(CLE).toLowerCase();
const CONTRAT = '0x' + 'cc'.repeat(20), BLK = '0x' + 'b2'.repeat(20), AMZ = '0x' + 'a7'.repeat(20), CREA = '0x' + 'c0'.repeat(20), JOUEUR = '0x' + 'b0'.repeat(20), AUTRE = '0x' + 'de'.repeat(20);
const CIBLE = '0x' + '49'.repeat(20), TOPIC = '0x' + 'ab'.repeat(32), H = '0x' + '77'.repeat(32);
const m = (v) => BigInt(v).toString(16).padStart(64, '0'), a = (x) => x.slice(2).padStart(64, '0');
const TETE = 100000, WINDOW = 86400;
/* chaine : bloc b -> horodatage 1_800_000_000 + 2*b ; le joueur detient 60 BLK, en sort 40 au bloc 80000 et les reprend au bloc 90000 */
function chaine({ verifier = VERIF, minBlock = 10n ** 19n, minPaired = 0n, from = JOUEUR, sansLog = false, paireTenue = 5n * 10n ** 18n, blocTx = 99000, poseeAu = null, pasBloc = 2, chaineLue = 8453, dejaPaye = false } = {}) {
  const ts = (b) => 1_800_000_000 + pasBloc * b;
  const finale = 60n * 10n ** 18n;
  const soldeA = (b) => (b >= 80000 && b < 90000 ? finale - 40n * 10n ** 18n : finale) + (sansLog ? 1n : 0n) * (b < 70000 ? 1n : 0n);
  const logs = [
    { address: BLK, topics: [TOPIC_TRANSFER, '0x' + a(JOUEUR), '0x' + a(AUTRE)], data: '0x' + m(40n * 10n ** 18n), blockNumber: '0x' + (80000).toString(16), logIndex: '0x0', transactionHash: '0x' + '01'.repeat(32) },
    { address: BLK, topics: [TOPIC_TRANSFER, '0x' + a(AUTRE), '0x' + a(JOUEUR)], data: '0x' + m(40n * 10n ** 18n), blockNumber: '0x' + (90000).toString(16), logIndex: '0x0', transactionHash: '0x' + '02'.repeat(32) },
  ];
  if (poseeAu !== null) logs.push({ address: CONTRAT, topics: [TOPIC_TASK_POSTED, '0x' + m(3), '0x' + a(BLK), '0x' + a(CREA)], data: '0x', blockNumber: '0x' + poseeAu.toString(16), logIndex: '0x0', transactionHash: '0x' + '03'.repeat(32) });
  const f = async (meth, p) => {
    if (meth === 'eth_blockNumber') return '0x' + TETE.toString(16);
    if (meth === 'eth_chainId') return '0x' + chaineLue.toString(16);
    if (meth === 'eth_getBlockByNumber') { f.entetes += 1; return { timestamp: '0x' + ts(parseInt(p[0], 16)).toString(16) }; }
    if (meth === 'eth_getTransactionByHash') return { hash: H, from };
    if (meth === 'eth_getTransactionReceipt') return { status: '0x1', transactionHash: H, blockNumber: '0x' + blocTx.toString(16), logs: [{ address: CIBLE, topics: [TOPIC] }] };
    if (meth === 'eth_getLogs') {
      const f = p[0], de = parseInt(f.fromBlock, 16), au = parseInt(f.toBlock, 16);
      return logs.filter((l) => { const b = parseInt(l.blockNumber, 16); return b >= de && b <= au && l.address === f.address && l.topics[0] === f.topics[0]
        && (f.topics[1] ? l.topics[1] === f.topics[1] : l.topics[2] === f.topics[2]); });
    }
    if (meth === 'eth_call') {
      const { to, data } = p[0], s = data.slice(2, 10), bloc = p[1] === 'latest' ? TETE : parseInt(p[1], 16);
      if (to === CONTRAT && s === SEL.tasks) return '0x' + [a(BLK), a(AMZ), a(BLK), a(CREA), m(10n ** 18n), m(10), m(0), m(1), m(1900000000), a(CIBLE), TOPIC.slice(2), 'cd'.repeat(32)].join('');
      if (to === CONTRAT && s === SEL.holdOf) return '0x' + [m(minBlock), m(minPaired), m(0), m(0), m(WINDOW)].join('');
      if (to === CONTRAT && s === SEL.verifier) return '0x' + a(verifier);
      if (to === CONTRAT && s === selecteur('txUsed(bytes32)').slice(2) && data.slice(10) === H.slice(2)) return '0x' + m(dejaPaye ? 1 : 0);
      if (s === '70a08231' && to === BLK) return '0x' + m(soldeA(bloc));
      if (s === '70a08231' && to === AMZ) return '0x' + m(paireTenue);
    }
    throw new Error('inattendu ' + meth);
  };
  f.entetes = 0;
  return f;
}
const io = (o = {}) => { const r = chaine(o); return { rpcEtat: r, rpcLogs: r, chaineId: 8453, contrat: CONTRAT, cle: CLE, tranche: 5000, ...(o.io || {}) }; };
const demande = { taskId: 3, completer: JOUEUR, txHash: H };
/* (1) parcours complet */
const r = await attester(io(), demande);
vu(r.ok === true, 'attestation rendue (' + JSON.stringify(r).slice(0, 160) + ')');
vu(r.held.heldBlock === (20n * 10n ** 18n).toString(), 'held = le MINIMUM exact de la fenetre (20, pas 60)');
vu(r.held.deadline === r.held.windowEnd + DELAI_SIGNATURE && r.held.windowEnd === 1_800_000_000 + 2 * (TETE - 2), 'windowEnd = bloc de fin, deadline = +50 min');
const d = donneesClaim({ chainId: 8453, contrat: CONTRAT, taskId: 3, completer: JOUEUR, txHash: H, heldBlock: r.held.heldBlock, heldPaired: '0', window: WINDOW, windowEnd: r.held.windowEnd, deadline: r.held.deadline });
vu(recupererAdresse(digestClaim(d), r.signature).toLowerCase() === VERIF, 'la signature se recupere en verifier() du contrat');
/* (2) refus */
vu((await attester({ ...io(), contrat: null }, demande)).etat === 'PAS_OUVERT', 'contrat non deploye -> PAS_OUVERT');
vu((await attester(io({ verifier: '0x' + '99'.repeat(20) }), demande)).etat === 'PAS_OUVERT', 'cle du serveur != verifier du contrat -> rien signe');
/* tx ENVOYEE par le createur : la preuve de tache passerait, seule la garde createur refuse (sinon ce test refusait par accident) */
const crea = await attester(io({ from: CREA }), { ...demande, completer: CREA });
vu(crea.etat === 'REFUSE' && /creator/.test(crea.pourquoi), 'le createur ne joue pas sa mission (' + crea.pourquoi + ')');
vu((await attester(io({ from: AUTRE }), demande)).etat === 'REFUSE', 'tx envoyee par un autre wallet -> REFUSE');
const sous = await attester(io({ minBlock: 30n * 10n ** 18n }), demande);
vu(sous.etat === 'REFUSE' && /held at least 20000000000000000000/.test(sous.pourquoi), 'detention sous le minimum -> REFUSE avec les chiffres');
const sansLog = await attester(io({ sansLog: true }), demande);
vu(sansLog.etat === 'NON_MESURE', 'solde qui bouge sans log -> NON_MESURE, rien signe');
vu((() => { try { JSON.stringify(sansLog); return true; } catch (_) { return false; } })(), 'un refus de mesure se serialise en JSON (aucun BigInt fuit vers la route)');
const paire = await attester(io({ minPaired: 6n * 10n ** 18n }), demande);
vu(paire.etat === 'REFUSE' && /paired asset/.test(paire.pourquoi), 'paire exigee (6) et tenue 5 -> REFUSE');
vu((await attester({ ...io(), cle: null }, demande)).etat === 'PAS_OUVERT', 'pas de cle sur le serveur -> PAS_OUVERT');
/* (3) l action doit etre NEUVE : dans la fenetre, et apres la publication de la mission (une vieille tx ne fait pas la mission) */
const vieille = await attester(io({ blocTx: 1000 }), demande);
vu(vieille.etat === 'REFUSE' && /before your holding window/.test(vieille.pourquoi), 'tx d avant la fenetre -> REFUSE (' + vieille.pourquoi + ')');
const avantPose = await attester(io({ blocTx: 95000, poseeAu: 96000 }), demande);
vu(avantPose.etat === 'REFUSE' && /before the mission was posted/.test(avantPose.pourquoi), 'tx d avant la publication de la mission -> REFUSE');
vu((await attester(io({ blocTx: 95000, poseeAu: 95000 }), demande)).etat === 'REFUSE', 'meme bloc que la publication -> REFUSE (ordre non tranche)');
vu((await attester(io({ blocTx: 95000, poseeAu: 60000 }), demande)).ok === true, 'mission publiee AVANT la tx -> signe');
vu((await attester(io({ blocTx: TETE }), demande)).etat === 'NON_LU', 'tx plus recente que la fin de fenetre -> NON_LU (renvoyer)');
/* (5) Grok A11 / A8b (188a29e) : chaine lue != chaine signee ; tx deja payee (txUsed global on-chain) */
const autreChaine = await attester(io({ chaineLue: 1 }), demande);
vu(autreChaine.etat === 'PAS_OUVERT' && /reads chain 1 but signs for chain 8453/.test(autreChaine.pourquoi), 'chaine lue 1, signee 8453 -> rien signe (A11)');
const payee = await attester(io({ dejaPaye: true }), demande);
vu(payee.etat === 'REFUSE' && /already paid/.test(payee.pourquoi), 'tx deja payee par une autre mission -> REFUSE avant toute lecture d archive (A8b)');
/* (4) blocDebut EXACT quand les blocs ne font pas 2 s (anvil, autre chaine) : le dernier bloc <= windowEnd - window */
vu(r.blocs.debut === 99998 - 43200, 'Base (2 s) : debut = fin - 43 200 (' + r.blocs.debut + ')');
const ioBase = io(); await attester(ioBase, demande);
vu(ioBase.rpcEtat.entetes <= 4, 'Base : au plus 4 en-tetes lus par attestation (' + ioBase.rpcEtat.entetes + ') - une dichotomie seule en coute ~18');
const lent = await attester(io({ pasBloc: 1500, blocTx: 99990 }), demande);
const attendu = Math.floor((1500 * 99998 - 86400) / 1500); /* dernier b avec 1500 b <= 1500 fin - 86400 */
vu(lent.ok === true && lent.blocs.debut === attendu && lent.held.heldBlock === (60n * 10n ** 18n).toString(), 'blocs a 1 500 s : debut = ' + attendu + ' exactement, held 60 (les sorties de 80 000-90 000 sont hors fenetre) (' + JSON.stringify(lent.blocs || lent) + ')');
/* la constante de topic = l ABI COMPILEE (pas une signature tapee a la main) */
const ART = new URL('./contracts/out/BlockMissionsV3.sol/BlockMissionsV3.json', import.meta.url);
if (existsSync(ART)) {
  const ev = JSON.parse(readFileSync(ART, 'utf8')).abi.find((e) => e.type === 'event' && e.name === 'TaskPosted');
  vu(topic('TaskPosted(' + ev.inputs.map((i) => i.type).join(',') + ')') === TOPIC_TASK_POSTED && ev.inputs[0].indexed && ev.inputs[0].name === 'taskId', 'TOPIC_TASK_POSTED = l ABI compilee, taskId indexe en 1er');
} else console.log('  (artefact forge absent : parite topic/ABI NON verifiee ici)');
console.log('ok missions-attestation - ' + n + ' assertions ; NE PROUVE PAS une vraie chaine');
