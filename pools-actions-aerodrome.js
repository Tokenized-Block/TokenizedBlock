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
  /* 2026-10-09 21:08 UTC (bloc ~52 395 400) : les onze « ecartees » ci-dessus avaient ete mesurees 1 h 40 apres leur creation, a
   *   0,01 USDC. 25 min plus tard : 24 987 USDC chacune. Un instantane n est pas un etat — elles entrent avec la meme regle. */
  ['0xb200000000000000000000d2b7d9aee52f6c6bef', { symbole: 'BIDUc', pool: '0xd47b8f13ffc3198148b138d3f07cc89c92042950', tickSpacing: 1, usdcMesure: 24987 }],
  ['0xb200000000000000000000ca7c6d1438e7245eb6', { symbole: 'BILIc', pool: '0x32a3ce6c3a8d6c24c4a51a5cf2869410cbf4d637', tickSpacing: 1, usdcMesure: 24987 }],
  ['0xb200000000000000000000f3049f4aa834b23b64', { symbole: 'HSAIc', pool: '0xdc8d2c31de17bf4df00c05e4e132bcea22f24c3b', tickSpacing: 1, usdcMesure: 24987 }],
  ['0xb200000000000000000000f6b0417af5f52341fc', { symbole: 'INFYc', pool: '0x356cc16fe38a6ad0eb25e655759dd963f8d674bf', tickSpacing: 1, usdcMesure: 24987 }],
  ['0xb2000000000000000000002d2b5dc53c61f1ba06', { symbole: 'NIOc', pool: '0x484cc2ca594ced3fe38362fe950c60ce66f53f6d', tickSpacing: 1, usdcMesure: 24987 }],
  ['0xb2000000000000000000008d5328e9208773dc58', { symbole: 'NVOc', pool: '0xc1ba39d668f14eee2462ca5877402e4a7c4d1f34', tickSpacing: 1, usdcMesure: 24987 }],
  ['0xb200000000000000000000c8a7223510467d8563', { symbole: 'PDDc', pool: '0x84608be6d655ee05032303fe7f0d6f3a51c2cf51', tickSpacing: 1, usdcMesure: 24987 }],
  ['0xb200000000000000000000da6f64c306234127e0', { symbole: 'SAPc', pool: '0x21313a06b7f8ed38d8bc1fb8be2fbd847634a6ec', tickSpacing: 1, usdcMesure: 24987 }],
  /* ⛔ SEc (0x0274…4547) et SONYc (0x26dd…6fdc) NE SONT PAS dans cette table : 24 987 USDC chacune, mais l achat reverte sur fork
   *   (« Too little received » des 10 USDC) — profondeur affichee n est pas profondeur pres du prix. Voir paires.js. */
  ['0xb20000000000000000000063376b142c0764b489', { symbole: 'VALEc', pool: '0x0f48336b76ee52fa6bb19edf5af358529df57574', tickSpacing: 1, usdcMesure: 24987 }],
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
