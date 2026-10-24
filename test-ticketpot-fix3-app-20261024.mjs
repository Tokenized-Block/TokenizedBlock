/* test-ticketpot-fix3-app-20261024.mjs - LE BOUTON CLOSE SAUTE LES POTS VIDES, L APP RENVOIE ET DIT UN TICKET NON CREDITE, LE BRAIN VOIT
 *   J-2..J-7, UNE PART REFUSEE N ARRETE PLUS LA SIGNATURE, LE PRIX D UN ROLL EST DIT TEL QU IL EST.
 * Revue adverse du correctif ticketpot, 2e tour (reviews-fix2.md, section ticketpot) :
 *   defaut 1 : peindreFermerPot ne verifiait le reste que pour tp.jours : une veille (ou une semaine reclamable) OUVERTE et VIDE gagnait et
 *     cachait le pot finance de J-2 (PoC : « choisi day=20753 reste=0 => le pot de J-2 (3 USDC) MASQUE », owner, non-owner a 12:00, semaine) ;
 *   defaut 2 (cote app) : signalerPaye ne lisait pas ticket.pourquoi ; un ticket non credite l etait en silence ;
 *   point 3 cote brain : l etat du brain (app.html bjTour) ne passait ni P.jours ni les parts de J-2..J-7 ;
 *   defaut 4 : attester-ticketpot.html et bjSignerParts s arretaient au premier refus du serveur (409) ; le brain reproposait la part refusee ;
 *   texte : « a fixed prize from the roll pot » — les prix sont ceux des regles du moment, lues en direct, que le createur d UNIT peut changer.
 * EXECUTE (decoupes de la source, montes par new Function ; simules : DOM, fetch, wallet, horloge, setTimeout capture) :
 *  (F) app.html semaineReclamableDe + peindreFermerPot ; (R) app.html noteTicketPaye / direTicketPaye / signalerPaye ;
 *  (C) app.html le bloc « LE POT DES RECOMPENSES » de bjTour -> pot, donne au VRAI brain-jeu.js prochaineProposition ;
 *  (D) le <script> d attester-ticketpot.html entier ; app.html bjSignerParts ; (T) le texte des deux regles des rolls.
 * AFFIRME :
 *  F1 owner, veille OUVERTE reste 0, J-2 ouvert 3 USDC -> « Close the pot of J2026-10-26 (owner) » ; F2 non-owner a 12:00 UTC, pareil ;
 *  F3 semaine reclamable ouverte VIDE -> J-2 ; F4 que des pots vides -> pas de bouton ; F5 reste illisible -> jamais propose ;
 *  R1 202 + NON_LU : 5 renvois (8, 16, 24, 32, 40 s) puis la note « not counted for a day ticket yet (the server tries again for up to 48 h) — <pourquoi> » ; R2 200 + TROP_VIEUX
 *     -> pas de renvoi, la note dit pourquoi ; R3 NON_LU puis CREDITE -> pas de note ; R4 202 sans ticket -> 3 renvois a 8 s (comme avant) ;
 *  C1 pot.jours = J-7..J-2 servis (jamais la veille ni aujourd hui), parts lues SEULEMENT pour un jour ferme au reste non nul (jour + semaine
 *     le dimanche) ; C2 le brain propose POT_CLOSE de J-2 ; C3 puis POT_SIGN de la SEMAINE du dimanche (jamais le mode jour) ; C4 un jour
 *     ferme ordinaire -> ses parts du jour ; C5 une part REFUSEE (cle vue) n est plus proposee ; C6 un jour seulement dans tp.signes est lu ;
 *  D1 attester : A signee, B refusee (409), C signee -> 3 depots, la fin dit « 2 share(s) » et le refus de B ; D2 bjSignerParts pareil ;
 *     D3 le refus du WALLET arrete toujours ; D4 la cle POT_SIGN_REFUS de l app est celle que lit le brain ;
 *  T1 plus de « fixed prize from the roll pot » ; les deux regles disent les regles du moment, lues en direct, changeables par le createur.
 *  MUTANTS (copies en memoire ; brain : copie a cote, effacee) : chaque garde retiree -> son scenario ROUGIT.
 * NE PROUVE PAS : un vrai navigateur ni un vrai wallet, une vraie lecture de Base, ni que le serveur sert tp.jours en prod (servi depuis
 *   c432667) ; le balayage serveur des tickets en attente (3e tour) et le classement 409 / 412 / muet : test-ticketpot-fix4-20261024. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const lire = (f) => fs.readFileSync(path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
const P = await import(pathToFileURL(path.join(ICI, 'ticketpot-plan.js')).href);
const J0 = await import(pathToFileURL(path.join(ICI, 'brain-jeu.js')).href);
const ticks = async (k = 30) => { for (let i = 0; i < k; i++) await new Promise((r) => setImmediate(r)); };

const CT = '0x' + 'c2'.repeat(20), OWN = '0x' + '0a'.repeat(20), MOI = '0x' + 'b1'.repeat(20), VER = '0x' + '3'.repeat(40), USDC = '0x' + '8'.repeat(40);
const A = '0x' + 'a1'.repeat(20), B = '0x' + 'b2'.repeat(20), C = '0x' + 'c3'.repeat(20);
const T = Math.floor(Date.UTC(2026, 9, 28, 12) / 1000); /* mercredi 28/10 12:00 UTC */
const AUJ = Math.floor(T / 86400), jid = (d) => P.jourIdDeDay(d), DIM = AUJ - 3; /* dimanche 25/10 : dernier jour de la semaine */
const essaiDe = (R) => async (nom, f) => { try { R[nom] = await f(); } catch (e) { R[nom] = false; R[nom + ':err'] = String(e && e.message || e); } };

