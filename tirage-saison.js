// tirage-saison.js — LE TIRAGE DE SAISON (tweet de Phil 2026-10-17 : « win ranked games for some AAPLc… each ppl pay their entry with
// fees they paid »). Spec : workflow 2026-10-17 (3 designs, 2 juges), gagnant = Design B. PUR : aucune lecture reseau, aucune signature.
// ⛔ AUCUNE NOUVELLE MISE : un ticket vient des frais DEJA payes et VERIFIES par le serveur (revenu-externe.js, /api/paye) — un par wallet,
//    des que la somme de ses frais externes de la saison atteint F. Payer plus ne donne rien de plus (pas d avantage au volume).
// ⛔ v1 = SAISON BLANCHE (shadow) : aucun pot, le tirage est montre « no prize this season (shadow) ». Une saison payante n ouvre que si
//    >= 10 wallets externes atteignent F dans la saison blanche (critere de la spec) — decision de Phil, pas de ce module.
// ⛔ LE HASARD NE SE DEVINE PAS : le gagnant vient du hash d un bloc E FIXE A L OUVERTURE et strictement apres la cloture ; hash non lu = null.
import { keccak256 } from './keccak.js';

const enHex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
const hexVersOctets = (h) => { const s = String(h).replace(/^0x/, ''); const o = new Uint8Array(s.length / 2); for (let i = 0; i < o.length; i++) o[i] = parseInt(s.slice(2 * i, 2 * i + 2), 16); return o; };
const k256Hex = (hex) => '0x' + enHex(keccak256(hexVersOctets(hex)));
const ADR = /^0x[0-9a-f]{40}$/;
export const SEMAINE_MS = 7 * 86400000;
export const F_USD_V1 = 1; // le seuil du ticket, en dollars de frais VERIFIES (spec v1)
export const PART_POT_MAX = 0.35; // le pot ne depasse jamais 35 % de N x F (spec)

/** la saison d un instant : semaines depuis le lundi 2026-10-12 00:00 UTC (la semaine du lancement = S0). id = 'S' + numero. */
export const ORIGINE = Date.UTC(2026, 9, 12);
export function saisonDe(ms) {
  const n = Math.floor((ms - ORIGINE) / SEMAINE_MS);
  return { id: 'S' + n, debut: ORIGINE + n * SEMAINE_MS, fin: ORIGINE + (n + 1) * SEMAINE_MS };
}

/** valeur en dollars d un frais verifie : sum(montant / 10^dec * prix). Un prix ou des decimales NON LUS -> cette devise vaut 0 (jamais devine). */
export function valeurUsd(recus, { prix, decimales }) {
  let usd = 0;
  for (const r of recus || []) {
    const p = prix[String(r.devise).toLowerCase()], d = decimales[String(r.devise).toLowerCase()];
    if (!(Number.isFinite(p) && p > 0) || !Number.isInteger(d)) continue;
    usd += Number(BigInt(r.montant)) / 10 ** d * p;
  }
  return Math.round(usd * 1e6) / 1e6;
}

/** crediter un frais verifie a un wallet dans sa saison. Un hash ne compte qu une fois. Rend un NOUVEL etat. */
export function crediter(etat, { saison, payeur, hash, usd }) {
  const p = String(payeur || '').toLowerCase(), h = String(hash || '').toLowerCase();
  if (!ADR.test(p) || !/^0x[0-9a-f]{64}$/.test(h) || !(usd >= 0)) return etat;
  const s = { ...((etat || {})[saison] || {}) };
  const w = s[p] ? { usd: s[p].usd, hashes: [...s[p].hashes] } : { usd: 0, hashes: [] };
  if (w.hashes.includes(h)) return etat;
  w.hashes.push(h);
  w.usd = Math.round((w.usd + usd) * 1e6) / 1e6;
  s[p] = w;
  return { ...(etat || {}), [saison]: s };
}

/** les tickets : un par wallet dont les frais de la saison atteignent F. Liste TRIEE (l ordre est public et rejouable). */
export function tickets(saisonEtat, f = F_USD_V1) {
  return Object.entries(saisonEtat || {}).filter(([, w]) => w.usd >= f).map(([a]) => a).sort();
}

/** racine merkle des tickets (feuille = keccak(adresse), paires triees) : publiee a la cloture, tout le monde la recalcule. */
export function racine(liste) {
  if (!liste.length) return null;
  let niveau = liste.map((a) => k256Hex(a.slice(2).padStart(40, '0')));
  while (niveau.length > 1) {
    const suivant = [];
    for (let i = 0; i < niveau.length; i += 2) {
      if (i + 1 === niveau.length) { suivant.push(niveau[i]); continue; }
      const [x, y] = [niveau[i], niveau[i + 1]].sort();
      suivant.push(k256Hex(x.slice(2) + y.slice(2)));
    }
    niveau = suivant;
  }
  return niveau[0];
}

