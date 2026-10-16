// test-inscription-payee-lue-au-bloc-confirme-20261016.mjs - 2026-10-16, UNIT (0xb200..4f27), wallet 0x31e0.
// MESURE (mainnet.base.org) : inscrireAvecCaution 0x8beeda0f payee 0.000715168377582366 ETH (tx 0x5afe0b77.., bloc 0x3240d72,
// status 1) ; au bloc courant, sur la pool 0x79a40c32.. : payee = 1, inscrit = createurs = 0x31e0, prixInscrit = 10000 << 96.
// Puis l app a REPROPOSE la meme inscription payante. `signerEtapeLancement` relit (calculerLancement) des la confirmation,
// sur un noeud tire dans une rotation : un noeud en retard d un bloc lit encore createurs = 0 et le plan refacture.
// Ce test : (1) lecteur en retard sur 'latest', a jour au bloc confirme -> avec blocMin, AUCUNE etape payante ;
// (2) noeud qui n a pas encore le bloc -> NON_MESURE, rien demande ; (3) app.html note le bloc et le passe au plan.
import { readFileSync } from 'node:fs';
import { completerInscriptionPayee } from './lancer-pool-v2.js';
import { selecteur, poolId } from './pool.js';
import { HOOK_7030 } from './tokenomics.js';
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log('ok  ' + m); else { ko++; console.log('KO  ' + m); } };
const COMPTE = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b', UNIT = '0xb2000000000000000000007afa7ed748b0874f27';
const cle = { currency0: '0x0000000000000000000000000000000000000000', currency1: UNIT, fee: 0, tickSpacing: 200, hooks: HOOK_7030 };
const id = poolId(cle);
ok(id === '0x79a40c325329a45db0874896a0ecd6f24ca2df12e1deb909bdfb3e5045b1c321', 'poolId = celui de l evenement du hook (tx 0x5afe..)');
const SQRT = (10000n << 96n).toString();
const BLOC = '0x3240d72';
const mot = (x) => '0x' + BigInt(x).toString(16).padStart(64, '0');
const S = (f) => '0x' + selecteur(f);
const lecteur = ({ aJourA }) => async (m, p) => {
  if (m !== 'eth_call') throw new Error('inattendu ' + m);
  const [{ data }, tag] = p;
  const ajour = tag !== 'latest' && aJourA(tag);
  if (tag !== 'latest' && !ajour) throw new Error('header not found');
  const d = String(data);
  if (d.startsWith(S('payee(bytes32)'))) return mot(ajour ? 1 : 0);
  if (d.startsWith(S('inscrit(bytes32)'))) return ajour ? mot(COMPTE) : mot(0);
  if (d.startsWith(S('prixInscrit(bytes32)'))) return mot(ajour ? SQRT : 0);
  if (d.startsWith(S('createurs(bytes32)'))) return (ajour ? mot(COMPTE) : mot(0)) + '0'.repeat(128);
  if (d.startsWith(S('fraisVie()'))) return mot(300000000000000n);
  if (d.startsWith(S('fraisCreation()'))) return mot(700000000000000n);
  if (d.startsWith(S('neDuRouteur(address,bytes32)'))) return mot(1);
  throw new Error('selecteur inconnu ' + d.slice(0, 10));
};
const base = { rpc: null, plan: { etat: 'APPROBATIONS', etapes: [], cle, sqrtVise: SQRT, poolExiste: false }, compte: COMPTE,
  fraisWei: 300000000000000n, hook: HOOK_7030, caution: { minimum: 415168377582366n, devise: cle.currency0 },
  sel: '0xbad3ec41bf6957ea0f739961e585a2a13b7739530e45ba95e89210fe03f3dab9' };
const payantes = (p) => (p.etapes || []).filter((e) => e && e.payant);
// temoin : sans bloc confirme, un noeud en retard refait payer (le defaut vu en prod)
const t = await completerInscriptionPayee({ ...base, rpc: lecteur({ aJourA: () => true }) });
ok(payantes(t).length === 1 && BigInt(payantes(t)[0].value) === 715168377582366n, 'temoin : noeud en retard sur latest -> 0.000715 redemande (defaut reproduit)');
const r = await completerInscriptionPayee({ ...base, rpc: lecteur({ aJourA: () => true }), blocMin: BLOC });
ok(payantes(r).length === 0, 'blocMin = bloc confirme -> aucune etape payante');
ok(r.etat === 'PRET' && r.inscriptionPayee === true, 'blocMin -> plan PRET, inscriptionPayee vraie (etat ' + r.etat + ')');
const q = await completerInscriptionPayee({ ...base, rpc: lecteur({ aJourA: () => false }), blocMin: BLOC });
ok(q.etat === 'NON_MESURE' && (q.etapes || []).length === 0, 'noeud sans le bloc confirme -> NON_MESURE, rien demande');
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const i0 = html.indexOf('async function signerEtapeLancement(');
const corps = i0 >= 0 ? html.slice(i0, html.indexOf('async function verifierLancement(', i0)) : '';
ok(/eth_getTransactionReceipt/.test(corps) && /blocInscriptionConfirmee|noterBlocInscrit/.test(corps), 'signerEtapeLancement note le bloc de l inscription confirmee');
const j0 = html.indexOf('async function calculerLancement(');
const calc = j0 >= 0 ? html.slice(j0, j0 + 40000) : '';
ok(/completerInscriptionPayee\(\{[^}]*blocMin:/.test(calc), 'calculerLancement passe blocMin au plan');
console.log(ko ? 'FAIL inscription-payee-bloc-confirme ' + ko + '/' + n + ' KO' : 'ALL PASS inscription-payee-bloc-confirme ' + n + ' assertions');
process.exit(ko ? 1 : 0);
