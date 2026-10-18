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
/* ── DUELS dans « Let the brain play » (2026-10-18) ── */
for (const id of ['bjDuels', 'bjMaxDuel', 'bjDuelsLab', 'bjMaxDuelLab']) vu(app.split('id="' + id + '"').length === 2, 'element #' + id + ' present une fois');
vu(/<label id="bjDuelsLab" hidden><input type="checkbox" id="bjDuels"> Duels<\/label>/.test(app) && /<label class="champ" id="bjMaxDuelLab" hidden>Max duel stake \(USDC\)<input id="bjMaxDuel"/.test(app), 'la case Duels et la mise max existent, CACHEES tant que le contrat n est pas servi');
vu(/for \(const id of \['#bjDuelsLab', '#bjMaxDuelLab'\]\) \{ const x = \$\(id\); if \(x\) x\.hidden = !on; \}/.test(app), 'peindreDuels les montre seulement avec un contrat servi');
vu(/const duels = \$\('#bjDuels'\)\.checked && !\$\('#bjDuelsLab'\)\.hidden/.test(bloc), 'une case Duels cachee (cochee par un vieux reglage) ne compte pas');
vu(/duels: bj\.duels, maxDuelStakeUsdc: bj\.maxDuel \}/.test(bloc) && /history: bj\.history, seen: bj\.seen, rolls, missions, skins, duels \}\);/.test(bloc), 'le module recoit la regle duels, la mise max et les duels lus');
vu(/const f = tirerFaceDeRoll\(\); guessD = f \? f\.guess : null;/.test(bloc) && /duels = \{ contract: cd, usdc: USDC_BASE, guess: guessD, expiresIn: 3600, block: tete, list: duelsDe\(jd\) \}/.test(bloc), 'le duel du brain joue une face NEUVE ; la tete est relue ; la liste vient de /api/duels');
vu(/!\/\^\(ROLL\|SETTLE\|DUEL_SETTLE\|DUEL_CREATE\):\/\.test\(p\.cle\)/.test(bloc) && /if \(p\.kind === 'DUEL_SETTLE'\) \{ bj\.seen\.push\(p\.cle\);/.test(bloc), 'un settle de duel n entre dans seen qu apres confirmation');
vu((bloc.match(/bcSigner\(/g) || []).length === 1, 'toujours UN seul bcSigner dans la boucle (les duels passent par le meme Sign)');
/* bjRefusAuSigne EXECUTE (extrait de app.html, evalue avec un etat factice) : les couts des duels sont relus AU SIGNE */
const srcRefus = rs.replace(/\/\*[\s\S]*?\*\//g, '');
const fabrique = (code) => new Function('bj', 'bjVol', 'compte', 'usdcTexte', code + '\nreturn bjRefusAuSigne;');
const W = '0x' + '1'.repeat(40), maintenantS = Math.floor(Date.now() / 1000);
const etatBj = (x = {}) => ({ on: true, budget: '10000000', depense: '0', maxH: 6, maxDuel: '1000000', duels: true, history: [], ...x });
const refusDe = (code, p, x = {}) => fabrique(code)(etatBj(x), { carte: 3 }, W, (v) => String(v))(3, p, W);
vu(refusDe(srcRefus, { kind: 'DUEL_JOIN', costUsdc: '1000000' }) === null, 'au Sign : un join a la mise max passe (null)');
vu(/max duel stake/.test(String(refusDe(srcRefus, { kind: 'DUEL_JOIN', costUsdc: '1000001' }))), 'au Sign : un join au-dessus de la mise max est REFUSE');
vu(/max duel stake/.test(String(refusDe(srcRefus, { kind: 'DUEL_CREATE', costUsdc: '2000000' }))), 'au Sign : un create au-dessus de la mise max est REFUSE');
vu(/not ticked/.test(String(refusDe(srcRefus, { kind: 'DUEL_SETTLE', costUsdc: '0' }, { duels: false }))), 'au Sign : duels decoches entre-temps -> REFUSE');
vu(/this hour/.test(String(refusDe(srcRefus, { kind: 'DUEL_CREATE', costUsdc: '1000000' }, { history: [{ t: maintenantS - 600, kind: 'DUEL_CREATE' }] }))), 'au Sign : un deuxieme create dans l heure -> REFUSE');
vu(/budget/.test(String(refusDe(srcRefus, { kind: 'DUEL_JOIN', costUsdc: '1000000' }, { depense: '9500000' }))), 'au Sign : le budget relu couvre aussi les duels');
/* mutants (sur le TEXTE extrait, rien n est ecrit sur disque) : chaque ligne des duels retiree laisse passer ce qu elle refusait */
const sansLigne = (motif) => { vu(srcRefus.split(motif).length === 2, 'mutant au Sign : le motif existe une fois'); return srcRefus.replace(motif, 'if (false)'); };
vu(refusDe(sansLigne("if ((p.kind === 'DUEL_JOIN' || p.kind === 'DUEL_CREATE') && BigInt(p.costUsdc) > BigInt(bj.maxDuel))"), { kind: 'DUEL_JOIN', costUsdc: '1000001' }) === null, 'MUTANT plafond de duel au Sign retire : le join trop cher PASSERAIT — l assertion ROUGIT');
vu(refusDe(sansLigne("if (/^DUEL_/.test(p.kind) && !bj.duels)"), { kind: 'DUEL_SETTLE', costUsdc: '0' }, { duels: false }) === null, 'MUTANT duels-decoches retire : le settle PASSERAIT — l assertion ROUGIT');
vu(refusDe(sansLigne("if (bj.history.some((x) => x.kind === 'DUEL_CREATE' && Number(x.t) > h))"),{ kind: 'DUEL_CREATE', costUsdc: '1000000' }, { history: [{ t: maintenantS - 600, kind: 'DUEL_CREATE' }] }) === null, 'MUTANT un-create-par-heure retire : le 2e create PASSERAIT — l assertion ROUGIT');
console.log('ok brain-jeu-app - ' + n + ' assertions');
