/* test-trending-voit-nos-paires.mjs — L ECRAN NE PEUT PAS ETRE AVEUGLE AUX ACTIFS QU IL PROPOSE.
 *
 * ⛔⛔ LE DEFAUT, MESURE LE 2026-09-27. DexScreener interroge adresse par adresse sur les dix
 *     actions du registre `ACTIONS_COINBASE` : 10/10 ont une paire liquide, et 0/10 apparaissaient
 *     dans `/api/trending`.
 *         MSTRc 4 914 070 $ de volume 24 h · METAc 3 312 309 $ · SNDKc 3 008 424 $
 *         GOOGLc 2 920 423 $ · AAPLc 2 792 105 $ · MSFTc 1 970 633 $ · NVDAc 1 765 509 $
 *     ≈ 20 M$ PAR JOUR, toutes sur Aerodrome — et l app les proposait en paire sans jamais les
 *     montrer. C est aussi ce qui m a fait publier « CL hors de portee = 81 873 $ » : je decrivais
 *     ce que l ecran MONTRE, pas le marche.
 *
 * ⛔ CAUSE : `blocksConnus` ne contient que les creations B20 que NOTRE indexeur a scannees. Ces dix
 *   sont anterieures a la fenetre. Le filtre `connus.has(adr)` de `resumerTrending` les jetait
 *   ensuite en silence — et c est un BON filtre : sans lui, n importe quel jeton rendu par
 *   DexScreener entrerait dans la liste.
 * ⇒ On ne touche pas au filtre. On ajoute au jeu de reference les adresses que L APP PROPOSE
 *   elle-meme, ecrites dans notre registre et non devinees sur la chaine.
 *
 * ⚠️ CE QU IL NE PROUVE PAS : qu une action ait un marche aujourd hui. Il prouve que si elle en a
 *   un, l ecran ne peut plus l ignorer.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resumerTrending } from './trending.js';
import { pairesProposees } from './paires.js';

let n = 0;
const cas = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const nu = srv.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

cas('⛔⛔ les paires proposees entrent dans le jeu de reference', () => {
  assert.ok(/for \(const p of pairesProposees\(8453\)\) \{[\s\S]{0,200}blocksConnus\.add/.test(nu),
    'les actifs proposes en paire ne sont plus ajoutes aux blocks suivis : l ecran redevient '
    + 'aveugle a ~20 M$ de volume quotidien qu il propose lui-meme');
  assert.ok(/const adrs = \[\.\.\.blocksConnus\]/.test(nu),
    'la liste envoyee a DexScreener ne vient plus du meme ensemble : l ajout ne servirait a rien');
});

cas('⛔ seules des adresses de BLOCK sont ajoutees — pas l ETH, pas l USDC', () => {
  /* ⛔ Le registre contient aussi ETH (adresse nulle), USDC et cbBTC. Les envoyer a un resume de
   *   blocks B20 melangerait des actifs qui ne sont pas des blocks — et `resumerTrending` les
   *   compterait dans `blocksAvecPaire`. Le filtre `0xb2…` est le marqueur de famille. */
  assert.ok(/\/\^0xb2\[0-9a-fA-F\]\{38\}\$\/i\.test\(String\(p\.adr\)\)/.test(nu),
    'le filtre sur le prefixe B20 a saute : USDC ou cbBTC entreraient dans le classement des blocks');
});

cas('⛔ pas de doublon : une adresse deja connue ne coute pas une place', () => {
  /* ⛔ Les lots DexScreener font 30 adresses. Un doublon prend la place d un vrai block dans son
   *   lot. `blocksConnus` est un Set — l ajout est donc idempotent par construction, et on le
   *   verifie plutot que de le supposer. */
  assert.ok(/blocksConnus\.add\(String\(p\.adr\)\.toLowerCase\(\)\)/.test(nu),
    'l ajout ne normalise plus en minuscules : la meme adresse en deux casses ferait deux entrees');
});

cas('⛔⛔ le filtre de `resumerTrending` reste EXIGEANT — rejoue', () => {
  /* ⛔⛔ C EST LA MOITIE QU ON NE DOIT PAS CASSER. Si `connus` cessait de filtrer, n importe quel
   *     jeton rendu par DexScreener entrerait dans le classement des blocks. On le rejoue avec un
   *     intrus, au lieu de faire confiance a la lecture. */
  const intrus = '0x' + 'e'.repeat(40);
  const connu = '0xb2' + '1'.repeat(38);
  const faux = (adr, sym) => ({ chainId: 'base', baseToken: { address: adr, symbol: sym, name: sym },
    liquidity: { usd: 50000 }, volume: { h24: 90000, h1: 100 }, txns: { h24: { buys: 5, sells: 5 } },
    priceUsd: '1', pairAddress: '0x' + 'a'.repeat(40), dexId: 'aerodrome' });
  const r = resumerTrending([faux(intrus, 'INTRUS'), faux(connu, 'VRAI')], [connu]);
  assert.equal(r.lignes.length, 1, 'le filtre laisse passer un jeton inconnu de notre index');
  assert.equal(r.lignes[0].sym, 'VRAI', 'le mauvais jeton est retenu');
});

cas('⛔ temoin : le registre porte bien des blocks B20 a ajouter', () => {
  /* ⛔ Sans ce temoin, tous les cas ci-dessus passeraient sur un registre vide sans rien dire. */
  const b20 = pairesProposees(8453).filter((p) => /^0xb2[0-9a-fA-F]{38}$/i.test(String(p.adr || '')));
  assert.ok(b20.length >= 8,
    'le registre ne porte plus que ' + b20.length + ' adresses B20 : l ajout ne montrerait presque rien');
});

assert.equal(n, 5, 'compte de cas inattendu : ' + n);
console.log('ok trending-voit-nos-paires — ' + n + ' cas.');
console.log('   Les actifs proposes en paire entrent dans les blocks suivis, sans casser le filtre');
console.log('   qui empeche un jeton inconnu d entrer dans le classement.');
console.log('⚠️ NE PROUVE PAS qu une action ait un marche aujourd hui — prouve que si elle en a un,');
console.log('   l ecran ne peut plus l ignorer.');
