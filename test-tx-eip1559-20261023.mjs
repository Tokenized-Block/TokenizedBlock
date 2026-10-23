/* test-tx-eip1559-20261023.mjs - L ENCODEUR DE TRANSACTION BRUTE (tx-eip1559.js) RENDRE LES OCTETS D UNE AUTRE IMPLEMENTATION.
 * AFFIRME : (1) RLP = les exemples de la specification (et les bords 55 / 56 octets) ; (2) quatre transactions type 2 signees =
 *   OCTET POUR OCTET la sortie de `cast mktx` (Foundry cast 1.7.1, commit 4072e48), leur hash = celui de `cast keccak`, l emetteur =
 *   `cast wallet address` de la cle ; (3) les refus (to absent, champ negatif / trop grand, prio > max, liste d acces) ; (4) une cle
 *   mal formee jette SANS citer la valeur ; (5) 7 MUTANTS du module (copies effacees) rougissent les vecteurs. Les cles sont les cles de
 *   TEST publiques 0x1, 0x2, 0xA11CE (jamais une vraie cle). Un noeud (anvil local) accepte ces octets : banc-slots-regleur-anvil.
 * Vecteurs (relances le 2026-10-23, hors ligne) :
 *   cast mktx --private-key 0x..01 --chain 8453 --nonce 0 --gas-limit 21000 --gas-price 2000000000 --priority-gas-price 1000000 --value 0 0x...dEaD
 *   cast mktx --private-key 0x..01 --chain 8453 --nonce 7 --gas-limit 300000 --gas-price 50000000 --priority-gas-price 1000 0x1111…1111 "settleMany(uint256[])" "[1,2,3]"
 *   cast mktx --private-key 0x..02 --chain 8453 --nonce 1000 --gas-limit 120000 --gas-price 12345678901 --priority-gas-price 12345678901 --value 1 0xAbCdEf0123456789aBcDeF0123456789AbCdEf01 "settle(uint256)" 42
 *   cast mktx --private-key 0x..0A11CE --chain 1 --nonce 0 --gas-limit 21000 --gas-price 1 --priority-gas-price 0 --value 1000000000000000000 0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf
 * NE PROUVE PAS : qu un noeud de Base accepte ces octets (aucune tx n est envoyee ici). */
import { strict as assert } from 'node:assert';
import { rlp, octetsEntier, signerEip1559, hashBrut, octetsASigner, normaliser } from './tx-eip1559.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const h = (o) => '0x' + Buffer.from(o).toString('hex');
const s = (t) => Uint8Array.from(Buffer.from(t, 'ascii'));

/* (1) RLP */
vu(h(rlp(s('dog'))) === '0x83646f67', 'rlp "dog"');
vu(h(rlp([s('cat'), s('dog')])) === '0xc88363617483646f67', 'rlp ["cat","dog"]');
vu(h(rlp(s(''))) === '0x80', 'rlp chaine vide');
vu(h(rlp([])) === '0xc0', 'rlp liste vide');
vu(h(rlp(octetsEntier(0))) === '0x80', 'rlp entier 0');
vu(h(rlp(Uint8Array.of(0))) === '0x00', 'rlp octet 0x00');
vu(h(rlp(octetsEntier(15))) === '0x0f', 'rlp entier 15');
vu(h(rlp(octetsEntier(127))) === '0x7f' && h(rlp(octetsEntier(128))) === '0x8180', 'rlp 127 / 128');
vu(h(rlp(octetsEntier(1024))) === '0x820400', 'rlp entier 1024');
vu(h(rlp([[], [[]], [[], [[]]]])) === '0xc7c0c1c0c3c0c1c0', 'rlp listes imbriquees (la theorie des ensembles)');
const lorem = 'Lorem ipsum dolor sit amet, consectetur adipisicing elit';
vu(lorem.length === 56 && h(rlp(s(lorem))) === '0xb838' + Buffer.from(lorem).toString('hex'), 'rlp chaine de 56 octets : 0xb8 0x38');
vu(h(rlp(s('a'.repeat(55)))).slice(0, 4) === '0xb7' && h(rlp(s('a'.repeat(55)))).length === 2 + 2 * 56, 'rlp chaine de 55 octets : 0xb7');
vu(h(rlp(s('a'.repeat(1024)))).slice(0, 8) === '0xb90400', 'rlp chaine de 1024 octets : 0xb9 0x0400');
vu(h(octetsEntier(0)) === '0x' && h(octetsEntier(256)) === '0x0100' && h(octetsEntier((1n << 256n) - 1n)) === '0x' + 'ff'.repeat(32), 'entiers minimaux big-endian');

