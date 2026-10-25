/* test-draws-rouleaux-20261024.mjs — LES TROIS ROULEAUX DE LA CARTE DRAWS, SUR LE VRAI CODE, PAS SUR SON TEXTE.
 * Demande (Phil 2026-10-24) : « change le draw et fusionne pour le spin ; fais tourner l aleatoire en image colle au hash ; voir en direct
 *   les 3 faces tourner en boucle ».
 * PARTIE A — rouleaux.js EXECUTE contre de fausses cases, une fausse horloge et une fausse chaine (hash de chaque bloc connu du banc),
 *   faces dessinees par les VRAIES fonctions de l app (face-du-jour.js faceRevelee, logo.js logoSvg / paramsLogoDepuisApparence) :
 *   LIVE      au repos, chaque face visible == la face du hash du bloc de son etiquette ; apres une pause, les etiquettes == N-2, N-1, N
 *             de la derniere tete, et la legende le dit ;
 *   CADENCE   blocs de 200 ms, une tete toutes les 200 ms : une pose au plus par case et par seconde, blocs intermediaires sautes, lectures
 *             eth_getBlockByNumber bornees (comptees par minute) ;
 *   SPIN      un spin (cible t) : les cases tournent jusqu a t, t+1, t+2, puis se posent UNE A UNE sur svgSpin(hash(t+r), id, r) ; surPose
 *             une fois, apres la 3e ; la legende dit le spin ;
 *   RESULTAT  un spin regle : montre, puis LIVE apres RESULTAT_MS ; le meme spin n y revient plus ;
 *   REDUIT    mouvement reduit : jamais de rotation ; une case qui attend son bloc est VIDE (pas une face d un autre bloc) ;
 *   CACHE     page cachee : aucune lecture, aucune rotation ; visible : une lecture, puis les poses ;
 *   ILLISIBLE un bloc illisible : la case garde sa face et son etiquette (exactes), relu au plus toutes les ECHEC_MS ;
 *   BOUCLE    la boucle decorative ne fait defiler que des faces deja posees et se repose sur les memes faces, memes etiquettes ;
 *   RETARD    (revue adverse 2026-10-24) noeud en retard, tete figee : la plus recente fenetre de trois blocs LUS (N-4..N-2, N-3..N-1),
 *             jamais la tete brute avec une case vide ; aucune fenetre lue : rien de pose, « Reading… ».
 *   + APP_SUIT : un spin recent en attente et un ancien reglable — les rouleaux suivent celui de Settle ; APP_LIVE : les hashes de la tete
 *     lus par les rouleaux n entrent pas dans slotsCfg.hashes.
 * PARTIE B — le bloc des rouleaux de app.html (« LES ROULEAUX DE LA CARTE DRAWS » .. « FIN DES ROULEAUX ») ET le bloc des slots
 *   (« LES SLOTS » .. « EARN ») EXECUTES ensemble (faux DOM, fausse chaine avec un spin, vraies faces) :
 *   APP_LIVE  les faces au repos == logoSvg(paramsLogoDepuisApparence(faceRevelee(hash), '★')) — la face de « Base block N » ;
 *   APP_SPIN  un spin en attente (TROP_TOT) fait tourner les rouleaux ; ses trois blocs arrives, les faces == svgFaceSlot (la graine du
 *             contrat : faceRevelee(Slots.graine(hash, id, r))), posees une a une ; les points par trait n apparaissent qu APRES la 3e et
 *             == Slots.accordsParTrait ; la ligne du spin dit Slots.points (pointsFor) et le prix de la table ;
 *   APP_RPC   les lectures des rouleaux par minute, a 2 s et a 200 ms par bloc, nourris comme la page (relireJeu a intervalleJeuMs, l apercu
 *             du serveur toutes les 8 s) ;
 *   APP_CACHE autre jeu choisi (data-hors) : aucune lecture ; APP_REDUIT : prefers-reduced-motion -> aucune rotation ;
 *   SOURCE    la page importe rouleaux.js, le serveur le sert, relireJeu / l apercu / le minuteur des slots nourrissent les rouleaux (la
 *             tete deja lue, aucun minuteur de plus), l ordre de la carte : rouleaux -> roll -> Roll | Spin -> ticket / pot.
 * Chaque affirmation est rejouee sur une COPIE MUTEE (rouleaux.js ou app.html, en memoire) et doit alors rougir.
 * ⛔ NE PROUVE PAS : le rendu au navigateur (animation, hauteur de la carte a 375 px), Base reel, un wallet reel. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as Slots from './slots-plan.js';
import { faceRevelee } from './face-du-jour.js';
import { logoSvg, paramsLogoDepuisApparence } from './logo.js';
import { usdc as usdcTexte } from './rolls-jeu.js';
import { topic } from './keccak.js';

let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const lire = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('app.html'), ROU = lire('rouleaux.js'), SRV = lire('serveur-web.js');
const P = JSON.parse(lire('contracts/slots-parametres.json'));
const entre = (t, a, b) => { const i = t.indexOf(a), j = t.indexOf(b, i + 1); return i >= 0 && j > i ? t.slice(i, j) : ''; };
const charger = async (code) => import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const fmt = (x) => Number(x).toLocaleString('en-US');
const H = (b) => '0x' + createHash('sha256').update('bloc:' + b).digest('hex');
/* la legende LIVE attendue : « Live: the faces of Base blocks 53,031,700–702. » (meme millier : les 3 derniers chiffres du dernier) */
const legendeAttendue = ([a, , c]) => 'Live: the faces of Base blocks ' + fmt(a) + '–' + (Math.floor(a / 1000) === Math.floor(c / 1000) ? String(c % 1000).padStart(3, '0') : fmt(c)) + '.';
const svgLiveVrai = (h) => { const f = faceRevelee(h); return f ? logoSvg(paramsLogoDepuisApparence(f, '★')) : ''; };
/* l oracle de la face d un spin : la formule du contrat, recalculee ici A PART (graine -> face -> image) */
const svgSpinVrai = (h, id, r) => { const f = faceRevelee(Slots.graine(h, id, r)); return f ? logoSvg(paramsLogoDepuisApparence(f, String(r + 1))) : ''; };

