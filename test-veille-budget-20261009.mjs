/* test-veille-budget-20261009.mjs — /api/veille RELISAIT TOUT A CHAQUE REQUETE, ET MARCHAIT DANS DES REFUS CONNUS D AVANCE.
 *
 * Audit du budget d archive (2026-10-09, relu sur le code a b64634e) : chaque requete remarchait toutes les fenetres de 2 000
 * blocs depuis 51 571 225 sans cache, sans partage du calcul en vol, sans curseur. Tete lue sur publicnode le 2026-10-09 a
 * 23 h 33 UTC : 52 399 706 -> 415 fenetres, dont 409 a plus de PROFONDEUR_PUBLICNODE blocs de la tete, qui finissent au noeud
 * d archive : ~409 appels d archive PAR REQUETE (calcul sur le code, pas une mesure de prod). Budget du jour epuise, chacun
 * etait un refus connu d avance.
 * Les gardes, EXECUTEES sur la route et les blocs extraits du fichier livre (enFond / repondreFond / veilleUneFois) :
 *   A. requetes simultanees ou repetees dans le delai : UNE marche ; le resultat servi avec son age ; une marche longue ne tient
 *      pas la requete et ne se dit jamais complete ;
 *   B. budget epuise : AUCUNE marche ; le dernier resultat reste servi avec son age et la raison a cote, sinon un etat NOMME ;
 *      jamais « complet » sur ce qui n a pas ete lu ; le budget revenu, la marche reprend (une fois) ;
 *   C. la forme : BigInt rendu en texte, panne de noeud dite, meme pot / meme bloc de depart / meme lecteur qu avant ;
 *   D. la route passe par le calcul en fond, et le delai reste sous la fenetre de contestation ;
 *   E. avec le VRAI veiller (veille-pot.js) sur une chaine fausse : budget epuise EN COURS de marche, la marche est coupee a la
 *      premiere fenetre profonde (aucun refus connu d avance demande), ne remplace pas le dernier resultat (son alerte reste),
 *      et ne coupe rien quand il ne reste que des fenetres recentes.
 * ⛔ BORNE : le serveur ne demarre pas ici ; ni le noeud CDP, ni la duree reelle d une marche, ni le cout reel ne sont exerces. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { DELAI_CONTESTATION, TOPICS, veiller as veillerVrai } from './veille-pot.js';

const src = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const nu = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
const entre = (debut, finMarque) => { const i = src.indexOf(debut); assert.ok(i > 0, debut + ' introuvable'); const j = src.indexOf(finMarque, i); assert.ok(j > i, finMarque + ' introuvable'); return src.slice(i, j); };
let n = 0, ko = 0;
const cas = async (titre, f) => {
  n++;
  try { await f(); console.log('  ok  ' + titre); } catch (e) { ko++; console.log('  KO  ' + titre + '\n        ' + String((e && e.message) || e).split(/\r?\n/)[0].slice(0, 220)); }
};
const dort = (ms) => new Promise((ok) => setTimeout(ok, ms));

/* ── les blocs, tels que livres ─────────────────────────────────────────────────────────────────── */
const blocFond = entre('const calculsFond = new Map();', 'async function fraisRecents(heures) {');
const MARQUE_VEILLE = 'const VEILLE_DEPUIS = ';
/* absent du code d avant ce correctif : la route d avant tourne alors seule (preuve rouge-avant) ; D1 exige sa presence */
const blocVeille = src.includes(MARQUE_VEILLE) ? entre(MARQUE_VEILLE, 'const clesPool = new Map();') : '';
const iRoute = src.indexOf("if (chemin === '/api/veille') {");
assert.ok(iRoute > 0, 'route /api/veille introuvable');
const fRoute = /\r?\n {2}\}\r?\n/.exec(src.slice(iRoute));
assert.ok(fRoute, 'fin de la route /api/veille introuvable');
const blocRoute = src.slice(iRoute, iRoute + fRoute.index + fRoute[0].length);
/* la profondeur LIVREE (celle que la route des frais utilise deja), jamais recopiee a la main */
const mProf = /const PROFONDEUR_PUBLICNODE = (\d+);/.exec(src);
assert.ok(mProf, 'PROFONDEUR_PUBLICNODE introuvable');
const PROF = Number(mProf[1]);

const POT = '0xc743f6aAff2c4caD67C30B9e5d1aF0e913FCE272';
const DEPUIS = 51571225;
const COMPLET = { alertes: [], periodesAncrees: 3, ancragesLus: 3, complet: true, ratees: 0, tete: 52395726,
  borne: 'Every Ancree event between block 51571225 and 52395726 was read.' };
