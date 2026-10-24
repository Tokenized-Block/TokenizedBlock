/* test-ticketpot-jours-passes-20261024.mjs - UN POT DE JOUR PAS FERME OU PAS SIGNE A J+1 RESTE PROPOSE PENDANT TOUTE SA GRACE (7 JOURS).
 * Revue adverse du correctif ticketpot (2026-10-24, audit finding 5, partie non corrigee) : peindreFermerPot (le bouton Close) n offrait que
 *   la veille et la semaine reclamable ; le brain (potClose / potSign) ne regardait que la veille (jidHier) : un pot de jour non ferme ou
 *   non signe le lendemain n etait plus jamais propose. Et le dernier jour d une semaine, des parts du JOUR deja entamees faisaient
 *   proposer la suite en mode jour, que le serveur refuse (son dayPot est le pot de la semaine).
 * EXECUTE :
 *  (S) serveur-web.js lireTicketPotSrv + ticketpotJson (decoupes, montes par new Function) ; simules : lireJour par jour (compte ses
 *      lectures, panne a la demande), owner(), l horloge ;
 *  (A) app.html semaineReclamableDe + peindreFermerPot + fermerPot (decoupes) ; vrais closableByAnyoneAt / claimableUntil / planClose ;
 *      simules : le DOM, envoyerAppels (capture les appels), l horloge ;
 *  (B) brain-jeu.js prochaineProposition (le vrai module ; mutants sur des COPIES a cote, effacees).
 * AFFIRME :
 *  S1 tp.jours = J-1..J-7 lus (jamais aujourd hui ni J-8), du plus ancien au plus recent, avec ferme / reste / dernierJourSemaine / owner ;
 *  S2 un jour FERME n est plus relu ; un jour ouvert est relu au plus toutes les 5 min ; une lecture ratee garde l etat d avant ;
 *  S3 un jour sorti de la fenetre (horloge + 1 jour) n est plus servi, meme sans nouvelle lecture ;
 *  A1 mercredi, veille et semaine fermees, le pot de lundi (J-2) ouvert avec 3 USDC : bouton « Close the pot of J2026-10-26 » ; fermerPot
 *     envoie EXACTEMENT planClose(J-2) ; A2 un pot vide -> pas de bouton ; A3 un jour hors grace servi en retard -> pas de bouton ;
 *  A4 un dernier jour de semaine ouvert -> « Close the week's pot of » ;
 *  B1 POT_CLOSE d un jour ouvert de P.jours (planClose de CE jour) ; B2 POT_SIGN d un jour ferme de P.jours (ses parts du jour) ;
 *  B3 J-8, aujourd hui : ignores ; B4 dernier jour de semaine : JAMAIS de parts du JOUR (veille ou P.jours) — la semaine, ou rien ;
 *  B5 la veille passe d abord ; B6 un close deja vu -> le jour suivant.
 *  MUTANTS (copies) : chaque garde retiree -> son scenario ROUGIT.
 * NE PROUVE PAS : une lecture reelle sur Base ni un close / une signature reels. Le CABLAGE de P.jours dans l app (bjTour) est execute
 *   depuis le 2e tour par test-ticketpot-fix3-app-20261024.mjs (C1..C6). */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const lire = (f) => fs.readFileSync(path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
const P = await import(pathToFileURL(path.join(ICI, 'ticketpot-plan.js')).href);
const S = await import(pathToFileURL(path.join(ICI, 'tirage-saison.js')).href);
const J0 = await import(pathToFileURL(path.join(ICI, 'brain-jeu.js')).href);

const CT = '0x' + 'c2'.repeat(20), OWN = '0x' + '0a'.repeat(20), MOI = '0x' + 'b1'.repeat(20), VER = '0x' + '3'.repeat(40), USDC = '0x' + '8'.repeat(40), AUTRE = '0x' + '7'.repeat(40);
const T = Math.floor(Date.UTC(2026, 9, 28, 12) / 1000); /* mercredi 28/10 12:00 UTC */
const AUJ = Math.floor(T / 86400), jid = (d) => P.jourIdDeDay(d);
const DIM = AUJ - 3; /* dimanche 25/10 : dernier jour de la semaine S1 */

/* ---------------------------------------------------------------- (S) le serveur */
function monterSrv(src, horloge, chaine) {
  const a = src.indexOf('const ticketpotSrv = {'), b = src.lastIndexOf('/*', src.indexOf('LES DUELS LUS SUR LA CHAINE'));
  if (a < 0 || b < a) throw new Error('decoupe serveur introuvable');
  class D extends Date { constructor(...x) { if (x.length) super(...x); else super(horloge.t * 1000); } static now() { return horloge.t * 1000; } }
  const lireJour = async (io, day) => {
    chaine.lus[day] = (chaine.lus[day] || 0) + 1;
    if (chaine.panne.has(day)) throw new Error('rpc');
    const x = chaine.jours[day] || { ferme: false, reste: 0n };
    return { verifier: VER, chaine: 8453, enPause: false, ferme: x.ferme, potAtClose: x.ferme ? x.reste : 0n, reste: x.reste };
  };
  const deps = {
    TICKETPOT_DEPLOIEMENT: { adresse: CT, bloc: 1 }, cacheTemporise: () => ({}), jourDe: S.jourDe, JOUR_MS: S.JOUR_MS, dayDeJourIdPot: P.dayDeJourId, lireJourTicketPot: lireJour,
    rpcServeur: async (m) => { if (m === 'eth_call') return '0x' + '0'.repeat(24) + OWN.slice(2); throw new Error('rpc ' + m); }, selecteurSrv: () => '0x8da5cb5b',
    saisonDe: S.saisonDe, jourSemaineReclamable: P.jourSemaineReclamable, jourIdDeDayPot: P.jourIdDeDay, reclamablePotSrv: P.claimableUntil, revenu: { ticketpotSig: {} },
    Date: D, setTimeout: () => ({ unref() {} }), setInterval: () => ({ unref() {} }),
  };
  const noms = Object.keys(deps);
  return new Function(...noms, src.slice(a, b) + '\nreturn { lire: lireTicketPotSrv, json: ticketpotJson, srv: ticketpotSrv };')(...noms.map((k) => deps[k]));
}
async function scenariosSrv(src) {
  const R = {};
  const essai = async (nom, f) => { try { R[nom] = await f(); } catch (e) { R[nom] = false; R[nom + ':err'] = String(e && e.message || e); } };
  const chaineDe = () => ({ lus: {}, panne: new Set(), jours: { [AUJ - 2]: { ferme: false, reste: 3000000n }, [AUJ - 4]: { ferme: true, reste: 2000000n }, [DIM]: { ferme: true, reste: 5000000n }, [AUJ - 5]: { ferme: false, reste: 0n } } });
  await essai('S1-sept-jours-servis', async () => {
    const h = { t: T }, ch = chaineDe(), m = monterSrv(src, h, ch);
    await m.lire();
    const js = m.json().jours;
    R['S1:detail'] = JSON.stringify((js || []).map((x) => [x.jourId, x.ferme, x.reste]));
    if (!Array.isArray(js)) return false;
    const days = js.map((x) => x.day), j2 = js.find((x) => x.day === AUJ - 2), j3 = js.find((x) => x.day === DIM), j4 = js.find((x) => x.day === AUJ - 4);
    return days.join() === [7, 6, 5, 4, 3, 2, 1].map((k) => AUJ - k).join() && j2.ferme === false && j2.reste === '3000000' && j2.jourId === 'J2026-10-26' && j2.owner === OWN
      && j4.ferme === true && j3.dernierJourSemaine === true && j2.dernierJourSemaine === false && !('luMs' in j2) && typeof j2.lu === 'string';
  });
  await essai('S2-relectures-bornees', async () => {
    const h = { t: T }, ch = chaineDe(), m = monterSrv(src, h, ch);
    await m.lire();
    const l1 = { ...ch.lus };
    h.t = T + 60; await m.lire();
    const l2 = { ...ch.lus };
    ch.panne.add(AUJ - 2); h.t = T + 6 * 60; await m.lire();
    const l3 = { ...ch.lus }, js = m.json().jours, j2 = js.find((x) => x.day === AUJ - 2);
    const plus = (a, b2, d) => (b2[d] || 0) - (a[d] || 0);
    R['S2:detail'] = 'lus apres 1 min : J-2 +' + plus(l1, l2, AUJ - 2) + ', J-4 +' + plus(l1, l2, AUJ - 4) + ' ; apres 6 min : J-2 +' + plus(l2, l3, AUJ - 2) + ', J-4 (ferme) +' + plus(l2, l3, AUJ - 4) + ', J-6 +' + plus(l2, l3, AUJ - 6);
    return plus(l1, l2, AUJ - 2) === 0 && plus(l1, l2, AUJ - 6) === 0 && plus(l2, l3, AUJ - 4) === 0 && plus(l2, l3, AUJ - 6) === 1 && plus(l2, l3, AUJ - 2) === 1
      && j2 && j2.ferme === false && j2.reste === '3000000';
  });
  await essai('S3-fenetre-glissante', async () => {
    const h = { t: T }, ch = chaineDe(), m = monterSrv(src, h, ch);
    await m.lire();
    h.t = T + 86400; /* sans nouvelle lecture : J-7 d hier est devenu J-8 */
    const js = m.json().jours;
    return Array.isArray(js) && !js.some((x) => x.day === AUJ - 7) && js.some((x) => x.day === AUJ - 6);
  });
  return R;
}

/* ---------------------------------------------------------------- (A) l app */
function monterApp(app, tNow) {
  const s0 = app.indexOf('function semaineReclamableDe(tp)'), s1 = app.indexOf('async function peindreReclamerPot(');
  const f0 = app.indexOf('let potAFermer = null;'), f1 = app.indexOf("$('#jourFermerPot').addEventListener");
  if (s0 < 0 || s1 < s0 || f0 < 0 || f1 < f0) throw new Error('decoupe app introuvable');
  const el = {}; const $ = (s) => (el[s] = el[s] || { hidden: true, disabled: false, textContent: '', addEventListener() {} });
  class D extends Date { constructor(...x) { if (x.length) super(...x); else super(tNow * 1000); } static now() { return tNow * 1000; } }
  const envoyes = [];
  const deps = { $, Date: D, fermablePot: P.closableByAnyoneAt, reclamablePot: P.claimableUntil, usdcTexte: (x) => String(Number(x) / 1e6),
    planClosePot: (o) => P.planClose({ ...o, maintenant: tNow }), envoyerAppels: async (appels) => { envoyes.push(appels); return { etat: 'CONFIRME', hash: '0x1234567890ab' }; },
    phraseNonConfirme: () => 'non confirme', peindreTirage: () => {} };
  const noms = Object.keys(deps);
  const corps = app.slice(s0, s1) + '\n' + app.slice(f0, f1) + '\nreturn { peindreFermerPot, choisi: () => potAFermer, fermer: async (compteX, potCfgX) => { compte = compteX; potCfg = potCfgX; await fermerPot(); } };';
  const api = new Function(...noms, 'let compte = null, potCfg = null;\n' + corps)(...noms.map((k) => deps[k]));
  return { api, el: (s) => $(s), envoyes };
}
const tpDe = (jours, x = {}) => ({ contrat: CT, veille: { jourId: jid(AUJ - 1), day: AUJ - 1, ferme: true, reste: '0', owner: OWN }, semaineReclamable: { jourId: jid(DIM), day: DIM, ferme: true, reste: '0', owner: OWN }, jours, ...x });
const jr = (d, ferme, reste, x = {}) => ({ jourId: jid(d), day: d, ferme, reste: String(reste), potAtClose: '0', dernierJourSemaine: d === DIM, owner: OWN, ...x });
async function scenariosApp(app) {
  const R = {};
  const essai = async (nom, f) => { try { R[nom] = await f(); } catch (e) { R[nom] = false; R[nom + ':err'] = String(e && e.message || e); } };
  await essai('A1-close-jour-passe', async () => {
    const m = monterApp(app, T);
    m.api.peindreFermerPot(tpDe([jr(AUJ - 5, false, 0), jr(AUJ - 4, true, 2000000), jr(AUJ - 2, false, 3000000)]), MOI);
    const b = m.el('#jourFermerPot'), ch = m.api.choisi();
    R['A1:texte'] = b.textContent;
    if (!(b.hidden === false && b.textContent === 'Close the pot of J2026-10-26' && ch && ch.day === AUJ - 2)) return false;
    await m.api.fermer(MOI, { contrat: CT });
    const att = P.planClose({ contrat: CT, day: AUJ - 2, owner: false, ferme: false, maintenant: T }).appels;
    return m.envoyes.length === 1 && m.envoyes[0].length === 1 && m.envoyes[0][0].to === att[0].to && m.envoyes[0][0].data === att[0].data;
  });
  await essai('A2-pot-vide-pas-de-bouton', async () => {
    const m = monterApp(app, T);
    m.api.peindreFermerPot(tpDe([jr(AUJ - 5, false, 0), jr(AUJ - 2, false, 0)]), MOI);
    return m.el('#jourFermerPot').hidden === true && m.api.choisi() === null;
  });
  await essai('A3-hors-grace', async () => {
    const m = monterApp(app, T);
    m.api.peindreFermerPot(tpDe([jr(AUJ - 9, false, 3000000)]), MOI);
    return m.el('#jourFermerPot').hidden === true;
  });
  await essai('A4-semaine-ouverte', async () => {
    const m = monterApp(app, T);
    m.api.peindreFermerPot(tpDe([jr(DIM, false, 5000000)], { semaineReclamable: null }), OWN);
    return m.el('#jourFermerPot').hidden === false && m.el('#jourFermerPot').textContent === 'Close the week\'s pot of J2026-10-25 (owner)';
  });
  await essai('A5-temoin-veille-ouverte-d-abord', async () => {
    const m = monterApp(app, T);
    m.api.peindreFermerPot(tpDe([jr(AUJ - 2, false, 3000000)], { veille: { jourId: jid(AUJ - 1), day: AUJ - 1, ferme: false, reste: '1', owner: OWN } }), MOI);
    return m.api.choisi() && m.api.choisi().day === AUJ - 1;
  });
  return R;
}

/* ---------------------------------------------------------------- (B) le brain */
const W = OWN;
const part = (w, sig = null, amount = '1000000') => ({ wallet: w, amount, signature: sig, donnees: { primaryType: 'Claim', message: { wallet: w, amount } } });
const SIG = '0x' + 'ab'.repeat(65);
const partsDe = (d, liste, mode = 'JOUR') => ({ ok: true, jourId: jid(d), day: d, mode, contrat: CT, verifier: VER, ferme: true, parts: liste, couverture: { complete: true } });
const etatB = (t, x = {}, y = {}) => {
  const hier = Math.floor(t / 86400) - 1;
  return { authorized: true, wallet: W, now: t, budgetUsdc: '0', spentUsdc: '0', balanceUsdc: '50000000',
    rules: { rolls: false, settle: false, pot: true, potDailyUsdc: '0' }, history: [], seen: [], rolls: null, missions: null, skins: null,
    pot: { contract: CT, usdc: USDC, owner: W, veille: { day: hier, jourId: jid(hier), ferme: true, reste: '0', potAtClose: '4000000', verifier: VER }, today: { day: hier + 1, dayPot: '0' }, sharesDay: null, sharesWeek: null, ...x }, ...y };
};
const memes = (a, b) => a.length === b.length && a.every((c, i) => c.to === String(b[i].to).toLowerCase() && c.data === b[i].data);
function scenariosBrain(J) {
  const R = {};
  const essai = (nom, f) => { try { R[nom] = f(); } catch (e) { R[nom] = false; R[nom + ':err'] = String(e && e.message || e); } };
  essai('B1-close-jour-passe', () => {
    const p = J.prochaineProposition(etatB(T, { jours: [{ day: AUJ - 2, ferme: false, reste: '3000000' }] }));
    R['B1:detail'] = p.kind + ' ' + (p.cle || '') + ' ' + String(p.why || '').slice(0, 90);
    return p.kind === 'POT_CLOSE' && p.cle === 'POT_CLOSE:' + (AUJ - 2) && memes(p.calls, P.planClose({ contrat: CT, day: AUJ - 2, owner: true, maintenant: T }).appels) && /J2026-10-26/.test(p.why);
  });
  essai('B2-sign-jour-passe', () => {
    const p = J.prochaineProposition(etatB(T, { jours: [{ day: AUJ - 4, ferme: true, reste: '2000000', sharesDay: partsDe(AUJ - 4, [part(AUTRE), part(VER)]) }] }));
    return p.kind === 'POT_SIGN' && p.cle === 'POT_SIGN:J2026-10-24' && p.sign.jourId === 'J2026-10-24' && p.sign.day === AUJ - 4 && p.sign.week === false && p.sign.shares.length === 2;
  });
  essai('B3-hors-fenetre-ignore', () => {
    const p = J.prochaineProposition(etatB(T, { jours: [{ day: AUJ - 8, ferme: false, reste: '3000000' }, { day: AUJ, ferme: false, reste: '3000000' }, { day: AUJ - 8, ferme: true, reste: '1', sharesDay: partsDe(AUJ - 8, [part(AUTRE)]) }] }));
    /* ignores = ni propose, ni meme examine (aucune raison donnee pour eux : planClose refuserait aujourd hui de toute facon) */
    R['B3:detail'] = p.kind + ' ' + String(p.why || '').slice(0, 160);
    return p.kind === 'NONE' && !String(p.why).includes(jid(AUJ)) && !String(p.why).includes(jid(AUJ - 8));
  });
  essai('B4-dernier-jour-jamais-mode-jour', () => {
    /* (a) la veille = dimanche (lundi 26) avec des parts du jour entamees ; (b) dimanche dans P.jours (mercredi), parts semaine non signees */
    const lun = Math.floor(Date.UTC(2026, 9, 26, 12) / 1000);
    const a = J.prochaineProposition(etatB(lun, { sharesDay: partsDe(DIM, [part(AUTRE), part(VER, SIG)]), sharesWeek: partsDe(DIM, [part(AUTRE)], 'SEMAINE') }));
    const b = J.prochaineProposition(etatB(T, { jours: [{ day: DIM, ferme: true, reste: '5000000', sharesDay: partsDe(DIM, [part(AUTRE)]), sharesWeek: partsDe(DIM, [part(AUTRE), part(VER)], 'SEMAINE') }] }));
    const c = J.prochaineProposition(etatB(T, { jours: [{ day: DIM, ferme: true, reste: '5000000', sharesDay: partsDe(DIM, [part(AUTRE)]), sharesWeek: null }] }));
    R['B4:detail'] = 'a ' + a.kind + ' | b ' + b.kind + ' ' + (b.sign ? 'week=' + b.sign.week : '') + ' | c ' + c.kind;
    return a.kind === 'NONE' && /day-mode/.test(a.why) && b.kind === 'POT_SIGN' && b.sign.week === true && b.cle === 'POT_SIGN:J2026-10-25#S' && c.kind === 'NONE';
  });
  essai('B5-veille-d-abord', () => {
    const p = J.prochaineProposition(etatB(T, { veille: { day: AUJ - 1, jourId: jid(AUJ - 1), ferme: false, reste: '1000000', verifier: VER }, jours: [{ day: AUJ - 2, ferme: false, reste: '3000000' }] }));
    return p.kind === 'POT_CLOSE' && p.cle === 'POT_CLOSE:' + (AUJ - 1) && /yesterday/.test(p.why);
  });
  essai('B6-vu-puis-suivant', () => {
    const jours = [{ day: AUJ - 2, ferme: false, reste: '3000000' }, { day: AUJ - 5, ferme: false, reste: '2000000' }];
    const p1 = J.prochaineProposition(etatB(T, { jours }));
    const p2 = J.prochaineProposition({ ...etatB(T, { jours }), seen: ['POT_CLOSE:' + (AUJ - 5)] });
    return p1.cle === 'POT_CLOSE:' + (AUJ - 5) && p2.cle === 'POT_CLOSE:' + (AUJ - 2);
  });
  return R;
}

const SRV = lire('serveur-web.js'), APP = lire('app.html'), SRC_B = fs.readFileSync(path.join(ICI, 'brain-jeu.js'), 'utf8');
const RS = await scenariosSrv(SRV), RA = await scenariosApp(APP), RB = scenariosBrain(J0);
for (const R of [RS, RA, RB]) for (const [k, v] of Object.entries(R)) if (!k.includes(':')) ok(v === true, k + (R[k + ':err'] ? ' (' + R[k + ':err'] + ')' : ''));
console.log('    S1 : ' + RS['S1:detail'] + '\n    S2 : ' + RS['S2:detail'] + '\n    A1 : ' + RA['A1:texte'] + '\n    B1 : ' + RB['B1:detail'] + '\n    B4 : ' + RB['B4:detail']);

let tues = 0, total = 0;
async function mutantTexte(nom, src, de, vers, scen, rougit) {
  total += 1;
  if (!de.test(src)) { ok(false, 'MUTANT ' + nom + ' : motif absent de la source'); return; }
  const Rm = await scen(src.replace(de, vers));
  const t = Rm[rougit] !== true; if (t) tues += 1;
  ok(t, 'MUTANT ' + nom + ' -> ' + rougit + ' ROUGIT');
}
await mutantTexte('serveur : jours non servis', SRV, /signes, jours, erreurSemaineReclamable/, 'signes, erreurSemaineReclamable', scenariosSrv, 'S1-sept-jours-servis');
await mutantTexte('serveur : jour ferme relu a chaque tour', SRV, /\(deja\.ferme \|\| Date\.now\(\) - deja\.luMs < 300000\)/, '(Date.now() - deja.luMs < 60000)', scenariosSrv, 'S2-relectures-bornees');
await mutantTexte('serveur : fenetre de 7 jours non bornee au service', SRV, /x\.day < aujTP && x\.day >= aujTP - 7 && tS <= reclamablePotSrv\(x\.day\)/, 'x.day < aujTP', scenariosSrv, 'S3-fenetre-glissante');
await mutantTexte('app : tp.jours ignores', APP, /for \(const x of \(tp && Array\.isArray\(tp\.jours\) \? tp\.jours : \[\]\)\) \{/, 'for (const x of []) {', scenariosApp, 'A1-close-jour-passe');
/* 2026-10-24 (2e tour, defaut 1) : la garde du reste vaut pour CHAQUE candidat (veille, semaine, tp.jours), dans la boucle finale */
await mutantTexte('app : pot vide propose', APP, /\n    if \(!\(resteDe\(x\) > 0n\)\) continue;/, '', scenariosApp, 'A2-pot-vide-pas-de-bouton');
await mutantTexte('app : grace ignoree', APP, /maintenant > reclamablePot\(x\.day\) \|\| /, '', scenariosApp, 'A3-hors-grace');
/* le brain : copies a cote de la source (ses imports relatifs), effacees */
async function mutantBrain(nom, de, vers, rougit) {
  total += 1;
  if (SRC_B.split(de).length !== 2) { ok(false, 'MUTANT ' + nom + ' : motif absent (ou pas unique)'); return; }
  const f = path.join(ICI, 'brain-jeu.mutant-jours-' + process.pid + '-' + total + '.js');
  fs.writeFileSync(f, SRC_B.replace(de, vers));
  try { const M = await import(pathToFileURL(f).href); const Rm = scenariosBrain(M); const t = Rm[rougit] !== true; if (t) tues += 1; ok(t, 'MUTANT ' + nom + ' -> ' + rougit + ' ROUGIT'); }
  finally { try { fs.unlinkSync(f); } catch (_) { /* rien */ } }
}
await mutantBrain('brain : P.jours ignores (close)', 'for (const x of (Array.isArray(P.jours) ? P.jours : [])', 'for (const x of ([])', 'B1-close-jour-passe');
await mutantBrain('brain : P.jours ignores (sign)', 'for (const x of (Array.isArray(P.jours) ? P.jours : [])', 'for (const x of ([])', 'B2-sign-jour-passe');
await mutantBrain('brain : grace ignoree', 't <= (d + 1) * JOUR_S + GRACE_POT_S', 'true', 'B3-hors-fenetre-ignore');
await mutantBrain('brain : aujourd hui accepte', 'Number.isInteger(d) && d < aujourdhui &&', 'Number.isInteger(d) &&', 'B3-hors-fenetre-ignore');
await mutantBrain('brain : parts du jour le dernier jour', 'if (entame(J0)) {', 'if (false) {', 'B4-dernier-jour-jamais-mode-jour');
await mutantBrain('brain : seul le pot d hier ferme', 'const potClose = () => { for (const v of joursPot) {', 'const potClose = () => { for (const v of joursPot.slice(0, 1)) {', 'B6-vu-puis-suivant');
console.log('mutants tues ' + tues + '/' + total);
console.log(n + ' assertions, ' + ko + ' KO - NE PROUVE PAS une lecture reelle sur Base, un close ou une signature reels, ni le cablage de P.jours dans l app');
if (ko) process.exitCode = 1;
