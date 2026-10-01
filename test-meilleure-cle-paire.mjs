/* LE RESOLVEUR DE CLE D UNE PAIRE — et la direction qu il ne faut PAS coder en dur.
 *
 * ⛔⛔⛔ POURQUOI CE FICHIER EXISTE AVANT L EXTRACTION, ET PAS APRES. `planEthVersUsdc` portait
 *   cette logique sans AUCUN test — zero fichier la couvrait. Refactorer un export non teste est
 *   le motif « untested export, silent break » : la casse ne se voit qu en production.
 *
 * ⛔⛔ LE DEFAUT QUE L EXTRACTION AURAIT PROPAGE. Dans `planEthVersUsdc` :
 *       const zeroForOne = String(cle.currency0).toLowerCase() === ETH;  // calcule...
 *       encodeQuote({ cle, zeroForOne: true, ... })                     // ...et jamais utilise
 *   La valeur est calculee puis JETEE, et le `true` en dur n est juste que parce que l ETH vaut
 *   `0x000...0` et se classe donc TOUJOURS en `currency0`. C est une garde correcte PAR ACCIDENT
 *   d une valeur particuliere. Pour une paire quelconque — OUSD -> USDC, ou USDC -> OUSD — la
 *   direction depend de l ordre des adresses, et `true` serait FAUX une fois sur deux.
 *   ⇒ Le helper extrait DERIVE la direction de la paire. Les deux sens sont testes, et une
 *     assertion exige explicitement qu ils DIFFERENT : un helper qui rendrait la meme direction
 *     dans les deux sens passerait n importe quel test qui n en regarde qu un.
 */
import { meilleureClePourMontant } from './echange.js';
import { CLES_PRIX } from './prix-eth.js';

let ok = 0; const ko = [];
const t = (nom, cond) => { if (cond) ok += 1; else ko.push(nom); };

const ETH = '0x0000000000000000000000000000000000000000';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const OUSD = '0xb2000000000000000000002feb517dfec7415344';

/** Un RPC de laboratoire : il rend les devis donnes, dans l ordre des candidates. */
function rpcQui(devis) {
  let i = 0;
  const vus = [];
  const f = async (_m, p) => {
    vus.push(p && p[0] ? p[0].data : null);
    const q = devis[i]; i += 1;
    if (q === null || q === undefined) throw new Error('pool absente');
    return '0x' + BigInt(q).toString(16).padStart(64, '0');
  };
  f.vus = vus;
  return f;
}

/* ══ 1. LE MEILLEUR DEVIS GAGNE, PAS LE PREMIER ═══════════════════════════════════════════════ */
const r1 = await meilleureClePourMontant({ rpc: rpcQui([10n, 90n, 20n, 5n]), chaine: 8453,
  de: ETH, vers: USDC, montant: 1000n });
t('le meilleur devis gagne', r1.etat === 'OK' && r1.quote === 90n);
t('et c est la cle du 2e candidat', r1.cle.fee === CLES_PRIX[1].fee);
t('le nombre de candidates essayees est rendu', r1.essayees === CLES_PRIX.length);
t('le nombre de pools REELLEMENT cotees est rendu', r1.cotees === 4);
/* ⛔ « 4 essayees » et « 4 cotees » ne disent pas la meme chose : une pool qui n existe pas leve.
 *   Confondre les deux ferait lire « 4 pools existent » la ou on a seulement tape 4 fois. */
t('essayees et cotees sont DEUX champs', 'essayees' in r1 && 'cotees' in r1);

/* ══ 2. LA DIRECTION EST DERIVEE, JAMAIS SUPPOSEE ═════════════════════════════════════════════ */
t('ETH -> USDC : ETH est 0x0 donc currency0, donc zeroForOne', r1.zeroForOne === true);
const r2 = await meilleureClePourMontant({ rpc: rpcQui([10n, 90n, 20n, 5n]), chaine: 8453,
  de: USDC, vers: ETH, montant: 1000n });
t('USDC -> ETH : la direction s INVERSE', r2.zeroForOne === false);
t('et la cle est la MEME pool dans les deux sens',
  r2.cle.currency0 === r1.cle.currency0 && r2.cle.currency1 === r1.cle.currency1);
/* ⛔⛔ L ASSERTION QUI ATTRAPE LE `true` EN DUR. Sans elle, un helper qui rend toujours `true`
 *   passerait le cas ETH -> USDC et casserait silencieusement partout ailleurs. */
t('LES DEUX SENS DIFFERENT', r1.zeroForOne !== r2.zeroForOne);

/* ⛔ UNE PAIRE OU L ETH N EST PAS EN JEU : c est la que le `true` en dur mentait. */
const r3 = await meilleureClePourMontant({ rpc: rpcQui([7n, 0n, 0n, 0n]), chaine: 8453,
  de: OUSD, vers: USDC, montant: 1000n });
const r4 = await meilleureClePourMontant({ rpc: rpcQui([7n, 0n, 0n, 0n]), chaine: 8453,
  de: USDC, vers: OUSD, montant: 1000n });
