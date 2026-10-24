/* test-duels-v2-suivi-20261024.mjs — APRES UN JOIN, SETTLE EST PROPOSE DES QUE LE BLOC RESULTAT EXISTE (revue BlockDuelsV2 2026-10-24, MOYEN n°1).
 * La cause (revue) : /api/duels sert son cache (relu au plus toutes les 15 s) et la carte se repeint toutes les 20 s ; apres un join, l app ne
 *   gardait rien du recu : le joueur voyait encore OUVERT / Accept pendant ~11 s et Settle apparaissait ~26 s apres le join, pour une fenetre de
 *   ~51 s a 200 ms/bloc (Denim). Sans settle dans la fenetre, le createur gagne par defaut — meme sur une egalite ou une victoire du joueur.
 * EXECUTE (pas lu) :
 *   A. duels-v2-plan.js : duelDepuisRecu (le duel tel que le recu le dit), fusionnerLocaux (la liste servie corrigee par les recus, oubliee des
 *      que le serveur a rattrape), compteARebours / texteCompte (secondes au temps mesure), pasSuiviMs, statutDepuisRetour, suivreDuel (la
 *      boucle de suivi : tete + duel au temps de bloc mesure, jusqu au settle ou a la fin de la fenetre) sur une fausse chaine a 0,2 s/bloc.
 *   B. le code REEL d app.html (duelsDe, ligneDuel, actionDuel, le bloc de suivi) : un serveur EN RETARD (duel encore Open) ne montre plus
 *      Accept au joueur qui vient de rejoindre ; Settle est propose quand la tete locale passe le bloc resultat ; le compte a rebours est dit
 *      en secondes ; apres un Settle confirme, plus de Settle (aucun 2e envoi possible) ; un Accept sur un duel deja pris (lu sur la chaine)
 *      n est pas demande.
 *   C. le scenario de la revue (poc-latence) : vrai module serveur (cache 15 s), join a t=5 s (bloc 1001 -> cible 1003), 0,2 s/bloc : Settle
 *      propose au plus 2 temps de bloc apres le bloc resultat.
 * Modules remplacables (mutants) : DUELS_V2_MODULE, APP_HTML.
 * ⛔ PORTABLE : process.exitCode. NE PROUVE PAS : le rendu dans un navigateur, un vrai wallet, la latence d un vrai noeud public, Base a 200 ms. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { selecteur, topic } from './keccak.js';
import { texteBlocs } from './temps-de-bloc.js';
import { FENETRE } from './blockrolls-plan.js';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.isAbsolute(f) ? f : path.join(ICI, f)).href);
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const V2 = await imp(process.env.DUELS_V2_MODULE || 'duels-v2-plan.js');
const SV = await imp('duels-v2-serveur.js');
const lire = (f) => fs.readFileSync(path.isAbsolute(f) ? f : path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
const APP = lire(process.env.APP_HTML || 'app.html');
const tranche = (t, a, b) => { const i = t.indexOf(a), j = t.indexOf(b, i + 1); return i >= 0 && j > i ? t.slice(i, j) : ''; };
const a = (h) => '0x' + h.repeat(20).slice(0, 40);
const C = a('c2'), USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', A = a('a1'), B = a('b1');
const u = (v) => BigInt(v).toString(16).padStart(64, '0');
const aw = (x) => String(x).toLowerCase().replace(/^0x/, '').padStart(64, '0');
const pack = (g) => (g[0] << 16) | (g[1] << 12) | (g[2] << 7) | (g[3] << 3) | g[4];
const g = (k) => [k % 6, k % 10, k % 19, k % 9, k % 8];
const hx = (v) => '0x' + BigInt(v).toString(16);
const ST = { None: 0, Open: 1, Joined: 2, Settled: 3, Cancelled: 4, Refunded: 5, Defaulted: 6 };
const retourDuel = (d) => '0x' + [aw(d.creator), u(d.expiresAt), u(ST[d.statut]), u(pack(d.guessA)), aw(d.joiner || '0x' + '0'.repeat(40)), u(d.targetBlock || 0), u(d.guessB ? pack(d.guessB) : 0), aw(USDC), u(1_000_000)].join('');
const T = 1_800_000_000;
const ouvert = { id: '1', creator: A, token: USDC, stake: 1_000_000n, guessA: g(1), expiresAt: T + 3600, blocCree: null, joiner: null, guessB: null, targetBlock: null, settled: null, cancelled: false, refunded: false, defaulted: null, creatorBlocks: [] };
const evJoin = { type: 'JOINED', id: '1', joiner: B, guessB: g(2), targetBlock: 1003 };
const has = (f) => typeof V2[f] === 'function';

/* ═══════════════ A. le module de plan v2 */
console.log('— A. duels-v2-plan.js (execute)');
ok(['duelDepuisRecu', 'fusionnerLocaux', 'compteARebours', 'texteCompte', 'pasSuiviMs', 'suivreDuel', 'statutDepuisRetour', 'appelDuelEtat'].every(has), 'exports : duelDepuisRecu, fusionnerLocaux, compteARebours, texteCompte, pasSuiviMs, suivreDuel, statutDepuisRetour, appelDuelEtat');
if (['duelDepuisRecu', 'fusionnerLocaux', 'compteARebours', 'texteCompte', 'pasSuiviMs', 'suivreDuel', 'statutDepuisRetour', 'appelDuelEtat'].every(has)) {
  const j = V2.duelDepuisRecu(ouvert, [evJoin]);
  ok(j && j.joiner === B && j.targetBlock === 1003 && j.guessB.join() === g(2).join() && V2.etatDuel(j, 1002, T).etat === 'ATTENTE' && V2.etatDuel(j, 1004, T).etat === 'REGLABLE', 'duelDepuisRecu(JOINED) : joueur, face, cible 1003 ; ATTENTE a 1002, REGLABLE a 1004');
  ok(V2.duelDepuisRecu(ouvert, [{ ...evJoin, id: '2' }]) === null && V2.duelDepuisRecu(null, [evJoin]) === null && V2.duelDepuisRecu(ouvert, []) === null && V2.duelDepuisRecu(ouvert, [{ ...evJoin, joiner: 'x' }]) === null, 'un recu d un autre duel, sans duel, vide ou mal forme : null (rien n est invente)');
  const st = V2.duelDepuisRecu(j, [{ type: 'SETTLED', id: '1', blockHash: '0x' + '42'.repeat(32), scoreA: 2, scoreB: 3, winner: B, payout: 1_800_000n }]);
  ok(st && st.settled && st.settled.scoreB === 3 && V2.etatDuel(st, 1004, T).etat === 'REGLE' && V2.actionsDuel(st, B, 1004, T).length === 0, 'duelDepuisRecu(SETTLED) : REGLE, aucune action (pas de 2e Settle)');
  const df = V2.duelDepuisRecu(j, [{ type: 'DEFAULT_WON', id: '1', winner: A, payout: 1_800_000n }]);
  ok(df && df.defaulted && df.defaulted.winner === A && V2.etatDuel(df, 2000, T).etat === 'GAGNE_DEFAUT', 'duelDepuisRecu(DEFAULT_WON) : GAGNE_DEFAUT');
  ok(V2.duelDepuisRecu(j, [{ type: 'DEFAULT_WON', id: '1', winner: B, payout: 1n }]) === null && V2.duelDepuisRecu(ouvert, [{ type: 'DEFAULT_WON', id: '1', winner: A, payout: 1n }]) === null,
    'DEFAULT_WON a un autre que le createur (duel rejoint), ou sur un duel jamais rejoint : null');
  const L = new Map([['1', j]]);
  const f1 = V2.fusionnerLocaux([ouvert], L, true);
  ok(f1.duels.length === 1 && f1.duels[0].joiner === B && f1.locaux.has('1'), 'serveur en retard (Open) : le duel LOCAL (rejoint) est montre, garde');
  ok(V2.actionsDuel(f1.duels[0], B, 1001, T).join() === '' && V2.actionsDuel(ouvert, B, 1001, T).join() === 'JOIN', 'le joueur ne voit plus JOIN (le servi seul le montrait)');
  const servi = { ...ouvert, joiner: B, guessB: g(2), targetBlock: 1003 };
  const f2 = V2.fusionnerLocaux([servi], L, true);
  ok(f2.duels[0] === servi && !f2.locaux.has('1'), 'le serveur a rattrape (Joined) : le servi l emporte, le local est oublie');
  const f3 = V2.fusionnerLocaux([servi], new Map([['1', st]]), true);
  ok(f3.duels[0].settled && f3.locaux.has('1'), 'un settle local (recu) plus avance que le servi (Joined) : le local reste');
  const f4 = V2.fusionnerLocaux([], L);
  ok(f4.duels.length === 1 && V2.estFini(f4.duels[0]) === false && V2.estFini(st) === true && V2.estFini(ouvert) === false, 'un local absent de la liste servie : ajoute ; estFini range un settle local avec les finis (recents)');
  ok(V2.compteARebours(V2.etatDuel(j, 1002, T), 0.2) === 0.4 && V2.compteARebours(V2.etatDuel(j, 1004, T), 0.2) === 51 && V2.compteARebours(V2.etatDuel(j, 1004, T), null) === null,
    'compte a rebours au temps mesure : 0,4 s avant le bloc resultat (2 blocs), 51 s de fenetre (255 blocs) ; non mesure : null');
  ok(/^Result block in about 1 s\.$/.test(V2.texteCompte(V2.etatDuel(j, 1002, T), 0.2)) && /^About 51 s left to settle \(255 blocks\)\.$/.test(V2.texteCompte(V2.etatDuel(j, 1004, T), 0.2)) && /^255 blocks left to settle\.$/.test(V2.texteCompte(V2.etatDuel(j, 1004, T), null)),
    'texte : « Result block in about 1 s. », « About 51 s left to settle (255 blocks). », sans mesure : les blocs seulement');
  ok(V2.pasSuiviMs('ATTENTE', 0.2) === 100 && V2.pasSuiviMs('ATTENTE', 2) === 1000 && V2.pasSuiviMs('REGLABLE', 0.2) === 1000 && V2.pasSuiviMs('ATTENTE', null) === 500, 'pas de suivi : un demi-bloc avant le resultat (100 ms a 0,2 s), 1 s dans la fenetre, 500 ms sans mesure');
  ok(V2.appelDuelEtat(7) === selecteur('duels(uint256)') + u(7) && V2.statutDepuisRetour(retourDuel({ creator: A, expiresAt: T, statut: 'Settled', guessA: g(1), joiner: B, targetBlock: 9, guessB: g(2) })) === 'Settled' && V2.statutDepuisRetour('0x') === null,
    'statutDepuisRetour(duels(id)) : Settled lu ; illisible : null');

  /* suivreDuel sur une fausse chaine a 0,2 s/bloc : bloc 1001 a t=0 (le join), cible 1003 (t=0,4 s) */
  const chaine = (statutA = () => 'Joined') => { const c = { t: 0, lus: 0, statuts: 0 };
    c.tete = () => 1001 + Math.floor(c.t / 0.2 + 1e-9);
    c.args = { duel: j, sParBloc: () => 0.2, horloge: () => c.t * 1000, attendre: async (ms) => { c.t += ms / 1000; }, lireTete: async () => { c.lus += 1; return c.tete(); },
      lireStatut: async () => { c.statuts += 1; return statutA(c); }, maxMs: 120000 };
    return c; };
  {
    const c = chaine(), vus = [];
    const fin = await V2.suivreDuel({ ...c.args, surEtat: (x) => vus.push({ t: c.t, ...x }) });
    const premier = vus.find((x) => x.etat === 'REGLABLE'), tResultat = 0.4;
    ok(premier && premier.t - tResultat <= 0.4 + 1e-9 && premier.change === true, 'Settle propose (REGLABLE) a t=' + (premier && premier.t.toFixed(2)) + ' s : au plus 2 temps de bloc (0,4 s) apres le bloc resultat (t=0,4 s)');
    const enFen = vus.filter((x) => x.etat === 'REGLABLE');
    ok(enFen.length >= 40 && enFen.every((x) => Number.isFinite(x.resteS)) && enFen[0].resteS >= 50 && enFen[enFen.length - 1].resteS <= 2, 'dans la fenetre : le compte a rebours en secondes, chaque seconde (' + enFen.length + ' pas, de ' + (enFen[0] && enFen[0].resteS) + ' a ' + (enFen.at(-1) && enFen.at(-1).resteS) + ' s)');
    ok(fin.etat === 'DEFAULT_CREATOR' && vus.at(-1).etat === 'DEFAULT_CREATOR' && vus.at(-1).change === true, 'fenetre passee sans settle : le suivi s arrete sur DEFAULT_CREATOR (la carte montre Settle by default)');
    ok(c.lus < 120 && c.statuts <= 30, 'cout borne : ' + c.lus + ' lectures de tete et ' + c.statuts + ' lectures du duel sur ~52 s');
  }
  {
    const c = chaine((x) => (x.t > 3 ? 'Settled' : 'Joined')), vus = [];
    const fin = await V2.suivreDuel({ ...c.args, surEtat: (x) => vus.push({ t: c.t, ...x }) });
    ok(fin.etat === 'FINI_CHAINE' && fin.duel.finChaine === 'Settled' && c.t < 6 && V2.actionsDuel(fin.duel, B, c.tete(), T).length === 0, 'regle par quelqu un d autre (lu sur la chaine a ~' + c.t.toFixed(1) + ' s) : le suivi s arrete, plus aucune action');
  }
  {
    const c = chaine(); let k = 0;
    c.args.lireTete = async () => { k += 1; if (k <= 3) return null; return c.tete(); };
    const vus = []; await V2.suivreDuel({ ...c.args, maxMs: 2000, surEtat: (x) => vus.push(x) });
    ok(vus.length > 0 && vus.some((x) => x.etat === 'REGLABLE'), 'une tete illisible (3 fois) : le suivi continue, puis propose Settle');
  }
}

