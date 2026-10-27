/* pensee-cerveau.js — "LIVE THOUGHT" of a block's brain (owner, 2026-10-27): a short first-person thought that says, on THIS beat,
 *   WHY its engine judges (or does not judge) a mood, what reached it and what did not, what happened inside (fired vs its recent
 *   average, neurons close to threshold, its memory trace), what it does (wings, steering, speed), its role, its daily wake-up and
 *   its map neighbours.
 *
 * ⛔⛔ NEVER AN LLM, NEVER INVENTED. Every clause is a fixed template filled ONLY with fields of the recorded beats (`histo`, the
 *   records cerveau.js#pas returned: tick, phase, spikes, gauche_hz, droite_hz, virage, vitesse, nourriture, nouveaux, delta, memoire,
 *   cablage), the count of real map neighbours, and — only when they belong to THIS beat — the live state (`etat.tick === vu.tick`:
 *   its potentials) and the facts it was last fed (role, wake-up). Each clause carries `from`: the exact keys and values it was built
 *   from. The words come from lexique-cerveau.js, picked by the beat number and wiring fingerprint: same beat -> same text.
 * ⛔⛔ THE MOOD'S REASON IS THE ENGINE'S OWN RULE (cerveau.js#pas, in its order: MORT, NON_LU, no market -> EVEILLE/DORMANT, then
 *   INQUIET, EXCITE, CURIEUX, CALME), re-derived from the recorded fields. If the record does not re-derive the phase it carries,
 *   the thought says it cannot tell why — it never guesses.
 *   cerveau.js is NOT touched.
 *
 * THE READING (a human word for its state, labelled on screen as a reading, not the engine mood). Rules, first match:
 *     blind     — phase NON_LU;  silent — phase MORT;  wary — sells > buys (>= 1 sell);
 *     restless  — fired >= 1.5 x its recent average AND its life rose;  eager — buys > sells (>= 1 buy);
 *     lonely    — no input at all on LONELY_BEATS recorded beats in a row;  stirred — fired >= 1.5 x average;
 *     settling  — fired <= 0.67 x average;  steady — anything else.
 *   Its INTENSITY TIER (low / mid / high) is computed from the same numbers (see `lecture`).
 */
import { beatSentence, humeurCourte } from './vision-cerveau.js';
import { NEURONES, PARAMETRES, INTERNES } from './cerveau.js';
import { METIERS } from './metiers.js';
import { MOUVEMENT, INTERIEUR, TOURNE_TIERS, variete, choisir, palier, motHumeur } from './lexique-cerveau.js';

export const VERSION_PENSEE = 'tblock-brain-thought/2';
export const AVG_WINDOW = 8;
export const AVG_MIN = 3;
export const LONELY_BEATS = 8;
export const HIGH = 1.5;
export const LOW = 0.67;
/** "close to firing" = a potential within a quarter of the threshold, below it */
export const PRES_SEUIL = 0.75;
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const INPUTS = ['achats', 'ventes', 'detenteurs', 'gm', 'messages'];
const NOMS_ENTREE = { achats: 'buy', ventes: 'sell', detenteurs: 'new holder', gm: 'transfer', messages: 'message' };
const compte = (vu, k) => (vu && vu.nouveaux && fini(vu.nouveaux[k]) && vu.nouveaux[k] > 0 ? vu.nouveaux[k] : 0);
const aucuneEntree = (vu) => INPUTS.every((k) => compte(vu, k) === 0) && !(fini(vu && vu.delta) && vu.delta !== 0);
/** a number as the screen writes it: at most 2 decimals, no trailing zeros */
export const nombre = (x) => String(Math.round(x * 100) / 100);
const n3 = (x) => String(Math.round(x * 1000) / 1000);
const pct = (d) => Math.round(Math.abs(d) * 1000) / 10;
const liste = (l) => (l.length <= 1 ? l.join('') : l.slice(0, -1).join(', ') + ' or ' + l[l.length - 1]);
const et = (l) => (l.length <= 1 ? l.join('') : l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1]);
const majuscule = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const READINGS = Object.freeze({
  blind: 'its market could not be read on this beat, so no mood is judged',
  silent: 'its creator holds none of it — nothing reaches it',
  wary: 'more sells than buys reached it on this beat',
  restless: 'it fired well above its recent average while its life rose',
  eager: 'more buys than sells reached it on this beat',
  lonely: 'nothing at all has reached it for at least ' + LONELY_BEATS + ' recorded beats',
  stirred: 'it fired well above its recent average',
  settling: 'it fired well below its recent average',
  steady: 'nothing in this beat stands out from its recent beats',
});