const TROUE = { alertes: [{ gravite: 'AVERTISSEMENT', periode: 4, contestationRestanteSecondes: 1200 }], periodesAncrees: 2, ancragesLus: 3,
  complet: false, ratees: 408, tete: 52395726, borne: '408 read(s) failed — this is a FLOOR, not a verdict. Do not read "no alert" as "all clear".' };

/* ── une chaine FAUSSE pour le VRAI veiller ─────────────────────────────────────────────────────── *
 * Comme en prod : une fenetre a plus de PROF blocs de la tete n est servie que par le noeud d archive (publicnode 403, base.org
 * 429) ; budget epuise, elle est refusee A COUP SUR — chaque demande de ce genre est un « refus connu d avance », compte.
 * `budgetRestant` : nombre de fenetres profondes encore servies avant que le budget s epuise (null = jamais). */
const h32 = (v) => BigInt(v).toString(16).padStart(64, '0');
const ancree = (id, bloc, jeton) => ({ topics: [TOPICS.Ancree, '0x' + h32(id), '0x' + '0'.repeat(24) + jeton.slice(2)],
  data: '0x' + 'ab'.repeat(32) + h32(1) + 'cd'.repeat(32) + h32(5), blockNumber: '0x' + bloc.toString(16), transactionHash: '0x' + bloc.toString(16).padStart(64, '0') });
/* periode 7 ancree deux fois, a 7 h d ecart, dans les DEUX premieres fenetres (profondes) : une alerte CRITIQUE n est lue qu en profondeur */
const T0 = 1_800_000_000;
const LOGS_CRITIQUE = [ancree(7, DEPUIS + 100, '0x' + 'a1'.repeat(20)), ancree(7, DEPUIS + 2100, '0x' + 'b2'.repeat(20))];
const HORODATAGES = new Map([[DEPUIS + 100, T0], [DEPUIS + 2100, T0 + 7 * 3600]]);

/** Un serveur extrait : horloge, budget et veilleur (ou chaine) FAUX, injectes ; enFond / repondreFond / veilleUneFois / route VRAIS. */
function monter({ epuise = false, reponses = [COMPLET], ms = 20, chaine = null } = {}) {
  const e = { horloge: { t: 1_800_000_000_000 }, epuise, marches: [], rpc: [], fenetres: [], refusConnus: 0, chaine, budgetRestant: null };
  const D = { now: () => e.horloge.t };
  const budget = () => e.epuise;
  const rpcServeur = chaine
    ? async (m, p) => {
      e.rpc.push(m);
      if (m === 'eth_blockNumber') return '0x' + e.chaine.tete.toString(16);
      if (m === 'eth_getLogs') {
        const de = parseInt(p[0].fromBlock, 16), a = parseInt(p[0].toBlock, 16), profonde = e.chaine.tete - a > PROF;
        e.fenetres.push({ de, a, profonde, budgetEpuise: e.epuise });
        if (profonde && e.epuise) { e.refusConnus++; throw new Error('request limit reached'); }
        if (profonde && e.budgetRestant !== null && --e.budgetRestant <= 0) e.epuise = true;
        return (e.chaine.logs || []).filter((l) => parseInt(l.blockNumber, 16) >= de && parseInt(l.blockNumber, 16) <= a);
      }
      if (m === 'eth_getBlockByNumber') return { timestamp: '0x' + (HORODATAGES.get(parseInt(p[0], 16)) ?? T0).toString(16) };
      throw new Error('methode inattendue ' + m);
    }
    : async (m) => { e.rpc.push(m); throw new Error('le faux veilleur ne lit pas la chaine'); };
  const veiller = chaine
    ? (o) => { e.marches.push(o); return veillerVrai(o); }
    : async (o) => {
      e.marches.push(o);
      await dort(ms);
      const r = reponses[Math.min(e.marches.length - 1, reponses.length - 1)];
      if (r instanceof Error) throw r;
      return r;
    };
  e.rpcServeur = rpcServeur;
  e.S = new Function('Date', 'archiveEpuisee', 'veiller', 'rpcServeur', 'PROFONDEUR_PUBLICNODE', blocFond + '\n' + blocVeille
    + '\n; return { enFond, repondreFond, calculsFond,'
    + ' veilleUneFois: typeof veilleUneFois === "function" ? veilleUneFois : undefined,'
    + ' VEILLE_TTL_MS: typeof VEILLE_TTL_MS === "number" ? VEILLE_TTL_MS : undefined,'
    + ' VEILLE_DEPUIS: typeof VEILLE_DEPUIS === "number" ? VEILLE_DEPUIS : undefined };')(D, budget, veiller, rpcServeur, PROF);
  const route = new Function('chemin', 'res', 'enFond', 'repondreFond', 'veilleUneFois', 'VEILLE_TTL_MS', 'VEILLE_DEPUIS', 'archiveEpuisee', 'veiller', 'rpcServeur', 'Date',
    blocRoute + '\nreturn "route non prise";');
  e.ttl = e.S.VEILLE_TTL_MS ?? 3 * 3600 * 1000; /* le code d avant n a pas de delai : on avance l horloge d autant */
  e.requete = () => new Promise((ok) => {
    const r = { code: null, corps: null, t0: Date.now() };
    route('/api/veille', { writeHead: (c) => { r.code = c; }, end: (b) => { r.corps = JSON.parse(b); r.ms = Date.now() - r.t0; ok(r); } },
      e.S.enFond, e.S.repondreFond, e.S.veilleUneFois, e.S.VEILLE_TTL_MS, e.S.VEILLE_DEPUIS, budget, veiller, rpcServeur, D);
  });
  return e;
}

