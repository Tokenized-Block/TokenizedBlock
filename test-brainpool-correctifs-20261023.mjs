/* test-brainpool-correctifs-20261023.mjs — les correctifs de la revue adverse du pot des recompenses (branche brainpool, 2026-10-23).
 * LIVE (eth_call Base, revue adverse) : owner de TicketPot 0x31e0… != verifier 0x37eb…. Avant ce correctif : la carte « Switch to the
 *   verifier » revenait a CHAQUE tour (potSign ignorait `seen`) et POT_FUND n etait jamais atteint ; le verifier n avait aucun coup de pot.
 * AFFIRME :
 *   (D1) owner != verifier : POT_SIGN est une INFORMATION montree une fois (cle dans seen) ; au tour suivant l ordre continue a POT_FUND
 *        (repro 5 tours) ; le wallet VERIFIER (pas l owner) recoit POT_SIGN signable, et rien d autre du pot (ni close, ni fund).
 *   (R1) /api/ticketpot/parts en cache serveur : 60 s par jour+mode, vol partage, invalide sur POST signature (une generation : un calcul
 *        en vol au moment de l invalidation n est pas garde) ; la lecture de chaine (lireJour) en cache par jour.
 *   (R2) couverture : POT_SIGN seulement si le serveur dit couverture.complete === true pour ce jour (absent / faux / inconnu -> rien) ;
 *        couvertureParts (pur) : registre ne depuis le debut, curseur des rolls passe la fin, skins lus chaque jour.
 *   (R3) deja verse aujourd hui : dayPot(aujourd hui) LU sur la chaine (un majorant de ce que l owner a verse), max avec l historique local ;
 *        non lu -> aucun fund ; au Sign, dayPot relu.
 * Mutants : sur des COPIES (fichier a cote, efface apres, ou texte extrait en memoire). NE PROUVE PAS : un wallet reel, une signature reelle. */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import * as J from './brain-jeu.js';
import * as TP from './ticketpot-plan.js';
import { selecteur } from './keccak.js';

let n = 0;
const vu = (c, m) => { if (!c) { console.error('KO ' + m); process.exit(1); } n++; };
const W = '0x' + '1'.repeat(40), AUTRE = '0x' + '2'.repeat(40), VER = '0x' + '3'.repeat(40), TPC = '0x' + 'e'.repeat(40);
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const sec = (y, mo, d, h = 10) => Math.floor(Date.UTC(y, mo, d, h) / 1000);
const MER = sec(2026, 9, 21);
const jourC = (s) => Math.floor(s / 86400);
const part = (w, sig = null, amount = '1000000') => ({ wallet: w, amount, signature: sig, donnees: { primaryType: 'Claim', message: { wallet: w, amount } } });
const lesParts = (t, liste, x = {}) => ({ ok: true, jourId: TP.jourIdDeDay(jourC(t) - 1), day: jourC(t) - 1, mode: 'JOUR', contrat: TPC, verifier: VER, ferme: true, parts: liste, couverture: { complete: true }, ...x });
const etat = (t, x = {}, y = {}) => ({ authorized: true, wallet: W, now: t, budgetUsdc: '0', spentUsdc: '0', balanceUsdc: '50000000',
  rules: { rolls: false, settle: false, pot: true, potDailyUsdc: '2000000' }, history: [], seen: [], rolls: null, missions: null, skins: null,
  pot: { contract: TPC, usdc: USDC, owner: W, veille: { day: jourC(t) - 1, jourId: TP.jourIdDeDay(jourC(t) - 1), ferme: true, reste: '0', potAtClose: '4000000', verifier: VER },
    today: { day: jourC(t), dayPot: '0' }, sharesDay: lesParts(t, [part(AUTRE)]), sharesWeek: null, ...x }, ...y });

