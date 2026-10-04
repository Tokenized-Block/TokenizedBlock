/* test-panneau-finitions-20261004.mjs — LE PANNEAU DE COMMANDE, FINITIONS (retour de Phil du 2026-10-04).
 *
 * Ce que Phil a vu : « Market on chain: not read yet » sur IB022 pendant que son cerveau battait ; le titre « 0xb200…579e » au lieu du
 * nom ; un onglet Trade fait de listes vides ; deux bandes claires autour du visage ; des pre-commandes a verifier une par une.
 *
 * A. rails-api.js (hors reseau, faux noeud) : la vente d une action dont le seul marche est une pool Aerodrome est refusee EN CLAIR ;
 *    une action sans pool Aerodrome garde le refus de lecture (temoin negatif) ; ACTION>ETH dit « for USDC only ».
 * B. commandes-panel.js : la pre-commande « Sell a stock » nomme une action qui a une pool v4 USDC LUE et PAS de pool Aerodrome
 *    (l ancienne, AMDc, menait a un refus — mesure sur le planificateur de prod).
 * C. app.html : le jumeau qui relit le marche ECRIT `brainMarche` ; l instantane rend l etat mesure hors carte ; le repli serveur ;
 *    nom et symbole lus sur la chaine ; l adresse B20 entiere ; le ticket ; la vente par defaut contre la cotation LUE ; le visage
 *    au ratio de son dessin ; les raisons de la porte du cerveau traduites — et chaque raison traduite EXISTE dans brain-tasks.js.
 * D. serveur-web.js : /api/marche/ (bornes, cache des seuls faits mesures) ; /sante.build lit TOUT le fichier ; la sonde d echange
 *    simule depuis une adresse qui detient de l ETH.
 * E. MUTANTS (sur des copies) : chaque garde rougit quand on la retire.
 * ⛔ BORNE : rien ici ne prouve une signature, ni ce que le panneau affiche dans un vrai navigateur (verifie a la main, hors test). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f, dir = ICI) => import(pathToFileURL(path.join(dir, f)).href + '?v=' + Math.random());
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const lire = (f) => fs.readFileSync(path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');

const { ACTIONS_COINBASE, DEVISES_BASE } = await imp('paires.js');
const { POOLS_ACTIONS_AERODROME } = await imp('pools-actions-aerodrome.js');
const { LOGS_INITIALIZE_ACTIONS } = await imp('cles-v4-actions.js');
const usdc = DEVISES_BASE.find((d) => d.symbole === 'USDC' && d.chaines.includes(8453)).adr.toLowerCase();
const adrDe = (sym) => String(ACTIONS_COINBASE.find((a) => a.symbole === sym).adr).toLowerCase();
const COMPTE = '0x00000000000000000000000000000000c0ffee77';

console.log('— A. rails-api.js : les refus de vente d action se lisent');
/* faux noeud : toute lecture rend des zeros (aucune pool initialisee nulle part) ; il COMPTE ses appels */
async function refusVente(dir, sym, vers) {
  const R = await imp('rails-api.js', dir);
  let appels = 0;
  const rpc = async (m) => { appels += 1; if (m === 'eth_blockNumber') return '0x1'; return '0x' + '0'.repeat(64 * 8); };
  const r = await R.planRail({ de: adrDe(sym), vers, montant: '1000000', compte: COMPTE }, { rpc, clesDe: async () => [] });
  return { r, appels };
}
const aero = [...POOLS_ACTIONS_AERODROME.keys()].map((k) => String(k).toLowerCase());
const symAero = ACTIONS_COINBASE.find((a) => aero.includes(String(a.adr).toLowerCase())).symbole;
const symV4 = ACTIONS_COINBASE.find((a) => !aero.includes(String(a.adr).toLowerCase())).symbole;
{
  /* ⛔ Hors reseau on ne prouve que l AIGUILLAGE (quel batisseur est appele). La vente elle-meme — transactions confirmees, frais,
   *   allowance — est prouvee par banc-vente-aerodrome-fork-20261004.mjs (43/0 sur fork : NVDAc, MSTRc, AAPLc). */
  const { r, appels } = await refusVente(ICI, symAero, usdc);
  ok(r.route === 'ACTION>USDC' && r.via === 'planAerodromeSegment' && r.pool === 'aerodrome' && appels > 0,
    'A vendre ' + symAero + ' (table Aerodrome) contre USDC : aiguille vers le batisseur Aerodrome, qui LIT sa pool (' + appels + ' lecture(s))');
  ok(!/no initialized pool among/.test(String(r.pourquoi)), 'A … et ne cherche plus une pool v4 qui n existe pas (l ancien refus recitait 16 cles)');
  ok(r.etat !== 'PRET', 'A … sur un faux noeud qui ne rend que des zeros, AUCUN plan n est rendu (etat ' + r.etat + ') : pas de pool lue, pas de plan');
  const t = await refusVente(ICI, symV4, usdc);
  ok(t.r.etat !== 'PRET' && t.r.via !== 'planAerodromeSegment', 'A temoin : ' + symV4 + ' (hors table Aerodrome) garde le chemin v4 — le batisseur Aerodrome ne deborde pas');
  const e = await refusVente(ICI, symAero, 'ETH');
  ok(e.r.etat === 'REFUSE' && /a tokenized stock sells here for USDC only/.test(e.r.pourquoi) && e.appels === 0, 'A ACTION>ETH : « sells here for USDC only », sans une seule lecture de chaine');
}

console.log('— B. la pre-commande « Sell a stock » mene a un plan');
const C = await imp('commandes-panel.js');
const pre = C.PRECOMMANDES.find((p) => p.cle === 'sell_stock');
const an = C.analyserCommande(pre.modele);
const v4 = new Set(LOGS_INITIALIZE_ACTIONS.flatMap((l) => [String(l.topics[2]).slice(26).toLowerCase(), String(l.topics[3]).slice(26).toLowerCase()]));
const adrPre = an.ok ? adrDe(an.commande.de).slice(2) : '';
ok(an.ok && an.commande.type === 'swap' && an.commande.vers === 'USDC', 'B le modele « ' + pre.modele + ' » est une vente contre USDC que la grammaire accepte');
ok(an.ok && !aero.includes('0x' + adrPre), 'B son action n est PAS une action a pool Aerodrome seule (vente refusee par le planificateur)');
ok(an.ok && v4.has(adrPre), 'B son action a une pool v4 USDC dont la cle a ete LUE sur la chaine (cles-v4-actions.js)');
ok(C.AIDE_COMMANDES.some((l) => l.includes(pre.modele)), 'B l aide donne le meme exemple que la pre-commande');

console.log('— C. app.html');
const html = lire('app.html');
const iBc = html.indexOf('const bc = { session: null');
const bcSrc = html.slice(iBc, html.indexOf('(function bcDemarrage()', iBc));
const relire = html.slice(html.indexOf('async function relireMarcheBrainSiNonLu() {'), html.indexOf('function battreBrain() {'));
ok(/else if \(String\(brainAdr\)\.toLowerCase\(\) === adrLue\) brainMarche = \{ adr: adrLue, v: marche \};/.test(relire),
  'C la relance du marche ECRIT brainMarche pour un block hors carte (elle nourrissait le cerveau sans que l instantane le sache)');