/** The mean of `spikes` over up to AVG_WINDOW recorded beats before place i; null with fewer than AVG_MIN of them. */
export function moyenneRecente(histo, i) {
  const H = Array.isArray(histo) ? histo : [];
  const avant = H.slice(Math.max(0, i - AVG_WINDOW), Math.max(0, i)).filter((v) => v && fini(v.spikes));
  if (avant.length < AVG_MIN) return null;
  return { moyenne: avant.reduce((s, v) => s + v.spikes, 0) / avant.length, n: avant.length };
}

/** How many recorded beats in a row, ending at place i, had no input at all. */
export function silenceDepuis(histo, i) {
  const H = Array.isArray(histo) ? histo : [];
  let n = 0;
  for (let k = i; k >= 0 && H[k] && aucuneEntree(H[k]); k--) n++;
  return n;
}

/** The reading of its state on the beat at place i, with its intensity tier and its word (see the rules above). */
export function lecture(histo, i) {
  const H = Array.isArray(histo) ? histo : [], vu = H[i];
  if (!vu || !Number.isSafeInteger(vu.tick)) return null;
  const v = variete(vu, 1);
  const from = [{ key: 'phase', value: vu.phase }];
  const pick = (cle, tier, extra = []) => ({ key: cle, tier, word: motHumeur(cle, tier, v), why: READINGS[cle], from: from.concat(extra) });
  if (vu.phase === 'NON_LU') return pick('blind', 'mid');
  if (vu.phase === 'MORT') return pick('silent', 'mid');
  const a = compte(vu, 'achats'), s = compte(vu, 'ventes');
  if (s > 0 && s > a) return pick('wary', palier(s - a, 2, 4), [{ key: 'nouveaux.ventes', value: s }, { key: 'nouveaux.achats', value: a }]);
  const m = moyenneRecente(H, i), sp = fini(vu.spikes) ? vu.spikes : null;
  const ratio = m && sp !== null && m.moyenne > 0 ? sp / m.moyenne : null;
  const haut = ratio !== null && ratio >= HIGH, bas = ratio !== null && ratio <= LOW;
  const fx = m ? [{ key: 'spikes', value: sp }, { key: 'average', value: m.moyenne }] : [];
  if (haut && fini(vu.delta) && vu.delta > 0) return pick('restless', palier(ratio, 2, 3), fx.concat([{ key: 'delta', value: vu.delta }]));
  if (a > 0 && a > s) return pick('eager', palier(a - s, 2, 4), [{ key: 'nouveaux.achats', value: a }, { key: 'nouveaux.ventes', value: s }]);
  const calme = silenceDepuis(H, i);
  if (calme >= LONELY_BEATS) return pick('lonely', palier(calme, 16, 32), [{ key: 'quietBeats', value: calme }]);
  if (haut) return pick('stirred', palier(ratio, 2, 3), fx);
  if (bas) return pick('settling', sp === 0 ? 'high' : palier(m.moyenne / sp, 2, 3), fx);
  const ecart = ratio === null ? null : Math.abs(ratio - 1);
  return pick('steady', ecart === null ? 'mid' : ecart < 0.1 ? 'high' : ecart < 0.25 ? 'mid' : 'low', fx);
}

/**
 * WHY its engine judged this mood: cerveau.js#pas's rule, re-derived from the recorded fields, in the engine's order.
 * @returns {{ ok: boolean, text: string, from: Array<{key, value}> }} ok=false when the record does not re-derive its own phase.
 */
