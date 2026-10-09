/* pools-actions-aerodrome.js — LA VRAIE POOL D UNE ACTION TOKENISEE, QUAND DEXSCREENER EN MONTRE UNE AUTRE.
 *
 * ⛔⛔ MESURE (2026-10-03 14:32 UTC, mainnet.base.org, lecture seule ; script aero-toutes.mjs) : pour chacune des 37 actions
 *   du registre, CHAQUE tickSpacing de ESPACEMENTS_CL interroge sur la factory Aerodrome CL (getPool USDC/action), puis
 *   balanceOf(USDC, pool) et liquidity() : 37/37 lues, 0 lecture ratee. 12 profondes (>= 500 $ USDC ET liquidite active),
 *   25 vides (0 a 1 $). Seules les 12 sont ici.
 * ⛔ POURQUOI CETTE TABLE : /api/trending (DexScreener) rend la pool la PLUS LIQUIDE par jeton — pour MSTRc c etait la pool
 *   v4 d un meme coté EN MSTRc (hook Doppler), pas le marche de l action. Le Market n offrait donc pas de Buy sur une
 *   action qui a 845 k$ d USDC sur Aerodrome. Cette table rend a l action SA pool ; prix, volume et liquidite affiches
 *   restent ceux de DexScreener (ils decrivent le jeton, pas la pool d achat).
 * ⛔ BORNES, DITES : un instantane. La fiche d achat re-lit la pool et passe la porte de glissement (porteDAchat) avant
 *   tout frais ; une pool videe depuis la mesure est refusee la, pas promise ici. test-pools-actions-aerodrome.mjs
 *   re-interroge la factory (temoin : chaque adresse ci-dessous doit etre celle que rend getPool). */
export const POOLS_ACTIONS_AERODROME = new Map([
  ['0xb200000000000000000000c2e324d24d7eecd1fb', { symbole: 'AAPLc', pool: '0xa3b1e3f9747065e2073722ff4c9027d3ea4994f0', tickSpacing: 10, usdcMesure: 1126706 }],
  ['0xb200000000000000000000d9192b6b456483c2e8', { symbole: 'AMZNc', pool: '0xd03bc8c7f2faedce2aac81bf0444aea08ea06e9b', tickSpacing: 10, usdcMesure: 1186600 }],
  ['0xb2000000000000000000002d0ba3164cc74f58b7', { symbole: 'GOOGLc', pool: '0xb1987cad1682841b4b641d50e520777ec5ab5542', tickSpacing: 10, usdcMesure: 958785 }],
  ['0xb2000000000000000000008bc8786b856e61707c', { symbole: 'METAc', pool: '0xeaf57753bc382e0324a1d43f72e7027705a2273e', tickSpacing: 10, usdcMesure: 1056463 }],
  ['0xb200000000000000000000ab99cfa739e253872b', { symbole: 'MSFTc', pool: '0x7103eb3c9590d1281f7dc03b2a9ee27c39df5d54', tickSpacing: 10, usdcMesure: 718350 }],
  ['0xb2000000000000000000004884b426556b92883d', { symbole: 'MSTRc', pool: '0x8b27f626ab668197000bc722a1012022caed10e2', tickSpacing: 10, usdcMesure: 845308 }],
  ['0xb200000000000000000000fd2f87532b90095211', { symbole: 'MUc', pool: '0x17e1beb2cd65493da73ed4bbbc7becaaa0f91c73', tickSpacing: 10, usdcMesure: 360256 }],
  ['0xb20000000000000000000078ee7ce2fe4908108c', { symbole: 'NVDAc', pool: '0x853f5f1b92b16714fe6cda67caad0856b83c7ab9', tickSpacing: 10, usdcMesure: 1426200 }],
  ['0xb2000000000000000000007d16372840df4dabbe', { symbole: 'PLTRc', pool: '0x650cc267aa248191978013d5ae421e5dc2a6e242', tickSpacing: 10, usdcMesure: 587879 }],
  ['0xb200000000000000000000397293cb8cda9a10c5', { symbole: 'SNDKc', pool: '0x5a8236f575471e7bfca2c8462a200c28f737246e', tickSpacing: 10, usdcMesure: 580616 }],
  ['0xb2000000000000000000007b9fcbd005511acbd5', { symbole: 'SPCXc', pool: '0x0bf58fe0fac935ac69595c19b12ba0d75e3f8c0e', tickSpacing: 10, usdcMesure: 742878 }],
  ['0xb2000000000000000000001e800a7f5189430cd0', { symbole: 'TSLAc', pool: '0x469337fdcc5e8f38e2e4b670b04f57865d13a7bb', tickSpacing: 10, usdcMesure: 653067 }],
  /* 2026-10-09 (bloc 52 394 888, base-rpc.publicnode.com, lecture seule) : 3 nouvelles actions de l emetteur, pool rendue par
   *   getPool(USDC, action, 1) sur la factory Aerodrome CL. ⛔ tickSpacing 1 (pas 10 comme les douze du dessus). Onze autres
   *   pools de nouvelles actions ont ete ECARTEES : 0,01 USDC lu, malgre « ~50 k$ » chez DexScreener. */
  ['0xb20000000000000000000026215d755356e5043f', { symbole: 'ARMc', pool: '0x9a0f4fd0766ccdb792ba58fe631aa7720097623c', tickSpacing: 1, usdcMesure: 24981 }],
  ['0xb200000000000000000000187f7071d6e321a7d2', { symbole: 'SKHYc', pool: '0x6678992e0a166f4e78bf6cad5dd7e61ca041711c', tickSpacing: 1, usdcMesure: 24971 }],
  ['0xb200000000000000000000e88efe88d8ade3f0da', { symbole: 'WRDc', pool: '0xbc440aff9a79cced69d5b21c7b71e60bd0278efb', tickSpacing: 1, usdcMesure: 24701 }],
]);

/** Une ligne de marche (DexScreener) avec la pool d achat de l action si la table la connait et que la ligne pointe
 *  ailleurs. Rend la MEME ligne sinon. Ne touche ni prix, ni volume, ni liquidite. */
export function avecPoolAction(l) {
  if (!l || !l.adr) return l;
  const t = POOLS_ACTIONS_AERODROME.get(String(l.adr).toLowerCase());
  if (!t) return l;
  if (/^aerodrome$/i.test(String(l.dex || '')) && String(l.poolAdr || '').toLowerCase() === t.pool) return l;
  return { ...l, dex: 'aerodrome', poolAdr: t.pool, poolSource: 'aerodrome-mesure', poolAffichee: l.poolAdr || null, dexAffiche: l.dex || null };
}