/* ---------------------------------------------------------------- (F) le bouton Close */
function monterFermer(app, tNow) {
  const s0 = app.indexOf('function semaineReclamableDe(tp)'), s1 = app.indexOf('async function peindreReclamerPot(');
  const f0 = app.indexOf('let potAFermer = null;'), f1 = app.indexOf("$('#jourFermerPot').addEventListener");
  if (s0 < 0 || s1 < s0 || f0 < 0 || f1 < f0) throw new Error('decoupe app introuvable');
  const el = {}; const $ = (s) => (el[s] = el[s] || { hidden: true, disabled: false, textContent: '', addEventListener() {} });
  class D extends Date { constructor(...x) { if (x.length) super(...x); else super(tNow * 1000); } static now() { return tNow * 1000; } }
  const deps = { $, Date: D, fermablePot: P.closableByAnyoneAt, reclamablePot: P.claimableUntil, usdcTexte: (x) => String(Number(x) / 1e6), planClosePot: P.planClose,
    envoyerAppels: async () => ({ etat: 'CONFIRME' }), phraseNonConfirme: () => '', peindreTirage: () => {} };
  const noms = Object.keys(deps);
  const api = new Function(...noms, 'let compte = null, potCfg = null;\n' + app.slice(s0, s1) + '\n' + app.slice(f0, f1) + '\nreturn { peindreFermerPot, choisi: () => potAFermer };')(...noms.map((k) => deps[k]));
  return { api, b: () => $('#jourFermerPot') };
}
const jr = (d, ferme, reste, x = {}) => ({ jourId: jid(d), day: d, ferme, reste: String(reste), potAtClose: '0', dernierJourSemaine: d === DIM, owner: OWN, ...x });
const tpF = (x = {}) => ({ contrat: CT, veille: jr(AUJ - 1, false, 0), semaineReclamable: jr(DIM, true, 0), jours: [jr(AUJ - 5, false, 0), jr(AUJ - 2, false, 3000000)], ...x });
async function scenariosF(app) {
  const R = {}, essai = essaiDe(R);
  await essai('F1-owner-veille-vide-ouverte', async () => {
    const m = monterFermer(app, T); m.api.peindreFermerPot(tpF(), OWN);
    R['F1:texte'] = m.b().textContent + ' (day ' + (m.api.choisi() || {}).day + ')';
    return m.b().hidden === false && m.b().textContent === 'Close the pot of J2026-10-26 (owner)' && m.api.choisi().day === AUJ - 2;
  });
  await essai('F2-non-owner-a-midi', async () => {
    const m = monterFermer(app, T); m.api.peindreFermerPot(tpF(), MOI);
    return m.b().hidden === false && m.b().textContent === 'Close the pot of J2026-10-26' && m.api.choisi().day === AUJ - 2;
  });
  await essai('F3-semaine-reclamable-vide-ouverte', async () => {
    const m = monterFermer(app, T); m.api.peindreFermerPot(tpF({ veille: jr(AUJ - 1, true, 0), semaineReclamable: jr(DIM, false, 0) }), OWN);
    return m.api.choisi() && m.api.choisi().day === AUJ - 2;
  });
  await essai('F4-que-des-pots-vides', async () => {
    const m = monterFermer(app, T); m.api.peindreFermerPot(tpF({ jours: [jr(AUJ - 2, false, 0)] }), OWN);
    return m.b().hidden === true && m.api.choisi() === null;
  });
  await essai('F5-reste-illisible', async () => {
    const m = monterFermer(app, T); m.api.peindreFermerPot(tpF({ veille: jr(AUJ - 1, false, 0, { reste: undefined }), jours: [] }), OWN);
    return m.b().hidden === true;
  });
  return R;
}

