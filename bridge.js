// bridge.js — Bridge tab quote + fee skim + honest legs (tip 20260923-bridge-x402-brain).
// ================================================================================================
// ⛔⛔ LE TARIF NE S ECRIT PLUS EN DUR. MESURE DU 2026-09-25 : ce fichier et app.html annonçaient
//     « 0.01% » a DIX-HUIT endroits alors que `BRIDGE_FEE_BPS` vaut 50n — soit 0,5 %. Un facteur
//     CINQUANTE entre le tarif affiche et le tarif preleve, sur des ecrans ou quelqu un decide de
//     payer. Le chiffre a change le 2026-09-24 (decision de Phil) ; les phrases sont restees.
//     C est la forme la plus banale du mensonge dans une app : personne ne l a ecrit, il a derive.
//   ⇒ Tout affichage passe par `BRIDGE_FEE_LABEL`. Un litteral qui reapparait est un tarif qui
//     recommencera a deriver, donc `test-bridge-tarif-unique.mjs` le refuse.
//
// PRODUCT (Raksha / Zero 1 · 2026-09-22/23):
//   · Bridge tab = fiat→tokenized Fund path + sell/swap tokenized↔tokenized VIA a Bridge block.
//   · Fee = BRIDGE_FEE_BPS of transfer volume → same fee sink as Create/hook (a6cf on-chain).
//   · Prefer ETH or USDC settlement. NEVER surface fee address in UI.
//   · Amount-only labels — no « Fees for Dev », no ≈$1.
//   · Instant Birth / CreateRouter / openFeeDejaPayePour / V8 / BuySell 0.5% untouched.
//
// ON-CHAIN FEE PATH (this tip):
//   Client-side skim — user-signed ETH value send OR USDC ERC-20 transfer of feeUnits → FEE_WALLET.
//   Why not reuse Buy/Sell router? FRAIS_INTERFACE_BPS is sealed at 50 (0.5%) with fail-closed
//   assertFraisInterfaceA6cf; no live contract exposes TAKE_PORTION at 1 bps.
//
// SECURITY (document, do not hide):
//   · Fee is a SEPARATE user-signed tx (or first call in a future atomic batch) — not enforced by
//     a Bridge router. User can refuse; nothing is custodial.
//   · Full tokenized↔tokenized swap of the NET via hub is NOT on-chain yet → GO Phil: BridgeRouter
//     (or 1 bps TAKE_PORTION) so fee+swap are atomic. Confirm still sends the fee skim only when
//     From is ETH/USDC; net swap stays blocked with clear copy.
//   · Fail-closed if fee rounds to 0 wei/units (amount too small for BRIDGE_FEE_BPS).
//   · FEE_WALLET address never appears in UI strings returned here.

/** Bridge fee = BRIDGE_FEE_BPS centiemes de point de base du volume. SOURCE UNIQUE DU TARIF. */
/* ⛔⛔ 0,5 % — DECISION DE PHIL, 2026-09-24 : « écris 0.5% alors ».
 *     Le panneau annonçait 0,01 % alors que le chemin reellement cable en preleve 0,5 %
 *     (`FRAIS_INTERFACE_BPS` dans echange.js) : sortir un block par sa pool est exactement ce que
 *     fait Buy/Sell, et l annoncer moins cher ailleurs aurait ete une porte moins chere vers la
 *     meme chose — en plus d etre faux.
 *   ⛔ LE CHIFFRE AFFICHE SUIT LE CHIFFRE PRELEVE, jamais l inverse. Si `FRAIS_INTERFACE_BPS`
 *     bouge un jour, ces trois constantes doivent bouger avec lui : `test-bridge-tab-0922.mjs`
 *     compare les deux et echoue si elles divergent. Un tarif affiche qui derive du tarif reel est
 *     la forme la plus banale du mensonge dans une app. */
export const BRIDGE_FEE_BPS = 50n;
export const BRIDGE_FEE_RATE = 0.005;
export const BRIDGE_FEE_LABEL = '0.5%';

/** Settlement assets preferred for fee display (symbols only — never fee sink address). */
export const BRIDGE_SETTLEMENT = ['ETH', 'USDC'];