export function causeHumeur(vu) {
  const ph = vu && vu.phase, d = vu && fini(vu.delta) ? vu.delta : null, sp = vu && fini(vu.spikes) ? vu.spikes : null;
  const N = vu && vu.nouveaux && typeof vu.nouveaux === 'object' ? vu.nouveaux : null;
  const lim = INTERNES.deltaHumeur, P = { key: 'phase', value: ph };
  const nondit = { ok: false, text: 'My engine judged me ' + humeurCourte(ph) + ', but this beat\'s record does not hold enough to tell why.', from: [P] };
  if (ph === 'MORT') return { ok: true, text: 'My engine judges me dead because my creator holds none of me — nothing reaches me.', from: [P] };
  if (ph === 'NON_LU') return { ok: true, text: 'I judge no mood because my market could not be read on this beat.', from: [P] };
  if (ph === 'DORMANT' || ph === 'EVEILLE') {
    const nour = vu && fini(vu.nourriture) ? vu.nourriture : null;
    if (nour === null || (ph === 'EVEILLE') !== (nour > 0)) return nondit;
    return ph === 'EVEILLE'
      ? { ok: true, text: 'My engine judges me awake because I have no market yet but my community fed me (food ' + n3(nour) + ').', from: [P, { key: 'nourriture', value: nour }] }
      : { ok: true, text: 'My engine judges me asleep because I have no market and nothing fed me.', from: [P, { key: 'nourriture', value: nour }] };
  }
  if (d === null || !N || !INPUTS.every((k) => fini(N[k]))) return nondit;
  const a = N.achats, s = N.ventes;
  const nouv = ['achats', 'detenteurs', 'gm', 'messages'].filter((k) => N[k] > 0);
  const fd = { key: 'delta', value: d }, fl = { key: 'deltaHumeur', value: lim }, ligne = pct(lim) + ' %';
  if (ph === 'INQUIET') {
    if (d <= -lim) return { ok: true, text: 'My engine judges me worried because my market cooled ' + pct(d) + ' %, past its ' + ligne + ' line.', from: [P, fd, fl] };
    if (s > a) return { ok: true, text: 'My engine judges me worried because more sells (' + s + ') than buys (' + a + ') reached me.', from: [P, { key: 'nouveaux.ventes', value: s }, { key: 'nouveaux.achats', value: a }] };
    return nondit;
  }
  if (d <= -lim || s > a) return nondit;
  if (ph === 'EXCITE') {
    if (d >= lim) return { ok: true, text: 'My engine judges me excited because my market warmed ' + pct(d) + ' %, past its ' + ligne + ' line.', from: [P, fd, fl] };
    if (nouv.length) return { ok: true, text: 'My engine judges me excited because something new reached me (' + et(nouv.map((k) => NOMS_ENTREE[k])) + ').', from: [P].concat(nouv.map((k) => ({ key: 'nouveaux.' + k, value: N[k] }))) };
    return nondit;
  }
  if (d >= lim || nouv.length || sp === null) return nondit;
  const fs = { key: 'spikes', value: sp };
  if (ph === 'CURIEUX' && sp > INTERNES.tirsCurieux) return { ok: true, text: 'My engine judges me curious because my market is calm yet ' + sp + ' of my neurons fired, more than ' + INTERNES.tirsCurieux + '.', from: [P, fs, { key: 'tirsCurieux', value: INTERNES.tirsCurieux }] };
  if (ph === 'CALME' && sp <= INTERNES.tirsCurieux) return { ok: true, text: 'My engine judges me calm because nothing new reached me, my market moved less than ' + ligne + ' and only ' + sp + ' of my neurons fired.', from: [P, fs, fl, fd] };
  return nondit;
}

/**
 * THE THOUGHT of the beat at place i of `histo`.
 * `voisins`: the number of real map neighbours (null = not known). `etat`: the live brain state (its potentials are used ONLY when
 *   etat.tick === this beat's tick). `faits`: the facts it was last fed (role, reveil) — used ONLY under the same condition.
 * @returns {{ tick, mood, reading, clauses: Array<{text, from}>, text, version } | null}
 */