/* ---------------------------------------------------------------- (R) signalerPaye et la note */
function monterPaye(app, reponses) {
  const s0 = app.indexOf('let ticketPayeNote = null;') >= 0 ? app.indexOf('let ticketPayeNote = null;') : app.indexOf('function signalerPaye('), s1 = app.indexOf('function allerA(');
  if (s0 < 0 || s1 < s0) throw new Error('decoupe signalerPaye introuvable');
  const el = { '#jourTicketTxt': { textContent: 'Your ticket — this face is yours.' } };
  const $ = (s) => el[s] || null;
  const minuteurs = [], appels = [];
  const fetch = async (url) => { appels.push(url); const r = reponses.shift() || { status: 200, corps: { ok: true, deja: true } }; return { status: r.status, json: async () => r.corps }; };
  const deps = { $, fetch, setTimeout: (f, ms) => { minuteurs.push({ f, ms }); return 0; }, vitrineActive: () => null, INTERNE: false };
  const noms = Object.keys(deps);
  const api = new Function(...noms, app.slice(s0, s1) + '\nreturn { signalerPaye, note: typeof noteTicketPaye === "function" ? noteTicketPaye : () => null };')(...noms.map((k) => deps[k]));
  /* joue chaque renvoi programme, sans attendre (le delai est NOTE, jamais dormi) */
  const jouer = async () => { await ticks(); while (minuteurs.length && minuteurs.length < 20) { const m = minuteurs[minuteurs.length - 1]; if (m.joue) break; m.joue = true; m.f(); await ticks(); } };
  return { api, el, minuteurs, appels, jouer };
}
const H1 = '0x' + '5'.repeat(64);
const NL = { ok: false, etat: 'NON_LU', pourquoi: 'the time of block 500 was not read: send it again in a moment' };
async function scenariosR(app) {
  const R = {}, essai = essaiDe(R);
  await essai('R1-non-lu-5-renvois-puis-note', async () => {
    const m = monterPaye(app, Array.from({ length: 6 }, () => ({ status: 202, corps: { ok: true, externe: true, ticket: NL } })));
    m.api.signalerPaye(H1, 'swap_action'); await m.jouer();
    const txt = m.el['#jourTicketTxt'].textContent;
    R['R1:detail'] = m.appels.length + ' envois, delais ' + m.minuteurs.map((x) => x.ms).join(',') + ' | ' + txt;
    return m.appels.length === 6 && m.minuteurs.map((x) => x.ms).join() === '8000,16000,24000,32000,40000'
      && /Last trade: not counted for a day ticket yet \(the server tries again for up to 48 h\) — the time of block 500 was not read\.$/.test(txt) && !/send it again/.test(txt) && m.api.note() === txt.slice(txt.indexOf(' Last trade'));
  });
  await essai('R2-trop-vieux-dit', async () => {
    const m = monterPaye(app, [{ status: 200, corps: { ok: true, externe: true, ticket: { ok: false, etat: 'TROP_VIEUX', pourquoi: 'this transaction is more than 48 h old (block 9, 2026-10-20 10:00 UTC): it no longer earns a day ticket' } } }]);
    m.api.signalerPaye(H1, 'hook_block'); await m.jouer();
    const txt = m.el['#jourTicketTxt'].textContent;
    R['R2:detail'] = txt;
    return m.appels.length === 1 && m.minuteurs.length === 0 && /Last trade: no day ticket — this transaction is more than 48 h old/.test(txt);
  });
  await essai('R3-credite-pas-de-note', async () => {
    const m = monterPaye(app, [{ status: 202, corps: { ok: true, externe: true, ticket: NL } }, { status: 200, corps: { ok: true, deja: true, ticket: { ok: true, etat: 'CREDITE', jourId: 'J2026-10-28' } } }]);
    m.api.signalerPaye(H1, 'swap_action'); await m.jouer();
    return m.appels.length === 2 && m.el['#jourTicketTxt'].textContent === 'Your ticket — this face is yours.' && m.api.note() === '';
  });
  await essai('R4-202-sans-ticket-comme-avant', async () => {
    const m = monterPaye(app, Array.from({ length: 5 }, () => ({ status: 202, corps: { ok: false, etat: 'NON_LU', pourquoi: 'the chain could not be read just now' } })));
    m.api.signalerPaye(H1, 'swap_action'); await m.jouer();
    return m.appels.length === 4 && m.minuteurs.map((x) => x.ms).join() === '8000,8000,8000' && m.el['#jourTicketTxt'].textContent === 'Your ticket — this face is yours.';
  });
  return R;
}

