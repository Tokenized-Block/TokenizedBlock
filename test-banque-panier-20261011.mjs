/* test-banque-panier-20261011.mjs - EMPRUNTER CONTRE PLUSIEURS ACTIONS A LA FOIS (banque-morpho.js, planEmprunterPanier), HORS LIGNE.
 * Phil (2026-10-11) : « que tu puisses mettre plusieurs actions tokenisees en garantie en meme temps ». Morpho Blue ISOLE chaque marche :
 *   un panier = N emprunts (un par action), mis bout a bout et SIMULES ENSEMBLE ; chaque position est liquidee seule (et c est dit).
 * EXECUTE planEmprunterPanier sur un faux noeud a DEUX marches (GOOGLc, NVDAc -> USDC).
 * AFFIRME : sequence = [approbation exacte, depot, emprunt] par action, dans l ordre ; UNE simulation pour toute la sequence ; une ligne
 *   refusee refuse le panier EN LA NOMMANT, sans appel a signer ; meme marche ou meme action deux fois : refus ; 0 ou > 5 lignes : refus ;
 *   une simulation qui reverte refuse le panier entier ; la phrase « chaque action est sa propre position » voyage avec le plan.
 * NE PROUVE PAS : l execution sur la chaine (banc fork a part), une liquidation.
 */
import { strict as assert } from 'node:assert';
import * as B from './banque-morpho.js';
import { ACTIONS_COINBASE } from './paires.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const adr = (s) => String(ACTIONS_COINBASE.find((a) => a.symbole === s).adr).toLowerCase();
const GOOGLC = adr('GOOGLc'), NVDAC = adr('NVDAc');
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', ORACLE = '0x' + 'aa'.repeat(20), IRM = '0x' + 'bb'.repeat(20);
const ID_G = '0x' + 'a3'.repeat(32), ID_N = '0x' + 'b4'.repeat(32), ID_G2 = '0x' + 'c5'.repeat(32), COMPTE = '0x' + 'c0'.repeat(20);
const PRIX = 3526329343300000000000000000000000000n, LLTV = 770000000000000000n;
const w = (x) => BigInt(x).toString(16).padStart(64, '0'), wa = (a) => a.slice(2).padStart(64, '0');
const MARCHES = { [ID_G]: GOOGLC, [ID_N]: NVDAC, [ID_G2]: GOOGLC };
function noeud(o = {}) {
  const e = { sim: 'ok', ...o };
  const sims = [];
  const rpc = async (methode, params) => {
    if (methode === 'eth_simulateV1') { const calls = params[0].blockStateCalls[0].calls; sims.push(calls.length);
      return [{ calls: calls.map((_, i, t) => ({ status: e.sim === 'revert' && i === t.length - 1 ? '0x0' : '0x1', error: { message: 'Too little' } })) }]; }
    const { to, data } = params[0]; const sel = data.slice(2, 10), arg = '0x' + data.slice(10, 74);
    if (to === B.MORPHO_BLUE && sel === B.SEL.idToMarketParams) return '0x' + wa(USDC) + wa(MARCHES[arg]) + wa(ORACLE) + wa(IRM) + w(LLTV);
    if (to === B.MORPHO_BLUE && sel === B.SEL.market) return '0x' + w(600n * 10n ** 6n) + w(600n * 10n ** 6n) + w(500n * 10n ** 6n) + w(500n * 10n ** 6n) + w(1) + w(0);
    if (to === B.MORPHO_BLUE && sel === B.SEL.position) return '0x' + w(0) + w(0) + w(0);
    if (to === ORACLE && sel === B.SEL.price) return '0x' + w(PRIX);
    if (sel === B.SEL.balanceOf) return '0x' + w(10n ** 8n);
    if (sel === B.SEL.allowance) return '0x' + w(0);
    throw new Error('unexpected ' + to + ' ' + sel);
  };
  return { rpc, sims };
}
const L = (id, g = 10n ** 7n, e = 10n ** 7n) => ({ id, garantie: g, emprunt: e });
/* deux actions, un panier */
const nd = noeud();
const r = await B.planEmprunterPanier({ rpc: nd.rpc, compte: COMPTE, lignes: [L(ID_G), L(ID_N)] });
vu(r.etat === 'PRET', 'panier de deux actions : ' + r.etat + ' ' + r.pourquoi);
const sels = r.aSigner.map((c) => c.to.toLowerCase() + ':' + c.data.slice(2, 10));
/* 2026-10-11 (frais de service, decision de Phil : 0,1 % de l emprunt -> FEE_WALLET) : chaque emprunt est suivi de SON frais */
vu(r.aSigner.length === 8 && sels[0] === GOOGLC + ':' + B.SEL.approve && sels[4] === NVDAC + ':' + B.SEL.approve
  && sels[2] === B.MORPHO_BLUE.toLowerCase() + ':' + B.SEL.borrow && sels[6] === B.MORPHO_BLUE.toLowerCase() + ':' + B.SEL.borrow
  && sels[3] === USDC + ':' + B.SEL.transfer && sels[7] === USDC + ':' + B.SEL.transfer,
  'sequence attendue [approve G, depot G, emprunt G, frais G, approve N, depot N, emprunt N, frais N] : ' + JSON.stringify(sels));
