/* test-banque-frais-20261011.mjs - LES FRAIS DE SERVICE DE LA BANK : 0,1 % DE L EMPRUNT, VERS LA CAISSE, DITS AVANT DE SIGNER.
 * Phil (2026-10-11) : « creer un fees comme sur Aave ou Morpho pour que l app gagne un peu aussi », « ajoute wallet dev comme recipient » ;
 *   choix (AskUserQuestion) : « 0,1 % de l emprunt », « FEE_WALLET 0xa6cf… ».
 * EXECUTE lireMarchesMorpho (faux fetch) et bcBanqueEstimer (app.html, TB_APP = ancienne).
 * AFFIRME : (1) une source : FRAIS_EMPRUNT_BPS = 10, destinataire = FEE_WALLET, publie par /api/banque/marches ; (2) l estimation dit le
 *   frais et le net recu, avec le calcul du plan (arrondi superieur) - et ne l invente pas si le taux n est pas lu ; (3) la carte du plan
 *   dit le montant EXACT du resume, simple et panier ; (4) le choix (formulaire, carte du Wallet) le dit avant tout montant ; (5) l adresse
 *   de la caisse n est JAMAIS dans la page (« TokenizedBlock », le wallet montre l adresse).
 * L EXECUTION est prouvee a part, sur les SOLDES : banc-banque-morpho-fork (+9 990 000 / caisse +10 000) et banc-banque-panier-fork.
 * NE PROUVE PAS : un vrai wallet.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import * as B from './banque-morpho.js';
import { FEE_WALLET } from './frais-creation.js';
import { enUnitesBrutes } from './commandes-panel.js';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const fonction = (entete) => { const i = html.indexOf(entete); assert.ok(i > 0, 'introuvable : ' + entete); const f = /\r?\n\}/.exec(html.slice(i)); return html.slice(i, i + f.index + f[0].length); };
/* (1) une source */
vu(B.FRAIS_EMPRUNT_BPS === 10n && B.DESTINATAIRE_FRAIS_BANQUE === FEE_WALLET, 'taux ou destinataire des frais changes sans decision');
const faux = async () => ({ ok: true, json: async () => ({ data: { markets: { items: [] } } }) });
const lm = await B.lireMarchesMorpho({ fetchImpl: faux });
vu(lm.ok === true && lm.fraisEmpruntBps === 10, '/api/banque/marches ne publie pas le taux : ' + JSON.stringify(lm));
vu(/bcBanque\.fraisBps = Number\.isInteger\(r\.fraisEmpruntBps\) && r\.fraisEmpruntBps >= 0 \? r\.fraisEmpruntBps : null;/.test(fonction('async function bcBanqueLireMarches(force = false) {')), 'la page ne lit pas le taux du serveur');
/* (2) l estimation */
const mk = { id: '0xa3', garantie: { decimales: 8, symbole: 'GOOGLc' }, pret: { decimales: 6, symbole: 'USDC' }, prixOracle: '3526329343300000000000000000000000000', lltv: '770000000000000000', margeBps: 7000, apyPret: 0.05 };
const champs = { '#bcBanqueEstim': { textContent: '' }, '#bcBanqueGarantie': { value: '1' }, '#bcBanqueMontant': { value: '10' } };
const estimer = (fraisBps) => { new Function('$', 'bcBanque', 'enUnitesBrutes', 'bcUnites', 'bcPct', 'bcPeindreJauge', fonction('function bcBanqueEstimer() {') + '\nreturn bcBanqueEstimer;')(
  (s) => champs[s], { choisi: mk, sens: 'emprunter', fraisBps }, enUnitesBrutes, (v, d) => (Number(v) / 10 ** d).toFixed(2), (x) => String(x), () => {})(); return champs['#bcBanqueEstim'].textContent; };
const t = estimer(10);
vu(/TokenizedBlock fee: 0\.1 % of what you borrow \(≈ 0\.01 USDC\), in the same batch — you receive ≈ 9\.99\./.test(t), 'l estimation ne dit pas le frais et le net : ' + t);
champs['#bcBanqueMontant'].value = '0.0001'; /* 100 unites : 0,1 % = 0,1 -> arrondi SUPERIEUR = 1 unite, comme fraisEmprunt */
vu(/\(≈ 0\.00 USDC\)/.test(estimer(10)) && B.fraisEmprunt(100n) === 1n, 'arrondi du frais : page et plan divergent');
champs['#bcBanqueMontant'].value = '10';
vu(!/TokenizedBlock fee/.test(estimer(null)) && !/TokenizedBlock fee/.test(estimer(undefined)), 'TEMOIN : sans taux lu, l estimation invente un frais');
/* (3) la carte du plan : le montant EXACT du resume */
vu(/if \(\/\^\\d\+\$\/\.test\(String\(rs\.fraisApp \|\| ''\)\)\) bcEtape\(m, \(rs\.fraisPour \|\| 'TokenizedBlock'\) \+ ' fee: ' \+ bcUnites\(rs\.fraisApp, decP\)/.test(fonction('async function bcBanqueProposer({')), 'la carte du plan ne dit pas le frais exact');
const panier = fonction('async function bcBanqueProposerPanier(lignes) {');
vu(/' fee ' \+ bcUnites\(l\.fraisApp, dp\)/.test(panier) && /'TokenizedBlock fee in total: '/.test(panier), 'le panier ne dit pas le frais de chaque ligne et le total');
/* (4) au choix */
vu(/' TokenizedBlock takes a one-time fee of ' \+ \(bcBanque\.fraisBps \/ 100\) \+ ' % of what you borrow\.'/.test(fonction('function bcBanqueChoisir(mk, sens) {')), 'le choix « Borrow » ne dit pas le frais');
vu(/' \+ a one-time ' \+ \(bcBanque\.fraisBps \/ 100\) \+ ' % fee'/.test(fonction('async function tbBanquePeindre() {')), 'la carte du Wallet ne dit pas le frais');
/* (5) jamais l adresse de la caisse dans la page */
vu(!html.toLowerCase().includes(FEE_WALLET.toLowerCase().slice(2)), 'l adresse de la caisse est dans la page');
console.log('ok banque-frais - ' + n + ' assertions ; l execution est prouvee sur les SOLDES par les bancs fork ; NE PROUVE PAS un vrai wallet');
