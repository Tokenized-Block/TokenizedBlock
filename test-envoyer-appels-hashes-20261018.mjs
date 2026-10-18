/* test-envoyer-appels-hashes-20261018.mjs - UNE SUITE DE N SIGNATURES REND SES N HASHES, ET L AUTO-ROLL LIT LES ROLLED DE CHACUN
 *   (revue adverse 2026-10-18, HAUT : la suite rendait le DERNIER envoi seul — 5 rolls signes un par un = 1 Rolled lu, 4 rolls payes jamais regles).
 * AFFIRME (EXECUTION des fonctions extraites de app.html, wallet et noeud simules) : (1) envoyerAppels, wallet sans lot atomique, 6 appels
 *   confirmes -> etat CONFIRME, hash = le dernier, hashes = les 6 dans l ordre ; (2) un echec au 4e -> l echec remonte AVEC les 3 hashes deja
 *   sur la chaine ; (3) chemin atomique : les hashes du lot rendus par envoi.js (tous les recus) passent tels quels ; (4) recusLogs lit le recu
 *   de CHAQUE hash (pas seulement r.hash) et compte ceux qui manquent ; (5) autoRollLot lit les Rolled par recusLogs(r), jamais par recuDe(r.hash)
 *   seul ; (6) envoi.js : envoyerLotAtomique rend `hashes` (tous les recus du lot quand le wallet les donne).
 * NE PROUVE PAS : un vrai wallet. */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tranche = (debut, fin) => { const i = app.indexOf(debut); assert.ok(i > 0, 'trouve : ' + debut); const j = app.indexOf(fin, i); assert.ok(j > i, 'fin trouvee : ' + fin); return app.slice(i, j); };
const srcEnv = tranche('async function envoyerAppels(', 'const recuDe = ');
const H = (k) => '0x' + String(k).repeat(64).slice(0, 64);
function fabrique({ echecA = 0, atomique = null }) {
  const vus = [];
  const envoyerLotAtomique = async () => atomique || { etat: 'ECHEC_ENVOI', sendCallsUnsupported: true };
  const envoyerDepuisWallet = async ({ data }) => { vus.push(data); const k = vus.length; return k === echecA ? { etat: 'REFUSE_PAR_UTILISATEUR', pourquoi: 'declined' } : { etat: 'CONFIRME', hash: H(k) }; };
  const f = new Function('envoyerLotAtomique', 'envoyerDepuisWallet', 'rpc', 'CHAINE', 'window', srcEnv + '\nreturn envoyerAppels;');
  return { envoyerAppels: f(envoyerLotAtomique, envoyerDepuisWallet, async () => null, 8453, { ethereum: {} }), vus };
}
const appels = Array.from({ length: 6 }, (_, i) => ({ to: '0x' + '11'.repeat(20), data: '0x0' + i }));
/* (1) */
{ const { envoyerAppels, vus } = fabrique({}); const r = await envoyerAppels(appels, '0x' + 'ab'.repeat(20));
  vu(vus.length === 6 && r.etat === 'CONFIRME' && r.hash === H(6), 'suite : 6 envois, CONFIRME, hash = le dernier');
  vu(Array.isArray(r.hashes) && r.hashes.length === 6 && r.hashes.every((h, i) => h === H(i + 1)), 'suite : les 6 hashes, dans l ordre (lus : ' + (r.hashes || []).length + ')'); }
/* (2) */
{ const { envoyerAppels } = fabrique({ echecA: 4 }); const r = await envoyerAppels(appels, '0x' + 'ab'.repeat(20));
  vu(r.etat === 'REFUSE_PAR_UTILISATEUR' && r.hashes.length === 3, 'echec au 4e : l echec remonte avec les 3 hashes deja sur la chaine'); }
/* (3) */
{ const { envoyerAppels } = fabrique({ atomique: { etat: 'CONFIRME', hash: H(9), hashes: [H(7), H(8), H(9)] } }); const r = await envoyerAppels(appels, '0x' + 'ab'.repeat(20));
  vu(r.etat === 'CONFIRME' && r.hashes.length === 3, 'lot atomique : les hashes de tous ses recus passent'); }
/* (4) */
const srcRecus = tranche('async function recusLogs(', '\n}\n') + '\n}\n';
const recusLogs = new Function('recuDe', srcRecus + '\nreturn recusLogs;')(async (h) => (h === H(3) ? null : { logs: [{ h }] }));
{ const r = await recusLogs({ hash: H(4), hashes: [H(1), H(2), H(3), H(4)] });
  vu(r.n === 4 && r.logs.length === 3 && r.manque === 1 && r.logs.map((l) => l.h).join() === [H(1), H(2), H(4)].join(), 'recusLogs : le recu de CHAQUE hash, sans doublon, les manquants comptes');
  const r2 = await recusLogs({ hash: H(5) });
  vu(r2.n === 1 && r2.logs.length === 1, 'sans hashes : r.hash seul'); }
/* (5) */
const lot = tranche('async function autoRollLot(', '/* ── petits outils partages');
vu(/const lus = await recusLogs\(r\), rolled = lireRolledTous\(lus\.logs, contrat\);/.test(lot) && !/recuDe\(r\.hash\)/.test(lot), 'autoRollLot : les Rolled de TOUS les recus');
vu(/const lusS = await recusLogs\(rs\), st = lireSettledTous\(lusS\.logs, contrat\);/.test(lot), 'autoRollLot : les Settled de tous les recus du settle');
/* (6) */
const env = readFileSync(new URL('./envoi.js', import.meta.url), 'utf8');
vu(/hashes: Array\.isArray\(aa\.hashes\) && aa\.hashes\.length \? aa\.hashes : \[aa\.hash\]/.test(env) && /hashes: \(v\.recus \|\| \[\]\)\.map\(/.test(env), 'envoi.js : le lot atomique rend les hashes de tous ses recus');
console.log('ok envoyer-appels-hashes - ' + n + ' assertions ; NE PROUVE PAS un vrai wallet');
