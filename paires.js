// paires.js — avec quoi un block peut etre paire au lancement : ETH, USDC, une action, ou un jeton.
// ================================================================================================
// ⛔⛔ PAIRER = CHOISIR LA DEVISE DE COTATION DE LA POOL. Mesure du 2026-09-09 sur trois launches
//    OpenLaunch : la paire EST la devise contre laquelle la pool s ouvre (ETH, GITLAWB, COINc, AAPLc).
//    Aucune magie de plus — et donc aucune promesse de plus a l ecran.
//
// ⛔⛔ DECISION DE PHIL, 2026-09-12 : « le paired, tu peux choisir un stock dispo via Coinbase, ou un
//    token qu ils veulent ». L ANCIEN ecran refuse les actions (et renvoie vers OpenLaunch) ; ce
//    module ne le contredit pas en silence — il sert le NOUVEL ecran, et l ancien reste tel quel.
//
// ⛔ UNE ADRESSE N EST JAMAIS APPELEE « ACTION » SI ELLE N EST PAS DANS LE REGISTRE. Le registre est
//    RECOPIE de `index.html` (STOCKS_BASE_REGISTRY, liste publiee des emetteurs Coinbase B20), et
//    `test-paires.mjs` le compare au fichier. Un ticker invente mettrait l argent de quelqu un dans
//    un jeton que personne n a verifie.
//
// ⛔ UN JETON SAISI A LA MAIN EST DIT « TYPED BY YOU, NOT VERIFIED ». On l accepte (Phil le veut), on
//    ne le blanchit pas : ni nom, ni logo, ni etiquette empruntes.

export const ETH_NATIF = '0x0000000000000000000000000000000000000000';

/** Les devises « de base ». ⛔ Adresses recopiees de `DEVISES` dans index.html. */
/** TBLOCK — standard quote for new blocks (mainnet). Address from tokenomics / B20Created. */
export const TBLOCK_MAINNET = '0xb20000000000000000000024c30d3fcb7931272e';

export const DEVISES_BASE = [
  { adr: TBLOCK_MAINNET, symbole: 'TBLOCK', nom: 'TokenizedBlock (standard pair)', type: 'TBLOCK', chaines: [8453] },
  { adr: ETH_NATIF, symbole: 'ETH', nom: 'Ether (native)', type: 'NATIF', chaines: [8453, 84532] },
  { adr: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbole: 'USDC', nom: 'USD Coin', type: 'STABLE', chaines: [8453] },
];

/** ⛔ RECOPIE de STOCKS_BASE_REGISTRY (index.html). Un test compare les deux listes, adresse par adresse. */
export const ACTIONS_COINBASE = [
  { symbole: 'AAPLc', nom: 'Apple', adr: '0xb200000000000000000000c2e324d24d7eecd1fb' },
  { symbole: 'AMZNc', nom: 'Amazon', adr: '0xb200000000000000000000d9192b6b456483c2e8' },
  { symbole: 'COINc', nom: 'Coinbase', adr: '0xb200000000000000000000c85a31389d71f3ecfb' },
  { symbole: 'CRCLc', nom: 'Circle', adr: '0xb20000000000000000000019f6e7c675b73c2e4d' },
  { symbole: 'GOOGLc', nom: 'Alphabet', adr: '0xb2000000000000000000002d0ba3164cc74f58b7' },
  { symbole: 'INTCc', nom: 'Intel', adr: '0xb2000000000000000000004aff16039ba04bdfbc' },
  { symbole: 'METAc', nom: 'Meta Platforms', adr: '0xb2000000000000000000008bc8786b856e61707c' },
  { symbole: 'MSFTc', nom: 'Microsoft', adr: '0xb200000000000000000000ab99cfa739e253872b' },
  { symbole: 'MSTRc', nom: 'Strategy', adr: '0xb2000000000000000000004884b426556b92883d' },
  { symbole: 'NVDAc', nom: 'NVIDIA', adr: '0xb20000000000000000000078ee7ce2fe4908108c' },
  { symbole: 'SNDKc', nom: 'Sandisk', adr: '0xb200000000000000000000397293cb8cda9a10c5' },
  { symbole: 'SPCXc', nom: 'SpaceX', adr: '0xb2000000000000000000007b9fcbd005511acbd5' },
  { symbole: 'TSLAc', nom: 'Tesla', adr: '0xb2000000000000000000001e800a7f5189430cd0' },
];

const ADRESSE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Ce qu on peut proposer comme paire sur une chaine.
 * ⛔ LES ACTIONS COINBASE N EXISTENT QUE SUR BASE MAINNET : les proposer sur Sepolia enverrait vers
 *    des adresses qui n y sont pas des actions.
 */
export function pairesProposees(chaine) {
  const c = Number(chaine);
  const base = DEVISES_BASE.filter((d) => d.chaines.includes(c));
  const actions = c === 8453 ? ACTIONS_COINBASE.map((s) => ({ ...s, type: 'ACTION' })) : [];
  return [...base, ...actions];
}

/**
 * Qualifie une paire choisie.
 * @returns {{etat:'OK'|'REFUSE', paire?:object, pourquoi?:string}}
 * ⛔ L ORDRE COMPTE : registre d abord. Une adresse du registre tapee a la main reste une ACTION
 *    verifiee ; une adresse inconnue reste « tapee par vous », jamais promue.
 */
export function qualifierPaire(adresse, chaine) {
  const a = String(adresse || '').trim();
  if (!ADRESSE.test(a)) return { etat: 'REFUSE', pourquoi: 'not an address — paste it whole, nothing is completed' };
  const bas = a.toLowerCase();
  const connue = pairesProposees(chaine).find((p) => p.adr.toLowerCase() === bas);
  if (connue) return { etat: 'OK', paire: { ...connue, verifiee: true } };
  if (Number(chaine) !== 8453 && ACTIONS_COINBASE.some((s) => s.adr.toLowerCase() === bas)) {
    return { etat: 'REFUSE', pourquoi: 'that is a Coinbase stock on Base mainnet — it does not exist as a stock on this network' };
  }
  /* ⛔ RAKSHA 2026-09-15: custom pair must prove native B20 (code 0xef) in Create majPaire — no ERC-20 sprawl. */
  return { etat: 'OK', paire: { adr: a, symbole: null, nom: null, type: 'SAISIE', verifiee: false, besoinB20: true,
    avertissement: 'Typed address — must be a native B20 (code 0xef) to pair here. Not a random ERC-20. '
      + 'This app gives it no name until the chain proves B20.' } };
}

/** L etiquette a afficher. ⛔ Une paire non verifiee n emprunte jamais un nom. */
export function etiquettePaire(p) {
  if (!p) return '—';
  if (p.type === 'SAISIE') return 'B20 pair ' + p.adr.slice(0, 6) + '…' + p.adr.slice(-4) + (p.estB20 ? ' (native B20)' : ' (B20 check…)');
  if (p.type === 'TBLOCK') return p.symbole + ' — ' + p.nom + ' (standard; may add another tokenized pair later)';
  if (p.type === 'ACTION') return p.symbole + ' — ' + p.nom + ' (Coinbase tokenized stock)';
  return p.symbole + ' — ' + p.nom;
}
