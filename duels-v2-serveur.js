/* duels-v2-serveur.js — /api/duels quand le contrat BlockDuelsV2 est servi (2026-10-24). LECTURE SEULE, AUCUN eth_getLogs, aucune cle.
 * Meme conception que la lecture v1 en prod (serveur-web.js lireDuelsSrv + duels-etat.js) : la liste vient de l ETAT, par eth_call a la tete,
 *   nextId() puis duels(id) du plus recent au plus ancien, au plus `budget` ids par tour (duels-etat.js idsDuelsATour) ; un duel FINAL
 *   (Settled / Cancelled / Refunded / Defaulted) n est plus relu ; un duel REGLE se complete UNE fois par l en-tete de son bloc cible
 *   (duels-etat.js reglerDepuisHash : face, scores, gagnant recalcules comme le contrat) ; un duel GAGNE PAR DEFAUT porte { winner: createur,
 *   payout: splitOf(stake).gagnant } (le contrat ne lit aucun hash pour lui).
 * ⛔ Un tour sans tete ou sans nextId lisible, ou dont AUCUN duel demande n a pu etre lu, echoue : l erreur est dite, la liste deja lue reste
 *   servie (avec `erreur`), jamais une liste vide qui voudrait dire « aucun duel ». Un id illisible est relu au tour suivant.
 * `rpc(method, params)` est DONNE (le rpcServeur de serveur-web.js, ou une fausse chaine dans les bancs) : ce module ne connait aucun noeud. */
import { lireDuel, SIG_DUELS, SIG_NEXT_ID } from './duels-plan.js';
import { refusGuess } from './blockrolls-plan.js';
import { lireNextId, idsDuelsATour, reglerDepuisHash } from './duels-etat.js';
import { selecteur } from './keccak.js';
import * as V2 from './duels-v2-plan.js';

const ZERO = '0x' + '0'.repeat(40);
const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x || '').toLowerCase();
const nul = (a) => bas(a) === ZERO;
const guessOk = (g) => Array.isArray(g) && refusGuess(g).length === 0;
export const STATUTS_FINAUX_V2 = Object.freeze(['Settled', 'Cancelled', 'Refunded', 'Defaulted']);

export const appelNextIdV2 = () => selecteur(SIG_NEXT_ID);
export function appelDuelV2(id) {
  const v = BigInt(id);
  if (v < 1n || v >= (1n << 256n)) throw new Error('duel id out of range: ' + id);
  return selecteur(SIG_DUELS) + v.toString(16).padStart(64, '0');
}

/** le contrat v2 de la fiche, seulement si adresse ET bloc y sont ecrits (noter-deploiement-duelsv2 les ecrit ENSEMBLE) ; sinon null */
export function contratDeFicheV2(fiche) {
  if (!fiche || fiche.contrat !== 'BlockDuelsV2' || fiche.chaine !== 8453) return null;
  const c = bas(fiche.adresse);
  return ADR.test(c) && Number.isSafeInteger(fiche.bloc) && fiche.bloc > 0 ? c : null;
}

/**
 * le retour de duels(id) d un contrat v2 -> { statut, duel, final } ; null s il est illisible ou INCOHERENT (statut None, createur ou jeton
 * nul, mise sous MIN_STAKE, guess hors bornes, un duel ouvert / annule avec un joueur, un rejoint / regle / gagne par defaut sans joueur).
 */
export function duelDepuisEtatV2(id, retour) {
  const r = lireDuel(retour);
  if (!r) return null;
  const statut = V2.STATUTS_V2[r.status];
  if (!statut || statut === 'None') return null;
  if (nul(r.creator) || nul(r.token) || !(r.stake >= V2.MISE_MIN) || !guessOk(r.guessA) || !Number.isSafeInteger(r.expiresAt) || r.expiresAt <= 0) return null;
  const pris = !nul(r.joiner);
  if (['Joined', 'Settled', 'Defaulted'].includes(statut) && !pris) return null;
  if ((statut === 'Open' || statut === 'Cancelled') && pris) return null;
  if (pris && (!guessOk(r.guessB) || !Number.isSafeInteger(r.targetBlock) || r.targetBlock <= 0)) return null;
  const duel = {
    id: String(BigInt(id)), creator: bas(r.creator), token: bas(r.token), stake: r.stake, guessA: r.guessA, expiresAt: r.expiresAt, blocCree: null,
    joiner: pris ? bas(r.joiner) : null, guessB: pris ? r.guessB : null, targetBlock: pris ? r.targetBlock : null,
    settled: null, cancelled: statut === 'Cancelled', refunded: statut === 'Refunded',
    defaulted: statut === 'Defaulted' ? { winner: bas(r.creator), payout: V2.partage(r.stake).gagnant } : null,
  };
  return { statut, duel, final: STATUTS_FINAUX_V2.includes(statut) };
}

