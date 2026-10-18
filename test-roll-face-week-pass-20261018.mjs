/* test-roll-face-week-pass-20261018.mjs - DEUX DECISIONS DE PHIL (2026-10-18) : (A) CHAQUE ROLL TIRE UNE NOUVELLE FACE AU HASARD ; (B) LE
 *   PASS DEVIENT UN « WEEK PASS ».
 * AFFIRME :
 *   (1) pur : faceDeRoll(20 octets) = { adresse, apparence = apparenceDepuisAdresse(adresse), guess = guessDepuisApparence(apparence) } ;
 *       autre chose que 20 octets -> null ; tirerFaceDeRoll demande 20 octets a son alea (par defaut crypto.getRandomValues) ; 64 tirages
 *       reels donnent plus d une face (pas une constante) ;
 *   (2) pur : passesAchetes lit (tx, joueur, jour du BLOC = topic `day` du contrat) des PassBought du contrat donne ; autre contrat, Rolled,
 *       topic day absent, donnee de mauvaise taille : ignores ; deux fois le meme log : une entree ;
 *   (3) pur : crediterPassSemaine donne les 7 jours UTC a partir du jour du bloc (joursPassSemaine), fusionne sans doublon, et pose
 *       bonusSemaine[semaine du jour du bloc][wallet] = 3 (= et pas += : un 2e pass la meme semaine ne cumule pas) ; entree illisible ->
 *       etat inchange ; l entree n est pas modifiee ; ticketsJour reste a UN ticket par jour ;
 *   (4) pur : entreesPeriode(..., bonus) ajoute n entrees BONUS par wallet (n entier, plafonne a 3, adresse valide) ; sans bonus : inchange ;
 *   (5) serveur (source) : crediterVolumeRolls lit passesAchetes sur les MEMES logs, exclut les internes, credite par crediterPassSemaine ;
 *       corpsTirage passe le bonus de la semaine a l entree de la SEMAINE seulement (pas au mois) ;
 *   (6) app (source) : #jourFace = « Your roll » ; la face du ticket est petite, a part (#ticketFace, « Your ticket ») et peindreJour ne
 *       touche plus #jourFace ; roll(), rollPaye, autoRollAvecPass et le roll du Chat tirent une face neuve (tirerFaceDeRoll / nouvelleFaceRoll)
 *       et jouent SON guess (plus adresseTicket) ; le lot avec pass tire une face PAR roll ; l apercu live re-verifie rollEnCours apres son
 *       await ; le bouton dit « Week pass · <prix servi> USDC » et sa confirmation dit 7 jours, 3 entrees bonus et les rolls 24 h en plus.
 * NE PROUVE PAS : un achat de pass reel, ni le rendu au navigateur. */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { faceDeRoll, tirerFaceDeRoll, guessDepuisApparence } from './rolls-jeu.js';
import { apparenceDepuisAdresse } from './apparence.js';
import { passesAchetes, TOPIC_PASS, TOPIC_ROLLED } from './volume-rolls.js';
import { joursPassSemaine, crediterPassSemaine, entreesPeriode, ticketsJour, joursEntre, saisonDe, JOURS_PASS_SEMAINE, BONUS_PASS_SEMAINE, JOUR_MS } from './tirage-saison.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };

/* (1) */
const oct = Uint8Array.from({ length: 20 }, (_, i) => (i * 37 + 11) & 255);
const f = faceDeRoll(oct);
const adr = '0x' + [...oct].map((b) => b.toString(16).padStart(2, '0')).join('');
vu(f && f.adresse === adr && JSON.stringify(f.apparence) === JSON.stringify(apparenceDepuisAdresse(adr)) && JSON.stringify(f.guess) === JSON.stringify(guessDepuisApparence(apparenceDepuisAdresse(adr))) && f.guess.length === 5, 'faceDeRoll = adresse des 20 octets -> apparence -> guess');
vu(faceDeRoll(new Uint8Array(19)) === null && faceDeRoll(new Uint8Array(32)) === null && faceDeRoll([1, 2]) === null && faceDeRoll(null) === null, 'pas 20 octets : null');
let demande = null;
const g = tirerFaceDeRoll((k) => { demande = k; return oct; });
vu(demande === 20 && g && g.adresse === adr, 'tirerFaceDeRoll demande 20 octets a son alea');
const vus = new Set(Array.from({ length: 64 }, () => JSON.stringify(tirerFaceDeRoll().guess)));
vu(vus.size > 1, '64 tirages crypto.getRandomValues : ' + vus.size + ' guesses distincts (pas une constante)');
const RJ = readFileSync(new URL('./rolls-jeu.js', import.meta.url), 'utf8');
vu(/crypto\.getRandomValues\(new Uint8Array\(k\)\)/.test(RJ) && !/Math\.random/.test(RJ), 'alea par defaut = crypto.getRandomValues, jamais Math.random');