/* ---------------------------------------------------------------- la fausse horloge (une seule file pour toute la page) */
function faireHorloge() {
  let t = 1_000_000, seq = 0;
  const q = [];
  const planifier = (f, ms, rep = 0) => { const id = ++seq; q.push({ id, at: t + Math.max(0, Number(ms) || 0), f, rep }); return id; };
  const annuler = (id) => { const i = q.findIndex((x) => x.id === id); if (i >= 0) q.splice(i, 1); };
  const vider = async () => { for (let k = 0; k < 4; k++) await new Promise((r) => setImmediate(r)); };
  return {
    maintenant: () => t, planifier, annuler,
    setTimeout: (f, ms) => planifier(f, ms), clearTimeout: annuler, setInterval: (f, ms) => planifier(f, ms, Math.max(1, Number(ms) || 1)),
    async avancer(ms, apresChaque = null) {
      const fin = t + ms;
      for (;;) {
        q.sort((a, b) => a.at - b.at || a.id - b.id);
        const x = q[0];
        if (!x || x.at > fin) break;
        q.shift(); t = x.at;
        if (x.rep) q.push({ ...x, at: t + x.rep });
        try { x.f(); } catch (e) { if (!(e instanceof ReferenceError)) throw e; }
        await vider();
        if (apresChaque) apresChaque(t);
      }
      t = fin; await vider();
    },
  };
}
/* ---------------------------------------------------------------- les fausses cases */
function faireCase(id) {
  const e = { id, innerHTML: '', dataset: {}, attrs: {}, _c: new Set(), hidden: false, textContent: '' };
  e.classList = { contains: (c) => e._c.has(c), toggle: (c, on) => { if (on) e._c.add(c); else e._c.delete(c); } };
  e.setAttribute = (k, v) => { e.attrs[k] = String(v); };
  e.getAttribute = (k) => (k in e.attrs ? e.attrs[k] : null);
  return e;
}
/* ---------------------------------------------------------------- la fausse chaine (partie A) */
function faireChaineA(h, { msBloc, depart = 5000, echoue = () => false }) {
  const t0 = h.maintenant();
  const c = { lectures: 0, parMinute: [], echoue };
  c.tete = () => depart + Math.floor((h.maintenant() - t0) / msBloc);
  c.lireBloc = async (b) => { c.lectures += 1; c.parMinute.push(h.maintenant()); if (b > c.tete() || c.echoue(b)) return null; return { hash: H(b), parentHash: H(b - 1) }; };
  return c;
}
function monterA(R, h, ch, o = {}) {
  const cases = [0, 1, 2].map((r) => faireCase('c' + r)), etiquettes = [0, 1, 2].map((r) => faireCase('e' + r)), legende = faireCase('leg');
  const poses = [];
  const etat = { reduit: !!o.reduit, cache: !!o.cache };
  const api = R.creerRouleaux({ cases, etiquettes, legende, lireBloc: ch.lireBloc, svgLive: o.svgLive || svgLiveVrai, svgSpin: o.svgSpin || svgSpinVrai,
    horloge: h, reduit: () => etat.reduit, cache: () => etat.cache, fmt, surPose: (x) => poses.push({ ...x, a: h.maintenant() }) });
  return { api, cases, etiquettes, legende, poses, etat };
}
/* le controle « au repos » : une case qui ne tourne pas et montre une image montre la face du hash du bloc de SON etiquette */
function auReposExact(m, mode = 'live', spinId = null) {
  for (let r = 0; r < 3; r++) {
    const el = m.cases[r];
    if (el.dataset.roule === '1' || el.innerHTML === '') continue;
    const b = Number(el.dataset.bloc);
    if (!Number.isSafeInteger(b)) return { ok: false, r, pourquoi: 'case sans bloc' };
    if (m.etiquettes[r].textContent !== fmt(b)) return { ok: false, r, pourquoi: 'etiquette ' + m.etiquettes[r].textContent + ' != ' + fmt(b) };
    const attendu = mode === 'live' ? svgLiveVrai(H(b)) : svgSpinVrai(H(b), spinId, r);
    if (el.innerHTML !== attendu) return { ok: false, r, b, pourquoi: 'face != face du hash du bloc etiquete' };
  }
  return { ok: true };
}

