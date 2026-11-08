/* fly-day.js — the fly's daily trade counter, as pure functions on the STORED state (2026-11-09).
 *   QA 08/11 (open item): the counter was raised only AFTER the swap was mined, so a reload between the first transaction sent and that
 *   line left a real trade uncounted and the daily cap could be passed by one per reload. Now a slot is RESERVED (and saved) before the
 *   first transaction goes out; a trade that sent nothing reserves nothing. A slot reserved for calls that then failed stays counted:
 *   the cap is a safety limit, it errs toward fewer trades, never more.
 *   Pure: no DOM, no storage; the page saves what these return. */

/** the UTC day key used by the page (YYYY-MM-DD) */
export const dayOf = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

/** trades already counted today in state s (a past day counts 0) */
export function countedToday(s, today) {
  return s && s.day === today && Number.isInteger(s.today) && s.today > 0 ? s.today : 0;
}

/** may one more trade START today under a cap of max? */
export function mayTrade(s, today, max) {
  return countedToday(s, today) < max;
}

/** the state with one more trade reserved today (a new day restarts from 0); never mutates s */
export function reserveTrade(s, today) {
  return { ...s, day: today, today: countedToday(s, today) + 1 };
}