/** le lecteur v2 : lire() fait UN tour (au plus un a la fois, pas plus d un toutes les `intervalleMs`) ; etat() rend ce qui est lu */
/* R2 (test live Grok game39) : un tour EN VOL est rendu (sa promesse) a qui l attend, au lieu d un retour immediat ; `force` (une ecriture
 *   connue : /api/duels?frais=1) passe outre l intervalle mais jamais plus d un tour force toutes les `forceMinMs` (un client ne peut pas
 *   faire lire la chaine en boucle).
 * Revue 2026-10-25 (defaut 2) : un tour force DEMARRE TOUJOURS APRES la requete qui le demande — un tour en vol ou fini a commence avant
 *   l ecriture et peut ne pas la voir. Une requete forcee pendant un tour en vol, ou moins de `forceMinMs` apres le DEBUT du precedent, attend
 *   UN tour de plus (la `file`, partagee par toutes les requetes forcees arrivees avant qu il demarre), lance des que le tour en vol finit et au
 *   plus tot `forceMinMs` apres le debut du precedent (la borne reste : un tour force au plus toutes les 2 s).
 * (defaut 3) : `luTete` = l heure ou LA TETE servie a ete demandee au noeud (avant l appel : jamais plus jeune qu elle), posee seulement avec
 *   elle ; un tour rate ne la change pas. `lu` (fin du dernier tour, reussi ou non) ne sert qu a l intervalle des tours ordinaires.
 * Un tour rend true s il a reussi, false sinon (lireAvantReponse ne dit jamais « frais » une lecture ratee). */
export function creerLecteurDuelsV2({ rpc, contrat, budget = 50, garde = 2000, intervalleMs = 15000, forceMinMs = 2000, horloge = () => Date.now(),
  attendre = (ms) => new Promise((ok) => setTimeout(ok, ms)) }) {
  const s = { contrat: bas(contrat), cache: new Map(), nextId: null, restants: 0, tete: null, lu: 0, luTete: 0, debut: 0, enVol: false, erreur: null, promesse: null, file: null };
  function demarrer() {
    s.enVol = true; s.debut = horloge();
    s.promesse = tour().finally(() => { s.promesse = null; });
    return s.promesse;
  }
  function lire(force = false) {
    if (!ADR.test(s.contrat)) return Promise.resolve(false);
    if (force) {
      if (s.file) return s.file;
      const borne = Math.min(forceMinMs, intervalleMs);
      if (!s.enVol && !(s.debut > 0 && horloge() - s.debut < borne)) return demarrer();
      const avant = s.enVol && s.promesse ? s.promesse : Promise.resolve();
      s.file = avant.then(async () => {
        const reste = s.debut + borne - horloge();
        if (s.debut > 0 && reste > 0) await attendre(reste);
        s.file = null;
        /* un tour ordinaire lance pendant la pause a demarre APRES la requete : il est partage */
        return s.enVol && s.promesse ? s.promesse : demarrer();
      });
      return s.file;
    }
    if (s.enVol && s.promesse) return s.promesse;
    if (horloge() - s.lu < intervalleMs) return Promise.resolve(false);
    return demarrer();
  }
  async function tour() {
    try {
      const luTete = horloge();
      const tete = parseInt(await rpc('eth_blockNumber', []), 16);
      if (!Number.isSafeInteger(tete) || tete <= 0) throw new Error('head unreadable');
      const nextId = lireNextId(await rpc('eth_call', [{ to: s.contrat, data: appelNextIdV2() }, 'latest']));
      if (nextId === null) throw new Error('nextId() unreadable');
      const { ids, restants } = idsDuelsATour({ nextId, cache: s.cache, budget, garde });
      let rates = 0, derniere = null;
      for (const id of ids) {
        try {
          const e = duelDepuisEtatV2(id, await rpc('eth_call', [{ to: s.contrat, data: appelDuelV2(id) }, 'latest']));
          if (!e) { rates += 1; derniere = 'duel #' + id + ' unreadable'; continue; }
          let d = e.duel;
          if (e.statut === 'Settled') {
            const b = await rpc('eth_getBlockByNumber', ['0x' + d.targetBlock.toString(16), false]);
            const r = reglerDepuisHash(d, b && b.hash);
            if (!r) { s.cache.delete(String(id)); rates += 1; derniere = 'block of duel #' + id + ' unreadable'; continue; }
            d = { ...r, defaulted: null };
          }
          s.cache.set(String(id), { duel: d, final: e.final, luA: horloge() });
        } catch (err) { rates += 1; derniere = String((err && err.message) || err); }
      }
      for (const id of [...s.cache.keys()]) if (Number(id) <= nextId - 1 - garde) s.cache.delete(id);
      if (ids.length && rates === ids.length) throw new Error(derniere || 'no duel could be read');
      s.nextId = nextId; s.restants = restants + ids.filter((id) => !s.cache.has(String(id))).length;
      s.tete = tete; s.luTete = luTete; s.erreur = rates ? rates + ' of ' + ids.length + ' duel reads failed (' + String(derniere).slice(0, 60) + ')' : null;
      return true;
    } catch (e) { s.erreur = String((e && e.message) || e).slice(0, 120); return false; }
    finally { s.lu = horloge(); s.enVol = false; }
  }
  return { lire, etat: () => s };
}

