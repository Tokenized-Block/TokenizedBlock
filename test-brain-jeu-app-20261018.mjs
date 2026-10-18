/* test-brain-jeu-app-20261018.mjs — le cablage de « Let the brain play » dans app.html (structure, pas un navigateur) :
 *   UN bouton + son panneau (budget, jeux, max par heure, plafond skin) + « Off » ; la boucle demande brain-jeu.js ; la signature passe
 *   par bcSigner SEULEMENT (aucun envoi direct au wallet dans ce code) ; reglages en localStorage sous try/catch ; module servi.
 *   La carte Skin market montre les encheres en cours, les skins du wallet (« Sell at a price » / « Start an auction ») et la proposition. */
import { readFileSync } from 'node:fs';
let n = 0;
const vu = (c, m) => { if (!c) { console.error('KO ' + m); process.exit(1); } n++; };
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const serveur = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');

for (const id of ['brainJeuCarte', 'bjJouer', 'bjOff', 'bjBudget', 'bjMaxH', 'bjMaxSkin', 'bjRolls', 'bjMissions', 'bjPost', 'bjSkins', 'bjEtat', 'skinBrain']) vu(app.split('id="' + id + '"').length === 2, 'element #' + id + ' present une fois');
vu(/id="bjJouer">Let the brain play</.test(app), 'le bouton dit « Let the brain play »');
vu(/id="bjOff" hidden>Off</.test(app), 'l interrupteur « Off » existe, cache tant que c est eteint');
/* UX 2026-10-18 (Phil : « ameliore l ux ») : le Roll est le premier ecran ; la carte du brain suit, limites repliees, resume peint */
vu(app.indexOf('id="brainJeuCarte"') > app.indexOf('id="tirCarte"') && app.indexOf('id="brainJeuCarte"') < app.indexOf('id="missionsCarte"'), 'la carte est DANS l onglet Game, juste apres Draws');
vu(/<details class="bjLimites"[^>]*>\s*<summary class="note" id="bjResume"/.test(app) && /rz\.textContent = 'Limits — '/.test(app) && /if \(d\) d\.open = true;/.test(app), 'limites repliees, resume = reglages enregistres, un refus les ouvre');
vu(/import \{ prochaineProposition as bjProposition \} from '\.\/brain-jeu\.js';/.test(app), 'app.html importe brain-jeu.js');
vu(/'brain-jeu\.js',/.test(serveur.match(/const SERVIS\s*=\s*\[([\s\S]*?)\];/)[1]), 'brain-jeu.js est dans SERVIS');

