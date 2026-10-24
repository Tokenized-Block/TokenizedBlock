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
vu(/import \{ prochaineProposition as bjProposition(, dernierJourDeSemaine as bjDernierJour)? \} from '\.\/brain-jeu\.js';/.test(app), 'app.html importe brain-jeu.js');
vu(/'brain-jeu\.js',/.test(serveur.match(/const SERVIS\s*=\s*\[([\s\S]*?)\];/)[1]), 'brain-jeu.js est dans SERVIS');

/* 2026-10-23 DENIM : la boucle se replanifie (bjRelire : 30 s, ou le rythme du Game quand un roll attend) — elle finit a sa definition */
const debut = app.indexOf('/* ══ LET THE BRAIN PLAY'), fin = app.indexOf('function bjRelire() {');
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
vu(/if \(r\.ok \|\| r\.diffusee\) \{\n      bj\.depense = \(BigInt\(bj\.depense\) \+ BigInt\(potCoup \? '0' : p\.costUsdc\)\)/.test(bloc), 'la depense est comptee apres un envoi (confirme ou diffuse) — un coup de pot a son budget a lui');
vu(/bj\.history\.push\(p\.kind === 'POT_FUND' \? \{ t: Math\.floor\(Date\.now\(\) \/ 1000\), kind: p\.kind, day: p\.day, usdc: p\.costUsdc \}/.test(bloc), 'un fund signe entre dans l historique avec son jour et son montant (le budget du jour se compte la-dessus)');
vu(/lireRolledTous\(recu\.logs, rolls\.contract\)/.test(bloc) && /bj\.pending\.push\(/.test(bloc), 'un roll signe est suivi jusqu a son settle');
vu(/balanceUsdc: solde === null \? null : solde\.toString\(\)/.test(bloc), 'solde non lu transmis comme null (le module refuse tout paiement)');
/* revue adverse 2026-10-18 (REFUTE) : une carte expiree restait signable -> budget et limite horaire depassables ; le wallet pouvait changer */
const rs = app.slice(app.indexOf('function bjRefusAuSigne('), app.indexOf('function bjSauver('));
vu(/if \(id !== bjVol\.carte\) return/.test(rs) && /if \(!bj\.on\) return/.test(rs) && /String\(c\)\.toLowerCase\(\) !== walletCarte/.test(rs)
  && /BigInt\(bj\.depense\) \+ BigInt\(p\.costUsdc\) > BigInt\(bj\.budget\)/.test(rs) && /\.length >= bj\.maxH\) return/.test(rs), 'au Sign : carte courante, brain allume, meme wallet, budget et limite horaire relus');
const iRefus = bloc.indexOf('const refus = bjRefusAuSigne(id, p, walletCarte, lu);'), iSigne = bloc.indexOf('bjVol.signe = true;', iRefus), iEnvoi = bloc.indexOf('bcSigner(m, p.calls', iRefus);
vu(iRefus > 0 && iSigne > iRefus && iEnvoi > iSigne, 'le re-controle passe AVANT tout envoi');
vu(/bjVol\.ouverte = 0; bjVol\.carte \+= 1; \}/.test(bloc) && /bjVol\.carte \+= 1; const id = bjVol\.carte;/.test(bloc) && /const fini = \(txt\) => \{ if \(id !== bjVol\.carte\) return;/.test(bloc), 'une carte expiree change d id ; sa fin ne libere pas la carte courante');
vu(/const f = passLu \? tirerFaceDeRoll\(\) : null; guess = f \? f\.guess : null;/.test(bloc) && /const lp = await lirePassSur\(contrat, c\), passLu = lp\.ok;/.test(bloc) && !/adresseTicket/.test(app.slice(app.indexOf('async function bjTour()'), app.indexOf('const BJ_TITRES'))), 'le roll du brain tire une face neuve (plus la face du ticket)');

/* la carte Skin market */
const sk = app.slice(app.indexOf('async function peindreSkinsJeu()'), app.indexOf('/* ⛔ 2026-10-18 (Phil : « tous les skins a 10 dollars ») : le prix d une skin'));
vu(/Auctions in progress — current bid and time left:/.test(sk), 'Skin market : les encheres en cours, a part');
vu(/Your skins — sell at a price, or start an auction/.test(sk) && /bcLigneSkin\(s, moi, t\)/.test(sk), 'Skin market : les skins du wallet, par bcLigneSkin');
/* 2026-10-23 : le formulaire de vente est partage (bcFormVendreSkin) entre bcLigneSkin et la section Skins de l onglet Market */
vu(/if \(acts\.includes\('METTRE_EN_VENTE'\)\) li\.append\(bcFormVendreSkin\(s, 'Sell at a price'\)\);/.test(app)
  && /text: texteVente \}\), be = bcEl\('button', \{ type: 'button', cls: 'bouton sec', text: 'Start an auction' \}\)/.test(app), 'bcLigneSkin : « Sell at a price » et « Start an auction »');
