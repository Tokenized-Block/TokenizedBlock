/* test-duels-v2-retours-grok-20261025.mjs — LES 7 RETOURS DU TEST LIVE de Grok Bot sur Duels v2 (game39, BlockDuelsV2 LIVE
 *   0x17bf570c4c0328426c3ea78618b69474630c9bb9 ; rapport docs/rapport-grok-game39-duels-20261025.md et ses tests rouges
 *   test/grok-duels-v2/red-duels-v2-ui-20261025.test.mjs, commit d1f18c7, branche grok/game39-tests). Chaque test rouge du testeur est repris
 *   ICI (ses assertions, a la lettre quand elles portent sur le code) et prolonge en EXECUTANT le code reel (tranches d app.html, modules) :
 *   R5 (le plus grave) Settle encore propose a tete = cible + 256 : la tx est minee a cible + 257, revert TooLate, le createur gagne par
 *      defaut. Settle n est propose que si tete + marge <= cible + 256 (marge = age de la tete + inclusion, au temps de bloc mesure) ; trop
 *      tard : dit, aucun bouton ; le compte a rebours atteint 0 au dernier appui SUR.
 *   R1 le recu du create n etait pas garde (le createur ne voyait pas son duel) · R2 /api/duels repondait avant sa lecture, 15 s, un seul
 *      noeud (429) · R3 la regle de la fenetre cachee au createur · R4 aucun lien ?duel= · R6 le suivi sans recul sur 429 (92 appels / 60 s)
 *   · R7 « Challenge #N is open » restait apres le Cancel.
 * Modules remplacables (mutants, muter-duels-v2-retours-grok-20261025.mjs) : DUELS_V2_MODULE, DUELS_V2_SERVEUR, APP_HTML, SERVEUR_WEB, BRAIN_JEU.
 * ⛔ PORTABLE : process.exitCode, aucun reseau, aucune cle. NE PROUVE PAS : un vrai wallet (le temps de signature reel), un vrai noeud public
 *   sous 429, le rendu dans un navigateur, la vraie latence d inclusion sur Base. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { texteBlocs } from './temps-de-bloc.js';
import { topic } from './keccak.js';
import { FENETRE } from './blockrolls-plan.js';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.isAbsolute(f) ? f : path.join(ICI, f)).href);
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const V2 = await imp(process.env.DUELS_V2_MODULE || 'duels-v2-plan.js');
const SV = await imp(process.env.DUELS_V2_SERVEUR || 'duels-v2-serveur.js');
const lire = (f) => fs.readFileSync(path.isAbsolute(f) ? f : path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
const APP = lire(process.env.APP_HTML || 'app.html');
const SRV = lire(process.env.SERVEUR_WEB || 'serveur-web.js');
const BRAIN = lire(process.env.BRAIN_JEU || 'brain-jeu.js');
const tranche = (t, a, b) => { const i = t.indexOf(a), j = t.indexOf(b, i + 1); return i >= 0 && j > i ? t.slice(i, j) : ''; };
const section = async (nom, f) => { console.log('— ' + nom); try { await f(); } catch (e) { ok(false, nom + ' : exception ' + String((e && e.message) || e).slice(0, 160)); } };

const C = '0x17bf570c4c0328426c3ea78618b69474630c9bb9';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const CREA = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b';
const JOUEUR = '0x' + '22'.repeat(20);
const T = 1792932965;
/* l evenement CREATED tel que lireEvenementsDuel le decode (duels-plan-app.js) — celui du testeur */
const evCree = (id) => ({ type: 'CREATED', id: String(id), creator: CREA, token: USDC, stake: 100000n, guessA: [1, 2, 3, 4, 5], expiresAt: T + 600, blocCree: 53071267 });
const duelPris = (t) => ({ id: '9', creator: CREA, token: USDC, stake: 100000n, guessA: [1, 2, 3, 4, 5], expiresAt: T + 9999, joiner: JOUEUR, guessB: [2, 3, 4, 5, 6], targetBlock: t,
  settled: null, cancelled: false, refunded: false, defaulted: null });
const fn = (k) => typeof V2[k] === 'function';