/* (2) les vecteurs de cast mktx */
const K1 = '0x' + '0'.repeat(63) + '1', K2 = '0x' + '0'.repeat(63) + '2', KA = '0x' + '0'.repeat(59) + 'a11ce';
const V = [
  { cle: K1, de: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf', tx: { chainId: 8453, nonce: 0, gas: 21000, maxFeePerGas: 2000000000n, maxPriorityFeePerGas: 1000000n, to: '0x000000000000000000000000000000000000dEaD', value: 0, data: '0x' },
    brut: '0x02f86b82210580830f4240847735940082520894000000000000000000000000000000000000dead8080c001a09f6805040cc9ee79cdc27336b23c07bea3d73e03efb277186a4ffcf7720f18e3a02c497a75c2339ab88c17e96f7d3dc35a9b357ff2b08c91056c2f78238787b346',
    hash: '0x4a84bb747c5bdcefbf69ce1f6ae6e537884ec335f510781646765816786ed6e7' },
  { cle: K1, de: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf', tx: { chainId: 8453, nonce: 7, gas: 300000, maxFeePerGas: 50000000, maxPriorityFeePerGas: 1000, to: '0x1111111111111111111111111111111111111111', value: 0,
    data: '0x5ba3107b' + [32, 3, 1, 2, 3].map((x) => BigInt(x).toString(16).padStart(64, '0')).join('') },
    brut: '0x02f90110822105078203e88402faf080830493e094111111111111111111111111111111111111111180b8a45ba3107b00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000003c080a0eb3d3b5069dda33b74d5b7c90624342fa40ca561b58f85d61f5b366d13b49362a06a14811b363da6d140e4ba5e8aeb582bc9809ea73c6e2186cb76fa394ed23641' },
  { cle: K2, de: '0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF', tx: { chainId: 8453, nonce: 1000, gas: 120000, maxFeePerGas: 12345678901n, maxPriorityFeePerGas: 12345678901n, to: '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01', value: 1,
    data: '0x8df82800' + (42).toString(16).padStart(64, '0') },
    brut: '0x02f8958221058203e88502dfdc1c358502dfdc1c358301d4c094abcdef0123456789abcdef0123456789abcdef0101a48df82800000000000000000000000000000000000000000000000000000000000000002ac001a053275db2aa321fd83dc4a48d97b98cf84e548c6b9ac9b7d1b3b876677790a278a0034bf341748c10ce8f913c73ff9b277bfa8bc2301213d5595d42fd22c0b22744' },
  { cle: KA, de: '0xe05fcC23807536bEe418f142D19fa0d21BB0cfF7', tx: { chainId: 1, nonce: 0, gas: 21000, maxFeePerGas: 1, maxPriorityFeePerGas: 0, to: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf', value: 10n ** 18n, data: '0x' },
    brut: '0x02f86a01808001825208947e5f4552091a69125d5dfcb7b8c2659029395bdf880de0b6b3a764000080c001a0bb81a709ffbdd597bfc47627039df03bd0816b781a532679bfc48e6f68b73489a046a4b188865782ab35aaced091d6194face093404350e0cb3292efbfbed48a1a',
    hash: '0xc0cf67e278ee5dbc82ab51f85401d659909efeafac7588d0a4c6cb7764c7666b' },
];
V.forEach((v, i) => {
  const r = signerEip1559(v.tx, v.cle);
  vu(r.brut === v.brut, 'vecteur ' + (i + 1) + ' : octets = cast mktx');
  vu(r.de === v.de, 'vecteur ' + (i + 1) + ' : emetteur relu = cast wallet address');
  vu(r.hash === hashBrut(v.brut) && (!v.hash || r.hash === v.hash), 'vecteur ' + (i + 1) + ' : hash = keccak256(brut)' + (v.hash ? ' = cast keccak' : ''));
  vu(signerEip1559(v.tx, v.cle).brut === r.brut, 'vecteur ' + (i + 1) + ' : deterministe (RFC 6979)');
});
/* un champ change d une unite : d autres octets signes (rien n est ignore) */
for (const k of ['chainId', 'nonce', 'gas', 'maxFeePerGas', 'value']) {
  const t = { ...V[1].tx, [k]: BigInt(V[1].tx[k]) + 1n };
  vu(h(octetsASigner(t)) !== h(octetsASigner(V[1].tx)), 'le champ ' + k + ' entre dans les octets signes');
}
vu(h(octetsASigner({ ...V[1].tx, data: V[1].tx.data.slice(0, -2) + '04' })) !== h(octetsASigner(V[1].tx)), 'data entre dans les octets signes');
vu(h(octetsASigner({ ...V[1].tx, to: '0x' + '22'.repeat(20) })) !== h(octetsASigner(V[1].tx)), 'to entre dans les octets signes');

