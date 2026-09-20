/* test-messages-live.mjs — « Message marche pas » (Phil, 2026-09-20).
 * ================================================================================================
 * ⛔ CE QUE CE FICHIER PROUVE : le fil Live lit les messages payes des DEUX devises que
 *    `messagerie-blocks.js` connait, pas seulement le TBLOCK. Il compare la liste des jetons
 *    REELLEMENT interroges a `DEVISES_MESSAGE` — si quelqu un ajoute une devise, ce test le sait.
 * ⛔ CE QU IL NE PROUVE PAS : qu un message existe sur la chaine. Il n y en a eu aucun a ce jour
 *    (mesure du 2026-09-19 : « 0 paid message(s) »). Ce test prouve qu on REGARDE au bon endroit —
 *    ce qui est exactement ce qui manquait : un 0 qui venait d un angle mort, pas du silence.
 * TEMOIN ROUGE : `regarderAvant()` rejoue l ancienne boucle (un seul jeton, TBLOCK) et le test
 *    verifie qu elle RATAIT l USDC. Sans ce temoin, on ne saurait pas que le correctif corrige.
 */
import assert from 'node:assert/strict';
import { evenementsLive } from './fil-live.js';
import { DEVISES_MESSAGE } from './messagerie-blocks.js';
import { TBLOCK } from './tokenomics.js';
import { TOPIC_TRANSFER, topicAdresse } from './index-blocks.js';
import { FEE_WALLET } from './frais-creation.js';

let n = 0;
const eq = (a, b, m) => { n += 1; assert.strictEqual(a, b, m); };
const ok = (c, m) => { n += 1; assert.ok(c, m); };

/* ── Quels jetons le fil interroge-t-il pour les messages ? On note CHAQUE adresse demandee. ───── */
const interroges = new Set();
const rpcMouchard = async (methode, params) => {
  if (methode === 'eth_getLogs') {
    const f = params[0] || {};
    const t = f.topics || [];
    /* le filtre des messages : Transfer vers le wallet de frais */
    if (String(t[0] || '').toLowerCase() === TOPIC_TRANSFER
      && String(t[2] || '').toLowerCase() === topicAdresse(FEE_WALLET).toLowerCase()) {
      for (const a of [].concat(f.address || [])) interroges.add(String(a).toLowerCase());
    }
    return [];
  }
  throw new Error('methode inattendue : ' + methode);
};

await evenementsLive({
  rpc: rpcMouchard, poolManager: '0x498581ff718922c3f8e6a244956af099b2652b2b',
  blocks: [{ jeton: '0xb2000000000000000000000000000000000000aa', sym: 'MACHO', dec: 18 }],
  deBloc: 51554000, aBloc: 51554999,
  lireCreations: async () => ({ blocks: [], fenetresRatees: [] }),
  poolsDecouvertes: new Map(), lireTransferts: true,
});

const attendus = Object.values(DEVISES_MESSAGE).map((d) => String(d.token).toLowerCase());
ok(attendus.length >= 2, 'le module de messagerie connait au moins deux devises de paiement');
for (const t of attendus) {
  ok(interroges.has(t), 'le fil interroge la devise ' + t + ' pour les messages payes');
}
eq(interroges.size, attendus.length, 'il interroge EXACTEMENT les devises connues, ni plus ni moins');

/* ── TEMOIN ROUGE : l ancienne boucle ne regardait qu un seul jeton ────────────────────────────── */
function regarderAvant() {
  /* copie EXACTE de ce que faisait fil-live.js avant le 2026-09-20 */
  return new Set([String(TBLOCK).toLowerCase()]);
}
const avant = regarderAvant();
const usdc = attendus.find((t) => t !== String(TBLOCK).toLowerCase());
ok(usdc, 'une seconde devise existe bien (USDC)');
eq(avant.has(usdc), false, 'TEMOIN : l ancienne boucle ne regardait PAS cette devise');
eq(interroges.has(usdc), true, 'et la nouvelle, si');