/* (2) */
const C = '0x0c5b490196f06db40ab8af68ecb2313029460fe9', J = '0x' + 'ab'.repeat(20), K = '0x' + 'cd'.repeat(20);
const w = (x) => BigInt(x).toString(16).padStart(64, '0'), t = (a) => '0x' + a.slice(2).padStart(64, '0');
const H1 = '0x' + '11'.repeat(32), H2 = '0x' + '22'.repeat(32);
const JOUR = Math.floor(Date.UTC(2026, 9, 18) / JOUR_MS); /* dimanche 2026-10-18 = 20744 */
const pass = (h, joueur, day) => ({ address: C, transactionHash: h, topics: [TOPIC_PASS, t(joueur), '0x' + w(day)], data: '0x' + [30, 1792300000, 10000000, 5000000].map(w).join('') });
const p = passesAchetes([pass(H1, J, JOUR), pass(H1, J, JOUR), pass(H2, K, JOUR + 1)], C);
vu(p.length === 2 && p[0].tx === H1 && p[0].joueur === J && p[0].jour === JOUR && p[1].joueur === K && p[1].jour === JOUR + 1, 'PassBought -> (tx, joueur, jour du bloc) ; meme log deux fois = une entree');
vu(passesAchetes([{ ...pass(H1, J, JOUR), address: '0x' + '99'.repeat(20) }], C).length === 0, 'autre contrat : ignore');
vu(passesAchetes([{ ...pass(H1, J, JOUR), topics: [TOPIC_ROLLED, t(J), '0x' + w(JOUR)] }], C).length === 0, 'un Rolled n est pas un pass');
vu(passesAchetes([{ ...pass(H1, J, JOUR), topics: [TOPIC_PASS, t(J)] }], C).length === 0 && passesAchetes([{ ...pass(H1, J, JOUR), data: '0x' + w(1) }], C).length === 0, 'topic day absent ou donnee courte : ignore');

/* (3) */
const ids = joursPassSemaine(JOUR);
vu(JOURS_PASS_SEMAINE === 7 && BONUS_PASS_SEMAINE === 3 && ids.length === 7 && ids[0] === 'J2026-10-18' && ids[6] === 'J2026-10-24', '7 jours UTC a partir du jour du bloc (' + ids[0] + ' .. ' + ids[6] + ')');
const avant = { passes: { [J]: ['J2026-10-17', 'J2026-10-18'] }, bonusSemaine: {} };
const gel = JSON.stringify(avant);
const e1 = crediterPassSemaine(avant, { joueur: J, jour: JOUR });
const S = saisonDe(JOUR * JOUR_MS).id;
vu(JSON.stringify(avant) === gel, 'l etat d entree n est pas modifie (pur)');
vu(e1.passes[J].length === 8 && e1.passes[J][0] === 'J2026-10-17' && e1.passes[J].includes('J2026-10-24') && new Set(e1.passes[J]).size === 8, 'fusion sans doublon (le 17 garde, 18..24 ajoutes)');
vu(S === 'S0' && e1.bonusSemaine.S0[J] === 3, '3 entrees bonus dans la semaine du jour du bloc (' + S + ')');
const e2 = crediterPassSemaine(e1, { joueur: J, jour: JOUR + 1 });
vu(e2.bonusSemaine.S1 && e2.bonusSemaine.S1[J] === 3 && e2.bonusSemaine.S0[J] === 3, 'un pass achete le lendemain (S1) : bonus de S1, S0 garde');
const e3 = crediterPassSemaine(e1, { joueur: J, jour: JOUR });
vu(JSON.stringify(e3) === JSON.stringify(e1), 'le meme credit deux fois : identique (bonus = 3, pas 6)');
vu(crediterPassSemaine(e1, { joueur: '0x12', jour: JOUR }) === e1 && crediterPassSemaine(e1, { joueur: J, jour: 1.5 }) === e1 && crediterPassSemaine(e1, { joueur: J, jour: -1 }) === e1, 'joueur ou jour illisible : etat inchange');
const vide = crediterPassSemaine(undefined, { joueur: K, jour: JOUR });
vu(vide.passes[K].length === 7 && vide.bonusSemaine.S0[K] === 3, 'depuis un etat vide');
vu(JSON.stringify(ticketsJour({}, 'J2026-10-20', e1.passes)) === JSON.stringify([J]) && ticketsJour({ 'J2026-10-20': { [J]: { usd: 50, hashes: [] } } }, 'J2026-10-20', e1.passes).length === 1, 'un ticket par jour au plus (pass + volume = 1)');