/* (3) les refus */
const jette = (f, m) => { let e = null; try { f(); } catch (x) { e = x; } vu(e instanceof Error, m + ' : refuse'); return e; };
jette(() => normaliser({ ...V[0].tx, to: null }), 'pas de destinataire (creation)');
jette(() => normaliser({ ...V[0].tx, to: '0x1234' }), 'destinataire mal forme');
jette(() => normaliser({ ...V[0].tx, nonce: -1 }), 'nonce negatif');
jette(() => normaliser({ ...V[0].tx, gas: 1n << 64n }), 'gas > 2^64 - 1');
jette(() => normaliser({ ...V[0].tx, maxFeePerGas: 1n << 256n }), 'maxFeePerGas > 2^256 - 1');
jette(() => normaliser({ ...V[0].tx, maxPriorityFeePerGas: 3, maxFeePerGas: 2 }), 'prio > max');
jette(() => normaliser({ ...V[0].tx, chainId: 0 }), 'chainId nul');
jette(() => normaliser({ ...V[0].tx, data: '0x123' }), 'data impaire');
jette(() => normaliser({ ...V[0].tx, accessList: [{ address: V[0].tx.to, storageKeys: [] }] }), 'liste d acces');

/* (4) une cle mal formee jette sans citer la valeur */
const secret = '0xdeadbeefnothex';
const e = jette(() => signerEip1559(V[0].tx, secret), 'cle mal formee');
vu(!String(e.message).includes('deadbeef'), 'le message d erreur ne cite pas la cle');
const e2 = jette(() => signerEip1559(V[0].tx, '0x' + 'f'.repeat(64)), 'cle >= n');
vu(!String(e2.message).includes('ffff'), 'le message d erreur ne cite pas la cle (hors bornes)');
/* (5) MUTANTS sur une COPIE du module (a cote de la source pour ses imports relatifs, effacee) : les vecteurs de cast doivent ROUGIR */
{
  const { readFileSync, writeFileSync, unlinkSync } = await import('node:fs');
  const src = readFileSync(new URL('./tx-eip1559.js', import.meta.url), 'utf8');
  const M = [
    ['v = 27 + recid (style legacy)', 'octetsEntier(recid), octetsEntier(r)', 'octetsEntier(27 + recid), octetsEntier(r)'],
    ['sans la liste d acces vide', 'octetsEntier(n.value), deHex(n.data), []];', 'octetsEntier(n.value), deHex(n.data)];'],
    ['seuil RLP 55 au lieu de 56', 'if (n < 56) return Uint8Array.of(base + n);', 'if (n < 55) return Uint8Array.of(base + n);'],
    ['un octet < 0x80 encode avec prefixe', 'if (x.length === 1 && x[0] < 0x80) return x;', 'if (x.length === 1 && x[0] < 0x7f) return x;'],
    ['entier 0 encode 0x00', 'if (v === 0n) return new Uint8Array(0);', 'if (v === 0n) return new Uint8Array(1);'],
    ['digest sans le type 0x02', 'const digest = hex(keccak256(concat(Uint8Array.of(2), rlp(liste(n)))));', 'const digest = hex(keccak256(rlp(liste(n))));'],
    ['prio et max inverses', 'octetsEntier(n.nonce), octetsEntier(n.maxPriorityFeePerGas), octetsEntier(n.maxFeePerGas),', 'octetsEntier(n.nonce), octetsEntier(n.maxFeePerGas), octetsEntier(n.maxPriorityFeePerGas),'],
  ];
  for (const [nom, de, vers] of M) {
    vu(src.split(de).length === 2, 'mutant « ' + nom + ' » : ancre unique');
    const url = new URL('./.mutant-tx-eip1559-' + process.pid + '-' + n + '.js', import.meta.url);
    writeFileSync(url, src.replace(de, () => vers));
    let rouge = false;
    try {
      const X = await import(url.href);
      rouge = V.some((v) => { try { return X.signerEip1559(v.tx, v.cle).brut !== v.brut; } catch (_) { return true; } })
        || h(X.rlp(s('a'.repeat(55)))).slice(0, 4) !== '0xb7' || h(X.rlp(s(lorem))).slice(0, 6) !== '0xb838' || h(X.rlp(X.octetsEntier(127))) !== '0x7f';
    }
    finally { try { unlinkSync(url); } catch (_) {} }
    vu(rouge, 'MUTANT « ' + nom + ' » : un vecteur de cast (ou le bord RLP 55 / 56) ROUGIT');
  }
}
console.log('ok tx-eip1559 - ' + n + ' assertions ; NE PROUVE PAS qu un noeud de Base accepte ces octets');