/* ⛔⛔ LA CONSTANTE QUI EMPECHE DE FACTURER UN SERVICE QU ON NE REND PAS.
 *     Mesure du 2026-09-24 : le bouton de confirmation du Swap construisait UNE seule transaction —
 *     le frais vers le puits — et l envoyait. Aucun second appel, aucune route, aucun calldata de
 *     swap n existait nulle part dans le chemin. Pendant ce temps l ecran affichait
 *     « You receive: <net> » juste au-dessus du bouton, et la reserve « net swap is not live yet »
 *     ne s affichait qu APRES la signature.
 *     ⇒ L utilisateur payait un frais, ne recevait rien, et l apprenait une fois l argent parti.
 *       La divulgation existait ; la DECISION l ignorait.
 *
 * ⛔ TANT QUE CECI EST `false`, LE FRAIS NE PEUT PAS PARTIR. Ce n est pas un reglage de confort :
 *   c est la garde qui separe « prendre un frais pour un echange » de « prendre de l argent ».
 *   Le jour ou le hub echange vraiment, on passe cette constante a `true` — un seul endroit, et la
 *   garde s ouvre d elle-meme. La remettre a `true` sans que le swap parte reintroduirait le
 *   defaut ENTIER, et `test-bridge-pas-de-frais-sans-echange.mjs` echouerait.
 * ⚠️ NON MESURE : rien ici ne verifie que le hub echange vraiment. Cette constante est une
 *   DECLARATION humaine, pas une observation — elle vaut ce que vaut la personne qui la change. */
export const HUB_SWAP_LIVE = false;

/**
 * Dig §1 Bridge legs — UI labels only. Fee sink never appears here.
 * Equity = future leg label (honest "later"), not a live broker / FINRA / C4A clone.
 * Hub token↔token net swap stays Phil-blocked until BridgeRouter 1 bps GO.
 */
export const BRIDGE_LEGS = Object.freeze([
  {
    id: 'fund',
    label: 'Fiat → wallet',
    live: true,
    fee: 'provider',
    note: 'Fund mode — Coinbase/MoonPay lands ETH/USDC in YOUR wallet. Not a TB skim.',
  },
  {
    /* ⛔⛔ `live: false` DEPUIS LE 2026-09-24. Cette jambe etait annoncee vivante, et elle l etait
     *     au sens le plus litteral : la transaction de frais partait vraiment. Mais elle partait
     *     SEULE — aucun echange en face, jamais. « Live » disait donc « ce prelevement fonctionne »
     *     la ou l utilisateur lisait « cet echange fonctionne ». Un frais qui ne finance rien n est
     *     pas une jambe vivante ; c est de l argent qui sort. */
    id: 'skim',
    label: 'Swap fee',
    live: false,
    fee: BRIDGE_FEE_LABEL,
    note: 'Charged only once swapping actually works. Nothing is taken while the hub is off.',
  },
  {
    id: 'hub',
    label: 'Block / Token hub',
    live: false,
    fee: BRIDGE_FEE_LABEL,
    goPhil: true,
    /* ⛔ Le nom interne du contrat et le prenom de l equipe sont retires : cette note peut finir a
     *   l ecran, et elle ne doit rien supposer de connu. */
    note: 'Swapping one token for another is not built yet. The quote is an estimate for later.',
  },
  {
    id: 'equity',
    label: 'Tokenized equity leg',
    live: false,
    fee: 'later',
    note: 'Future Bridge leg when a real venue exists — not a TB equities broker, not C4A/FINRA.',
  },
]);

