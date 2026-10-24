/* test-semaine-reclamable-20261023.mjs — LE POT DE LA SEMAINE SE FERME ET SE RECLAME PENDANT TOUTE SA GRACE, PAS SEULEMENT LE LUNDI.
 * Defaut (revue adverse, 2026-10-23) : le pot de la semaine vit sur son DERNIER jour UTC (dimanche), mais peindreFermerPot et
 *   peindreReclamerPot ne regardaient que tp.veille (= hier) : les boutons Close / Claim de la semaine n apparaissaient que le lundi, alors que
 *   le contrat garde les parts reclamables 7 jours (claimableUntil).
 * AFFIRME :
 *  (1) ticketpot-plan.js jourSemaineReclamable (EXECUTE, heure par heure sur 3 semaines + bornes a la seconde) : le dernier jour de semaine
 *      deja termine et encore dans sa grace ; jamais un jour pas fini ; null hors grace ;
 *  (2) serveur (source) : il est lu sur le MINUTEUR de 60 s (lireTicketPotSrv), jamais par requete ; servi en ticketpot.semaineReclamable
 *      seulement s il est encore CE jour-la (grace pas finie) ;
 *  (3) app (EXECUTE, peindreFermerPot / peindreReclamerPot extraits d app.html, horloge et fetch simules) : mercredi, le pot du dimanche
 *      non ferme -> Close pour n importe qui (12 h passees) ; lundi 06:00 -> owner seulement ; ferme + part signee -> Claim my weekly share
 *      (day = dimanche, week=1) ; grace finie -> aucun bouton ; fermerPot vise le pot choisi (pas tp.veille).
 * ⛔ NE PROUVE PAS : une lecture reelle sur Base, un close ou un claim reel, ni le rendu au navigateur. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const lire = (f) => fs.readFileSync(path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
const P = await import(pathToFileURL(path.join(ICI, 'ticketpot-plan.js')).href + '?v=' + Math.random());
const S = await import(pathToFileURL(path.join(ICI, 'tirage-saison.js')).href);
const H = 3600, J = 86400;
const finSem = (ms) => S.saisonDe(ms).fin;

/* (1) le jour, execute */
const f = P.jourSemaineReclamable;
ok(typeof f === 'function', 'ticketpot-plan.js exporte jourSemaineReclamable');
if (typeof f === 'function') {
  const s0 = S.saisonDe(Date.UTC(2026, 9, 28, 10)), dim0 = Math.floor(s0.debut / 86400000) - 1; /* le dimanche avant la semaine du 28/10 */
  ok(P.jourIdDeDay(dim0) === 'J2026-10-25' && new Date(dim0 * J * 1000).getUTCDay() === 0, 'le dernier jour de la semaine S1 = dimanche J2026-10-25');
  let faux = 0, vus = 0;
  for (let t = P.dayEnd(dim0) - 2 * J; t < P.dayEnd(dim0) + 21 * J; t += H) {
    /* attendu : le dernier jour de semaine termine le plus recent (ils se suivent de 7 en 7 jours) */
    let att = null;
    for (let d = dim0 + 21; d >= dim0 - 7; d -= 7) if (t >= P.dayEnd(d) && t <= P.claimableUntil(d)) { att = d; break; }
    vus += 1; if (f(t, finSem) !== att || att === null) faux += 1;
  }
  ok(vus > 500 && faux === 0, 'heure par heure sur 3 semaines : toujours le dernier dimanche termine, dans sa grace (' + vus + ' instants, ' + faux + ' faux)');
  ok(f(P.dayEnd(dim0), finSem) === dim0 && f(P.dayEnd(dim0) - 1, finSem) === dim0 - 7, 'borne : le dimanche compte des sa fin (lundi 00:00:00), pas une seconde avant');
  ok(f(P.dayEnd(dim0) + 2 * J + 10 * H, finSem) === dim0, 'mercredi 10:00 : le dimanche d avant (le bug ne le voyait que le lundi)');
  ok(f(P.claimableUntil(dim0) - 1, finSem) === dim0 && f(P.claimableUntil(dim0), finSem) === dim0 + 7, 'borne de grace : le dimanche jusqu a claimableUntil, puis le suivant');
  /* une semaine figee dans le passe (fin constante) : hors grace -> null, jamais un jour expire */
  const figee = () => (dim0 + 1) * J * 1000;
  ok(f(P.claimableUntil(dim0), figee) === dim0 && f(P.claimableUntil(dim0) + 1, figee) === null, 'grace finie -> null (jamais un jour expire)');
  ok(f(P.dayEnd(dim0) - 1, () => (dim0 + 1) * J * 1000) === null, 'jour pas fini -> null');
  ok(f(NaN, finSem) === null && f(P.dayEnd(dim0), null) === null && f(P.dayEnd(dim0), () => NaN) === null, 'entree illisible -> null');
}