/** R2 : ce que /api/duels fait AVANT de repondre. Une requete ordinaire lance un tour (au plus toutes les 15 s) sans l attendre ; une requete
 *  `frais` (l app vient de lire un recu : create, join, cancel…) force un tour et l ATTEND, au plus `attenteMs`, pour repondre avec lui.
 *  Rend true si la reponse suit un tour REUSSI, demarre apres la requete, fini pendant l attente. */
export async function lireAvantReponse(lecteur, { frais = false, attenteMs = 3000 } = {}) {
  const p = Promise.resolve(lecteur.lire(!!frais));
  if (!frais) return false;
  let minuteur = null;
  const delai = new Promise((ok) => { minuteur = setTimeout(() => ok(false), attenteMs); });
  try { return await Promise.race([p.then((v) => v === true, () => false), delai]); } finally { clearTimeout(minuteur); }
}
/** `?frais=1` dans l URL d une requete (seule cette forme exacte compte) */
export const demandeFraiche = (url) => /[?&]frais=1(?:&|$)/.test(String(url || ''));

/**
 * La reponse de /api/duels pour v2 (le meme schema que v1, plus version: 2, ouverts, fenetre, tempsDeBloc). `lecteur` = creerLecteurDuelsV2,
 * `fiche` = duels-v2-deploiement.js, `maintenant` en s, `sParBloc` = le temps de bloc MESURE par le serveur (null = non mesure),
 * `blocksDe(createur)` = les blocks connus d un createur (pour la Map).
 */
export function reponseDuelsV2({ lecteur, fiche, maintenant, sParBloc = null, blocksDe = () => [] }) {
  const s = lecteur.etat(), k = (fiche && fiche.constructeur) || {};
  const adrOk = (x) => (ADR.test(bas(x)) ? bas(x) : null);
  const regles = { miseMin: V2.MISE_MIN.toString(), expirationMinS: V2.EXPIRATION_MIN_S, expirationMaxS: V2.EXPIRATION_MAX_S, partageBps: { gagnant: 9000, pool: 700, dev: 300 },
    fenetreBlocs: V2.FENETRE, apresFenetre: 'DEFAULT_CREATOR' };
  const base = { version: V2.VERSION, contrat: s.contrat, bloc: Number.isSafeInteger(fiche && fiche.bloc) ? fiche.bloc : null, usdc: adrOk(k.usdc), devWallet: adrOk(k.devWallet),
    rewardPool: adrOk(k.rewardPool), regles, tempsDeBloc: { sParBloc: Number.isFinite(sParBloc) && sParBloc > 0 ? sParBloc : null },
    fenetreS: V2.fenetreSecondes(sParBloc), avantJoin: V2.phraseAvantJoin(sParBloc), egalite: V2.PHRASE_EGALITE };
  if (s.tete === null) return { ok: false, etat: 'NON_LU', ...base, echec: !!s.erreur, pourquoi: s.erreur || 'first read in progress' };
  const tous = [...s.cache.values()].map((e) => ({ d: e.duel, e: V2.etatDuel(e.duel, s.tete, maintenant).etat }));
  const vivants = tous.filter((x) => !V2.FINIS.includes(x.e)).sort((p, q) => (BigInt(q.d.id) > BigInt(p.d.id) ? 1 : -1)).slice(0, 200);
  const finis = tous.filter((x) => V2.FINIS.includes(x.e)).sort((p, q) => (BigInt(q.d.id) > BigInt(p.d.id) ? 1 : -1)).slice(0, 20);
  const enJson = (x) => ({ ...V2.duelEnJson(x.d), etat: x.e, creatorBlocks: (blocksDe(x.d.creator) || []).slice(0, 5) });
  return { ok: true, etat: 'LU', ...base, tete: s.tete, nextId: s.nextId, aLire: s.restants, partiel: s.restants > 0, lu: new Date(s.luTete).toISOString(), maintenant,
    erreur: s.erreur, orphelins: 0, aReclamer: vivants.filter((x) => x.e === V2.DEFAULT_CREATOR).length,
    duels: vivants.map(enJson), recents: finis.map(enJson), exemplePartage: Object.fromEntries(Object.entries(V2.partage(1000000n)).map(([c, v]) => [c, v.toString()])) };
}