/** Short honest legs blurb for Bridge panel (no sink, no ≈$1, no 2x/leverage).
 *
 * ⛔⛔ REECRIT LE 2026-09-24, POUR DEUX RAISONS MESUREES.
 *  1. « Phil-blocked » s affichait AUX UTILISATEURS. Le prenom avait ete retire du HTML statique,
 *     mais cette phrase-ci ECRASE le paragraphe au demarrage (app.html appelle phraseBridgeLegs()
 *     sur #brLegsNote). Le nettoyage avait donc corrige la source qu on voyait en relisant le HTML,
 *     pas celle qui gagne a l ecran. Une garde qui ne lit que le HTML statique ne peut pas voir ca.
 *  2. « ETH/USDC 0.01% skim (live) » etait FAUX. Ce prelevement partait seul, sans aucun echange en
 *     face. Annoncer « live » pour un frais qui ne finance rien, c est le mot le plus cher de tout
 *     le panneau. Tant que HUB_SWAP_LIVE est false, plus rien n est preleve — et le texte le dit.
 *
 * ⛔ REGLE QUI TIENT CETTE PHRASE : elle ne decrit que ce que le code FAIT. Pas de nom interne, pas
 *   de nom de contrat, pas de tarif pour une route qui n existe pas. Quelqu un qui ne nous connait
 *   pas doit pouvoir la lire entierement.
 */
export function phraseBridgeLegs() {
  return HUB_SWAP_LIVE
    /* ⛔ LA BRANCHE « LIVE » EST UNE BOMBE A RETARDEMENT SI ON Y ECRIT UN TARIF EN DUR : elle ne
     *   s affiche pas aujourd hui (HUB_SWAP_LIVE est false), donc personne ne la relit — et le jour
     *   ou le hub s allume, c est un chiffre vieux de plusieurs mois qui part a l ecran. Elle avait
     *   d ailleurs garde « 0.01% » trois semaines apres que le tarif soit passe a 0,5 %. */
    ? ('Legs: Fund (fiat → your wallet) · swap between tokens, with a ' + BRIDGE_FEE_LABEL
      + ' fee · tokenized equity later — not a broker.')
    : 'Legs: Fund (fiat → your wallet) is the only one running. Swapping one token for another is '
      + 'not built yet, so nothing is charged for it — the quote below is an estimate for later, '
      + 'not an offer. Tokenized equity comes after that. We are not a broker.';
}

const ADRESSE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Stub quote: fee = amount * 0.0001; net = amount − fee.
 * Amounts are human decimal numbers (not wei). Returns null fields when amount invalid.
 *
 * @param {{amount:number|string, fromSym?:string, toSym?:string, settleSym?:string}} p
 * @returns {{ok:boolean, amount:number|null, fee:number|null, net:number|null,
 *   feeBps:number, feeLabel:string, settleSym:string, fromSym:string, toSym:string,
 *   pourquoi?:string}}
 */
export function quoteBridge(p) {
  const fromSym = String((p && p.fromSym) || 'ETH').trim() || 'ETH';
  const toSym = String((p && p.toSym) || 'USDC').trim() || 'USDC';
  let settleSym = String((p && p.settleSym) || '').trim();
  if (!settleSym) {
    settleSym = BRIDGE_SETTLEMENT.includes(fromSym) ? fromSym
      : (BRIDGE_SETTLEMENT.includes(toSym) ? toSym : 'ETH');
  }
  const raw = p && p.amount;
  const amount = typeof raw === 'number' ? raw : Number(String(raw == null ? '' : raw).replace(',', '.'));
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, amount: null, fee: null, net: null, feeBps: Number(BRIDGE_FEE_BPS),
      feeLabel: BRIDGE_FEE_LABEL, settleSym, fromSym, toSym,
      pourquoi: 'Enter a valid amount' };
  }
  if (amount === 0) {
    return { ok: true, amount: 0, fee: 0, net: 0, feeBps: Number(BRIDGE_FEE_BPS),
      feeLabel: BRIDGE_FEE_LABEL, settleSym, fromSym, toSym };
  }
  const fee = amount * BRIDGE_FEE_RATE;
  const net = amount - fee;
  return { ok: true, amount, fee, net, feeBps: Number(BRIDGE_FEE_BPS),
    feeLabel: BRIDGE_FEE_LABEL, settleSym, fromSym, toSym };
}

/**
 * Format a quote amount for UI — amount + unit only (no dollar approx, no fee-addr).
 * Trims trailing zeros; keeps enough decimals for tiny fees at BRIDGE_FEE_BPS.
 */