const S = {};
/* ---------------------------------------------------------------- A : LIVE */
S.LIVE = async (R) => {
  const h = faireHorloge(), ch = faireChaineA(h, { msBloc: 2000 }), m = monterA(R, h, ch);
  let controles = 0, ko = null;
  const nourrir = () => m.api.tete(ch.tete());
  h.setInterval(nourrir, 1000); nourrir();
  /* MESURE au navigateur (serveur local, 375 px, 2026-10-24) : pendant une avance, les etiquettes se lisaient « 645, 643, 644 » (la 1re
   *   posee, les deux autres encore sur leur ancien bloc) — a TOUT instant, les trois etiquettes (et la legende) disent N-2, N-1, N d une
   *   meme tete : une case qui tourne porte deja le bloc qui se pose */
  const suite = () => {
    const e = m.etiquettes.map((x) => Number(x.textContent.replace(/,/g, '')));
    if (e.some((v) => !v)) return true;
    return e[1] === e[0] + 1 && e[2] === e[1] + 1 && m.legende.textContent === legendeAttendue(e);
  };
  await h.avancer(60000, () => { const x = auReposExact(m); controles += 1; if (!x.ok && !ko) ko = x; if (!suite() && !ko) ko = { pourquoi: 'etiquettes hors suite', e: m.etiquettes.map((y) => y.textContent), leg: m.legende.textContent }; });
  /* un noeud en retard : le bloc de la tete n est jamais servi (eth_getBlockByNumber rend null) — les trois cases avancent ENSEMBLE sur la
   *   plus haute tete dont les trois blocs sont lus (mesure au navigateur : « 702, 699, 700 » avant le correctif) */
  {
    const hr = faireHorloge(); let chr = null; chr = faireChaineA(hr, { msBloc: 2000, echoue: (b) => b === chr.tete() }); const mr = monterA(R, hr, chr);
    const voir = () => { const e = mr.etiquettes.map((x) => Number(x.textContent.replace(/,/g, ''))); if (e.every(Boolean) && !(e[1] === e[0] + 1 && e[2] === e[1] + 1) && !ko) ko = { pourquoi: 'retard : etiquettes hors suite', e }; const x = auReposExact(mr); if (!x.ok && !ko) ko = x; };
    hr.setInterval(() => mr.api.tete(chr.tete()), 1000); mr.api.tete(chr.tete());
    await hr.avancer(60000, voir);
    if (!ko && mr.api.etat().poses < 15) ko = { pourquoi: 'retard : les rouleaux n avancent plus', poses: mr.api.etat().poses };
    if (!ko && !mr.etiquettes.every((x) => x.textContent) ) ko = { pourquoi: 'retard : une case jamais posee', e: mr.etiquettes.map((x) => x.textContent) };
  }
  /* pause : plus de tete ; la derniere tete H -> etiquettes N-2, N-1, N (la boucle decorative ne change ni etiquette ni bloc) */
  const h2 = faireHorloge(), ch2 = faireChaineA(h2, { msBloc: 2000 }), m2 = monterA(R, h2, ch2);
  const T = ch2.tete(); m2.api.tete(T);
  await h2.avancer(20000, () => { const x = auReposExact(m2); if (!x.ok && !ko) ko = x; });
  const blocs = m2.cases.map((c) => Number(c.dataset.bloc)), etiq = m2.etiquettes.map((e) => e.textContent);
  const attendus = [T - 2, T - 1, T];
  const legende = m2.legende.textContent === legendeAttendue(attendus);
  const poses = m.api.etat().poses;
  return { ok: !ko && controles > 100 && poses > 20 && JSON.stringify(blocs) === JSON.stringify(attendus) && JSON.stringify(etiq) === JSON.stringify(attendus.map(fmt)) && legende,
    ko, controles, poses, blocs, attendus, leg: m2.legende.textContent };
};
/* ---------------------------------------------------------------- A : CADENCE (Denim, 200 ms) */
S.CADENCE = async (R) => {
  const h = faireHorloge(), ch = faireChaineA(h, { msBloc: 200 }), m = monterA(R, h, ch);
  let ko = null;
  h.setInterval(() => m.api.tete(ch.tete()), 200);
  await h.avancer(120000, () => { const x = auReposExact(m); if (!x.ok && !ko) ko = x; });
  const j = m.api.etat().journal;
  let ecartMin = Infinity;
  for (let r = 0; r < 3; r++) { const a = j.filter((x) => x.r === r).map((x) => x.a); for (let k = 1; k < a.length; k++) ecartMin = Math.min(ecartMin, a[k] - a[k - 1]); }
  /* les blocs montres sautent : la tete avance de 5 blocs/s, les poses d une case sont >= 1 s */
  const blocs0 = j.filter((x) => x.r === 2).map((x) => Number(x.cle.slice(2)));
  const sauts = blocs0.slice(1).map((b, k) => b - blocs0[k]);
  const parMinute = ch.lectures / 2;
  const borne = 2 * Math.ceil(60000 / R.LECTURE_MIN_MS) + 2;
  return { ok: !ko && ecartMin >= R.POSE_MIN_MS && sauts.length > 5 && sauts.every((s) => s > 1) && parMinute <= borne && j.length > 30, ko, ecartMin, parMinute, borne, sauts: sauts.slice(0, 6), poses: j.length };
};
/* ---------------------------------------------------------------- A : SPIN */
S.SPIN = async (R) => {
  const h = faireHorloge(), ch = faireChaineA(h, { msBloc: 2000 }), m = monterA(R, h, ch);
  let ko = null;
  h.setInterval(() => m.api.tete(ch.tete()), 1000); m.api.tete(ch.tete());
  await h.avancer(8000);
  const t = ch.tete() + 2, id = '41';
  m.api.suivre({ id, t });
  await h.avancer(1500);
  /* avant ses blocs : les trois tournent, etiquetees t, t+1, t+2, aucune face posee ; la legende dit le spin */
  const avant = m.cases.every((c) => c.dataset.roule === '1') && m.etiquettes.map((e) => e.textContent).join() === [t, t + 1, t + 2].map(fmt).join()
    && m.legende.textContent === 'Spin #' + id + ': blocks ' + [t, t + 1, t + 2].map(fmt).join(', ') + ' draw its three faces.' && m.poses.length === 0;
  await h.avancer(20000, () => { const x = auReposExact(m, 'spin', id); if (!x.ok && !ko) ko = x; if (m.poses.length === 0 && m.api.pose(id)) ko = ko || { pourquoi: 'pose() vrai avant surPose' }; });
  const j = m.api.etat().journal.filter((x) => x.cle.startsWith('S:' + id + ':'));
  const ordre = j.length === 3 && j[0].r === 0 && j[1].r === 1 && j[2].r === 2 && j[0].a < j[1].a && j[1].a < j[2].a;
  const faces = m.cases.every((c, r) => c.innerHTML === svgSpinVrai(H(t + r), id, r));
  const pose = m.poses.length === 1 && m.poses[0].id === id && m.poses[0].hashes.join() === [H(t), H(t + 1), H(t + 2)].join() && m.poses[0].a >= j[2].a;
  const leg = m.legende.textContent === 'Spin #' + id + ': its faces, from blocks ' + [t, t + 1, t + 2].map(fmt).join(', ') + '.';
  /* fin du spin (regle ailleurs ou fenetre close) : retour au LIVE, faces des derniers blocs */
  m.api.suivre(null);
  await h.avancer(6000);
  const T = Number(m.cases[2].dataset.bloc);
  const live = m.api.etat().mode === 'LIVE' && auReposExact(m).ok && m.cases.every((c) => /^\d+$/.test(c.dataset.bloc)) && T >= t + 2;
  /* un spin dont les trois blocs sont DEJA la (page ouverte apres coup) : les faces se posent quand meme une a une */
  const t2 = ch.tete() - 20;
  m.api.suivre({ id: '42', t: t2 });
  await h.avancer(4000);
  const j2 = m.api.etat().journal.filter((x) => x.cle.startsWith('S:42:'));
  const uneAUne = j2.length === 3 && j2.map((x) => x.r).join() === '0,1,2' && j2[0].a < j2[1].a && j2[1].a < j2[2].a && m.cases.every((c, r) => c.innerHTML === svgSpinVrai(H(t2 + r), '42', r));
  return { ok: !ko && avant && ordre && faces && pose && leg && live && uneAUne, ko, avant, ordre, faces, pose, leg, live, uneAUne, j, j2 };
};
/* ---------------------------------------------------------------- A : RESULTAT */
S.RESULTAT = async (R) => {
  const h = faireHorloge(), ch = faireChaineA(h, { msBloc: 2000 }), m = monterA(R, h, ch);
  h.setInterval(() => m.api.tete(ch.tete()), 1000); m.api.tete(ch.tete());
  await h.avancer(6000);
  const hs = [H(77), H(78), H(79)];
  m.api.resultat({ id: '9', hashes: hs });
  await h.avancer(3000);
  const montre = m.api.etat().mode === 'RESULTAT' && m.cases.every((c, r) => c.innerHTML === svgSpinVrai(hs[r], '9', r)) && m.poses.length === 1;
  await h.avancer(R.RESULTAT_MS + 6000);
  const revenu = m.api.etat().mode === 'LIVE' && auReposExact(m).ok;
  m.api.resultat({ id: '9', hashes: hs });
  await h.avancer(3000);
  const pasDeRetour = m.api.etat().mode === 'LIVE' && m.poses.length === 1;
  return { ok: montre && revenu && pasDeRetour, montre, revenu, pasDeRetour };
};
/* ---------------------------------------------------------------- A : REDUIT */
S.REDUIT = async (R) => {
  const h = faireHorloge(), ch = faireChaineA(h, { msBloc: 2000 }), m = monterA(R, h, ch, { reduit: true });
  let tourne = false, ko = null, mode = 'live';
  const voir = () => { if (m.cases.some((c) => c.dataset.roule === '1' || c._c.has('roule') || /rouleauBande/.test(c.innerHTML))) tourne = true; const x = auReposExact(m, mode, '5'); if (!x.ok && !ko) ko = { ...x, mode }; };
  h.setInterval(() => m.api.tete(ch.tete()), 1000); m.api.tete(ch.tete());
  await h.avancer(30000, voir);
  const poses = m.api.etat().poses;
  /* un spin a venir : ses cases attendent VIDES (aucune face d un autre bloc sous l etiquette de son bloc) */
  const t = ch.tete() + 3;
  m.api.suivre({ id: '5', t }); mode = 'spin';
  await h.avancer(800, voir);
  const vides = m.cases.every((c) => c.innerHTML === '' && c.dataset.gagne === '0') && m.etiquettes.map((e) => e.textContent).join() === [t, t + 1, t + 2].map(fmt).join();
  await h.avancer(15000, voir);
  const poseSpin = m.cases.every((c, r) => c.innerHTML === svgSpinVrai(H(t + r), '5', r));
  return { ok: !tourne && !ko && poses >= 6 && vides && poseSpin, tourne, ko, poses, vides, poseSpin };
};
/* ---------------------------------------------------------------- A : CACHE (page cachee) */
S.CACHE = async (R) => {
  const h = faireHorloge(), ch = faireChaineA(h, { msBloc: 2000 }), m = monterA(R, h, ch, { cache: true });
  let tourne = false;
  h.setInterval(() => m.api.tete(ch.tete()), 1000); m.api.tete(ch.tete());
  await h.avancer(30000, () => { if (m.cases.some((c) => c.dataset.roule === '1')) tourne = true; });
  const aucune = ch.lectures === 0 && m.api.etat().poses === 0 && !tourne;
  m.etat.cache = false; m.api.reprendre();
  await h.avancer(4000);
  const reprend = ch.lectures > 0 && ch.lectures <= 2 && m.api.etat().poses === 3 && auReposExact(m).ok;
  /* cachee pendant la boucle : la boucle s arrete sur les memes faces et ne repart pas */
  m.etat.cache = true;
  await h.avancer(30000, () => {});
  const lect = ch.lectures;
  const reposee = m.cases.every((c) => c.dataset.roule !== '1') && auReposExact(m).ok;
  await h.avancer(30000);
  return { ok: aucune && reprend && reposee && ch.lectures === lect, aucune, reprend, reposee, lect, apres: ch.lectures };
};
/* ---------------------------------------------------------------- A : ILLISIBLE */
S.ILLISIBLE = async (R) => {
  let panne = false;
  const h = faireHorloge(), ch = faireChaineA(h, { msBloc: 2000, echoue: () => panne }), m = monterA(R, h, ch);
  let ko = null;
  h.setInterval(() => m.api.tete(ch.tete()), 1000); m.api.tete(ch.tete());
  await h.avancer(8000);
  const avant = m.cases.map((c) => c.dataset.bloc).join();
  panne = true;
  /* LIVE : les blocs nouveaux sont illisibles — chaque case garde sa face et son etiquette (exactes) */
  await h.avancer(30000, () => { const x = auReposExact(m); if (!x.ok && !ko) ko = x; });
  const garde = m.cases.map((c) => c.dataset.bloc).join() === avant;
  /* SPIN : ses trois blocs EXISTENT mais sont illisibles — relus au plus toutes les ECHEC_MS (le tour du spin, lui, revient chaque seconde) */
  const t = ch.tete() - 10, id = '3'; const l0 = ch.lectures;
  m.api.suivre({ id, t });
  let faceVue = false;
  await h.avancer(30000, () => { if (m.cases.some((c) => c.dataset.roule !== '1' && c.innerHTML !== '')) faceVue = true; });
  const relu = ch.lectures - l0, borne = 3 * Math.ceil(30000 / R.ECHEC_MS) + 3;
  panne = false;
  await h.avancer(10000);
  const pose = m.cases.every((c, r) => c.innerHTML === svgSpinVrai(H(t + r), id, r));
  return { ok: !ko && garde && relu > 0 && relu <= borne && !faceVue && pose, ko, garde, relu, borne, faceVue, pose };
};
/* ---------------------------------------------------------------- A : BOUCLE decorative */
S.BOUCLE = async (R) => {
  const h = faireHorloge(), ch = faireChaineA(h, { msBloc: 2000 }), m = monterA(R, h, ch);
  m.api.tete(ch.tete());
  const posees = new Set();
  let tourne = false, etranger = false, ko = null;
  await h.avancer(30000, () => {
    for (const c of m.cases) {
      if (c.dataset.roule === '1') { tourne = true; for (const s of c.innerHTML.split('<svg').slice(1)) if (!posees.has('<svg' + s.replace(/<\/div>$/, ''))) etranger = true; }
      else if (c.innerHTML) posees.add(c.innerHTML);
    }
    const x = auReposExact(m); if (!x.ok && !ko) ko = x;
  });
  const blocs = m.cases.map((c) => c.dataset.bloc).join(), T = ch.tete();
  return { ok: tourne && !etranger && !ko && m.api.etat().poses === 3 && ch.lectures <= 2 && !!blocs, tourne, etranger, ko, poses: m.api.etat().poses, lectures: ch.lectures, T };
};
/* ---------------------------------------------------------------- A : RETARD (revue adverse 2026-10-24) — un noeud en retard, tete FIGEE
 *   (aucune tete nouvelle ne relance un tour : UNE lecture doit suffire). Avant : la tete brute N servait de base, la 3e case restait VIDE
 *   sous l etiquette N. Attendu : la plus recente fenetre de trois blocs LUS, etiquetee et dite par la legende ; sans fenetre lue, rien. */