/* ── La devise voyage avec l evenement : un compteur qui ne sait pas en quoi on a paye ment ────── */
ok(Object.values(DEVISES_MESSAGE).every((d) => typeof d.frais === 'bigint' && d.frais > 0n),
  'chaque devise porte son propre frais, en bigint');

console.log('test-messages-live : ' + n + ' assertions, exit 0');

/* ── BOUT EN BOUT : si un message payé existait, le fil le rendrait-il ? ────────────────────────
 * ⛔ Prouver qu on REGARDE au bon endroit ne prouve pas qu on SAIT RENDRE ce qu on y trouve. Phil lit
 *    « Messages 0 » comme une panne ; ce bloc repond a la vraie question : le jour ou il en envoie un,
 *    est-ce qu il apparait ? On fabrique donc un vrai transfert d USDC vers le wallet de frais, au
 *    moins au prix du message, paye par un smart wallet (le chemin `MESSAGE_FEE`, celui d un
 *    Coinbase Smart Wallet — c est ce que Phil utilise). */
const USDC = Object.values(DEVISES_MESSAGE).find((d) => d.decimales === 6);
const EXPEDITEUR = '0x37eb9b7ce0b51fe12fbf092026e001918128580a';
const TX_MSG = '0x' + 'e7'.repeat(32);
const mot32 = (v) => BigInt(v).toString(16).padStart(64, '0');
const logTransfertUsdc = {
  address: String(USDC.token).toLowerCase(),
  topics: [TOPIC_TRANSFER, topicAdresse(EXPEDITEUR), topicAdresse(FEE_WALLET)],
  data: '0x' + mot32(USDC.frais),
  blockNumber: '0x' + (51554500).toString(16),
  logIndex: '0x3',
  transactionHash: TX_MSG,
};
const rpcAvecMessage = async (methode, params) => {
  if (methode === 'eth_getLogs') {
    const f = params[0] || {};
    const t = f.topics || [];
    const adr = [].concat(f.address || []).map((x) => String(x).toLowerCase());
    if (String(t[0] || '').toLowerCase() === TOPIC_TRANSFER
      && String(t[2] || '').toLowerCase() === topicAdresse(FEE_WALLET).toLowerCase()
      && adr.includes(String(USDC.token).toLowerCase())) return [logTransfertUsdc];
    return [];
  }
  if (methode === 'eth_getTransactionByHash') {
    /* ⛔ `to` n est PAS le jeton : c est le relais du smart wallet. C est exactement le cas d un
     *    Coinbase Smart Wallet, et le module doit alors rendre MESSAGE_FEE (texte non lisible),
     *    pas REJETE — sinon le message de Phil disparaitrait du fil sans un mot. */
    return { hash: TX_MSG, from: EXPEDITEUR, to: '0x4444444444444444444444444444444444444444', input: '0x' };
  }
  throw new Error('methode inattendue : ' + methode);
};
const rm = await evenementsLive({
  rpc: rpcAvecMessage, poolManager: '0x498581ff718922c3f8e6a244956af099b2652b2b',
  blocks: [{ jeton: '0xb2000000000000000000000000000000000000aa', sym: 'MACHO', dec: 18 }],
  deBloc: 51554000, aBloc: 51554999,
  lireCreations: async () => ({ blocks: [], fenetresRatees: [] }),
  poolsDecouvertes: new Map(), lireTransferts: true,
});
const msgs = rm.evenements.filter((e) => e.type === 'MESSAGE');
eq(msgs.length, 1, 'un message paye en USDC PRODUIT bien un evenement MESSAGE dans le fil');
eq(msgs[0].devise, 'USDC', 'la devise du paiement voyage avec l evenement');
eq(msgs[0].signataire, EXPEDITEUR, 'le wallet qui a paye est nomme');
eq(msgs[0].aaOpaque, true, 'smart wallet : le texte n est pas lisible, et ca se dit au lieu de disparaitre');
eq(msgs[0].tx, TX_MSG, 'la transaction est celle du transfert');

console.log('test-messages-live (bout en bout) : ' + n + ' assertions au total, exit 0');
