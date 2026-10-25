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
/* 2026-10-11 (glow up + « le risque de liquidation en % ») : l estimateur peint aussi une jauge (bcPeindreJauge) - doublure qui note ses appels */
const jauges = [];
const estimer = new Function('$', 'bcBanque', 'enUnitesBrutes', 'bcUnites', 'bcPct', 'bcPeindreJauge', html.slice(iE, iE + finE.index + finE[0].length) + '\nreturn bcBanqueEstimer;')(
  (s) => champs[s], { choisi: mkG, sens: 'emprunter' }, enUnitesBrutes, (v, d) => (Number(v) / 10 ** d).toFixed(2), (x) => String(x), (...a) => jauges.push(a));
const dit = (g, m) => { champs['#bcBanqueGarantie'].value = g; champs['#bcBanqueMontant'].value = m; estimer(); return champs['#bcBanqueEstim'].textContent; };
/* 352,63 x 77 % x 70 % = 190,07 : les « ~190 USDC » mesures par Grok en prod sur 1 GOOGLc */
vu(/Oracle price: 1 GOOGLc = 352\.63 USDC/.test(dit('', '10')), 'garantie vide + 10 USDC : estimation vide (' + JSON.stringify(dit('', '10')) + ')');
vu(/you can borrow up to/.test(dit('1', '')) && /Oracle price/.test(dit('1', '')), 'garantie 1 + montant vide : pas de plafond (' + JSON.stringify(dit('1', '')) + ')');
vu(/Position LTV/.test(dit('1', '10')), 'garantie + montant : pas de LTV');
vu(dit('abc', '10') === '', 'un texte illisible est estime');
/* la distance a la liquidation, en % (decision de Phil) : 10 USDC sur 1 GOOGLc (352,63) -> LTV 2,8 %, liquidation sous ~12,99 USDC,
 *   soit une baisse de 96,3 % ; plafond 53,9 %, seuil 77 % */
jauges.length = 0;
const t1 = dit('1', '10'), j1 = jauges.at(-1);
vu(/That is a 96\.3 % fall from the oracle price — the distance to liquidation, not a probability\./.test(t1), 'la distance a la liquidation en % n est pas dite : ' + JSON.stringify(t1));
vu(j1 && Math.abs(j1[0] - 2.83) < 0.01 && Math.abs(j1[1] - 53.9) < 0.01 && Math.abs(j1[2] - 77) < 0.01 && Math.abs(j1[3] - 96.32) < 0.01 && j1[4] === 'GOOGLc',
  'la jauge ne recoit pas LTV / plafond / seuil / baisse : ' + JSON.stringify(j1));
dit('', '10'); vu(jauges.at(-1)[0] === null, 'sans garantie, la jauge invente une LTV');
dit('1', ''); vu(jauges.at(-1)[0] === 0 && jauges.at(-1)[3] === null, 'garantie sans emprunt : LTV 0, pas de baisse inventee');
/* 3) la carte TokenizedBank du Wallet disait « not built yet, no credit » alors que l emprunt est en ligne : elle mene a la banque */
/* 2026-10-11 : le bandeau « Preview » de la maquette est PARTI avec elle (decision de Phil) ; la ligne de ce qui est en ligne reste en tete */
const iCarte = html.indexOf('id="wBankCarte"'), iVive = html.indexOf('id="tbBanqueVivante"');
vu(iCarte > 0 && iVive > iCarte && iVive - iCarte < 3000 && html.indexOf('id="tbApercu"') < 0, 'la ligne de ce qui est en ligne n est pas en tete de la carte (ou le bandeau Preview est revenu)');
vu(/tbOuvrirBank'\)\.addEventListener\('click', \(\) => \{ bcOuvrirPop\([^)]*\); bcVue\('bank'\); void bcBanqueCharger\(\);(?: bcMontrerSousLaFeuille\(\$\('#wBankCarte'\), \$\('#bc-bank'\)(?:, \$\('#tbChoix'\))?\);)? \}\)/.test(html), 'le bouton Open the Bank n ouvre pas l onglet Bank du panneau');
/* 2026-10-25 (claude/grok-wallet) : seul ajout permis apres l ouverture = placer la vue et la carte sous 761 px (test-grok-wallet-20261025, F) */
/* 4) 2026-10-11 (Phil : « refais bien le frontend de l onglet Wallet pour TokenizedBank, pour rediriger direct ») : le bouton est un vrai
 *   bouton (pleine largeur, pas au milieu d une phrase), AVANT l idee jamais construite, qui est REPLIEE (<details>) et garde son bandeau en tete */
/*   2026-10-11, plus tard : l idee repliee est RETIREE (Phil) ; a sa place, le panier d ACTIONS, entre les choix et le bouton */
const iBouton = html.indexOf('<button type="button" class="bouton" id="tbOuvrirBank">'), iPanier = html.indexOf('<div class="tbPanier" id="tbPanier" hidden>');
vu(iBouton > iCarte && iPanier > iCarte && iPanier < iBouton && html.indexOf('id="tbIdee"') < 0, 'la carte du Wallet ne mene pas directement a la Bank (panier d actions avant le bouton plein, idee retiree)');
/* 2026-10-11 (Phil, « je comprends pas » sur les tuiles) : deux CHOIX en mots simples, au-dessus du bouton, chacun ouvre la Bank regle */
const iChoix = html.indexOf('<div class="tbChoix" id="tbChoix">');
vu(iChoix > iCarte && iChoix < iBouton && html.indexOf('id="tbBanquePos"') < iBouton && /data-intention="emprunter"[\s\S]{0,400}Borrow USDC/.test(html.slice(iChoix, iBouton))
  && /data-intention="preter"[\s\S]{0,400}Lend USDC/.test(html.slice(iChoix, iBouton)), 'la carte du Wallet n offre pas les deux choix au-dessus du bouton');
vu(/\$\('#tbChoix'\)\.addEventListener\('click', \(e\) => \{[\s\S]{0,300}bcBanque\.intentionChoisie = true;\s*bcOuvrirPop\(/.test(html), 'un choix de la carte du Wallet n ouvre pas la Bank reglee sur ce choix');
console.log('ok banque-saisie-ordre - ' + n + ' assertions ; NE PROUVE PAS le rendu navigateur');
