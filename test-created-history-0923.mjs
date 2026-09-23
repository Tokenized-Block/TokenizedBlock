/* ⛔ CONTROLES DE PASTILLE RETIRES (2026-09-23, demande de Phil) : ils exigeaient la presence
 *    des filtres « TB · paid » et « another launchpad », supprimes de l interface — « TB · paid »
 *    affichait 0 en permanence, et la distinction regardait NOUS, pas le lecteur.
 *    ⛔ LES CONTROLES SUR LA LOGIQUE DE PARTITION SONT GARDES plus bas : la partition existe
 *      toujours dans le code et doit rester gardee. On retire l exigence d un BOUTON, jamais
 *      celle d un COMPORTEMENT. */
/* ⛔ EPINGLE DE BUILD RETIREE (2026-09-23) : la table des chaines obligatoires contenait une
 *    entree `['tip', 'data-build="<tip>"']` — elle exigeait un numero de build PRECIS, donc elle
 *    rougissait des qu un autre agent deployait. Elle ne testait pas une fonctionnalite : elle
 *    testait que personne n avait deploye depuis. Les controles « un ANCIEN tip n est pas reste »
 *    sont LAISSES INTACTS plus bas — eux gardent vraiment quelque chose. */
import { readFileSync } from 'fs';
const h = readFileSync('./app.html', 'utf8');

const need = [
  ['tip comment', 'tip 20260923-created-history'],
  ['Created all births', "if (liveFiltre === 'CREATION') return e.type === 'CREATION';"],
  ['TB paid partition', "liveFiltre === 'CREATION_TB') return e.type === 'CREATION' && e.paidCreate === true"],
  ['foreign partition', "liveFiltre === 'CREATION_FOREIGN') return e.type === 'CREATION' && e.paidCreate !== true"],
  ['LIVE_HISTOIRE', 'LIVE_HISTOIRE_BLOCS = 12000'],
  ['auto ancien budget', 'liveAuto * LIVE_FENETRE < LIVE_HISTOIRE_BLOCS'],
  ['LIVE_FENETRE 999', 'LIVE_FENETRE = 999'],
  /* ⛔ TITRE MIS A JOUR (2026-09-23) : l ancien annonçait « labels stay honest — TB·paid vs another
   *    launchpad », c est-a-dire un decoupage retire de l interface a la demande de Phil. Un titre
   *    qui promet un tri qui n existe plus est un faux, meme discret.
   *    ⛔ CE QUI EST TOUJOURS EXIGE, et c est ajoute juste en dessous : que chaque LIGNE dise ou le
   *      block est ne. La promesse d honnetete ne disparait pas, elle change de place — de l onglet
   *      vers la ligne, la ou le lecteur la voit vraiment. */
  ['Created title', 'Every block born on Base in this window'],
  ['origine dite par ligne', 'was born on another launchpad'],
  ['IB CTA 0.001', 'data-tf-act="instant-birth-tb">Instant Birth on TB · 0.001 ETH'],
  ['paid-first sort', "liveFiltre === 'CREATION' || liveFiltre === 'CREATION_TB' || liveFiltre === 'CREATION_FOREIGN'"],
];
for (const [label, s] of need) {
  if (!h.includes(s)) throw new Error('missing ' + label + ': ' + s.slice(0, 120));
}

// Created must NOT be paid-only twin of TB·paid
if (h.includes("liveFiltre === 'CREATION') return e.type === 'CREATION' && e.paidCreate === true")) {
  throw new Error('Created still paid-only (reclaim regression)');
}

// NEVER LIVE_FENETRE > 999
const fen = h.match(/LIVE_FENETRE\s*=\s*(\d+)/);
if (!fen || Number(fen[1]) > 999) throw new Error('LIVE_FENETRE > 999 or missing: ' + (fen && fen[0]));

if (h.includes('Fees for Dev')) throw new Error('Fees for Dev');
const horsScript = h.replace(/<script[\s\S]*?<\/script>/gi, '');
const visible = horsScript.replace(/<!--[\s\S]*?-->/g, '');
if (/≈\s*\$1|~\s*\$1/.test(visible)) throw new Error('≈$1 in visible HTML');
if (/Fees for Dev/i.test(horsScript)) throw new Error('Fees for Dev visible');
const ui = horsScript.match(/<(?:button|a|span|b|p)[^>]*>[^<]*a6cf[^<]*</gi) || [];
if (ui.length) throw new Error('a6cf in UI: ' + ui.join('|'));
if (h.includes('data-build="20260923-wallet-intent-market"')) throw new Error('old wallet-intent tip left');
if (h.includes('data-build="20260923-reclaim-volume"')) throw new Error('old reclaim tip left');

console.log('ok created-history');
