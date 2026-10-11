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
import { topic } from './keccak.js';
import { ACTIONS_COINBASE } from './paires.js';

/* v2 (tokenURI avec image) quand son adresse a ete RELUE sur la chaine et ecrite par le generateur ; avant, v1 (`precedent`, jamais minte) */
export const BLOCKSKINS = String(BLOCKSKINS_DEPLOIEMENT.adresse || BLOCKSKINS_DEPLOIEMENT.precedent.adresse).toLowerCase();
export const BLOCKSKINS_CHAINE = BLOCKSKINS_DEPLOIEMENT.chaine;
/* le bloc ou le contrat UTILISE est ne : les journaux (BuyValidated) ne se cherchent pas avant (lu dans l enregistrement genere) */
export const BLOCKSKINS_BLOC = Number(BLOCKSKINS_DEPLOIEMENT.adresse ? BLOCKSKINS_DEPLOIEMENT.blocDeploiement : BLOCKSKINS_DEPLOIEMENT.precedent.blocDeploiement);
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

/* ── LE MARCHE (Phil, 2026-10-11 : « le market des skins … enchères … des fees de l app pour chaque achat/vente ») ──
 *   Les devises que le contrat admet AUJOURD HUI a sa naissance : ETH (adresse 0) et l USDC de SON constructeur (lu dans l enregistrement
 *   de deploiement, jamais recopie). Une action tokenisee n y entre que par setCurrency, signe par l owner : pas listee ici avant. */
export const DEVISES_SKIN = Object.freeze({
  [ETH]: Object.freeze({ sym: 'ETH', dec: 18 }),
  [bas(BLOCKSKINS_DEPLOIEMENT.constructeur.usdc)]: Object.freeze({ sym: 'USDC', dec: 6 }),
});
/* ── LES ACTIONS COMME DEVISE (Phil, 2026-10-11 : « enchères avec des actions tokenized Coinbase » ; son choix : « les 9 plus
 *    profondes ») ── chacune > 700 k$ cote USDC sur Aerodrome (etude wse49fh8o, bloc ~52 470 683). Elles n entrent dans le contrat
 *    QUE par setCurrency(action, true) signe par l OWNER ; adresses = celles de paires.js (ACTIONS_COINBASE), jamais recopiees. */
export const SKIN_ACTIONS_CANDIDATES = Object.freeze(['NVDAc', 'AMZNc', 'AAPLc', 'GOOGLc', 'TSLAc', 'METAc', 'MSFTc', 'MSTRc', 'SPCXc']
  .map((s) => ACTIONS_COINBASE.find((x) => x.symbole === s)).filter(Boolean).map((x) => Object.freeze({ sym: x.symbole, adr: bas(x.adr) })));
/** setCurrency(devise, oui) : SEUL l owner du contrat peut le signer (sinon NotOwner). Non signe ici. */
export function appelAdmettre(devise, oui = true) {
  return appel('setCurrency(address,bool)', [adrMot(devise), mot(oui ? 1n : 0n)], 0n, (oui ? 'Allow ' : 'Disallow ') + 'this currency on the skins market');
}
/** Les devises que le contrat admet MAINTENANT, lues sur la chaine (currencyAllowed, et decimals() pour une action). ETH et USDC (ceux du
 *  constructeur, DEVISES_SKIN) restent toujours : une lecture ratee ne les efface pas, et une action dont la lecture rate n est PAS ajoutee
 *  (on ne propose jamais une devise que le contrat refuserait). Rend { devises, nonLues: [sym…] }. */