/* (2) le serveur, source */
const srv = lire('serveur-web.js');
const ts = srv.slice(srv.indexOf('async function lireTicketPotSrv()'), srv.indexOf('function ticketpotJson()'));
const tj = srv.slice(srv.indexOf('function ticketpotJson()'), srv.indexOf('/* ══ LES DUELS LUS SUR LA CHAINE'));
ok(/import \{[^}]*jourSemaineReclamable[^}]*\} from '\.\/ticketpot-plan\.js';/.test(srv), 'serveur : jourSemaineReclamable importe de ticketpot-plan.js');
ok(/const dRec = jourSemaineReclamable\(Math\.floor\(Date\.now\(\) \/ 1000\), \(ms\) => saisonDe\(ms\)\.fin\);/.test(ts) && /lireJourTicketPot\(\{ rpc: rpcServeur, contrat \}, dRec\)/.test(ts), 'lu dans lireTicketPotSrv (minuteur 60 s) : lireJour(le dernier dimanche reclamable)');
ok(/dRec === day \? j :/.test(ts), 'le lundi (dimanche = veille) : la lecture de la veille est reutilisee, pas d appel en plus');
ok((srv.match(/jourSemaineReclamable\(/g) || []).length === 2 && /jourSemaineReclamable\(/.test(tj), 'jourSemaineReclamable appele seulement au minuteur et dans ticketpotJson (pur, pas de RPC par requete)');
ok(/semaineReclamable: srSrv/.test(tj) && /ticketpotSrv\.semaineReclamable && ticketpotSrv\.semaineReclamable\.day === jourSemaineReclamable\(Math\.floor\(Date\.now\(\) \/ 1000\), \(ms\) => saisonDe\(ms\)\.fin\)/.test(tj),
  'servi seulement si c est encore le jour reclamable (grace pas finie)');
ok(!/lireJourTicketPot/.test(tj), 'ticketpotJson ne lit rien sur la chaine');

/* (3) l app, executee */
const app = lire('app.html');
const imp = /import \{ planFund as planFundPot, [^}]*claimableUntil as reclamablePot,[^}]*\} from '\.\/ticketpot-plan\.js';/.test(app);
ok(imp, 'app : claimableUntil importe (reclamablePot)');
const a0 = app.indexOf('let maPartPot = null;'), a1 = app.indexOf('async function reclamerPot()');
const b0 = app.indexOf("$('#jourReclamerPot').addEventListener"), b1 = app.indexOf('async function fermerPot()');
ok(a0 > 0 && a1 > a0 && b0 > a1 && b1 > b0, 'les fonctions de peinture sont decoupees');
const fe = app.slice(b1, app.indexOf("$('#jourFermerPot').addEventListener"));
ok(/const v = potAFermer, owner = /.test(fe) && /planClosePot\(\{ contrat: potCfg\.contrat, day: v\.day, owner, ferme: v\.ferme \}\)/.test(fe) && !/potCfg\.veille/.test(fe), 'fermerPot ferme le pot CHOISI (potAFermer), plus tp.veille seul');

const OWN = '0x' + '0a'.repeat(20), MOI = '0x' + 'b1'.repeat(20), CT = '0x' + 'c2'.repeat(20);
function monter(tNow, partsPar) {
  const el = {}; const $ = (s) => (el[s] = el[s] || { hidden: true, textContent: '', addEventListener() {} });
  const appels = [];
  const fetch = async (u) => { appels.push(u); const q = new URL(u, 'http://x').searchParams; const k = q.get('day') + (q.get('week') === '1' ? '#S' : '');
    return { json: async () => ({ ok: true, contrat: CT, parts: partsPar[k] || [] }) }; };
  class D extends Date { static now() { return tNow * 1000; } }
  const usdcTexte = (x) => String(Number(x) / 1e6);
  const src = app.slice(a0, a1) + '\n' + app.slice(b0, b1)
    + '\nreturn { peindreReclamerPot, peindreFermerPot, part: () => maPartPot, choisi: () => (typeof potAFermer === "undefined" ? undefined : potAFermer) };';
  let api = null;
  /* 2026-10-24 : la peinture relit claimed(day, wallet) sur la chaine (test-ticketpot-reclamer-20261024.mjs) — ici : jamais reclamee */
  const rpc = async (m) => { if (m !== 'eth_call') throw new Error('rpc'); return '0x' + '0'.repeat(64); };
  try { api = new Function('$', 'fetch', 'Date', 'usdcTexte', 'fermablePot', 'reclamablePot', 'AbortSignal', 'rpc', 'appelClaimedTP', 'lireBoolTP', src)($, fetch, D, usdcTexte, P.closableByAnyoneAt, P.claimableUntil, { timeout: () => undefined }, rpc, P.appelClaimed, P.lireBoolMot); }
  catch (e) { console.log('    (montage : ' + e.message + ')'); }
  return { api, el: (s) => $(s), appels };
}
const s1 = S.saisonDe(Date.UTC(2026, 9, 28, 10)), dim = Math.floor(s1.debut / 86400000) - 1, DIM = P.jourIdDeDay(dim);
const mer = P.dayEnd(dim) + 2 * J + 10 * H, lun6 = P.dayEnd(dim) + 6 * H;
const veilleMer = { jourId: P.jourIdDeDay(dim + 2), day: dim + 2, ferme: true, reste: '0', owner: OWN };
const tpMer = (sem) => ({ contrat: CT, veille: veilleMer, semaineReclamable: { jourId: DIM, day: dim, owner: OWN, reste: '5000000', potAtClose: '0', ...sem } });

