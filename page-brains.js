/* page-brains.js — ONE brain per address on the page (game57 #5/#6, Grok Super QA game56: UNIT showed "no beat yet" in Live while
 *   the Map showed it at beat 92; beat counters on different scales from one view to the next).
 * ⛔⛔ BEFORE: the map (h.cerveau), the profile (profilCerveau.etat) and Brain / the Control panel (brainEtat) EACH rebuilt their own copy
 *     of the same block from this browser's memory, at different times, and each counted its own beats: three numbers for one
 *     block, and Live only saw the map's copy. NOW: a single instance per address, created once, and ONE step per page beat
 *     (`cycle`) however many views are looking at it. Its `vu.tick` is THE beat number.
 * ⛔ PURE: no network, no clock, no DOM. `create(adr)` (the browser's memory) is supplied by the caller.
 * The entry fields (etat, vu, faits, histo, nourritureLue, source, cycle) keep the names of the brain structures they mirror. */
const ADR = /^0x[0-9a-f]{40}$/;
export const SHARED_HISTORY = 64;
/* game57 #4d: `onBeat(adr, tick)` (optional) hears each REAL step of an address (not the repeat of a cycle), so a view that
 * follows live moves with the beat itself; a failing listener never stops a beat. */
export function createPageBrains({ create, onBeat = null }) {
  const m = new Map();
  const key = (a) => String(a || '').toLowerCase();
  const entry = (adr) => {
    const a = key(adr);
    if (!ADR.test(a)) return null;
    let e = m.get(a);
    if (!e) {
      let etat = null;
      try { etat = create(a); } catch (_) { etat = null; }
      if (!etat) return null;
      e = { adr: a, etat, vu: null, faits: null, nourritureLue: null, source: null, cycle: null, r: null, histo: [], origin: null };
      m.set(a, e);
    }
    return e;
  };
  return {
    /** This address's instance (created on the first call, never a second time). */
    state(adr) { const e = entry(adr); return e ? e.etat : null; },
    /** One step of THIS instance; already done in this cycle = the same result, without a second step. */
    step(adr, faits, stepFn, cycle, { source = null, nourritureLue = null } = {}) {
      const e = entry(adr);
      if (!e) return null;
      if (cycle !== null && cycle !== undefined && e.cycle === cycle && e.r) return { etat: e.r.etat, vu: e.r.vu, already: true };
      const r = stepFn(e.etat, faits);
      e.etat = r.etat; e.vu = r.vu; e.faits = faits; e.nourritureLue = nourritureLue; e.source = source; e.cycle = cycle;
      e.r = { etat: r.etat, vu: r.vu };
      e.histo.push(r.vu);
      if (e.histo.length > SHARED_HISTORY) e.histo.splice(0, e.histo.length - SHARED_HISTORY);
      if (typeof onBeat === 'function') { try { onBeat(e.adr, r.vu && Number.isSafeInteger(r.vu.tick) ? r.vu.tick : null); } catch (_) { /* a view never stops a beat */ } }
      return { etat: r.etat, vu: r.vu, already: false };
    },
    /** A re-read memory (chain, fragments) REPLACES the instance: every view jumps together, and the origin is stated. */
    replace(adr, etat, origin = null) {
      const e = entry(adr);
      if (!e || !etat) return false;
      e.etat = etat; e.vu = null; e.r = null; e.cycle = null; e.histo = []; e.origin = origin;
      return true;
    },
    /** What the instance returned at its last step, or null. ⛔ Never creates a brain. */
    read(adr) {
      const e = m.get(key(adr));
      return e ? { adr: e.adr, etat: e.etat, vu: e.vu, faits: e.faits, nourritureLue: e.nourritureLue, source: e.source, histo: e.histo, cycle: e.cycle, origin: e.origin } : null;
    },
    /** THE beat number of this address: the tick of its last step, or null. */
    beat(adr) { const e = m.get(key(adr)); return e && e.vu && Number.isSafeInteger(e.vu.tick) ? e.vu.tick : null; },
    size() { return m.size; },
  };
}

/* ⛔⛔ game57 #6: ONE beat number. It is the `tick` of THE page instance for this address (vu.tick: the beats THIS brain has lived,
 *     restored from the browser's memory or from the chain) — never a copy's, nor a block height, nor a count of on-chain events,
 *     nor the rank of a replay step. Without an instance on the page: the fallback (snapshot). */
export function displayedBeat(registry, adr, fallback = null) {
  const n = registry && typeof registry.beat === 'function' ? registry.beat(adr) : null;
  if (Number.isSafeInteger(n)) return n;
  return fallback && Number.isSafeInteger(fallback.tick) ? fallback.tick : null;
}
/** ONE format for this number, everywhere (panel, Brain, Brain window, Live). */
export const beatText = (n) => (Number.isSafeInteger(n) ? n.toLocaleString('en-US') : '—');

/* game57 #4b (a): THE FOOD THIS PAGE HAS READ FOR THIS BLOCK. The map reads it for its habitants (h.nourriture); an OFF-MAP block
 * (UNIT) is read by its profile (profilNourriture) or by Brain (brainNourriture), and that read used to be thrown away: the brain
 * got 0 "by default" and the view said "not read yet". Order: the habitant's successful read, else a successful off-map read of the
 * SAME address, else the habitant's (unread) state or null. Never another address, never a failed read shown as read. */
export function heldFood(address, habitant, offMapReads = []) {
  const a = String(address || '').toLowerCase();
  const isRead = (n) => !!(n && typeof n === 'object' && n.etat === 'LUE');
  if (habitant && isRead(habitant.nourriture)) return habitant.nourriture;
  for (const r of Array.isArray(offMapReads) ? offMapReads : []) if (r && String(r.adr || '').toLowerCase() === a && isRead(r.n)) return r.n;
  return habitant && habitant.nourriture ? habitant.nourriture : null;
}