export async function lireDevisesSkin({ rpc, candidats = SKIN_ACTIONS_CANDIDATES }) {
  const devises = { ...DEVISES_SKIN }, nonLues = [];
  for (const c of candidats) {
    try {
      const oui = BigInt(await rpc('eth_call', [{ to: BLOCKSKINS, data: '0x' + selecteur('currencyAllowed(address)') + adrMot(c.adr) }, 'latest'])) === 1n;
      if (!oui) continue;
      const dec = Number(BigInt(await rpc('eth_call', [{ to: c.adr, data: '0x' + selecteur('decimals()') }, 'latest'])));
      if (!Number.isInteger(dec) || dec < 0 || dec > 36) { nonLues.push(c.sym); continue; }
      devises[c.adr] = Object.freeze({ sym: c.sym, dec });
    } catch (_) { nonLues.push(c.sym); }
  }
  return { devises, nonLues };
}
/** Un montant TAPE (« 2 », « 0.015 ») -> unites brutes. Strict : jamais de flottant, plus de decimales que la devise = refus (pas d arrondi). */
export function montantVersBrut(texte, dec) {
  const t = String(texte == null ? '' : texte).trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) throw new Error('type an amount like 2 or 0.015');
  const [ent, frac = ''] = t.split('.');
  if (frac.length > dec) throw new Error('at most ' + dec + ' decimals');
  const brut = BigInt(ent) * 10n ** BigInt(dec) + BigInt((frac + '0'.repeat(dec)).slice(0, dec) || '0');
  if (brut <= 0n) throw new Error('the amount must be above zero');
  return brut;
}
/** CE QUE CE COMPTE PEUT FAIRE sur CETTE skin, a cet instant (secondes) - seulement ce que le contrat ACCEPTERAIT :
 *  - la sienne, pas en vente : la mettre en vente ou aux encheres ;
 *  - en vente a prix fixe : le vendeur la retire, un autre l achete ;
 *  - aux encheres, finie : n importe qui regle (le gagnant la recoit, sans offre elle revient au vendeur) ;
 *  - aux encheres, en cours : un autre encherit ; le vendeur ne la retire que s il n y a AUCUNE offre (le contrat : HasBids).
 *  Sans compte : rien (lire n est pas agir). */
export function actionsSkin(s, moi, maintenant) {
  const m = bas(moi), t = Number(maintenant);
  if (!s || !ADR.test(m) || !Number.isFinite(t)) return [];
  const mien = s.detenteur === m;
  if (!s.enVente) return mien ? ['METTRE_EN_VENTE', 'OUVRIR_ENCHERE'] : [];
  if (!s.enchere) return mien ? ['RETIRER'] : ['ACHETER'];
  if (t >= Number(s.fin)) return ['REGLER'];
  if (mien) return s.encherisseur === ETH ? ['RETIRER'] : [];
  return ['ENCHERIR'];
}
/** CE QUE LE BRAIN PROPOSE sur le marche (Phil, 2026-10-11 : « les brains font des propositions de maniere autonome » - son choix :
 *  « le brain propose, tu signes »). Pur. AU PLUS UNE proposition, dans cet ordre :
 *   1. REGLER une enchere FINIE ou ce compte est le meilleur encherisseur ou le vendeur (recevoir la skin, ou l argent, ou la reprendre) ;
 *   2. si l achat est permis (regle « buy » de S.I) : ACHETER a prix fixe la moins chere des skins de CE block, dans la devise de S.I,
 *      au plus `parTrade` et dans le budget `reste` ;
 *   3. sinon ENCHERIR au minimum (offreMinimale) sur une enchere en cours d une skin de CE block, memes bornes.
 *  Jamais sa propre annonce, jamais une skin deja proposee dans la session (`dejaProposes` : tokenId en texte). */