S.RETARD = async (R) => {
  const T = 5000;
  const cas = async (echoue) => {
    const h = faireHorloge(), ch = faireChaineA(h, { msBloc: 1e12, depart: T, echoue }), m = monterA(R, h, ch);
    let ko = null;
    m.api.tete(T);
    await h.avancer(15000, () => { const x = auReposExact(m); if (!x.ok && !ko) ko = x; });
    return { m, ch, ko, blocs: m.cases.map((c) => Number(c.dataset.bloc)), etiq: m.etiquettes.map((e) => e.textContent), leg: m.legende.textContent, vides: m.cases.every((c) => c.innerHTML === '') };
  };
  /* (a) N et N-1 pas encore servis : N-4, N-3, N-2 */
  const a = await cas((b) => b >= T - 1);
  const okA = !a.ko && a.blocs.join() === [T - 4, T - 3, T - 2].join() && a.etiq.join() === [T - 4, T - 3, T - 2].map(fmt).join() && a.m.cases.every((c) => c.innerHTML !== '')
    && a.leg === legendeAttendue([T - 4, T - 3, T - 2]) && a.ch.lectures <= 4;
  /* (b) N seul pas servi : N-3, N-2, N-1 */
  const b = await cas((x) => x === T);
  const okB = !b.ko && b.blocs.join() === [T - 3, T - 2, T - 1].join() && b.m.cases.every((c) => c.innerHTML !== '') && b.leg === legendeAttendue([T - 3, T - 2, T - 1]) && b.ch.lectures <= 3;
  /* (c) seul N est servi (N-1 par son parentHash) : aucune fenetre de trois — RIEN n est pose, la legende dit qu elle lit */
  const c = await cas((x) => x !== T);
  const okC = !c.ko && c.vides && c.etiq.every((e) => e === '') && c.leg === 'Reading the latest Base blocks…';
  return { ok: okA && okB && okC, okA, okB, okC, a: { blocs: a.blocs, leg: a.leg, l: a.ch.lectures, ko: a.ko }, b: { blocs: b.blocs, leg: b.leg, l: b.ch.lectures }, c: { etiq: c.etiq, leg: c.leg, vides: c.vides } };
};