/* ══ D1 : owner != verifier — la repro de la revue (5 tours) ══ */
{
  let seen = [];
  const tours = [];
  for (let i = 0; i < 5; i++) {
    const p = J.prochaineProposition({ ...etat(MER), seen });
    tours.push(p.kind + (p.sign ? ':' + p.sign.signerIsVerifier : ''));
    /* l app pose la cle de la carte d INFORMATION dans seen des qu elle la montre (bjMontrer) */
    if (p.kind === 'POT_SIGN' && !p.sign.signerIsVerifier) seen = [...seen, p.cle];
  }
  vu(tours[0] === 'POT_SIGN:false', 'tour 1 : POT_SIGN montre a l owner (pas le verifier) comme information : ' + tours[0]);
  vu(tours.slice(1).every((k) => k === 'POT_FUND'), 'tours 2..5 : la cle vue est honoree, l ordre continue a POT_FUND (avant : POT_SIGN a chaque tour) : ' + tours.join(' '));
}
{
  const p = J.prochaineProposition({ ...etat(MER), seen: ['POT_SIGN:' + TP.jourIdDeDay(jourC(MER) - 1)] });
  vu(p.kind === 'POT_FUND' && p.costUsdc === '2000000', 'owner != verifier, information deja vue : POT_FUND propose (2 USDC)');
  const r = J.prochaineProposition({ ...etat(MER, {}, { rules: { pot: true, potDailyUsdc: '0' } }), seen: ['POT_SIGN:' + TP.jourIdDeDay(jourC(MER) - 1)] });
  vu(r.kind === 'NONE' && /verifier/.test(r.why), 'information vue, rien a verser : NONE qui DIT que les parts attendent le verifier : ' + r.why.slice(0, 120));
}
/* le wallet VERIFIER (pas l owner) : POT_SIGN signable, jamais close ni fund */
{
  const pv = J.prochaineProposition(etat(MER, {}, { wallet: VER }));
  vu(pv.kind === 'POT_SIGN' && pv.sign.signerIsVerifier === true && pv.sign.verifier === VER && pv.sign.shares.length === 1, 'wallet verifier (pas l owner) : POT_SIGN signable par CE wallet');
  /* une cle vue ne masque PAS le travail du verifier : au-dela de 50 parts, la carte suivante doit revenir */
  const pv2 = J.prochaineProposition({ ...etat(MER, {}, { wallet: VER }), seen: ['POT_SIGN:' + TP.jourIdDeDay(jourC(MER) - 1)] });
  vu(pv2.kind === 'POT_SIGN' && pv2.sign.signerIsVerifier === true, 'verifier : il reste des parts non signees -> POT_SIGN revient (la cle vue ne bloque que l information de l owner)');
  const vf = J.prochaineProposition(etat(MER, { sharesDay: lesParts(MER, [part(AUTRE, '0x' + 'ab'.repeat(65))]), veille: { day: jourC(MER) - 1, jourId: TP.jourIdDeDay(jourC(MER) - 1), ferme: false, reste: '3000000', potAtClose: '0', verifier: VER } }, { wallet: VER }));
  vu(vf.kind === 'NONE', 'verifier (pas l owner) : ni POT_CLOSE (pot d hier ouvert) ni POT_FUND — kind ' + vf.kind);
  vu(J.prochaineProposition(etat(MER, {}, { wallet: AUTRE })).kind === 'NONE', 'ni owner ni verifier : aucun coup de pot');
}
/* ══ R2 : la couverture de l index de tickets ══ */
for (const [nom, cv] of [['absente', undefined], ['fausse', { complete: false }], ['texte', { complete: 'true' }], ['null', null]]) {
  const p = J.prochaineProposition(etat(MER, { sharesDay: lesParts(MER, [part(AUTRE)], { couverture: cv }) }, { wallet: VER }));
  vu(p.kind !== 'POT_SIGN', 'couverture ' + nom + ' : aucune part finale proposee a signer (verifier) — kind ' + p.kind);
  const o = J.prochaineProposition(etat(MER, { sharesDay: lesParts(MER, [part(AUTRE)], { couverture: cv }) }));
  vu(o.kind === 'POT_FUND' && !/POT_SIGN/.test(o.kind), 'couverture ' + nom + ' : l owner ne voit pas la carte d information, l ordre continue au fund');
}
vu(/does not cover/.test(J.prochaineProposition(etat(MER, { sharesDay: lesParts(MER, [part(AUTRE)], { couverture: { complete: false } }) }, { wallet: VER })).why), 'couverture fausse : le pourquoi le DIT');
/* ══ R3 : deja verse aujourd hui LU sur la chaine (dayPot) ══ */
{
  const vu1 = ['POT_SIGN:' + TP.jourIdDeDay(jourC(MER) - 1)];
  const f = (today, hist = []) => J.prochaineProposition({ ...etat(MER, { today, sharesDay: null }), seen: vu1, history: hist });
  vu(f({ day: jourC(MER), dayPot: '2000000' }).kind === 'NONE', 'dayPot(aujourd hui) = 2 USDC LU, historique local VIDE (autre appareil) : aucun fund');
  vu(f({ day: jourC(MER), dayPot: '1500000' }).costUsdc === '500000', 'dayPot = 1.5 : le fund propose le reste (0.5)');
  vu(f({ day: jourC(MER), dayPot: '500000' }, [{ t: MER - 60, kind: 'POT_FUND', day: jourC(MER), usdc: '1500000' }]).costUsdc === '500000', 'historique 1.5 > dayPot 0.5 : le plus grand des deux compte (0.5 propose)');
  vu(f(null).kind === 'NONE' && /not read/.test(f(null).why), 'dayPot non lu : aucun fund, dit');
  vu(f({ day: jourC(MER) - 1, dayPot: '0' }).kind === 'NONE', 'dayPot lu pour un AUTRE jour : aucun fund');
  vu(f({ day: jourC(MER), dayPot: 'x' }).kind === 'NONE', 'dayPot illisible : aucun fund');
  vu(typeof TP.appelDayPot === 'function' && TP.appelDayPot(TPC, 5).to === TPC && TP.appelDayPot(TPC, 5).data === selecteur(TP.SIG_DAY_POT) + '5'.padStart(64, '0'), 'appelDayPot : eth_call dayPot(uint32) encode');
  vu(TP.lireUintMot('0x' + 'f'.padStart(64, '0')) === 15n && TP.lireUintMot('0x') === null && TP.lireUintMot(null) === null && TP.lireUintMot('0x12') === null, 'lireUintMot : un mot de 32 octets, sinon null');
}
/* MUTANTS du module (copie a cote, effacee apres) */
const src = readFileSync(new URL('./brain-jeu.js', import.meta.url), 'utf8');
async function mutant(nom, de, vers, rougit) {
  vu(src.split(de).length === 2, 'mutant ' + nom + ' : le motif existe une fois');
  const url = new URL('./brain-jeu.mutant-bp-' + process.pid + '-' + n + '.js', import.meta.url);
  writeFileSync(url, src.replace(de, vers));
  try { const M = await import(url.href); vu(rougit(M) === true, 'MUTANT ' + nom + ' : l assertion ROUGIT'); }
  finally { try { unlinkSync(url); } catch (_) {} }
}
const cleS = 'POT_SIGN:' + TP.jourIdDeDay(jourC(MER) - 1);
await mutant('information vue ignoree', 'if (!signe && vus.has(cle))', 'if (false)', (M) => M.prochaineProposition({ ...etat(MER), seen: [cleS] }).kind === 'POT_SIGN');
await mutant('verifier sans role', "const verificateur = ADR.test(verifServi) && verifServi === moi;", 'const verificateur = false;', (M) => M.prochaineProposition(etat(MER, {}, { wallet: VER })).kind === 'NONE');
await mutant('couverture ignoree', 'if (!src.couverture || src.couverture.complete !== true)', 'if (false)', (M) => M.prochaineProposition(etat(MER, { sharesDay: lesParts(MER, [part(AUTRE)], { couverture: { complete: false } }) }, { wallet: VER })).kind === 'POT_SIGN');
await mutant('dayPot ignore', 'const verse = verseHist > dejaLu ? verseHist : dejaLu;', 'const verse = verseHist;', (M) => M.prochaineProposition({ ...etat(MER, { today: { day: jourC(MER), dayPot: '2000000' }, sharesDay: null }) }).kind === 'POT_FUND');
await mutant('verifier recoit le fund', 'const etapes = proprio ? [potClose, potSign, potFund] : [potSign];', 'const etapes = [potClose, potSign, potFund];', (M) => M.prochaineProposition(etat(MER, { sharesDay: null }, { wallet: VER })).kind === 'POT_FUND');

