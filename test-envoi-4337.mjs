// test-envoi-4337.mjs — un recu a 0x1 ne prouve rien sur un smart account.
//
// ⛔⛔ MESURE QUI A DICTE CE FICHIER : la transaction de Phil du 2026-09-20
//    (0xc99610540d3cde684b56e0e364e08c13c44d270c6d88e27a5ec917f6eebb463a) a un reçu status 0x1, et
//    son UserOperationEvent porte success = FALSE. Le gas a ete paye, rien n a ete verse, et
//    l ancienne version de `envoi.js` aurait rendu CONFIRME. C est « un evenement n est pas une
//    transaction » en costume ERC-4337 : le reçu externe decrit le travail du BUNDLER.
import assert from 'node:assert/strict';
import { verdictUserOp, TOPIC_USER_OP } from './envoi.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };

const mot = (v) => BigInt(v).toString(16).padStart(64, '0');
const logUO = (succes) => ({ address: '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789',
  topics: [TOPIC_USER_OP, '0x' + '11'.repeat(32), '0x' + '22'.repeat(32), '0x' + '00'.repeat(32)],
  data: '0x' + mot(7) + mot(succes ? 1 : 0) + mot(1000) + mot(2000) });
const logAutre = { address: '0x' + 'ab'.repeat(20), topics: ['0x' + 'cd'.repeat(32)], data: '0x' };

// ══ 1. TROIS REPONSES, PAS DEUX ═════════════════════════════════════════════════════════════════
eq(verdictUserOp({ logs: [logUO(true)] }), true, 'UserOp reussie -> true');
eq(verdictUserOp({ logs: [logUO(false)] }), false, 'UserOp echouee -> false');
// ⛔ LE TEMOIN QUI PROTEGE TOUS LES ENVOIS ORDINAIRES : sans UserOperationEvent, la reponse est null,
//    donc l appelant garde CONFIRME. Rendre `false` par defaut casserait chaque transaction normale.
eq(verdictUserOp({ logs: [logAutre] }), null, 'aucun UserOperationEvent -> null, pas false');
eq(verdictUserOp({ logs: [] }), null, 'aucun log -> null');
eq(verdictUserOp({}), null, 'recu sans logs -> null');
eq(verdictUserOp(null), null, 'recu absent -> null');

// ══ 2. PLUSIEURS UserOp DANS UNE SEULE TRANSACTION DE BUNDLER ═══════════════════════════════════
// ⛔ Ne regarder que la PREMIERE ferait passer un echec pour un succes.
eq(verdictUserOp({ logs: [logUO(true), logUO(false)] }), false, 'une seule echouee suffit a dire false');
eq(verdictUserOp({ logs: [logUO(false), logUO(true)] }), false, 'quel que soit son rang');
eq(verdictUserOp({ logs: [logUO(true), logAutre, logUO(true)] }), true, 'toutes reussies -> true');

// ══ 3. DONNEES ABIMEES : on n invente pas un verdict ════════════════════════════════════════════
eq(verdictUserOp({ logs: [{ topics: [TOPIC_USER_OP], data: '0x' }] }), true,
  'un log tronque est ignore pour le drapeau, mais sa presence reste vue');
eq(verdictUserOp({ logs: [{ topics: null, data: '0x' }] }), null, 'topics absents -> ignore');

console.log('test-envoi-4337 : ' + n + ' assertions, OK');
