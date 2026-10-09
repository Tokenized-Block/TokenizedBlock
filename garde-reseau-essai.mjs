/* garde-reseau-essai.mjs — PRECHARGE par `node --import` : aucun `fetch` de CE processus ne sort de la machine, et chaque
 *   origine jointe est DITE une fois sur stderr.
 *
 * POURQUOI (2026-10-04). Le banc du mode essai demarre une copie du serveur. Ce serveur, tel qu il est, lit aussi DexScreener et
 *   OpenLaunch a son demarrage. Deux besoins : (1) qu un banc ne joigne rien d autre que le fork local et le serveur lui-meme ;
 *   (2) MESURER ou partent les lectures du serveur en mode essai, au lieu de le deduire du code.
 * CE QUE CA FAIT : remplace `globalThis.fetch`. Un hote qui n est pas cette machine (`estHoteLocal`, la regle du mode essai) est
 *   REFUSE (la promesse rejette, comme une panne de reseau : les appelants du serveur savent deja le dire « non lu »).
 *   Chaque origine nouvelle ecrit une ligne : `[garde-reseau] JOINT http://127.0.0.1:8549` ou `[garde-reseau] BLOQUE https://…`.
 * ⛔ BORNE : `fetch` seulement. Un module qui ouvrirait une socket par `node:http` passerait a cote ; le serveur n en a pas
 *   (recherche du 2026-10-04 sur les 76 modules atteints depuis serveur-web.js : `node:http` n y sert qu a `createServer`,
 *   aucun `http.request`, `https`, `net`, `tls` ni WebSocket).
 * ⛔ Ce fichier n est ni servi, ni importe par l app : il ne tourne que si on le precharge. */
import { estHoteLocal } from './mode-essai.js';

const vrai = globalThis.fetch;
const dites = new Set();
const dire = (mot, origine) => { const k = mot + ' ' + origine; if (dites.has(k)) return; dites.add(k); try { process.stderr.write('[garde-reseau] ' + k + '\n'); } catch (_) { /* stderr ferme */ } };

globalThis.fetch = function fetchGarde(ressource, options) {
  let u = null;
  try { u = new URL(typeof ressource === 'string' ? ressource : String((ressource && ressource.url) || ressource)); } catch (_) { u = null; }
  if (!u || !estHoteLocal(u.hostname)) {
    const origine = u ? u.origin : 'unreadable-url';
    dire('BLOQUE', origine);
    return Promise.reject(new Error('blocked by the test network guard: ' + origine));
  }
  dire('JOINT', u.origin);
  return vrai.call(globalThis, ressource, options);
};