/* ================================================================ PARTIE B : le vrai code de app.html */
const CONTRAT = '0x' + 'cc'.repeat(20), MOI = '0x' + 'a1'.repeat(20);
const w = (x) => BigInt(x).toString(16).padStart(64, '0');
const { toPot: TO_POT, toDev: TO_DEV } = Slots.partsDuSpin(P.spinPrice, P.potShareBps);
const FICHE = { ok: true, contrat: CONTRAT, prixSpin: P.spinPrice, potShareBps: P.potShareBps, prizes: P.prizes, esperanceBrut: '127862', bloc: 900, regleur: { etat: 'OFF', adresse: null, msParBlocMesure: 2000 } };
function faireChaineB(h, { msBloc = 2000, depart = 1000, spins = [], pot = 50000000n }) {
  const t0 = h.maintenant();
  const c = { pot: BigInt(pot), spins: new Map(spins.map((s) => [String(s.id), { statut: 1, ...s, id: String(s.id) }])), compte: { tete: 0, bloc: 0, autres: 0 }, temps: [] };
  c.tete = () => depart + Math.floor((h.maintenant() - t0) / msBloc);
  c.rpc = async (m, p) => {
    if (m === 'eth_blockNumber') { c.compte.tete += 1; c.temps.push(['tete', h.maintenant()]); return '0x' + c.tete().toString(16); }
    if (m === 'eth_getBlockByNumber') {
      c.compte.bloc += 1; c.temps.push(['bloc', h.maintenant()]);
      const b = parseInt(p[0], 16);
      if (b > c.tete()) return null;
      return { hash: H(b), parentHash: H(b - 1), timestamp: '0x' + Math.floor((b * msBloc) / 1000).toString(16) };
    }
    c.compte.autres += 1;
    if (m === 'eth_getLogs') {
      const f = p[0], de = parseInt(f.fromBlock, 16), jq = parseInt(f.toBlock, 16);
      return [...c.spins.values()].filter((s) => s.t - 2 >= de && s.t - 2 <= jq && '0x' + w(MOI) === f.topics[2])
        .map((s) => ({ address: CONTRAT, topics: [Slots.TOPIC_SPUN, '0x' + w(s.id), '0x' + w(MOI)], data: '0x' + w(s.t) + w(TO_POT) + w(TO_DEV) }));
    }
    if (m === 'eth_call') {
      const d = p[0].data.toLowerCase();
      if (d === Slots.appelPot()) return '0x' + w(c.pot);
      if (d === Slots.appelPointsDe(MOI) || d === Slots.appelGagneDe(MOI)) return '0x' + w(0);
      if (d.startsWith(Slots.appelSpin(0).slice(0, 10))) { const s = c.spins.get(String(BigInt('0x' + d.slice(10)))); return s ? '0x' + w(MOI) + w(s.t) + w(s.statut) : '0x' + w(0) + w(0) + w(0); }
    }
    throw new Error('rpc inattendu ' + m);
  };
  return c;
}
function faireDomB() {
  const els = new Map();
  const el = (id) => {
    if (!els.has(id)) {
      const e = { id, innerHTML: '', hidden: true, disabled: false, dataset: {}, enfants: [], ecoute: {}, attrs: {}, _c: new Set(), on: true };
      e.classList = { contains: (c) => (id === 'v-missions' && c === 'on' ? e.on : e._c.has(c)), toggle: (c, on) => { if (on) e._c.add(c); else e._c.delete(c); } };
      e.append = (x) => { e.enfants.push(x); };
      e.setAttribute = (k, v) => { e.attrs[k] = String(v); };
      e.getAttribute = (k) => (k in e.attrs ? e.attrs[k] : null);
      e.addEventListener = (t, f) => { e.ecoute[t] = f; };
      Object.defineProperty(e, 'textContent', { get() { return this._t || ''; }, set(v) { this._t = String(v); if (v === '') this.enfants = []; } });
      els.set(id, e);
    }
    return els.get(id);
  };
  const cases = [el('f1'), el('f2'), el('f3')];
  el('tirCarte').hidden = false;
  const docEcoute = {};
  const document = {
    hidden: false,
    querySelector: (s) => (s === '.jeuBandeau' ? el('bandeau') : s === '#slotsTable tbody' ? el('tbody') : s.startsWith('#') ? el(s.slice(1)) : null),
    querySelectorAll: (s) => (s === '#slotsFaces .jourFace' ? cases : []),
    getElementById: (id) => el(id),
    createElement: () => { const x = { dataset: {}, enfants: [], append(y) { this.enfants.push(y); } }; Object.defineProperty(x, 'textContent', { get() { return this._t || ''; }, set(v) { this._t = String(v); } }); return x; },
    addEventListener: (t, f) => { docEcoute[t] = f; },
  };
  return { el, document, cases, docEcoute };
}
const blocRouleaux = (t) => entre(t, '/* ══ LES ROULEAUX DE LA CARTE DRAWS', '/* ══ FIN DES ROULEAUX */');
const blocSlots = (t) => entre(t, '/* ══ LES SLOTS (Phil 2026-10-23', '/* ══ EARN (Phil 19:40)');
async function monterB(texteApp, ch, h, { compte = MOI, reduit = false, avecSlots = true, R = null } = {}) {
  const dom = faireDomB();
  const Rmod = R || (await charger(ROU));
  const code = blocRouleaux(texteApp) + '\n' + (avecSlots ? blocSlots(texteApp) : '');
  const ctx = {
    document: dom.document, window: { matchMedia: () => ({ matches: reduit }) }, creerRouleaux: Rmod.creerRouleaux,
    faceRevelee, logoSvg, paramsLogoDepuisApparence, Slots, usdcTexte, compte, USDC_BASE: '0x' + '83'.repeat(20),
    $: (s) => dom.document.querySelector(s), jb: (id, t) => { dom.el(id).textContent = t; }, rpc: (m, p) => ch.rpc(m, p),
    fetch: async () => ({ json: async () => FICHE }), AbortSignal: { timeout: () => undefined },
    phraseNonConfirme: (r, pre) => pre, envoyerAppels: async () => ({ etat: 'ECHEC_ENVOI' }), recusLogs: async () => ({ logs: [] }),
    setTimeout: h.setTimeout, clearTimeout: h.clearTimeout, setInterval: h.setInterval, Date: { now: h.maintenant }, peindreChoixJeu: () => {},
  };
  if (!avecSlots) Object.assign(ctx, { slotsCfg: { hashes: new Map() }, svgFaceSlot: () => '', peindreAccordsSlots: () => {} });
  const noms = Object.keys(ctx);
  const sortie = avecSlots ? 'rouleauxJeu, rouleauxTete, rouleauxLire, rouleauxSuivre, peindreSlots, slotsCfg, svgFaceSlot' : 'rouleauxJeu, rouleauxTete, rouleauxLire, rouleauxSuivre';
  const f = new Function(...noms, code + '\n;return { ' + sortie + ' };');
  return { ...f(...noms.map((k) => ctx[k])), dom, ctx };
}
const etiquettesB = (dom) => [1, 2, 3].map((k) => dom.el('rouleauBloc' + k).textContent);
function reposB(app, mode = 'live', id = null) {
  for (let r = 0; r < 3; r++) {
    const el = app.dom.cases[r];
    if (el.dataset.roule === '1' || el.innerHTML === '') continue;
    const b = Number(el.dataset.bloc);
    if (etiquettesB(app.dom)[r] !== fmt(b)) return false;
    if (el.innerHTML !== (mode === 'live' ? svgLiveVrai(H(b)) : svgSpinVrai(H(b), id, r))) return false;
  }
  return true;
}
S.APP_LIVE = async (R, texte = APP) => {
  const h = faireHorloge(), ch = faireChaineB(h, {}), app = await monterB(texte, ch, h, { compte: null, R });
  let ko = false, controles = 0;
  h.setInterval(() => { void app.rouleauxLire(); }, 20000); h.setInterval(() => app.rouleauxTete(ch.tete() - 1), 8000);
  app.rouleauxTete(ch.tete());
  await h.avancer(90000, () => { controles += 1; if (!reposB(app)) ko = true; });
  const blocs = app.dom.cases.map((c) => Number(c.dataset.bloc));
  const consecutifs = blocs[1] === blocs[0] + 1 && blocs[2] === blocs[1] + 1;
  const leg = app.dom.el('rouleauxLegende').textContent === legendeAttendue(blocs);
  /* 2026-10-24 (revue adverse, reorg) : les hashes de la TETE lus par les rouleaux n entrent jamais dans le magasin des slots (sans wallet,
   *   les slots n en lisent aucun : le leur reste vide) */
  const partageVide = app.slotsCfg.hashes.size === 0 && app.rouleauxJeu.etat().lectures > 5;
  return { ok: !ko && controles > 20 && consecutifs && leg && app.rouleauxJeu.etat().poses >= 9 && partageVide, ko, controles, blocs, partageVide, leg: app.dom.el('rouleauxLegende').textContent };
};
/* 2026-10-24 (revue adverse) : un spin RECENT en attente (TROP_TOT) et un plus ANCIEN reglable — Settle parle de l ancien : les rouleaux le
 *   montrent (et sa legende le nomme), pas le recent */