export function formatBridgeAmount(n, sym) {
  if (n == null || !Number.isFinite(n)) return '—';
  const s = String(sym || '').trim();
  let body;
  if (n === 0) body = '0';
  else if (Math.abs(n) >= 1) body = n.toFixed(6).replace(/\.?0+$/, '');
  else if (Math.abs(n) >= 0.0001) body = n.toFixed(8).replace(/\.?0+$/, '');
  else body = n.toFixed(10).replace(/\.?0+$/, '');
  return s ? (body + ' ' + s) : body;
}

/** localStorage key for the chosen Bridge hub block (normal TB block address). */
export const BRIDGE_BLOCK_KEY = 'tb.bridge.block';

export function lireBridgeBlock() {
  try {
    const a = String(localStorage.getItem(BRIDGE_BLOCK_KEY) || '').trim();
    return ADRESSE.test(a) ? a.toLowerCase() : '';
  } catch (_) { return ''; }
}

export function ecrireBridgeBlock(adr) {
  const a = String(adr || '').trim();
  if (!ADRESSE.test(a)) {
    try { localStorage.removeItem(BRIDGE_BLOCK_KEY); } catch (_) {}
    return '';
  }
  const n = a.toLowerCase();
  try { localStorage.setItem(BRIDGE_BLOCK_KEY, n); } catch (_) {}
  return n;
}

/**
 * Parse a human decimal string/number into integer token units (bigint).
 * Fail-closed on bad input — never silently truncates wrong.
 */
export function unitsFromHuman(amount, decimals) {
  const d = Number(decimals);
  if (!Number.isInteger(d) || d < 0 || d > 36) throw new Error('bad decimals');
  const raw = String(amount == null ? '' : amount).trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error('bad amount');
  const [whole, frac = ''] = raw.split('.');
  if (frac.length > d) throw new Error('too many decimals');
  const padded = frac.padEnd(d, '0');
  const joined = (whole + padded).replace(/^0+(?=\d)/, '') || '0';
  return BigInt(joined);
}

/**
 * Plan client-side fee skim (BRIDGE_FEE_BPS) for Bridge confirm.
 * Caller fills `to` / calldata with FEE_WALLET (never pass the address into UI copy).
 *
 * Live path only when From is ETH or USDC (user holds the settlement asset).
 * Net swap via hub = Phil GO (no 1 bps router yet).
 *
 * @param {{amount:number|string, fromSym?:string, toSym?:string, settleSym?:string}} p
 * @returns {{ok:boolean, live:boolean, stub?:boolean, feeUnits?:bigint, totalUnits?:bigint,
 *   netUnits?:bigint, decimals?:number, asset?:'ETH'|'USDC', settleSym:string,
 *   fromSym:string, toSym:string, feeBps:number, feeLabel:string, pourquoi?:string,
 *   goPhil?:boolean}}
 */
