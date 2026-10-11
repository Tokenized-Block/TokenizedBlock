/* test-banque-choix-20261011.mjs - LES CHOIX DE LA BANK : L INTENTION D ABORD, LA LISTE RANGEE POUR CE WALLET, DES MONTANTS TOUT FAITS
 * QUI DISENT LEUR RISQUE, ET UNE ESTIMATION QUI COMPTE CE QUI EST DEJA POSE ET DEJA DU.
 * Phil (2026-10-11) : « optimise l ux pour les choix » ; « honnetement je comprends pas » (tuiles de la carte du Wallet).
 * EXECUTE bcOrdreChoix, bcBanqueEstimer, bcEstimationEmprunt et bcPourToi (app.html, TB_APP = ancienne).
 * AFFIRME : (1) preter = meilleur taux d abord, rien de replie ; (2) emprunter + wallet lu = positions, puis le plus grand montant ; le
 *   reste replie, dans l ordre d arrivee ; rien d utile = tout montre et dit ; sans wallet = l ordre d arrivee ; (3) l estimation compte
 *   la garantie deja posee et la dette deja due (comme le plan), et SEULEMENT pour le compte connecte ; (4) un montant tout fait a k % de
 *   notre maximum est vendu a une baisse de (1 - k x marge) ; (5) le cablage.
 * NE PROUVE PAS : le rendu (verifie au navigateur), ni un vrai wallet.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { enUnitesBrutes } from './commandes-panel.js';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const fonction = (entete) => { const i = html.indexOf(entete); assert.ok(i > 0, 'introuvable : ' + entete); const f = /\r?\n\}/.exec(html.slice(i)); return html.slice(i, i + f.index + f[0].length); };
const ordre = new Function(fonction('function bcOrdreChoix(infos, intention) {') + '\nreturn bcOrdreChoix;')();
const ids = (l) => l.map((x) => x.mk.id).join(',');
const I = (id, apyPret, r, aPosition = false) => ({ mk: { id, apyPret }, r, aPosition });
const R = (emprunt, garantie, rien = false) => ({ emprunt, garantie, rien });
/* (1) preter */
const p1 = ordre([I('a', 0.03, null), I('b', null, null), I('c', 0.055, null), I('d', 0.05, null)], 'preter');
vu(ids(p1.tete) === 'c,d,a,b' && p1.autres.length === 0, 'preter : ' + ids(p1.tete));
/* (2) emprunter */
const sans = ordre([I('a', 0, null), I('b', 0, null)], 'emprunter');
vu(ids(sans.tete) === 'a,b' && sans.autres.length === 0 && sans.aucune === false, 'sans wallet lu : l ordre change ou des cartes se cachent');
const avec = ordre([I('vide', 0, R(0n, 0n)), I('petit', 0, R(5_000_000n, 10n)), I('pos', 0, R(0n, 10n, true), true), I('gros', 0, R(270_000_000n, 10n)),
  I('rien', 0, R(110n, 10n, true)), I('autre', 0, R(0n, 0n)), I('egal', 0, R(5_000_000n, 10n))], 'emprunter');
vu(ids(avec.tete) === 'pos,gros,petit,egal', 'emprunter : tete ' + ids(avec.tete) + ' (attendu pos,gros,petit,egal - position, plus grand montant, tri stable)');
vu(ids(avec.autres) === 'vide,rien,autre', 'emprunter : replies ' + ids(avec.autres) + ' (ordre d arrivee)');
const rienUtile = ordre([I('x', 0, R(0n, 0n)), I('y', 0, R(110n, 10n, true))], 'emprunter');
vu(rienUtile.aucune === true && ids(rienUtile.tete) === 'x,y' && rienUtile.autres.length === 0, 'rien d utile : toute la liste doit rester visible, et c est dit');
/* (3) l estimation compte la position - et seulement celle du compte connecte */
const mkG = { id: '0xa3', garantie: { decimales: 8, symbole: 'GOOGLc' }, pret: { decimales: 6, symbole: 'USDC' }, prixOracle: '3526329343300000000000000000000000000', lltv: '770000000000000000', margeBps: 7000, apyPret: 0.05 };
const champs = { '#bcBanqueEstim': { textContent: '' }, '#bcBanqueGarantie': { value: '' }, '#bcBanqueMontant': { value: '' } };
const jauges = [];
const pourToi = { de: '0xabc', pos: { ok: true, positions: [{ id: '0xa3', garantieBrute: '100000000', detteBrute: '100000000' }] } };
const estimer = (compte) => new Function('$', 'bcBanque', 'enUnitesBrutes', 'bcUnites', 'bcPct', 'bcPeindreJauge', 'compte', fonction('function bcBanqueEstimer() {') + '\nreturn bcBanqueEstimer;')(
  (s) => champs[s], { choisi: mkG, sens: 'emprunter', pourToi }, enUnitesBrutes, (v, d) => (Number(v) / 10 ** d).toFixed(2), (x) => String(x), (...a) => jauges.push(a), compte);