t('OUSD/USDC : USDC se classe avant OUSD, donc USDC est currency0',
  r3.cle.currency0 === USDC && r3.cle.currency1 === OUSD);
t('OUSD -> USDC n est PAS zeroForOne', r3.zeroForOne === false);
t('USDC -> OUSD l est', r4.zeroForOne === true);
t('et la aussi les deux sens different', r3.zeroForOne !== r4.zeroForOne);

/* ══ 3. CE QUI NE SE COTE PAS NE S INVENTE PAS ════════════════════════════════════════════════ */
const vide = await meilleureClePourMontant({ rpc: rpcQui([null, null, null, null]), chaine: 8453,
  de: ETH, vers: USDC, montant: 1000n });
t('aucune pool cotee => NON_MESURE, pas REFUSE', vide.etat === 'NON_MESURE');
t('et aucune cle n est rendue', vide.cle === null);
t('et la raison le dit', /no .*pool|not quoted|aucune/i.test(vide.pourquoi || ''));
t('et cotees vaut 0 alors qu essayees vaut 4',
  vide.cotees === 0 && vide.essayees === CLES_PRIX.length);

const zeros = await meilleureClePourMontant({ rpc: rpcQui([0n, 0n, 0n, 0n]), chaine: 8453,
  de: ETH, vers: USDC, montant: 1000n });
/* ⛔⛔ UN DEVIS DE ZERO N EST PAS UN DEVIS. Le retenir ferait construire un swap dont le minimum de
 *   sortie est nul — un ordre qui accepte de tout perdre. C est le motif « Number(null) = 0 » qui a
 *   deja fait passer un glissement non mesure pour un marche parfait. */
t('des devis a zero ne font pas une pool', zeros.etat === 'NON_MESURE');
t('et zero ne compte pas comme « cotee »', zeros.cotees === 0);

/* ⛔ UNE POOL ABSENTE AU MILIEU N ARRETE PAS LE BALAYAGE. */
const trou = await meilleureClePourMontant({ rpc: rpcQui([null, 50n, null, 80n]), chaine: 8453,
  de: ETH, vers: USDC, montant: 1000n });
t('un trou au milieu n arrete pas le balayage', trou.etat === 'OK' && trou.quote === 80n);
t('et seules les pools qui ont repondu sont comptees', trou.cotees === 2 && trou.essayees === 4);

/* ══ 4. LES REFUS D ENTREE ════════════════════════════════════════════════════════════════════ */
for (const [nom, args] of [
  ['montant nul', { de: ETH, vers: USDC, montant: 0n }],
  ['montant negatif', { de: ETH, vers: USDC, montant: -1n }],
  ['meme jeton des deux cotes', { de: ETH, vers: ETH, montant: 1000n }],
  ['adresse malformee', { de: 'eth', vers: USDC, montant: 1000n }],
]) {
  const r = await meilleureClePourMontant({ rpc: rpcQui([9n]), chaine: 8453, ...args });
  t('refus: ' + nom, r.etat === 'REFUSE' && typeof r.pourquoi === 'string' && r.pourquoi.length > 5);
}
/* ⛔ UN REFUS D ENTREE NE DOIT TAPER AUCUN APPEL : sinon une erreur de saisie consomme du reseau
 *   et, sur un noeud limite, vole la fenetre d une vraie lecture. */
const sonde = rpcQui([9n, 9n, 9n, 9n]);
await meilleureClePourMontant({ rpc: sonde, chaine: 8453, de: ETH, vers: ETH, montant: 1000n });
t('un refus d entree n envoie AUCUN appel', sonde.vus.length === 0);

/* ══ 5. LES CANDIDATES SONT INJECTABLES, ET LEUR BORNE EST DITE ═══════════════════════════════ */
t('par defaut, les candidates sont CLES_PRIX', r1.essayees === CLES_PRIX.length);
const perso = await meilleureClePourMontant({ rpc: rpcQui([3n, 4n]), chaine: 8453,
  de: ETH, vers: USDC, montant: 1000n,
  candidates: [{ fee: 100, tickSpacing: 1 }, { fee: 500, tickSpacing: 10 }] });
t('des candidates injectees sont utilisees', perso.essayees === 2 && perso.quote === 4n);
/* ⛔⛔ LA BORNE REELLE DU RESOLVEUR, ECRITE DANS SON PROPRE TEST : `CLES_PRIX` ne porte QUE QUATRE
 *   combinaisons, toutes SANS hook. Une pool ETH/USDC hookee, ou a un tickSpacing hors de ces
 *   quatre, ne sera jamais trouvee — et ce n est pas « il n y a pas de pool », c est « on n a pas
 *   regarde ». La meme confusion que celle qui a rendu 49,8 % du volume invisible. */
t('CLES_PRIX ne porte que 4 combinaisons', CLES_PRIX.length === 4);
t('et AUCUNE ne porte de hook', CLES_PRIX.every((k) => !k.hooks || /^0x0+$/.test(k.hooks)));

console.log((ko.length ? 'KO ' + ko.length : 'OK') + ' — ' + ok + ' assertions');
for (const k of ko) console.log('  KO ' + k);
process.exit(ko.length ? 1 : 0);
