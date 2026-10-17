/* test-verificateur-missions-20261017.mjs - LE VERIFIER DE BlockMissionsV3 MESURE AVANT DE SIGNER, ET SIGNE CE QUE LE CONTRAT RECALCULE.
 * AFFIRME (EXECUTE, pur) : (1) PARITE : digestClaim (JS) == claimDigest du contrat V3 (af21556) pour les memes entrees — valeur IMPRIMEE par
 *   forge (DigestPariteTest, contrat 0x5615…b72f, chainId 31337) ; (2) minimumFenetre rend le minimum EXACT a rebours, un sac passe et
 *   rendu dans la fenetre fait tomber le minimum, un log en double ne compte qu une fois, et le TEMOIN (solde lu au debut) qui ne colle pas
 *   -> NON_MESURE ; (3) verifierTache : status, payeur = completer, log EMIS PAR la cible ; (4) lireTransferts : tranches, deux requetes,
 *   une reponse non-liste = erreur, jamais une tranche vide.
 * NE PROUVE PAS : la lecture sur Base (voir le temoin TEMOIN_CHAINE=1 plus bas), ni la signature KMS (hors depot). */
import { strict as assert } from 'node:assert';
import { verifierTache, minimumFenetre, lireTransferts, donneesClaim, digestClaim, TOPIC_TRANSFER } from './verificateur-missions.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
/* (1) parite avec forge : valeurs imprimees par `forge test --match-contract DigestPariteTest -vv` sur af21556 (2026-10-17) */
const d = donneesClaim({ chainId: 31337, contrat: '0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f', taskId: 0, completer: '0x0000000000000000000000000000000000000b0b',
  txHash: '0x5194ead3df889a15f3d33e47bcc128114dbb9dcd1147f2de8a8ffba6a815f248', heldBlock: 60n * 10n ** 18n, heldPaired: 3n * 10n ** 18n, window: 0,
  windowEnd: 1800000000, deadline: 1800000600 });
