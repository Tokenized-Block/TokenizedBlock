// blockskins.js - L APP ET LE CONTRAT BlockSkins DEPLOYE (Phil, 2026-10-11 : « le market des skins : 1 skin a 1 dollar, enchères avec des
// actions tokenized Coinbase, fees de l app sur chaque achat/vente, ce qui l achete voit son brain prendre l apparence du skin, visible
// dans le wallet »).
// Le contrat est DEPLOYE (lu sur la chaine le 2026-10-11) : blockskins-deploiement.js. Ses regles sont GRAVEES : mint 1 USDC au wallet
//   de frais ; vente/enchere en devise admise (currencyAllowed - ETH et USDC aujourd hui) ; 10 % de chaque vente au wallet de frais ;
//   enchere <= 7 jours, prolongee de 5 min sur une offre tardive ; surenchere minimale 5 % ; validation « les deux cochent » executable
//   par n importe qui (un agent) sans jamais garder les fonds.
// ⛔ CE MODULE NE SIGNE RIEN ET N ENVOIE RIEN : il encode des appels NON SIGNES et decode des lectures. Le wallet de la personne signe.
// ⛔ La skin appartient a qui DETIENT le NFT (ownerOf / skinsPage.holder) - jamais a un index de serveur.
import { BLOCKSKINS_DEPLOIEMENT } from './blockskins-deploiement.js';
import { selecteur } from './encodeur.js';

/* v2 (tokenURI avec image) quand son adresse a ete RELUE sur la chaine et ecrite par le generateur ; avant, v1 (`precedent`, jamais minte) */
export const BLOCKSKINS = String(BLOCKSKINS_DEPLOIEMENT.adresse || BLOCKSKINS_DEPLOIEMENT.precedent.adresse).toLowerCase();
export const BLOCKSKINS_CHAINE = BLOCKSKINS_DEPLOIEMENT.chaine;
export const SKIN_MINT_USDC = 1_000_000n; /* MINT_PRICE du contrat (6 decimales) */
export const SKIN_FRAIS_BPS = 1000n;      /* SALE_FEE_BPS : 10 % */
export const SKIN_ENCHERE_MAX_S = 604800n; /* MAX_AUCTION : 7 jours */
export const SKIN_SURENCHERE_BPS = 500n;   /* MIN_RAISE_BPS : +5 % */
/* ⛔⛔ Phil, 2026-10-11 : « v2 avant tout mint ». Le contrat v1 (0xea6c…e77d) ne montre pas la skin dans un wallet : son tokenURI n a AUCUNE
 *   image, et son JSON brut porte « # » - fetch() (lecteur conforme) le coupe a 29 caracteres sur 219, JSON invalide (mesure sur fork,
 *   skin #1). Le mint ne s ouvre que sur un deploiement dont l enregistrement GENERE dit que le tokenURI porte l image (derive de la
 *   source) ET dont l adresse a ete relue sur la chaine - jamais sur un drapeau pose a la main ici. */
export const SKIN_MINT_OUVERT = BLOCKSKINS_DEPLOIEMENT.imageDansLeWallet === true && /^0x[0-9a-fA-F]{40}$/.test(String(BLOCKSKINS_DEPLOIEMENT.adresse || ''));
export const ETH = '0x0000000000000000000000000000000000000000';
const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x || '').toLowerCase();
const mot = (n) => BigInt(n).toString(16).padStart(64, '0');
const adrMot = (a) => { const b = bas(a); if (!ADR.test(b)) throw new Error('a whole address is required'); return b.slice(2).padStart(64, '0'); };
const positif = (v, nom) => { let x; try { x = BigInt(v); } catch (_) { throw new Error(nom + ' must be raw integer units'); } if (x <= 0n) throw new Error(nom + ' must be above zero'); return x; };
const ent359 = (n) => Number.isInteger(n) && n >= 0 && n <= 359;

/** La recette de l app ({ id:'random', angle, h:[h1,h2,h3], cube, noyau, fond }) -> les 7 teintes, DANS L ORDRE DU CONTRAT :
 *  tour de l anneau, anneau 1, 2, 3, aretes, noyau, fond. Refus (jamais d arrondi) hors 0..359. */