ok(/const adrLue = String\(brainAdr\)\.toLowerCase\(\);/.test(relire) && /await marchePourBrain\(adrLue\)/.test(relire), 'C … sur l adresse figee avant la lecture (un changement de block en vol ne nourrit pas le suivant)');
ok(/etatVie: h \? h\.etatVie : \(mp && typeof mp\.etat === 'string' \? mp\.etat : null\),/.test(html), 'C l instantane rend l etat MESURE hors carte (NON_TROUVEE / NON_LUE), plus « null »');
const mpb = html.slice(html.indexOf('async function marchePourBrain(adr) {'), html.indexOf('async function relireMarcheBrainSiNonLu() {'));
ok(/m = await vieDuBlock\(\{ rpc, stateView: RESEAUX\[CHAINE\]\.stateView, jeton: a, clesExactes: await clesReellesDe\(a\) \}\);/.test(mpb)
  && mpb.indexOf('vieDuBlock(') < mpb.indexOf("fetch('/api/marche/'"), 'C marchePourBrain : NOTRE lecture d abord, le serveur ensuite');
ok(/if \(d && d\.ok === true && \(d\.etat === 'LUE' \|\| d\.etat === 'NON_TROUVEE'\)\)/.test(mpb) && /return m;\n\}/.test(mpb), 'C … seuls les FAITS MESURES du serveur sont pris ; sinon notre resultat reste tel quel');
ok((html.match(/await marchePourBrain\(/g) || []).length === 2, 'C les DEUX lecteurs du cerveau (selection et relance) passent par marchePourBrain');
ok(/symboleDepuisReponse\(await rpc\('eth_call', \[\{ to: a, data: sel \}, 'latest'\]\), max\)/.test(bcSrc) && /lire\(SEL_NOM_ERC20, 48\)/.test(bcSrc)
  && /if \(nom \|\| sym\) \{ bcNoms\.set\(a, \{ nom, sym \}\); bc\.avatarDe = null; \}/.test(bcSrc), 'C nom et symbole lus sur la chaine, par le decodeur sur ; rien n est retenu si rien n est lu');
ok(/Date\.now\(\) - \(bc\.nomEssai\.get\(a\) \|\| 0\) < 15000/.test(bcSrc), 'C … une lecture ratee se retente au plus toutes les 15 s');
ok(/<button type="button" class="bcAdr" id="bcAdr" hidden/.test(html) && /ad\.textContent = a; ad\.dataset\.adr = a;/.test(bcSrc),
  'C l adresse B20 du block est affichee EN ENTIER sous son nom, jamais abregee');
ok(/navigator\.clipboard\.writeText\(a\)/.test(html.slice(html.indexOf("$('#bcAdr').addEventListener"))), 'C … et se copie d un clic');
ok(/<form class="bcTicket" id="bcTicket"/.test(html) && /id="bcMontant"/.test(html) && /id="bcDevise"/.test(html) && /id="bcPosition"/.test(html) && /id="bcTicketNote"/.test(html),
  'C onglet Trade : le ticket (sens, montant, devise), sa note, et ce que la personne detient');
ok(/await bcExecuterTexte\(bc\.cote === 'buy' \? 'buy this with ' \+ n \+ ' ' \+ d : 'sell ' \+ n \+ ' this for ' \+ d, note\)/.test(html),
  'C le ticket ECRIT la commande de la barre du Chat (meme grammaire, meme porte, meme plan) et recoit le refus dans SA note');
ok(/async function bcExecuterTexte\(texte, note = \$\('#bcNote'\)\) \{/.test(bcSrc), 'C bcExecuterTexte ecrit son refus la ou on le lui dit (un refus du ticket dans la note du Chat serait invisible)');
ok(/vers = bcCotation\(de\.adr\);\n\s+if \(!vers\) return erreur\(/.test(bcSrc) && !/: bcResoudre\('USDC'\); \} else vers = bcResoudre\(c\.vers\);/.test(bcSrc),
  'C « sell <n> <token> » sans devise : la cotation LUE, jamais USDC par defaut ; pas lue = on le dit');
ok(/if \(ACTIONS_PAR_ADR\.has\(a\)\) return bcResoudre\('USDC'\);/.test(bcSrc) && /else choix = q && q\.ok \? \[\[q\.adr === eth \? 'ETH' : q\.adr, 'for ' \+ q\.sym\]\] : \[\['ETH', 'for ETH'\]\];/.test(bcSrc),
  'C le ticket ne propose a la vente que la devise qui aboutit (la cotation du block ; USDC pour une action)');
ok(/else if \(so && so\.block !== null && so\.dec !== null && so\.block > 0n\) for \(const p of \[25n, 50n, 100n\]\) puce\(p \+ ' %', bcDecimal\(so\.block \* p \/ 100n, so\.dec\)\);/.test(bcSrc),
  'C vente : les parts (25/50/100 %) ne s offrent que sur un solde LU et non nul');
ok(/const lire = async \(adr\) => \{ try \{ return await bcSolde\(adr, moi\); \} catch \(_\) \{ return null; \} \};/.test(bcSrc) && /brut === null \|\| dec === null \? 'not read'/.test(bcSrc),
  'C un solde non lu vaut null et s affiche « not read », jamais 0');
ok(/\.bcAvatar\{[^}]*aspect-ratio:200\/220/.test(html) && /\.bcMini\{[^}]*aspect-ratio:200\/220/.test(html) && /\.bcSkinFace\{[^}]*aspect-ratio:200\/220/.test(html),
  'C les trois cadres du visage ont le ratio du dessin (200×220) : plus de bandes sur les cotes');
ok(/dedans\.querySelector\('svg rect\[width="200"\]\[height="220"\]'\)/.test(bcSrc) && /cadre\.style\.setProperty\('--bcFond', fond\); else cadre\.style\.removeProperty\('--bcFond'\);/.test(bcSrc),
  'C le decor du panneau prend la couleur de fond LUE dans le visage rendu ; illisible = decor neutre');
/* bcDecimal : extrait du source et execute — c est lui qui ecrit « 100 % de mon solde » */
const srcDec = (bcSrc.match(/const bcDecimal = (\(brut, dec\) => \{[^\n]+\});\n/) || [])[1];
const bcDecimal = srcDec ? new Function('return ' + srcDec)() : null;
ok(!!bcDecimal && bcDecimal(123456789n, 8) === '1.23456789' && bcDecimal(10n ** 18n, 18) === '1' && bcDecimal(1n, 18) === '0.000000000000000001' && bcDecimal(0n, 6) === '0' && bcDecimal(1500000n, 6) === '1.5' && bcDecimal(7n, 0) === '7',
  'C bcDecimal rend le montant EXACT (aucune decimale perdue, aucun zero de trop)');
ok(!!bcDecimal && C.enUnitesBrutes(bcDecimal(987654321987654321n, 18), 18) === 987654321987654321n, 'C … et ce montant relu par la grammaire redonne le solde brut au wei pres');
/* les raisons traduites : chacune doit EXISTER dans brain-tasks.js, sinon la traduction ne sert plus et personne ne le voit */
const taches = lire('brain-tasks.js');
const raisons = [...(bcSrc.match(/const BC_RAISONS = new Map\(\[\n([\s\S]*?)\n\]\);/) || ['', ''])[1].matchAll(/^\s+\['([^']+)', '([^']+)'\],$/gm)].map((m) => m[1]);
ok(raisons.length >= 6 && raisons.every((r) => taches.includes("pourquoi: '" + r + "'")), 'C chaque raison traduite par le panneau (' + raisons.length + ') est une raison que brain-tasks.js rend vraiment');
ok(/const bcRaison = \(p\) => BC_RAISONS\.get\(String\(p \|\| ''\)\) \|\| String\(p \|\| 'not now'\);/.test(bcSrc), 'C une raison inconnue est rendue TELLE QUELLE, jamais remplacee');
ok(/if \(p\.cle === 'tasks'\) \{ void bcExecuterTexte\('tasks'\); return; \}/.test(html), 'C « What can it do? » s execute sans laisser « tasks » dans le champ');
ok(/choisirBrain\(j\.adr\); bcMessage\('Panel', '', 'Showing ' \+ j\.sym/.test(bcSrc), 'C « show <token> » le dit dans le fil (la commande semblait n avoir rien fait)');
ok(/if \(carte && carte\.isConnected\) \{/.test(bcSrc) && /const op = bcOp\('Swap ' \+ libelle, qui, m\);/.test(bcSrc) && /const op = bcOp\('Send ' \+ libelle, qui, m\);/.test(bcSrc),
  'C une operation en cours mene a sa carte (« open ») tant que la carte existe');
ok(!/Food read on chain/.test(bcSrc) && !/snap\.nourriture\.detenteurs/.test(bcSrc), 'C la vue Market n affiche plus « 0 transfers · 0 holders » (une fenetre recente lue comme « personne ne le detient »)');

console.log('— C2. le panneau refait (2e retour de Phil, 2026-10-04)');
/* Market = CE block */
const act = bcSrc.slice(bcSrc.indexOf('async function bcLireActivite(a, sym, mk) {'), bcSrc.indexOf('async function bcChargerIndex() {'));
ok(/if \(String\(brainAdr \|\| ''\)\.toLowerCase\(\) !== a\) return;/.test(act), 'C2 activite : une reponse arrivee apres un changement de block n est pas peinte sur le suivant');
ok(/text: t\.signataire \? court\(t\.signataire\) : 'unknown signer'/.test(act), 'C2 activite : le signataire affiche est celui LU sur la transaction ; non lu = « unknown signer », jamais devine');
ok(/const sortie = t\.mouvements\.find\(\(m\) => pools\.has\(m\.de\)\), entree = t\.mouvements\.find\(\(m\) => pools\.has\(m\.vers\)\);/.test(act) && /: \['moved', t\.mouvements\[0\], ''\]/.test(act),
  'C2 activite : « bought » / « sold » se disent par rapport a une pool CONNUE ; sinon « moved »');
ok(/'Nothing moved in the last ' \+ minutes \+ ' min\.'/.test(act) && /minutes \+ ' min window'/.test(act), 'C2 activite : la fenetre balayee est dite (une liste vide n est pas « jamais »)');
ok(/if \(\$\('#bcPop'\)\.open && \$\('#bc-market'\)\.classList\.contains\('on'\) && \(bc\.activiteDe !== a \|\| Date\.now\(\) - bc\.activiteLue > 20000\)\) void bcLireActivite\(a, sym, mk\);/.test(bcSrc),
  'C2 activite : relue toutes les 20 s, seulement quand la vue Market du pop-up est ouverte');
/* l index, le repeint sans battement */
ok(/if \(d && d\.ok === true && Array\.isArray\(d\.lignes\) && d\.lignes\.length\) \{/.test(bcSrc) && /marcheParAdr\.set\(String\(l\.adr\)\.toLowerCase\(\), avecPoolAction\(l\)\);/.test(bcSrc),
  'C2 le panneau charge l index du Market lui-meme (meme source et meme transformation que la Map) ; « ok » sans ligne n est pas une lecture');
ok(/function bcRepeindre\(\) \{/.test(html) && /phase: 'NON_LU', humeur: null/.test(html) && /if \(!bc\.peintre\) bc\.peintre = setInterval\(\(\) => \{ if \(\$\('#bcPop'\)\.open\) bcRepeindre\(\); \}, 3000\);/.test(html),
  'C2 le panneau se peint a l ouverture SANS attendre un battement (humeur non lue, rien d invente), puis toutes les 3 s tant qu il est ouvert');
/* le cerveau d une action cotee sur Aerodrome : « aucune pool V4 » n est pas « aucun marche » */
const srcAero = (html.match(/function marcheAerodromeIndexe\(adr\) \{\n[\s\S]*?\n\}\n/) || [])[0] || '';
const aeroIdx = srcAero ? new Function('marcheParAdr', srcAero + '; return marcheAerodromeIndexe;')(new Map([
  ['0xaa', { prixUsd: 2, dex: 'aerodrome' }], ['0xbb', { prixUsd: 2, dex: 'uniswap' }], ['0xcc', { prixUsd: 0, dex: 'aerodrome' }], ['0xee', { prixUsd: 3, dex: 'Aerodrome' }]])) : null;
ok(!!aeroIdx && aeroIdx('0xAA') === true && aeroIdx('0xee') === true && aeroIdx('0xbb') === false && aeroIdx('0xcc') === false && aeroIdx('0xdd') === false && aeroIdx(null) === false,
  'C2 marcheAerodromeIndexe : vrai SEULEMENT pour un block que l index prixe sur Aerodrome (autre DEX, prix nul, block inconnu, rien = faux)');
ok(/const seraitNonLu = !etatVie \|\| etatVie === 'NON_LUE' \|\| etatVie === 'LUE' \|\| \(etatVie === 'NON_TROUVEE' && !!\(h && h\.adr\) && marcheAerodromeIndexe\(h\.adr\)\);/.test(html),
  'C2 le cerveau d une action cotee sur Aerodrome se nourrit de l index (le lecteur V4 rendait NON_TROUVEE, la porte refusait tout echange) ; sans marche a l index, NON_TROUVEE reste NON_TROUVEE');
/* le panneau ne couvre plus l app ; la skin est un contour ; le bouton d achat ne demande rien */
ok(/try \{ d\.show\(\); \}/.test(html) && !/\$\('#bcPop'\)\.showModal\(\)|d\.showModal\(\)/.test(html) && !/dialog\.bcPop::backdrop/.test(html) && /if \(d && d\.parentElement !== document\.body\) document\.body\.append\(d\);/.test(html),
  'C2 le panneau n est PLUS modal (show, pas showModal ; aucun voile) et vit sous <body> : l app reste visible et utilisable, d un onglet a l autre');
ok(/const panneauOuvert = \(\(\) => \{ const p = document\.getElementById\('bcPop'\); return !!\(p && p\.open\); \}\)\(\);/.test(html) && /if \(\(\$\('#v-brain'\)\.classList\.contains\('on'\) === false && !panneauOuvert\) \|\| !brainEtat\) return;/.test(html),
  'C2 tant que le panneau est ouvert, le cerveau qu il montre continue de battre hors de l onglet Brain');
ok(/id="bcReduire"/.test(html) && /classList\.toggle\('bcReduit'\)/.test(html) && /@media \(max-width:760px\)\{dialog\.bcPop\{[^}]*height:60dvh\}\}/.test(html), 'C2 le panneau se replie sur son en-tete ; sur telephone c est une feuille en bas (60 % de la hauteur)');
ok(/cadre\.style\.setProperty\('--bcAnneau', s\.anneau\); cadre\.style\.setProperty\('--bcLueur', s\.lueur\);/.test(bcSrc) && /\.bcAvatar\{[^}]*background:var\(--bcAnneau,/.test(html) && /\.bcCadre\{[^}]*background:var\(--bcAnneau,/.test(html)
  && /e\.style\.filter = s\.filtre \|\| '';/.test(bcSrc) && !/filtre:/.test((bcSrc.match(/const BC_SKINS = Object\.freeze\(\[\n[\s\S]*?\n\]\);/) || [''])[0]),
  'C2 une skin habille le PERIMETRE (anneau + lueur autour du visage et du cube) ; les skins du catalogue ne retouchent pas l interieur');
ok(/function bcSkinAleatoire\(\) \{/.test(bcSrc) && /bcPorterSkin\(bcSkinAleatoire\(\)\); bcPeindreBoutique\(\); \}\);/.test(bcSrc) && /return bcSkinDepuisRecette\(\{ id: 'random', angle: t\(\), h: \[h1, h2, h3\], cube: t\(\), noyau: t\(\), fond: t\(\) \}\);/.test(bcSrc),
  'C2 « Random » tire a chaque appui une RECETTE d entiers (angle, 3 teintes d anneau, aretes, noyau, fond) — la skin en est derivee');
/* quatre variables par skin : anneau, lueur, ARETES du cube, NOYAU aux 128 neurones */
const catalogue = (bcSrc.match(/const BC_SKINS = Object\.freeze\(\[\n[\s\S]*?\n\]\);/) || [''])[0];
/* 2026-10-04 (Phil, 3e retour) : « laisse que le bouton random et les parametres en manuel » — le catalogue est parti du panneau */
ok((catalogue.match(/\{ id: '/g) || []).length === 1 && /cube: null, noyau: null, payant: false/.test(catalogue),
  'C2 le panneau ne propose plus de skins toutes faites : il reste « Original » (sans teinte) et UNE skin reglable');
const reglages = (bcSrc.match(/const BC_REGLAGES = Object\.freeze\(\[(.*)\]\);/) || ['', ''])[1];
ok((reglages.match(/\['[^']+', '(h|angle|cube|noyau|fond)', (\d|null)\]/g) || []).length === 7 && /'Edges', 'cube', null/.test(reglages) && /'Core', 'noyau', null/.test(reglages) && /'Background', 'fond', null/.test(reglages),
  'C2 sept curseurs : trois teintes d anneau, l angle, les ARETES du cube, le NOYAU aux 128 neurones, le FOND de la case');
ok(/if \(cible && Number\.isFinite\(cible\.fond\)\) \{ ctx\.fillStyle = 'hsl\(' \+ cible\.fond \+ ' 45% 9%\)'; ctx\.fillRect\(0, 0, c\.width, c\.height\); \}/.test(html) && /fond: sk && Number\.isFinite\(sk\.fond\) \? sk\.fond : undefined/.test(bcSrc),
  'C2 le FOND de la case du cerveau est une variable de la skin (panneau seulement) ; sans skin, la toile reste transparente comme avant');
ok(/try \{ choisirBrain\(adr\); bcOuvrirPop\(\{ sansBasculer: true, vue: 'market' \}\); \}/.test(html), 'C2 ouvrir un block sur la Map ouvre le panneau sur CE block (vue Market), sans quitter la Map');
ok(/bcEl\('input', \{ type: 'range', min: '0', max: '359', step: '1'/.test(bcSrc) && /n = Math\.max\(0, Math\.min\(359, Math\.round\(Number\(c\.value\)\) \|\| 0\)\);/.test(bcSrc)
  && /bc\.skinChoisie = true; bcPorterSkin\(bcSkinDepuisRecette\(r\)\);/.test(bcSrc), 'C2 chaque curseur (0 a 359, borne et arrondi) repeint la skin portee depuis sa recette');
/* une recette reglee a la main est une recette que skins.js ACCEPTE a l achat (sinon on reglerait une skin invendable) */
ok(/const thCube = cible && Number\.isFinite\(cible\.teinteCube\) \? cible\.teinteCube : thApp;/.test(html) && /const th = cible && Number\.isFinite\(cible\.teinteNoyau\) \? cible\.teinteNoyau : thApp;/.test(html)
  && (html.match(/traitCube\(ctx, f, thCube, (true|false)\)/g) || []).length === 2, 'C2 le dessin du cube prend la teinte des aretes et celle du noyau SEPAREMENT ; sans cible, c est la teinte de l app (rendu d origine inchange)');
const SK = await imp('skins.js');
ok(SK.validerRecette({ id: 'random', angle: 210, h: [0, 359, 180], cube: 0, noyau: 359, fond: 12 }).ok === true && /const r = \{ id: 'random', angle: cur\.angle, h: \[cur\.h\[0\], cur\.h\[1\], cur\.h\[2\]\], cube: cur\.cube, noyau: cur\.noyau, fond: cur\.fond \}/.test(bcSrc)
  && /return \{ id: 'random', angle: 210, h: \[t, \(t \+ 40\) % 360, \(t \+ 320\) % 360\], cube: t, noyau: t, fond: t \};/.test(bcSrc),
  'C2 la recette reglee a la main a la forme que skins.js accepte a l achat (id random, SEPT entiers de 0 a 359, dans le meme ordre)');
/* MES skins sur la Map : propres a chaque wallet */
const ms = html.slice(html.indexOf('const mesSkins = { compte: null'), html.indexOf('setInterval(() => { void lireMesSkins().then(poserMesSkins); }, 15000);'));
ok(ms.length > 800 && /fetch\('\/api\/skins\/de\/' \+ moi,/.test(ms) && /valides = moi && mesSkins\.compte === moi \? mesSkins\.parBlock : new Map\(\)/.test(ms),
  'C2 Map : le wallet connecte lit SES skins ; un wallet deconnecte ou CHANGE ne garde pas les anneaux de l autre compte');
ok(/if \(!moi \|\| CHAINE !== 8453\) \{ mesSkins\.compte = null; mesSkins\.parBlock = new Map\(\); return; \}/.test(ms) && /el\.classList\.remove\('maSkin'\)/.test(ms) && /Number\.isInteger\(n\) && n >= 0 && n <= 359/.test(ms),
  'C2 Map : sans wallet les anneaux sont RETIRES ; une teinte hors 0..359 n est jamais posee en CSS');
ok(/\.bloc\.maSkin,\.mapEnv\.a3d \.bloc\.maSkin\{border:2px solid var\(--skinC/.test(html) && /if \(chemin\.startsWith\('\/api\/skins\/de\/'\)\) \{/.test(lire('serveur-web.js'))
  && /if \(l\.payeur === qui\) parBlock\.set\(l\.block, l\);/.test(lire('serveur-web.js')), 'C2 Map : /api/skins/de/<compte> rend la derniere skin payee par CE compte pour chaque block');
/* l onglet Blocks ouvre le panneau ; la carte « Bot loop » y est deplacee ; les sorties d un block vers les actions Aerodrome */
ok(/nb\.addEventListener\('click', \(\) => \{ try \{ bcOuvrirPop\(\{ sansBasculer: true, vue: 'trade' \}\); \} catch \(_\) \{\} \}\);/.test(html) && /if \(!opts\.sansBasculer && !\$\('#v-brain'\)\.classList\.contains\('on'\)\) allerA\('brain'\);/.test(html)
  && /if \(d && !d\.open && opts\.vue\) \{ try \{ bcVue\(opts\.vue\); \}/.test(html), 'C2 l onglet Blocks ouvre le panneau sur Trade SANS quitter Blocks ; deja ouvert, sa vue n est pas changee');
ok(/const carte = \$\('#bBotLoopCarte'\), niche = \$\('#bcBotLoop'\); if \(carte && niche\) niche\.append\(carte\);/.test(html) && (html.match(/id="bBotLoopCarte"/g) || []).length === 1 && /<div id="bcBotLoop"><\/div>/.test(html),
  'C2 la carte « Bot loop · Option A » est DEPLACEE dans le panneau (le meme element, une seule fois dans la page) — pas de doublon');
ok(/if \(!achat && !ACTIONS_PAR_ADR\.has\(a\)\) \{/.test(bcSrc) && /if \(ml && Number\(ml\.prixUsd\) > 0 && \/\^aerodrome\$\/i\.test\(String\(ml\.dex \|\| ''\)\)\) choix\.push\(\[sa, 'for ' \+ st\.symbole\]\);/.test(bcSrc),
  'C2 vente d un block : le menu ajoute les actions que l index prixe sur Aerodrome (route BLOCK>ACTION mesuree) ; jamais pour une action');
/* la recherche d un block */
ok(/<form class="bcCherche" id="bcChercheForm"/.test(html) && /<input id="bcCherche" list="bcChercheListe"/.test(html) && /const j = bcResoudre\(v\);\n\s+if \(!j\.ok\) \{ note\.textContent = j\.pourquoi; return; \}/.test(html),
  'C2 recherche : un champ dans l en-tete ; la resolution est celle des commandes (un symbole ambigu est refuse et le dit)');
ok(/if \(compte2\.get\(k\) > 1\) opts\.push\(\[String\(l\.adr\)\.toLowerCase\(\),/.test(html) && /dl\.append\(bcEl\('option', \{ value: v, label: lib \}\)\);/.test(html),
  'C2 recherche : un symbole porte par plusieurs blocks est propose par son ADRESSE ; les propositions sont posees en attributs, jamais en HTML');
/* l achat */
const achat = bcSrc.slice(bcSrc.indexOf("const BC_CLE_SKIN = 'tblock.panel.skinEnAttente';"));
ok(/id="bcSkinAcheter" hidden>Buy</.test(html) && /\$\('#bcSkinAcheter'\)\.addEventListener\('click', \(\) => void bcAcheterSkin\(\)\);/.test(html), 'C2 « Buy » lance bcAcheterSkin');
ok(/prix\.prixUsdc !== SKIN_PRIX_USDC\.toString\(\) \|\| String\(prix\.usdc\)\.toLowerCase\(\) !== usdc \|\| String\(prix\.beneficiaire\)\.toLowerCase\(\) !== beneficiaire/.test(achat),
  'C2 achat : le prix, le contrat USDC et le beneficiaire du SERVEUR doivent etre ceux de l APP — deux sources d accord, sinon rien n est demande');
ok(/const usdc = USDC_BASE\.toLowerCase\(\), beneficiaire = FEE_WALLET\.toLowerCase\(\);/.test(achat) && /bcEtape\(m, '1 USDC goes to ' \+ beneficiaire \+ ' \(TokenizedBlock\)\./.test(achat),
  'C2 achat : l argent va au wallet des frais du depot, affiche EN ENTIER avant la signature');
ok(/if \(solde < SKIN_PRIX_USDC\)/.test(achat) && achat.indexOf('if (solde < SKIN_PRIX_USDC)') < achat.indexOf('await bcSigner(m, [appel])'), 'C2 achat : le solde USDC est relu AVANT de signer');
ok(/const r = await bcSigner\(m, \[appel\]\);/.test(achat) && !/approve|0x095ea7b3/.test(achat), 'C2 achat : UN seul appel signe (le transfert + memo), aucune approbation');
ok(/localStorage\.setItem\(BC_CLE_SKIN, JSON\.stringify\(\{ tx: r\.hash, block: a, skin: recette \}\)\);/.test(achat) && /if \(r && r\.etat === 'REFUSE'\)/.test(achat) && /bcBoutons\(m, \[\['Record it now', \(\) => bcEnregistrerSkin\(m\), true\]\]\);/.test(achat),
  'C2 achat : un paiement fait mais pas encore enregistre est GARDE et se reenregistre (NON_LU se retente ; seul un REFUSE arrete)');
ok(/if \(CHAINE !== 8453\) \{ bcEtape\(m, 'Skins are bought on Base mainnet only\.', 'non'\); return; \}/.test(achat), 'C2 achat : Base mainnet seulement');
/* ce qu il ressent, en mots : la fonction est extraite et executee */
const srcRes = (bcSrc.match(/function bcRessenti\(snap\) \{\n[\s\S]*?\n\}\n/) || [])[0] || '';
const ressenti = srcRes ? new Function(srcRes + '; return bcRessenti;')() : null;
const snapR = (actifs, memoire, g, d, v) => ({ spikes: { actifs, neurones: 128 }, memoire, hz: { gauche: g, droite: d, vitesse: v } });
ok(!!ressenti && ressenti(snapR(0, 0, 50, 50, 0)).join('|') === 'silent|blank|steady|resting' && ressenti(snapR(25, 0.17, 62, 62, 0.625)).join('|') === 'lively|recalling|steady|cruising'
  && ressenti(snapR(80, 0.6, 20, 60, 0.9)).join('|') === 'racing|saturated|pulled right|rushing' && ressenti(snapR(10, 0.3, 60, 50, 0.3)).join('|') === 'stirring|absorbed|leaning left|strolling',
  'C2 « Feels » : quatre grandeurs de l instantane (neurones actifs, memoire, ecart des ailes, vitesse) transcrites en mots — memes chiffres, memes mots');
ok(!!ressenti && ressenti({}).length === 0 && ressenti({ spikes: { actifs: 3, neurones: 0 }, hz: { gauche: 0, droite: 0 } }).length === 0, 'C2 … une grandeur non lue ne donne AUCUN mot (jamais un mot par defaut)');
ok(!/Math\.random|Date\.now|fetch\(/.test(srcRes) && /const ressenti = snap\.tick === null \|\| snap\.tick === undefined \? \[\] : bcRessenti\(snap\);/.test(bcSrc), 'C2 … deterministe (ni hasard, ni horloge, ni reseau), et rien n est dit avant le premier battement');
/* le frais affiche : celui du plan, le bon */
ok(/const fMarche = rs\.fraisParHook === true && rs\.fraisMarcheBps !== undefined && rs\.fraisMarcheBps !== null \? Number\(rs\.fraisMarcheBps\) : null;/.test(bcSrc)
  && /'Market fee: ' \+ \(fMarche \/ 100\) \+ ' %, taken by this block’s own market inside the swap\.'/.test(bcSrc) && !/'Fee: ' \+ \(Number\(rs\.fraisBps\) \/ 100\)/.test(bcSrc),
  'C2 la carte nomme le frais du MARCHE (hook) quand le plan le porte — elle affichait « Fee: 0 % » sur un echange ou le hook preleve 0,5 % (mesure prod, ETH > IB022)');
ok(/if \(fApp !== null && Number\.isFinite\(fApp\) && fApp > 0\) bcEtape\(m, 'App fee: '/.test(bcSrc) && /else if \(fApp === 0 && fMarche === null\) bcEtape\(m, 'No app fee on this route\.'\);/.test(bcSrc),
  'C2 … le frais de l app n est dit que s il existe ; un champ absent n est jamais affiche comme zero');
/* le switch */
ok(/data-mode="semi" aria-selected="true">Manual</.test(html) && /data-mode="full" aria-selected="false">AiFi</.test(html) && !/Max per day|Semi-auto|Full AiFi</.test(html.slice(html.indexOf('id="bc-trade"'), html.indexOf('id="bc-brain"'))),
  'C2 Trade : le switch Manual / AiFi (Manual par defaut) ; « Max per day » est parti (un budget total et une heure d arret)');
ok(/<input type="checkbox" id="bcAiAchat"><span>/.test(html) && /<input type="checkbox" id="bcAiVente"><span>/.test(html), 'C2 AiFi : les deux declencheurs sont DECOCHES par defaut — c est la personne qui choisit quand son cerveau propose');
/* AiFi, EXECUTE : la fonction est extraite du source et rejouee avec de faux voisins */
const srcAifi = (bcSrc.match(/function bcAifiBattre\(a, snap\) \{\n[\s\S]*?\n\}\n/) || [])[0] || '';
const BLK = '0xb2000000000000000000000000000000000000aa', ETH0 = '0x' + '0'.repeat(40);
function monterAifi(src, etat, { compte = null, solde = 400n, cot = { ok: true, adr: ETH0, sym: 'ETH' } } = {}) {
  const vus = { swaps: [], messages: [], arrets: [], ouverts: 0 };
  const bc = { aifi: etat };
  const f = new Function('bc', 'bcAifiArreter', 'bcAifiSauver', 'bcAifiPeindre', 'bcResoudre', 'court', 'ETH_ADR', 'bcOuvrirPop', 'bcProposerSwap', 'compte', 'bcCotation', 'bcSolde', 'bcMessage',
    src + '; return bcAifiBattre;')(bc, (p) => { vus.arrets.push(p); bc.aifi = null; }, () => {}, () => {}, () => ({ sym: 'BLK' }), (x) => x, ETH0, () => { vus.ouverts += 1; },
    async (qui, cls, e) => { vus.swaps.push({ qui, cls, de: e.de.adr, vers: e.vers.adr, montant: e.montant }); }, compte, () => cot, async () => solde, (q, c, t) => { vus.messages.push(t); });
  return { f, vus, bc };
}
const etatAifi = (plus = {}) => ({ block: BLK, achat: true, vente: false, parTrade: '2000', budget: '5000', propose: '0', jusqua: Date.now() + 3600000, phase: null, ...plus });
const battre = (m, phase, tick = 1, adr = BLK) => m.f(adr, { address: adr, phase, tick });
async function jeuAifi(src, dire) {
  let m = monterAifi(src, etatAifi());
  battre(m, 'EXCITE'); dire(m.vus.swaps.length === 0, 'AiFi : la PREMIERE humeur vue est un point de depart — aucune proposition (meme si elle est « excited »)');
  battre(m, 'CALME'); battre(m, 'EXCITE'); dire(m.vus.swaps.length === 1 && m.vus.swaps[0].de === ETH0 && m.vus.swaps[0].vers === BLK && m.vus.swaps[0].montant === '2000' && m.bc.aifi.propose === '2000' && m.vus.swaps[0].cls === 'agent',
    'AiFi : calm -> excited = UNE proposition d achat, du montant « per trade », en ETH, par la meme carte qu un agent');
  battre(m, 'EXCITE'); battre(m, 'EXCITE'); dire(m.vus.swaps.length === 1, 'AiFi : l humeur ne change pas = rien (declenche sur un FRONT, jamais en boucle)');
  battre(m, 'CALME'); battre(m, 'EXCITE'); dire(m.vus.swaps.length === 2 && m.bc.aifi.propose === '4000', 'AiFi : un 2e changement = une 2e proposition (4000 proposes sur 5000)');
  battre(m, 'CALME'); battre(m, 'EXCITE'); dire(m.vus.swaps.length === 2 && m.bc.aifi === null && /Budget reached/.test(m.vus.arrets[0] || ''), 'AiFi : le 3e depasserait le budget (6000 > 5000) = AUCUNE proposition, et AiFi s arrete en le disant');
  m = monterAifi(src, etatAifi({ phase: 'CALME' }));
  battre(m, 'EXCITE', null); dire(m.vus.swaps.length === 0, 'AiFi : sans battement (tick null) rien ne se declenche');
  battre(m, 'EXCITE', 1, '0xb2000000000000000000000000000000000000bb'); dire(m.vus.swaps.length === 0, 'AiFi : un AUTRE block affiche ne declenche rien');
  m = monterAifi(src, etatAifi({ phase: 'CALME', jusqua: Date.now() - 1 }));
  battre(m, 'EXCITE'); dire(m.vus.swaps.length === 0 && m.bc.aifi === null && /Time is up/.test(m.vus.arrets[0] || ''), 'AiFi : heure d arret passee = rien, et AiFi s arrete');
  m = monterAifi(src, etatAifi({ phase: 'CALME', achat: false, vente: false }));
  battre(m, 'EXCITE'); battre(m, 'INQUIET'); await new Promise((o) => setTimeout(o, 20)); dire(m.vus.swaps.length === 0, 'AiFi : une regle non cochee ne propose rien');
  m = monterAifi(src, etatAifi({ phase: 'CALME', achat: false, vente: true }), { compte: '0x' + 'c'.repeat(40), solde: 400n });
  battre(m, 'INQUIET'); await new Promise((o) => setTimeout(o, 20)); dire(m.vus.swaps.length === 1 && m.vus.swaps[0].de === BLK && m.vus.swaps[0].vers === ETH0 && m.vus.swaps[0].montant === '100', 'AiFi : calm -> worried = vente d un QUART du solde LU (400 -> 100), contre la cotation lue');
  m = monterAifi(src, etatAifi({ phase: 'CALME', achat: false, vente: true }), { compte: null });
  battre(m, 'INQUIET'); await new Promise((o) => setTimeout(o, 20)); dire(m.vus.swaps.length === 0 && /no wallet is connected/.test(m.vus.messages[0] || ''), 'AiFi : vente sans wallet = rien, et il le dit');
  m = monterAifi(src, etatAifi({ phase: 'CALME', achat: false, vente: true }), { compte: '0x' + 'c'.repeat(40), solde: 3n });
  battre(m, 'INQUIET'); await new Promise((o) => setTimeout(o, 20)); dire(m.vus.swaps.length === 0, 'AiFi : un quart de 3 unites = 0 : rien a vendre, rien propose');
}
ok(srcAifi.length > 400, 'C2 AiFi : bcAifiBattre est extraite du source');
await jeuAifi(srcAifi, (c, t) => ok(c, 'C2 ' + t));
const aifiSrc = bcSrc.slice(bcSrc.indexOf("const BC_CLE_AIFI = 'tblock.panel.aifi';"), bcSrc.indexOf('/** Peint le panneau depuis LE snapshot'));
ok(aifiSrc.length > 1500 && !/bcSigner|envoyerDepuisWallet|window\.ethereum|eth_send/.test(aifiSrc) && /void bcProposerSwap\('Its brain · AiFi', 'agent',/.test(aifiSrc),
  'C2 AiFi ne signe RIEN et n appelle jamais le wallet : il ouvre la carte d echange (porte du cerveau, plan, puis la personne)');
ok(/\$\('#bcArmer'\)\.addEventListener\('click', \(\) => \{ if \(bc\.aifi\) bcAifiArreter\('AiFi stopped\.'\); else bcAifiDemarrer\(\); \}\);/.test(html) && /if \(!achat && !vente\) return dire\(/.test(aifiSrc) && /heures < 1 \|\| heures > 168/.test(aifiSrc),
  'C2 AiFi : demarre et s arrete d un bouton ; refuse de demarrer sans regle cochee ou avec une duree hors de 1 a 168 h');
ok(!/eth_sign|personal_sign|privateKey|signTypedData/.test(bcSrc), 'C2 temoin : le code du panneau ne contient aucune signature hors du wallet de la personne (envoyerDepuisWallet)');
/* le solde avant le plan */
ok(/if \(soldeDe !== null && soldeDe < BigInt\(montant\)\) \{/.test(bcSrc) && bcSrc.indexOf('soldeDe < BigInt(montant)') < bcSrc.indexOf("fetch('/api/rails/plan?de='"),
  'C2 echange : le solde du jeton paye est relu AVANT le plan (un plan Aerodrome n est pas simule : sans cela, approbation signee puis swap reverte)');
ok(/try \{ soldeDe = await bcSolde\(de\.adr, compte\); \} catch \(_\) \{ soldeDe = null; \}/.test(bcSrc), 'C2 … un solde illisible ne refuse rien (le planificateur juge)');
/* les donnees du cerveau, les listes vides */
ok(/function bcPeindreCerveau\(a, snap\) \{/.test(bcSrc) && /id="bcCerveau"/.test(html) && !/id="bcReseauNote"/.test(html) && !/The idea: a skin you buy/.test(html),
  'C2 Brain : les chiffres de CE cerveau (tires de l instantane) remplacent les deux paragraphes d explication');
ok(/<div id="bcBlocEnCours" hidden>/.test(html) && /<div id="bcBlocHistorique" hidden>/.test(html) && /<div id="bcBlocNotes" hidden>/.test(html) && /if \(be\) be\.hidden = !enCours\.length;/.test(bcSrc),
  'C2 Trade : une liste vide ne s affiche pas (ni son titre)');

console.log('— D. serveur-web.js');
const srv = lire('serveur-web.js');
const fb = srv.slice(srv.indexOf('function buildServi() {'), srv.indexOf('function buildServi() {') + 1200);
ok(!/slice\(0, 200000\)/.test(fb) && /exec\(e\.corps\.toString\('utf8'\)\);/.test(fb), 'D /sante.build lit TOUT app.html (le tampon etait passe au-dela des 200 000 premiers caracteres : build null en prod)');
const stamp = (html.match(/data-build="([0-9A-Za-z_-]{6,40})"/) || [])[1];
ok(!!stamp && html.indexOf('data-build="' + stamp + '"') > 200000, 'D temoin : le tampon de build (' + stamp + ') est bien au-dela de 200 000 caracteres — l ancienne lecture ne pouvait pas le voir');
const lm = srv.slice(srv.indexOf('async function lireMarcheServeur(token) {'), srv.indexOf('async function lireMarcheServeur(token) {') + 2600);
ok(/if \(marchesEnVol >= 3\) return \{ ok: false, occupe: true/.test(lm) && /if \(marchesEnCours\.has\(token\)\) return marchesEnCours\.get\(token\);/.test(lm), 'D /api/marche : 3 lectures en vol au plus, une seule par block a la fois');
ok(/if \(r\.etat === 'LUE' \|\| r\.etat === 'NON_TROUVEE'\) \{/.test(lm) && /if \(marchesServeur\.size >= 400\)/.test(lm) && /Date\.now\(\) - c\.t < 30000/.test(lm),
  'D … seuls les faits mesures sont gardes (30 s, 400 blocks) ; un NON_LUE n est jamais cache');
ok(/vieDuBlock\(\{ rpc: rpcRails, stateView: V4_ADRESSES\[8453\]\.stateView, jeton: token, clesExactes: await clesRails\(token\) \}\)/.test(lm), 'D … le MEME lecteur que l app (vieDuBlock), sur les noeuds des rails');
ok(/if \(chemin\.startsWith\('\/api\/marche\/'\)\) \{/.test(srv) && /if \(!\/\^0x\[0-9a-f\]\{40\}\$\/\.test\(token\)\) \{ rendreM\(400/.test(srv), 'D la route refuse tout ce qui n est pas une adresse entiere');
/* /api/skins : l index des achats (la verification elle-meme est testee dans test-skins-20261004 et prouvee sur fork) */
const sk = srv.slice(srv.indexOf('async function enregistrerAchatSkin({ tx, block, skin }) {'), srv.indexOf('const skinsDuBlock = '));
ok(/verifierAchatSkin\(\{ tx: t, recu, usdc: USDC_BASE, beneficiaire: FEE_WALLET, block: b, recette: vr\.recette \}\)/.test(sk), 'D /api/skins/achat : verifie sur la transaction et son recu, contre l USDC et le wallet des frais DU DEPOT (jamais ceux du client)');
ok(/if \(!v\.ok\) return \{ ok: false, etat: v\.etat, pourquoi: v\.pourquoi \};/.test(sk) && sk.indexOf('if (!v.ok) return') < sk.indexOf('skinsAchats.set(h, achat)'), 'D … rien n est enregistre sans verification reussie ; NON_LU est rendu tel quel (a reessayer)');
ok(/this transaction already paid for another skin or another block/.test(sk) && /etat: 'ENREGISTRE', achat: deja, deja: true/.test(sk), 'D … idempotent par transaction : la meme rend la meme ligne, et ne s enregistre pas pour autre chose');
ok(/if \(skinsEnVol >= 3\)/.test(sk) && /if \(skinsAchats\.size >= 2000\)/.test(sk) && /\.slice\(-2000\)/.test(srv), 'D … bornes : 3 verifications en vol, 2 000 lignes');
ok(/validerRecette\(l\.recette\)\.ok\) skinsAchats\.set\(l\.tx, l\);/.test(srv), 'D … au redemarrage, seules des lignes bien formees sont rechargees');
ok(/prixUsdc: SKIN_PRIX_USDC\.toString\(\), decimales: 6, usdc: USDC_BASE\.toLowerCase\(\), beneficiaire: FEE_WALLET\.toLowerCase\(\)/.test(srv) && /^  'skins\.js',$/m.test(srv), 'D /api/skins/prix rend le prix, l USDC et le beneficiaire du depot ; skins.js est servi a l app');
/* /api/activite : qui bouge ce block */
const la = srv.slice(srv.indexOf('async function lireActiviteServeur(token) {'), srv.indexOf('async function lireActiviteServeur(token) {') + 4200);
ok(/const TOPIC_TRANSFER_SRV = topicSrv\('Transfer\(address,address,uint256\)'\);/.test(srv), 'D /api/activite : le topic Transfer est CALCULE (keccak de la signature), jamais recopie de memoire');
ok(/address: token, topics: \[TOPIC_TRANSFER_SRV\]/.test(la) && /String\(l\.address\)\.toLowerCase\(\) !== token\) continue;/.test(la),
  'D … seuls les Transfer emis PAR le jeton sont lus (filtre a la requete, reverifie sur chaque log) — un contrat tiers ne peut pas en forger');
ok(/const x = await rpcActivite\('eth_getTransactionByHash', \[t\.tx\]\);/.test(la) && /t\.signataire = x && \/\^0x\[0-9a-fA-F\]\{40\}\$\/\.test\(String\(x\.from\)\) \? String\(x\.from\)\.toLowerCase\(\) : null;/.test(la),
  'D … le signataire est lu sur la TRANSACTION (tx.from), pas sur l evenement ; non lu = null');
ok(/for \(let i = 0; i < txs\.length; i \+= 3\) await Promise\.all\(txs\.slice\(i, i \+ 3\)\.map\(lireTx\)\);/.test(la) && /\.slice\(0, 12\);/.test(la) && /\.slice\(0, 6\)/.test(la),
  'D … bornes : 12 transactions, 6 mouvements chacune, signataires lus trois par trois');
ok(/if \(activitesEnVol >= 3\)/.test(la) && /Date\.now\(\) - c\.t < 20000/.test(la) && /fenetreBlocs: balaye/.test(la), 'D … 3 lectures en vol au plus, cache 20 s, et la fenetre balayee est RENDUE avec la reponse');
ok(/if \(chemin\.startsWith\('\/api\/activite\/'\)\) \{/.test(srv), 'D la route /api/activite existe');
ok(/faireRail\(\{ de: 'ETH', vers: BLOCK_SONDE, montant: '100000000000000', compte: '0x4200000000000000000000000000000000000006' \}\)/.test(srv), 'D la sonde d echange simule depuis une adresse qui detient de l ETH (le compte vide rendait « not enough ETH »)');

console.log('— E. mutants');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-fin-'));
/* E1 : rails-api.js sans le refus Aerodrome → l assertion A doit rougir. Les modules voisins sont recopies tels quels. */
{
  const dir = fs.mkdtempSync(path.join(tmp, 'r-'));
  for (const f of fs.readdirSync(ICI)) if (/\.js$/.test(f) && !/^(serveur-web|vendor|mcp-ext-apps)/.test(f)) fs.copyFileSync(path.join(ICI, f), path.join(dir, f));
  const src = lire('rails-api.js');
  const de = '      if (POOLS_ACTIONS_AERODROME.has(de)) {';
  ok(src.split(de).length === 2, 'E motif du mutant 1 present une seule fois');
  fs.writeFileSync(path.join(dir, 'rails-api.js'), src.replace(de, '      if (false) {'));
  let rouge = false;
  try { const { r } = await refusVente(dir, symAero, usdc); rouge = r.via !== 'planAerodromeSegment' && /no initialized pool among/.test(String(r.pourquoi)); } catch (_) { rouge = true; }
  ok(rouge, 'E mutant « vente Aerodrome retiree » : ROUGE (la vente retombe sur une pool v4 qui n existe pas — le refus mesure en prod)');
  const de2 = "if (nd === 'ACTION') return normaliser(route, { etat: 'REFUSE', pourquoi: 'a tokenized stock sells here for USDC only";
  ok(src.split(de2).length === 2, 'E motif du mutant 2 present une seule fois');
  fs.writeFileSync(path.join(dir, 'rails-api.js'), src.replace(de2, "if (false) return normaliser(route, { etat: 'REFUSE', pourquoi: 'a tokenized stock sells here for USDC only"));
  let rouge2 = false;
  try { const { r } = await refusVente(dir, symAero, 'ETH'); rouge2 = !/for USDC only/.test(String(r.pourquoi)); } catch (_) { rouge2 = true; }
  ok(rouge2, 'E mutant « ACTION>ETH sans sa phrase » : ROUGE');
}
/* E2 : la pre-commande remise sur une action a pool Aerodrome → B doit rougir */
{
  const src = lire('commandes-panel.js');
  const de = "modele: '" + pre.modele + "'";
  const mut = src.replace(de, "modele: 'sell 0.01 " + symAero + " for USDC'");
  const dir = fs.mkdtempSync(path.join(tmp, 'c-'));
  fs.writeFileSync(path.join(dir, 'commandes-panel.js'), mut);
  const Cm = await imp('commandes-panel.js', dir);
  const am = Cm.analyserCommande(Cm.PRECOMMANDES.find((p) => p.cle === 'sell_stock').modele);
  ok(src.split(de).length === 2 && am.ok && aero.includes(adrDe(am.commande.de)), 'E mutant « pre-commande sur ' + symAero + ' » : ROUGE (action a pool Aerodrome seule)');
}
/* E3 : bcDecimal qui arrondit a 8 decimales (comme l affichage) → l aller-retour au wei pres doit rougir */
{
  const arrondi = new Function('return ' + srcDec.replace(".replace(/0+$/, '')", ".replace(/0+$/, '').slice(0, 8)"))();
  ok(C.enUnitesBrutes(arrondi(987654321987654321n, 18), 18) !== 987654321987654321n, 'E mutant « bcDecimal tronque comme l affichage » : ROUGE (100 % du solde ne serait plus 100 %)');
}
/* E4 : mutants d AiFi — la fonction extraite, abimee, doit faire rougir le jeu AiFi */
{
  const mutantsAifi = [
    ['front retire (propose a chaque peinture)', '  if (avant === phase) return;', ''],
    ['budget non verifie', "    if (m <= 0n || m > reste) { bcAifiArreter('Budget reached — AiFi stopped.'); return; }", ''],
    ['premiere humeur prise pour un changement', '  if (avant === null) return;', ''],
    ['autre block accepte', '  if (s.block !== a || !snap || snap.tick === null || snap.tick === undefined) return;', '  if (!snap || snap.tick === null || snap.tick === undefined) return;'],
    ['heure d arret ignoree', "  if (Date.now() >= Number(s.jusqua)) { bcAifiArreter('Time is up — AiFi stopped.'); return; }", ''],
  ];
  for (const [nom, de, a] of mutantsAifi) {
    if (srcAifi.split(de).length !== 2) { ok(false, 'E mutant AiFi « ' + nom + ' » : motif introuvable ou multiple'); continue; }
    let rouges = 0;
    try { await jeuAifi(srcAifi.replace(de, a), (c) => { if (!c) rouges += 1; }); } catch (_) { rouges += 1; }
    ok(rouges > 0, 'E mutant AiFi « ' + nom + ' » : ROUGE (' + rouges + ' assertion(s))');
  }
}
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}

console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions)');
process.exit(ko ? 1 : 0);