export function pensee(histo, i, { voisins = null, etat = null, faits = null } = {}) {
  const H = Array.isArray(histo) ? histo : [], vu = H[i];
  if (!vu || !Number.isSafeInteger(vu.tick)) return null;
  const v = variete(vu), prev = i > 0 && H[i - 1] && Number.isSafeInteger(H[i - 1].tick) ? H[i - 1] : null;
  const live = !!(etat && etat.tick === vu.tick);
  const clauses = [];
  /* 1. WHY its engine judges (or does not judge) a mood — the engine's own rule */
  const cause = causeHumeur(vu);
  clauses.push({ text: cause.text, from: cause.from });
  /* 1b. (owner 2026-10-27: "the text gives nothing useful") WHAT WOULD CHANGE ITS MOOD — read off the engine's own rule order
   *   (cerveau.js: worried on a 5 % drop or more sells than buys, then excited on a 5 % rise or anything new). "can": each input is
   *   weighted by the block's own sensitivity, so a single event is not promised to tip it. */
  const ligneH = pct(INTERNES.deltaHumeur) + ' %', fH = [{ key: 'phase', value: vu.phase }, { key: 'deltaHumeur', value: INTERNES.deltaHumeur }];
  if (vu.phase === 'CALME' || vu.phase === 'CURIEUX') clauses.push({ text: 'What would change me: a new buy, holder or message can excite me; more sells than buys, or my price falling ' + ligneH + ', would worry me.', from: fH });
  else if (vu.phase === 'EXCITE') clauses.push({ text: 'If nothing new comes and my price holds, I settle back down; more sells than buys would worry me.', from: fH });
  else if (vu.phase === 'INQUIET') clauses.push({ text: 'What would lift me: buys at least matching sells, and my price no longer falling ' + ligneH + '.', from: fH });
  if (vu.phase !== 'MORT') {
    /* 2. what reached it — and what did not (only inputs RECORDED at zero are named as absent) */
    const recu = beatSentence(vu).traces.filter((t) => t.key !== 'phase' && t.key !== 'nothing');
    const absents = vu.nouveaux && typeof vu.nouveaux === 'object' ? INPUTS.filter((k) => fini(vu.nouveaux[k]) && vu.nouveaux[k] === 0) : [];
    let text = recu.length ? majuscule(et(recu.map((t) => t.says))) : 'Nothing new reached me';
    const from = recu.length ? recu.map((t) => ({ key: t.key, value: t.value })) : [{ key: 'nothing', value: null }];
    if (recu.length && absents.length) { text += '; no ' + liste(absents.map((k) => NOMS_ENTREE[k])) + ' came'; for (const k of absents) from.push({ key: 'nouveaux.' + k, value: 0 }); }
    clauses.push({ text: text + '.', from });
  }
  /* 3. inside: fired vs its recent average, neurons close to threshold (live state of THIS beat only), its memory trace */
  if (fini(vu.spikes)) {
    const m = moyenneRecente(H, i);
    let text = 'Inside, ' + vu.spikes + ' of my ' + NEURONES + ' neurons ' + choisir(INTERIEUR.tire, v);
    const from = [{ key: 'spikes', value: vu.spikes }];
    if (vu.phase !== 'MORT') {
      if (!m) text += ' (I hold too few earlier beats to compare)';
      else {
        from.push({ key: 'average', value: m.moyenne }, { key: 'averageOver', value: m.n });
        const rel = m.moyenne > 0 && vu.spikes >= HIGH * m.moyenne ? 'well above' : m.moyenne > 0 && vu.spikes <= LOW * m.moyenne ? 'well below'
          : vu.spikes > m.moyenne ? 'a little above' : vu.spikes < m.moyenne ? 'a little below' : 'exactly at';
        text += ' — ' + rel + ' my average of ' + nombre(m.moyenne) + ' over my last ' + m.n + ' beats';
      }
      if (live && Array.isArray(etat.potentiels) && etat.potentiels.length === NEURONES) {
        const pres = etat.potentiels.filter((p) => fini(p) && p >= PRES_SEUIL * PARAMETRES.seuil && p < PARAMETRES.seuil).length;
        text += '; ' + pres + ' other' + (pres === 1 ? ' sits' : 's sit') + ' within a quarter of firing';
        from.push({ key: 'nearThreshold', value: pres });
      }
    }
    if (fini(vu.memoire) && prev && fini(prev.memoire)) {
      const k = vu.memoire > prev.memoire ? 'monte' : vu.memoire < prev.memoire ? 'baisse' : 'stable';
      /* 3 decimals, or the engine's 4 when 3 would print the same number for a real change */
      const f = k !== 'stable' && n3(prev.memoire) === n3(vu.memoire) ? (x) => String(Math.round(x * 10000) / 10000) : n3;
      text += '; ' + choisir(INTERIEUR[k], v) + ' (' + f(prev.memoire) + ' → ' + f(vu.memoire) + ')';
      from.push({ key: 'memoire', value: vu.memoire }, { key: 'memoireAvant', value: prev.memoire });
    }
    clauses.push({ text: text + '.', from });
  }
  if (vu.phase === 'MORT') return fin(vu, H, i, clauses);
  /* 4. what it does: its wings, steering and speed against the beat before */
  if (fini(vu.virage) && fini(vu.vitesse)) {
    const pv = prev && fini(prev.vitesse) ? prev.vitesse : null;
    const tier = palier(Math.abs(vu.virage), TOURNE_TIERS[0], TOURNE_TIERS[1]);
    const tourne = vu.virage < 0 ? choisir(MOUVEMENT.gauche[tier], v) : vu.virage > 0 ? choisir(MOUVEMENT.droite[tier], v) : choisir(MOUVEMENT.droit, v);
    const vit = pv === null ? 'move at speed ' + nombre(vu.vitesse)
      : vu.vitesse > pv ? choisir(MOUVEMENT.accelere, v) + ' from ' + nombre(pv) + ' to ' + nombre(vu.vitesse)
        : vu.vitesse < pv ? choisir(MOUVEMENT.ralentit, v) + ' from ' + nombre(pv) + ' to ' + nombre(vu.vitesse) : choisir(MOUVEMENT.garde, v) + ' at ' + nombre(vu.vitesse);
    const from = [{ key: 'virage', value: vu.virage }, { key: 'vitesse', value: vu.vitesse }].concat(pv === null ? [] : [{ key: 'vitesseAvant', value: pv }]);
    let ailes = '';
    if (fini(vu.gauche_hz) && fini(vu.droite_hz)) {
      const g = vu.gauche_hz, d = vu.droite_hz;
      ailes = g === d ? 'Both my wings beat at ' + nombre(g) + ' Hz, so '
        : 'My ' + (g > d ? 'left' : 'right') + ' wing drives (' + nombre(Math.max(g, d)) + ' Hz against ' + nombre(Math.min(g, d)) + '), so ';
      from.push({ key: 'gauche_hz', value: g }, { key: 'droite_hz', value: d });
    }
    clauses.push({ text: ailes + tourne + ' and ' + vit + '.', from });
  }
  /* 5. its role, its daily wake-up (facts of THIS beat only), its neighbours (on the map, never in its neurons) */
  const bouts = [], from5 = [];
  const role = live && faits && typeof faits.role === 'string' ? METIERS.find((x) => x.cle === faits.role) : null;
  if (role) { bouts.push('my role is ' + role.titre); from5.push({ key: 'role', value: role.cle }); }
  if (live && faits && faits.reveil === true) { bouts.push('this beat carried my daily wake-up pulse — not a market event'); from5.push({ key: 'reveil', value: true }); }
  if (Number.isSafeInteger(voisins) && voisins > 0) { bouts.push(voisins + ' map neighbour' + (voisins === 1 ? ' is' : 's are') + ' around me, but none reach my neurons'); from5.push({ key: 'voisins', value: voisins }); }
  if (bouts.length) clauses.push({ text: majuscule(bouts.join('; ')) + '.', from: from5 });
  return fin(vu, H, i, clauses);
}
/* 2026-10-27 (owner: "text too big, keep the essential"): `text` = the ESSENTIAL — the first two clauses (why the mood + what reached
 *   it; for a dead block, why + inside). `complet` = every clause, unchanged, shown on demand. Every clause keeps its own `from`. */
export const ESSENTIEL = 2;
function fin(vu, H, i, clauses) {
  return { version: VERSION_PENSEE, tick: vu.tick, mood: humeurCourte(vu.phase), reading: lecture(H, i), clauses,
    text: clauses.slice(0, ESSENTIEL).map((c) => c.text).join(' '), complet: clauses.map((c) => c.text).join(' ') };
}