/* (4) */
const semaine = joursEntre(saisonDe(JOUR * JOUR_MS).debut, saisonDe(JOUR * JOUR_MS).fin);
const base = entreesPeriode({}, semaine, 10, e1.passes);
vu(base.length === 2 && JSON.stringify(entreesPeriode({}, semaine, 10, e1.passes, {})) === JSON.stringify(base), 'sans bonus : inchange (17 + 18 dans S0)');
const avecB = entreesPeriode({}, semaine, 10, e1.passes, e1.bonusSemaine.S0);
vu(avecB.length === 5 && avecB.filter((e) => e.bonus).length === 3 && avecB.every((e) => e.adresse === J), 'S0 : 2 jours + 3 entrees bonus = 5');
vu(entreesPeriode({}, semaine, 10, {}, { [K]: 3 }).length === 3, 'le bonus compte meme sans jour qualifie dans la semaine');
vu(entreesPeriode({}, semaine, 10, {}, { [K]: 99, '0x12': 3, [J]: 1.5 }).length === 3, 'bonus plafonne a 3 ; adresse ou nombre illisible : ignore');
const tri = entreesPeriode({}, semaine, 10, e1.passes, { ...e1.bonusSemaine.S0, [K]: 3 });
vu(JSON.stringify(tri) === JSON.stringify(entreesPeriode({}, semaine, 10, e1.passes, { [K]: 3, ...e1.bonusSemaine.S0 })), 'ordre des entrees independant de l ordre du bonus (rejouable)');

/* (5) serveur */
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const f0 = srv.indexOf('async function crediterVolumeRolls()'), f1 = srv.indexOf('setInterval(() => { void crediterVolumeRolls(); }');
const fv = srv.slice(f0, f1);
vu(f0 > 0 && /for \(const pa of passesAchetes\(logs, contrat\)\)/.test(fv) && /if \(internes\.has\(pa\.joueur\)\) continue;/.test(fv) && /crediterPassSemaine\(\{ passes: revenu\.passes \|\| \{\}, bonusSemaine: revenu\.bonusSemaine \|\| \{\} \}, pa\)/.test(fv), 'crediterVolumeRolls : PassBought des memes logs, internes exclus, crediterPassSemaine');
vu(/revenu\.passes = cp\.passes; revenu\.bonusSemaine = cp\.bonusSemaine;/.test(fv), 'le credit est ecrit dans revenu.passes et revenu.bonusSemaine');
const ct = srv.slice(srv.indexOf('function corpsTirage()'), srv.indexOf("regle: 'A day counts"));
vu(/const eS = entreesPeriode\(jours, joursEntre\(s\.debut, s\.fin\), SEUIL_VOLUME_JOUR_USD, passes, \(revenu\.bonusSemaine \|\| \{\}\)\[s\.id\] \|\| \{\}\)/.test(ct), 'le bonus de LA semaine va a l entree de la semaine');
vu(/eM = entreesPeriode\(jours, joursEntre\(mo\.debut, mo\.fin\), SEUIL_VOLUME_JOUR_USD, passes\)/.test(ct), 'le mois ne recoit pas le bonus');

