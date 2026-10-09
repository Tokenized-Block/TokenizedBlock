// mode-essai.js — LE MODE ESSAI : la vraie interface, un wallet SIMULE, un fork LOCAL. Eteint par defaut.
// ================================================================================================
// POURQUOI (2026-10-04). Le test « wallet connecte » du panneau (TEST-WALLET-PANNEAU-20261004.md) n a jamais ete
//   rejoue sur le dernier build : il faut un vrai wallet, et aucun n est disponible cote agent (aucune cle, jamais).
//   Le substitut le plus proche qui reste honnete : l app telle quelle, ses lectures et celles du serveur pointees
//   sur un fork local (base-anvil), et un fournisseur EIP-1193 sans cle qui « signe » par impersonation sur ce fork.
//
// ⛔⛔ CE MODULE NE FAIT QUE DECIDER, ET IL DECIDE « NON » PAR DEFAUT. Deux regles pures, une par cote :
//     · la PAGE  (`modeEssai`)    : actif seulement si elle est servie depuis CETTE machine (localhost, 127.0.0.1,
//       [::1], egalite exacte) ET que l URL le demande (`?essai=wallet`) ET que le noeud d essai est lui-meme sur
//       cette machine ET qu un compte entier est donne. Sur tokenizedblock.space la premiere condition est fausse :
//       aucun parametre d URL ne peut y changer les noeuds lus ni le wallet.
//     · le SERVEUR (`essaiServeur`) : actif seulement si `TB_RPC_TEST` est pose, designe un noeud de CETTE machine,
//       et que le processus ne tourne PAS sur Railway (aucune variable `RAILWAY_*`, pas de NODE_ENV=production).
//   Deux gardes independantes de chaque cote (l hote ET le noeud) : retirer l une ne suffit pas a lire ailleurs.
// ⛔ LE NOEUD D ESSAI EST TOUJOURS UNE BOUCLE LOCALE. Un parametre `rpc=https://…` ferait lire a la page un etat
//   choisi par celui qui a ecrit le lien (soldes, prix, recus) : c est refuse, meme en local.
// ⚠️ CE QUE CE MODULE NE PROUVE PAS : qu un vrai wallet fait pareil. Le wallet simule n a ni ecran, ni cle, ni
//   estimation de gaz a lui, et ce n est pas un smart wallet. Voir ESSAI-WALLET-SIMULE-20261004.md.

/** Le parametre d URL qui demande le mode essai, et sa seule valeur admise : `?essai=wallet`. */
export const PARAM_ESSAI = 'essai';
export const VALEUR_ESSAI = 'wallet';
/** Le fork local de la session (base-anvil) : le defaut quand `rpc=` est absent. */
export const RPC_ESSAI_DEFAUT = 'http://127.0.0.1:8549';

/* ⛔ EGALITE EXACTE, JAMAIS UN PREFIXE NI UN SUFFIXE : `localhost.exemple.com` et `127.0.0.1.exemple.com` sont des
 *   noms publics. `location.hostname` et `URL.hostname` rendent `[::1]` avec ses crochets. */
const HOTES_LOCAUX = Object.freeze(['localhost', '127.0.0.1', '[::1]']);

/** Ce nom d hote designe-t-il cette machine ? */
export function estHoteLocal(hote) {
  return HOTES_LOCAUX.includes(String(hote === undefined || hote === null ? '' : hote).toLowerCase());
}

/** L origine d un noeud de CETTE machine (`http://127.0.0.1:8549`), ou `null`.
 * ⛔ http seulement, sans identifiants, sans chemin ni requete : la forme d un fork local, et rien d autre.
 *   `http://127.0.0.1@exemple.com` a pour hote exemple.com : refuse par l hote ET par les identifiants. */
export function urlLocale(u) {
  let x;
  try { x = new URL(String(u || '')); } catch (_) { return null; }
  if (x.protocol !== 'http:') return null;
  if (x.username || x.password) return null;
  if (!estHoteLocal(x.hostname)) return null;
  if ((x.pathname && x.pathname !== '/') || x.search || x.hash) return null;
  return x.origin;
}

const ADRESSE = /^0x[0-9a-fA-F]{40}$/;

/**
 * La decision de la PAGE. Pure : elle recoit l hote et la requete, elle ne lit rien d autre.
 * ⛔ TROIS SORTIES : pas demande (`pourquoi: null`) · demande et refuse (`pourquoi` dit quoi) · actif.
 * @param {{ hote: string, recherche: string }} lieu  `location.hostname` et `location.search`
 * @returns {{ actif: boolean, rpc: string|null, compte: string|null, pourquoi: string|null }}
 */