/* ---------------------------------------------------------------- (C) l etat du brain -> le vrai brain */
const SIG = '0x' + 'ab'.repeat(65);
const part = (w, sig = null, amount = '1000000') => ({ wallet: w, amount, signature: sig, donnees: { primaryType: 'Claim', message: { wallet: w, amount } } });
const partsDe = (d, liste, mode = 'JOUR') => ({ ok: true, jourId: jid(d), day: d, mode, contrat: CT, verifier: VER, ferme: true, parts: liste, couverture: { complete: true } });
function monterBrainEtat(app, tirage, parts) {
  const a = app.indexOf('    let pot = null, potServi = false;'), b = app.indexOf('    if (!bj.on || bjVol.ouverte) return;');
  if (a < 0 || b < a) throw new Error('decoupe bjTour introuvable');
  class D extends Date { constructor(...x) { if (x.length) super(...x); else super(T * 1000); } static now() { return T * 1000; } }
  const lus = [];
  const fetch = async (url) => { lus.push(url); const u = new URL(url, 'http://x'), cle = u.searchParams.get('day') + (u.searchParams.get('week') ? '#S' : ''); const r = parts[cle]; return { json: async () => r || { ok: false, etat: 'NON_LU' } }; };
  const deps = { bj: { pot: true }, t: tirage, fetch, USDC_BASE: USDC, bjDernierJour: J0.dernierJourDeSemaine, bjDayPot: async () => 0n, Date: D };
  const noms = Object.keys(deps);
  const f = new Function(...noms, 'return (async () => {\n' + app.slice(a, b) + '\nreturn { pot, potServi };\n})();');
  return { lancer: () => f(...noms.map((k) => deps[k])), lus };
}
const tirageDe = (x = {}) => ({ ok: true, ticketpot: { contrat: CT,
  veille: { jourId: jid(AUJ - 1), day: AUJ - 1, ferme: true, reste: '0', potAtClose: '0', verifier: VER, owner: OWN },
  jours: [jr(AUJ - 7, true, 0), jr(AUJ - 6, true, 0), jr(AUJ - 5, false, 0), jr(AUJ - 4, true, 2000000), jr(DIM, true, 5000000), jr(AUJ - 2, false, 3000000), jr(AUJ - 1, true, 0)],
  signes: [{ jourId: jid(AUJ - 4), day: AUJ - 4, semaine: false }], ...x } });
const partsBase = (signeJ4 = true) => ({ [jid(AUJ - 1)]: partsDe(AUJ - 1, []), [jid(AUJ - 4)]: partsDe(AUJ - 4, [part(A, signeJ4 ? SIG : null), part(B, signeJ4 ? SIG : null)]),
  [jid(DIM)]: partsDe(DIM, [part(A)]), [jid(DIM) + '#S']: partsDe(DIM, [part(A), part(VER)], 'SEMAINE') });