const est = new Function(fonction('function bcEstimationEmprunt(mk, g, d) {') + '\nreturn bcEstimationEmprunt;')();
champs['#bcBanqueGarantie'].value = ''; champs['#bcBanqueMontant'].value = '50';
estimer('0xABC')();
const j = jauges.at(-1), attendu = est(mkG, 100_000_000n, 150_000_000n);
const texte = (o) => JSON.stringify(o, (k, v) => (typeof v === 'bigint' ? v.toString() : v));
vu(j && attendu && Math.abs(j[0] - attendu.ltvPct) < 1e-9 && Math.abs(j[3] - attendu.chutePct) < 1e-9, 'l estimation n utilise pas garantie + dette TOTALES : ' + texte(j) + ' vs ' + texte(attendu));
vu(/Counting what you already posted \(1\.00 GOOGLc\) and owe \(100\.00 USDC\)\./.test(champs['#bcBanqueEstim'].textContent) && / in total\./.test(champs['#bcBanqueEstim'].textContent),
  'l estimation ne dit pas ce qui est deja pose et du : ' + champs['#bcBanqueEstim'].textContent);
estimer('0xdef')();
vu(jauges.at(-1)[0] === null, 'TEMOIN : la position d un AUTRE compte entre dans l estimation');
estimer(undefined)();
vu(jauges.at(-1)[0] === null, 'TEMOIN : sans compte, une position est prise en compte');
/* (4) un montant a k % de notre maximum : vendu a une baisse de (1 - k x 0,7) - les montants tout faits disent CE chiffre */
const pourToiFn = new Function(fonction('function bcPourToi(mk, soldeGarantie, position, soldePret) {') + '\nreturn bcPourToi;')();
const r = pourToiFn({ ...mkG, disponibleBrut: null }, 100_000_000n, { garantieBrute: '0', detteBrute: '0' }, 0n);
for (const [k, chute] of [[25n, 82.5], [50n, 65], [95n, 33.5]]) {
  const e = est(mkG, r.garantie, (r.emprunt * k) / 100n);
  vu(e && Math.abs(e.chutePct - chute) < 0.2, k + ' % du maximum : baisse ' + (e && e.chutePct) + ' (attendu ~' + chute + ')');
}
/* (5) le cablage */
const puces = fonction('function bcBanquePuces(mk, r, soldeG) {');
vu(/bcEstimationEmprunt\(mk, r\.garantie, \(r\.dette \|\| 0n\) \+ m\)/.test(puces) && /\['A quarter', 25n\], \['Half', 50n\], \['Near our max', 95n\]/.test(puces)
  && /'sold if ' \+ sym \+ ' falls '/.test(puces) && /bcBanqueSaisie\(\);/.test(puces), 'les montants tout faits ne disent pas leur risque, ou ne passent pas par l estimation');
vu(/bcBanquePuces\(mk, r, solde\);/.test(fonction('function bcBanqueIndices() {')), 'les montants tout faits ne sont pas peints avec les indices');
const charger = fonction('async function bcBanqueCharger(force = false) {');
vu(/const ordre = bcOrdreChoix\(infos, intention\);/.test(charger) && /'details', \{ cls: 'bcAutres' \}/.test(charger), 'la liste n est pas rangee pour ce wallet, ou rien n est replie');
vu(/\['Buy ' \+ mk\.garantie\.symbole, 'acheter', 'bouton'\]/.test(charger) && /choisirBrain\(String\(mk\.garantie\.adr\)\.toLowerCase\(\)\); bcRepeindre\(\); bcVue\('trade'\);/.test(charger),
  'une action non detenue ne propose pas de l acheter');
vu(/\$\('#bcBanqueIntention'\)\.addEventListener\('click'[\s\S]{0,200}bcBanque\.intentionChoisie = true; void bcBanqueCharger\(\);/.test(html), 'le choix d intention ne range pas la liste');
vu(!/'Max borrow'|'You borrow up to '/.test(charger) && /'Costs a year'/.test(charger) && /the stock is sold to repay the loan \(liquidation\)/.test(charger), 'les cartes parlent encore jargon');
console.log('ok banque-choix - ' + n + ' assertions ; NE PROUVE PAS le rendu ni un vrai wallet');
