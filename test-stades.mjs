// test-stades.mjs — la seconde source de capitalisation (marche public) ne doit JAMAIS effacer la
// lecture on-chain, ni ranger un block non lu dans un palier.
// ⛔ TEMOIN NEGATIF OBLIGATOIRE : le meme block SANS capUsdMarche doit rester dans NON_LU. Sans ce
//    temoin, un test qui trouve « Sprout » ne prouve pas que c est le marche qui l y a mis.
import assert from 'node:assert/strict';
import { stadesDesBlocks } from './stades.js';

let n = 0;
const ok = (nom, f) => { f(); n++; console.log('  ok', nom); };
const groupeDe = (r, adr) => r.groupes.find((g) => g.blocks.some((b) => b.adr === adr.toLowerCase()));
const blocDe = (r, adr) => r.groupes.flatMap((g) => g.blocks).find((b) => b.adr === adr.toLowerCase());

const A = '0xb20000000000000000000000000000000000000a';
const B = '0xb20000000000000000000000000000000000000b';

ok('temoin negatif : sans capUsdMarche, un block non lu reste dans NON_LU', () => {
  const r = stadesDesBlocks({ blocks: [{ adr: A, sym: 'AAA', vie: null, etatVie: 'NON_LUE' }], ethUsd: 4000 });
  assert.equal(groupeDe(r, A).cle, 'NON_LU');
  assert.equal(r.parMarche, 0);
  assert.equal(blocDe(r, A).source, 'RIEN');
  assert.equal(blocDe(r, A).capUsd, null);
});

ok('la FDV du marche juge le palier et se declare source MARCHE', () => {
  const r = stadesDesBlocks({ blocks: [{ adr: A, sym: 'AAA', vie: null, etatVie: 'NON_LUE', capUsdMarche: 98_564 }], ethUsd: 4000 });
  assert.equal(groupeDe(r, A).cle, 'BRANCHE'); /* 98 564 $ : au-dessus de 1e4, sous 1e5 */
  assert.equal(blocDe(r, A).source, 'MARCHE');
  assert.equal(blocDe(r, A).capUsd, 98_564);
  assert.equal(r.parMarche, 1);
});

ok('la lecture on-chain gagne sur le marche (et ne compte pas dans parMarche)', () => {
  /* vie 0,25 ETH x 4000 = 1000 $ -> Sprout ; le marche dirait Monument */
  const r = stadesDesBlocks({ blocks: [{ adr: A, sym: 'AAA', vie: 0.25, devise: 'ETH', etatVie: 'LUE', capUsdMarche: 5e9 }], ethUsd: 4000 });
  assert.equal(groupeDe(r, A).cle, 'POUSSE');
  assert.equal(blocDe(r, A).source, 'CHAINE');
  assert.equal(blocDe(r, A).capUsd, 1000);
  assert.equal(r.parMarche, 0);
});

ok('une FDV absurde ou nulle ne cree pas de palier', () => {
  for (const v of [0, -5, NaN, Infinity, null, undefined, '98564']) {
    const r = stadesDesBlocks({ blocks: [{ adr: B, sym: 'BBB', vie: null, etatVie: 'NON_LUE', capUsdMarche: v }], ethUsd: 4000 });
    assert.equal(groupeDe(r, B).cle, 'NON_LU', 'capUsdMarche=' + String(v));
    assert.equal(r.parMarche, 0);
  }
});

ok('la mort et l absence de marche passent avant la FDV du marche', () => {
  const mort = { etat: 'LUE', gm: 0, messages: 0, detenteurs: 0, mort: true };
  const r = stadesDesBlocks({ blocks: [{ adr: A, sym: 'AAA', vie: null, etatVie: 'NON_LUE', capUsdMarche: 1e6, nourriture: mort }], ethUsd: 4000 });
  assert.equal(groupeDe(r, A).cle, 'MORT');
  const r2 = stadesDesBlocks({ blocks: [{ adr: B, sym: 'BBB', vie: null, etatVie: 'NON_TROUVEE' }], ethUsd: 4000 });
  assert.equal(groupeDe(r2, B).cle, 'SANS_MARCHE');
});

ok('sans prix ETH/USD, la FDV du marche marche quand meme (elle est deja en dollars)', () => {
  const r = stadesDesBlocks({ blocks: [{ adr: A, sym: 'AAA', vie: null, etatVie: 'NON_LUE', capUsdMarche: 2e6 }], ethUsd: null });
  assert.equal(groupeDe(r, A).cle, 'CANOPEE');
  assert.equal(r.parMarche, 1);
});

console.log('test-stades:', n, 'assertions groupees, exit 0');