/* ══ R1 + R2 cote serveur : le module pur (cache + couverture) ══ */
vu(existsSync(new URL('./ticketpot-parts-serveur.js', import.meta.url)), 'ticketpot-parts-serveur.js existe');
const S = await import('./ticketpot-parts-serveur.js');
{
  let t = 1000000, appels = 0;
  const c = S.cacheTemporise({ ttlMs: 60000, ttlEchecMs: 15000, horloge: () => t });
  const calcul = async () => { appels++; return { ok: true, n: appels }; };
  const [a, b] = await Promise.all([c.obtenir('J#S', calcul), c.obtenir('J#S', calcul)]);
  vu(appels === 1 && a.n === 1 && b.n === 1, 'deux requetes simultanees : UN calcul (vol partage)');
  t += 59000; await c.obtenir('J#S', calcul);
  vu(appels === 1, 'dans les 60 s : servi du cache, aucun calcul');
  t += 2000; const d = await c.obtenir('J#S', calcul);
  vu(appels === 2 && d.n === 2, 'apres 60 s : recalcule');
  c.invalider('J#S'); await c.obtenir('J#S', calcul);
  vu(appels === 3, 'invalide (POST signature) : recalcule au prochain GET');
  await c.obtenir('J', calcul);
  vu(appels === 4, 'jour et semaine : deux cles distinctes');
  /* un echec est garde moins longtemps (15 s), jamais 60 s ; une exception aussi (pas de tempete sur une chaine en panne) */
  let ko = 0; const echec = async () => { ko++; return { ok: false, etat: 'NON_LU' }; };
  await c.obtenir('E', echec); t += 10000; await c.obtenir('E', echec);
  vu(ko === 1, 'un echec est garde 15 s (pas de tempete)');
  t += 6000; await c.obtenir('E', echec);
  vu(ko === 2, 'apres 15 s : un echec est relu');
  let jet = 0; const jette = async () => { jet++; throw new Error('rpc'); };
  let pris = 0; for (let i = 0; i < 3; i++) { try { await c.obtenir('X', jette); } catch (_) { pris++; } }
  vu(jet === 1 && pris === 3, 'une exception : relancee a chaque appelant, UN seul appel RPC dans les 15 s');
  /* la generation : un calcul en vol pendant une invalidation n est PAS garde (sinon 60 s de signatures perimees) */
  let lache; const lent = () => new Promise((r) => { lache = r; });
  const enVol = c.obtenir('G', lent);
  c.invalider('G');
  lache({ ok: true, v: 'perime' }); await enVol;
  let ap = 0; const r2 = await c.obtenir('G', async () => { ap++; return { ok: true, v: 'neuf' }; });
  vu(ap === 1 && r2.v === 'neuf', 'invalide pendant le vol : le resultat perime n est pas garde');
  const petit = S.cacheTemporise({ max: 3, horloge: () => t });
  for (const k of ['a', 'b', 'c', 'd']) await petit.obtenir(k, calcul);
  vu(petit.taille() <= 3, 'borne : au plus max cles (' + petit.taille() + ')');
}
{
  const JMS = 86400000, debut = jourC(MER - 86400) * JMS, fin = debut + JMS, jid = TP.jourIdDeDay(jourC(MER) - 1);
  const ok = { debutMs: debut, finMs: fin, joursIds: [jid], registreDepuis: new Date(debut - 5 * JMS).toISOString(), rolls: { curseurTs: fin / 1000 + 10 }, skins: { joursLus: { [jid]: new Date(debut + 3600000).toISOString() } } };
  const c0 = S.couvertureParts(ok);
  vu(c0.complete === true && c0.registre === true && c0.rolls === true && c0.skins === true, 'tout couvert : complete');
  vu(/client/i.test(String(c0.volume)), 'le volume poste par les clients est DIT (aucun curseur ne le couvre)');
  vu(S.couvertureParts({ ...ok, rolls: { curseurTs: fin / 1000 - 1 } }).complete === false, 'curseur des rolls avant la fin du jour : pas couvert');
  vu(S.couvertureParts({ ...ok, rolls: { curseurTs: null } }).complete === false, 'horodatage du curseur non lu : pas couvert (jamais suppose)');
  vu(S.couvertureParts({ ...ok, rolls: null }).complete === true && S.couvertureParts({ ...ok, rolls: null }).rolls === null, 'pas de contrat de rolls : la source ne compte pas');
  vu(S.couvertureParts({ ...ok, skins: { joursLus: {} } }).complete === false, 'skins jamais lus ce jour-la : pas couvert');
  vu(S.couvertureParts({ ...ok, registreDepuis: new Date(debut + 1000).toISOString() }).complete === false, 'registre ne APRES le debut du jour : pas couvert');
  vu(S.couvertureParts({ ...ok, registreDepuis: 'x' }).complete === false && S.couvertureParts({}).complete === false, 'registre illisible / rien : pas couvert');
  const sem = ['J2026-10-12', 'J2026-10-13'];
  vu(S.couvertureParts({ ...ok, joursIds: sem, skins: { joursLus: { 'J2026-10-12': 'x' } } }).complete === false, 'semaine : un jour sans lecture des skins -> pas couverte');
  vu(S.couvertureParts({ ...ok, joursIds: [] }).complete === false, 'aucun jour : pas couvert');
  /* mutant (texte en memoire -> fichier copie, efface) : le controle du curseur retire */
  const ss = readFileSync(new URL('./ticketpot-parts-serveur.js', import.meta.url), 'utf8');
  const motif = 'Number.isFinite(Number(rolls.curseurTs)) && rolls.curseurTs !== null && Number(rolls.curseurTs) * 1000 >= finMs';
  vu(ss.split(motif).length === 2, 'mutant curseur : motif present une fois');
  const u = new URL('./ticketpot-parts-serveur.mutant-' + process.pid + '.js', import.meta.url);
  writeFileSync(u, ss.replace(motif, 'true'));
  try { const M = await import(u.href); vu(M.couvertureParts({ ...ok, rolls: { curseurTs: fin / 1000 - 1 } }).complete === true, 'MUTANT curseur retire : un jour pas couvert passerait — l assertion ROUGIT'); } finally { try { unlinkSync(u); } catch (_) {} }
  const motif2 = 'if ((gen.get(cle) || 0) === g) m.set(cle, { t: horloge(), valeur: v,';
  vu(ss.split(motif2).length === 2, 'mutant generation : motif present une fois');
  const u2 = new URL('./ticketpot-parts-serveur.mutant2-' + process.pid + '.js', import.meta.url);
  writeFileSync(u2, ss.replace(motif2, 'if (true) m.set(cle, { t: horloge(), valeur: v,'));
  try {
    const M = await import(u2.href); const c = M.cacheTemporise({ horloge: () => 1 });
    let lache; const e = c.obtenir('G', () => new Promise((r) => { lache = r; })); c.invalider('G'); lache({ ok: true, v: 'perime' }); await e;
    const r = await c.obtenir('G', async () => ({ ok: true, v: 'neuf' }));
    vu(r.v === 'perime', 'MUTANT generation retiree : le perime serait garde — l assertion ROUGIT');
  } finally { try { unlinkSync(u2); } catch (_) {} }
}
/* ══ le cablage serveur (source) ══ */
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const bloc = srv.slice(srv.indexOf("if (chemin === '/api/ticketpot/parts' || chemin === '/api/ticketpot/signature') {"), srv.indexOf("if (chemin === '/api/jeu/niveau') {"));
vu(/import \{ cacheTemporise, couvertureParts \} from '\.\/ticketpot-parts-serveur\.js';/.test(srv), 'serveur : importe le module');
vu(/'ticketpot-parts-serveur\.js'/.test(srv.match(/const SERVIS\s*=\s*\[([\s\S]*?)\];/)[1]) === false, 'module serveur : PAS dans SERVIS (rien a servir au navigateur)');
vu(/partsCacheTP\.obtenir\(jourId \+ \(semaineQ \? '#S' : ''\), \(\) => partsDe\(jourId, semaineQ\)\)/.test(bloc), 'GET : servi par le cache jour+mode');
vu(/jourChaineTP\.obtenir\(day, \(\) => lireJourTicketPot\(\{ rpc: rpcServeur, contrat: contratTP \}, day\), \(x\) => !!x\)/.test(bloc), 'lireJour : en cache par jour (le POST ne relit pas 6 appels par part)');
vu(/partsCacheTP\.invalider\(cleSig\);/.test(bloc) && bloc.indexOf('partsCacheTP.invalider(cleSig);') > bloc.indexOf('revenu.ticketpotSig[cleSig][wallet] = {'), 'POST : invalide la cle APRES avoir garde la signature');
vu(/const couverture = couvertureParts\(\{ debutMs: perTP\.debut, finMs: perTP\.fin, joursIds: joursEntre\(perTP\.debut, perTP\.fin\), registreDepuis: revenu\.depuis,/.test(bloc) && /nTickets: tickets\.length, parts,\s*couverture \};/.test(bloc), 'la reponse porte la couverture');
vu(/revenu\.skinsLus\[jour\] = new Date\(\)\.toISOString\(\)/.test(srv), 'chaque lecture reussie des skins note son jour (couverture des skins)');
/* ══ le cablage app (source + re-controle au Sign EXECUTE) ══ */
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const pj = app.slice(app.indexOf('function peindrePotJour('), app.indexOf('async function fondPot()'));
vu(/const verifPot = !!\(tp && tp\.veille && c && \/\^0x\[0-9a-f\]\{40\}\$\/\.test\(String\(tp\.veille\.verifier\)\) && String\(tp\.veille\.verifier\) === String\(c\)\.toLowerCase\(\)\);/.test(pj)
  && /\$\('#bjPotLab'\)\.hidden = !\(proprio \|\| verifPot\)/.test(pj) && /\$\('#bjPotBudgetLab'\)\.hidden = !proprio/.test(pj), 'la case pot montree a l owner ET au verifier ; le budget journalier a l owner seulement');
const debutB = app.indexOf('/* ══ LET THE BRAIN PLAY'), finB = app.indexOf("setInterval(() => { if (bj.on && !document.hidden) void bjTour(); }, 30000);");
const blocA = app.slice(debutB, finB);
vu(/today: \{ day: jourAuj, dayPot: dayPotAuj === null \? null : dayPotAuj\.toString\(\) \}/.test(blocA) && /const dayPotAuj = await bjDayPot\(String\(tp\.contrat\)\.toLowerCase\(\), jourAuj\);/.test(blocA), 'bjTour : dayPot(aujourd hui) lu sur la chaine et donne au module');
vu(/dayPot: p\.kind === 'POT_FUND' \? await bjDayPot\(/.test(blocA), 'au Sign d un fund : dayPot RELU');
const iInfo = blocA.indexOf("if (p.kind === 'POT_SIGN' && !p.sign.signerIsVerifier) {"), finInfo = blocA.indexOf('const skin = p.kind', iInfo);
const info = blocA.slice(iInfo, finInfo);
vu(iInfo > 0 && /bjVol\.ouverte = 0;/.test(info) && /setTimeout\(\(\) => \{ void bjTour\(\); \}, 1500\)/.test(info), 'carte d information : ne BLOQUE pas (la carte se libere, le tour suivant continue)');
const rs = app.slice(app.indexOf('function bjRefusAuSigne('), app.indexOf('function bjSauver(')).replace(/\/\*[\s\S]*?\*\//g, '');
const fabrique = (code) => new Function('bj', 'bjVol', 'compte', 'usdcTexte', code + '\nreturn bjRefusAuSigne;');
const jour = Math.floor(Date.now() / 86400000);
const refus = (code, p, wallet, lu, x = {}) => fabrique(code)({ on: true, budget: '10000000', depense: '0', maxH: 6, pot: true, potBudget: '2000000', history: [], ...x }, { carte: 3 }, wallet, (v) => String(v))(3, p, wallet, lu);
const fund = (c = '2000000') => ({ kind: 'POT_FUND', costUsdc: c, day: jour });
vu(refus(rs, { kind: 'POT_SIGN', costUsdc: '0', sign: { verifier: VER } }, VER, { owner: W, verifier: VER }) === null, 'au Sign : le VERIFIER (pas l owner) signe les parts');
vu(/not the verifier/.test(String(refus(rs, { kind: 'POT_SIGN', costUsdc: '0', sign: { verifier: VER } }, VER, { owner: W, verifier: AUTRE }))), 'au Sign : verifier relu different -> REFUSE');
vu(/not the verifier/.test(String(refus(rs, { kind: 'POT_SIGN', costUsdc: '0', sign: { verifier: VER } }, VER, { owner: W, verifier: null }))), 'au Sign : verifier non relu -> REFUSE');
vu(/owner/.test(String(refus(rs, fund(), VER, { owner: W, verifier: VER, solde: '9000000', dayPot: '0' }))), 'au Sign : le verifier ne verse PAS (fund = owner seulement)');
vu(refus(rs, fund(), W, { owner: W, solde: '9000000', dayPot: '0' }) === null, 'au Sign : fund owner, dayPot 0 -> passe');
vu(/daily reward budget/.test(String(refus(rs, fund('1000000'), W, { owner: W, solde: '9000000', dayPot: '1500000' }))), 'au Sign : dayPot relu 1.5 + 1 > budget 2 -> REFUSE (verse ailleurs)');
vu(/pot could not be read/.test(String(refus(rs, fund(), W, { owner: W, solde: '9000000', dayPot: null }))), 'au Sign : dayPot non relu -> REFUSE');
const motifA = "if (dejaLu + BigInt(p.costUsdc) > BigInt(bj.potBudget) || verse + BigInt(p.costUsdc) > BigInt(bj.potBudget))";
vu(rs.split(motifA).length === 2, 'mutant au Sign : motif dayPot present une fois');
vu(refus(rs.replace(motifA, 'if (verse + BigInt(p.costUsdc) > BigInt(bj.potBudget))'), fund('1000000'), W, { owner: W, solde: '9000000', dayPot: '1500000' }) === null, 'MUTANT dayPot au Sign retire : le fund au-dessus du budget PASSERAIT — l assertion ROUGIT');
console.log('ok brainpool-correctifs - ' + n + ' assertions ; NE PROUVE PAS un wallet ni une signature reels');