S.APP_SUIT = async (R, texte = APP) => {
  const h = faireHorloge();
  const ch = faireChaineB(h, { depart: 1000, spins: [{ id: '5', t: 995 }, { id: '6', t: 1002 }] });
  const app = await monterB(texte, ch, h, { R });
  app.rouleauxTete(ch.tete());
  await app.peindreSlots(true);
  await h.avancer(5000);
  /* 2026-10-25 (test live) : #5 n a aucun prix ici — le bouton dit « Record spin #5's points (no prize) » (jamais « · 0.00 USDC ») et
   *   nomme toujours SON spin */
  const bouton = app.dom.el('slotsRegler').hidden === false && app.dom.el('slotsRegler').textContent === 'Record spin #5\'s points (no prize)';
  const j = app.rouleauxJeu.etat().journal;
  const suitLAncien = j.some((x) => x.cle.startsWith('S:5:')) && !j.some((x) => x.cle.startsWith('S:6:'));
  const leg = app.dom.el('rouleauxLegende').textContent === 'Spin #5: its faces, from blocks ' + [995, 996, 997].map(fmt).join(', ') + '.';
  const faces = app.dom.cases.every((c, r) => c.innerHTML === svgSpinVrai(H(995 + r), '5', r));
  return { ok: bouton && suitLAncien && leg && faces, bouton, suitLAncien, leg, faces, legende: app.dom.el('rouleauxLegende').textContent, settle: app.dom.el('slotsRegler').textContent };
};
S.APP_SPIN = async (R, texte = APP) => {
  const h = faireHorloge();
  const t = 1002, id = '7';
  const ch = faireChaineB(h, { depart: 1000, spins: [{ id, t }] });
  const app = await monterB(texte, ch, h, { R });
  app.rouleauxTete(ch.tete());
  await app.peindreSlots(true);
  await h.avancer(1200);
  const acc = () => app.dom.el('slotsAccords').enfants.map((s) => s.textContent + (s.enfants[0] ? s.enfants[0].textContent : ''));
  /* en attente (TROP_TOT) : les rouleaux suivent le spin et tournent ; aucun point montre */
  const attente = app.rouleauxJeu.etat().mode === 'SPIN' && app.dom.cases.every((c) => c.dataset.roule === '1') && etiquettesB(app.dom).join() === [t, t + 1, t + 2].map(fmt).join() && acc().length === 0;
  let ko = false, accordsTot = false;
  await h.avancer(30000, () => { if (!reposB(app, 'spin', id)) ko = true; if (acc().length && !app.rouleauxJeu.pose(id)) accordsTot = true; });
  const hs = [H(t), H(t + 1), H(t + 2)];
  const faces = app.dom.cases.every((c, r) => c.innerHTML === svgSpinVrai(hs[r], id, r) && c.innerHTML === app.svgFaceSlot(hs, id, r));
  const j = app.rouleauxJeu.etat().journal.filter((x) => x.cle.startsWith('S:' + id + ':'));
  const uneAUne = j.length === 3 && j.map((x) => x.r).join() === '0,1,2' && j[0].a < j[1].a && j[1].a < j[2].a;
  const fs = Slots.facesDuSpin(hs, id), pts = Slots.points(fs);
  const attendu = Slots.accordsParTrait(fs).map((k, i) => ['colour', 'orbit', 'facet', 'material', 'ornament'][i] + ' ' + (k === 'three' ? 'three · 3' : k === 'pair' ? 'pair · 1' : '—'));
  const accords = acc().join('|') === attendu.join('|');
  const ligne = app.dom.el('slotsListe').enfants.map((x) => x.textContent).join(' ');
  const prix = Slots.usdcPrecis(BigInt(P.prizes[pts]));
  /* la ligne du spin (slots-plan.js phraseAvant, le calcul du contrat) dit les MEMES points que les faces posees, et le prix de la table */
  const juge = new RegExp('^Spin #7: ' + pts + ' points?[ ,]').test(ligne) && (BigInt(P.prizes[pts]) > 0n ? ligne.includes(prix) : /no prize/.test(ligne));
  const settle = app.dom.el('slotsRegler').hidden === false;
  return { ok: attente && !ko && !accordsTot && faces && uneAUne && accords && juge && settle, attente, ko, accordsTot, faces, uneAUne, accords, juge, settle, ligne, pts, j };
};
/* lectures des rouleaux par minute, nourris comme la page : relireJeu (intervalleJeuMs : 20 s a 2 s/bloc, ~6,4 s a 200 ms) et l apercu du
 *   serveur (8 s) ; aucun wallet, aucun spin (le bloc des slots n est pas monte : chaque lecture comptee est celle des rouleaux) */