export function modeEssai({ hote, recherche } = {}) {
  const non = (pourquoi = null) => ({ actif: false, rpc: null, compte: null, pourquoi });
  let q;
  try { q = new URLSearchParams(String(recherche || '')); } catch (_) { return non(); }
  if (q.get(PARAM_ESSAI) !== VALEUR_ESSAI) return non();
  if (!estHoteLocal(hote)) return non('test mode exists only on a page served from this machine (localhost)');
  const rpc = urlLocale(q.get('rpc') || RPC_ESSAI_DEFAUT);
  if (!rpc) return non('the test node must be a plain http address on this machine (127.0.0.1, localhost or [::1])');
  const compte = String(q.get('compte') || '');
  if (!ADRESSE.test(compte)) return non('the test account must be a whole address: compte=0x… (40 hex characters)');
  return { actif: true, rpc, compte: compte.toLowerCase(), pourquoi: null };
}

/**
 * La decision du SERVEUR. Pure : elle recoit l environnement.
 * ⛔ `TB_RPC_TEST` absent ou vide = rien ne change (`demande: false`). Pose mais refuse = IGNORE, et le serveur le
 *   journalise : il garde ses noeuds habituels, il ne s arrete pas (un site eteint pour une variable de trop
 *   serait pire que la variable).
 * ⚠️ NON MESURE : la liste exacte des variables que Railway pose. Le depot lit lui-meme RAILWAY_VOLUME_MOUNT_PATH
 *   en production ; on refuse donc des qu UNE variable `RAILWAY_*` non vide existe.
 * @returns {{ demande: boolean, actif: boolean, rpc: string|null, pourquoi: string|null }}
 */
export function essaiServeur(env) {
  const e = env || {};
  const brut = String(e.TB_RPC_TEST === undefined || e.TB_RPC_TEST === null ? '' : e.TB_RPC_TEST).trim();
  if (!brut) return { demande: false, actif: false, rpc: null, pourquoi: null };
  const refus = (pourquoi) => ({ demande: true, actif: false, rpc: null, pourquoi });
  const rpc = urlLocale(brut);
  if (!rpc) return refus('TB_RPC_TEST must be a plain http address on this machine (127.0.0.1, localhost or [::1])');
  const railway = Object.keys(e).filter((k) => /^RAILWAY_/.test(k) && String(e[k] || '') !== '');
  if (railway.length) return refus('TB_RPC_TEST is refused on Railway (' + railway[0] + ' is set)');
  if (String(e.NODE_ENV || '').toLowerCase() === 'production') return refus('TB_RPC_TEST is refused when NODE_ENV is production');
  return { demande: true, actif: true, rpc, pourquoi: null };
}

/**
 * Pose `simule` comme `window.ethereum`. Rend vrai SEULEMENT si c est bien lui qui s y trouve ensuite.
 * ⛔⛔ POURQUOI ON VERIFIE AU LIEU DE SUPPOSER. Une extension de wallet (Rabby, MetaMask…) pose `window.ethereum` avant la page,
 *   parfois sans laisser quiconque le remplacer. Si elle le garde, la page en mode essai lirait un FORK et ferait signer un VRAI
 *   wallet : un plan bati sur l etat du fork, envoye sur la vraie chaine. C est le seul chemin par lequel ce mode pourrait
 *   bouger de vrais fonds — l appelant (app.html) ARRETE donc la page quand cette fonction rend faux.
 */
export function poserFournisseur(fenetre, simule) {
  try { Object.defineProperty(fenetre, 'ethereum', { configurable: true, writable: true, value: simule }); }
  catch (_) { try { fenetre.ethereum = simule; } catch (_2) { /* juge juste dessous */ } }
  let lu = null;
  try { lu = fenetre.ethereum; } catch (_) { lu = null; }
  return lu === simule;
}

/**
 * Un fournisseur EIP-1193 pose TOUT DE SUITE, qui attend le vrai (charge par `import()`).
 * POURQUOI. La page lit `window.ethereum` des son chargement ; le wallet simule, lui, n est charge qu en mode
 *   essai (jamais telecharge par un visiteur). Ce relais se pose de facon synchrone et fait patienter chaque
 *   appel jusqu a l arrivee du module : pas d `await` au niveau du module de la page.
 * ⛔ Un chargement rate se dit a CHAQUE appel (`request` rejette avec la raison) : jamais un silence.
 */
export function fournisseurDiffere(promesse) {
  const enAttente = [];
  let reel = null;
  const pret = Promise.resolve(promesse).then((f) => {
    if (!f || typeof f.request !== 'function') throw new Error('the simulated wallet did not load');
    reel = f;
    for (const [ev, fn] of enAttente.splice(0)) f.on(ev, fn);
    return f;
  });
  pret.catch(() => { /* dit a chaque request() */ });
  return {
    isWalletSimule: true,
    request: async (args) => (await pret).request(args),
    on(ev, fn) { if (reel) reel.on(ev, fn); else enAttente.push([ev, fn]); return this; },
    removeListener(ev, fn) {
      if (reel) reel.removeListener(ev, fn);
      else { const i = enAttente.findIndex((x) => x[0] === ev && x[1] === fn); if (i >= 0) enAttente.splice(i, 1); }
      return this;
    },
  };
}