/* ── A. une marche partagee, servie avec son age ─────────────────────────────────────────────────── */
await cas('A1 trois requetes simultanees puis deux autres dans le delai : UNE seule marche, le resultat et son age', async () => {
  const e = monter();
  const tous = await Promise.all([e.requete(), e.requete(), e.requete()]);
  e.horloge.t += 60_000;
  tous.push(await e.requete(), await e.requete());
  assert.equal(e.marches.length, 1, 'marches lancees pour 5 requetes : ' + e.marches.length);
  for (const r of tous) { assert.equal(r.code, 200); assert.equal(r.corps.complet, true); assert.equal(typeof r.corps.ageS, 'number', 'resultat servi sans son age'); }
  assert.equal(tous[4].corps.ageS, 60, 'l age servi ne suit pas l horloge');
});
await cas('A2 une marche longue ne tient pas la requete : EN_COURS en moins de 3 s, jamais complet', async () => {
  const e = monter({ ms: 4000 });
  const r = await e.requete();
  assert.ok(r.ms < 3000, 'la route a tenu la requete ' + r.ms + ' ms');
  assert.equal(r.corps.etat, 'EN_COURS');
  assert.equal(r.corps.ok, false);
  assert.equal(r.corps.complet, false, 'une veille en cours se dit complete');
});

/* ── B. budget epuise : pas de marche dans des refus connus d avance ───────────────────────────── */
await cas('B1 budget epuise, rien en cache : AUCUNE marche, etat NOMME, jamais complet (temoin : budget libre -> 1 marche)', async () => {
  const t = monter({ epuise: false });
  await t.requete();
  assert.equal(t.marches.length, 1, 'TEMOIN : le montage ne marche meme pas budget libre — le stimulus n est pas prouve');
  const e = monter({ epuise: true });
  const rs = [await e.requete(), await e.requete(), await e.requete()];
  assert.equal(e.marches.length, 0, 'marches lancees budget epuise : ' + e.marches.length);
  assert.equal(e.rpc.length, 0);
  for (const r of rs) {
    assert.equal(r.corps.ok, false);
    assert.equal(r.corps.complet, false, 'un etat non lu se dit complet');
    assert.match(String(r.corps.pourquoi), /archive node daily budget reached — deep windows unread until 00:00 UTC/);
    assert.equal(r.corps.attendBudgetArchive, true);
  }
});
await cas('B2 budget epuise apres une marche complete, delai passe : le dernier resultat, son age, la raison — sans nouvelle marche', async () => {
  const e = monter();
  await e.requete();
  e.epuise = true; e.horloge.t += e.ttl + 60_000;
  const r = await e.requete();
  assert.equal(e.marches.length, 1, 'une marche relancee budget epuise');
  assert.equal(r.corps.complet, true, 'le dernier resultat complet n est plus servi');
  assert.equal(r.corps.tete, COMPLET.tete);
  assert.ok(r.corps.ageS >= e.ttl / 1000, 'age servi : ' + r.corps.ageS);
  assert.match(String(r.corps.derniereErreur), /archive node daily budget reached/, 'la raison n est pas dite a cote du resultat perime');
});
await cas('B3 budget epuise, dernier resultat TROUE : servi troue, jamais promu complet', async () => {
  const e = monter({ reponses: [TROUE] });
  await e.requete();
  e.epuise = true; e.horloge.t += e.ttl + 60_000;
  const r = await e.requete();
  assert.equal(e.marches.length, 1);
  assert.equal(r.corps.complet, false);
  assert.equal(r.corps.ratees, 408);
  assert.match(r.corps.borne, /FLOOR, not a verdict/);
  assert.equal(r.corps.alertes.length, 1, 'une alerte lue a ete perdue');
});
await cas('B4 budget revenu (jour suivant), delai passe : la marche reprend, une seule fois', async () => {
  const e = monter({ reponses: [COMPLET, { ...COMPLET, tete: 52400000 }] });
  await e.requete();
  e.epuise = true; e.horloge.t += e.ttl + 60_000;
  await e.requete(); await e.requete();
  e.epuise = false;
  const r = await e.requete();
  await e.requete();
  assert.equal(e.marches.length, 2, 'marches : ' + e.marches.length);
  assert.equal(r.corps.tete, 52400000);
  assert.equal(r.corps.derniereErreur, undefined, 'la raison du budget survit au budget revenu');
});

