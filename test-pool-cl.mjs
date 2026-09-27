/* test-pool-cl.mjs — LIRE UNE POOL AERODROME, ET NE JAMAIS CONFONDRE UNE PANNE AVEC UN FAIT.
 *
 * ⛔⛔ POURQUOI CE MODULE EXISTE. Phil : « mets notre hook sur Aerodrome aussi » — demande fondee
 *     sur une mesure : 6 blocks sur Aerodrome font 77 531 $ de volume CHACUN contre 6 974 $ pour
 *     les 130 d Uniswap, soit ONZE FOIS PLUS.
 *   ⛔⛔ MAIS UN HOOK NE PEUT PAS Y ALLER, ET CE N EST PAS UNE QUESTION DE TRAVAIL. Mesure sur la
 *       pool MUc/USDC, la plus profonde des B20 : `slot0()` et `tickSpacing()` REPONDENT,
 *       `extsload(bytes32)` REVERTE. C est un fork Uniswap v3 (Aerodrome CL), pas un v4. Un hook
 *       est un contrat que le `PoolManager` v4 appelle pendant le swap — sans PoolManager v4, RIEN
 *       ne peut l appeler. Le point d accroche n existe pas.
 *   ⇒ Ce qui est possible, et que nous ne savions PAS faire : lire ces pools nous-memes.
 *
 * ⚠️ CE QUE CE TEST NE PROUVE PAS : qu on puisse echanger dessus. Il prouve qu on sait LIRE.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { lirePoolCL } from './pool-cl.js';

let n = 0;
const v = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };
const va = async (titre, f) => { n++; try { await f(); } catch (e) { console.error('✗ ' + titre); throw e; } };
const src = readFileSync(new URL('./pool-cl.js', import.meta.url), 'utf8');

const POOL = '0x17e1bEB2cD65493Da73ed4BbbC7BEcAAa0F91C73';
const MUC = '0xb200000000000000000000fd2f87532b90095211';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const mot = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
const motAdr = (a) => '0x' + '0'.repeat(24) + String(a).slice(2);

/** Un noeud local : `slot0` de la vraie pool MUc, et les vrais tokens. */
function noeud({ refus = null, sqrt = 23965169522556373018289026575n /* ⛔ VALEUR REELLE, lue sur la pool — pas inventee : ma premiere version avait un sqrt fabrique et rendait 85 milliards */, t0 = USDC, t1 = MUC } = {}) {
  let appels = 0;
  return async (m, p) => {
    appels++;
    const data = String(p && p[0] && p[0].data || '');
    if (refus && refus.test(data)) throw new Error(refus.message || 'over rate limit');
    if (data.startsWith('0x3850c7bd')) return mot(sqrt) + mot(BigInt(16777216 - 23916)).slice(2);
    if (data.startsWith('0x0dfe1681')) return motAdr(t0);
    if (data.startsWith('0xd21220a7')) return motAdr(t1);
    if (data.startsWith('0x1a686502')) return mot(243408790335n);
    if (data.startsWith('0xddca3f43')) return mot(500n);
    if (data.startsWith('0xd0c93a7c')) return mot(100n);
    throw new Error('execution reverted');
  };
}

await va('⛔ une pool CL reelle est LUE, et le prix sort dans le bon sens', async () => {
  const r = await lirePoolCL({ rpc: noeud(), pool: POOL, jeton: MUC, decJeton: 8, decDevise: 6 });
  assert.equal(r.etat, 'LUE', 'la pool CL n est pas lue : ' + r.pourquoi);
  /* ⛔⛔ LE SENS EST LA MOITIE DU RESULTAT. `prixDepuisSqrt` attend `deviseEst0`, l INVERSE de
   *     `jetonEst0`. Inverser ce booleen rend un prix qui est exactement son PROPRE INVERSE :
   *     plausible, et faux. Ici MUc vaut ~1 093 USDC ; a l envers il vaudrait 0,000915. */
  assert.equal(r.jetonEst0, false, 'le jeton est place du mauvais cote de la pool');
  assert.ok(r.prix > 100 && r.prix < 10000,
    'prix de ' + r.prix + ' : hors de toute plage plausible — verifier le sens de `deviseEst0` et '
    + 'les decimales avant de croire ce lecteur');
});