export function propositionSkin({ skins, moi, block, maintenant, achat, devise, parTrade, reste, dejaProposes = new Set() }) {
  const m = bas(moi), b = bas(block), dv = bas(devise), t = Number(maintenant);
  if (!ADR.test(m) || !ADR.test(b) || !Array.isArray(skins) || !Number.isFinite(t)) return null;
  const libre = (s) => !dejaProposes.has(String(s.tokenId));
  const fin = skins.find((s) => libre(s) && s.enVente && s.enchere && t >= Number(s.fin) && (s.encherisseur === m || s.detenteur === m));
  if (fin) return { genre: 'REGLER', skin: fin, montant: 0n };
  if (!achat || !ADR.test(dv)) return null;
  let p, r;
  try { p = BigInt(parTrade); r = BigInt(reste); } catch (_) { return null; }
  const dansLesBornes = (x) => x > 0n && x <= p && x <= r;
  const deCeBlock = skins.filter((s) => libre(s) && s.block === b && s.enVente && s.detenteur !== m && s.devise === dv);
  const asc = (x, y) => (x.montant < y.montant ? -1 : x.montant > y.montant ? 1 : 0);
  const fixe = deCeBlock.filter((s) => !s.enchere).map((s) => ({ genre: 'ACHETER', skin: s, montant: BigInt(s.prix) })).filter((x) => dansLesBornes(x.montant)).sort(asc)[0];
  if (fixe) return fixe;
  const enchere = deCeBlock.filter((s) => s.enchere && t < Number(s.fin) && s.encherisseur !== m)
    .map((s) => ({ genre: 'ENCHERIR', skin: s, montant: offreMinimale(s) })).filter((x) => dansLesBornes(x.montant)).sort(asc)[0];
  return enchere || null;
}
/** pending(devise, compte) : ce que le marche doit a ce compte (offre depassee, paiement qu il n a pas pu recevoir). */
export function appelCredit(devise, compte) { return '0x' + selecteur('pending(address,address)') + adrMot(devise) + adrMot(compte); }

/* ── « LES DEUX COCHENT » (spec de Phil, 2026-10-04 : « si les deux parties cochent valide, l echange est execute automatiquement par
 *    les agents » ; Phil, 2026-10-11 : « fini le Skinbrain market »). Le contrat DEPLOYE l a deja (BlockSkins.sol 227-266) :
 *   - l annonce du VENDEUR est sa validation ; validateBuy(tokenId) est celle de l ACHETEUR, liee a CETTE annonce (son prix, sa devise,
 *     son numero `id`) - en ETH son paiement est TENU par le contrat ; en jeton, il doit avoir approuve le prix ;
 *   - executeValidated(tokenId, acheteur) : N IMPORTE QUI (un agent, le vendeur, son brain) execute ; les fonds ne vont qu entre eux deux et
 *     le wallet de frais (10 %) ; l executant ne tient ni les fonds ni la skin ;
 *   - revokeBuy : l acheteur retire sa validation (l ETH tenu lui est CREDITE : il le retire par withdraw) ;
 *   - une annonce retiree puis remise est une NOUVELLE annonce (`id` neuf) : une ancienne validation n y vaut plus. */
export function appelValiderAchat(tokenId, devise, prix) {
  const p = positif(prix, 'the price');
  return appel('validateBuy(uint256)', [mot(positif(tokenId, 'the skin'))], bas(devise) === ETH ? p : 0n,
    'Validate: you agree to buy this skin at this exact price — anyone (an agent) can then complete it');
}
export function appelRevoquerAchat(tokenId) {
  return appel('revokeBuy(uint256)', [mot(positif(tokenId, 'the skin'))], 0n, 'Revoke your validation (ETH it held is credited back to you)');
}
export function appelExecuterValide(tokenId, acheteur) {
  return appel('executeValidated(uint256,address)', [mot(positif(tokenId, 'the skin')), adrMot(acheteur)], 0n,
    'Complete this trade both sides validated — 10 % of the price goes to TokenizedBlock');
}
/** listingOf(tokenId) -> { vendeur, devise, prix, debut, fin, id, encherisseur, offre } (getter public : 8 mots). */
export function appelAnnonce(tokenId) { return '0x' + selecteur('listingOf(uint256)') + mot(positif(tokenId, 'the skin')); }
export function decoderAnnonce(hex) {
  const h = String(hex || '').replace(/^0x/, '');
  if (h.length < 8 * 64 || !/^[0-9a-f]*$/i.test(h)) throw new Error('unreadable listing');
  const w = (i) => h.slice(i * 64, i * 64 + 64), a = (i) => '0x' + w(i).slice(24), u = (i) => BigInt('0x' + w(i));
  return { vendeur: a(0), devise: a(1), prix: u(2), debut: u(3), fin: u(4), id: u(5), encherisseur: a(6), offre: u(7) };
}
/** validated(tokenId, compte) -> { annonce, ethTenu } ; annonce 0n = aucune validation. */
export function appelValidation(tokenId, compte) { return '0x' + selecteur('validated(uint256,address)') + mot(positif(tokenId, 'the skin')) + adrMot(compte); }
export function decoderValidation(hex) {
  const h = String(hex || '').replace(/^0x/, '');
  if (h.length < 2 * 64 || !/^[0-9a-f]*$/i.test(h)) throw new Error('unreadable validation');
  return { annonce: BigInt('0x' + h.slice(0, 64)), ethTenu: BigInt('0x' + h.slice(64, 128)) };
}
/** Une validation VAUT pour l annonce en cours seulement si son numero est celui de l annonce (le contrat : ListingChanged sinon). */
export function validationCourante(v, annonce) {
  return !!v && !!annonce && v.annonce !== 0n && annonce.id !== 0n && v.annonce === annonce.id && annonce.debut === 0n && ADR.test(bas(annonce.vendeur)) && bas(annonce.vendeur) !== ETH;
}
/** Les acheteurs qui ont valide une skin, lus dans les journaux BuyValidated(tokenId indexe, buyer indexe) - CANDIDATS seulement : chacun
 *  doit encore etre confirme par validated(...) == l annonce en cours (une validation revoquee ou perimee reste dans les journaux). */
