/* test-avis-actions-hors-us-20261011.mjs - AVANT D ACHETER UNE ACTION TOKENISEE, L APP DIT QU ELLE EST HORS US (Regulation S).
 * Decision de Phil (chat, 2026-10-11) : « avis avant achat », une ligne, rien de bloque. Source verifiee : base.org/stocks - « offered
 *   under Regulation S; only available in eligible jurisdictions outside of the US ».
 * Trou mesure dans le code : la fiche disait deja « only for eligible jurisdictions outside the U.S. » (#peAction), mais SEULEMENT
 *   quand la DEVISE DE PAIRE est une action (un block cote en action) - jamais sur la fiche de l action elle-meme (NVDAc cotee en USDC),
 *   la ou on l achete. Le panneau (carte de swap) ne le disait nulle part.
 * EXECUTE la phrase partagee ; epingle ses deux usages : la fiche (action = devise de paire OU jeton de la fiche) et la carte de swap
 *   du panneau (achat d une action, AVANT le plan donc avant toute signature).
 * NE PROUVE PAS : le rendu navigateur (verifie a part, preview locale).
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const l = html.split(/\r?\n/).find((x) => x.startsWith('const PHRASE_ACTIONS_HORS_US ='));
vu(!!l, 'PHRASE_ACTIONS_HORS_US absente : l avis n est pas partage');
const PHRASE = new Function(l + '; return PHRASE_ACTIONS_HORS_US;')();
vu(/outside the U\.?S\.?/.test(PHRASE) && /Regulation S/.test(PHRASE), 'la phrase ne dit pas hors US / Regulation S : ' + PHRASE);
vu(!/must|you are|not allowed to use this app/i.test(PHRASE), 'la phrase accuse ou interdit au lieu d informer : ' + PHRASE);
/* la fiche */
const iF = html.indexOf('function majDeviseEchange(v) {');
const corpsF = html.slice(iF, html.indexOf('function majRecoitBlocs()', iF));
vu(/ACTIONS_PAR_ADR\.has\(String\(\(\$\('#profil'\) && \$\('#profil'\)\.dataset\.block\) \|\| ''\)\.toLowerCase\(\)\)/.test(corpsF), 'la fiche n affiche pas l avis quand le jeton de la fiche EST une action');
vu(/nAction\.textContent = PHRASE_ACTIONS_HORS_US/.test(corpsF), 'la fiche n utilise pas la phrase partagee');
/* le panneau : avant `const planifier`, donc avant tout plan et toute signature */
const iP = html.indexOf('async function bcProposerSwap(');
const avantPlan = html.slice(iP, html.indexOf('const planifier = async () => {', iP));
vu(/if \(ACTIONS_PAR_ADR\.has\(String\(vers\.adr\)\.toLowerCase\(\)\)\) bcEtape\(m, PHRASE_ACTIONS_HORS_US\);/.test(avantPlan), 'la carte de swap n affiche pas l avis avant le plan d un achat d action');
/* decision 2 de Phil (meme jour) : hors US, la carte demande un compte Coinbase (guest checkout du widget heberge arrete le
 *   30/06/2026, reserve aux residents US - docs.cdp.coinbase.com/onramp/coinbase-hosted-onramp/overview, verifie) */
vu(/id="bcBanqueCarte"[^>]*>Add USDC with a card or bank \(Coinbase — needs a Coinbase account outside the U\.S\.\)<\/a>/.test(html), 'le lien carte de la Bank ne dit pas le compte Coinbase hors US');
const iB = html.indexOf('id="brFundWallet"');
vu(iB > 0 && /Outside the U\.S\., paying by card needs a Coinbase account/.test(html.slice(iB - 600, iB)), 'le Bridge ne dit pas le compte Coinbase hors US avant son bouton Fund wallet');
console.log('ok avis-actions-hors-us - ' + n + ' assertions ; NE PROUVE PAS le rendu navigateur');
