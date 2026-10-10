/* test-banque-saisie-ordre-20261010.mjs - L ONGLET BANK : UNE SAISIE EFFACE LE REFUS ROUGE, ET LES MARCHES OU L ON PEUT EMPRUNTER
 * VIENNENT D ABORD. Test prod de Grok (20261010-bank-all-paths) : « Type an amount of USDC. » restait affiche apres la saisie ;
 *   « GOOGLc apparait deux fois » (mesure prod : meme oracle, LLTV 62,5 % ~0 $ disponible et 77 % 573 $ - distincts, mal ordonnes).
 * EXECUTE bcBanqueSaisie et le tri de bcBanqueCharger, extraits d app.html (TB_APP = ancienne copie).
 * AFFIRME : une saisie efface une note ROUGE (wKo), jamais une note neutre, et relance l estimation ; les marches listes sont tries
 *   par liquidite disponible decroissante, une liquidite non lue en dernier, les non listes toujours ecartes et comptes.
 * NE PROUVE PAS : le rendu navigateur.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
const L = html.split(/\r?\n/);
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
/* 1) la saisie */
const lS = L.find((l) => l.startsWith('function bcBanqueSaisie('));
vu(!!lS, 'bcBanqueSaisie absente : rien n efface le refus rouge a la saisie');
const note = { className: 'note wKo', textContent: 'Type an amount of USDC.', classList: { contains(c) { return note.className.split(' ').includes(c); } } };
let estimes = 0;
const saisie = new Function('$', 'bcBanqueEstimer', lS + '; return bcBanqueSaisie;')((s) => (s === '#bcBanqueNote' ? note : null), () => { estimes += 1; });
saisie();
vu(note.textContent === '' && note.className === 'note' && estimes === 1, 'le refus rouge reste apres une saisie : ' + JSON.stringify(note.textContent));
note.className = 'note'; note.textContent = 'Reading GOOGLc…';
saisie();
vu(note.textContent === 'Reading GOOGLc…' && estimes === 2, 'une note neutre est effacee par une saisie');
vu(/\$\('#bcBanqueMontant'\)\.addEventListener\('input', bcBanqueSaisie\)/.test(html) && /\$\('#bcBanqueGarantie'\)\.addEventListener\('input', bcBanqueSaisie\)/.test(html), 'les champs ne passent pas par bcBanqueSaisie');
/* 2) l ordre */
const iD = L.findIndex((l) => l.includes('const dispoDe = (mk) =>'));
vu(iD > 0 && L[iD + 1].includes('const listes = bcBanque.marches.filter'), 'le tri par liquidite est absent');
const tri = new Function('bcBanque', L[iD].trim() + '\n' + L[iD + 1].trim() + '\nreturn { listes, ecartes };');
const M = (id, dispo, liste = true) => ({ id, disponibleUsd: dispo, listeParMorpho: liste });
const r = tri({ marches: [M('googl62', 0.0001), M('non-liste', 900, false), M('googl77', 573.19), M('illisible', null), M('nvda', 76.68), M('texte', 'x')] });
vu(r.listes.map((m) => m.id).join() === 'googl77,nvda,googl62,illisible,texte' || r.listes.map((m) => m.id).join() === 'googl77,nvda,googl62,texte,illisible', 'ordre faux : ' + r.listes.map((m) => m.id).join());
vu(r.ecartes === 1 && !r.listes.some((m) => m.id === 'non-liste'), 'un marche non liste revient');
/* 2 bis) l estimation : un champ vide = 0, pas « illisible » (mesure locale : Collateral vide + 10 USDC -> estimation VIDE) */
const { enUnitesBrutes } = await import('./commandes-panel.js');
const iE = html.indexOf('function bcBanqueEstimer()');
const finE = iE > 0 ? /\r?\n\}/.exec(html.slice(iE)) : null;
vu(iE > 0 && !!finE, 'bcBanqueEstimer introuvable');
const champs = { '#bcBanqueEstim': { textContent: '' }, '#bcBanqueGarantie': { value: '' }, '#bcBanqueMontant': { value: '' } };
const mkG = { garantie: { decimales: 8, symbole: 'GOOGLc' }, pret: { decimales: 6, symbole: 'USDC' }, prixOracle: '3526329343300000000000000000000000000', lltv: '770000000000000000', margeBps: 7000, apyPret: 0.05 };
const estimer = new Function('$', 'bcBanque', 'enUnitesBrutes', 'bcUnites', 'bcPct', html.slice(iE, iE + finE.index + finE[0].length) + '\nreturn bcBanqueEstimer;')(
  (s) => champs[s], { choisi: mkG, sens: 'emprunter' }, enUnitesBrutes, (v, d) => (Number(v) / 10 ** d).toFixed(2), (x) => String(x));
const dit = (g, m) => { champs['#bcBanqueGarantie'].value = g; champs['#bcBanqueMontant'].value = m; estimer(); return champs['#bcBanqueEstim'].textContent; };
/* 352,63 x 77 % x 70 % = 190,07 : les « ~190 USDC » mesures par Grok en prod sur 1 GOOGLc */
vu(/Oracle price: 1 GOOGLc = 352\.63 USDC/.test(dit('', '10')), 'garantie vide + 10 USDC : estimation vide (' + JSON.stringify(dit('', '10')) + ')');
vu(/you can borrow up to/.test(dit('1', '')) && /Oracle price/.test(dit('1', '')), 'garantie 1 + montant vide : pas de plafond (' + JSON.stringify(dit('1', '')) + ')');
vu(/Position LTV/.test(dit('1', '10')), 'garantie + montant : pas de LTV');
vu(dit('abc', '10') === '', 'un texte illisible est estime');
/* 3) la carte TokenizedBank du Wallet disait « not built yet, no credit » alors que l emprunt est en ligne : elle mene a la banque */
const iCarte = html.indexOf('id="wBankCarte"'), iVive = html.indexOf('id="tbBanqueVivante"'), iApercu = html.indexOf('id="tbApercu"');
vu(iCarte > 0 && iVive > iCarte && iVive < iApercu, 'la ligne « Live now » n est pas en tete de la carte, avant le bandeau Preview');
vu(/tbOuvrirBank'\)\.addEventListener\('click', \(\) => \{ bcOuvrirPop\([^)]*\); bcVue\('bank'\); void bcBanqueCharger\(\); \}\)/.test(html), 'le bouton Open the Bank n ouvre pas l onglet Bank du panneau');
console.log('ok banque-saisie-ordre - ' + n + ' assertions ; NE PROUVE PAS le rendu navigateur');
