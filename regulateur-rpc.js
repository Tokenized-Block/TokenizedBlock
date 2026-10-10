// regulateur-rpc.js — le debit et les capacites des noeuds RPC publics, en UN seul endroit.
// ================================================================================================
// ⛔⛔ MESURE DU 2026-10-02 (onglet Feed, navigateur sans tete, page locale, Base mainnet, 120 s) :
//     124 erreurs console, 623 requetes RPC, pic de 23 requetes dans UNE seconde.
//       · 112 x HTTP 429 — publicnode « Rate limit exceeded », mainnet.base.org « over rate limit »,
//         drpc « Public endpoint rate limit ». Une limite de DEBIT : chaque lecture partait aussitot,
//         et apres un 429 la suivante retournait frapper le meme noeud dans la milliseconde.
//       · 9 x HTTP 400 — drpc « ranges over 10000 blocks are not supported on free plan ».
//         ⛔ LE MESSAGE MENT SUR SA PROPRE BORNE. Sonde directe, meme jour : 100 blocs -> 200,
//         120 / 140 / 151 / 200 / 500 / 999 -> 400. Le plafond reel du plan gratuit est ~100 blocs.
//         C est un refus PERMANENT : l envoyer la-bas ne rapporte qu une ligne rouge de plus.
//       · 3 x HTTP 403 — publicnode « Request blocked » sur un getLogs a 50 adresses (plafond
//         mesure le 2026-09-23 : 9). Permanent aussi.
// ⇒ Deux remedes, et seulement deux :
//     1. NE PAS ENVOYER une requete a un noeud qui la refusera A COUP SUR (capacites ci-dessous).
//     2. ESPACER les requetes par noeud, et RALENTIR un noeud qui vient de dire 429 — son ecart
//        double a chaque refus, se resserre a chaque succes (voir `creerRegulateur`).
// ⛔ ON NE RETIRE JAMAIS LE DERNIER REPLI : si le filtre de capacite ne laisse aucun noeud, la liste
//   d origine revient intacte (« une optimisation qui supprime un repli transforme un ralentissement
//   en panne »). Un noeud ralenti n est pas retire non plus : il passe DERRIERE.
// ⚠️ CE QUE CE MODULE NE PROUVE PAS : les vrais quotas des noeuds (non publies). L ecart et son
//   adaptation sont des reglages mesures sur une page, pas des constantes du fournisseur.

/** Refus permanents mesures, par hote. `plageMax` = blocs inclus (to - from + 1). */
export const CAPACITES_LOGS = Object.freeze({
  'base.drpc.org': Object.freeze({ plageMax: 100 }),
  'base-rpc.publicnode.com': Object.freeze({ adressesMax: 9, profondeurMax: 10000 }),
});

export function hoteDe(url) {
  try { return new URL(String(url)).host; } catch (_) { return String(url || ''); }
}

/** Ce noeud peut-il servir cette requete, d apres les refus PERMANENTS mesures ? En cas de doute : oui. */
export function noeudPeutServir(url, methode, params, tete = 0) {
  if (methode !== 'eth_getLogs') return true;
  const cap = CAPACITES_LOGS[hoteDe(url)];
  const f = params && params[0] && typeof params[0] === 'object' ? params[0] : null;
  if (!cap || !f) return true;
  const hex = (x) => (typeof x === 'string' && /^0x[0-9a-f]+$/i.test(x) ? parseInt(x, 16) : null);
  const de = hex(f.fromBlock), a = hex(f.toBlock);
  if (cap.plageMax && de !== null && a !== null && a - de + 1 > cap.plageMax) return false;
  if (cap.adressesMax && Array.isArray(f.address) && f.address.length > cap.adressesMax) return false;
  if (cap.profondeurMax && de !== null && Number.isInteger(tete) && tete > 0 && tete - de > cap.profondeurMax) return false;
  return true;
}