/* A. mercredi, dimanche pas ferme, un passant (12 h passees) -> Close du dimanche */
{ const m = monter(mer, {}); if (m.api) { m.api.peindreFermerPot(tpMer({ ferme: false }), MOI); const b = m.el('#jourFermerPot'), ch = m.api.choisi();
  ok(b.hidden === false && b.textContent.includes(DIM) && ch && ch.day === dim, 'mercredi : Close du pot du dimanche ' + DIM + ' offert a tous (texte : ' + b.textContent + ')'); } else ok(false, 'A monte'); }
/* B. lundi 06:00 : un passant non ; l owner oui */
{ const tpL = { contrat: CT, veille: { jourId: DIM, day: dim, ferme: false, reste: '5000000', owner: OWN }, semaineReclamable: { jourId: DIM, day: dim, ferme: false, reste: '5000000', owner: OWN } };
  const m = monter(lun6, {}); if (m.api) { m.api.peindreFermerPot(tpL, MOI); const h1 = m.el('#jourFermerPot').hidden; m.api.peindreFermerPot(tpL, OWN);
    ok(h1 === true && m.el('#jourFermerPot').hidden === false && /\(owner\)/.test(m.el('#jourFermerPot').textContent), 'lundi 06:00 : pas de Close pour un passant (12 h), Close pour l owner'); } else ok(false, 'B monte'); }
/* C. mercredi, dimanche ferme, ma part hebdo signee -> Claim my weekly share (day = dimanche, week=1) */
{ const part = { day: dim, jourId: DIM, wallet: MOI, ticket: '0x' + 'd3'.repeat(20), amount: '1230000', deadline: P.claimableUntil(dim), signature: '0x' + '11'.repeat(65) };
  const m = monter(mer, { [DIM + '#S']: [part] }); if (m.api) { await m.api.peindreReclamerPot(tpMer({ ferme: true }), MOI); const b = m.el('#jourReclamerPot'), p = m.api.part();
    ok(b.hidden === false && /Claim my weekly share · 1\.23 USDC \(J2026-10-25\)/.test(b.textContent) && p && p.day === dim && p.contrat === CT, 'mercredi : Claim my weekly share du dimanche (texte : ' + b.textContent + ')');
    ok(m.appels.some((u) => u.includes('day=' + DIM) && u.includes('week=1')), 'la part est demandee pour day=' + DIM + '&week=1'); } else ok(false, 'C monte'); }
/* D. grace finie (servi en retard) -> ni Close ni Claim */
{ const tard = P.claimableUntil(dim) + 60, part = { day: dim, jourId: DIM, wallet: MOI, amount: '1', signature: '0x' + '11'.repeat(65) };
  const m = monter(tard, { [DIM + '#S']: [part] }); if (m.api) { m.api.peindreFermerPot(tpMer({ ferme: false }), MOI); await m.api.peindreReclamerPot(tpMer({ ferme: true }), MOI);
    ok(m.el('#jourFermerPot').hidden === true && m.el('#jourReclamerPot').hidden === true && !m.appels.some((u) => u.includes(DIM)), 'grace finie : aucun bouton, rien demande pour ' + DIM); } else ok(false, 'D monte'); }
/* E. dimanche pas ferme : pas de demande de part (rien a signer avant close) ; la veille ferme reste demandee */
{ const m = monter(mer, {}); if (m.api) { await m.api.peindreReclamerPot(tpMer({ ferme: false }), MOI);
  ok(!m.appels.some((u) => u.includes(DIM)) && m.appels.some((u) => u.includes(veilleMer.jourId)) && m.el('#jourReclamerPot').hidden === true, 'dimanche pas ferme : aucune part demandee pour lui ; la veille fermee, si'); } else ok(false, 'E monte'); }
/* F. sans semaineReclamable servi : la veille seule, comme avant (non-regression). 2026-10-24 (2e tour ticketpot, defaut 1) : la veille
 *   porte son reste (le serveur le sert toujours) — un pot ouvert vide ou au reste illisible n est plus jamais propose. */
{ const m = monter(lun6 + 7 * H, {}); if (m.api) { m.api.peindreFermerPot({ contrat: CT, veille: { jourId: DIM, day: dim, ferme: false, reste: '5000000', owner: OWN }, semaineReclamable: null }, MOI);
  ok(m.el('#jourFermerPot').hidden === false && m.el('#jourFermerPot').textContent.includes(DIM), 'sans semaineReclamable : Close de la veille (12 h passees), comme avant'); } else ok(false, 'F monte'); }

console.log(n + ' assertions, ' + ko + ' KO — NE PROUVE PAS une lecture reelle sur Base, ni un close ou un claim reel, ni le rendu');
if (ko) process.exitCode = 1;