async function rpcParMinute(R, texte, msBloc, intervalle) {
  const h = faireHorloge(), ch = faireChaineB(h, { msBloc }), app = await monterB(texte, ch, h, { compte: null, avecSlots: false, R });
  h.setInterval(() => { void app.rouleauxLire(); }, intervalle); h.setInterval(() => app.rouleauxTete(ch.tete() - 1), 8000);
  await h.avancer(10 * 60000);
  return { tete: ch.compte.tete / 10, bloc: ch.compte.bloc / 10, total: (ch.compte.tete + ch.compte.bloc) / 10, poses: app.rouleauxJeu.etat().poses };
}
const MESURES = {};
S.APP_RPC = async (R, texte = APP) => {
  const a = await rpcParMinute(R, texte, 2000, 20000), b = await rpcParMinute(R, texte, 200, 6400);
  /* la mesure publiee est celle du VRAI code (le premier passage) — pas celle d un mutant rejoue ensuite */
  if (!MESURES.a2s) { MESURES.a2s = a; MESURES.a200 = b; }
  /* borne : une lecture LIVE toutes les 5 s au plus, 2 eth_getBlockByNumber chacune (le parentHash couvre un bloc), + les tetes de relireJeu */
  const borne = (iv) => 2 * Math.ceil(60000 / R.LECTURE_MIN_MS) + Math.ceil(60000 / iv) + 1;
  return { ok: a.total <= borne(20000) && b.total <= borne(6400) && a.poses > 30 && b.poses > 30, a, b, borneA: borne(20000), borneB: borne(6400) };
};
S.APP_CACHE = async (R, texte = APP) => {
  const h = faireHorloge(), ch = faireChaineB(h, {}), app = await monterB(texte, ch, h, { compte: null, avecSlots: false, R });
  app.dom.el('tirCarte').setAttribute('data-hors', '1');
  h.setInterval(() => { void app.rouleauxLire(); }, 20000); h.setInterval(() => app.rouleauxTete(ch.tete() - 1), 8000);
  await h.avancer(120000);
  const rien = ch.compte.bloc === 0 && ch.compte.tete === 0;
  app.dom.el('tirCarte').attrs = {};
  await h.avancer(30000);
  return { ok: rien && ch.compte.bloc > 0 && reposB(app), rien, compte: ch.compte };
};
S.APP_REDUIT = async (R, texte = APP) => {
  const h = faireHorloge(), ch = faireChaineB(h, {}), app = await monterB(texte, ch, h, { compte: null, avecSlots: false, reduit: true, R });
  let tourne = false;
  h.setInterval(() => { void app.rouleauxLire(); }, 20000); h.setInterval(() => app.rouleauxTete(ch.tete() - 1), 8000);
  app.rouleauxTete(ch.tete());
  await h.avancer(90000, () => { if (app.dom.cases.some((c) => c.dataset.roule === '1')) tourne = true; });
  return { ok: !tourne && app.rouleauxJeu.etat().poses >= 9 && reposB(app), tourne, poses: app.rouleauxJeu.etat().poses };
};
/* ---------------------------------------------------------------- SOURCE */
S.SOURCE = async (R, texte = APP, srv = SRV) => {
  const fn = (a, b) => entre(texte, a, b);
  const servi = ((srv.match(/const SERVIS\s*=\s*\[([\s\S]*?)\];/) || [])[1] || '').includes("'rouleaux.js'");
  const importe = /^import \{ creerRouleaux \} from '\.\/rouleaux\.js';$/m.test(texte);
  const relire = /void verifierRollsEnAttente\(\); void rouleauxLire\(\); void peindreTirageJourPass\(\);/.test(fn('function relireJeu() {', 'setTimeout(relireJeu, intervalleJeuMs()); /*'));
  const apercu = /try \{ rouleauxTete\(Number\(t\.apercu\.bloc\)\); \} catch/.test(fn('async function peindreDernierBlock(', 'let rollsCfg = null;'));
  const tic = /try \{ rouleauxTete\(tete\); \} catch/.test(fn('async function slotsTic() {', 'async function peindreSlotsUneFois('));
  const b = blocRouleaux(texte).replace(/\/\*[\s\S]*?\*\//g, '');
  /* aucun minuteur de lecture : setTimeout n y sert qu a l horloge des rouleaux et a la reprise apres un clic de tuile (0 ms, aucune lecture) */
  const sansMinuteur = !/setInterval\(|setTimeout\(relire|requestAnimationFrame/.test(b) && (b.match(/setTimeout\(/g) || []).length === 2 && /setTimeout\(\(\) => rouleauxJeu\.reprendre\(\), 0\)/.test(b);
  const carte = fn('<div class="carte" id="tirCarte">', '<div class="carte" id="brainJeuCarte">');
  const pos = (s) => carte.indexOf(s);
  /* 2026-10-24 (Phil, capture de game35 : « un seul jeu, au CENTRE ») : l ordre devient rouleaux -> Spin -> panneau de reponse -> le pli du
   *   Roll classique (sa face contre le bloc, ses boutons) -> ticket / pot. Ce banc affirmait rouleaux -> roll -> Spin. */
  const ordre = pos('id="slotsFaces"') > 0 && pos('id="slotsFaces"') < pos('id="rouleauxLegende"') && pos('id="rouleauxLegende"') < pos('id="slotsZone"') && pos('id="slotsZone"') < pos('id="slotsSpin"')
    && pos('id="slotsSpin"') < pos('id="slotsReponse"') && pos('id="slotsReponse"') < pos('id="rollPli"') && pos('id="rollPli"') < pos('id="jourFace"') && pos('id="jourFace"') < pos('id="jourRoll"')
    && pos('id="jourRoll"') < pos('id="jourTicket') && pos('id="ticketFace"') < pos('id="potJour"')
    && !/id="slotsCarte"/.test(texte) && />Reading the latest Base blocks…</.test(carte);
  return { ok: servi && importe && relire && apercu && tic && sansMinuteur && ordre, servi, importe, relire, apercu, tic, sansMinuteur, ordre };
};

/* ---------------------------------------------------------------- execution */
const R0 = await charger(ROU);
const NOMS = Object.keys(S);
for (const k of NOMS) { const r = await S[k](R0); vu(r.ok === true, 'scenario ' + k + (r.ok ? '' : ' ' + JSON.stringify(r).slice(0, 900))); }
/* temoins : les blocs extraits sont la (un morceau vide tuerait un mutant par erreur de syntaxe) */
vu(blocRouleaux(APP).length > 2000 && blocSlots(APP).length > 5000, 'blocs extraits de app.html');

/* ---------------------------------------------------------------- les mutants (copies en memoire) */
const HASARD = "'0x' + Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')";
const MUT_R = [
  ['LIVE', 'pose sur une face au hasard', 'const svg = svgDe(c), el = cases[r], x = st.rs[r];', 'const svg = svgDe({ ...c, hash: ' + HASARD + ' }), el = cases[r], x = st.rs[r];'],
  ['LIVE', 'decalage de bloc (N-3, N-2, N-1)', 'export const blocsLive = (n) => [n - 2, n - 1, n];', 'export const blocsLive = (n) => [n - 3, n - 2, n - 1];'],
  ['LIVE', 'parentHash range sous le mauvais bloc', 'if (HASH.test(hp)) stocker(b - 1, hp);', 'if (HASH.test(hp)) stocker(b - 2, hp);'],
  ['LIVE', 'une case deja posee ne suit plus la tete (hash du nouveau bloc saute)', '        if (x.cle === c.cle) return;\n        if (!c.hash)', '        if (x.cle) return;\n        if (!c.hash)'],
  ['LIVE', 'l etiquette ne change qu a la pose (le defaut mesure au navigateur)', '        if (rouler(r) || x.roule) etiqueter(r, c.bloc);', '        if (!x.roule) rouler(r);'],
  ['LIVE', 'les cases suivent la tete meme si ses blocs ne sont pas tous lus', '    const n = st.base;\n', '    const n = st.tete;\n'],
  /* 2026-10-24 (revue adverse) : le repli sur la tete brute quand aucune fenetre n est lue (la 3e case vide sous l etiquette N) */
  ['RETARD', 'repli sur la tete brute sans fenetre lue', '    const n = st.base;\n', '    const n = st.base !== null ? st.base : st.tete;\n'],
  ['RETARD', 'pas de fenetre du plus haut bloc lu (noeud en retard)', "      if (st.mode === 'LIVE' && !choisirBase()) { const k = plusHautLu(); if (k !== null) { await assurer(blocsLive(k)); choisirBase(); } }", "      if (st.mode === 'LIVE') choisirBase();"],
  ['RETARD', 'le retard n est suivi que d un bloc', 'export const RETARD_MAX = 4;', 'export const RETARD_MAX = 2;'],
  ['SPIN', 'spin decale d un bloc', 'export const blocsSpin = (t) => [t, t + 1, t + 2];', 'export const blocsSpin = (t) => [t + 1, t + 2, t + 3];'],
  ['SPIN', 'les trois se posent ensemble (pas une a une)', 'TOUR_MS + r * DECALAGE_MS', 'TOUR_MS'],
  ['CADENCE', 'pas de cadence de lecture', 'export const LECTURE_MIN_MS = 5000;', 'export const LECTURE_MIN_MS = 50;'],
  ['CADENCE', 'pas de cadence de pose', 'Math.max(reduit() || cache() ? 0 : TOUR_MS + r * DECALAGE_MS, x.poseA + POSE_MIN_MS - t0)', '0', (t) => t.replace('export const LECTURE_MIN_MS = 5000;', 'export const LECTURE_MIN_MS = 300;')],
  ['REDUIT', 'mouvement reduit ignore', 'const reduit = o.reduit || (() => false), cache', 'const reduit = () => false, cache'],
  ['REDUIT', 'une case qui attend montre l ancienne face', "    if (!rouler(r)) { el.innerHTML = ''; el.dataset.gagne = '0';", "    if (!rouler(r)) { el.dataset.gagne = '0';", (t) => t.replace("Object.assign(x, { cle: null, bloc: c.bloc, hash: null, svg: '' });", 'Object.assign(x, { cle: null, bloc: c.bloc, hash: null });')],
  ['CACHE', 'page cachee : on lit quand meme', '    if (cache()) return;\n    st.enTour = true;', '    st.enTour = true;'],
  ['ILLISIBLE', 'un echec est relu a chaque tour (pas de repos)', 'if (e !== undefined && maintenant() - e < ECHEC_MS) continue;', 'if (false) continue;'],
  ['ILLISIBLE', 'une case illisible se pose quand meme (sur un hash absent)', '        if (!c.hash) { if (c.spin) attendre(r, c); return; }', '        if (!c.hash) { if (c.spin) { poser(r, { ...c, hash: ' + HASARD + ' }); } return; }'],
  ['BOUCLE', 'la boucle montre une face jamais posee', "    const src = st.recentes.length ? st.recentes : x.svg ? [x.svg] : [];", "    const src = [o.svgLive('0x' + 'ab'.repeat(32))];"],
  ['RESULTAT', 'le resultat ne rend jamais la main au LIVE', "if (st.mode === 'RESULTAT' && st.res && st.res.id === id) { st.mode = 'LIVE'; st.res = null; planifierTour(true); }", ''],
];
const MUT_A = [
  ['APP_LIVE', 'les rouleaux live sans le hash de leur bloc', 'svgLive: (h) => { const f = faceRevelee(h); return', 'svgLive: (h) => { const f = faceRevelee(rouleauxHashes.get(Math.max(...rouleauxHashes.keys()))); return'],
  ['APP_SPIN', 'le spin pose la face live au lieu de la face du spin', 'svgSpin: (h, id, r) => { const hs = [null, null, null]; hs[r] = h; return svgFaceSlot(hs, id, r); },', "svgSpin: (h) => { const f = faceRevelee(h); return f ? logoSvg(paramsLogoDepuisApparence(f, '★')) : ''; },"],
  ['APP_SPIN', 'un spin a venir n est pas suivi', "[...spins].reverse().find((s) => s.faces || etatDe.get(String(s.id)) === 'TROP_TOT');", '[...spins].reverse().find((s) => s.faces);'],
  /* 2026-10-24 (revue adverse) : le spin montre n est pas celui du bouton Settle */
  ['APP_SUIT', 'les rouleaux suivent le spin le plus recent, pas celui de Settle', 'const montre = duBouton || [...spins]', 'const montre = [...spins]'],
  ['APP_LIVE', 'les hashes de la tete ecrits dans le magasin des slots', 'set: (n, x) => { rouleauxPropres.set(n, x); },', 'set: (n, x) => { rouleauxPropres.set(n, x); rouleauxPartage((m) => m.set(n, x)); },'],
  ['APP_SPIN', 'les points avant la pose des trois faces', 'peindreAccordsSlots(faces && (!suivi || suivi.pose) ? faces : null);', 'peindreAccordsSlots(faces);'],
  ['APP_RPC', 'une boucle de lecture de plus', "document.addEventListener('visibilitychange', () => { if (!document.hidden) rouleauxJeu.reprendre(); });", "document.addEventListener('visibilitychange', () => { if (!document.hidden) rouleauxJeu.reprendre(); });\nsetInterval(() => { void rouleauxLire(); }, 2000);"],
  ['APP_CACHE', 'autre jeu choisi : on lit quand meme', "  return !v || !v.classList.contains('on') || !c || c.hidden || c.getAttribute('data-hors') === '1';", "  return !v || !v.classList.contains('on');"],
  ['APP_REDUIT', 'prefers-reduced-motion non branche', 'reduit: () => rouleauxReduit(), cache', 'reduit: () => false, cache'],
  ['SOURCE', 'relireJeu ne nourrit plus les rouleaux', 'void verifierRollsEnAttente(); void rouleauxLire(); void peindreTirageJourPass(); }', 'void verifierRollsEnAttente(); void peindreTirageJourPass(); }'],
  ['SOURCE', 'l apercu du serveur ne nourrit plus les rouleaux', '  try { rouleauxTete(Number(t.apercu.bloc)); } catch (_) { /* rouleaux pas encore crees */ }\n', ''],
  ['SOURCE', 'le minuteur des slots ne nourrit plus les rouleaux', '  try { rouleauxTete(tete); } catch (_) { /* hors de la page (banc) */ }\n', ''],
  /* 2026-10-24 (un seul jeu au centre) : le meme mutant sur la nouvelle carte — le pli du Roll classique remonte AVANT les rouleaux */
  ['SOURCE', 'la carte revient a deux faces « roll vs bloc » en tete', '      <div class="jeuCentre" id="jeuCentre">', (t) => { const i = t.indexOf('      <div class="jeuCentre" id="jeuCentre">'), j = t.indexOf('      <details class="rollPli" id="rollPli">'), k = t.indexOf('      <div class="jourTicket">'); return t.slice(0, i) + t.slice(j, k) + t.slice(i, j) + t.slice(k); }],
];
let tues = 0;
for (const [s, nom, de, vers, plus] of MUT_R) {
  vu(ROU.split(de).length === 2, 'mutant rouleaux « ' + nom + ' » : ancre unique');
  let copie = ROU.replace(de, () => vers); if (plus) copie = plus(copie);
  vu(copie !== ROU, 'mutant rouleaux « ' + nom + ' » : la copie differe');
  let r; try { r = await S[s](await charger(copie)); } catch (e) { r = { ok: false, jete: String(e && e.message), syntaxe: e instanceof SyntaxError }; }
  vu(r.syntaxe !== true, 'mutant rouleaux « ' + nom + ' » : code valide');
  vu(r.ok === false, 'MUTANT rouleaux « ' + nom + ' » : ' + s + ' ROUGIT');
  tues += 1;
}
for (const [s, nom, de, vers] of MUT_A) {
  vu(APP.split(de).length === 2, 'mutant app « ' + nom + ' » : ancre unique');
  const copie = typeof vers === 'function' ? vers(APP) : APP.replace(de, () => vers);
  vu(copie !== APP, 'mutant app « ' + nom + ' » : la copie differe');
  let r; try { r = await S[s](R0, copie); } catch (e) { r = { ok: false, jete: String(e && e.message), syntaxe: e instanceof SyntaxError }; }
  vu(r.syntaxe !== true, 'mutant app « ' + nom + ' » : code valide');
  vu(r.ok === false, 'MUTANT app « ' + nom + ' » : ' + s + ' ROUGIT');
  tues += 1;
}
/* un mutant du serveur : rouleaux.js plus servi -> SOURCE rougit */
{
  const de = "  'rouleaux.js',\n";
  vu(SRV.split(de).length === 2, 'mutant serveur : ancre unique');
  const r = await S.SOURCE(R0, APP, SRV.replace(de, ''));
  vu(r.ok === false, 'MUTANT serveur « rouleaux.js plus servi » : SOURCE ROUGIT');
  tues += 1;
}
const m = MESURES;
console.log('ok draws-rouleaux - ' + n + ' assertions, ' + NOMS.length + ' scenarios, ' + tues + '/' + (MUT_R.length + MUT_A.length + 1) + ' mutants tues ; lectures des rouleaux par minute (eth_blockNumber + eth_getBlockByNumber) : '
  + m.a2s.total + ' a 2 s/bloc (' + m.a2s.tete + ' + ' + m.a2s.bloc + '), ' + m.a200.total + ' a 200 ms/bloc (' + m.a200.tete + ' + ' + m.a200.bloc + ') ; NE PROUVE PAS le rendu au navigateur, la hauteur a 375 px, Base reel');