const etatBrain = (pot, seen = []) => ({ authorized: true, wallet: OWN, now: T, budgetUsdc: '0', spentUsdc: '0', balanceUsdc: '50000000',
  rules: { rolls: false, settle: false, pot: true, potDailyUsdc: '0' }, history: [], seen, rolls: null, missions: null, skins: null, pot });
async function scenariosC(app, J = J0) {
  const R = {}, essai = essaiDe(R);
  await essai('C1-jours-et-parts-lus', async () => {
    const m = monterBrainEtat(app, tirageDe(), partsBase()), { pot } = await m.lancer();
    const js = (pot && pot.jours) || [];
    R['C1:detail'] = 'jours ' + JSON.stringify(js.map((x) => [x.jourId, x.ferme, x.reste, !!x.sharesDay, !!x.sharesWeek])) + ' | lus ' + m.lus.map((u) => u.replace('/api/ticketpot/parts?day=', '')).join(' ');
    const d = (k) => js.find((x) => x.day === k);
    return Array.isArray(pot.jours) && js.map((x) => x.day).join() === [7, 6, 5, 4, 3, 2].map((k) => AUJ - k).join()
      && d(AUJ - 2).ferme === false && d(AUJ - 2).reste === '3000000' && !d(AUJ - 2).sharesDay
      && d(AUJ - 4).sharesDay && d(AUJ - 4).sharesDay.jourId === jid(AUJ - 4) && !d(AUJ - 4).sharesWeek
      && d(DIM).sharesDay && d(DIM).sharesWeek && d(DIM).sharesWeek.mode === 'SEMAINE' && !d(AUJ - 6).sharesDay && !d(AUJ - 5).sharesDay
      && m.lus.length === 4 && !m.lus.some((u) => u.includes(jid(AUJ - 6)) || u.includes(jid(AUJ - 5)) || u.includes(jid(AUJ - 2)));
  });
  await essai('C2-brain-close-J-2', async () => {
    const { pot } = await monterBrainEtat(app, tirageDe(), partsBase()).lancer();
    const p = J.prochaineProposition(etatBrain(pot));
    R['C2:detail'] = p.kind + ' ' + (p.cle || '') + ' ' + String(p.why || '').slice(0, 100);
    return p.kind === 'POT_CLOSE' && p.cle === 'POT_CLOSE:' + (AUJ - 2);
  });
  await essai('C3-brain-sign-semaine-du-dimanche', async () => {
    const { pot } = await monterBrainEtat(app, tirageDe(), partsBase()).lancer();
    const p = J.prochaineProposition(etatBrain(pot, ['POT_CLOSE:' + (AUJ - 2)]));
    R['C3:detail'] = p.kind + ' ' + (p.cle || '') + (p.sign ? ' week=' + p.sign.week + ' n=' + p.sign.shares.length : '');
    return p.kind === 'POT_SIGN' && p.cle === 'POT_SIGN:J2026-10-25#S' && p.sign.week === true && p.sign.shares.length === 2;
  });
  await essai('C4-brain-sign-jour-ordinaire', async () => {
    const { pot } = await monterBrainEtat(app, tirageDe(), partsBase(false)).lancer();
    const p = J.prochaineProposition(etatBrain(pot, ['POT_CLOSE:' + (AUJ - 2)]));
    return p.kind === 'POT_SIGN' && p.cle === 'POT_SIGN:J2026-10-24' && p.sign.week === false && p.sign.shares.length === 2;
  });
  await essai('C5-part-refusee-plus-proposee', async () => {
    const { pot } = await monterBrainEtat(app, tirageDe(), partsBase()).lancer();
    const p = J.prochaineProposition(etatBrain(pot, ['POT_CLOSE:' + (AUJ - 2), 'POT_SIGN_REFUS:J2026-10-25#S:' + A]));
    R['C5:detail'] = p.kind + ' ' + (p.sign ? p.sign.shares.map((s) => s.wallet.slice(0, 6)).join(',') : '');
    return p.kind === 'POT_SIGN' && p.sign.shares.length === 1 && p.sign.shares[0].wallet === VER;
  });
  await essai('C6-jour-seulement-dans-signes', async () => {
    const m = monterBrainEtat(app, tirageDe({ jours: [] }), partsBase(false)), { pot } = await m.lancer();
    const j4 = ((pot && pot.jours) || []).find((x) => x.day === AUJ - 4);
    return !!j4 && j4.ferme === true && !!j4.sharesDay && m.lus.some((u) => u.includes(jid(AUJ - 4)));
  });
  return R;
}