export function recetteVersTeintes(r) {
  const h = r && Array.isArray(r.h) ? r.h : [];
  const t = [r && r.angle, h[0], h[1], h[2], r && r.cube, r && r.noyau, r && r.fond];
  if (!r || r.id !== 'random' || h.length !== 3 || !t.every(ent359)) throw new Error('a skin is seven whole hues from 0 to 359');
  return t;
}
/** packRecipe du contrat, en JS : teinte i << 9*i (uint64, bit 63 a 0). Verifiee contre l eth_call packRecipe du contrat deploye. */
export function packRecette(r) {
  return recetteVersTeintes(r).reduce((acc, v, i) => acc | (BigInt(v) << BigInt(9 * i)), 0n);
}
export function unpackRecette(n) {
  const x = BigInt(n);
  const t = [0, 1, 2, 3, 4, 5, 6].map((i) => Number((x >> BigInt(9 * i)) & 0x1ffn));
  return { id: 'random', angle: t[0], h: [t[1], t[2], t[3]], cube: t[4], noyau: t[5], fond: t[6] };
}

/* ── LES APPELS (non signes) ── */
const appel = (sig, args, value = 0n, nom = '') => ({ to: BLOCKSKINS, data: '0x' + selecteur(sig) + args.join(''), value: '0x' + BigInt(value).toString(16), nom });
/** mint : 1 USDC passe du wallet de la personne au wallet de frais ; le NFT est a elle. Suppose l approbation USDC (appelApprouver). */
export function appelMint(block, recette) {
  /* ⛔ le nom de l etape S AFFICHE (« Step 2 of 2: ... ») : jamais « NFT » a l ecran (Phil, 2026-10-11 : « un nouveau type relie au block ») */
  return appel('mint(address,uint64)', [adrMot(block), mot(packRecette(recette))], 0n, 'Mint this skin for this block — 1 USDC to TokenizedBlock');
}
/** approve(BlockSkins, montant) EXACT sur un jeton (USDC, une action admise) - jamais illimite. */
export function appelApprouver(jeton, montant, nom = 'Allow the skins market to take exactly this amount') {
  const m = positif(montant, 'the amount');
  return { to: bas(jeton), data: '0x095ea7b3' + adrMot(BLOCKSKINS) + mot(m), value: '0x0', nom };
}
export function appelMettreEnVente(tokenId, devise, prix) {
  return appel('list(uint256,address,uint256)', [mot(positif(tokenId, 'the skin')), adrMot(devise), mot(positif(prix, 'the price'))], 0n, 'List your skin at a fixed price');
}
export function appelRetirer(tokenId) { return appel('unlist(uint256)', [mot(positif(tokenId, 'the skin'))], 0n, 'Take your skin back from the market'); }
/** buy : en ETH la valeur EST le prix ; en jeton, la valeur est 0 (approbation exacte du prix avant). */
export function appelAcheter(tokenId, devise, prix) {
  const p = positif(prix, 'the price');
  return appel('buy(uint256)', [mot(positif(tokenId, 'the skin'))], bas(devise) === ETH ? p : 0n, 'Buy this skin — 10 % of the price goes to TokenizedBlock');
}
export function appelOuvrirEnchere(tokenId, devise, offreMin, dureeS) {
  const d = positif(dureeS, 'the duration');
  if (d > SKIN_ENCHERE_MAX_S) throw new Error('an auction lasts 7 days at most');
  return appel('startAuction(uint256,address,uint256,uint256)', [mot(positif(tokenId, 'the skin')), adrMot(devise), mot(positif(offreMin, 'the minimum bid')), mot(d)], 0n, 'Open an auction for your skin');
}
export function appelEncherir(tokenId, devise, montant) {
  const m = positif(montant, 'the bid');
  return appel('bid(uint256,uint256)', [mot(positif(tokenId, 'the skin')), mot(m)], bas(devise) === ETH ? m : 0n, 'Bid on this skin');
}
export function appelRegler(tokenId) { return appel('settle(uint256)', [mot(positif(tokenId, 'the skin'))], 0n, 'Settle the auction'); }
export function appelRetirerCredit(devise) { return appel('withdraw(address)', [adrMot(devise)], 0n, 'Withdraw what the market owes you'); }