const debut = app.indexOf('/* ══ LET THE BRAIN PLAY'), fin = app.indexOf("setInterval(() => { if (bj.on && !document.hidden) void bjTour(); }, 30000);");
vu(debut > 0 && fin > debut, 'le bloc de la boucle est trouve (' + (fin - debut) + ' caracteres)');
const bloc = app.slice(debut, fin);
vu(bloc.length > 4000, 'le bloc n est pas une capture vide');
vu(/bjProposition\(\{ authorized: bj\.on === true/.test(bloc), 'l autorisation donnee au module = l interrupteur, strictement');
vu(/r = await bcSigner\(m, p\.calls,/.test(bloc), 'Sign passe par bcSigner (le chemin existant : le wallet confirme chaque appel)');
vu(!/envoyerDepuisWallet|envoyerLotAtomique|envoyerAppels|eth_sendTransaction|wallet_sendCalls/.test(bloc), 'aucun envoi direct au wallet dans la boucle : bcSigner seulement');
vu((bloc.match(/bcSigner\(/g) || []).length === 1, 'un seul appel a bcSigner, derriere le bouton Sign');
vu(/\['Sign', async \(\) => \{/.test(bloc) && /\['Dismiss', \(\) =>/.test(bloc), 'la carte a « Sign » et « Dismiss »');
vu(/function bjSauver\(\) \{ try \{ localStorage\.setItem/.test(bloc) && /function bjCharger\(\) \{\n  try \{\n    const j = JSON\.parse\(localStorage\.getItem/.test(bloc), 'reglages en localStorage, lecture et ecriture sous try/catch');
vu(/if \(bjVol\.ouverte\) \{ if \(bjVol\.signe \|\| Date\.now\(\) - bjVol\.ouverte < 300000\) return;/.test(bloc), 'jamais deux propositions ouvertes (une ignoree expire en 5 min)');
vu(/if \(!bj\.on \|\| bjVol\.enVol \|\| document\.hidden\) return;/.test(bloc), 'eteint, en vol ou page cachee : aucun tour');
vu(/function bjEteindre\(pourquoi\) \{\n  bj\.on = false;/.test(bloc) && /\$\('#bjOff'\)\.addEventListener\('click', \(\) => bjEteindre\(\)\);/.test(bloc), 'Off eteint la boucle');
vu(/if \(r\.ok \|\| r\.diffusee\) \{\n      bj\.depense = \(BigInt\(bj\.depense\) \+ BigInt\(p\.costUsdc\)\)/.test(bloc), 'la depense est comptee apres un envoi (confirme ou diffuse)');
vu(/lireRolledTous\(recu\.logs, rolls\.contract\)/.test(bloc) && /bj\.pending\.push\(/.test(bloc), 'un roll signe est suivi jusqu a son settle');
vu(/balanceUsdc: solde === null \? null : solde\.toString\(\)/.test(bloc), 'solde non lu transmis comme null (le module refuse tout paiement)');
/* revue adverse 2026-10-18 (REFUTE) : une carte expiree restait signable -> budget et limite horaire depassables ; le wallet pouvait changer */
const rs = app.slice(app.indexOf('function bjRefusAuSigne('), app.indexOf('function bjSauver('));
vu(/if \(id !== bjVol\.carte\) return/.test(rs) && /if \(!bj\.on\) return/.test(rs) && /String\(c\)\.toLowerCase\(\) !== walletCarte/.test(rs)
  && /BigInt\(bj\.depense\) \+ BigInt\(p\.costUsdc\) > BigInt\(bj\.budget\)/.test(rs) && /\.length >= bj\.maxH\) return/.test(rs), 'au Sign : carte courante, brain allume, meme wallet, budget et limite horaire relus');
const iRefus = bloc.indexOf('const refus = bjRefusAuSigne(id, p, walletCarte);'), iSigne = bloc.indexOf('bjVol.signe = true;', iRefus), iEnvoi = bloc.indexOf('bcSigner(m, p.calls', iRefus);
vu(iRefus > 0 && iSigne > iRefus && iEnvoi > iSigne, 'le re-controle passe AVANT tout envoi');
vu(/bjVol\.ouverte = 0; bjVol\.carte \+= 1; \}/.test(bloc) && /bjVol\.carte \+= 1; const id = bjVol\.carte;/.test(bloc) && /const fini = \(txt\) => \{ if \(id !== bjVol\.carte\) return;/.test(bloc), 'une carte expiree change d id ; sa fin ne libere pas la carte courante');
vu(/const f = passLu \? tirerFaceDeRoll\(\) : null; guess = f \? f\.guess : null;/.test(bloc) && /const lp = await lirePassSur\(contrat, c\), passLu = lp\.ok;/.test(bloc) && !/adresseTicket/.test(app.slice(app.indexOf('async function bjTour()'), app.indexOf('const BJ_TITRES'))), 'le roll du brain tire une face neuve (plus la face du ticket)');

/* la carte Skin market */
const sk = app.slice(app.indexOf('async function peindreSkinsJeu()'), app.indexOf('/* ⛔ 2026-10-18 (Phil : « tous les skins a 10 dollars ») : le prix d une skin'));
vu(/Auctions in progress — current bid and time left:/.test(sk), 'Skin market : les encheres en cours, a part');
vu(/Your skins — sell at a price, or start an auction/.test(sk) && /bcLigneSkin\(s, moi, t\)/.test(sk), 'Skin market : les skins du wallet, par bcLigneSkin');
vu(/text: 'Sell at a price' \}\), be = bcEl\('button', \{ type: 'button', cls: 'bouton sec', text: 'Start an auction' \}\)/.test(app), 'bcLigneSkin : « Sell at a price » et « Start an auction »');
vu(/highest bid ' \+ bcMontantSkin\(s\.offre, s\.devise\)/.test(app) && /ends in ' \+ bcDureeSkin\(s\.fin - t\)/.test(app), 'une enchere en cours dit son offre et son temps restant');
vu(/const zs = \$\('#skinBrain'\);/.test(bloc), 'la proposition du brain (bid / buy) s affiche dans la carte Skin market');
console.log('ok brain-jeu-app - ' + n + ' assertions');