export function planBridgeFeeSkim(p) {
  const q = quoteBridge(p);
  if (!q.ok) {
    return { ok: false, live: false, settleSym: q.settleSym, fromSym: q.fromSym, toSym: q.toSym,
      feeBps: q.feeBps, feeLabel: q.feeLabel, pourquoi: q.pourquoi || 'Invalid quote' };
  }
  if (!(q.amount > 0)) {
    return { ok: false, live: false, settleSym: q.settleSym, fromSym: q.fromSym, toSym: q.toSym,
      feeBps: q.feeBps, feeLabel: q.feeLabel, pourquoi: 'Enter an amount above zero' };
  }
  const from = q.fromSym;
  if (from !== 'ETH' && from !== 'USDC') {
    return {
      ok: false, live: false, stub: true, goPhil: true,
      settleSym: q.settleSym, fromSym: q.fromSym, toSym: q.toSym,
      feeBps: q.feeBps, feeLabel: q.feeLabel,
      /* ⛔ Ce texte ARRIVE A L ECRAN (app.html le passe a setEtat). Il portait un prenom de
       *   l equipe, un nom de contrat interne et un tarif pour une route qui n existe pas — au
       *   moment precis ou quelqu un essaie de comprendre pourquoi son choix ne marche pas. */
      pourquoi: 'Swapping from this asset is not available. Swapping one token for another is not built yet.',
    };
  }
  const decimals = from === 'USDC' ? 6 : 18;
  let totalUnits;
  try {
    totalUnits = unitsFromHuman(q.amount, decimals);
  } catch (e) {
    return { ok: false, live: false, settleSym: q.settleSym, fromSym: q.fromSym, toSym: q.toSym,
      feeBps: q.feeBps, feeLabel: q.feeLabel, pourquoi: 'Enter a valid amount' };
  }
  const feeUnits = (totalUnits * BRIDGE_FEE_BPS) / 10000n;
  if (feeUnits <= 0n) {
    return { ok: false, live: false, settleSym: q.settleSym, fromSym: q.fromSym, toSym: q.toSym,
      feeBps: q.feeBps, feeLabel: q.feeLabel,
      /* ⛔ CE TEXTE ARRIVE A L ECRAN. Il nommait un tarif faux au moment precis ou quelqu un essaie
       *   de comprendre pourquoi son montant est refuse — donc il l empechait de calculer le bon. */
      pourquoi: 'Amount too small for the ' + BRIDGE_FEE_LABEL + ' fee — raise the amount' };
  }
  return {
    ok: true,
    live: true,
    goPhil: true, /* net swap still Phil-blocked */
    feeUnits,
    totalUnits,
    netUnits: totalUnits - feeUnits,
    decimals,
    asset: from,
    settleSym: from,
    fromSym: q.fromSym,
    toSym: q.toSym,
    feeBps: Number(BRIDGE_FEE_BPS),
    feeLabel: BRIDGE_FEE_LABEL,
    /* ⛔ Texte affiche. Il annonçait un frais « pret a partir » pour un echange qui n a jamais lieu. */
    pourquoi: 'Nothing is charged: swapping one token for another is not built yet, so there is no fee to take.',
  };
}

/**
 * Build the wallet call for a planned skim. feeWallet / usdc MUST come from frais-creation
 * constants in the caller — never hardcode a second copy here for UI leakage risk.
 *
 * @param {{plan:object, feeWallet:string, usdc:string, encodeTransfer:(to:string,amt:bigint)=>string}} args
 * @returns {{ok:boolean, to?:string, data?:string, value?:string, pourquoi?:string}}
 */
export function buildBridgeFeeCall({ plan, feeWallet, usdc, encodeTransfer }) {
  if (!plan || !plan.ok || !plan.live) {
    return { ok: false, pourquoi: (plan && plan.pourquoi) || 'No live Bridge fee plan' };
  }
  const sink = String(feeWallet || '').trim();
  if (!ADRESSE.test(sink)) return { ok: false, pourquoi: 'Fee sink misconfigured — nothing sent' };
  if (plan.asset === 'ETH') {
    return {
      ok: true,
      to: sink,
      data: '0x',
      value: '0x' + plan.feeUnits.toString(16),
    };
  }
  if (plan.asset === 'USDC') {
    const token = String(usdc || '').trim();
    if (!ADRESSE.test(token)) return { ok: false, pourquoi: 'USDC misconfigured — nothing sent' };
    let data;
    try { data = encodeTransfer(sink, plan.feeUnits); }
    catch (e) { return { ok: false, pourquoi: 'Could not encode USDC fee transfer' }; }
    return { ok: true, to: token, data, value: '0x0' };
  }
  return { ok: false, pourquoi: 'Unsupported fee asset' };
}

/**
 * Honest stub confirm — kept for tests / non-ETH-USDC From. UI prefers planBridgeFeeSkim.
 * @returns {{ok:false, stub:true, pourquoi:string, quote:object}}
 */
export function confirmerBridgeStub(quote) {
  return {
    ok: false,
    stub: true,
    goPhil: true,
    /* Retired: any copy that promised atomic tokenized↔tokenized without Phil GO */
    /* ⛔ Texte affiche : ni prenom, ni nom de contrat, ni tarif d une route inexistante. */
    pourquoi: 'Swapping one token for another is not built yet, so nothing is charged and nothing '
      + 'is swapped. The tokenized equity leg comes later — this is not a live trade.',
    quote: quote || null,
  };
}