/* (6) app */
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const sansCom = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
const carte = sansCom(app.slice(app.indexOf('id="tirCarte"'), app.indexOf('id="missionsCarte"')));
vu(/<div class="jourFace" id="jourFace"[^>]*aria-label="Your roll"/.test(carte) && /id="jourRollTxt"[^>]*>Your roll/.test(carte), '#jourFace = « Your roll » (a gauche, contre la face du bloc)');
vu(/<div class="jourFace mini" id="ticketFace"[^>]*aria-label="Your ticket for today"/.test(carte) && /Your ticket/.test(carte) && /\.jourFace\.mini\{/.test(app), 'la face du ticket est petite et a part (#ticketFace)');
vu(/import \{[^}]*\btirerFaceDeRoll\b[^}]*\} from '\.\/rolls-jeu\.js';/.test(app), 'app importe tirerFaceDeRoll');
const fn = (a, b) => sansCom(app.slice(app.indexOf(a), app.indexOf(b)));
const pj = fn('async function peindreJour(', 'async function peindreDernierBlock(');
vu(/\$\('#ticketFace'\)/.test(pj) && !/#jourFace/.test(pj), 'peindreJour peint #ticketFace, plus #jourFace');
const nf = fn('function peindreFaceRoll(', 'async function rollPaye()');
vu(/tirerFaceDeRoll\(\)/.test(nf) && /\$\('#jourFace'\)/.test(nf) && /paramsLogoDepuisApparence\(f\.apparence/.test(nf), 'nouvelleFaceRoll tire et peint la face du roll sur #jourFace');
const rp = fn('async function rollPaye()', 'async function passPaye()');
vu(/const fr0 = nouvelleFaceRoll\(\);/.test(rp) && /const guess = fr0\.guess;/.test(rp) && !/adresseTicket/.test(rp) && rp.indexOf('rollEnCours = true') < rp.indexOf('envoyerAppels('), 'roll paye : guess = la face neuve, rollEnCours pose AVANT la signature');
/* integration 2026-10-18 : le lot reel est autoRollLot (pass OU payant, structure de la branche principale) — meme exigence */
const arp = fn('async function autoRollLot(', '/* ── petits outils partages');
vu(/const faces = Array\.from\(\{ length: n \}, \(\) => \{ try \{ return tirerFaceDeRoll\(\); \}/.test(arp) && /const guesses = faces\.map\(\(x\) => x\.guess\);/.test(arp) && !/adresseTicket/.test(arp)
  && arp.indexOf('rollEnCours = true') > 0 && arp.indexOf('rollEnCours = true') < arp.indexOf('envoyerAppels('), 'lot (pass ou payant) : UNE face neuve par roll, ecran tenu AVANT la signature');
const ro = fn('async function roll()', 'const rollDerniers = []');
vu(/nouvelleFaceRoll\(\)/.test(ro) && /scoreFaces\(fRoll\.apparence, fr\)/.test(ro) && !/adresseTicket/.test(ro), 'roll practice : score de la face neuve contre le bloc');
const bc = fn('async function bcCommandeRoll(', 'function bcCommandePostTask(');
vu(/faces = Array\.from\(\{ length: n \}, \(\) => tirerFaceDeRoll\(\)\);/.test(bc) && /guesses = faces\.map\(\(x\) => x\.guess\)/.test(bc) && !/adresseTicket/.test(bc), 'roll du Chat : une face neuve par roll');
const pd = fn('async function peindreDernierBlock(', 'let rollsCfg = null;');
const iAw = pd.indexOf('await adresseTicket('), iRe = pd.indexOf('if (rollEnCours) return;', iAw);
vu(iAw > 0 && iRe > iAw, 'apercu live : rollEnCours re-verifie apres l await (ne peut pas ecraser un roll commence entre-temps)');
const pb = fn('function poserBoutonsRolls(', 'async function envoyerAppels(');
vu(/bd\.textContent = 'Week pass · ' \+ usdcTexte\(rollsCfg\.prixPass\) \+ ' USDC';/.test(pb) && !/Day pass/.test(pb), 'bouton « Week pass · <prix servi> USDC »');
const pp = fn('async function passPaye()', "$('#jourRollPaye').addEventListener");
vu(/Week pass/.test(pp) && /7 UTC days/.test(pp) && /3 bonus entries/.test(pp) && /rollsCfg\.passRolls \+ ' rolls for 24 h /.test(pp) && /practice season, no prize yet/.test(pp), 'confirmation : 7 jours, 3 bonus, rolls 24 h en plus, draws en practice');
vu(!/Day pass/.test(sansCom(app.slice(app.indexOf('id="tirCarte"'), app.indexOf("$('#jourAuto').addEventListener")))), 'plus aucun « Day pass » servi');
console.log('ok roll-face + week-pass - ' + n + ' assertions ; NE PROUVE PAS un achat reel ni le rendu');