/* ═══════════════ B. le code REEL d app.html */
console.log('— B. la carte (code reel d app.html)');
const srcLigne = tranche(APP, 'async function ligneDuel(', '/** la carte Duels');
const srcAction = tranche(APP, 'async function actionDuel(', '/** Challenge :');
const srcDuelsDe = (APP.match(/const duelsDe = [^\n]*\n/) || [''])[0];
const srcBoutons = (APP.match(/const BOUTON_DUEL = [^\n]*\n/) || [''])[0];
const srcSuivi = tranche(APP, '/* ══ LE SUIVI D UN DUEL REJOINT', '/* fin du suivi d un duel rejoint */');
ok(srcLigne.length > 2000 && srcAction.length > 2000 && srcDuelsDe && srcSuivi.length > 500, 'tranches trouvees : ligneDuel, actionDuel, duelsDe, le bloc de suivi');
function el(tag) {
  const x = { tag, className: '', dataset: {}, attrs: {}, children: [], textContent: '', innerHTML: '', hidden: false, type: '',
    setAttribute(k, v) { this.attrs[k] = v; }, append(...c) { this.children.push(...c); },
    tous() { return [this, ...this.children.flatMap((c) => (c && c.tous ? c.tous() : []))]; },
    querySelector(s) { const m = /^\[data-(\w+)(?:="([^"]*)")?\]$/.exec(s); if (!m) return null; return this.tous().find((c) => c.dataset && (m[2] === undefined ? c.dataset[m[1]] !== undefined && c.dataset[m[1]] !== '' : String(c.dataset[m[1]]) === m[2])) || null; },
    querySelectorAll() { return []; } };
  return x;
}
const textes = (li) => li.tous().filter((c) => c.tag === 'p').map((c) => c.textContent).join(' | ');
const boutons = (li) => li.tous().filter((c) => c.tag === 'button').map((c) => c.dataset.action).join();
const jOuvert = { ok: true, etat: 'LU', version: 2, contrat: C, tete: 1001, duels: [V2.duelEnJson(ouvert)], recents: [] };
function monter({ j = jOuvert, tete = 1001, envois = [], logs = [], statut = 'Open' } = {}) {
  const liste = el('div');
  const env = { document: { createElement: el }, Duels: V2, sParBlocApp: 0.2, FENETRE_ROLLS: FENETRE, texteBlocs, duelsCfg: { focus: null, j, locaux: new Map(), suivis: new Set(), teteLocale: null }, compte: B,
    montantDuel: async (b) => String(b) + ' raw', faceDuelHtml: () => '', faceBlocHtml: () => '', courtAdr: (x) => String(x).slice(0, 6), logoSvg: () => '', paramsLogoDepuisApparence: () => ({}),
    lireDuelsServis: async () => j, duelContrat: (x) => (x && x.contrat) || null, _t: tete, _statut: statut, _repeints: 0, _suivis: [],
    rpc: async (m, p) => { if (m === 'eth_blockNumber') return hx(env._t); if (m === 'eth_call' && p[0].data.startsWith(selecteur('duels(uint256)'))) return retourDuel({ creator: A, expiresAt: T + 3600, statut: env._statut, guessA: g(1), joiner: env._statut === 'Open' ? null : B, targetBlock: env._statut === 'Open' ? 0 : 1003, guessB: env._statut === 'Open' ? null : g(2) }); throw new Error(m); },
    rpcReseau: async (m) => { if (m === 'eth_blockNumber') { if (env._pas) env._tR += env._pas; return hx(env._tR ?? env._t); } throw new Error(m); }, rpcTete: { n: 0, t: 0, v: null },
    peindreDuels: async () => { env._repeints += 1; return null; }, peindreDuelsMap: async () => null, tirerFaceDeRoll: () => ({ guess: g(14), apparence: {} }), bcSolde: async () => 10_000_000n, symDuel: () => 'USDC',
    admisDuel: async () => true, phraseNonConfirme: (r, t) => t, toursAttente: () => 400, pasAttente: () => 0, $: (s) => (s === '#duelsListe' ? liste : null),
    envoyerAppels: async (appels, c) => { envois.push({ appels, c }); return { etat: 'CONFIRME', hash: '0x' + 'ab'.repeat(32) }; },
    recusLogs: async () => ({ logs: typeof logs === 'function' ? logs() : logs }), setTimeout: (f) => 0, liste };
  const noms = Object.keys(env).filter((k) => !k.startsWith('_') && k !== 'liste');
  const f = new Function(...noms, '__env', srcDuelsDe + srcBoutons + srcSuivi + '\n' + srcLigne + '\n' + srcAction + '\nreturn { ligneDuel, actionDuel, duelsDe, noterRecuDuel, suivreDuelApp, teteFraiche };');
  const r = f(...noms.map((k) => env[k]), env);
  return { env, ...r };
}
if (srcSuivi) {
  const logJoin = { address: C, topics: [topic('Joined(uint256,address,uint8[5],uint256)'), '0x' + u(1), '0x' + aw(B)], data: '0x' + g(14).map(u).join('') + u(1003), blockNumber: hx(1001), logIndex: '0x0', transactionHash: '0x' + '01'.repeat(32) };
  const envois = [];
  /* le suivi lance par la carte attend sur un setTimeout du banc qui ne rappelle jamais : on voit qu il est LANCE (sa boucle est testee en A) */
  const Kt = monter({ envois, logs: [logJoin] });
  const li = el('div'); const note = el('p'); note.dataset.detat = '1'; li.append(note);
  await Kt.actionDuel('1', 'JOIN', li);
  ok(envois.length === 1 && envois[0].appels[1].data.startsWith(selecteur('join(uint256,uint8[5])')), 'Accept : UN envoi (approve EXACT + join)');
  const loc = Kt.env.duelsCfg.locaux.get('1');
  ok(loc && loc.joiner === B && loc.targetBlock === 1003, 'le recu du join est GARDE localement (joueur, cible 1003)');
  ok(Kt.env.duelsCfg.suivis.has('1') && /Settle shows here as soon as it is in/.test(note.textContent) && Kt.env.duelsCfg.focus === '1', 'le suivi du duel est lance des le recu (plus d attente aveugle dans actionDuel) ; la note le dit, la carte reste sur ce duel');
  const ds = Kt.duelsDe(jOuvert);
  ok(ds.length === 1 && ds[0].joiner === B, 'duelsDe : le serveur sert encore Open, la carte prend le duel du recu (rejoint)');
  const l1 = await Kt.ligneDuel(ds[0], B, 1002, T, true);
  ok(!/JOIN/.test(boutons(l1)) && /Result block in about/.test(textes(l1)), 'tete 1002 : pas d Accept, « Result block in about … » (' + textes(l1).slice(0, 80) + ')');
  const l2 = await Kt.ligneDuel(ds[0], B, 1004, T, true);
  ok(boutons(l2) === 'SETTLE' && /About 51 s left to settle/.test(textes(l2)), 'tete 1004 (bloc resultat passe) : Settle, « About 51 s left to settle »');
  /* Settle : le serveur sert TOUJOURS Open ; le duel local permet le settle, puis le recu le marque regle */
  const logSettle = { address: C, topics: [topic('Settled(uint256,bytes32,uint8,uint8,address,uint256)'), '0x' + u(1), '0x' + aw(B)], data: '0x' + u('0x' + '42'.repeat(32)) + u(2) + u(3) + u(1_800_000), blockNumber: hx(1005), logIndex: '0x0', transactionHash: '0x' + '02'.repeat(32) };
  const env2 = [];
  const K2 = monter({ envois: env2, logs: [logSettle], tete: 1004, statut: 'Joined' });
  K2.env.duelsCfg.locaux.set('1', loc);
  const li2 = el('div'); const n2 = el('p'); n2.dataset.detat = '1'; li2.append(n2);
  await K2.actionDuel('1', 'SETTLE', li2);
  ok(env2.length === 1 && env2[0].appels[0].data === selecteur('settle(uint256)') + u(1), 'Settle avec un serveur en retard (Open) : UN envoi settle(1) (le duel du recu fait foi)');
  const apres = [...K2.duelsDe(jOuvert), ...K2.duelsDe(jOuvert, 'recents')].find((x) => x.id === '1');
  ok(apres && apres.settled && V2.actionsDuel(apres, B, 1006, T).length === 0, 'apres le settle confirme : le duel local est REGLE, plus de Settle (aucun 2e envoi)');
  await K2.actionDuel('1', 'SETTLE', li2);
  ok(env2.length === 1, 'un 2e appui sur Settle : rien n est demande (' + env2.length + ' envoi)');
  /* un autre wallet : Accept sur un duel que la chaine dit deja pris -> rien n est demande */
  const env3 = [];
  const K3 = monter({ envois: env3, statut: 'Joined' });
  const li3 = el('div'); const n3 = el('p'); n3.dataset.detat = '1'; li3.append(n3);
  await K3.actionDuel('1', 'JOIN', li3);
  ok(env3.length === 0 && /already accepted/i.test(n3.textContent), 'Accept sur un duel deja pris (lu sur la chaine) : rien n est demande (' + n3.textContent.slice(0, 70) + ')');
  /* teteFraiche : lit le noeud (pas le cache de 4 s de rpc) */
  const K4 = monter({ tete: 1234 }); K4.env._tR = 1300; /* rpc (cache de 4 s) dirait 1234, le noeud dit 1300 */
  ok((await K4.teteFraiche()) === 1300, 'teteFraiche lit eth_blockNumber par rpcReseau (pas le cache de 4 s de rpc)');
  /* Settle quand rpc (cache) retarde mais que le suivi a lu une tete plus haute */
  const env5 = [];
  const K5 = monter({ envois: env5, logs: [logSettle], tete: 1002, statut: 'Joined' });
  K5.env.duelsCfg.locaux.set('1', loc); K5.env.duelsCfg.teteLocale = 1004;
  const li5 = el('div'); const n5 = el('p'); n5.dataset.detat = '1'; li5.append(n5);
  await K5.actionDuel('1', 'SETTLE', li5);
  ok(env5.length === 1, 'rpc dit 1002 (cache), le suivi a lu 1004 : Settle demande quand meme (' + (n5.textContent || '').slice(0, 50) + ')');
  /* suivreDuelApp (code reel) : la boucle tourne (setTimeout immediat), la tete monte d un bloc par lecture ; repeint a chaque changement d etat */
  const K6 = monter({ tete: 1001, statut: 'Joined' });
  K6.env.duelsCfg.locaux.set('1', loc); K6.env._tR = 1001; K6.env._pas = 1;
  const K6b = (() => { const e = K6.env; return e; })();
  const f6 = new Function(...Object.keys(K6b).filter((k) => !k.startsWith('_') && k !== 'liste'), srcDuelsDe + srcSuivi + '\nreturn suivreDuelApp;');
  const env6 = { ...K6b, setTimeout: (f) => { setImmediate(f); return 0; } };
  const suivre6 = f6(...Object.keys(K6b).filter((k) => !k.startsWith('_') && k !== 'liste').map((k) => env6[k]));
  const fin6 = await suivre6('1');
  ok(fin6 && fin6.etat === 'DEFAULT_CREATOR' && K6.env._repeints >= 2 && K6.env.duelsCfg.teteLocale >= 1003 + 257 && !K6.env.duelsCfg.suivis.has('1'),
    'suivreDuelApp : jusqu a la fin de la fenetre, ' + K6.env._repeints + ' repeints (a chaque changement d etat), tete locale tenue (' + K6.env.duelsCfg.teteLocale + '), suivi libere');
  ok(/const tete = Math\.max\(Number\(j\.tete\), Number\(duelsCfg\.teteLocale\) \|\| 0\)/.test(APP), 'peindreDuels : la tete = la plus haute du serveur et de la lecture locale');
  ok(/if \(e\.etat === 'ATTENTE' \|\| e\.etat === 'REGLABLE'\)/.test(srcLigne) && /data-compte|dataset\.compte/.test(srcLigne), 'ligneDuel : un compte a rebours (data-compte) sur ATTENTE et REGLABLE');
}

/* ═══════════════ C. le scenario de la revue (poc-latence) : serveur reel en retard + client */
console.log('— C. scenario poc-latence (serveur reel, 0,2 s/bloc)');
if (['duelDepuisRecu', 'fusionnerLocaux', 'suivreDuel'].every(has)) {
  const SPB = 0.2;
  let t = 0, statut = 'Open';
  const teteA = (x) => (x < 5 ? 1000 : 1001 + Math.floor((x - 5) / SPB + 1e-9));
  const rpcS = async (m, p) => { if (m === 'eth_blockNumber') return hx(teteA(t)); if (m === 'eth_call') { const d = p[0].data; if (d.length === 10) return '0x' + u(2);
    return retourDuel({ creator: A, expiresAt: 2_000_000_000, statut, guessA: [1, 2, 3, 4, 5], joiner: statut === 'Open' ? null : B, targetBlock: statut === 'Open' ? 0 : 1003, guessB: statut === 'Open' ? null : [0, 1, 2, 3, 4] }); } throw new Error(m); };
  const Lec = SV.creerLecteurDuelsV2({ rpc: rpcS, contrat: C, horloge: () => t * 1000 });
  const fiche = { contrat: 'BlockDuelsV2', chaine: 8453, adresse: C, bloc: 1, constructeur: {} };
  const servi = () => { void Lec.lire(); return SV.reponseDuelsV2({ lecteur: Lec, fiche, maintenant: 1_700_000_000, sParBloc: SPB }); };
  await Lec.lire(true);
  t = 5; statut = 'Joined';
  const jServi = servi();
  const d0 = V2.duelDepuisJson(jServi.duels[0]);
  const local = V2.duelDepuisRecu(d0, [{ type: 'JOINED', id: d0.id, joiner: B, guessB: [0, 1, 2, 3, 4], targetBlock: 1003 }]);
  const locaux = new Map([[d0.id, local]]);
  let offert = null, tResultat = 5 + 2 * SPB, servis = 0;
  await V2.suivreDuel({ duel: local, sParBloc: () => SPB, horloge: () => t * 1000, attendre: async (ms) => { t += ms / 1000; }, lireTete: async () => teteA(t), lireStatut: async () => statut, maxMs: 70000,
    surEtat: (x) => {
      const j = servi(); servis += 1;
      const ds = V2.fusionnerLocaux(j.duels.map(V2.duelDepuisJson).filter(Boolean), locaux, true).duels;
      const tete = Math.max(j.tete, x.tete || 0);
      if (offert === null && V2.actionsDuel(ds[0], B, tete, 1_700_000_000).includes('SETTLE')) offert = t;
    } });
  console.log('   bloc resultat 1003 a t=' + tResultat.toFixed(1) + ' s ; Settle propose au joueur a t=' + (offert === null ? 'jamais' : offert.toFixed(2)) + ' s (avant le correctif : t=26 s)');
  ok(offert !== null && offert - tResultat <= 2 * SPB + 1e-9, 'Settle propose au plus 2 temps de bloc (0,4 s) apres le bloc resultat (ecart ' + (offert === null ? '?' : (offert - tResultat).toFixed(2)) + ' s)');
}
console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) ; NE PROUVE PAS le rendu, un vrai wallet, ni Base a 200 ms');
if (ko) process.exitCode = 1;
