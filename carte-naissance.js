// carte-naissance.js — CREATE-ONE-PATH (game343): Grok's v5.3 card. ONE component, painted from etat-naissance.js's answer only,
// used on Create (#cTipApercu) and on the block page (#bOne). 3 steps, each signature done / next / waiting; one Continue button whose
// two lines name the step and "Signature 1 of M · <signature>". The card never decides anything and never builds a call: Continue
// hands back to the caller, which runs the existing flow for that step (each of its calls simulated before the wallet opens).
// DOM built with textContent only (no innerHTML of read values).
import { libelleContinue } from './etat-naissance.js';
import { displayShort } from './frais-creation.js'; /* the one shortener: a fee wallet address is never displayed */

const court = (a) => (/^0x[0-9a-fA-F]{40}$/.test(String(a)) ? displayShort(a) : '');
const STAT = { FAIT: 'DONE', SUIVANT: 'NEXT', ATTENTE: 'WAITING' };
const SOUS = {
  1: 'Only if this wallet lacks it · no app fee',
  2: '0.001 ETH in all + ≈ $1 deposit that stays yours',
  3: 'The rest of your $5, in TBLOCK, to the community vault',
};
function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

/**
 * peindreCarteNaissance(hote, r, { titre, onContinue, occupe })
 *  r        : the reader's answer (or { etat:'NON_MESURE' })
 *  occupe   : { secondes, essai } while Base nodes are busy (Continue greyed, band shown)
 */
export function peindreCarteNaissance(hote, r, { titre = 'Your birth, in one card — $5 in all, TBLOCK first', onContinue = null, occupe = null, bouton = null } = {}) {
  if (!hote) return;
  const carte = el('div', 'cnCarte');
  const tout = r && r.etat === 'LU' && r.restantes === 0;
  carte.append(el('div', 'cnTitre', tout ? 'Born · market open · vault paid' : titre));
  carte.append(el('p', 'cnLead', r && r.apercu ? 'Connect your wallet: this card then reads the chain and shows exactly what is left. Up to 10 signatures without batching (e.g. Rabby), each named; you can stop and come back.'
    : tout ? 'Nothing left to sign. Every step below was read on the chain just now.'
    : 'Three steps. One Continue button. ' + (r && r.etat === 'LU' ? r.restantes + ' signature' + (r.restantes > 1 ? 's' : '') + ' left' : 'Up to 10 signatures')
      + ' without batching (e.g. Rabby), each named. The app reads the chain before every step, so you can stop and come back: this card picks up where you are.'));
  if (occupe || !r || r.etat !== 'LU') {
    const b = el('div', 'cnOccupe');
    b.append(el('b', null, 'Base nodes are busy' + (occupe && occupe.secondes ? ' — retrying in ' + occupe.secondes + ' s' : ' — retrying')));
    b.append(el('span', null, ' The chain did not answer. Everything already signed is safe on-chain; nothing is lost.' + (occupe && occupe.essai ? ' Attempt ' + occupe.essai + '.' : '')));
    carte.append(b);
  }
  if (r && r.etat === 'LU') {
    for (const e of r.etapes) {
      const box = el('div', 'cnEtape cn' + e.statut);
      const tete = el('div', 'cnTete');
      tete.append(el('span', 'cnNum', e.statut === 'FAIT' ? '✓' : String(e.n)));
      const t = el('div', 'cnNom'); t.append(el('b', null, e.n + ' · ' + e.nom)); t.append(el('small', null, SOUS[e.n] || ''));
      tete.append(t);
      tete.append(el('span', 'cnPill', STAT[e.statut] + (e.statut === 'FAIT' ? '' : ' · ' + e.faites + '/' + e.signatures.length)));
      box.append(tete);
      if (e.statut === 'FAIT') box.append(el('div', 'cnFait', '› ' + e.signatures.length + ' signature' + (e.signatures.length > 1 ? 's' : '') + ' done — read on the chain'));
      else for (const s of e.signatures) {
        const l = el('div', 'cnSig cn' + s.statut);
        l.append(el('span', 'cnPuce', s.statut === 'FAIT' ? '✓' : s.statut === 'SUIVANT' ? (s.expire ? '↻' : '→') : ''));
        const d = el('div', 'cnSigTxt');
        d.append(el('b', null, s.nom));
        d.append(el('small', null, court(s.to) + (s.nonLu ? ' · not read yet' : '')));
        if (s.statut === 'SUIVANT') d.append(el('em', null, s.expire ? 'Permit expired — sign it again; nothing else is repeated.' : s.raison));
        l.append(d);
        l.append(el('span', 'cnEtat', STAT[s.statut]));
        box.append(l);
      }
      carte.append(box);
    }
  }
  const lib = occupe ? { l1: 'Waiting for Base nodes…', l2: 'Continue comes back by itself' } : r && r.apercu ? { l1: '', l2: '' } : libelleContinue(r);
  let btn;
  if (bouton) {
    /* Create: the page's own #cCreer (its flow, its label) is MOVED into the card — one button, never two; the signature line under it */
    carte.append(bouton);
    if (lib.l2) carte.append(el('small', 'cnSousBouton', lib.l2));
    btn = bouton;
  } else {
    btn = el('button', 'bouton cnContinue'); btn.type = 'button';
    btn.append(el('b', null, lib.l1)); if (lib.l2) btn.append(el('small', null, lib.l2));
    btn.disabled = !!occupe || !r || r.etat !== 'LU' || (!r.prochaine && r.restantes !== 0);
    if (onContinue) btn.addEventListener('click', () => onContinue(r));
    carte.append(btn);
  }
  carte.append(el('p', 'cnPied', 'Your progress is read from the chain, not from this page: closing it loses nothing.'));
  hote.replaceChildren(carte);
  hote.hidden = false;
  return btn;
}
