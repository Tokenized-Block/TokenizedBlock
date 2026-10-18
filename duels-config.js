/* duels-config.js — l ENCODAGE des arguments du constructeur de BlockDuels (usdc, devWallet, rewardPool, guardian : 4 mots statiques) et la
 * VERIFICATION d un enregistrement de deploiement. Pur, SANS import : deployer-duels.html l importe dans le navigateur, le preparateur, le
 * banc et les tests dans node.
 * ⛔ Une seule source pour l ordre : le preparateur encode avec, la page RE-ENCODE avec et refuse de signer si la donnee figee ne finit pas
 *   exactement par ce que les valeurs affichees donnent. L ordre est verifie contre l ABI compilee par le preparateur et test-deployer-duels. */
export const ORDRE_ARGS = Object.freeze(['usdc', 'devWallet', 'rewardPool', 'guardian']);
const ADR = /^0x[0-9a-f]{40}$/;
const ZERO = /^0x0{40}$/;
const bas = (x) => String(x || '').toLowerCase();
const adr = (x) => { const s = bas(x); if (!ADR.test(s)) throw new Error('bad address ' + x); return s.slice(2).padStart(64, '0'); };

/** les 128 octets (4 x 32) des arguments du constructeur, hex sans 0x */
export function encoderArgs(c) { return ORDRE_ARGS.map((k) => adr(c[k])).join(''); }

/** les refus du constructeur ET de la page, dits avant toute signature : rend [] si les valeurs sont deployables */
export function refusParametres(c) {
  const r = [];
  for (const k of ORDRE_ARGS) if (!ADR.test(bas(c && c[k]))) r.push(k + ' is missing');
  if (r.length) return r;
  for (const k of ORDRE_ARGS) if (ZERO.test(bas(c[k]))) r.push(k + ' cannot be zero');
  /* le contrat les admettrait ; la page, non : le 7 % « pot commun » irait en silence au dev, ou a un jeton */
  if (bas(c.rewardPool) === bas(c.devWallet)) r.push('rewardPool must not be the dev wallet (the 7% community share would silently go to dev)');
  if (bas(c.rewardPool) === bas(c.usdc)) r.push('rewardPool must not be the USDC contract');
  if (bas(c.guardian) === bas(c.usdc)) r.push('guardian must not be the USDC contract');
  return r;
}

/**
 * Ce que la page verifie AVANT d allumer le bouton. `sha256Hex` = l empreinte de `creation`, calculee par l appelant (crypto.subtle dans le
 * navigateur, node:crypto dans les tests). Rend { intacte, pourquoi[] } ; la moindre raison eteint le bouton.
 */
export function verifierEnregistrement(D, sha256Hex) {
  const pourquoi = [];
  if (!D || D.contrat !== 'BlockDuels') pourquoi.push('not a BlockDuels record');
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
  const r = refusParametres(D.constructeur || {});
  if (r.length) pourquoi.push(...r);
  if (D.adresse !== null && D.adresse !== undefined) pourquoi.push('already deployed at ' + D.adresse);
  return { intacte: pourquoi.length === 0, pourquoi };
}
