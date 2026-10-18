/* frais-contrats.js — GENERE par outils/generer-frais-contrats.mjs depuis les sources Solidity du depot. NE PAS EDITER A LA MAIN.
 * Les constantes de frais gravees dans les contrats (entiers bruts, en texte). Pur, sans import : la page frais-et-risques.html
 * l importe via frais-risques.js. test-frais-et-risques-20261018 exige que ce fichier soit identique a une regeneration. */
export const FRAIS_CONTRATS = Object.freeze({
  BlockSkins: Object.freeze({ source: 'contracts/src/BlockSkins.sol', sha256Source: 'c11d841a8d9d1baba733bc4edc04d2f72606b39b0e7f7a2e54cf23b36c381f52', MINT_PRICE: '10000000', SALE_FEE_BPS: '1000', MIN_RAISE_BPS: '500', MAX_AUCTION: '604800' }),
  BlockMissionsV3: Object.freeze({ source: 'contracts/src/BlockMissionsV3.sol', sha256Source: '491aaa23a5856b5a1e333efacf2d8cfcdbf0555946277cf4f6b08d01dc9134d1', FEE_BPS: '1000', TB_SHARE_BPS: '10000', RESERVE_SHARE_BPS: '7000' }),
});