/* ---------------------------------------------------------------- (D) les signatures */
function monterAttester(html, refuseW, declineW = null) {
  const s = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  if (!s) throw new Error('script attester introuvable');
  const el = {};
  const mk = () => ({ value: '', checked: false, hidden: false, disabled: false, textContent: '', className: '', h: {}, enfants: [], addEventListener(t, f) { this.h[t] = f; }, append(x) { this.enfants.push(x); } });
  const document = { querySelector: (q) => (el[q] = el[q] || mk()), createElement: () => mk() };
  const signes = new Set(), depots = [];
  const window = { ethereum: { request: async ({ method, params }) => {
    if (method === 'eth_requestAccounts') return [VER];
    if (method === 'eth_signTypedData_v4') { const w = JSON.parse(params[1]).message.wallet; if (w === declineW) throw new Error('User rejected'); return '0xsig' + w.slice(2, 6); }
    throw new Error(method);
  } } };
  const fetch = async (url, o) => {
    if (String(url).startsWith('/api/ticketpot/signature')) {
      const b = JSON.parse(o.body); depots.push(b.wallet);
      /* 3e tour : le statut HTTP reel du serveur (409 = une autre part deja gardee), lu par la page */
      if (b.wallet === refuseW) return { status: 409, json: async () => ({ ok: false, etat: 'REFUSE', pourquoi: 'a different share of ' + b.wallet + ' is already signed and served' }) };
      signes.add(b.wallet); return { status: 200, json: async () => ({ ok: true }) };
    }
    return { json: async () => ({ ok: true, ferme: true, jourId: 'J2026-10-24', potAtClose: '3000000', verifier: VER, dernierJourSemaine: false,
      parts: [A, B, C].map((w) => ({ wallet: w, jourId: 'J2026-10-24', amount: '1000000', signature: signes.has(w) ? '0xs' : null, donnees: { message: { wallet: w } } })) }) };
  };
  new Function('document', 'window', 'fetch', 'location', 'URLSearchParams', s[1])(document, window, fetch, { search: '' }, URLSearchParams);
  return { el, depots, clic: async (q) => { el[q].h.click(); await ticks(60); } };
}
function monterSigner(app, refuseW, declineW = null) {
  const a = app.indexOf('async function bjSignerParts('), b = app.indexOf('const BJ_TITRES');
  if (a < 0 || b < a) throw new Error('decoupe bjSignerParts introuvable');
  const etapes = [], depots = [];
  const window = { ethereum: { request: async ({ params }) => { const w = JSON.parse(params[1]).message.wallet; if (w === declineW) throw new Error('User rejected'); return '0xsig'; } } };
  const fetch = async (url, o) => { const x = JSON.parse(o.body); depots.push(x.wallet); return x.wallet === refuseW ? { status: 409, json: async () => ({ ok: false, etat: 'REFUSE', pourquoi: 'already signed' }) } : { status: 200, json: async () => ({ ok: true }) }; };
  const f = new Function('bcEtape', 'courtAdr', 'usdcTexte', 'window', 'fetch', app.slice(a, b) + '\nreturn bjSignerParts;')((m, t, c) => etapes.push([t, c]), (w) => w.slice(0, 6), (x) => String(Number(x) / 1e6), window, fetch);
  const p = { sign: { jourId: 'J2026-10-24', week: false, shares: [A, B, C].map((w) => ({ wallet: w, amount: '1000000', donnees: { message: { wallet: w } } })) } };
  return { lancer: () => f({}, p, VER), etapes, depots };
}
async function scenariosD(app, html) {
  const R = {}, essai = essaiDe(R);
  await essai('D1-attester-continue-apres-409', async () => {
    const m = monterAttester(html, B); await ticks(60);
    await m.clic('#connecter'); await m.clic('#signer');
    const etat = m.el['#etat'];
    R['D1:detail'] = 'depots ' + m.depots.map((w) => w.slice(0, 4)).join(',') + ' | ' + etat.textContent;
    return m.depots.join() === [A, B, C].join() && /^2 share\(s\) signed and stored/.test(etat.textContent) && /1 refused by the server/.test(etat.textContent)
      && etat.textContent.includes(B) && / non$/.test(etat.className);
  });
  await essai('D2-bjSignerParts-continue-apres-409', async () => {
    const m = monterSigner(app, B), r = await m.lancer();
    R['D2:detail'] = JSON.stringify(r) + ' | ' + (m.etapes[m.etapes.length - 1] || [])[0];
    return m.depots.join() === [A, B, C].join() && r.ok === false && r.faites === 2 && r.refusees.length === 1 && r.refusees[0].wallet === B && r.refusees[0].refuse === true
      && /2 share\(s\) of J2026-10-24 stored; 1 not stored/.test(m.etapes[m.etapes.length - 1][0]);
  });
  await essai('D3-refus-du-wallet-arrete', async () => {
    const m = monterSigner(app, null, B), r = await m.lancer();
    const a = monterAttester(html, null, B); await ticks(60); await a.clic('#connecter'); await a.clic('#signer');
    return m.depots.join() === A && r.ok === false && r.faites === 1 && a.depots.join() === A && /Declined in your wallet/.test(a.el['#etat'].textContent);
  });
  await essai('D4-cle-refus-app-egale-brain', async () => {
    const cleApp = /'POT_SIGN_REFUS:' \+ p\.sign\.jourId \+ \(p\.sign\.week \? '#S' : ''\) \+ ':' \+ x\.wallet/.test(app) && /\.filter\(\(x\) => x\.refuse\)/.test(app);
    const src = fs.readFileSync(path.join(ICI, 'brain-jeu.js'), 'utf8');
    return cleApp && src.includes("!vus.has('POT_SIGN_REFUS:' + jidHier + (week ? '#S' : '') + ':' + bas(p.wallet))");
  });
  return R;
}