/** L offre minimale suivante : le prix d ouverture sans offre ; sinon +5 % ET strictement au-dessus (regle du contrat).
 *  ⛔ 2026-10-11 (banc fork) : lisait `v.enchere` - le BOOLEEN « c est une enchere » de la vitrine - au lieu de `v.offre` : minimum de 2 wei,
 *    offre refusee par le contrat. Les noms sont ceux de decoderPage : `prix` (ouverture) et `offre` (la plus haute). */
export function offreMinimale(v) {
  const enchere = BigInt(v.offre || 0), prix = BigInt(v.prix || 0);
  if (enchere === 0n) return prix;
  const plancher = enchere + (enchere * SKIN_SURENCHERE_BPS) / 10000n;
  return plancher > enchere ? plancher : enchere + 1n;
}
/** Ce que recoit le vendeur et ce que recoit l app sur un prix (10 % arrondis vers le bas, comme le contrat). */
export function partage(prix) {
  const p = BigInt(prix), frais = (p * SKIN_FRAIS_BPS) / 10000n;
  return { frais, vendeur: p - frais };
}

/* ── LA VITRINE : skinsPage(from, count) -> SkinView[11 mots] ── */
export function appelPage(depuis, combien) { return '0x' + selecteur('skinsPage(uint256,uint256)') + mot(depuis) + mot(combien); }
export function decoderPage(hex) {
  const h = String(hex || '').replace(/^0x/, '');
  if (h.length < 128 || !/^[0-9a-f]*$/i.test(h)) throw new Error('unreadable skins page');
  const w = (i) => h.slice(i * 64, i * 64 + 64);
  const n = Number(BigInt('0x' + w(1)));
  if (h.length < (2 + n * 11) * 64) throw new Error('truncated skins page');
  const out = [];
  for (let k = 0; k < n; k += 1) {
    const b = 2 + k * 11, a = (i) => '0x' + w(b + i).slice(24), u = (i) => BigInt('0x' + w(b + i));
    out.push({ tokenId: u(0), detenteur: a(1), block: a(2), recette: unpackRecette(u(3)), enVente: u(4) === 1n, enchere: u(5) === 1n,
      devise: a(6), prix: u(7), fin: Number(u(8)), encherisseur: a(9), offre: u(10) });
  }
  return out;
}
/** Toutes les skins, par pages de `pas` (lecture seule). Rend { etat:'LU', skins } ou { etat:'NON_LU', pourquoi } - jamais une liste vide
 *  a la place d une lecture ratee. */
export async function lireSkins({ rpc, pas = 100, max = 2000 }) {
  try {
    const total = Number(BigInt(await rpc('eth_call', [{ to: BLOCKSKINS, data: '0x' + selecteur('totalSupply()') }, 'latest'])));
    const skins = [];
    for (let depuis = 1; depuis <= Math.min(total, max); depuis += pas) {
      skins.push(...decoderPage(await rpc('eth_call', [{ to: BLOCKSKINS, data: appelPage(depuis, pas) }, 'latest'])));
    }
    return { etat: 'LU', total, skins, tronque: total > max };
  } catch (e) { return { etat: 'NON_LU', pourquoi: String((e && e.message) || e).slice(0, 120) }; }
}
/** Les skins d un compte (detenues, ou mises en vente par lui), et celle qu il PORTE sur un block : la derniere qu il detient pour ce block. */
export function skinsDe(skins, compte) { const c = bas(compte); return (skins || []).filter((s) => s.detenteur === c); }
export function skinPortee(skins, compte, block) {
  const b = bas(block), miennes = skinsDe(skins, compte).filter((s) => s.block === b);
  return miennes.length ? miennes[miennes.length - 1] : null;
}