/* ── C. la forme de la reponse ──────────────────────────────────────────────────────────────────── */
await cas('C1 un BigInt eventuel est rendu en texte, comme le faisait la route', async () => {
  const e = monter({ reponses: [{ ...COMPLET, total: 5n }] });
  const r = await e.requete();
  assert.equal(r.corps.total, '5');
});
await cas('C2 panne de noeud sans resultat : ECHEC et sa cause ; apres un resultat : le resultat reste, la panne dite a cote', async () => {
  const a = monter({ reponses: [new Error('request limit reached')] });
  const ra = await a.requete();
  assert.equal(ra.corps.ok, false); assert.equal(ra.corps.complet, false);
  assert.match(String(ra.corps.pourquoi), /request limit reached/);
  const b = monter({ reponses: [COMPLET, new Error('request limit reached')] });
  await b.requete();
  b.horloge.t += b.ttl + 60_000;
  const rb = await b.requete();
  assert.equal(rb.corps.complet, true, 'une panne a remplace le dernier resultat');
  assert.match(String(rb.corps.derniereErreur), /request limit reached/);
});
await cas('C3 meme pot, meme bloc de depart, et le lecteur passe par rpcServeur comme avant', async () => {
  const e = monter();
  await e.requete();
  assert.equal(e.marches[0].pot, POT);
  assert.equal(e.marches[0].depuis, DEPUIS);
  /* le lecteur donne au veilleur peut etre un garde autour de rpcServeur : il doit LUI transmettre l appel, methode comprise */
  const avant = e.rpc.length;
  await assert.rejects(e.marches[0].rpc('eth_chainId', []), /le faux veilleur ne lit pas la chaine/);
  assert.deepEqual(e.rpc.slice(avant), ['eth_chainId'], 'le lecteur du veilleur ne passe pas par rpcServeur');
});

