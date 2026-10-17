/* test-buy-tiers-20261017.mjs — Market : « Buy » seulement la ou un achat est REEL (cle connue du serveur + devis du vrai Quoter).
 *
 * ⛔ MESURE (prod, 2026-10-17 17:12Z, 244 lignes de /api/trending) : 159 lignes sans Buy ; sur les 33 lignes qui AVAIENT Buy par la
 *   decouverte client (Initialize des 9 000 derniers blocs), 28 portaient une pool a hook tiers que le Quoter v4 REFUSE de coter
 *   (revert 0x6190b2b0) : un Buy qui ouvrait une fiche NON_MESURE. 13 lignes sans Buy avaient une pool ETH sur le hook o1 Standard
 *   (0x1f91…2acc) qui cote, 3 une pool ETH sans hook (0,25 %) qui cote. Le Buy de Market suit maintenant un VERDICT SERVEUR
 *   (achat-marche.js) : cle deja connue du serveur (/api/cle, jamais un balayage neuf), filtres du planificateur, devis reel.
 * EXECUTE achat-marche.js (quoter simule, aucun reseau), echange.js planEchange (trou (c) : piege LP > 10 % recu par marcheLu /
 *   cleImposee), puis verifie le CABLAGE serveur et app.
 * ⛔ BORNE : le frais a l arrivee et l achat execute sont prouves par banc-buy-tiers-fork-20261017.mjs (fork, soldes lus). */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href);
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const fin = () => { console.log((ko ? 'FAIL' : 'ok') + ' buy-tiers - ' + n + ' assertions, ' + ko + ' KO'); process.exit(ko ? 1 : 0); };
let A = null;
try { A = await imp('achat-marche.js'); } catch (e) { console.log('KO  achat-marche.js absent : ' + e.message); ko += 1; n += 1; }
const E = await imp('echange.js');
const T = await imp('tokenomics.js');
const { chargerIndexRouteur, chargerNosBlocksTb, sourcesTbLues, GRAINE_ROUTEUR } = await imp('index-routeur.js');

const ETH = '0x0000000000000000000000000000000000000000';
/* adresses REELLES lues sur la chaine le 2026-10-17 (Initialize du PoolManager), jamais tapees de memoire */
const NGMI = '0xb200000000000000000000ffc0c7a12fb75e3301';
const TOPE = '0xb2000000000000000000000a03cd7220becec781';
const MM = '0x4fc59c42653e052c7ab5c8381f839e2d70504131';
const HO1 = '0x1f91c998e7c2f4b690d75bdbf6502bdcd6e02acc';
const HTOPE = '0x0458e5256a20ac2f8abddba11fa4d00f3fa800cc';
const HMM = '0x9c92347349b34f1a58c617ca8f2929f4b11128c0';
const cle = (c0, c1, fee, ts, hooks) => ({ currency0: c0, currency1: c1, fee, tickSpacing: ts, hooks });
const K_O1 = cle(ETH, NGMI, 0, 200, HO1);
const K_PIEGE = cle(ETH, NGMI, 893690, 200, ETH);      /* 89,369 % de frais LP statique : un piege, pas un marche */
const K_PIEGE2 = cle(ETH, NGMI, 884753, 9303, ETH);
const K_TOPE = cle(ETH, TOPE, 100, 1, HTOPE);
const K_MM = cle(MM, TOPE, 0, 1, HMM);                  /* cotee en mmETH : pas une pool ETH */
const K_SANS = cle(ETH, '0xb2000000000000000000001cb153a0101e7fa378', 2500, 25, ETH); /* PAX : sans hook, 0,25 % */
const K_V8 = cle(ETH, NGMI, 0, 200, T.HOOK_V8);
/* quoter simule : rend le devis de la table pour la cle (hooks + fee + tickSpacing), `null` = revert ; compte ses appels */
const quoter = (table) => {
  const appels = [];
  const f = async (c, montant) => {
    appels.push({ hooks: String(c.hooks).toLowerCase(), fee: Number(c.fee), montant });
    for (const [k, q] of table) {
      if (String(k.hooks).toLowerCase() === String(c.hooks).toLowerCase() && Number(k.fee) === Number(c.fee) && Number(k.tickSpacing) === Number(c.tickSpacing)) {
        if (q === null) throw new Error('execution reverted: custom error 0x6190b2b0');
        return BigInt(q);
      }
    }
    throw new Error('execution reverted');
  };
  f.appels = appels;
  return f;
};
/* les sources TB « lues » (comme le serveur les charge avant de juger) : un index routeur complet et a jour, une liste nos-blocks complete */
const maintenant = Date.now();
chargerIndexRouteur({ ok: true, blocks: GRAINE_ROUTEUR.map((g) => ({ jeton: g.jeton, sel: g.sel })), tete: 60000000, jusqua: 60000000, teteLueA: maintenant, couvertureComplete: true, fenetresRatees: 0 }, maintenant);
chargerNosBlocksTb({ ok: true, blocks: ['0xb2000000000000000000000000000000000000aa'], tete: 60000000, jusqua: 60000000, teteLueA: maintenant, couvertureComplete: true, fenetresRatees: 0 }, maintenant);
ok(sourcesTbLues() === true, 'les sources TB sont LUES dans ce test (sinon tout B20 inconnu est un block : les cas tiers ne seraient pas testes)');

