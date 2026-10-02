// marque-tb.js — la marque TokenizedBlock, et ce que TB peut LEGITIMEMENT en faire chez lui.
// ================================================================================================
// ⛔ MESURE DU 2026-10-02 (7 jours, toutes factories lues) : les tokens qui portent le nom TB ne sont PAS nes
//    sur TB. TB ne peut ni les bruler, ni changer leur pool, ni toucher a leurs frais (hook fige a l init v4).
//    Ce que TB PEUT faire, et ce module le fait : le DIRE a l ecran (« not official ») et refuser de lancer
//    ce nom depuis SES interfaces partenaires (console OpenLaunch). Le reste (signalement au launchpad, depot
//    de marque) est humain — voir canal/DIG-LAUNCHBLITZ-capture-2026-10-02.md.
// ⛔ AUCUNE adresse codee en dur comme « officielle » ici : est officiel ce que la FACE GRAVEE par notre Create
//    dit (origine 'TOKENIZEDBLOCK'), ou une adresse de la liste canonique ci-dessous. Rien d autre.

import { TBLOCK, TBGAS } from './tokenomics.js';

/** Les tokens officiels, par adresse (minuscules). TBGAS et TBLOCK : la marque elle-meme. */
export const OFFICIELS_TB = Object.freeze(new Set([TBLOCK, TBGAS].map((a) => a.toLowerCase())));

/** Normalise un nom : minuscules, lettres et chiffres seulement (« Tokenized-Block » -> « tokenizedblock »). */
function plat(x) { return String(x || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

/**
 * Le nom ou le symbole se presente-t-il comme TokenizedBlock ?
 * nom : contient « tokenizedblock » (espaces/tirets ignores) ou commence par « TB- » / « TB_ » / « TB » + espace ;
 * symbole : TB, TBGAS, TBLOCK*, TB-* / TB_*.
 * ⛔ « TBC », « TBTC », « TBILL » ne sont PAS la marque (tests).
 */
export function estMarqueTbEtendue(nom, symbole) {
  const n = String(nom || '').trim();
  const s = String(symbole || '').trim().toUpperCase();
  if (plat(n).includes('tokenizedblock')) return true;
  if (/^tb[-_ ]/i.test(n)) return true;
  if (s === 'TB' || s === 'TBGAS' || s.startsWith('TBLOCK') || /^TB[-_]/.test(s)) return true;
  return false;
}

/**
 * Le verdict a l ecran pour un token : 'OFFICIEL' | 'NON_OFFICIEL' | 'SANS_OBJET'.
 * ⛔ 'NON_OFFICIEL' exige une origine LUE et differente de TB : une origine non lue ne condamne personne.
 */
export function verdictMarque({ adresse, nom, symbole, origine }) {
  if (!estMarqueTbEtendue(nom, symbole)) return 'SANS_OBJET';
  if (OFFICIELS_TB.has(String(adresse || '').toLowerCase()) || origine === 'TOKENIZEDBLOCK') return 'OFFICIEL';
  if (origine === 'AILLEURS' || origine === 'ELSEWHERE' || origine === 'ETRANGER') return 'NON_OFFICIEL';
  return 'SANS_OBJET';
}

/** La phrase publique (anglais, comme l app). '' si rien a dire. Jamais d accusation : un fait, et la voie officielle. */
export function phraseMarque(verdict, launchpad = null) {
  if (verdict !== 'NON_OFFICIEL') return '';
  return 'Not official: this token uses the TokenizedBlock name but was not created on TokenizedBlock'
    + (launchpad ? ' (launched on ' + launchpad + ')' : '')
    + '. Its fees do not go to TokenizedBlock.';
}
