/* blockrolls-config.js — l ENCODAGE du Config de BlockRolls (14 mots statiques, l ordre du struct) et la VERIFICATION d un enregistrement
 * de deploiement. Pur, SANS import : la page deployer-blockrolls.html l importe dans le navigateur, le preparateur et les tests dans node.
 * ⛔ Une seule source pour l ordre des champs : le preparateur encode avec, la page RE-ENCODE avec et refuse de signer si la donnee figee
 *   ne finit pas exactement par ce que les valeurs affichees donnent. L ordre est verifie contre l ABI compilee par test-blockrolls-plan. */
export const ORDRE_CONFIG = Object.freeze(['usdc', 'devWallet', 'hook', 'unitPoolId', 'rollPrice', 'passPrice', 'passRolls', 'passWindow', 'potShareBps', 'prize5', 'prize4', 'prize3', 'prize2', 'minScore']);
const LARGEURS = Object.freeze({ rollPrice: 256, passPrice: 256, passRolls: 32, passWindow: 64, potShareBps: 16, prize5: 64, prize4: 64, prize3: 64, prize2: 64, minScore: 8 });
const bas = (x) => String(x || '').toLowerCase();
const adr = (x) => { const s = bas(x); if (!/^0x[0-9a-f]{40}$/.test(s)) throw new Error('bad address ' + x); return s.slice(2).padStart(64, '0'); };
const b32 = (x) => { const s = bas(x); if (!/^0x[0-9a-f]{64}$/.test(s)) throw new Error('bad bytes32 ' + x); return s.slice(2); };
const u = (n, bits) => { const v = BigInt(n); if (v < 0n || v >= (1n << BigInt(bits))) throw new Error('uint' + bits + ' out of range: ' + n); return v.toString(16).padStart(64, '0'); };

/** les 448 octets (14 x 32) des arguments du constructeur, hex sans 0x */
export function encoderConfig(c) {
  return adr(c.usdc) + adr(c.devWallet) + adr(c.hook) + b32(c.unitPoolId)
    + ORDRE_CONFIG.slice(4).map((k) => u(c[k], LARGEURS[k])).join('');
}

/**
 * Ce que la page verifie AVANT d allumer le bouton. `sha256Hex` = l empreinte de la donnee `creation`, calculee par l appelant
 * (crypto.subtle dans le navigateur, node:crypto dans les tests) : ce module ne hache pas, il compare.
 * Rend { intacte, pourquoi[] } ; la moindre raison eteint le bouton.
 */
export function verifierEnregistrement(D, sha256Hex) {
  const pourquoi = [];
  if (!D || D.contrat !== 'BlockRolls') pourquoi.push('not a BlockRolls record');
  if (!D || D.chaine !== 8453) pourquoi.push('not Base (8453)');
  if (!D || typeof D.creation !== 'string' || !/^0x[0-9a-f]+$/.test(D.creation)) pourquoi.push('creation data unreadable');
  if (pourquoi.length) return { intacte: false, pourquoi };
  if ((D.creation.length - 2) / 2 !== D.octetsCreation) pourquoi.push('creation length differs from the record');
  if (bas(sha256Hex) !== bas(D.sha256Creation)) pourquoi.push('sha256 fingerprint differs from the record');
  let attendu = null;
  try { attendu = encoderConfig(D.constructeur); } catch (e) { pourquoi.push('config unreadable: ' + String(e.message || e)); }
  if (attendu && !D.creation.endsWith(attendu)) pourquoi.push('the creation data does not end with the displayed config');
  if (attendu && attendu.length / 2 !== D.octetsArgs) pourquoi.push('argument length differs from the record');
  if (D.adresse !== null && D.adresse !== undefined) pourquoi.push('already deployed at ' + D.adresse);
  return { intacte: pourquoi.length === 0, pourquoi };
}

/** les mots de la page, derives de l enregistrement (jamais tapes) : « 0.50 USDC », « 5 USDC »… */
export const usdc6 = (n) => { const v = BigInt(n); const e = v / 1000000n, r = (v % 1000000n).toString().padStart(6, '0').replace(/0+$/, ''); return e.toString() + (r ? '.' + (r.length === 1 ? r + '0' : r) : ''); };
export const pct = (bps) => (Number(bps) / 100).toString();
