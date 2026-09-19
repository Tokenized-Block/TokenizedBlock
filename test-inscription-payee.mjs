// test-inscription-payee.mjs — completerInscriptionPayee (hook V2) : on paie une fois, jamais deux, jamais zero.
// RPC simule : l etat payee / inscrit / prixInscrit du hook est fourni par le test, rien ne part sur un reseau.
import assert from 'node:assert/strict';
import { completerInscriptionPayee } from './lancer-pool-v2.js';
import { HOOK_V2, HOOK_V3 } from './tokenomics.js';
import { selecteur } from './pool.js';

const COMPTE = '0x' + '11'.repeat(20);
const AUTRE = '0x' + '22'.repeat(20);
const cle = { currency0: '0x0000000000000000000000000000000000000000', currency1: '0xb2' + '00'.repeat(19), fee: 0, tickSpacing: 200, hooks: HOOK_V2 };
const plan = { etat: 'PRET', etapes: [], cle, sqrtVise: 79228162514264337593543950336n, poolExiste: false, tx: { to: '0x', data: '0x' } };
const FRAIS = 380000000000000n;
const mot = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
const rpcAvec = ({ payee, inscrit, prix }) => async (m, p) => {
  assert.equal(m, 'eth_call');
  assert.equal(p[0].to, HOOK_V2);
  const s = p[0].data.slice(2, 10);
  if (s === selecteur('payee(bytes32)')) return mot(payee ? 1 : 0);
  if (s === selecteur('inscrit(bytes32)')) return mot(BigInt(inscrit));
  if (s === selecteur('prixInscrit(bytes32)')) return mot(prix);
  throw new Error('appel inattendu ' + s);
};
let n = 0;

// 1. rien de paye : UNE etape, payante, au montant demande, vers le hook V2
{
  const r = await completerInscriptionPayee({ rpc: rpcAvec({ payee: false, inscrit: 0, prix: 0 }), plan, compte: COMPTE, fraisWei: FRAIS });
  assert.equal(r.etat, 'APPROBATIONS'); assert.equal(r.v2, true);
  assert.equal(r.etapes.length, 1);
  assert.equal(r.etapes[0].to, HOOK_V2);
  assert.equal(BigInt(r.etapes[0].value), FRAIS);
  assert.equal(r.etapes[0].payant, true);
  n++;
}
// 2. deja paye, meme compte, meme prix : aucune etape, aucun second paiement
{
  const r = await completerInscriptionPayee({ rpc: rpcAvec({ payee: true, inscrit: COMPTE, prix: plan.sqrtVise }), plan, compte: COMPTE, fraisWei: FRAIS });
  assert.equal(r.etat, 'PRET'); assert.equal(r.etapes.length, 0); assert.equal(r.inscriptionPayee, true);
  n++;
}
// 3. deja paye mais autre prix (ou autre admin) : re-inscription GRATUITE (le contrat refuserait un second paiement)
{
  const r = await completerInscriptionPayee({ rpc: rpcAvec({ payee: true, inscrit: AUTRE, prix: 1n }), plan, compte: COMPTE, fraisWei: FRAIS });
  assert.equal(r.etapes.length, 1); assert.equal(BigInt(r.etapes[0].value), 0n); assert.equal(r.etapes[0].payant, false);
  n++;
}
// 4. prix du dollar non lu : NON_MESURE, rien a signer (jamais une inscription a 0)
{
  const r = await completerInscriptionPayee({ rpc: rpcAvec({ payee: false, inscrit: 0, prix: 0 }), plan, compte: COMPTE, fraisWei: null });
  assert.equal(r.etat, 'NON_MESURE'); assert.equal(r.etapes.length, 0);
  n++;
}
// 5. lecture du hook en echec : NON_MESURE, rien a signer
{
  const r = await completerInscriptionPayee({ rpc: async () => { throw new Error('noeud occupe'); }, plan, compte: COMPTE, fraisWei: FRAIS });
  assert.equal(r.etat, 'NON_MESURE'); assert.equal(r.etapes.length, 0);
  n++;
}
// 6. hook V3 donne : TOUTES les lectures et l etape visent le V3, jamais le V2 (bug mesure sur fork le 2026-09-19)
{
  const vus = new Set();
  const rpcV3 = async (m, p) => { vus.add(String(p[0].to).toLowerCase()); return rpcAvec({ payee: false, inscrit: 0, prix: 0 })(m, [{ ...p[0], to: HOOK_V2 }]); };
  const r = await completerInscriptionPayee({ rpc: rpcV3, plan, compte: COMPTE, fraisWei: FRAIS, hook: HOOK_V3 });
  assert.deepEqual([...vus], [HOOK_V3.toLowerCase()], 'lectures sur le V3 seulement');
  assert.equal(r.etapes[0].to, HOOK_V3, 'etape vers le V3');
  assert.equal(r.hook, HOOK_V3);
  n++;
}
console.log('test-inscription-payee:', n, 'cas, exit 0');