/* ---------------------------------------------------------------- (T) le texte */
function scenariosT(app) {
  const R = {};
  const tuile = (app.match(/<p id="regleRolls">([^<]*)<\/p>/) || [])[1] || '';
  R['T1-prix-des-regles-du-moment'] = !/fixed prize from the roll pot/.test(app)
    && /a winning score pays from the roll pot the prize set by the current rules \(read live\); the UNIT creator can change them for later rolls — never more than the pot holds/.test(tuile)
    && /a winning score pays from the roll pot the prize set by the current rules, read live \('/.test(app) && /The UNIT creator wallet can change the prizes/.test(app);
  return R;
}

const APP = lire('app.html'), ATT = lire('attester-ticketpot.html'), SRC_B = fs.readFileSync(path.join(ICI, 'brain-jeu.js'), 'utf8');
const RF = await scenariosF(APP), RR = await scenariosR(APP), RC = await scenariosC(APP), RD = await scenariosD(APP, ATT), RT = scenariosT(APP);
for (const R of [RF, RR, RC, RD, RT]) for (const [k, v] of Object.entries(R)) if (!k.includes(':')) ok(v === true, k + (R[k + ':err'] ? ' (' + R[k + ':err'] + ')' : ''));
console.log('    F1 : ' + RF['F1:texte'] + '\n    R1 : ' + RR['R1:detail'] + '\n    R2 : ' + RR['R2:detail'] + '\n    C1 : ' + RC['C1:detail'] + '\n    C2 : ' + RC['C2:detail']
  + '\n    C3 : ' + RC['C3:detail'] + '\n    C5 : ' + RC['C5:detail'] + '\n    D1 : ' + RD['D1:detail'] + '\n    D2 : ' + RD['D2:detail']);

let tues = 0, total = 0;
async function mutant(nom, src, de, vers, scen, rougit) {
  total += 1;
  if (src.split(de).length !== 2) { ok(false, 'MUTANT ' + nom + ' : motif absent (ou pas unique)'); return; }
  const Rm = await scen(src.replace(de, vers));
  const t = Rm[rougit] !== true; if (t) tues += 1;
  ok(t, 'MUTANT ' + nom + ' -> ' + rougit + ' ROUGIT');
}
await mutant('app : pot vide propose (veille)', APP, '    if (!(resteDe(x) > 0n)) continue;\n', '', scenariosF, 'F1-owner-veille-vide-ouverte');
await mutant('app : reste illisible compte', APP, 'try { return BigInt(x.reste); } catch (_) { return 0n; }', 'try { return BigInt(x.reste); } catch (_) { return 1n; }', scenariosF, 'F5-reste-illisible');
await mutant('app : ticket jamais dit', APP, '        if (tk) direTicketPaye(tk, hash);\n', '', scenariosR, 'R2-trop-vieux-dit');
await mutant('app : NON_LU renvoye 3 fois', APP, 'essai < (chaine ? 5 : 3)', 'essai < 3', scenariosR, 'R1-non-lu-5-renvois-puis-note');
await mutant('app : credite n efface pas la note', APP, "if (tk.ok === true || tk.etat === 'CREDITE') { ticketPayeNote = null; if (span) span.remove(); return; }", '', scenariosR, 'R3-credite-pas-de-note');
await mutant('app : P.jours non passe', APP, 'sharesDay, sharesWeek, jours,', 'sharesDay, sharesWeek,', (s) => scenariosC(s), 'C2-brain-close-J-2');
await mutant('app : parts des jours fermes non lues', APP, 'if (j.ferme === true && reste !== 0n) {', 'if (false) {', (s) => scenariosC(s), 'C3-brain-sign-semaine-du-dimanche');
await mutant('app : parts lues pour un pot vide', APP, 'if (j.ferme === true && reste !== 0n) {', 'if (j.ferme === true) {', (s) => scenariosC(s), 'C1-jours-et-parts-lus');
await mutant('app : tp.signes ignores', APP, "for (const x of (Array.isArray(tp.signes) ? tp.signes : []))", 'for (const x of [])', (s) => scenariosC(s), 'C6-jour-seulement-dans-signes');
await mutant('app : semaine jamais lue', APP, 'if (bjDernierJour(x.day)) j.sharesWeek = await lirePartsDe(x.jourId, true);', '', (s) => scenariosC(s), 'C3-brain-sign-semaine-du-dimanche');
await mutant('attester : 409 arrete la boucle', ATT, "refusees.push(p.wallet + ': ' + (r.pourquoi || 'refused')); continue; }", "refusees.push(p.wallet + ': ' + (r.pourquoi || 'refused')); break; }", (s) => scenariosD(APP, s), 'D1-attester-continue-apres-409');
await mutant('app : 409 arrete bjSignerParts', APP, "if (issue === 'PERIMEE' || issue === 'SANS_REPONSE') { arret = issue; break; }", '{ arret = issue; break; }', (s) => scenariosD(s, ATT), 'D2-bjSignerParts-continue-apres-409');
/* le brain : copie a cote de la source (ses imports relatifs), effacee */
{
  total += 1;
  const de = "\n          && !vus.has('POT_SIGN_REFUS:' + jidHier + (week ? '#S' : '') + ':' + bas(p.wallet)))";
  if (SRC_B.split(de).length !== 2) ok(false, 'MUTANT brain : refus ignore : motif absent (ou pas unique)');
  else {
    const f = path.join(ICI, 'brain-jeu.mutant-fix3-' + process.pid + '.js');
    fs.writeFileSync(f, SRC_B.replace(de, ')'));
    try { const M = await import(pathToFileURL(f).href); const Rm = await scenariosC(APP, M); const t = Rm['C5-part-refusee-plus-proposee'] !== true; if (t) tues += 1; ok(t, 'MUTANT brain : refus ignore -> C5-part-refusee-plus-proposee ROUGIT'); }
    finally { try { fs.unlinkSync(f); } catch (_) { /* rien */ } }
  }
}
console.log('mutants tues ' + tues + '/' + total);
console.log(n + ' assertions, ' + ko + ' KO - NE PROUVE PAS un vrai navigateur ni un vrai wallet, ni une lecture reelle de Base');
if (ko) process.exitCode = 1;
