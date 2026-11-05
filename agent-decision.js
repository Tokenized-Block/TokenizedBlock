/* agent-decision.js — PROTOTYPE NON DEPLOYE (2026-11-05) : la jonction des DEUX securites du mode autonome.
 *
 * Une tache n est executable SANS l humain que si, en meme temps :
 *   1. le drapeau MODE_AUTONOME_DRAPEAU (agent-sous-compte.js) est VRAI — il est faux aujourd hui : tout part chez l humain ;
 *   2. le CERVEAU du block l accepte : tacheAutorisee(taskId, snap, opts) de brain-tasks.js rend ok === true (neurones
 *      deterministes, JAMAIS un LLM ; cette fonction est APPELEE telle quelle, son comportement n est pas touche) ;
 *   3. la tache signe quelque chose (signs === true dans ONCHAIN_TASKS) : une tache qui ne signe rien n a rien a executer ;
 *   4. la couche 2, verdictAutonome (agent-autonome.js), dit EXECUTER.
 * Sinon : mode HUMAIN — la tache reste PROPOSEE, le wallet de l utilisateur signe comme aujourd hui.
 * Fonctions pures : rien n est lu, rien n est envoye, aucune cle. Les deux couches sont TOUJOURS evaluees et TOUTES les raisons
 * sont rendues (pas la premiere seulement).
 * `verdict` rendu = ce que executerDepuisSousCompte attend : { decision: 'EXECUTER' | 'REFUSE', raisons } ; il ne vaut EXECUTER
 * que si les quatre conditions tiennent — un refus du cerveau bloque donc l executeur meme si la couche 2 disait EXECUTER. */
import { tacheAutorisee, ONCHAIN_TASKS } from './brain-tasks.js';
import { verdictAutonome } from './agent-autonome.js';
import { MODE_AUTONOME_DRAPEAU } from './agent-sous-compte.js';

export const MODE_AUTONOME = 'AUTONOME';
export const MODE_HUMAIN = 'HUMAIN';

/**
 * tache      : id d ONCHAIN_TASKS (ex. 'trade_tblock')
 * snap       : l instantane du cerveau (phase, marche, tick, journal…) — le meme que lit tacheAutorisee
 * optsTache  : les options de tacheAutorisee (ex. { offerBusy })
 * plan, grant, regles, journal, maintenant : les entrees de verdictAutonome, passees telles quelles
 * drapeau    : par defaut MODE_AUTONOME_DRAPEAU (false) ; un banc peut l injecter
 */
export function decisionAutonome({ tache, snap, optsTache = {}, plan, grant, regles, journal = [], maintenant, drapeau = MODE_AUTONOME_DRAPEAU } = {}) {
  const raisons = [];
  if (drapeau !== true) raisons.push('autonomous mode is off');
  const def = ONCHAIN_TASKS.find((t) => t.id === tache) || null;
  const cerveau = tacheAutorisee(tache, snap, optsTache);
  if (!cerveau || cerveau.ok !== true) raisons.push('brain refuses the task: ' + ((cerveau && cerveau.pourquoi) || 'no answer'));
  if (def && def.signs !== true) raisons.push('task signs nothing: nothing to execute');
  const couche2 = verdictAutonome({ plan, grant, regles, journal, maintenant });
  if (!couche2 || couche2.decision !== 'EXECUTER') for (const r of (couche2 && couche2.raisons) || ['layer 2 gave no answer']) raisons.push('layer 2: ' + r);
  const autonome = raisons.length === 0;
  return {
    mode: autonome ? MODE_AUTONOME : MODE_HUMAIN,
    tache: def ? def.id : null,
    cerveau: { ok: !!(cerveau && cerveau.ok === true), pourquoi: (cerveau && cerveau.pourquoi) || null, band: cerveau && cerveau.band, phase: cerveau && cerveau.phase },
    couche2,
    verdict: autonome ? { decision: 'EXECUTER', raisons: [] } : { decision: 'REFUSE', raisons },
    raisons,
  };
}