await va('⛔⛔ une LIMITE DE DEBIT n est pas un fait sur la chaine', async () => {
  /* ⛔⛔ J AI COMMIS CETTE ERREUR DANS CE MODULE MEME. Premiere version : cinq appels en
   *     `Promise.all`, qui DECLENCHAIENT la limite du noeud public. `token0()` rendait « over rate
   *     limit » et le module en concluait « the pool answered slot0 but not its tokens » — il
   *     transformait MA panne en fait sur la chaine. Mesure : les deux fonctions repondent
   *     parfaitement quand on les espace.
   *   ⇒ On reessaie sur une limite de debit, et on n appelle JAMAIS en parallele. */
  let premier = true;
  const rpc = async (m, p) => {
    const data = String(p && p[0] && p[0].data || '');
    if (data.startsWith('0x0dfe1681') && premier) { premier = false; throw new Error('over rate limit'); }
    return noeud()(m, p);
  };
  const r = await lirePoolCL({ rpc, pool: POOL, jeton: MUC, decJeton: 8, decDevise: 6 });
  assert.equal(r.etat, 'LUE',
    'une limite de debit passagere a fait echouer la lecture : « pas pu regarder » a ete pris pour '
    + '« n existe pas » — l erreur exacte que ce module est cense eviter');
});

await va('⛔ un REVERT est un fait, et il ne se dit pas comme une panne', async () => {
  const rpc = async () => { throw new Error('execution reverted'); };
  const r = await lirePoolCL({ rpc, pool: POOL, jeton: MUC, decJeton: 8, decDevise: 6 });
  assert.equal(r.etat, 'PAS_UNE_POOL_CL',
    'un revert sur slot0() n est plus classe comme « pas une pool CL » : une pool Solidly serait '
    + 'rangee dans les pannes et reessayee indefiniment');
});

await va('⛔⛔ une pool qui ne contient PAS le jeton est refusee', async () => {
  /* ⛔⛔ SANS CE CONTROLE, ON AFFICHERAIT LE PRIX D UN AUTRE ACTIF SOUS LE NOM DU BLOCK. C est le
   *     genre de defaut qui ne se voit jamais : le nombre est vrai, il decrit juste autre chose. */
  const autre = '0x' + 'c'.repeat(40);
  const r = await lirePoolCL({ rpc: noeud({ t1: autre }), pool: POOL, jeton: MUC, decJeton: 8, decDevise: 6 });
  assert.equal(r.etat, 'PAS_UNE_POOL_CL', 'une pool sans le jeton rend quand meme un prix');
});

await va('⛔ sans les decimales, on REFUSE — supposer 18 donne un prix faux', async () => {
  /* ⛔ USDC a 6 decimales. Supposer 18 decalerait le prix de douze ordres de grandeur, et il
   *   aurait l air d un nombre normal. Un refus vaut mieux qu un chiffre plausible et faux. */
  const r = await lirePoolCL({ rpc: noeud(), pool: POOL, jeton: MUC, decJeton: 8 });
  assert.equal(r.etat, 'REFUSE', 'le lecteur accepte de travailler sans connaitre les decimales');
});

v('⛔ le module ne REECRIT PAS la mathematique du prix', () => {
  /* ⛔ `prixDepuisSqrt` divise AVANT de convertir pour ne pas faire deborder un double. En refaire
   *   une copie ici donnerait le jumeau plus faible que les correctifs oublient. */
  assert.ok(/import \{ prixDepuisSqrt \} from '\.\/pool\.js'/.test(src),
    'le lecteur CL a sa propre mathematique de prix : elle divergera de la canonique');
  assert.ok(!/Q192|1n << 192n/.test(src), 'la conversion sqrt->prix a ete recopiee dans ce module');
});

v('⛔ les appels ne sont JAMAIS en parallele', () => {
  /* ⛔⛔ ON DEPOUILLE LES COMMENTAIRES D ABORD, ET C EST LA TROISIEME FOIS AUJOURD HUI QUE CE PIEGE
   *     SE REFERME SUR MOI. Ma premiere version cherchait `Promise.all` dans le fichier BRUT — et
   *     le trouvait dans le COMMENTAIRE qui explique pourquoi il a ete retire. Une sonde qui lit la
   *     documentation d un defaut et l accuse transforme l honnetete du code en faux positif, et
   *     une sonde qui crie sur le correctif desarme celle qui criera sur la regression. */
  const codeNu = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  assert.ok(!/Promise\.all/.test(codeNu),
    'les lectures repassent en parallele : c est ce qui declenchait la limite de debit, donc le faux verdict');
});

v('⛔ la liquidite reste une CHAINE — un uint128 ne tient pas dans un nombre JS', () => {
  assert.ok(/BigInt\(mot\(liq\.ok, 0\)\)\.toString\(\)/.test(src),
    'la liquidite est convertie en Number : sur un uint128 le chiffre affiche serait faux');
});

assert.equal(n, 8, 'compte de cas inattendu : ' + n);
console.log('ok pool-cl — ' + n + ' cas.');
console.log('   Une limite de debit est REESSAYEE, un revert est un FAIT, une pool sans le jeton est');
console.log('   REFUSEE, et la mathematique du prix reste celle de pool.js.');
console.log('⚠️ NE PROUVE PAS qu on puisse ECHANGER sur Aerodrome : ce module LIT. Et un hook v4 n y');
console.log('   a aucun point d accroche — mesure : slot0 repond, extsload reverte.');
