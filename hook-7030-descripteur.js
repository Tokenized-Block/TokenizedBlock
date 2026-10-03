/* hook-7030-descripteur.js — LE descripteur du hook 7030 (62 devises) : adresse, liste fixe, plancher de caution par devise.
 * ⛔ UNE SEULE SOURCE : tokenomics.js (HOOK_7030) et paires.js (DEVISES_ADMISES_7030) en derivent. Changer de hook = remplacer
 *   CE fichier (genere depuis contracts/launch-lock/plan/{deploy-summary.txt, planchers-caution.json} de la branche
 *   feat/hook-7030-62-sur-a040db5-20261003 @ ea9e057), rien d autre.
 * ⛔ Le drapeau reste HOOK_7030_ACTIF (tokenomics.js), ETEINT : ce fichier ne l allume pas ; le hook N EST PAS DEPLOYE
 *   (eth_getCode = 0x le 2026-10-03). Planchers = unites brutes (~1 $) : 41 de Zero 1 (bloc 52 090 382), 21 REFERENCE
 *   (Yahoo + Nasdaq lus le 2026-10-03, decision du fondateur) ; le hook refuse en dessous (CautionSousLePlancher).
 * ⛔ GENERE (deploy-7030.json) — ne pas editer a la main. */
export const DESCRIPTEUR_7030 = Object.freeze({
  nom: 'hook-7030-62',
  adresse: '0x32F3f572Dd17625bAb9035789C953E1d001864cc',
  deployeur: '0x4e59b44847b379578588920ca78fbf26c0b4956c',
  sel: '0x000000000000000000000000000000000000000000000000000000000024b1b7',
  initcodeHash: '0xe4e4224bf48a960ea4acb6a790ebd98322472db7e8f9df4c04a6b617964f13e4',
  sha256Calldata: 'a69b71fbc4a829615e8c0d35cdf87597776ea203c6eec5d7d191738b1e7ada3a',
  blocPlanchers: 52090382,
  /* ETH (adresse 0) puis les 62 devises appariables, dans l ordre du contrat (Devises7030.liste()) */
  devises: Object.freeze([
  Object.freeze({ sym: "ETH", adresse: "0x0000000000000000000000000000000000000000", decimales: 18, plancher: "375110845363267", regle: "POOL" }),
  Object.freeze({ sym: "USDC", adresse: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", decimales: 6, plancher: "1000000", regle: "UNIT" }),
  Object.freeze({ sym: "cbBTC", adresse: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", decimales: 8, plancher: "1188", regle: "POOL" }),
  Object.freeze({ sym: "TOSHI", adresse: "0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4", decimales: 18, plancher: "8317319830414303380420", regle: "POOL" }),
  Object.freeze({ sym: "OUSD", adresse: "0xb2000000000000000000002feb517dfec7415344", decimales: 6, plancher: "999999", regle: "POOL" }),
  Object.freeze({ sym: "AAPLc", adresse: "0xb200000000000000000000c2e324d24d7eecd1fb", decimales: 8, plancher: "299602", regle: "POOL" }),
  Object.freeze({ sym: "AMZNc", adresse: "0xb200000000000000000000d9192b6b456483c2e8", decimales: 8, plancher: "398718", regle: "POOL" }),
  Object.freeze({ sym: "AVGOc", adresse: "0xb200000000000000000000fc737aea6196ab5a4c", decimales: 8, plancher: "281034", regle: "REFERENCE" }),
  Object.freeze({ sym: "BEc", adresse: "0xb20000000000000000000016f9dfe862feba122b", decimales: 8, plancher: "349957", regle: "POOL" }),
  Object.freeze({ sym: "GOOGLc", adresse: "0xb2000000000000000000002d0ba3164cc74f58b7", decimales: 8, plancher: "291316", regle: "POOL" }),
  Object.freeze({ sym: "HIMSc", adresse: "0xb20000000000000000000043a599976181bcf336", decimales: 8, plancher: "3491206", regle: "POOL" }),
  Object.freeze({ sym: "METAc", adresse: "0xb2000000000000000000008bc8786b856e61707c", decimales: 8, plancher: "137518", regle: "POOL" }),
  Object.freeze({ sym: "MSFTc", adresse: "0xb200000000000000000000ab99cfa739e253872b", decimales: 8, plancher: "194024", regle: "POOL" }),
  Object.freeze({ sym: "MSTRc", adresse: "0xb2000000000000000000004884b426556b92883d", decimales: 8, plancher: "620014", regle: "POOL" }),
  Object.freeze({ sym: "MUc", adresse: "0xb200000000000000000000fd2f87532b90095211", decimales: 8, plancher: "93187", regle: "POOL" }),
  Object.freeze({ sym: "NVDAc", adresse: "0xb20000000000000000000078ee7ce2fe4908108c", decimales: 8, plancher: "426462", regle: "POOL" }),
  Object.freeze({ sym: "PLTRc", adresse: "0xb2000000000000000000007d16372840df4dabbe", decimales: 8, plancher: "528421", regle: "POOL" }),
  Object.freeze({ sym: "SNDKc", adresse: "0xb200000000000000000000397293cb8cda9a10c5", decimales: 8, plancher: "57696", regle: "POOL" }),
  Object.freeze({ sym: "SPCXc", adresse: "0xb2000000000000000000007b9fcbd005511acbd5", decimales: 8, plancher: "632956", regle: "POOL" }),
  Object.freeze({ sym: "TSLAc", adresse: "0xb2000000000000000000001e800a7f5189430cd0", decimales: 8, plancher: "267254", regle: "POOL" }),
  Object.freeze({ sym: "AMDc", adresse: "0xb2000000000000000000000d8ce462e99ee7a47b", decimales: 8, plancher: "163042", regle: "POOL" }),
  Object.freeze({ sym: "ASTSc", adresse: "0xb200000000000000000000b1a29cf17a1819288a", decimales: 8, plancher: "1732830", regle: "POOL" }),
  Object.freeze({ sym: "CAKEc", adresse: "0xb200000000000000000000f215e4c890cfb7176b", decimales: 8, plancher: "861852", regle: "POOL" }),
  Object.freeze({ sym: "DJTc", adresse: "0xb200000000000000000000428e3a3eebbb20692b", decimales: 8, plancher: "10899892", regle: "POOL" }),
  Object.freeze({ sym: "DUOLc", adresse: "0xb200000000000000000000a613d12deafbbb1db7", decimales: 8, plancher: "667208", regle: "POOL" }),
  Object.freeze({ sym: "LLYc", adresse: "0xb200000000000000000000f1a0f91e34892e4718", decimales: 8, plancher: "84765", regle: "POOL" }),
  Object.freeze({ sym: "MRNAc", adresse: "0xb200000000000000000000e215e9b76ecba02468", decimales: 8, plancher: "562732", regle: "POOL" }),
  Object.freeze({ sym: "MRVLc", adresse: "0xb200000000000000000000ec3c4c7395cc609813", decimales: 8, plancher: "391228", regle: "POOL" }),
  Object.freeze({ sym: "NFLXc", adresse: "0xb20000000000000000000058b8c947e44011dfe6", decimales: 8, plancher: "1445203", regle: "POOL" }),
  Object.freeze({ sym: "NVAXc", adresse: "0xb200000000000000000000c597c476fcf9aed3a8", decimales: 8, plancher: "8852346", regle: "POOL" }),
  Object.freeze({ sym: "ORCLc", adresse: "0xb200000000000000000000347afba223d7b6b63c", decimales: 8, plancher: "725794", regle: "POOL" }),
  Object.freeze({ sym: "PTONc", adresse: "0xb2000000000000000000009272a491812842aa84", decimales: 8, plancher: "18498181", regle: "POOL" }),
  Object.freeze({ sym: "PYPLc", adresse: "0xb200000000000000000000450ad3abe5d4846c6e", decimales: 8, plancher: "1922034", regle: "POOL" }),
  Object.freeze({ sym: "QUBTc", adresse: "0xb200000000000000000000ca425ab42e07c35bc3", decimales: 8, plancher: "11530252", regle: "POOL" }),
  Object.freeze({ sym: "RBLXc", adresse: "0xb2000000000000000000005bd7ae89b9e6189bb5", decimales: 8, plancher: "2269118", regle: "REFERENCE" }),
  Object.freeze({ sym: "RDDTc", adresse: "0xb20000000000000000000066242d4067724cb7a1", decimales: 8, plancher: "668650", regle: "POOL" }),
  Object.freeze({ sym: "TTWOc", adresse: "0xb200000000000000000000f720c26062bc3067da", decimales: 8, plancher: "498231", regle: "POOL" }),
  Object.freeze({ sym: "WENc", adresse: "0xb20000000000000000000044e3cd7a0e1028e57a", decimales: 8, plancher: "16250122", regle: "REFERENCE" }),
  Object.freeze({ sym: "GMEc", adresse: "0xb2000000000000000000007790ed6e48e06ed935", decimales: 8, plancher: "4162864", regle: "POOL" }),
  Object.freeze({ sym: "HTZc", adresse: "0xb2000000000000000000002601c5c94f435da168", decimales: 8, plancher: "57636888", regle: "REFERENCE" }),
  Object.freeze({ sym: "PFEc", adresse: "0xb20000000000000000000018fe7ec7d6dfeeb528", decimales: 8, plancher: "3606203", regle: "REFERENCE" }),
  Object.freeze({ sym: "PMc", adresse: "0xb2000000000000000000008fc2a8c23cf5937b66", decimales: 8, plancher: "517639", regle: "POOL" }),
  Object.freeze({ sym: "AMCc", adresse: "0xb200000000000000000000cd7e6b8042cb7c2bb5", decimales: 8, plancher: "36101084", regle: "REFERENCE" }),
  Object.freeze({ sym: "AEOc", adresse: "0xb2000000000000000000006064f8ec027f042294", decimales: 8, plancher: "5646528", regle: "REFERENCE" }),
  Object.freeze({ sym: "BMNRc", adresse: "0xb200000000000000000000ea2df44a307cab279c", decimales: 8, plancher: "3806624", regle: "REFERENCE" }),
  Object.freeze({ sym: "BIRDc", adresse: "0xb200000000000000000000535fe96f18204bfd96", decimales: 8, plancher: "29717683", regle: "REFERENCE" }),
  Object.freeze({ sym: "BYNDc", adresse: "0xb200000000000000000000801830b13b8e493423", decimales: 8, plancher: "12121213", regle: "REFERENCE" }),
  Object.freeze({ sym: "CIFRc", adresse: "0xb200000000000000000000690275843b6e246286", decimales: 8, plancher: "6365373", regle: "REFERENCE" }),
  Object.freeze({ sym: "CLSKc", adresse: "0xb200000000000000000000fa63cfff5c794dbb95", decimales: 8, plancher: "7849294", regle: "REFERENCE" }),
  Object.freeze({ sym: "CRCLc", adresse: "0xb20000000000000000000019f6e7c675b73c2e4d", decimales: 8, plancher: "1230770", regle: "REFERENCE" }),
  Object.freeze({ sym: "CRWVc", adresse: "0xb200000000000000000000f111184a74720787e6", decimales: 8, plancher: "1115823", regle: "REFERENCE" }),
  Object.freeze({ sym: "HUTc", adresse: "0xb2000000000000000000006ee1c139a723872e09", decimales: 8, plancher: "1115698", regle: "REFERENCE" }),
  Object.freeze({ sym: "KSSc", adresse: "0xb200000000000000000000105a1f43ff3605c5de", decimales: 8, plancher: "5316322", regle: "REFERENCE" }),
  Object.freeze({ sym: "LCIDc", adresse: "0xb20000000000000000000081050ac3d4395df527", decimales: 8, plancher: "24213076", regle: "REFERENCE" }),
  Object.freeze({ sym: "MARAc", adresse: "0xb200000000000000000000a310e034e09186fb2d", decimales: 8, plancher: "8904720", regle: "REFERENCE" }),
  Object.freeze({ sym: "OPENc", adresse: "0xb200000000000000000000259694b27bf052e7d7", decimales: 8, plancher: "40983607", regle: "REFERENCE" }),
  Object.freeze({ sym: "RIOTc", adresse: "0xb200000000000000000000bd0c7627b663c581a6", decimales: 8, plancher: "5068424", regle: "REFERENCE" }),
  Object.freeze({ sym: "SOUNc", adresse: "0xb2000000000000000000002137743d4a01fe4e88", decimales: 8, plancher: "17123288", regle: "REFERENCE" }),
  Object.freeze({ sym: "USDEc", adresse: "0xb2000000000000000000009426b660396ebcf343", decimales: 8, plancher: "7067138", regle: "REFERENCE" }),
  Object.freeze({ sym: "VVVc", adresse: "0xb200000000000000000000fec679b39992f67627", decimales: 8, plancher: "3270112", regle: "REFERENCE" }),
  Object.freeze({ sym: "WULFc", adresse: "0xb200000000000000000000432a1d2bd864acec82", decimales: 8, plancher: "6455778", regle: "REFERENCE" }),
  Object.freeze({ sym: "WWc", adresse: "0xb20000000000000000000089221e238277d52515", decimales: 8, plancher: "6784261", regle: "REFERENCE" }),
  Object.freeze({ sym: "XYZc", adresse: "0xb20000000000000000000067c8c151f24e1c9924", decimales: 8, plancher: "1345352", regle: "REFERENCE" }),
  ]),
});
/** les 62 adresses appariables (ETH exclu), minuscules, dans l ordre du contrat */
export const DEVISES_7030 = Object.freeze(DESCRIPTEUR_7030.devises.filter((d) => d.sym !== 'ETH').map((d) => d.adresse));
/** le plancher brut d une devise (ETH = adresse 0), ou null si elle n est pas dans la liste */
export function plancher7030(adresse) {
  const a = String(adresse || '').toLowerCase();
  const d = DESCRIPTEUR_7030.devises.find((x) => x.adresse === a);
  return d ? BigInt(d.plancher) : null;
}