if (A) {
  ok(typeof A.verdictAchatMarche === 'function' && typeof A.quoterV4 === 'function' && typeof A.MONTANT_SONDE_WEI === 'bigint', 'achat-marche.js exporte verdictAchatMarche, quoterV4, MONTANT_SONDE_WEI');
  ok(A.MONTANT_SONDE_WEI === 10n ** 15n, 'la sonde cote 0,001 ETH (' + A.MONTANT_SONDE_WEI + ' wei)');
  /* 1. la pool o1 qui cote -> Buy reel, frais pris par le routeur (le hook o1 ne verse pas a6cf) */
  const q1 = quoter([[K_O1, 606763098665537499512532n]]);
  const r1 = await A.verdictAchatMarche({ jeton: NGMI, cles: [K_O1, K_PIEGE, K_PIEGE2], quoter: q1 });
  ok(r1.achetable === true && r1.cle && String(r1.cle.hooks).toLowerCase() === HO1 && r1.quote === 606763098665537499512532n, '1. NGMI : la pool o1 cote -> achetable sur ELLE (' + JSON.stringify({ a: r1.achetable, h: r1.cle && r1.cle.hooks, q: String(r1.quote) }) + ')');
  ok(r1.fraisPar === 'routeur', '1. le frais de 0,5 % sera pris par le routeur (hook o1 hors liste des payeurs) : ' + r1.fraisPar);
  ok(r1.montant === 10n ** 15n && q1.appels.length === 1 && q1.appels[0].montant === 10n ** 15n, '1. UN devis, au montant de la sonde (' + q1.appels.length + ' appel(s))');
  ok(Array.isArray(r1.ecartees) && r1.ecartees.length === 2 && r1.ecartees.every((e) => /LP fee/.test(e.pourquoi)), '1. les deux pieges a 88-89 % sont ecartes ET nommes : ' + JSON.stringify(r1.ecartees.map((e) => e.pourquoi)));
  ok(!q1.appels.some((a) => a.fee > 100000), '1. un piege n est JAMAIS envoye au quoter');
  /* 2. seulement des pieges -> pas de Buy, et le quoter n est pas appele */
  const q2 = quoter([[K_PIEGE, 1n]]);
  const r2 = await A.verdictAchatMarche({ jeton: NGMI, cles: [K_PIEGE, K_PIEGE2], quoter: q2 });
  ok(r2.achetable === false && /LP fee/.test(r2.pourquoi) && q2.appels.length === 0, '2. que des pieges : pas achetable, 0 devis (' + r2.pourquoi + ')');
  /* 3. Tope : la pool ETH a hook tiers REVERT au quoter, la pool mmETH n est pas une pool ETH -> pas de Buy */
  const q3 = quoter([[K_TOPE, null], [K_MM, 5n]]);
  const r3 = await A.verdictAchatMarche({ jeton: TOPE, cles: [K_TOPE, K_MM], quoter: q3 });
  ok(r3.achetable === false && /none quoted/.test(r3.pourquoi), '3. Tope : la pool ETH ne cote pas -> pas achetable (' + r3.pourquoi + ')');
  ok(q3.appels.length === 1 && q3.appels[0].hooks === HTOPE, '3. UN devis essaye (la pool ETH), la pool mmETH jamais envoyee au quoter');
  ok(r3.ecartees.some((e) => /not an ETH pool|not quoted in ETH/.test(e.pourquoi)), '3. la pool mmETH est ecartee ET nommee : ' + JSON.stringify(r3.ecartees.map((e) => e.pourquoi)));
  ok(Array.isArray(r3.nonCotees) && r3.nonCotees.length === 1 && /0x6190b2b0/.test(r3.nonCotees[0].raison), '3. le revert est DIT, avec son selecteur : ' + JSON.stringify(r3.nonCotees));
  /* 4. un devis a zero n est pas un marche */
  const r4 = await A.verdictAchatMarche({ jeton: NGMI, cles: [K_O1], quoter: quoter([[K_O1, 0n]]) });
  ok(r4.achetable === false, '4. devis 0 : pas achetable (' + r4.pourquoi + ')');
  /* 5. aucune cle connue -> pas de Buy, rien n est balaye ni devine */
  const q5 = quoter([[K_O1, 1n]]);
  const r5 = await A.verdictAchatMarche({ jeton: NGMI, cles: [], quoter: q5 });
  ok(r5.achetable === false && /no pool key known/.test(r5.pourquoi) && q5.appels.length === 0, '5. sans cle connue : pas achetable, 0 devis (' + r5.pourquoi + ')');
  /* 6. sans hook (PAX, 0,25 %) : admis pour un jeton TIERS, frais par le routeur */
  const r6 = await A.verdictAchatMarche({ jeton: K_SANS.currency1, cles: [K_SANS], quoter: quoter([[K_SANS, 3406987401202992902169n]]) });
  ok(r6.achetable === true && r6.fraisPar === 'routeur', '6. PAX sans hook 0,25 % : achetable, frais routeur (' + r6.achetable + ', ' + r6.fraisPar + ')');
  /* 7. REGLE DU FONDATEUR : un block qui a une pool sur NOTRE hook est TB -> sa pool a hook tiers (hors o1 referent) est ecartee, la notre reste */
  const K_TIERS_NGMI = cle(ETH, NGMI, 100, 1, HTOPE);
  const q7 = quoter([[K_TIERS_NGMI, 999n], [K_V8, 100n]]);
  const r7 = await A.verdictAchatMarche({ jeton: NGMI, cles: [K_TIERS_NGMI, K_V8], quoter: q7 });
  ok(r7.achetable === true && String(r7.cle.hooks).toLowerCase() === T.HOOK_V8.toLowerCase() && r7.fraisPar === 'hook', '7. block TB (pool V8 dans ses cles) : la pool a hook tiers est ecartee, la V8 achetee, frais par le hook (' + (r7.cle && r7.cle.hooks) + ', ' + r7.fraisPar + ')');
  ok(r7.ecartees.some((e) => /third-party hook/.test(e.pourquoi)) && !q7.appels.some((a) => a.hooks === HTOPE), '7. la pool tierce est nommee et jamais cotee : ' + JSON.stringify(r7.ecartees.map((e) => e.pourquoi)));
  /* 7 bis. la pool a hook tiers SEULE, sans pool TB en contexte : Tope-like TIERS -> admise (regle R10, sources lues) — ce que la mesure
   *   prod montre, c est qu elle ne COTE pas ; le devis decide, pas la liste */
  const r7b = await A.verdictAchatMarche({ jeton: TOPE, cles: [K_TOPE], quoter: quoter([[K_TOPE, 42n]]) });
  ok(r7b.achetable === true && r7b.fraisPar === 'routeur', '7 bis. hook tiers seul sur un jeton TIERS : admis SI il cote (ici devis simule 42) : ' + r7b.achetable);
  /* 8. un quoter qui leve pour une raison reseau : NON mesure, pas « pas de marche » */
  const r8 = await A.verdictAchatMarche({ jeton: NGMI, cles: [K_O1], quoter: async () => { const e = new Error('fetch failed'); throw e; } });
  ok(r8.achetable === false && r8.nonCotees.length === 1, '8. lecture ratee : pas achetable, la cause est gardee (' + JSON.stringify(r8.nonCotees) + ')');
  /* 9. plusieurs pools ETH qui cotent : la meilleure gagne */
  const K_O1b = cle(ETH, NGMI, 100, 1, HO1);
  const r9 = await A.verdictAchatMarche({ jeton: NGMI, cles: [K_O1b, K_O1], quoter: quoter([[K_O1b, 50n], [K_O1, 70n]]) });
  ok(r9.achetable === true && r9.quote === 70n && Number(r9.cle.fee) === 0, '9. deux pools cotent : la meilleure (70 > 50) est retenue');
}