vu(BigInt('0x' + r.aSigner[0].data.slice(-64)) === 10n ** 7n && BigInt('0x' + r.aSigner[4].data.slice(-64)) === 10n ** 7n, 'approbations au MONTANT EXACT de chaque garantie');
vu(BigInt('0x' + r.aSigner[3].data.slice(-64)) === B.fraisEmprunt(10n ** 7n) && r.resume.lignes.every((x) => x.fraisApp === String(B.fraisEmprunt(10n ** 7n))), 'le frais de chaque ligne n est pas 0,1 % de SON emprunt');
vu(nd.sims.length === 1 && nd.sims[0] === 8, 'la sequence n est pas simulee EN ENTIER, une fois : ' + JSON.stringify(nd.sims));
vu(r.resume && r.resume.panier === true && r.resume.lignes.length === 2 && r.resume.lignes.map((x) => x.garantieAction).join() === 'GOOGLc,NVDAc', 'resume du panier faux');
vu(/its own Morpho position/.test(r.resume.positionsSeparees) && r.resume.positionsSeparees === B.PHRASE_PANIER_SEPARE, 'la phrase « chaque action est sa propre position » ne voyage pas');
/* une ligne au-dela du plafond : le panier est refuse, la ligne NOMMEE */
const r2 = await B.planEmprunterPanier({ rpc: noeud().rpc, compte: COMPTE, lignes: [L(ID_G), L(ID_N, 10n ** 7n, 10n ** 9n)] });
vu(r2.etat === 'REFUSE' && /^NVDAc: too much/.test(r2.pourquoi) && r2.aSigner.length === 0, 'une ligne refusee ne refuse pas le panier en la nommant : ' + r2.pourquoi);
/* doublons, bornes */
vu((await B.planEmprunterPanier({ rpc: noeud().rpc, compte: COMPTE, lignes: [L(ID_G), L(ID_G)] })).etat === 'REFUSE', 'le meme marche deux fois accepte');
const r3 = await B.planEmprunterPanier({ rpc: noeud().rpc, compte: COMPTE, lignes: [L(ID_G), L(ID_G2)] });
vu(r3.etat === 'REFUSE' && /GOOGLc appears twice/.test(r3.pourquoi), 'la meme action sur deux marches acceptee : ' + r3.pourquoi);
vu((await B.planEmprunterPanier({ rpc: noeud().rpc, compte: COMPTE, lignes: [] })).etat === 'REFUSE', 'panier vide accepte');
vu((await B.planEmprunterPanier({ rpc: noeud().rpc, compte: COMPTE, lignes: Array.from({ length: 6 }, (_, k) => L('0x' + String(k + 1).repeat(64))) })).etat === 'REFUSE', '6 lignes acceptees');
/* une simulation qui reverte refuse le panier entier */
const r4 = await B.planEmprunterPanier({ rpc: noeud({ sim: 'revert' }).rpc, compte: COMPTE, lignes: [L(ID_G), L(ID_N)] });
vu(r4.etat === 'REFUSE' && r4.aSigner.length === 0, 'une simulation qui reverte laisse un panier a signer');
/* l emprunt simple n a pas change (meme constructeur) */
const s = await B.planEmprunter({ rpc: noeud().rpc, compte: COMPTE, id: ID_N, garantie: 10n ** 7n, emprunt: 10n ** 7n });
vu(s.etat === 'PRET' && s.aSigner.length === 4, 'l emprunt simple a change : ' + s.etat);
console.log('ok banque-panier - ' + n + ' assertions ; NE PROUVE PAS l execution sur la chaine');