/** le tirage : k gagnants distincts parmi N tickets, depuis le hash du bloc E. hashE non lu -> null (jamais un gagnant devine). */
export function tirer({ hashE, saison, liste, k = 1 }) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(hashE || '')) || !liste.length) return null;
  const n = liste.length, pris = new Set(), gagnants = [];
  const idHex = [...new TextEncoder().encode(String(saison))].map((b) => b.toString(16).padStart(2, '0')).join('');
  for (let j = 0, essai = 0; gagnants.length < Math.min(k, n) && essai < 64 * k + n; essai++) {
    const x = BigInt(k256Hex(String(hashE).slice(2).toLowerCase() + idHex + j.toString(16).padStart(8, '0') + essai.toString(16).padStart(8, '0')));
    const i = Number(x % BigInt(n));
    if (pris.has(i)) continue;
    pris.add(i); gagnants.push(liste[i]); j++;
  }
  return gagnants;
}

/** le pot d une saison PAYANTE (pas en v1) : min(disponible, 35 % de N x F). */
export const plafondPot = (n, f, disponible) => Math.max(0, Math.min(disponible, PART_POT_MAX * n * f));

/* ══ v2 QUOTIDIEN (Phil 2026-10-17 soir : « fait plutot journalier avec plus grosse recompense fin week et encore plus gros fin du mois » ;
 *   « le ticket d entree c est 10 dollar per day de volume sur le block UNIT » ; « buy/sell tokenized stocks … est bon aussi »).
 *   Un JOUR (UTC) qualifie un wallet si son VOLUME VERIFIE du jour (volume-tirage.js : UNIT sur notre pool, ou actions tokenisees passees
 *   par l app) atteint SEUIL_VOLUME_JOUR_USD. Un jour qualifie = 1 ticket au tirage du JOUR, + 1 entree au tirage de la SEMAINE et du
 *   MOIS (qui joue plus de jours a plus d entrees ; le volume au-dela du seuil ne donne rien de plus dans la journee).
 *   ⛔ Toujours SANS POT tant qu aucune source de prix n est decidee : l ecran le dit (practice). */
export const JOUR_MS = 86400000;
export const SEUIL_VOLUME_JOUR_USD = 10;
export function jourDe(ms) {
  const d = Math.floor(ms / JOUR_MS);
  return { id: 'J' + new Date(d * JOUR_MS).toISOString().slice(0, 10), debut: d * JOUR_MS, fin: (d + 1) * JOUR_MS };
}
export function moisDe(ms) {
  const t = new Date(ms), debut = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1), fin = Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1);
  return { id: 'M' + new Date(debut).toISOString().slice(0, 7), debut, fin };
}
/** les jours (ids) d une periode [debut, fin[ */
export function joursEntre(debut, fin) {
  const out = [];
  for (let t = Math.floor(debut / JOUR_MS) * JOUR_MS; t < fin; t += JOUR_MS) out.push(jourDe(t).id);
  return out;
}
/* ══ PASS SKIN (Phil 2026-10-17 soir : « possibilite de buy Skin pour draws pour 1 semaine garanti ») : un skin ACHETE (mint verifie dans le
 *   recu, volume-tirage.js passSkinVerifie) donne le ticket du jour d achat et des 6 jours suivants, sans volume. passes = { wallet: [ids] }. */
export const JOURS_PASS_SKIN = 1; /* Phil 2026-10-17, 19:40 : « skin 1 day » (etait 7 a 19:00) */
export function joursPass(ms, n = JOURS_PASS_SKIN) { const d = jourDe(ms).debut; return Array.from({ length: n }, (_, k) => jourDe(d + k * JOUR_MS).id); }
/** les tickets d un jour : volume >= seuil, OU un pass skin qui couvre ce jour. Liste triee, sans doublon. */
export function ticketsJour(etatJours, jourId, passes = {}, seuil = SEUIL_VOLUME_JOUR_USD) {
  const s = new Set(tickets((etatJours || {})[jourId], seuil));
  for (const [a, ids] of Object.entries(passes || {})) if (Array.isArray(ids) && ids.includes(jourId) && ADR.test(a)) s.add(a);
  return [...s].sort();
}
/** les entrees d une periode : une par (wallet, jour qualifie), triees (adresse puis jour) — publiques et rejouables. */
export function entreesPeriode(etatJours, idsJours, seuil = SEUIL_VOLUME_JOUR_USD, passes = {}) {
  const e = [];
  for (const j of idsJours) for (const a of ticketsJour(etatJours, j, passes, seuil)) e.push({ adresse: a, jour: j });
  return e.sort((x, y) => (x.adresse === y.adresse ? x.jour.localeCompare(y.jour) : x.adresse.localeCompare(y.adresse)));
}