vu(/highest bid ' \+ bcMontantSkin\(s\.offre, s\.devise\)/.test(app) && /ends in ' \+ bcDureeSkin\(s\.fin - t\)/.test(app), 'une enchere en cours dit son offre et son temps restant');
vu(/const zs = \$\('#skinBrain'\);/.test(bloc), 'la proposition du brain (bid / buy) s affiche dans la carte Skin market');
/* ── DUELS dans « Let the brain play » (2026-10-18) ── */
for (const id of ['bjDuels', 'bjMaxDuel', 'bjDuelsLab', 'bjMaxDuelLab']) vu(app.split('id="' + id + '"').length === 2, 'element #' + id + ' present une fois');
vu(/<label id="bjDuelsLab" hidden><input type="checkbox" id="bjDuels"> Duels<\/label>/.test(app) && /<label class="champ" id="bjMaxDuelLab" hidden>Max duel stake \(USDC\)<input id="bjMaxDuel"/.test(app), 'la case Duels et la mise max existent, CACHEES tant que le contrat n est pas servi');
vu(/for \(const id of \['#bjDuelsLab', '#bjMaxDuelLab'\]\) \{ const x = \$\(id\); if \(x\) x\.hidden = !on; \}/.test(app), 'peindreDuels les montre seulement avec un contrat servi');
vu(/const duels = \$\('#bjDuels'\)\.checked && !\$\('#bjDuelsLab'\)\.hidden/.test(bloc), 'une case Duels cachee (cochee par un vieux reglage) ne compte pas');
vu(/duels: bj\.duels, maxDuelStakeUsdc: bj\.maxDuel[,}]/.test(bloc) && /history: bj\.history, seen: bj\.seen, rolls, missions, skins, duels(, pot)? \}\);/.test(bloc), 'le module recoit la regle duels, la mise max et les duels lus');
vu(/const f = tirerFaceDeRoll\(\); guessD = f \? f\.guess : null;/.test(bloc) && /duels = \{ contract: cd, usdc: USDC_BASE, guess: guessD, expiresIn: 3600, block: tete, list: duelsDe\(jd\), open: Duels\.duelsOuverts\(jd\) \}/.test(bloc), 'le duel du brain joue une face NEUVE ; la tete est relue ; la liste vient de /api/duels ; open = duelsOuverts (2026-10-24)');
vu(/!\/\^\(ROLL\|SETTLE\|DUEL_SETTLE\|DUEL_CREATE\|POT_CLOSE\|POT_SIGN\|POT_FUND\):\/\.test\(p\.cle\)/.test(bloc) && /if \(p\.kind === 'DUEL_SETTLE'\) \{ bj\.seen\.push\(p\.cle\);/.test(bloc), 'un settle de duel n entre dans seen qu apres confirmation');
vu((bloc.match(/bcSigner\(/g) || []).length === 1, 'toujours UN seul bcSigner dans la boucle (les duels passent par le meme Sign)');
/* bjRefusAuSigne EXECUTE (extrait de app.html, evalue avec un etat factice) : les couts des duels sont relus AU SIGNE */
const srcRefus = rs.replace(/\/\*[\s\S]*?\*\//g, '');
const fabrique = (code) => new Function('bj', 'bjVol', 'compte', 'usdcTexte', code + '\nreturn bjRefusAuSigne;');
const W = '0x' + '1'.repeat(40), maintenantS = Math.floor(Date.now() / 1000);
const etatBj = (x = {}) => ({ on: true, budget: '10000000', depense: '0', maxH: 6, maxDuel: '1000000', duels: true, history: [], ...x });
/* 2026-10-24 (revue rolls-duels-ui) : le Sign passe lu.duelsOuverts (bjDuelsRelus) ; ces lignes testent la MISE et l heure, duels ouverts.
 *   La garde d ouverture elle-meme : test-duels-gate-fix2-20261024.mjs */
const refusDe = (code, p, x = {}) => fabrique(code)(etatBj(x), { carte: 3 }, W, (v) => String(v))(3, p, W, { duelsOuverts: true });
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
/* ══ « Manage the reward pot » (2026-10-18, Phil : « gere la pool pour les rewards, le brain qui s en occupe ») ══ */
for (const id of ['bjPot', 'bjPotLab', 'bjPotBudget', 'bjPotBudgetLab']) vu(app.split('id="' + id + '"').length === 2, 'element #' + id + ' present une fois');
vu(/<label id="bjPotLab" hidden><input type="checkbox" id="bjPot"> Manage the reward pot<\/label>/.test(app) && /<label class="champ" id="bjPotBudgetLab" hidden>Daily reward budget \(USDC\)<input id="bjPotBudget"/.test(app), 'la case « Manage the reward pot » et le budget journalier existent, CACHES par defaut');
const pj = app.slice(app.indexOf('function peindrePotJour('), app.indexOf('async function fondPot()'));
vu(/const proprio = !!\(tp && tp\.veille && c && \/\^0x\[0-9a-f\]\{40\}\$\/\.test\(String\(tp\.veille\.owner\)\) && String\(tp\.veille\.owner\) === String\(c\)\.toLowerCase\(\)\);/.test(pj)
  && /if \(\$\('#bjPotBudgetLab'\)\) \$\('#bjPotBudgetLab'\)\.hidden = !proprio;/.test(pj) && /if \(\$\('#bjPotLab'\)\) \$\('#bjPotLab'\)\.hidden = !\(proprio \|\| verifPot\);/.test(pj), 'budget montre SEULEMENT a l owner servi ; la case a l owner ou au verifier servis (/api/tirage.ticketpot.veille)');
vu(/const pot = \$\('#bjPot'\)\.checked && !\$\('#bjPotLab'\)\.hidden/.test(bloc), 'une case pot cachee (cochee par un vieux reglage) ne compte pas');
vu(/rules: \{[^}]*pot: bj\.pot, potDailyUsdc: bj\.potBudget \}/.test(bloc) && /history: bj\.history, seen: bj\.seen, rolls, missions, skins, duels, pot \}\);/.test(bloc), 'le module recoit la regle pot, le budget journalier et le pot lu');
vu(/pot = \{ contract: String\(tp\.contrat\)\.toLowerCase\(\), usdc: USDC_BASE, owner: v \? v\.owner : null, veille: v, sharesDay, sharesWeek,\s+today: \{ day: jourAuj,/.test(bloc)
  && /if \(bjDernierJour\(v\.day\)\) sharesWeek = await lireParts\(true\);/.test(bloc), 'le pot lu : owner et veille servis, parts du jour, et de la semaine le dernier jour');
vu(/import \{ prochaineProposition as bjProposition, dernierJourDeSemaine as bjDernierJour \} from '\.\/brain-jeu\.js';/.test(app), 'app.html importe dernierJourDeSemaine');
/* POT_SIGN : signature de MESSAGE par le wallet connecte = verifier, deposee comme attester-ticketpot.html ; sinon le lien, pas un bouton mort */
const sp = app.slice(app.indexOf('async function bjSignerParts('), app.indexOf('const BJ_TITRES'));
vu(sp.length > 400 && /method: 'eth_signTypedData_v4', params: \[walletCarte, JSON\.stringify\(s\.donnees\)\]/.test(sp), 'POT_SIGN : eth_signTypedData_v4 des donnees servies, par le wallet de la carte');
vu(/fetch\('\/api\/ticketpot\/signature', \{ method: 'POST', headers: \{ 'content-type': 'application\/json' \}, body: JSON\.stringify\(\{ day: p\.sign\.jourId, wallet: s\.wallet, signature: sig, week: p\.sign\.week \}\) \}\)/.test(sp), 'POT_SIGN : chaque signature POSTee sur /api/ticketpot/signature (day, wallet, signature, week) comme la page verifier');
vu(/if \(!r \|\| !r\.ok\) \{/.test(sp) && /catch \(e\) \{ bcEtape\(m, 'Declined in your wallet/.test(sp), 'un refus du wallet ou du serveur ARRETE la serie (rien de plus)');
vu(!/eth_sendTransaction|wallet_sendCalls|bcSigner\(/.test(sp), 'signer les parts n envoie AUCUNE transaction');
vu(/if \(p\.kind === 'POT_SIGN' && !p\.sign\.signerIsVerifier\) \{/.test(bloc) && /'Switch to the verifier wallet ' \+ p\.sign\.verifier\.slice\(0, 6\) \+ '… to sign the shares/.test(bloc)
  && /attester-ticketpot\.html\?day=' \+ encodeURIComponent\(p\.sign\.jourId\) \+ \(p\.sign\.week \? '&week=1' : ''\)/.test(bloc), 'pas le verifier : la carte le dit (verifier LU, jamais tape) et ouvre la page verifier — aucun Sign mort');
vu(/if \(p\.kind === 'POT_SIGN'\) \{\n      const s = await bjSignerParts\(m, p, walletCarte\);/.test(bloc), 'le Sign de POT_SIGN signe les parts (pas de bcSigner)');
vu((bloc.match(/bcSigner\(/g) || []).length === 1, 'toujours UN seul bcSigner (close et fund passent par le meme Sign)');
const att = readFileSync(new URL('./attester-ticketpot.html', import.meta.url), 'utf8');
vu(/\$\('#semaine'\)\.checked = new URLSearchParams\(location\.search\)\.get\('week'\) === '1';/.test(att), 'la page verifier ouvre le mode semaine avec ?week=1');
/* au Sign : pot toujours coche, owner toujours le wallet, budget journalier, solde relu */
const jour = Math.floor(Date.now() / 86400000);
const refusPot = (code, p, x = {}, lu = {}) => fabrique(code)(etatBj({ pot: true, potBudget: '2000000', ...x }), { carte: 3 }, W, (v) => String(v))(3, p, W, { owner: W, verifier: W, solde: '9000000', dayPot: '0', ...lu });
const fund = (c = '2000000', d = jour) => ({ kind: 'POT_FUND', costUsdc: c, day: d });
vu(refusPot(srcRefus, fund()) === null, 'au Sign : un fund au budget du jour, owner, solde suffisant -> passe');
vu(refusPot(srcRefus, fund(), { depense: '10000000' }) === null, 'au Sign : le fund du pot ne compte PAS sur le budget de jeu (son budget a lui)');
vu(/not ticked/.test(String(refusPot(srcRefus, fund(), { pot: false }))), 'au Sign : pot decoche entre-temps -> REFUSE');
vu(/owner/.test(String(refusPot(srcRefus, fund(), {}, { owner: '0x' + '2'.repeat(40) }))) && /owner/.test(String(refusPot(srcRefus, { kind: 'POT_CLOSE', costUsdc: '0' }, {}, { owner: null }))), 'au Sign : owner change ou non lu -> REFUSE (close aussi)');
vu(/daily reward budget/.test(String(refusPot(srcRefus, fund('2000001')))), 'au Sign : au-dessus du budget du jour -> REFUSE');
vu(/daily reward budget/.test(String(refusPot(srcRefus, fund('1000000'), { history: [{ t: Math.floor(Date.now() / 1000) - 60, kind: 'POT_FUND', day: jour, usdc: '1500000' }] }))), 'au Sign : deja verse aujourd hui + ce fund > budget -> REFUSE');
vu(/holds/.test(String(refusPot(srcRefus, fund(), {}, { solde: '1999999' }))) && /balance/.test(String(refusPot(srcRefus, fund(), {}, { solde: null }))), 'au Sign : solde relu trop bas, ou non lu -> REFUSE');
vu(/day changed/.test(String(refusPot(srcRefus, fund('2000000', jour - 1)))), 'au Sign : le jour a change depuis la proposition -> REFUSE');
vu(refusPot(srcRefus, { kind: 'POT_SIGN', costUsdc: '0', sign: { verifier: W } }) === null, 'au Sign : POT_SIGN par le wallet verifier passe le re-controle');
vu(/not the verifier/.test(String(refusPot(srcRefus, { kind: 'POT_SIGN', costUsdc: '0', sign: { verifier: '0x' + '3'.repeat(40) } }))) && /not the verifier/.test(String(refusPot(srcRefus, { kind: 'POT_SIGN', costUsdc: '0' }))), 'au Sign : POT_SIGN par un wallet qui n est pas le verifier -> REFUSE');
vu(refusDe(srcRefus, { kind: 'DUEL_JOIN', costUsdc: '1000000' }) === null, 'les duels passent toujours (le 4e argument est optionnel)');
const sansLignePot = (motif) => { vu(srcRefus.split(motif).length === 2, 'mutant pot au Sign : le motif existe une fois'); return srcRefus.replace(motif, 'if (false)'); };
vu(refusPot(sansLignePot("if (!lu.owner || String(lu.owner).toLowerCase() !== walletCarte)"), fund(), {}, { owner: '0x' + '2'.repeat(40) }) === null, 'MUTANT owner au Sign retire : un non-owner PASSERAIT — l assertion ROUGIT');
vu(refusPot(sansLignePot('if (dejaLu + BigInt(p.costUsdc) > BigInt(bj.potBudget) || verse + BigInt(p.costUsdc) > BigInt(bj.potBudget))'), fund('2000001')) === null, 'MUTANT budget du pot au Sign retire : le fund trop gros PASSERAIT — l assertion ROUGIT');
vu(refusPot(sansLignePot('if (BigInt(lu.solde) < BigInt(p.costUsdc))'), fund(), {}, { solde: '1999999' }) === null, 'MUTANT solde au Sign retire : le fund au-dessus du solde PASSERAIT — l assertion ROUGIT');
vu(/if \(\/\^POT_\/\.test\(p\.kind\)\) \{ const tf = await bjTirageFrais\(\); lu = \{ owner:/.test(bloc) && /solde: p\.kind === 'POT_FUND' \? await bcSolde\(USDC_BASE, walletCarte\)/.test(bloc), 'au Sign d un coup de pot : owner et solde RELUS juste avant');
vu(/bj\.history = bjCouper\(bj\.history\)/.test(bloc) && /function bjCouper\(h\)/.test(bloc), 'l historique garde les funds du pot meme apres 100 rolls (sinon le budget du jour se rouvrirait)');
console.log('ok brain-jeu-app - ' + n + ' assertions');
