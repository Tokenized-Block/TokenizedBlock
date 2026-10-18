/* ticketpot-config.js — l ENCODAGE des arguments du constructeur de TicketPot (usdc, verifier, guardian : 3 mots statiques) et la
 * VERIFICATION d un enregistrement de deploiement. Pur, SANS import : deployer-ticketpot.html l importe dans le navigateur, le preparateur,
 * le banc et les tests dans node.
 * ⛔ Une seule source pour l ordre : le preparateur encode avec, la page RE-ENCODE avec et refuse de signer si la donnee figee ne finit pas
 *   exactement par ce que les valeurs affichees donnent. L ordre est verifie contre l ABI compilee par test-deployer-ticketpot. */
export const ORDRE_ARGS = Object.freeze(['usdc', 'verifier', 'guardian']);
const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x || '').toLowerCase();
const adr = (x) => { const s = bas(x); if (!ADR.test(s)) throw new Error('bad address ' + x); return s.slice(2).padStart(64, '0'); };

/** les 96 octets (3 x 32) des arguments du constructeur, hex sans 0x */
export function encoderArgs(c) { return ORDRE_ARGS.map((k) => adr(c[k])).join(''); }

/** les refus du constructeur ET de la page, dits avant toute signature : rend [] si les valeurs sont deployables */
export function refusParametres(c, { devWallet = null } = {}) {
  const r = [];
  for (const k of ORDRE_ARGS) if (!ADR.test(bas(c && c[k]))) r.push(k + ' is missing');
  if (r.length) return r;
  const z = /^0x0{40}$/;
  if (z.test(bas(c.usdc))) r.push('usdc cannot be zero');
  if (z.test(bas(c.verifier))) r.push('verifier cannot be zero');
  /* le contrat admet un gardien nul ; la page, non : sans gardien, seul l owner pourrait geler les claims si la cle du verifier fuit */
  if (z.test(bas(c.guardian))) r.push('guardian cannot be zero (nobody else could pause fast)');
  if (bas(c.guardian) === bas(c.verifier)) r.push('guardian must be its own key, not the verifier');
  if (devWallet && bas(c.verifier) === bas(devWallet)) r.push('verifier must be the server key, not the fee wallet');
  return r;
}

/**
 * Ce que la page verifie AVANT d allumer le bouton. `sha256Hex` = l empreinte de `creation`, calculee par l appelant (crypto.subtle dans le
 * navigateur, node:crypto dans les tests). Rend { intacte, pourquoi[] } ; la moindre raison eteint le bouton.
 */
export function verifierEnregistrement(D, sha256Hex) {
  const pourquoi = [];
  if (!D || D.contrat !== 'TicketPot') pourquoi.push('not a TicketPot record');
  if (!D || D.chaine !== 8453) pourquoi.push('not Base (8453)');
  if (D && D.pret !== true) pourquoi.push('not ready: ' + [...(D.manquants || []).map((m) => m + ' is missing'), ...(D.refus || [])].join('; '));
  if (!D || typeof D.creation !== 'string' || !/^0x[0-9a-f]+$/.test(D.creation)) pourquoi.push('creation data unreadable');
  if (pourquoi.length) return { intacte: false, pourquoi };
  if ((D.creation.length - 2) / 2 !== D.octetsCreation) pourquoi.push('creation length differs from the record');
  if (bas(sha256Hex) !== bas(D.sha256Creation)) pourquoi.push('sha256 fingerprint differs from the record');
  let attendu = null;
  try { attendu = encoderArgs(D.constructeur); } catch (e) { pourquoi.push('arguments unreadable: ' + String(e.message || e)); }
  if (attendu && !D.creation.endsWith(attendu)) pourquoi.push('the creation data does not end with the displayed arguments');
  if (attendu && attendu.length / 2 !== D.octetsArgs) pourquoi.push('argument length differs from the record');
  const r = refusParametres(D.constructeur || {}, { devWallet: D.feeWallet });
  if (r.length) pourquoi.push(...r);
  if (D.adresse !== null && D.adresse !== undefined) pourquoi.push('already deployed at ' + D.adresse);
  return { intacte: pourquoi.length === 0, pourquoi };
}
