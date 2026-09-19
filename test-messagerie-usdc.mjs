// test-messagerie-usdc.mjs — un message paye en USDC, et les pieges du melange de devises.
// ⛔ TEMOINS NEGATIFS : un transfert USDC n est PAS un message TBLOCK, et l inverse ; un USDC sous le prix est rejete.
import assert from 'node:assert/strict';
import { planMessagePaye, messageDepuisTransfert, deviseMessage, FRAIS_MESSAGE_USDC, FRAIS_MESSAGE_TBLOCK,
  DEVISES_MESSAGE } from './messagerie-blocks.js';
import { FEE_WALLET } from './frais-creation.js';
import { encodeTransferAvecMemo } from './messages.js';

const COMPTE = '0x1111111111111111111111111111111111111111';
const DE = '0xb200000000000000000000000000000000000001';
const A = '0xb200000000000000000000000000000000000002';
const USDC = DEVISES_MESSAGE.USDC.token, TBLOCK = DEVISES_MESSAGE.TBLOCK.token;
const hex = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
/* un faux noeud : EOA (pas de code), soldes par jeton */
const noeud = (soldes) => async (m, p) => {
  if (m === 'eth_getCode') return '0x';
  if (m === 'eth_call') return hex(soldes[String(p[0].to).toLowerCase()] ?? 0n);
  throw new Error('inattendu ' + m);
};

let n = 0;
const ok = async (nom, f) => { await f(); n++; console.log('  ok', nom); };

await ok('devises connues, devise inconnue -> null (pas de repli silencieux)', () => {
  assert.equal(deviseMessage('usdc').frais, FRAIS_MESSAGE_USDC);
  assert.equal(deviseMessage('TBLOCK').frais, FRAIS_MESSAGE_TBLOCK);
  assert.equal(deviseMessage('EUR'), null);
  assert.equal(FRAIS_MESSAGE_USDC, 500000n); /* 0,50 USDC a 6 decimales */
});

await ok('plan USDC : la transaction va au contrat USDC, pour 0,50 USDC vers le wallet de frais', async () => {
  const p = await planMessagePaye({ rpc: noeud({ [USDC.toLowerCase()]: 2_000_000n }), compte: COMPTE, de: DE, a: A,
    texte: 'gm', detientDe: true, devise: 'USDC' });
  assert.equal(p.etat, 'PRET');
  assert.equal(p.tx.to, USDC);
  assert.equal(p.frais, FRAIS_MESSAGE_USDC);
  assert.equal(p.devise, 'USDC');
  /* le calldata commence par transfer(FEE_WALLET, 500000) */
  assert.ok(p.tx.data.toLowerCase().startsWith(encodeTransferAvecMemo(FEE_WALLET, FRAIS_MESSAGE_USDC, '').toLowerCase().slice(0, 138)));
});

await ok('solde USDC insuffisant : refus, avec ce qui manque, en USDC', async () => {
  const p = await planMessagePaye({ rpc: noeud({ [USDC.toLowerCase()]: 100_000n }), compte: COMPTE, de: DE, a: A,
    texte: 'gm', detientDe: true, devise: 'USDC' });
  assert.equal(p.etat, 'REFUSE');
  assert.equal(p.manque, 400_000n);
  assert.equal(p.devise, 'USDC');
});

await ok('defaut inchange : sans devise, c est toujours TBLOCK (aucune coupure pour qui envoie deja)', async () => {
  const p = await planMessagePaye({ rpc: noeud({ [TBLOCK.toLowerCase()]: FRAIS_MESSAGE_TBLOCK }), compte: COMPTE, de: DE, a: A,
    texte: 'gm', detientDe: true });
  assert.equal(p.etat, 'PRET');
  assert.equal(p.tx.to, TBLOCK);
});

await ok('lecture : un transfert USDC n est pas un message TBLOCK, et l inverse (temoins negatifs)', () => {
  const t = { from: COMPTE, to: FEE_WALLET, value: FRAIS_MESSAGE_USDC, tx: '0xabc' };
  const txUsdc = { from: COMPTE, to: USDC, input: encodeTransferAvecMemo(FEE_WALLET, FRAIS_MESSAGE_USDC, 'tbx1 de=' + DE + ' a=' + A + ' gm') };
  assert.equal(messageDepuisTransfert(t, txUsdc, 'USDC').etat, 'MESSAGE');
  /* le meme transfert lu comme TBLOCK : sous le prix TBLOCK -> rejete */
  assert.equal(messageDepuisTransfert(t, txUsdc, 'TBLOCK').etat, 'REJETE');
  /* un USDC sous 0,50 -> rejete */
  assert.equal(messageDepuisTransfert({ ...t, value: 499_999n }, txUsdc, 'USDC').etat, 'REJETE');
});

console.log('test-messagerie-usdc:', n, 'cas, exit 0');