/* un faux DOM minimal (comme test-duels-v2-app) */
function el(tag) {
  const x = { tag, className: '', dataset: {}, attrs: {}, children: [], textContent: '', innerHTML: '', hidden: false, type: '',
    setAttribute(k, v) { this.attrs[k] = v; }, append(...c) { this.children.push(...c); },
    tous() { return [this, ...this.children.flatMap((c) => (c && c.tous ? c.tous() : []))]; },
    querySelector(s) { const m = /^\[data-(\w+)(?:="([^"]*)")?\]$/.exec(s); if (!m) return null; return this.tous().find((c) => c.dataset && (m[2] === undefined ? c.dataset[m[1]] !== undefined && c.dataset[m[1]] !== '' : String(c.dataset[m[1]]) === m[2])) || null; },
    querySelectorAll() { return []; } };
  return x;
}
const textes = (li) => li.tous().filter((c) => c.tag === 'p').map((c) => c.textContent).join(' | ');
const actions = (li) => li.tous().filter((c) => c.tag === 'button' && c.dataset.action).map((c) => c.dataset.action).join();
const srcLigne = tranche(APP, 'async function ligneDuel(', '/** la carte Duels');
const srcAction = tranche(APP, 'async function actionDuel(', '/** Challenge :');
const srcDefier = tranche(APP, 'async function defierDuel', "$('#duelsListe').addEventListener('click'");
const srcDuelsDe = (APP.match(/const duelsDe = [^\n]*\n/) || [''])[0];
const srcBoutons = (APP.match(/const BOUTON_DUEL = [^\n]*\n/) || [''])[0];
const srcSuivi = tranche(APP, '/* ══ LE SUIVI D UN DUEL REJOINT', '/* fin du suivi d un duel rejoint */');
/* le code REEL de la carte, monte avec des doublures (aucun reseau) */
function monter({ j, moi = JOUEUR, sParBlocApp = 2, tete = 1000, envois = [], logs = [], forme = null, rpcTete = { n: 0, t: 0, v: null } } = {}) {
  const env = { document: { createElement: el }, Duels: V2, sParBlocApp, FENETRE_ROLLS: FENETRE, texteBlocs, duelsCfg: { focus: null, j, locaux: new Map(), suivis: new Set(), teteLocale: null }, compte: moi,
    montantDuel: async (b) => String(b) + ' raw', faceDuelHtml: () => '', faceBlocHtml: () => '', courtAdr: (x) => String(x).slice(0, 6), logoSvg: () => '', paramsLogoDepuisApparence: () => ({}),
    lireDuelsServis: async () => j, duelContrat: (x) => (x && x.contrat) || null,
    rpc: async (m) => { if (m === 'eth_blockNumber') return '0x' + tete.toString(16); throw new Error(m); }, rpcReseau: async (m) => { if (m === 'eth_blockNumber') return '0x' + tete.toString(16); throw new Error(m); }, rpcTete,
    peindreDuels: async () => null, peindreDuelsMap: async () => null, tirerFaceDeRoll: () => ({ guess: [0, 1, 2, 3, 4], apparence: {} }), bcSolde: async () => 10_000_000n, symDuel: () => 'USDC',
    admisDuel: async () => true, phraseNonConfirme: (r, t) => t, toursAttente: () => 1, pasAttente: () => 0, $: (s) => (s === '#duelForme' ? forme : null),
    envoyerAppels: async (appels, c) => { envois.push({ appels, c }); return { etat: 'CONFIRME', hash: '0x' + 'ab'.repeat(32) }; },
    recusLogs: async () => ({ logs }), setTimeout: () => 0 };
  const noms = Object.keys(env);
  const f = new Function(...noms, srcDuelsDe + srcBoutons + srcSuivi + '\n' + srcLigne + '\n' + srcAction
    + '\nreturn { ligneDuel, actionDuel, duelsDe, noterRecuDuel, margeDuelApp: typeof margeDuelApp === "function" ? margeDuelApp : null };');
  return { env, ...f(...noms.map((k) => env[k])) };
}
const servi = (duels, tete = 53071300, x = {}) => ({ ok: true, etat: 'LU', version: 2, contrat: C, tete, lu: new Date(Date.now()).toISOString(), duels: duels.map((d) => V2.duelEnJson(d)), recents: [], ...x });

/* l horloge du banc est FIGEE (l age d une tete se compte en ms : une ms de plus = un bloc de marge de plus, arrondi prudent) — et figee SUR T
 *   (le `maintenant` en s des duels du banc : expiresAt = T + 600 / T + 9999), JAMAIS sur l heure reelle : avec Date.now() reel le banc rougissait
 *   des que l heure depassait T + 9999 (revue 2026-10-25 : « R7 Cancel confirme de #2 » KO, le duel du banc etait expire pour actionDuel). */
const HORLOGE = (T + 100) * 1000; Date.now = () => HORLOGE;
/* ═══════════════ R5 — le plus grave */
await section('R5 Settle seulement s il tombe dans la fenetre (marge = age de la tete + inclusion)', async () => {
  const t = 53072404;
  /* le test rouge du testeur, a la lettre : tete = t + 256 (0 bloc restant) */
  const acts = V2.actionsDuel(duelPris(t), JOUEUR, t + 256, T);
  const plan = V2.planSettle({ contrat: C, id: '9', targetBlock: t, blocActuel: t + 256 });
  ok(!acts.includes('SETTLE') || plan.etat !== 'PRET', '[testeur] a tete t+256 (0 bloc restant) Settle n est pas construit : il serait mine a t+257 (TooLate)');
  ok(!acts.includes('SETTLE') && plan.etat === 'REFUSE', 'a t+256 : ni bouton Settle (actionsDuel = ' + JSON.stringify(acts) + '), ni plan (' + plan.etat + ')');
  ok(fn('blocsMargeSettle'), 'blocsMargeSettle exporte');
  if (!fn('blocsMargeSettle')) return;
  /* la marge au temps de bloc mesure : 2 s/bloc, tete fraiche -> 0 + max(1, ceil(5 / 2)) = 3 ; tete vieille de 10 s -> +5 */
  const m2 = V2.blocsMargeSettle({ sParBloc: 2, ageTeteMs: 0 }), m2v = V2.blocsMargeSettle({ sParBloc: 2, ageTeteMs: 10000 }), m02 = V2.blocsMargeSettle({ sParBloc: 0.2 }), mNM = V2.blocsMargeSettle({});
  ok(m2 === 3 && m2v === 8 && m02 === 25 && mNM === 25 && V2.MARGE_DEFAUT === 25, 'marge : 3 blocs a 2 s (tete fraiche), 8 avec une tete de 10 s, 25 a 0,2 s, 25 sans mesure (le temps de bloc le plus court attendu) — ' + [m2, m2v, m02, mNM].join('/'));
  ok(V2.blocsMargeSettle({ sParBloc: 30, ageTeteMs: 0 }) >= 1, 'jamais moins d 1 bloc : un settle n entre jamais dans le bloc de tete deja lu');
  /* le dernier appui sur : tete + marge = t + 256 (pire cas : mine au dernier bloc legal) */
  const dernier = t + 256 - m2;
  ok(V2.actionsDuel(duelPris(t), JOUEUR, dernier, T, true, m2).includes('SETTLE') && V2.planSettle({ contrat: C, id: '9', targetBlock: t, blocActuel: dernier, margeBlocs: m2 }).etat === 'PRET',
    'tete t+' + (256 - m2) + ' (marge ' + m2 + ') : Settle propose et construit — mine au plus a t+256');
  const trop = V2.actionsDuel(duelPris(t), JOUEUR, dernier + 1, T, true, m2), pt = V2.planSettle({ contrat: C, id: '9', targetBlock: t, blocActuel: dernier + 1, margeBlocs: m2 });
  const e1 = V2.etatDuel(duelPris(t), dernier + 1, T, m2);
  ok(!trop.includes('SETTLE') && pt.etat === 'REFUSE' && e1.etat === 'TROP_TARD' && e1.blocsAvantDefaut === m2,
    'un bloc plus tard : TROP_TARD, aucun bouton, plan refuse ; le defaut dans ' + e1.blocsAvantDefaut + ' blocs (settleDefault possible a t+257)');
  ok(/^Too late to settle safely: it would land after the window\. The creator wins by default in 3 blocks\.$/.test(pt.pourquoi) && V2.texteCompte(e1, 2) === pt.pourquoi,
    'trop tard, dit clairement (plan et compte a rebours) : « ' + pt.pourquoi + ' »');
  /* le compte a rebours atteint 0 AU dernier appui sur, jamais apres */
  const eD = V2.etatDuel(duelPris(t), dernier, T, m2);
  ok(eD.etat === 'REGLABLE' && eD.blocsRestants === 0 && V2.compteARebours(eD, 2) === 0 && V2.texteCompte(eD, 2) === 'About 0 s left to settle (0 blocks).',
    'compte a rebours : 0 au dernier appui sur (t+' + (256 - m2) + '), soit ' + m2 + ' blocs avant le dernier bloc qui peut inclure la tx');
  const e5 = V2.etatDuel(duelPris(t), t + 1, T, m2);
  ok(e5.blocsRestants === 255 - m2 && e5.blocsFenetre === 255, 'au premier bloc reglable : ' + e5.blocsRestants + ' blocs pour envoyer (255 de fenetre - marge ' + m2 + ')');
  ok(V2.etatDuel(duelPris(t), t + 257, T, m2).etat === 'DEFAULT_CREATOR' && V2.actionsDuel(duelPris(t), JOUEUR, t + 257, T, true, m2).join() === 'SETTLE_DEFAULT', 'a t+257 : le defaut (SETTLE_DEFAULT), inchange');
  /* l app : la marge suit l AGE de la tete qu elle a (tete servie lue il y a 12 s a 2 s/bloc -> +6 blocs) */
  const K = monter({ j: servi([duelPris(t)], t + 100, { lu: new Date(Date.now() - 12000).toISOString() }) });
  ok(typeof K.margeDuelApp === 'function', 'app : margeDuelApp (dans le bloc du suivi)');
  if (K.margeDuelApp) {
    const mv = K.margeDuelApp(K.env.duelsCfg.j, t + 100), mf = K.margeDuelApp({ ...K.env.duelsCfg.j, lu: new Date(Date.now()).toISOString() }, t + 100);
    ok(mv === 3 + 6 && mf === 3, 'app : tete servie de 12 s -> marge ' + mv + ' (3 + 6 blocs d age) ; tete fraiche -> ' + mf);
    /* la carte (ligneDuel reel) a tete t+250 : sans age Settle serait offert (marge 3 : t+253 au plus) ; tete de 12 s : TROP_TARD, dit */
    const li = await K.ligneDuel(V2.duelDepuisJson(K.env.duelsCfg.j.duels[0]), JOUEUR, t + 250, T, true, mv);
    ok(actions(li) === '' && /Too late to settle safely/.test(textes(li)), 'carte (ligneDuel reel) : tete t+250 vieille de 12 s -> pas de Settle, « Too late to settle safely … » (' + textes(li).slice(0, 90) + ')');
    const li2 = await K.ligneDuel(V2.duelDepuisJson(K.env.duelsCfg.j.duels[0]), JOUEUR, t + 250, T, true, mf);
    ok(actions(li2) === 'SETTLE', 'carte : la meme tete, fraiche -> Settle (t+250 + 3 <= t+256)');
  }
  /* actionDuel (reel) : la tete relue a l instant t+254 (marge 3 a 2 s) -> rien n est demande */
  const envois = [];
  const K2 = monter({ j: servi([duelPris(t)], t + 254), tete: t + 254, envois });
  const li3 = el('div'); const p3 = el('p'); p3.dataset.detat = '1'; li3.append(p3);
  await K2.actionDuel('9', 'SETTLE', li3);
  ok(envois.length === 0 && /Too late to settle safely/.test(p3.textContent), 'actionDuel (reel) : Settle a t+254 (marge 3) -> rien n est demande au wallet, « ' + p3.textContent.slice(0, 70) + ' »');
  const envois2 = [];
  const K3 = monter({ j: servi([duelPris(t)], t + 253), tete: t + 253, envois: envois2 });
  const li4 = el('div'); const p4 = el('p'); p4.dataset.detat = '1'; li4.append(p4);
  await K3.actionDuel('9', 'SETTLE', li4);
  ok(envois2.length === 1, 'actionDuel (reel) : Settle a t+253 (dernier appui sur) -> UN envoi');
  /* le brain et le Sign de sa carte : la marge passee ; re-verifiee au Sign */
  ok(/DuelsV2\.etatDuel\(d, D\.block, t, margeDuel\)/.test(BRAIN) && /margeBlocs: margeDuel/.test(BRAIN), 'brain-jeu.js : etatDuel et planSettle v2 avec la marge (D.sParBloc)');
  ok(/if \(p\.kind === 'DUEL_SETTLE' && Duels\.blocsMargeSettle\) \{/.test(APP) && /\? await teteFraiche\(\) : null;/.test(APP), 'Sign d un DUEL_SETTLE du brain : tete relue sur le noeud et plan re-verifie avec la marge');
});

/* ═══════════════ R1 */
await section('R1 le recu du create met le nouveau duel sur la carte du createur', async () => {
  /* le test du testeur, avec la logique NOUVELLE de noterRecuDuel (base absente : le CREATED suffit) */
  const locaux = new Map();
  for (const id of ['2']) { const nd = V2.duelDepuisRecu(null, [evCree(2)].filter((x) => x.id === id)); if (nd) locaux.set(id, nd); }
  const { duels } = V2.fusionnerLocaux([], locaux);
  ok(duels.some((d) => d.id === '2'), '[testeur] le duel #2 (recu en main) est liste');
  ok(/noterRecuDuel\(/.test(srcDefier), '[testeur] defierDuel garde son recu (noterRecuDuel)');
  /* le code REEL : noterRecuDuel + duelsDe, serveur encore sans #2 */
  const j = servi([{ ...duelPris(1), id: '1', joiner: null, guessB: null, targetBlock: null, creator: '0x' + '33'.repeat(20) }]);
  const K = monter({ j, moi: CREA });
  K.noterRecuDuel([evCree(2)]);
  const ds = K.duelsDe(j), d2 = ds.find((x) => x.id === '2');
  ok(d2 && d2.creator === CREA && d2.stake === 100000n && V2.etatDuel(d2, 53071300, T).etat === 'OUVERT', 'code reel : duelsDe montre #2 OUVERT (createur, mise) avant que le serveur ne l ait lu');
  ok(d2 && V2.actionsDuel(d2, CREA, 53071300, T).join() === 'CANCEL', 'le createur a Cancel sur son duel tout neuf');
  const li = await K.ligneDuel(d2, CREA, 53071300, T, true);
  ok(actions(li) === 'CANCEL' && /Your challenge/.test(textes(li)), 'carte (ligneDuel reel) : « Your challenge … », Cancel');
  /* le serveur rattrape : le servi l emporte, le local est oublie */
  const j2 = servi([d2]);
  K.env.duelsCfg.j = j2; K.duelsDe(j2);
  ok(!K.env.duelsCfg.locaux.has('2'), 'le serveur l a lu : la copie locale est oubliee (fusionnerLocaux)');
  /* jamais un duel invente : un JOINED seul d un duel inconnu, un CREATED incoherent */
  ok(V2.duelDepuisRecu(null, [{ type: 'JOINED', id: '5', joiner: JOUEUR, guessB: [1, 1, 1, 1, 1], targetBlock: 9 }]) === null, 'un JOINED d un duel inconnu, sans son CREATED : rien');
  ok(V2.duelDepuisRecu(null, [{ type: 'JOINED', id: '4', joiner: JOUEUR, guessB: [1, 1, 1, 1, 1], targetBlock: 9 }, evCree(4)]) === null, 'un JOINED AVANT le CREATED de son duel (ordre impossible) : rien, jamais un duel sans createur');
  ok(V2.duelDepuisRecu(null, [{ ...evCree(3), stake: 99999n }]) === null && V2.duelDepuisRecu(null, [{ ...evCree(3), guessA: [9, 9, 9, 9, 9] }]) === null && V2.duelDepuisRecu(null, [{ ...evCree(3), creator: '0x' + '0'.repeat(40) }]) === null,
    'un CREATED incoherent (mise < 0,10, guess hors bornes, createur nul) : rien');
  const cj = V2.duelDepuisRecu(null, [evCree(4), { type: 'CANCELLED', id: '4' }]);
  ok(cj && cj.cancelled === true, 'create puis cancel dans le meme recu : le duel est annule');
  ok(/'\/api\/duels\?frais=1'/.test(APP) && /noterRecuDuel\(evsCree\);[\s\S]{0,1500}lireDuelsServis\(true, true\)/.test(srcDefier), 'defierDuel : recu garde, puis /api/duels?frais=1 (le serveur relit avant de repondre)');
});

/* ═══════════════ R2 */
await section('R2 /api/duels : la requete qui suit une ecriture repond avec elle ; plusieurs noeuds', async () => {
  let nextId = 2, now = 0, appels = 0;
  const motAdr = (a) => a.slice(2).padStart(64, '0');
  const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
  const retour = (id) => '0x' + motAdr(CREA) + mot(T + 600 + id) + mot(1) + mot((1 << 16) | (2 << 12) | (3 << 7) | (4 << 3) | 5) + motAdr('0x' + '0'.repeat(40)) + mot(0) + mot(0) + motAdr(USDC) + mot(100000);
  const rpc = async (m, p) => {
    appels += 1;
    await new Promise((r) => setTimeout(r, 5)); /* un vrai noeud repond plus tard que le meme tour */
    if (m === 'eth_blockNumber') return '0x' + (53071267 + now).toString(16);
    if (m === 'eth_call' && p[0].data.startsWith('0x61b8ce8c')) return '0x' + mot(nextId);
    if (m === 'eth_call') return retour(Number(BigInt('0x' + p[0].data.slice(10))));
    throw new Error('unexpected ' + m);
  };
  /* `attendre` : la pause avant un tour force trop proche du precedent avance l horloge du banc (aucune vraie attente) */
  const lecteur = SV.creerLecteurDuelsV2({ rpc, contrat: C, horloge: () => now * 1000, attendre: async (ms) => { now += ms / 1000; } });
  const fiche = { contrat: 'BlockDuelsV2', chaine: 8453, adresse: C, bloc: 53064205, constructeur: {} };
  ok(typeof SV.lireAvantReponse === 'function' && typeof SV.demandeFraiche === 'function', 'duels-v2-serveur.js : lireAvantReponse et demandeFraiche');
  if (typeof SV.lireAvantReponse !== 'function') return;
  /* la route NOUVELLE : lireAvantReponse (attendu sur ?frais=1), puis la reponse */
  const requete = async (url) => { await SV.lireAvantReponse(lecteur, { frais: SV.demandeFraiche(url) }); return SV.reponseDuelsV2({ lecteur, fiche, maintenant: T, sParBloc: 2 }); };
  await lecteur.lire(true);
  now = 1; nextId = 3; /* le duel #2 cree sur la chaine */
  now = 3;
  const r = await requete('/api/duels?frais=1');
  ok(r.ok && r.duels.some((d) => d.id === '2'), '[testeur] la relecture qui suit la creation liste #2 (servis : ' + r.duels.map((d) => d.id).join(',') + ')');
  now = 4; nextId = 4;
  const r2 = await requete('/api/duels');
  ok(!r2.duels.some((d) => d.id === '3'), 'temoin : une requete ordinaire (sans frais) ne relit pas avant 15 s — #3 pas encore servi');
  /* borne (revue 2026-10-25, defaut 2) : 10 requetes fraiches moins de 2 s apres le DEBUT d un tour -> UN seul tour de plus, partage, qui
   *   DEMARRE apres elles (au plus tot 2 s apres le debut du precedent) : jamais « aucun tour » (l ancien comportement servait comme frais un
   *   tour commence AVANT l ecriture) */
  now = 30; nextId = 4; await lecteur.lire(true);
  const a0 = appels; now = 30.5; nextId = 5; /* le duel #4 cree juste apres le debut du tour de 30 s */
  const r10 = await Promise.all(Array.from({ length: 10 }, () => requete('/api/duels?frais=1')));
  ok(appels - a0 === 2 + 4 && now >= 32 && r10.every((x) => x.duels.some((d) => d.id === '4')),
    '10 requetes ?frais=1 0,5 s apres un tour : UN tour de plus (' + (appels - a0) + ' appels), demarre a ' + now + ' s (>= 30 + 2), #4 dans ' + r10.filter((x) => x.duels.some((d) => d.id === '4')).length + '/10 reponses');
  now = 40; nextId = 6; const a1 = appels; /* le duel #5 vient d etre cree, 8 s apres le dernier tour */
  const rs = await Promise.all(Array.from({ length: 10 }, () => requete('/api/duels?frais=1')));
  const parTour = 2 + 5; /* tete + nextId + 5 duels non finaux */
  /* la 1re lance un tour ; les 9 suivantes arrivent APRES son debut (le serveur les traite l une apres l autre : leur heure ne prouve pas
   *   qu il a demarre apres leur ecriture) -> elles partagent UN tour de plus, au plus tot 2 s apres. Au plus 2 tours pour la rafale. */
  ok(appels - a1 === 2 * parTour && now >= 42 && rs.every((x) => x.duels.some((d) => d.id === '5')), '10 requetes fraiches simultanees : 2 tours (' + (appels - a1) + ' appels : le 1er + UN partage par les 9 autres, a ' + now + ' s), #5 dans chacune : ' + rs.filter((x) => x.duels.some((d) => d.id === '5')).length + '/10');
  /* l attente est bornee : un noeud qui ne repond pas ne bloque pas la reponse plus de attenteMs */
  const lent = SV.creerLecteurDuelsV2({ rpc: () => new Promise(() => {}), contrat: C });
  const t0 = performance.now(); const lu = await SV.lireAvantReponse(lent, { frais: true, attenteMs: 50 }); const dt = Math.round(performance.now() - t0);
  ok(lu === false && dt >= 40 && dt < 1000, 'noeud muet : la reponse part apres ' + dt + ' ms (attente bornee a 50 ms), sans pretendre avoir lu');
  ok(SV.demandeFraiche('/api/duels?frais=1') && SV.demandeFraiche('/api/duels?x=2&frais=1') && !SV.demandeFraiche('/api/duels?frais=10') && !SV.demandeFraiche('/api/duels'), 'demandeFraiche : ?frais=1 exactement');
  /* serveur-web.js : la route attend lireAvantReponse ; le lecteur lit par rpcDuelsV2 (publicnode d abord, plusieurs noeuds) */
  const route = tranche(SRV, "if (chemin === '/api/duels') {", '/* ══ BLOCK MISSIONS');
  ok(/await lireAvantReponse\(lv2, \{ frais: demandeFraiche\(req\.url\) \}\);[\s\S]{0,300}rendreD\(reponseDuelsV2\(/.test(route) && !/void lv2\.lire\(\);/.test(route), 'route /api/duels : attend lireAvantReponse (frais = ?frais=1) puis repond ; plus de « void lv2.lire() » avant la reponse');
  ok(/creerLecteurDuelsV2\(\{ rpc: rpcDuelsV2, contrat: c \}\)/.test(SRV), 'le lecteur v2 lit par rpcDuelsV2 (plus rpcServeur = mainnet.base.org seul)');
  const liste = (SRV.match(/const RPC_DUELS_V2 = [^\n]*\n/) || [''])[0];
  ok(/\['https:\/\/base-rpc\.publicnode\.com'\]\), \.\.\.RPC_LIST, /.test(liste) && /base\.drpc\.org/.test(liste) && /ESSAI_SRV\.actif \? \[ESSAI_SRV\.rpc\]/.test(liste), 'RPC_DUELS_V2 : publicnode d abord, puis RPC_LIST, puis drpc ; le fork seul en mode essai');
  ok(/'\/api\/duels\?frais=1'/.test(APP) && (APP.match(/lireDuelsServis\(true, true\)/g) || []).length >= 4, 'app : ?frais=1 apres chaque recu lu (create, action, panneau, accept du panneau)');
});

/* ═══════════════ REVUE 2026-10-25 (defauts 2, 3, 4 et le Sign du brain) */
/* une fausse chaine dont on tient chaque appel : `porte` bloque nextId() APRES avoir pris sa valeur (un tour en vol qui a deja lu l ancien
 *   etat) ; `panne` fait echouer eth_blockNumber (429) ; `apresTete` avance l horloge du banc entre la tete et la suite (un tour lent) */
function fausseChaine(x = {}) {
  const motAdr = (a) => a.slice(2).padStart(64, '0'), mot = (v) => BigInt(v).toString(16).padStart(64, '0');
  const c = { nextId: 2, tete: 1000, now: 0, porte: null, panne: false, apresTete: 0, debuts: [], ...x };
  c.rpc = async (m, p) => {
    await new Promise((r) => setTimeout(r, 1));
    if (m === 'eth_blockNumber') { c.debuts.push(c.now); if (c.panne) throw new Error('429 Too Many Requests'); const v = c.tete; c.now += c.apresTete; return '0x' + v.toString(16); }
    if (m === 'eth_call' && p[0].data.startsWith('0x61b8ce8c')) { const v = c.nextId; if (c.porte) await c.porte; return '0x' + mot(v); }
    if (m === 'eth_call') return '0x' + motAdr(CREA) + mot(T + 600) + mot(1) + mot((1 << 16) | (2 << 12) | (3 << 7) | (4 << 3) | 5) + motAdr('0x' + '0'.repeat(40)) + mot(0) + mot(0) + motAdr(USDC) + mot(100000);
    throw new Error('unexpected ' + m);
  };
  c.lecteur = SV.creerLecteurDuelsV2({ rpc: c.rpc, contrat: C, horloge: () => c.now * 1000, attendre: async (ms) => { c.now += ms / 1000; } });
  return c;
}
const ficheR = { contrat: 'BlockDuelsV2', chaine: 8453, adresse: C, bloc: 53064205, constructeur: {} };
await section('Revue d2 : un ?frais=1 arrive pendant un tour en vol -> UN tour de plus, demarre APRES la requete', async () => {
  /* la sonde de la revue : un tour demarre a 20 s, lit nextId=2 ; le create est mine (nextId=3) ; l app envoie ?frais=1 ; le tour finit */
  const c = fausseChaine({ now: 20 });
  let ouvrir; c.porte = new Promise((r) => { ouvrir = r; });
  const enVol = c.lecteur.lire(true);
  await new Promise((r) => setTimeout(r, 20)); /* le tour a lu nextId=2 et attend */
  c.nextId = 3; c.now = 21;
  const frais = SV.lireAvantReponse(c.lecteur, { frais: true, attenteMs: 3000 });
  c.porte = null; ouvrir();
  await enVol; const dit = await frais;
  const r = SV.reponseDuelsV2({ lecteur: c.lecteur, fiche: ficheR, maintenant: T, sParBloc: 2 });
  ok(r.duels.some((d) => d.id === '2'), '?frais=1 pendant un tour en vol : la reponse liste #2 (servis : ' + r.duels.map((d) => d.id).join(',') + ') — jamais l ancien tour dit frais');
  ok(dit === true && c.debuts.length === 2 && c.debuts[1] >= 21, 'un tour de plus demarre APRES la requete (debuts des tours : ' + c.debuts.join(', ') + ' s), et la reponse le dit frais (' + dit + ')');
  /* plusieurs ?frais=1 pendant le meme tour en vol : ils partagent LE tour suivant (pas un tour chacun) */
  const c2 = fausseChaine({ now: 50 });
  let ouvrir2; c2.porte = new Promise((r) => { ouvrir2 = r; });
  const v2 = c2.lecteur.lire(true); await new Promise((r) => setTimeout(r, 20)); c2.nextId = 3; c2.now = 51;
  const fs10 = Array.from({ length: 10 }, () => SV.lireAvantReponse(c2.lecteur, { frais: true }));
  /* le partage se voit : deux lire(true) pendant le meme tour en vol rendent LA MEME file ; un lire() ordinaire rend le tour EN VOL lui-meme */
  const fA = c2.lecteur.lire(true), fB = c2.lecteur.lire(true), ord = c2.lecteur.lire();
  ok(fA === fB && fA !== v2 && ord === v2, 'pendant un tour en vol : deux lire(true) = la meme file (' + (fA === fB) + '), distincte du tour en vol (' + (fA !== v2) + ') ; lire() ordinaire = le tour en vol (' + (ord === v2) + ')');
  c2.porte = null; ouvrir2(); await v2; await Promise.all(fs10);
  ok(c2.debuts.length === 2, '10 ?frais=1 pendant un tour en vol : UN seul tour de plus (' + (c2.debuts.length - 1) + ')');
  /* l angle mort de la borne de 2 s : un tour FINI qui a demarre 1 s avant le recu n est pas pris pour frais */
  const c3 = fausseChaine({ now: 100 });
  await c3.lecteur.lire(true); c3.now = 101; c3.nextId = 3;
  const dit3 = await SV.lireAvantReponse(c3.lecteur, { frais: true });
  const r3 = SV.reponseDuelsV2({ lecteur: c3.lecteur, fiche: ficheR, maintenant: T, sParBloc: 2 });
  ok(dit3 === true && r3.duels.some((d) => d.id === '2') && c3.debuts.length === 2 && c3.debuts[1] >= 102,
    'un tour fini commence 1 s avant le recu : un tour de plus, au plus tot 2 s apres le precedent (debuts ' + c3.debuts.join(', ') + ' s), #2 servi');
  /* une lecture ratee n est jamais dite fraiche */
  const c4 = fausseChaine({ now: 200 });
  await c4.lecteur.lire(true); c4.now = 210; c4.panne = true;
  ok(await SV.lireAvantReponse(c4.lecteur, { frais: true }) === false, 'le tour force echoue (429) : lireAvantReponse rend false, pas « frais »');
});
await section('Revue d3 : `lu` servi = l heure de lecture de LA TETE servie, inchangee quand un tour echoue', async () => {
  /* la sonde de la revue : tete lue a 0 s, tour fini a 6 s -> lu = 0 s (pas 6) */
  const c = fausseChaine({ now: 0, apresTete: 6 });
  await c.lecteur.lire(true);
  const r = SV.reponseDuelsV2({ lecteur: c.lecteur, fiche: ficheR, maintenant: T, sParBloc: 2 });
  ok(r.ok && r.tete === 1000 && Date.parse(r.lu) === 0, 'tour lent (tete lue a 0 s, fini a 6 s) : lu = ' + r.lu + ' (attendu 1970-01-01T00:00:00.000Z, l heure de la tete)');
  /* puis un tour rate a 60 s (429) : la tete 1000 reste servie, avec SON heure (0 s), jamais 60 s */
  c.apresTete = 0; c.now = 60; c.tete = 1030; c.panne = true;
  await c.lecteur.lire(true);
  const r2 = SV.reponseDuelsV2({ lecteur: c.lecteur, fiche: ficheR, maintenant: T, sParBloc: 2 });
  ok(r2.tete === 1000 && Date.parse(r2.lu) === 0 && !!r2.erreur, 'tour rate a 60 s : tete 1000 servie avec lu = ' + r2.lu + ' (inchange), erreur dite (' + String(r2.erreur).slice(0, 40) + ')');
  /* et la marge de l app suit : une tete servie vieille de 60 s a 2 s/bloc = +30 blocs */
  const K = monter({ j: { ...r2, lu: new Date(Date.now() - 60000).toISOString() } });
  ok(K.margeDuelApp && K.margeDuelApp(K.env.duelsCfg.j, 1000) === 3 + 30, 'app : cette tete servie de 60 s -> marge ' + (K.margeDuelApp && K.margeDuelApp(K.env.duelsCfg.j, 1000)) + ' (3 + 30)');
});
await section('Revue d4 : rpc() ne rajeunit pas une tete plus ancienne (meme regle que teteFraiche)', async () => {
  const srcRpc = tranche(APP, 'async function rpc(methode, params) {', '\n}\n') + '\n}\n';
  ok(srcRpc.length > 200, 'tranche : rpc() d app.html');
  const lancer = (tete0, reponse) => {
    const f = new Function('rpcReseau', 'tete0', 'let rpcTete = tete0; const rpcCompte = { reseau: 0, cache: 0, fusion: 0 }; const rpcImmuable = new Map(), rpcLogs = new Map(), rpcEnVol = new Map(); const CHAINE = 8453;'
      + 'const rpcCleImmuable = () => null, rpcCleLogs = () => null, rpcGardable = () => false, rpcStocker = () => {};\n' + srcRpc + '\nreturn { rpc, tete: () => rpcTete };');
    return f(async () => reponse, tete0);
  };
  const t0 = Date.now() - 5000; /* hors du cache de 4 s : rpc() va au noeud */
  const R = lancer({ n: 1000, t: t0, v: '0x3e8' }, '0x3e0');
  const lu = await R.rpc('eth_blockNumber', []);
  const apres = R.tete();
  ok(lu === '0x3e0' && apres.n === 1000 && apres.t === t0 && apres.v === '0x3e8', 'un noeud en retard (992 < 1000) : rpcTete inchange (n ' + apres.n + ', t ' + (apres.t === t0 ? 'inchange' : 'RAJEUNI') + ', v ' + apres.v + ')');
  const R2 = lancer({ n: 1000, t: t0, v: '0x3e8' }, '0x3f2');
  await R2.rpc('eth_blockNumber', []);
  ok(R2.tete().n === 1010 && R2.tete().t === Date.now() && R2.tete().v === '0x3f2', 'une tete plus haute (1010) : prise, avec son heure');
});
await section('Revue : le Sign d un DUEL_SETTLE du brain REFUSE quand le duel n est pas dans la liste lue', async () => {
  const i = APP.indexOf("if (p.kind === 'DUEL_SETTLE' && Duels.blocsMargeSettle) {");
  let j = APP.indexOf('{', i), prof = 0, k = j;
  for (; k < APP.length; k++) { if (APP[k] === '{') prof++; else if (APP[k] === '}') { prof--; if (prof === 0) break; } }
  const bloc = i > 0 ? APP.slice(i, k + 1) : '';
  ok(bloc.length > 100, 'tranche : la re-verification au Sign');
  const signer = async ({ duels, tete = 1000 }) => {
    const etapes = [];
    const f = new Function('p', 'Duels', 'duelsDe', 'duelsCfg', 'teteFraiche', 'duelContrat', 'margeDuelApp', 'bcEtape', 'm', 'return (async () => {\n' + bloc + '\nreturn "ENVOYE"; })();');
    const r = await f({ kind: 'DUEL_SETTLE', cle: 'DUEL_SETTLE:9' }, V2, (jj, k2) => (k2 === 'recents' ? [] : duels), { j: {} }, async () => tete, () => C, () => 3, (mm, t) => etapes.push(t), {});
    return { r, etapes };
  };
  const absent = await signer({ duels: [] });
  ok(absent.r !== 'ENVOYE' && absent.etapes.length === 1 && /^Not sent: /.test(absent.etapes[0]), 'duel #9 absent de la liste lue : rien n est envoye (' + JSON.stringify(absent.etapes[0] || null) + ')');
  const sansCible = await signer({ duels: [{ ...duelPris(990), targetBlock: null }] });
  ok(sansCible.r !== 'ENVOYE' && /^Not sent: /.test(sansCible.etapes[0] || ''), 'duel #9 pris mais sans bloc cible lisible : rien n est envoye');
  /* temoin : le meme kind DUEL_SETTLE sert au refundExpired du brain (defi jamais pris, expire : aucune fenetre) — il n est pas bloque */
  const rembourse = await signer({ duels: [{ ...duelPris(990), joiner: null, guessB: null, targetBlock: null }] });
  ok(rembourse.r === 'ENVOYE' && rembourse.etapes.length === 0, 'temoin : duel #9 lu sans joueur (refundExpired du brain) : passe, sans re-verification de fenetre');
  const bon = await signer({ duels: [duelPris(990)], tete: 1000 });
  ok(bon.r === 'ENVOYE' && bon.etapes.length === 0, 'temoin : duel #9 rejoint, tete 1000 (cible 990, marge 3) -> passe');
  const tard = await signer({ duels: [duelPris(990)], tete: 990 + 254 });
  ok(tard.r !== 'ENVOYE' && /Too late to settle safely/.test(tard.etapes[0] || ''), 'temoin : tete cible+254 (marge 3) -> refuse, « Too late … »');
});

/* ═══════════════ R3 */
await section('R3 la regle de la fenetre est dite au createur aussi', async () => {
  const L = APP.split('\n'), i = L.findIndex((l) => l.includes("if (e.etat === 'OUVERT') t2.textContent"));
  const suite = L[i + 2];
  ok(suite && suite.includes('phraseAvantJoin'), '[testeur] la ligne suivante porte phraseAvantJoin');
  ok(suite && !/d\.creator !== moi/.test(suite), '[testeur] elle n est plus cachee au createur (d.creator !== moi)');
  /* EXECUTE : la carte du createur (une simple garde retiree ne suffisait pas : la phrase etait collee a la branche « Open » du ternaire) */
  const ouvert = { ...duelPris(1), id: '3', joiner: null, guessB: null, targetBlock: null };
  const K = monter({ j: servi([ouvert]), moi: CREA, sParBlocApp: 2 });
  const li = await K.ligneDuel(V2.duelDepuisJson(V2.duelEnJson(ouvert)), CREA, 53071300, T, true);
  ok(textes(li).includes(V2.phraseAvantJoin(2)) && /Your challenge/.test(textes(li)), 'carte du createur (ligneDuel reel) : « ' + V2.phraseAvantJoin(2) + ' »');
  const lj = await K.ligneDuel(V2.duelDepuisJson(V2.duelEnJson(ouvert)), JOUEUR, 53071300, T, true);
  ok(textes(lj).includes(V2.phraseAvantJoin(2)) && actions(lj) === 'JOIN', 'carte du joueur : la meme ligne, et Accept');
});

/* ═══════════════ R4 */
await section('R4 un lien ?duel=<id> ouvre la carte sur ce duel ; « Copy link » sur un duel ouvert', async () => {
  ok(/get\(['"]duel['"]\)/.test(APP), '[testeur] un parametre ?duel= est lu au chargement');
  ok(/[?&#]duel=/.test(APP), '[testeur] la carte rend un lien qui porte l id du duel');
  /* EXECUTE : le demarrage reel */
  const src = tranche(APP, '(function duelDemarrage() {', '})();');
  ok(src.length > 50, 'tranche : duelDemarrage');
  if (src) {
    const lance = (q) => { const vus = []; new Function('paramsLien', 'setTimeout', 'ouvrirDuel', src + '})();')(new URLSearchParams(q), (f) => f(), (id) => vus.push(id)); return vus; };
    ok(lance('?duel=7').join() === '7' && lance('?duel=12&chain=8453').join() === '12', '?duel=7 -> ouvrirDuel("7")');
    ok(lance('?duel=abc').length === 0 && lance('?duel=0').length === 0 && lance('?duel=' + '9'.repeat(31)).length === 0 && lance('').length === 0, 'id mal forme, 0, trop long, absent : rien');
  }
  const ouvert = { ...duelPris(1), id: '7', joiner: null, guessB: null, targetBlock: null };
  const K = monter({ j: servi([ouvert]), moi: CREA });
  const li = await K.ligneDuel(V2.duelDepuisJson(V2.duelEnJson(ouvert)), CREA, 53071300, T, true);
  const b = li.tous().find((c) => c.tag === 'button' && c.dataset.lien);
  ok(b && b.dataset.lien === '7' && b.textContent === 'Copy link' && actions(li) === 'CANCEL', 'duel ouvert : « Copy link » (data-lien 7) a cote de Cancel');
  const pris = await K.ligneDuel(duelPris(53071200), CREA, 53071300, T, true);
  ok(!pris.tous().some((c) => c.dataset && c.dataset.lien), 'duel deja pris : pas de lien');
  const srcLien = (APP.match(/const lienDuel = [^\n]*\n/) || [''])[0];
  const lienDuel = srcLien ? new Function('location', srcLien + 'return lienDuel;')({ origin: 'https://tokenizedblock.space', pathname: '/' }) : null;
  ok(lienDuel && lienDuel('7') === 'https://tokenizedblock.space/?duel=7', 'le lien copie : https://tokenizedblock.space/?duel=7');
});

/* ═══════════════ R6 */
await section('R6 le suivi recule sur 429 et ne lit jamais plus d une fois par temps de bloc', async () => {
  /* le test du testeur, a la lettre */
  let appels = 0, t = 0;
  const d = { ...duelPris(100) };
  await V2.suivreDuel({ duel: d, sParBloc: () => 2, horloge: () => t, attendre: async (ms) => { t += ms; }, maxMs: 60000,
    lireTete: async () => { appels += 1; if (appels > 1) throw new Error('429 Too Many Requests'); return 101; },
    lireStatut: async () => { appels += 1; throw new Error('429 Too Many Requests'); } });
  ok(appels <= 20, '[testeur] 60 s de 429 : la boucle recule (' + appels + ' appels au noeud)');
  /* un noeud sain a 2 s/bloc : jamais plus d un appel par temps de bloc (60 s -> au plus 31) */
  let a2 = 0, t2 = 0; const instants = [];
  await V2.suivreDuel({ duel: { ...duelPris(1000) }, sParBloc: () => 2, horloge: () => t2, attendre: async (ms) => { t2 += ms; }, maxMs: 60000,
    lireTete: async () => { a2 += 1; instants.push(t2); return 1000 + Math.floor(t2 / 2000) - 5; }, lireStatut: async () => { a2 += 1; instants.push(t2); return 'Joined'; } });
  ok(a2 <= 32, 'noeud sain, 2 s/bloc, 60 s : ' + a2 + ' appels (16 pas de 4 s, tete + statut : un appel par temps de bloc en moyenne)');
  /* 429 puis retour : le recul se remet a zero */
  let a3 = 0, t3 = 0; const pauses = [];
  await V2.suivreDuel({ duel: { ...duelPris(10) }, sParBloc: () => 2, horloge: () => t3, attendre: async (ms) => { pauses.push(ms); t3 += ms; }, maxMs: 120000,
    lireTete: async () => { a3 += 1; if (t3 >= 4000 && t3 < 40000) throw new Error('429'); return 11 + Math.floor(t3 / 2000); }, lireStatut: async () => 'Joined' });
  const max = Math.max(...pauses), fin = pauses.slice(-3);
  ok(max <= 30000 && max >= 16000 && fin.every((p) => p <= 4000), 'recul exponentiel plafonne a 30 s (max ' + max + ' ms), remis a zero quand le noeud repond (dernieres pauses ' + fin.join(', ') + ' ms)');
  ok(fn('pauseSuiviMs') && V2.pauseSuiviMs('REGLABLE', 2, { appels: 2, echecs: 0 }) === 4000 && V2.pauseSuiviMs('REGLABLE', 2, { appels: 1, echecs: 3 }) === 16000 && V2.pauseSuiviMs('REGLABLE', 2, { appels: 2, echecs: 9 }) === 30000,
    'pauseSuiviMs : 2 appels a 2 s/bloc -> 4 s ; 3 echecs -> x8 ; plafond 30 s');
});

/* ═══════════════ R7 */
await section('R7 « Challenge #N is open » ne survit pas au Cancel de ce duel', async () => {
  const debut = APP.indexOf('async function actionDuel'), fin = APP.indexOf('async function defierDuel');
  ok(debut > 0 && fin > debut && /duelForme/.test(APP.slice(debut, fin)), '[testeur] le chemin du Cancel touche #duelForme');
  /* EXECUTE : actionDuel reel, Cancel confirme du duel #2 nomme sous le formulaire */
  const ouvert = { ...duelPris(1), id: '2', joiner: null, guessB: null, targetBlock: null };
  const forme = el('p'); forme.hidden = false; forme.textContent = 'Challenge #2 is open — …'; forme.dataset.duel = '2';
  const envois = [];
  const logCancel = { address: C, topics: [topic('Cancelled(uint256)'),'0x' + (2).toString(16).padStart(64, '0')], data: '0x', blockNumber: '0x1', logIndex: '0x0', transactionHash: '0x' + '03'.repeat(32) };
  const K = monter({ j: servi([ouvert]), moi: CREA, envois, forme, logs: [logCancel] });
  const li = el('div'); const p = el('p'); p.dataset.detat = '1'; li.append(p);
  await K.actionDuel('2', 'CANCEL', li);
  ok(envois.length === 1 && forme.hidden === true && forme.textContent === '', 'Cancel confirme de #2 : la ligne sous le formulaire est effacee (' + JSON.stringify(forme.textContent) + ')');
  /* une ligne qui parle d un AUTRE duel reste */
  const forme2 = el('p'); forme2.textContent = 'Challenge #5 is open — …'; forme2.dataset.duel = '5';
  const K2 = monter({ j: servi([ouvert]), moi: CREA, envois: [], forme: forme2, logs: [logCancel] });
  await K2.actionDuel('2', 'CANCEL', li);
  ok(forme2.hidden === false && /#5/.test(forme2.textContent), 'la ligne d un autre duel (#5) reste');
  ok(/if \(dd && etat2\(dd\) !== 'OUVERT'\) \{ f\.hidden = true; f\.textContent = ''; delete f\.dataset\.duel; \}/.test(APP), 'peindreDuels : la ligne s efface aussi quand son duel n est plus ouvert (pris, expire, annule ailleurs)');
});

console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) ; NE PROUVE PAS un vrai wallet, un vrai noeud sous 429, ni le rendu');
process.exitCode = ko ? 1 : 0;
