/* config-hooks-facturants.js — L ADRESSE DU HOOK BERCEAU 24 H (TBlockLaunchLockHook, suivi24h), INJECTEE AU DEPLOIEMENT.
 *
 * ⭐ Pourquoi (Zero 1, crosscheck 2026-10-02) : f0b4e91 ne tenait « un seul frais par jambe » QUE si l appelant
 *   passait l adresse du hook berceau dans `hooksFacturants`. Avec la liste par defaut (V8 seul), chaque jambe sur le
 *   berceau etait facturee DEUX fois : achat de 1 NVDAc = routeur 90 000 + hook 69 937 = 159 937 au lieu de 70 000.
 *   Le berceau entre donc dans la liste PAR DEFAUT (multipool.js `HOOKS_FACTURANTS`), depuis CETTE config.
 *
 * Sources, dans l ordre (la premiere non vide gagne) :
 *   1. process.env.TB_HOOK_BERCEAU_24H         — Node : serveur, bancs, scripts, FFI des tests forge ;
 *   2. globalThis.TB_CONFIG.HOOK_BERCEAU_24H   — navigateur : objet pose par la page AVANT l import du module ;
 *   3. HOOK_BERCEAU_24H_DEPLOYE ci-dessous     — ecrit par le deploiement (adresse imprimee par le script de deploy).
 *   Rien de tout cela => null : aucun hook berceau n est deploye, il n y a aucune jambe berceau a facturer.
 * ⛔ JAMAIS DEVINEE. Une valeur PRESENTE mais invalide (pas une adresse, ou pas les bits de permission 0x26cc du hook
 *   berceau) LEVE une erreur a l import : on ne retombe jamais en silence sur une liste sans le berceau (0,18 %).
 * ⛔ Rien n est deploye au 2026-10-02 : la constante reste null. Le jour du deploiement : y ecrire l adresse ET
 *   relancer test-multipool.mjs (section 7) + le banc forge `Z1XMultipoolOrdreTest`.
 */
export const HOOK_BERCEAU_24H_DEPLOYE = null;

/** bits de permission V4 du hook berceau (Hooks.ALL_HOOK_MASK = 14 bits) : V9 0x24cc | beforeRemoveLiquidity 0x200 */
export const BITS_HOOK_BERCEAU_24H = 0x26cc;
const MASQUE_HOOK = 0x3fffn;

/** rend l adresse en minuscules, ou null si `brut` est vide ; LEVE si `brut` est present mais invalide */
export function validerHookBerceau(brut, origine = 'config') {
  if (brut === undefined || brut === null) return null;
  const a = String(brut).trim().toLowerCase();
  if (a === '') return null;
  if (!/^0x[0-9a-f]{40}$/.test(a)) throw new Error('TB_HOOK_BERCEAU_24H (' + origine + ') : pas une adresse : ' + a);
  if ((BigInt(a) & MASQUE_HOOK) !== BigInt(BITS_HOOK_BERCEAU_24H)) {
    throw new Error('TB_HOOK_BERCEAU_24H (' + origine + ') : ' + a + ' ne porte pas les bits 0x26cc du hook berceau 24 h');
  }
  if (/^0x0{40}$/.test(a)) throw new Error('TB_HOOK_BERCEAU_24H (' + origine + ') : adresse nulle');
  return a;
}

function lire() {
  const env = typeof process !== 'undefined' && process && process.env ? process.env.TB_HOOK_BERCEAU_24H : undefined;
  if (env !== undefined && String(env).trim() !== '') return validerHookBerceau(env, 'env');
  const g = typeof globalThis !== 'undefined' && globalThis.TB_CONFIG ? globalThis.TB_CONFIG.HOOK_BERCEAU_24H : undefined;
  if (g !== undefined && g !== null && String(g).trim() !== '') return validerHookBerceau(g, 'TB_CONFIG');
  return validerHookBerceau(HOOK_BERCEAU_24H_DEPLOYE, 'deploy');
}

/** l adresse effective (minuscules) ou null */
export const HOOK_BERCEAU_24H = lire();
