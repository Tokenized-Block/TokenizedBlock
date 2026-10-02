// marche-ouvert.js — « V8-open » : un SECOND marche, ouvert et annonce, pour un token ne ailleurs.
// ================================================================================================
// ⛔ CE QUI EST IMPOSSIBLE, DIT D ABORD : le hook d une pool v4 est FIGE a son initialisation. Les pools
//    LaunchBlitz/o1, Clanker, Zora, bankr GARDERONT leurs frais pour toujours. TB ne « recupere » rien la-bas.
// ⛔ CE QUI EST POSSIBLE : ouvrir A COTE une pool ETH/<token> dont le hook (contracts/foreign-open,
//    TBlockOpenMarketHook) preleve UN frais annonce en ETH -> a6cf. Preuve wei-exacte sur fork (bloc 52 074 194,
//    BRIAN) : 9/9 verts. NON DEPLOYE : `HOOK_MARCHE_OUVERT` est null, donc ce module ne route RIEN.
// ⛔ REGLE DE ROUTAGE (le GO de Phil, 2026-10-02) : « Buy here » ne prend la pool qui paie a6cf QUE si
//    l acheteur recoit AU MOINS autant (frais compris, tout compris). Sinon on garde la meilleure pool et on
//    DIT l ecart. Jamais de frais cache, jamais de prix degrade en silence.

/** ⛔⛔ TOUTES les adresses V8-open JAMAIS deployees, la plus recente EN DERNIER. On AJOUTE, on ne retire
 *   jamais : une pool initialisee sur un ancien V8-open garde ce hook pour toujours et continue de verser
 *   a6cf. Retirer l ancienne adresse a un redeploiement referait payer le frais routeur EN PLUS
 *   (double frais, cas Zero 1 n° 2). Liste lue par `tokenomics.js` > HOOKS_PAIENT_DEJA_A6CF. */
export const HOOKS_MARCHE_OUVERT = Object.freeze([]);
/** Le hook COURANT (celui des nouvelles pools) = le dernier de la liste ; null = non deploye -> aucun routage. */
export const HOOK_MARCHE_OUVERT = HOOKS_MARCHE_OUVERT.length ? HOOKS_MARCHE_OUVERT[HOOKS_MARCHE_OUVERT.length - 1] : null;
export const MARCHE_OUVERT_ACTIF = false;
/** ⛔ Cas Zero 1 n° 1 (hook null alors qu une pool V8-open existe) : le drapeau ne peut PAS etre ON avec une
 *   liste vide — sinon une pool V8-open serait routee avec le frais routeur EN PLUS de celui du hook.
 *   Rend null si coherent, sinon la raison. Verifie par test-hooks-paient-deja-20261002.mjs. */
export function incoherenceMarcheOuvert({ actif = MARCHE_OUVERT_ACTIF, hooks = HOOKS_MARCHE_OUVERT } = {}) {
  if (actif && !(Array.isArray(hooks) && hooks.length)) return 'open market flag ON but no V8-open hook listed';
  if (Array.isArray(hooks) && hooks.some((h) => !/^0x[0-9a-fA-F]{40}$/.test(String(h)))) return 'malformed V8-open hook address';
  return null;
}
/** frais du hook, en pips de 1e6 (2000 = 0,20 %) — le constructeur refuse > 1 %. */
export const FRAIS_MARCHE_OUVERT_PIPS = 2000;

/** `hooks` : une adresse OU une liste (defaut : TOUS les V8-open, anciens compris). */
export function estHookMarcheOuvert(h, hooks = HOOKS_MARCHE_OUVERT) {
  const x = String(h || '').toLowerCase();
  if (!x) return false;
  const liste = Array.isArray(hooks) ? hooks : (hooks ? [hooks] : []);
  return liste.some((k) => !!k && String(k).toLowerCase() === x);
}

/* ⛔⛔⛔ choisirMarche N EST PAS ENCORE UNE GARANTIE — et c est pourquoi RIEN NE L APPELLE (no-op, drapeau OFF).
 *   Crosscheck Zero 1 (2026-10-02, KO sur e93e9e2) : en recevant DEUX devis deja choisis par l appelant, elle
 *   ne voit pas ce qu on ne lui donne pas. Trois echecs reproduits :
 *     1. une pool SANS hook meilleure que les deux devis passes lui est invisible -> prix pire en silence ;
 *     2. une pool sans hook passee comme « devisA6cf » est acceptee comme marche TB, et la phrase
 *        « It charges 0.2 % in ETH to TokenizedBlock » devient FAUSSE ;
 *     3. une lecture etrangere ratee (null) fait choisir la pool TB meme si elle est pire.
 *   AVANT TOUT BRANCHEMENT elle doit prendre les POOLS CANDIDATES [{ cle, devis, lu }] et appliquer
 *   ELLE-MEME les regles de hook et de prix :
 *     - marche TB SEULEMENT si estHookMarcheOuvert(cle.hooks) ET la pool a de la liquidite ;
 *     - devis du marche TB >= le MAX de TOUTES les pools cotees (pas seulement « l etrangere ») ;
 *     - un seul candidat NON LU => aucun basculement (NON_MESURE), jamais un choix sur lecture partielle ;
 *     - decider EXPLICITEMENT si les pools sans hook sont admises comme candidates (et le dire a l ecran).
 *   Tant que ce n est pas fait et teste contre ces trois cas, ne PAS l appeler. */
/**
 * Choisit entre la meilleure pool etrangere et la pool qui paie a6cf, sur des DEVIS LUS (quoter), pas estimes.
 * @param {{ devisEtranger: bigint|null, devisA6cf: bigint|null, actif?: boolean }} o — sorties nettes pour l acheteur
 * @returns {{ choix: 'A6CF'|'ETRANGER'|'AUCUN', pourquoi: string, ecart: bigint|null }}
 *   ⛔ `ecart` = devisA6cf - devisEtranger (negatif = la pool TB donnerait MOINS ; c est ce qu on affiche).
 */
export function choisirMarche({ devisEtranger, devisA6cf, actif = MARCHE_OUVERT_ACTIF }) {
  const lu = (x) => typeof x === 'bigint' && x > 0n;
  if (!lu(devisEtranger) && !lu(devisA6cf)) return { choix: 'AUCUN', pourquoi: 'no quote read', ecart: null };
  if (!actif || !lu(devisA6cf)) return { choix: 'ETRANGER', pourquoi: actif ? 'TB market not quoted' : 'flag off', ecart: null };
  if (!lu(devisEtranger)) return { choix: 'A6CF', pourquoi: 'only market quoted', ecart: null };
  const ecart = devisA6cf - devisEtranger;
  if (ecart >= 0n) return { choix: 'A6CF', pourquoi: 'same or better price for the buyer', ecart };
  return { choix: 'ETRANGER', pourquoi: 'TB market would give less — kept the better price', ecart };
}

/** La phrase a l ecran. Le frais de la pool TB est TOUJOURS nomme quand on la choisit. */
export function phraseChoix(r, symbole = 'tokens') {
  if (r.choix === 'A6CF') {
    return 'Routed through the TokenizedBlock market: you receive at least as many ' + symbole
      + ' as on the other market. It charges ' + (FRAIS_MARCHE_OUVERT_PIPS / 10000) + ' % in ETH to TokenizedBlock.';
  }
  if (r.choix === 'ETRANGER' && typeof r.ecart === 'bigint' && r.ecart < 0n) {
    return 'The TokenizedBlock market would give you less on this trade, so we kept the better price.';
  }
  return '';
}