export const SUJET_ACHAT_VALIDE = topic('BuyValidated(uint256,address,address,uint256)');
/** VERIFIE une transaction validateBuy a partir de son RECU (index serveur des validations, POST /api/skins/validation) - pur.
 *  ⛔ Un journal BuyValidated n est cru que s il vient de l ADRESSE du contrat : un autre contrat peut emettre le meme evenement en
 *    nommant n importe qui (« un evenement n est pas une transaction »). On n exige PAS tx.from == acheteur : un wallet intelligent
 *    (Base Account) appelle depuis son contrat, et c est lui (msg.sender) que le contrat enregistre comme acheteur.
 *  Rend { ok, etat: 'OK' | 'NON_LU' | 'REFUSE', validations: [{ tokenId, acheteur, devise, prix }] } (nombres en texte). */
export function verifierValidation({ recu, contrat = BLOCKSKINS }) {
  if (!recu) return { ok: false, etat: 'NON_LU', pourquoi: 'the transaction is not readable yet — try again in a moment' };
  if (String(recu.status) !== '0x1') return { ok: false, etat: 'REFUSE', pourquoi: 'this transaction failed on chain' };
  const c = bas(contrat), sujet = bas(SUJET_ACHAT_VALIDE), validations = [];
  for (const l of Array.isArray(recu.logs) ? recu.logs : []) {
    const tp = (l && l.topics) || [];
    if (bas(l && l.address) !== c || tp.length < 3 || bas(tp[0]) !== sujet) continue;
    const d = String(l.data || '').replace(/^0x/, '');
    if (d.length < 128 || !/^[0-9a-f]+$/i.test(d)) continue;
    const acheteur = '0x' + bas(tp[2]).slice(26), devise = '0x' + bas(d.slice(24, 64));
    if (!ADR.test(acheteur) || !ADR.test(devise)) continue;
    validations.push({ tokenId: BigInt(tp[1]).toString(), acheteur, devise, prix: BigInt('0x' + d.slice(64, 128)).toString() });
  }
  if (!validations.length) return { ok: false, etat: 'REFUSE', pourquoi: 'no skins-market validation in this transaction' };
  return { ok: true, etat: 'OK', validations, bloc: recu.blockNumber ? parseInt(String(recu.blockNumber), 16) : null };
}
export function acheteursValides(journaux, tokenId) {
  const t = '0x' + mot(positif(tokenId, 'the skin'));
  const vus = new Set();
  for (const l of Array.isArray(journaux) ? journaux : []) {
    const tp = (l && l.topics) || [];
    if (tp.length < 3 || bas(tp[1]) !== t) continue;
    const b = '0x' + bas(tp[2]).slice(26);
    if (ADR.test(b)) vus.add(b);
  }
  return [...vus];
}