/* ── trou (c) : planEchange recoit une cle PIEGE par marcheLu / cleImposee ─────────────────────────────────────────────── */
const rpcMuet = async () => { throw new Error('no network in this test'); };
const base = { rpc: rpcMuet, chaine: 8453, jeton: NGMI, compte: '0x00000000000000000000000000000000000b10c5', sens: 'ACHAT', montant: 10n ** 15n };
const pc1 = await E.planEchange({ ...base, cleImposee: K_PIEGE });
ok(pc1.etat === 'REFUSE' && pc1.refusPiegeLp === true && /LP fee/.test(pc1.pourquoi || ''), '(c) cleImposee piege 89 % : REFUSE avant tout devis (' + pc1.etat + ' : ' + pc1.pourquoi + ')');
const pc2 = await E.planEchange({ ...base, marcheLu: { etat: 'LUE', cle: K_PIEGE2, paire: 'ETH' } });
ok(pc2.etat === 'REFUSE' && pc2.refusPiegeLp === true, '(c) marcheLu piege 88 % : REFUSE (' + pc2.etat + ' : ' + pc2.pourquoi + ')');
const pc3 = await E.planEchange({ ...base, cleImposee: K_O1 });
ok(pc3.refusPiegeLp !== true, '(c) une cle saine (o1, 0 %) n est pas refusee comme piege (' + pc3.etat + ' : ' + String(pc3.pourquoi || '').slice(0, 60) + ')');
const pc4 = await E.planEchange({ ...base, cleImposee: cle(ETH, NGMI, 0x800000, 60, HO1) });
ok(pc4.refusPiegeLp !== true, '(c) le frais DYNAMIQUE (0x800000) n est pas un piege (' + pc4.etat + ')');

/* ── cablage ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const srv = fs.readFileSync(path.join(ICI, 'serveur-web.js'), 'utf8');
const app = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8');
ok(/import \{[^}]*verdictAchatMarche[^}]*\} from '\.\/achat-marche\.js'/.test(srv), 'serveur : importe verdictAchatMarche');
ok(/achat: /.test(srv) && /verdictAchatMarche\(\{/.test(srv), 'serveur : chaque ligne de trending recoit `achat` (verdictAchatMarche)');
ok(/champsLigne = \['emetteur', 'quoteAdr', 'achat'\]/.test(srv), 'serveur : `achat` est dans la garde de forme du cache disque');
const iF = app.indexOf('const feeOk = ');
const ligneFeeOk = iF > 0 ? app.slice(iF, app.indexOf('\n', iF)) : '';
ok(iF > 0 && !/'HOOK'|'SANS_HOOK'/.test(ligneFeeOk), 'app : le Buy par decouverte client ne couvre plus les pools tierces (28/33 ne cotaient pas) : ' + ligneFeeOk.trim().slice(0, 120));
ok(/l\.achat && l\.achat\.cle/.test(app), 'app : le Buy serveur (`l.achat`) rend le bouton Buy');
fin();
