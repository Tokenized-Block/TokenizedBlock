/* berceau-24h.js — textes et etats du « berceau » de 24 h (launch-lock), cote app.
 *
 * ⛔⛔ DRAPEAU ETEINT PAR DEFAUT. `LAUNCH_LOCK_24H = false` : tant qu il est faux, RIEN de ce module
 *     n apparait a l ecran (ni la lore sur Create, ni l avertissement « seize »). Le hook et le jeton
 *     du berceau sont un prototype prouve sur fork (contracts/launch-lock), PAS deploye.
 *
 * ⛔ TEXTES EXACTS, APPROUVES PAR LE FONDATEUR (2026-10-02). On ne les reformule pas ici :
 *    · lore Create (titre + corps) ;
 *    · avertissement « seize » a DEUX etats affiches (actif, inconnu). Une action dont le seize est
 *      INACTIF n affiche RIEN. {SYM} = le symbole de l action appariee.
 *
 * ⛔ D OU VIENT L ETAT « seize ». Recensement lu sur la chaine (Base, bloc 52070900, apres Cobalt),
 *    script `contracts/launch-lock/script/seize-census.sh`, sortie `seize-census-52070900.tsv` :
 *    actif <=> policyId(keccak("SEIZE_EXEMPT_POLICY")) != 0. Une devise ABSENTE de la table (jeton
 *    colle a la main, action ajoutee depuis) est INCONNUE — et l inconnu s affiche, il ne se tait pas.
 *    Un instantane peut vieillir : l emetteur peut activer une politique plus tard. */

export const LAUNCH_LOCK_24H = false;

export const BERCEAU_TITRE = 'First 24 hours: the cradle.';
export const BERCEAU_CORPS = 'Every block is born protected. For its first day, it lives only in its own pool: anyone can feed it, and anyone who fed it can take back what they bought. No one can drain it, no one can copy it elsewhere. After 24 hours the cradle opens, and your block walks on its own.';

const SAISIE_ACTIF = "The issuer of {SYM} can take back {SYM} from any wallet, including your block's collateral. If it does, the collateral shrinks, and we can't reverse it.";
const SAISIE_INCONNU = "We couldn't check whether the issuer of {SYM} can take back {SYM}. Assume it can: your block's collateral could be reduced by the issuer, and we couldn't reverse it.";

/* Instantane du recensement (bloc 52070900, ts 1790931147). Cle = adresse en minuscules. */
export const BLOC_RECENSEMENT_SAISIE = 52070900;
export const SAISIE_PAR_DEVISE = Object.freeze({
  '0xb200000000000000000000c2e324d24d7eecd1fb': 'disabled', // AAPLc
  '0xb200000000000000000000d9192b6b456483c2e8': 'disabled', // AMZNc
  '0xb200000000000000000000fc737aea6196ab5a4c': 'disabled', // AVGOc
  '0xb20000000000000000000016f9dfe862feba122b': 'disabled', // BEc
  '0xb2000000000000000000002d0ba3164cc74f58b7': 'disabled', // GOOGLc
  '0xb20000000000000000000043a599976181bcf336': 'disabled', // HIMSc
  '0xb2000000000000000000008bc8786b856e61707c': 'disabled', // METAc
  '0xb200000000000000000000ab99cfa739e253872b': 'disabled', // MSFTc
  '0xb2000000000000000000004884b426556b92883d': 'disabled', // MSTRc
  '0xb200000000000000000000fd2f87532b90095211': 'disabled', // MUc
  '0xb20000000000000000000078ee7ce2fe4908108c': 'disabled', // NVDAc
  '0xb2000000000000000000007d16372840df4dabbe': 'disabled', // PLTRc
  '0xb200000000000000000000397293cb8cda9a10c5': 'disabled', // SNDKc
  '0xb2000000000000000000007b9fcbd005511acbd5': 'disabled', // SPCXc
  '0xb2000000000000000000001e800a7f5189430cd0': 'disabled', // TSLAc
  '0xb2000000000000000000002feb517dfec7415344': 'disabled', // OUSD
  '0xb20000000000000000000024c30d3fcb7931272e': 'disabled', // TBLOCK
});

/* Devises qui ne PEUVENT pas avoir de seize : ETH natif et ERC-20 classiques (pas des B20). */
const SANS_SAISIE = new Set([
  '0x0000000000000000000000000000000000000000', // ETH
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC
  '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf', // cbBTC
  '0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4', // TOSHI
]);

/** 'enabled' | 'disabled' | 'unknown' | null (null = pas de devise appariee, ou devise sans seize). */
export function etatSaisie(adr, table = SAISIE_PAR_DEVISE) {
  const a = String(adr || '').trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(a)) return null;
  if (SANS_SAISIE.has(a)) return null;
  const e = table[a];
  return e === 'enabled' || e === 'disabled' ? e : 'unknown';
}

/** Le texte a afficher, ou null quand il ne faut RIEN afficher. */
export function texteSaisie(sym, etat, actif = LAUNCH_LOCK_24H) {
  if (actif !== true) return null;
  const s = String(sym || '').trim();
  if (!s) return null;
  const modele = etat === 'enabled' ? SAISIE_ACTIF : etat === 'unknown' ? SAISIE_INCONNU : null;
  return modele ? modele.split('{SYM}').join(s) : null;
}

/** Peint (ou cache) l avertissement dans `el`. Rend le texte affiche, ou null. */
export function peindreSaisie(el, adr, sym, actif = LAUNCH_LOCK_24H) {
  const t = texteSaisie(sym, etatSaisie(adr), actif);
  if (el) { el.textContent = t || ''; el.hidden = !t; }
  return t;
}

/** Peint (ou cache) la lore du berceau dans `el` (un conteneur avec .titre / .note). */
export function peindreBerceau(el, actif = LAUNCH_LOCK_24H) {
  if (!el) return false;
  const on = actif === true;
  const t = el.querySelector('[data-berceau="titre"]');
  const c = el.querySelector('[data-berceau="corps"]');
  if (t) t.textContent = on ? BERCEAU_TITRE : '';
  if (c) c.textContent = on ? BERCEAU_CORPS : '';
  el.hidden = !on;
  return on;
}