/**
 * ⛔⛔ L ECART S ADAPTE (comme un controle de congestion), IL NE BLOQUE PAS. Premiere version mesuree
 *     le 2026-10-02 : un REPOS fixe qui doublait jusqu a 20 s apres chaque 429. Sur un noeud partage
 *     (la factory B20 est epinglee sur mainnet.base.org, seul), chaque lecture attendait le repos PUIS
 *     sa propre reprise du 429 : 38 requetes en 2 min, le Feed vide pendant 100 s. Pire que l erreur.
 *    Seconde version (x2 par 429, plafond 3 s) : mainnet.base.org, partage avec le serveur local sur
 *    la meme IP, restait a 3 s d ecart — 4 lignes de Feed en 2 min. Trop prudent : il SERVAIT ~1,2/s.
 *  ⇒ Un 429 ALLONGE l ecart de 50 % (min 300 ms, plafond `ecartMaxMs` = 1,2 s) ; chaque succes le
 *    RESSERRE de 20 %, jusqu a `ecartMs`. Le noeud ralenti passe derriere les autres le temps d un
 *    ecart, pas plus.
 */
export function creerRegulateur({ maintenant = () => Date.now(),
  dormir = (ms) => new Promise((ok) => setTimeout(ok, ms)),
  ecartMs = 150, ecartMaxMs = 1200, enVolMax = 2, attenteMaxMs = 3000,
  pauseLogsApres = 3, pauseLogsMs = 5 * 60 * 1000 } = {}) {
  const etats = new Map();
  const etat = (h) => {
    let e = etats.get(h);
    if (!e) { e = { prochain: 0, enVol: 0, ecart: ecartMs, reposJusqua: 0, refus: 0,
      quotaLogs: 0, pauseLogsJusqua: 0, sautesLogs: 0, sondesLogs: 0 }; etats.set(h, e); }
    return e;
  };
  /* 2026-10-10 (re-QA : base.drpc.org ~10-15 HTTP 429/min en navigateur) : la meme pause, generalisee a TOUTE methode, par noeud ET
   *   par methode (cle 'hote|methode'). getLogs garde ses champs historiques (quotaLogs...) dans l etat de l hote, pour les tests et la mesure. */
  const pauses = new Map();
  const pauseDe = (h, m) => { const k = h + '|' + m; let p = pauses.get(k); if (!p) { p = { quota: 0, jusqua: 0, sautes: 0, sondes: 0 }; pauses.set(k, p); } return p; };
  const miroir = (h, m) => { if (m !== 'eth_getLogs') return; const p = pauseDe(h, m), e = etat(h);
    e.quotaLogs = p.quota; e.pauseLogsJusqua = p.jusqua; e.sautesLogs = p.sautes; e.sondesLogs = p.sondes; };
  const enPause = (url, m) => { const p = pauses.get(hoteDe(url) + '|' + m); return !!p && p.jusqua > maintenant(); };
  const auRepos = (url) => etat(hoteDe(url)).reposJusqua > maintenant();
  return {
    /** Filtre les refus permanents (jamais jusqu a vide), puis met les noeuds ralentis DERRIERE. */
    ordonner(noeuds, methode, params, tete = 0) {
      const liste = Array.isArray(noeuds) ? noeuds.slice() : [];
      const capables = liste.filter((u) => noeudPeutServir(u, methode, params, tete));
      const base = capables.length ? capables : liste;
      return base.filter((u) => !auRepos(u)).concat(base.filter((u) => auRepos(u)));
    },
    /** Attend un creneau sur ce noeud (ecart courant + concurrence), borne par `attenteMaxMs`.
     *  Rend la fonction qui libere le creneau. */
    async creneau(url) {
      const e = etat(hoteDe(url));
      const limite = maintenant() + attenteMaxMs;
      for (;;) {
        const t = maintenant();
        if ((t >= e.prochain && e.enVol < enVolMax) || t >= limite) break;
        await dormir(Math.max(20, Math.min(e.prochain - t, limite - t, 250)));
      }
      e.enVol++;
      e.prochain = Math.max(e.prochain, maintenant()) + e.ecart;
      let libere = false;
      return () => { if (!libere) { libere = true; e.enVol = Math.max(0, e.enVol - 1); } };
    },
    /* ?? 2026-10-10 (Grok Bot, plan wf_214da17d-39f juge) - PAUSE DES getLogs PAR NOEUD ET PAR METHODE.
     *   MESURE : 60 s d onglet Feed, 28 eth_getLogs sur 28 vers mainnet.base.org -> HTTP 429
     *   {code:-32011, 'request limit reached'} ; seul dans la liste, chaque lecture y perdait 6 essais (~22 s).
     *   ? Apres K (pauseLogsApres) refus de QUOTA d affilee, ce noeud n est plus ESSAYE pour eth_getLogs pendant T
     *     (pauseLogsMs) ; la premiere lecture apres T est la sonde (une seule, la pause se re-arme aussitot).
     *   ? Il n est JAMAIS retire d une liste : rpcReseau le saute sans requete, garde l erreur, et finit par le
     *     decoupage en lots de 9 ou par un throw - jamais une liste vide.
     *   ? K = 3 et T = 5 min sont des CHOIX (ESTIMATION), pas des constantes du fournisseur : ils se lisent dans
     *     instantane() (quotaLogs, pauseLogsJusqua, sautesLogs, sondesLogs) pour etre MESURES en navigateur. */
    enPauseLogs(url, methode) { return !!methode && enPause(url, methode); },
    enPause(url, methode) { return !!methode && enPause(url, methode); },
    /** null = envoyer ; sinon la raison du saut (jamais un resultat). */
    /*  `autres` (facultatif) : les autres noeuds de la liste. S il est donne et qu AUCUN n est libre pour cette methode, on ENVOIE (sauf eth_getLogs : son repli
     *  mesure est le decoupage en lots de 9, pas le meme noeud)
     *  quand meme : la pause ne fait jamais d une liste entiere un refus sans requete (le repli reste). */
    passer(url, methode, autres) {
      if (!methode) return null;
      const h = hoteDe(url), p = pauses.get(h + '|' + methode);
      if (!p || !p.jusqua) return null;
      const t = maintenant();
      if (t >= p.jusqua) { p.sondes++; p.jusqua = t + pauseLogsMs; miroir(h, methode); return null; }
      if (methode !== 'eth_getLogs' && Array.isArray(autres) && !autres.some((u) => hoteDe(u) !== h && !enPause(u, methode))) return null;
      p.sautes++; miroir(h, methode);
      return methode + ' paused on ' + h + ' after ' + p.quota + ' quota refusals in a row (next probe in '
        + Math.ceil((p.jusqua - t) / 1000) + ' s)';
    },
    /** `issue` : 'ok' | 'debit' | 'autre'. Seul un refus de DEBIT ralentit ; un refus de forme, non.
     *  `opts` : { methode, quota } - seul un refus de QUOTA sur eth_getLogs compte vers la pause. */
    noter(url, issue, opts = {}) {
      const e = etat(hoteDe(url));
      const m = opts && opts.methode, h = hoteDe(url);
      if (m && issue === 'ok' && pauses.has(h + '|' + m)) { const p = pauseDe(h, m); p.quota = 0; p.jusqua = 0; miroir(h, m); }
      if (m && issue === 'debit' && opts.quota) {
        const p = pauseDe(h, m); p.quota++;
        if (p.quota >= pauseLogsApres) p.jusqua = maintenant() + pauseLogsMs;
        miroir(h, m);
      }
      if (issue === 'ok') { e.refus = 0; e.ecart = Math.max(ecartMs, Math.round(e.ecart * 0.8)); return; }
      if (issue !== 'debit') return;
      e.refus++;
      e.ecart = Math.min(ecartMaxMs, Math.max(Math.round(e.ecart * 1.5), 300));
      e.reposJusqua = maintenant() + e.ecart;
      e.prochain = Math.max(e.prochain, e.reposJusqua);
    },
    auRepos,
    instantane() { return Object.fromEntries([...etats].map(([h, e]) => [h, { ...e }])); },
    pausesInstantane() { return Object.fromEntries([...pauses].map(([k, p]) => [k, { ...p }])); },
  };
}