vu(digestClaim(d) === '0xcaa01b55b9c320fdd7ac74c75322cc36c1e7e4a46c67a25b05e2c6bde9aaf414', 'PARITE : digest JS == claimDigest du contrat (' + digestClaim(d) + ')');
vu(digestClaim({ ...d, message: { ...d.message, heldPaired: String(4n * 10n ** 18n) } }) !== digestClaim(d), 'le digest lie heldPaired');
vu(digestClaim({ ...d, message: { ...d.message, windowEnd: '1800000001' } }) !== digestClaim(d), 'le digest lie windowEnd');
vu(d.domain.version === '3' && d.types.Claim.length === 8, 'domaine version 3, 8 champs');
/* (2) minimum exact */
const J = '0x' + 'aa'.repeat(20), C = '0x' + '11'.repeat(20), X = '0x' + '22'.repeat(20);
const adr = (a) => '0x' + a.slice(2).padStart(64, '0');
const tr = (de, vers, m, bloc, idx, h = '0x' + bloc.toString(16).padStart(64, '0')) => ({ address: J, topics: [TOPIC_TRANSFER, adr(de), adr(vers)], data: '0x' + m.toString(16).padStart(64, '0'), blockNumber: '0x' + bloc.toString(16), logIndex: '0x' + idx.toString(16), transactionHash: h });
/* debut 100 ; +50 (150) ; -120 (30) ; +100 (130) = fin. minimum = 30 */
const lg = [tr(X, C, 50n, 10, 0), tr(C, X, 120n, 20, 1), tr(X, C, 100n, 30, 0)];
let r = minimumFenetre({ jeton: J, compte: C, soldeFin: 130n, soldeDebutLu: 100n, transferts: lg });
vu(r.ok && r.minimum === 30n && r.soldeDebut === 100n, 'minimum exact sur la fenetre (' + JSON.stringify({ ...r, minimum: String(r.minimum), soldeDebut: String(r.soldeDebut) }) + ')');
r = minimumFenetre({ jeton: J, compte: C, soldeFin: 130n, soldeDebutLu: 100n, transferts: [...lg].reverse() });
vu(r.ok && r.minimum === 30n, 'ordre des logs indifferent (tri bloc/logIndex)');
/* le sac passe : 100 tenus, rendus a X puis repris -> minimum 0 : le meme sac ne qualifie pas deux wallets */
const sac = [tr(C, X, 100n, 10, 0), tr(X, C, 100n, 12, 0)];
r = minimumFenetre({ jeton: J, compte: C, soldeFin: 100n, soldeDebutLu: 100n, transferts: sac });
vu(r.ok && r.minimum === 0n, 'un sac sorti puis revenu dans la fenetre -> minimum 0');
/* doublon (log present dans les deux requetes from/to) */
r = minimumFenetre({ jeton: J, compte: C, soldeFin: 130n, soldeDebutLu: 100n, transferts: [...lg, lg[1]] });
vu(r.ok && r.minimum === 30n, 'un log en double ne compte qu une fois');
/* temoin : un jeton qui bouge le solde sans log */
r = minimumFenetre({ jeton: J, compte: C, soldeFin: 130n, soldeDebutLu: 99n, transferts: lg });
vu(!r.ok && r.etat === 'NON_MESURE' && /without logs/.test(r.pourquoi), 'temoin : solde de debut lu != reconstruit -> NON_MESURE');
r = minimumFenetre({ jeton: J, compte: C, soldeFin: 10n, soldeDebutLu: 100n, transferts: lg });
vu(!r.ok && /negative/.test(r.pourquoi), 'reconstruction negative -> NON_MESURE');
r = minimumFenetre({ jeton: J, compte: C, soldeFin: 130n, soldeDebutLu: 100n, transferts: [...lg, { ...tr(X, C, 999n, 15, 0), address: '0x' + 'bb'.repeat(20) }] });
vu(r.ok && r.minimum === 30n, 'un Transfer emis par un AUTRE contrat est ignore');
/* (3) la tache */
const T = '0x' + '33'.repeat(20), TOPIC = '0x' + '44'.repeat(32), H = '0x' + 'ab'.repeat(32);
const recu = (status, logs) => ({ status, transactionHash: H, logs });
vu(verifierTache({ tx: { hash: H, from: C }, recu: recu('0x1', [{ address: T, topics: [TOPIC] }]), completer: C, target: T, topic0: TOPIC }).ok, 'tache prouvee');
vu(verifierTache({ tx: { hash: H, from: X }, recu: recu('0x1', [{ address: T, topics: [TOPIC] }]), completer: C, target: T, topic0: TOPIC }).etat === 'REFUSE', 'tx d un autre -> REFUSE');
vu(verifierTache({ tx: { hash: H, from: C }, recu: recu('0x1', [{ address: X, topics: [TOPIC] }]), completer: C, target: T, topic0: TOPIC }).etat === 'REFUSE', 'evenement emis par un autre contrat -> REFUSE');
vu(verifierTache({ tx: { hash: H, from: C }, recu: recu('0x0', [{ address: T, topics: [TOPIC] }]), completer: C, target: T, topic0: TOPIC }).etat === 'REFUSE', 'tx echouee -> REFUSE');
vu(verifierTache({ tx: null, recu: null, completer: C, target: T, topic0: TOPIC }).etat === 'NON_LU', 'recu illisible -> NON_LU');
/* (4) lecture par tranches */
const appels = [];
const faux = async (m, [f]) => { appels.push([f.fromBlock, f.toBlock, f.topics[1] ? 'de' : 'vers']); return []; };
await lireTransferts({ rpc: faux, jeton: J, compte: C, deBloc: 100, aBloc: 5100, tranche: 2000 });
vu(appels.length === 6 && appels[0][0] === '0x65' && appels.at(-1)[1] === '0x13ec', 'tranches ]100, 5100] en 3 x 2 requetes (' + JSON.stringify(appels) + ')');
await assert.rejects(lireTransferts({ rpc: async () => ({ error: 'x' }), jeton: J, compte: C, deBloc: 0, aBloc: 10 }), /not a list/);
n += 1;
/* temoin chaine reel (facultatif) : AAPLc, un compte actif, une fenetre recente lisible par publicnode (< 10 000 blocs) */
if (process.env.TEMOIN_CHAINE === '1') {
  const AAPLC = '0xb200000000000000000000c2e324d24d7eecd1fb'; /* pools-actions-aerodrome.js */
  /* ⛔ MESURE 2026-10-17 : publicnode sert eth_getLogs mais refuse TOUT eth_call historique (meme a -100 blocs) ; drpc sert l etat
   *   historique mais plafonne eth_getLogs a 10 blocs. Logs sur publicnode, soldes historiques sur drpc. */
  const via = (url) => async (m, p) => { const x = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }) }).then((y) => y.json()); if (x.error) throw new Error(x.error.message); return x.result; };
  const rpc = via('https://base-rpc.publicnode.com'), rpcEtat = via('https://base.drpc.org');
  /* ⛔ MESURE 2026-10-17 : publicnode refuse eth_call a -3000 blocs (« Archive requests require a personal token ») : un noeud sans
   *   archive ne garde l etat que des derniers blocs. Temoin sur 100 blocs ; en prod, la fenetre de 24 h exige le noeud d ARCHIVE. */
  const tete = parseInt(await rpc('eth_blockNumber', []), 16), fin = tete - 5, debut = fin - 100;
  const recents = await rpc('eth_getLogs', [{ address: AAPLC, topics: [TOPIC_TRANSFER], fromBlock: '0x' + (debut + 1).toString(16), toBlock: '0x' + fin.toString(16) }]);
  const compte = recents.length ? '0x' + recents[0].topics[2].slice(26) : null;
  vu(compte, 'un compte AAPLc actif trouve');
  const solde = async (b) => BigInt(await rpcEtat('eth_call', [{ to: AAPLC, data: '0x70a08231' + compte.slice(2).padStart(64, '0') }, '0x' + b.toString(16)]));
  const logs = await lireTransferts({ rpc, jeton: AAPLC, compte, deBloc: debut, aBloc: fin, tranche: 1000 });
  const t = minimumFenetre({ jeton: AAPLC, compte, soldeFin: await solde(fin), soldeDebutLu: await solde(debut), transferts: logs });
  vu(t.ok && logs.length > 0, 'TEMOIN CHAINE : AAPLc ' + compte + ', ' + logs.length + ' logs sur 100 blocs, reconstruction == solde lu au debut (' + (t.ok ? 'min ' + t.minimum : t.pourquoi) + ')');
  console.log('    temoin : ' + compte + ' ' + logs.length + ' logs, min ' + t.minimum + ', debut ' + t.soldeDebut);
}
console.log('ok verificateur-missions - ' + n + ' assertions' + (process.env.TEMOIN_CHAINE === '1' ? ' (dont temoin chaine AAPLc)' : ' ; temoin chaine : TEMOIN_CHAINE=1'));