/* ── D. le cablage ───────────────────────────────────────────────────────────────────────────────── */
await cas('D1 la route passe par le calcul en fond ; plus aucune marche par requete ; delai sous la fenetre de contestation', async () => {
  assert.ok(blocVeille, 'bloc VEILLE_DEPUIS / veilleUneFois absent');
  assert.match(nu, /if \(chemin === '\/api\/veille'\) \{\s+const c = enFond\('veille', veilleUneFois, VEILLE_TTL_MS\);\s+void repondreFond\(res, c,/);
  assert.ok(!/veiller\(\{[^}]*\}\)\s*\.then\(/.test(nu), 'une route marche encore a chaque requete');
  assert.equal((nu.match(/\bveiller\(\{/g) || []).length, 1, 'veiller est appele ailleurs que dans veilleUneFois');
  const ttl = monter().S.VEILLE_TTL_MS;
  assert.ok(ttl >= 3600 * 1000 && ttl < DELAI_CONTESTATION * 1000, 'VEILLE_TTL_MS = ' + ttl);
});

/* ── E. le VRAI veiller : budget epuise EN COURS de marche ──────────────────────────────────────── *
 * tete = DEPUIS + 29 999 : 15 fenetres de 2 000 blocs, dont 10 a plus de PROF (9 000) blocs de la tete et 5 recentes. */
const TETE_E = DEPUIS + 29_999;
const profondes = (tete) => { let k = 0; for (let d = DEPUIS; d <= tete; d += 2000) if (tete - Math.min(d + 1999, tete) > PROF) k++; return k; };
await cas('E0 TEMOIN : budget libre, le vrai veiller lit les 15 fenetres, dont 10 profondes, et lit l alerte CRITIQUE de la periode 7', async () => {
  assert.equal(PROF, 9000, 'la chaine fausse est calibree pour 9 000 ; PROFONDEUR_PUBLICNODE livree = ' + PROF);
  const e = monter({ chaine: { tete: TETE_E, logs: LOGS_CRITIQUE } });
  const r = await e.requete();
  assert.equal(e.fenetres.length, 15);
  assert.equal(e.fenetres.filter((f) => f.profonde).length, 10);
  assert.equal(profondes(TETE_E), 10);
  assert.equal(r.corps.complet, true);
  assert.equal(r.corps.alertes.length, 1);
  assert.equal(r.corps.alertes[0].gravite, 'CRITIQUE');
  assert.equal(r.corps.alertes[0].periode, 7);
});
await cas('E1 budget epuise apres 3 fenetres profondes, PREMIERE marche : coupee, AUCUN refus connu d avance demande, etat NOMME', async () => {
  const e = monter({ chaine: { tete: TETE_E, logs: LOGS_CRITIQUE } });
  e.budgetRestant = 3;
  const r = await e.requete();
  assert.equal(e.refusConnus, 0, 'fenetres profondes demandees budget epuise : ' + e.refusConnus);
  assert.equal(e.fenetres.length, 3, 'la marche continue apres la coupure : ' + e.fenetres.length + ' fenetres demandees');
  assert.equal(r.corps.ok, false);
  assert.equal(r.corps.etat, 'ECHEC');
  assert.equal(r.corps.complet, false, 'une marche coupee se dit complete');
  assert.deepEqual(r.corps.alertes, []);
  assert.match(String(r.corps.pourquoi), /^archive node daily budget reached — deep windows unread until 00:00 UTC \(walk stopped at block (\d+)\)$/);
  assert.equal(Number(/block (\d+)/.exec(r.corps.pourquoi)[1]), DEPUIS + 3 * 2000, 'le bloc de coupure n est pas la 4e fenetre');
  assert.equal(r.corps.attendBudgetArchive, true);
});
await cas('E2 budget epuise en cours de SECONDE marche : coupee, le dernier resultat complet et son alerte CRITIQUE restent servis', async () => {
  const e = monter({ chaine: { tete: TETE_E, logs: LOGS_CRITIQUE } });
  const r1 = await e.requete();
  assert.equal(r1.corps.complet, true);
  e.chaine.tete = TETE_E + 2000; e.horloge.t += e.ttl + 60_000; e.budgetRestant = 3;
  const avant = e.fenetres.length;
  const r = await e.requete();
  assert.equal(e.marches.length, 2, 'TEMOIN : la seconde marche n a pas ete lancee — le stimulus n est pas prouve');
  assert.equal(e.refusConnus, 0, 'fenetres profondes demandees budget epuise : ' + e.refusConnus);
  assert.equal(e.fenetres.length - avant, 3, 'fenetres demandees par la marche coupee : ' + (e.fenetres.length - avant));
  assert.equal(r.corps.complet, true, 'le dernier resultat complet a ete remplace par une marche coupee');
  assert.equal(r.corps.tete, TETE_E, 'la tete servie n est pas celle du dernier resultat complet');
  assert.equal(r.corps.alertes.length, 1, 'l alerte CRITIQUE lue en profondeur a ete effacee');
  assert.equal(r.corps.ageS, Math.round((e.ttl + 60_000) / 1000));
  assert.match(String(r.corps.derniereErreur), /archive node daily budget reached — deep windows unread until 00:00 UTC \(walk stopped at block \d+\)/);
  /* budget toujours epuise : aucune marche, aucun appel */
  const appels = e.rpc.length;
  await e.requete(); await e.requete();
  assert.equal(e.marches.length, 2); assert.equal(e.rpc.length, appels);
});
await cas('E3 budget epuise quand il ne reste que des fenetres RECENTES : rien n est coupe, la marche finit complete', async () => {
  const e = monter({ chaine: { tete: TETE_E, logs: LOGS_CRITIQUE } });
  e.budgetRestant = 10;
  const r = await e.requete();
  assert.equal(e.epuise, true, 'TEMOIN : le budget ne s est pas epuise pendant la marche — le stimulus n est pas prouve');
  assert.equal(e.fenetres.length, 15, 'des fenetres recentes (gratuites) n ont pas ete lues : ' + e.fenetres.length);
  assert.equal(e.refusConnus, 0);
  assert.equal(r.corps.complet, true);
  assert.equal(r.corps.ratees, 0);
  assert.equal(r.corps.derniereErreur, undefined);
  assert.equal(r.corps.alertes.length, 1);
});

console.log(n + ' cas, ' + ko + ' KO' + (ko ? '' : ' — /api/veille marche une fois pour tous, et pas dans un budget epuise'));
process.exit(ko ? 1 : 0);
