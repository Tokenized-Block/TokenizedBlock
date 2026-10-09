/* test-etat-paires-20261004.mjs — L ETAT DES DEVISES DE PAIRE DE CREATE : etat-paires.js + GET /api/paires/etat + le grise de app.html.
 *
 * A. LE MODULE, HORS RESEAU (faux noeud en memoire, horloge injectee) : les trois etats ; une lecture ratee ne devient JAMAIS
 *    « not_born » (noeud qui jette, `0x`, mot tronque, delai depasse, zero non confirme, zero sans temoin) ; le cache (5 min),
 *    la reprise apres une passe incomplete (2 min), une seule passe a la fois ; le dernier verdict mesure garde avec SON heure
 *    puis rendu « non lu » passe 30 min ; les bornes COMPTEES (lectures par passe, lectures en vol, coupure apres 3 echecs).
 * B. L ECRAN (app.html) : `paireGrisee`, `lireEtatsPaires` et la fabrique d option `opt` sont EXTRAITES du fichier servi et jouees
 *    avec un faux `fetch` : seul « not_born » grise ; « not_read », une requete ratee, `ok:false`, hors mainnet et le natif
 *    laissent l option A L OCTET PRES comme avant.
 * C. LE SERVEUR : la route, la liste servie, puis le VRAI serveur-web.js lance contre un faux noeud local — 62 devises rendues,
 *    les zeros du faux noeud en « not_born », la lecture refusee en « not_read », le 2e appel sans aucune lecture, POST = 405.
 * D. MUTANTS : chaque garde retiree doit faire rougir A ou B (dont : lecture ratee -> zero, temoin retire, zero non relu,
 *    age ignore, l ecran qui grise sur « not_read »).
 * ⛔ CE QUE CE TEST NE PROUVE PAS : que les noeuds publics repondent depuis la production (aucun vrai noeud ici) ; que l option
 *   grisee s affiche bien dans un navigateur (les fonctions sont jouees hors DOM) ; qu une devise « born » a un marche ou un
 *   prix — le verdict ne lit que `totalSupply()`, et le dit.
 * ⛔ PORTABLE : process.exitCode, jamais process.exit. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f, dir = ICI) => import(pathToFileURL(path.join(dir, f)).href + '?v=' + Math.random());
const lire = (f) => fs.readFileSync(path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const M0 = await imp('etat-paires.js');
const P = await imp('paires.js');
const K = await imp('keccak.js');
const SEL = K.selecteur('totalSupply()');

/* ── adresses de BANC (fabriquees ici, elles ne designent rien) et mots de 32 octets ── */
const ADR_ZERO = '0x' + '0'.repeat(40);
const A = (i) => '0xb2' + (0xa000 + i).toString(16).padStart(38, '0');
const MOT = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
const ZERO = MOT(0);
const T0 = 1800000000000;

/** Un faux noeud en memoire : `table[adresse]` = une valeur, 'THROW', 'HANG', ou une fonction du numero d appel pour CETTE adresse. */
function fauxNoeud(table) {
  const e = { lectures: 0, enVol: 0, maxEnVol: 0, parAdr: new Map(), methodes: new Set(), datas: new Set() };
  const rpc = async (methode, params) => {
    const c = params[0];
    e.lectures += 1; e.methodes.add(methode); e.datas.add(c.data);
    const k = (e.parAdr.get(c.to) || 0) + 1; e.parAdr.set(c.to, k);
    e.enVol += 1; e.maxEnVol = Math.max(e.maxEnVol, e.enVol);
    try {
      await dormir(2);
      let v = table[c.to]; if (typeof v === 'function') v = v(k);
      if (v === 'THROW') throw new Error('over rate limit');
      if (v === 'HANG') return await new Promise(() => {});
      return v;
    } finally { e.enVol -= 1; }
  };
  return { rpc, e };
}
/** Attend la fin de la passe en cours (plafonne : un mutant qui pend ne doit pas pendre le banc). */
async function auBout(E, capMs = 2500) {
  const fin = Date.now() + capMs;
  let r = await E.lire();
  while (r.enCours && Date.now() < fin) { await dormir(5); r = E.instantane(); }
  return r;
}
const parSym = (r) => Object.fromEntries((r.paires || []).map((p) => [p.symbole, p]));
const dev = (i, symbole, type = 'ACTION') => ({ adr: A(i), symbole, nom: symbole + ' Inc', type });

/* ════ LE JEU DU MODULE : rejoue tel quel sur chaque mutant. `noter(condition, nom)`. ════ */
async function jeuModule(M, noter) {
  const horloge = { t: T0 };
  const maintenant = () => horloge.t;

  /* ── 1. les trois etats ── */
  {
    const L = [{ adr: ADR_ZERO, symbole: 'ETH', nom: 'Ether', type: 'NATIF' }, dev(1, 'VIVA'), dev(2, 'VIVB', 'STABLE'), dev(3, 'VIDE'), dev(4, 'PANNE'),
      dev(5, 'MUET'), dev(6, 'COURT'), dev(7, 'OBJET'), dev(8, 'PENDU'), dev(9, 'ZPUISV'), dev(10, 'ZPUISPANNE')];
    const { rpc, e } = fauxNoeud({ [A(1)]: MOT(5), [A(2)]: MOT(10n ** 20n), [A(3)]: ZERO, [A(4)]: 'THROW', [A(5)]: '0x', [A(6)]: '0x00', [A(7)]: null,
      [A(8)]: 'HANG', [A(9)]: (k) => (k === 1 ? ZERO : MOT(7)), [A(10)]: (k) => (k === 1 ? ZERO : 'THROW') });
    const E = M.creerEtatPaires({ rpc, paires: () => L, maintenant, delaiLectureMs: 60, attenteFroideMs: 20, echecsDeSuiteMax: 99 });
    const r = await auBout(E), s = parSym(r);
    noter(r.ok === true && r.enCours === false && r.paires.length === 10 && !('ETH' in s), '1 la passe se termine ; 10 devises rendues, ETH (natif) n y est pas');
    noter(!!s.VIVA && s.VIVA.etat === 'born' && s.VIVA.supply === '5' && !!s.VIVB && s.VIVB.etat === 'born' && s.VIVB.supply === (10n ** 20n).toString(),
      '1 supply lue > 0 : born, la supply rendue en unites brutes');
    noter(!!s.VIDE && s.VIDE.etat === 'not_born' && s.VIDE.supply === '0' && s.VIDE.lu === new Date(T0).toISOString() && e.parAdr.get(A(3)) === 2,
      '1 zero lu DEUX fois, avec un temoin : not_born, avec l heure de la lecture');
    noter(!!s.PANNE && s.PANNE.etat === 'not_read' && s.PANNE.lu === null && s.PANNE.supply === null && /rate limit/.test(String(s.PANNE.pourquoi)),
      '1 le noeud jette : not_read (jamais not_born), et la raison est rendue');
    noter(!!s.MUET && s.MUET.etat === 'not_read', '1 le noeud rend « 0x » : not_read');
    noter(!!s.COURT && s.COURT.etat === 'not_read' && /32-byte/.test(String(s.COURT.pourquoi)), '1 le noeud rend « 0x00 » (pas un mot de 32 octets) : not_read, pas un zero');
    noter(!!s.OBJET && s.OBJET.etat === 'not_read', '1 le noeud rend null : not_read');
    noter(!!s.PENDU && s.PENDU.etat === 'not_read' && /no answer within/.test(String(s.PENDU.pourquoi)), '1 le noeud ne repond pas : not_read apres le delai');
    noter(!!s.ZPUISV && s.ZPUISV.etat === 'not_read' && /disagree/.test(String(s.ZPUISV.pourquoi)) && e.parAdr.get(A(9)) === 2,
      '1 zero puis des unites a la relecture : not_read (deux lectures qui se contredisent)');
    noter(!!s.ZPUISPANNE && s.ZPUISPANNE.etat === 'not_read' && /not confirmed/.test(String(s.ZPUISPANNE.pourquoi)), '1 zero puis relecture ratee : not_read (zero non confirme)');
    noter(r.compte && r.compte.born === 2 && r.compte.not_born === 1 && r.compte.not_read === 7 && r.complet === false && r.lu === new Date(T0).toISOString(),
      '1 les compteurs : 2 born, 1 not_born, 7 not_read ; complet = false');
    noter(e.lectures === 13 && [...e.methodes].join() === 'eth_call' && [...e.datas].join() === SEL,
      '1 13 lectures (10 devises + 3 zeros relus), toutes `eth_call totalSupply()` — rien d autre n est demande au noeud (' + e.lectures + ')');
    noter(typeof r.borne === 'string' && /never a verdict/.test(r.borne) && /does NOT say/.test(r.borne), '1 la reponse porte sa borne : ce que born ne dit pas');
  }

  /* ── 2. une lecture ratee ne devient jamais not_born ── */
  for (const [nom, valeur] of [['le noeud jette a tout', 'THROW'], ['le noeud rend « 0x » a tout', '0x'], ['le noeud ne repond a rien', 'HANG']]) {
    const L = Array.from({ length: 6 }, (_, i) => dev(20 + i, 'D' + i));
    const { rpc } = fauxNoeud(Object.fromEntries(L.map((p) => [p.adr, valeur])));
    const E = M.creerEtatPaires({ rpc, paires: () => L, maintenant, delaiLectureMs: 40, attenteFroideMs: 20 });
    const r = await auBout(E);
    noter(r.enCours === false && r.paires.length === 6 && r.paires.every((p) => p.etat === 'not_read') && r.compte.not_born === 0,
      '2 ' + nom + ' : 6 not_read, 0 not_born');
  }
  {
    /* le noeud qui rend ZERO A TOUT (le faux noeud de test-rails-api, ou un relais casse) : aucun temoin, donc aucun verdict */
    const L = Array.from({ length: 6 }, (_, i) => dev(30 + i, 'Z' + i));
    const { rpc, e } = fauxNoeud(Object.fromEntries(L.map((p) => [p.adr, ZERO])));
    const E = M.creerEtatPaires({ rpc, paires: () => L, maintenant });
    const r = await auBout(E);
    noter(r.paires.every((p) => p.etat === 'not_read') && r.compte.not_born === 0, '2 le noeud rend zero a TOUT (aucun temoin) : 6 not_read, 0 not_born');
    noter(r.paires.every((p) => /not trusted/.test(String(p.pourquoi))), '2 … et la raison dit que le lecteur n est pas cru, pas que la relecture a manque');
    noter(e.lectures === 6, '2 … sans temoin, les zeros ne sont meme pas relus : 6 lectures (' + e.lectures + ')');
  }
  {
    /* le temoin doit etre DU MEME GENRE : un noeud qui lit un contrat ordinaire et rend zero a tous les B20 (`0xb2…`) ne prouve rien sur eux */
    const ORD = (i) => '0xa1' + (0xc000 + i).toString(16).padStart(38, '0');
    const L = [{ adr: ORD(1), symbole: 'ORDVIV', type: 'STABLE' }, dev(36, 'B20VIDE1'), dev(37, 'B20VIDE2')];
    const { rpc, e } = fauxNoeud({ [ORD(1)]: MOT(1000), [A(36)]: ZERO, [A(37)]: ZERO });
    const s = parSym(await auBout(M.creerEtatPaires({ rpc, paires: () => L, maintenant })));
    noter(s.ORDVIV.etat === 'born' && s.B20VIDE1.etat === 'not_read' && s.B20VIDE2.etat === 'not_read' && /same kind/.test(String(s.B20VIDE1.pourquoi)) && e.lectures === 3,
      '2 seul un contrat ordinaire est lu avec des unites, tous les B20 a zero : les B20 restent not_read (le temoin n est pas du meme genre), 3 lectures');
    const L2 = [{ adr: ORD(2), symbole: 'ORDVIDE', type: 'STABLE' }, dev(38, 'B20VIV'), dev(39, 'B20VIDE')];
    const n2 = fauxNoeud({ [ORD(2)]: ZERO, [A(38)]: MOT(7), [A(39)]: ZERO });
    const s2 = parSym(await auBout(M.creerEtatPaires({ rpc: n2.rpc, paires: () => L2, maintenant })));
    noter(s2.B20VIV.etat === 'born' && s2.B20VIDE.etat === 'not_born' && s2.ORDVIDE.etat === 'not_read' && n2.e.lectures === 4,
      '2 … et dans l autre sens : le B20 a zero a son temoin B20 (not_born), le contrat ordinaire a zero n en a pas (not_read) — 4 lectures');
  }

  /* ── 3. le cache, la reprise, une seule passe a la fois ── */
  {
    horloge.t = T0;
    const L = [dev(40, 'VIVA'), dev(41, 'VIVB'), dev(42, 'VIDE')];
    const { rpc, e } = fauxNoeud({ [A(40)]: MOT(1), [A(41)]: MOT(2), [A(42)]: ZERO });
    const E = M.creerEtatPaires({ rpc, paires: () => L, maintenant });
    const [ra, rb] = await Promise.all([E.lire(), E.lire()]);
    noter(e.lectures === 4 && ra.complet === true && rb.complet === true, '3 deux appels en meme temps : UNE passe (4 lectures : 3 devises + 1 zero relu), pas deux (' + e.lectures + ')');
    horloge.t = T0 + M.TTL_MS - 1;
    const r2 = await E.lire();
    await dormir(20);
    noter(e.lectures === 4 && r2.enCours === false && r2.lu === new Date(T0).toISOString(), '3 avant 5 min : servi de la memoire, AUCUNE lecture (' + e.lectures + ')');
    horloge.t = T0 + M.TTL_MS;
    const r3 = await E.lire();
    noter(r3.enCours === true && r3.lu === new Date(T0).toISOString() && r3.complet === true, '3 a 5 min : l etat en memoire part tout de suite, la passe tourne derriere');
    const r4 = await auBout(E);
    noter(e.lectures === 8 && r4.lu === new Date(T0 + M.TTL_MS).toISOString(), '3 … et la passe relit tout une fois (8 lectures au total, ' + e.lectures + ')');
  }
  {
    horloge.t = T0;
    const L = [dev(45, 'VIVA'), dev(46, 'PANNE')];
    const { rpc, e } = fauxNoeud({ [A(45)]: MOT(1), [A(46)]: 'THROW' });
    const E = M.creerEtatPaires({ rpc, paires: () => L, maintenant });
    await auBout(E);
    horloge.t = T0 + M.REPRISE_MS - 1;
    await E.lire(); await dormir(20);
    noter(e.lectures === 2, '3 passe incomplete : pas de nouvelle passe avant 2 min (' + e.lectures + ' lectures)');
    horloge.t = T0 + M.REPRISE_MS;
    await auBout(E);
    noter(e.lectures === 4, '3 … et a 2 min elle est retentee, sans attendre les 5 min (' + e.lectures + ')');
  }

  /* ── 4. le dernier verdict MESURE reste, avec SON heure ; passe 30 min sans relecture il redevient « non lu » ── */
  {
    horloge.t = T0;
    const L = [dev(50, 'VIVA'), dev(51, 'VIVB'), dev(52, 'VIDE')];
    const table = { [A(50)]: MOT(1), [A(51)]: MOT(9), [A(52)]: ZERO };
    const { rpc } = fauxNoeud(table);
    const E = M.creerEtatPaires({ rpc, paires: () => L, maintenant });
    await auBout(E);
    table[A(51)] = 'THROW'; table[A(52)] = 'THROW';
    horloge.t = T0 + M.TTL_MS;
    const s2 = parSym(await auBout(E));
    noter(s2.VIDE.etat === 'not_born' && s2.VIDE.lu === new Date(T0).toISOString() && /kept from the reading/.test(String(s2.VIDE.pourquoi)),
      '4 la relecture rate : le verdict mesure RESTE (not_born), avec l heure de SA lecture, et la reponse dit que la relecture a rate');
    noter(s2.VIVB.etat === 'born' && s2.VIVB.lu === new Date(T0).toISOString(), '4 … pareil pour un born : garde, a son heure d origine');
    horloge.t = T0 + M.AGE_MAX_MS;
    noter(parSym(E.instantane()).VIDE.etat === 'not_born', '4 a 30 min pile : encore rendu');
    horloge.t = T0 + M.AGE_MAX_MS + 1;
    const s3 = parSym(E.instantane());
    noter(s3.VIDE.etat === 'not_read' && s3.VIDE.lu === null && s3.VIVB.etat === 'not_read' && !!s3.VIDE.pourquoi,
      '4 passe 30 min sans relecture reussie : not_read — une mesure trop vieille n en est plus une');
    table[A(52)] = MOT(3);
    horloge.t += M.REPRISE_MS;
    noter(parSym(await auBout(E)).VIDE.etat === 'born', '4 la devise recoit des unites : born a la passe suivante (elle se rouvre seule)');
    table[A(51)] = ZERO;
    horloge.t += M.REPRISE_MS;
    noter(parSym(await auBout(E)).VIVB.etat === 'not_born', '4 et l inverse : une devise born relue a zero (deux fois, avec temoin) devient not_born');
  }

  /* ── 5. les bornes, COMPTEES ── */
  {
    horloge.t = T0;
    const L = Array.from({ length: 20 }, (_, i) => dev(60 + i, 'B' + i));
    const { rpc, e } = fauxNoeud(Object.fromEntries(L.map((p, i) => [p.adr, i % 2 ? ZERO : MOT(i + 1)])));
    const E = M.creerEtatPaires({ rpc, paires: () => L, maintenant });
    const r = await auBout(E);
    noter(r.compte.born === 10 && r.compte.not_born === 10 && e.lectures === 30, '5 passe saine sur 20 devises dont 10 a zero : 30 lectures (20 + 10 relues), pas une de plus (' + e.lectures + ')');
    noter(e.maxEnVol === M.EN_VOL_MAX, '5 jamais plus de ' + M.EN_VOL_MAX + ' lectures en vol (mesure : ' + e.maxEnVol + ')');
  }
  {
    const L = Array.from({ length: 20 }, (_, i) => dev(90 + i, 'C' + i));
    const { rpc, e } = fauxNoeud(Object.fromEntries(L.map((p) => [p.adr, 'THROW'])));
    const E = M.creerEtatPaires({ rpc, paires: () => L, maintenant });
    const r = await auBout(E);
    const plafond = M.ECHECS_DE_SUITE_MAX + M.EN_VOL_MAX - 1;
    noter(e.lectures >= M.ECHECS_DE_SUITE_MAX && e.lectures <= plafond && r.paires.every((p) => p.etat === 'not_read'),
      '5 le noeud refuse tout : la passe se COUPE apres ' + M.ECHECS_DE_SUITE_MAX + ' echecs d affilee — ' + e.lectures + ' lectures sur 20 (plafond ' + plafond + ')');
    noter(r.paires.some((p) => /not tried/.test(String(p.pourquoi))) && E.resume().passesCoupees === 1, '5 … les devises non essayees le disent, et la coupure est comptee');
  }

  /* ── 6. le premier appel n attend pas un noeud lent ── */
  {
    const L = Array.from({ length: 6 }, (_, i) => dev(120 + i, 'H' + i));
    const { rpc } = fauxNoeud(Object.fromEntries(L.map((p) => [p.adr, 'HANG'])));
    const E = M.creerEtatPaires({ rpc, paires: () => L, maintenant, delaiLectureMs: 500, attenteFroideMs: 30 });
    const debut = Date.now();
    const r = await Promise.race([E.lire(), dormir(300).then(() => null)]);
    const duree = Date.now() - debut;
    noter(!!r && r.ok === true && r.enCours === true && r.lu === null && r.paires.every((p) => p.etat === 'not_read' && p.pourquoi === 'not read yet'),
      '6 rien en memoire et un noeud qui pend : la reponse part quand meme (' + duree + ' ms), tout en not_read, enCours = true');
    await auBout(E, 1500);
  }

  /* ── 7. la regle de l ecran ── */
  {
    const t = T0 + 1000;
    const g = (e, quand = t) => M.estPasNeeMesuree(e, quand);
    noter(g({ etat: 'not_born', t: T0 }) === true, '7 not_born mesure et frais : grise');
    noter(g({ etat: 'not_read', t: T0 }) === false && g({ etat: 'not_read', t: null }) === false, '7 not_read : PAS grise');
    noter(g({ etat: 'born', t: T0 }) === false && g(undefined) === false && g(null) === false && g({}) === false, '7 born, absent, vide : pas grise');
    /* ⛔ l heure en CHAINE est le cas qui compte : `maintenant - '1800000000000'` se calcule, et un verdict sans vraie heure
     *   passerait pour frais. (Premier passage de ce banc : avec `t: '1'` le mutant « accepte un verdict sans heure » survivait.) */
    noter(g({ etat: 'not_born', t: null }) === false && g({ etat: 'not_born', t: NaN }) === false && g({ etat: 'not_born', t: String(T0) }) === false && g({ etat: 'not_born' }) === false,
      '7 not_born sans heure lisible (absente, NaN, ou un nombre ecrit en chaine) : pas grise — une mesure sans age n en est pas une');
    noter(g({ etat: 'not_born', t: T0 }, T0 + M.AGE_MAX_MS) === true && g({ etat: 'not_born', t: T0 }, T0 + M.AGE_MAX_MS + 1) === false,
      '7 not_born de plus de 30 min : plus grise');
    noter(g({ etat: 'not_born', t: T0 }, NaN) === false, '7 horloge illisible (NaN) : pas grise');
    noter(M.etatsDepuisReponse(null) === null && M.etatsDepuisReponse({ ok: false, paires: [] }) === null && M.etatsDepuisReponse({ ok: true, paires: 'x' }) === null
      && M.etatsDepuisReponse({ ok: true }) === null, '7 reponse illisible ou ok:false : null (l ecran garde ce qu il avait)');
    const m = M.etatsDepuisReponse({ ok: true, paires: [{ adresse: A(1).toUpperCase().replace('0X', '0x'), etat: 'not_born', lu: new Date(T0).toISOString() },
      { adresse: 'pas-une-adresse', etat: 'not_born', lu: new Date(T0).toISOString() }, { adresse: A(2), etat: 'not_born', lu: 'hier' }, null] });
    noter(m instanceof Map && m.size === 2 && g(m.get(A(1))) === true && g(m.get(A(2))) === false,
      '7 la reponse devient une table par adresse (minuscules) ; une ligne sans adresse est ignoree, une heure illisible ne grise pas');
  }

  /* ── 8. la liste lue ── */
  {
    const c = M.ciblesEtatPaires([{ adr: ADR_ZERO, symbole: 'ETH', type: 'NATIF' }, { adr: A(1).toUpperCase().replace('0X', '0x'), symbole: 'X', type: 'ACTION' },
      { adr: A(1), symbole: 'X2', type: 'ACTION' }, { adr: A(2), symbole: 'NAT', type: 'NATIF' }, { adr: ADR_ZERO, symbole: 'FAUX', type: 'STABLE' },
      { adr: '0x12', symbole: 'COURT', type: 'ACTION' }, null]);
    noter(c.length === 1 && c[0].adr === A(1) && c[0].symbole === 'X', '8 la liste : minuscules, sans doublon, sans natif, sans adresse nulle ni tronquee');
    noter(M.ciblesEtatPaires(null).length === 0 && M.ciblesEtatPaires('x').length === 0, '8 une liste illisible : rien a lire (pas d exception)');
  }
}

/* ════ L ECRAN : les fonctions EXTRAITES de app.html ════ */
const html = lire('app.html');
/** L indice de l accolade fermante du bloc ouvert en `debut` (saute commentaires et chaines ; ces fonctions n ont pas de regex litterale). */
function finBloc(src, debut) {
  let p = 0;
  for (let k = debut; k < src.length; k += 1) {
    const c = src[k], x = src[k + 1];
    if (c === '/' && x === '*') { k = src.indexOf('*/', k + 2) + 1; continue; }
    if (c === '/' && x === '/') { k = src.indexOf('\n', k); continue; }
    if (c === "'" || c === '"' || c === '`') { const q = c; k += 1; while (src[k] !== q) { if (src[k] === '\\') k += 1; k += 1; } continue; }
    if (c === '{') p += 1;
    else if (c === '}') { p -= 1; if (p === 0) return k; }
  }
  return -1;
}
function extraire(src, entete) {
  const i = src.indexOf(entete);
  if (i < 0 || src.indexOf(entete, i + 1) >= 0) return null;
  const f = finBloc(src, src.indexOf('{', i + entete.length - 1));
  return f < 0 ? null : src.slice(i, f + 1);
}
const SRC_APP = {
  pg: extraire(html, '\nfunction paireGrisee(p) {'),
  le: extraire(html, '\nfunction lireEtatsPaires() {'),
  opt: (() => { const s = extraire(html, '\n  const opt = (p) => {'); return s ? s + ';' : null; })(),
};
const LISTE_APP = [{ adr: ADR_ZERO, symbole: 'ETH', nom: 'Ether', type: 'NATIF' }, dev(1, 'VIVA'), dev(2, 'VIDE'), dev(3, 'PANNE'), dev(4, 'JAMAISLUE')];
/** Monte les trois fonctions de app.html dans un bac a sable : memes noms libres que dans la page, rien d autre. */
function monter(src, M, env) {
  return new Function('env', 'M', '"use strict";\n'
    + 'const { fetch, peindrePaires, document, setTimeout, Date } = env; let CHAINE = env.CHAINE;\n'
    + 'const { etatsDepuisReponse, estPasNeeMesuree, LIBELLE_PAS_NEE } = M;\n'
    + 'const enTexte = (t) => String(t), etiquettePaire = (p) => p.symbole + " — " + p.nom, ouverte = (p) => env.ouverte(p);\n'
    + 'let etatsPaires = new Map();\nlet etatsPairesEnVol = null;\nlet etatsPairesRelances = 0;\n'
    + src.pg + '\n' + src.le + '\n' + src.opt + '\n'
    + 'return { paireGrisee, lireEtatsPaires, opt, chaine: (c) => { CHAINE = c; }, poser: (m) => { etatsPaires = m; } };')(env, M);
}
/** La reponse du serveur, fabriquee par le VRAI module (pas ecrite a la main) : VIVA born, VIDE not_born, PANNE not_read. */
async function reponseServeur(M, quand) {
  const { rpc } = fauxNoeud({ [A(1)]: MOT(4), [A(2)]: ZERO, [A(3)]: 'THROW', [A(4)]: 'THROW' });
  return auBout(M.creerEtatPaires({ rpc, paires: () => LISTE_APP, maintenant: () => quand, echecsDeSuiteMax: 99 }));
}
async function jeuApp(src, M, noter) {
  if (!src.pg || !src.le || !src.opt) { noter(false, 'B les trois fonctions sont extraites de app.html'); return; }
  const rep = await reponseServeur(M, T0);
  const env = (plus = {}) => {
    const x = { CHAINE: 8453, appels: 0, peints: 0, minuteurs: [], corps: rep, ouverte: () => true, heure: T0 + 1000, document: { hidden: false } };
    x.fetch = async (url, init) => { x.appels += 1; x.url = url; x.init = init; if (x.corps === 'THROW') throw new Error('network'); return { json: async () => x.corps }; };
    x.peindrePaires = () => { x.peints += 1; };
    x.setTimeout = (f, ms) => { x.minuteurs.push(ms); };
    x.Date = { now: () => x.heure };
    return Object.assign(x, plus);
  };
  const grises = (app) => LISTE_APP.filter((p) => app.paireGrisee(p)).map((p) => p.symbole).join();
  /* la formule d AVANT ce changement (app.html a 9ab857e), pour dire « a l octet pres » */
  const avant = (p, ouv) => '<option value="' + p.adr + '"' + (ouv ? '' : ' disabled') + '>' + p.symbole + ' — ' + p.nom + (ouv ? '' : ' — soon') + '</option>';

  let e = env(), app = monter(src, M, e);
  noter(grises(app) === '', 'B avant toute reponse du serveur : RIEN n est grise (le patch d origine grisait tout sauf ETH)');
  await app.lireEtatsPaires();
  noter(e.appels === 1 && e.url === '/api/paires/etat' && grises(app) === 'VIDE', 'B apres la reponse : UNE requete, et seule la devise « not_born » est grisee (' + grises(app) + ')');
  noter(e.peints === 1, 'B … l ecran est repeint une fois, parce que le grise a change');
  await app.lireEtatsPaires();
  noter(e.appels === 2 && e.peints === 1, 'B meme reponse relue : pas de nouveau repeint');
  const [vivA, vide, panne, jamais] = [LISTE_APP[1], LISTE_APP[2], LISTE_APP[3], LISTE_APP[4]];
  noter(app.opt(vide) === '<option value="' + vide.adr + '" disabled>VIDE — VIDE Inc — ' + M.LIBELLE_PAS_NEE + '</option>',
    'B l option « not_born » : listee, `disabled`, et elle dit « ' + M.LIBELLE_PAS_NEE + ' »');
  noter(app.opt(panne) === avant(panne, true) && app.opt(vivA) === avant(vivA, true) && app.opt(jamais) === avant(jamais, true) && app.opt(LISTE_APP[0]) === avant(LISTE_APP[0], true),
    'B « not_read », « born », jamais lue, ETH : l option sort A L OCTET PRES comme avant (choisissable)');
  e.ouverte = () => false;
  noter(app.opt(panne) === avant(panne, false) && app.opt(vivA) === avant(vivA, false), 'B … et une devise que le contrat n admet pas garde « — soon », comme avant');
  noter(/ disabled>/.test(app.opt(vide)) && !/— soon/.test(app.opt(vide)), 'B … une « not_born » non admise dit le fait mesure, pas « soon »');
  e.heure = T0 + M.AGE_MAX_MS + 1;
  noter(grises(app) === '', 'B onglet reste ouvert, verdict de plus de 30 min jamais rafraichi : plus rien n est grise');
  e.heure = T0 + 1000;
  app.chaine(84532);
  noter(grises(app) === '', 'B hors mainnet : rien n est grise, meme avec une table lue');
  app.chaine(8453);
  app.poser(new Map([[ADR_ZERO, { etat: 'not_born', t: T0 }]]));
  noter(app.paireGrisee(LISTE_APP[0]) === false, 'B ETH (natif) n est jamais grise, meme si une table le disait « not_born »');

  for (const [nom, corps] of [['la requete echoue', 'THROW'], ['le serveur rend ok:false', { ok: false, pourquoi: 'x' }], ['la reponse n a pas la bonne forme', { ok: true, paires: 3 }]]) {
    e = env({ corps }); app = monter(src, M, e);
    await app.lireEtatsPaires();
    noter(e.appels === 1 && grises(app) === '' && e.peints === 0, 'B ' + nom + ' (rien de lu avant) : rien n est grise, rien n est repeint');
    e = env(); app = monter(src, M, e);
    await app.lireEtatsPaires();
    e.corps = corps;
    await app.lireEtatsPaires();
    noter(grises(app) === 'VIDE' && e.peints === 1, 'B ' + nom + ' (apres une lecture reussie) : le verdict mesure reste, rien de PLUS n est grise');
  }
  e = env({ corps: { ...rep, paires: rep.paires.map((p) => ({ ...p, etat: 'not_read', lu: null })) } }); app = monter(src, M, e);
  await app.lireEtatsPaires();
  noter(grises(app) === '', 'B le serveur n a rien pu lire (tout « not_read ») : rien n est grise');
  e = env({ CHAINE: 84532 }); app = monter(src, M, e);
  await app.lireEtatsPaires();
  noter(e.appels === 0, 'B hors mainnet : la requete n est meme pas faite');
  e = env({ corps: { ...rep, enCours: true } }); app = monter(src, M, e);
  for (let i = 0; i < 6; i += 1) await app.lireEtatsPaires();
  noter(e.minuteurs.length === 3 && e.minuteurs.every((ms) => ms === 20000), 'B le serveur dit « passe en cours » : relecture a 20 s, trois fois au plus (' + e.minuteurs.length + ')');
  e = env(); app = monter(src, M, e);
  const [p1, p2] = [app.lireEtatsPaires(), app.lireEtatsPaires()];
  await Promise.all([p1, p2]);
  noter(e.appels === 1, 'B deux appels en meme temps : une seule requete');
}

/* ══════════════════════════════════ LE PASSAGE ══════════════════════════════════ */
console.log('— A. le module, hors reseau');
ok(SEL === '0x18160ddd' && lire('serveur-web.js').includes("data: '0x18160ddd'"),
  'A le selecteur de totalSupply() est CALCULE (keccak.js : ' + SEL + ') et c est celui que le serveur emploie deja pour cette lecture');
await jeuModule(M0, ok);
const cibles = M0.ciblesEtatPaires(P.pairesProposees(8453));
ok(cibles.length === P.pairesProposees(8453).length - 1 && cibles.length === P.DEVISES_ADMISES_7030.length
  && cibles.every((c) => P.DEVISES_ADMISES_7030.includes(c.adr)) && P.DEVISES_ADMISES_7030.every((a) => cibles.some((c) => c.adr === a)),
  'A la liste reelle : ' + cibles.length + ' devises = tout ce que Create propose sauf ETH = exactement DEVISES_ADMISES_7030 (' + P.DEVISES_ADMISES_7030.length + ')');

console.log('— B. l ecran (app.html)');
ok(/^import \{ etatsDepuisReponse, estPasNeeMesuree, LIBELLE_PAS_NEE \} from '\.\/etat-paires\.js';$/m.test(html), 'B app.html importe la regle depuis etat-paires.js (elle n y est pas recopiee)');
ok(/^let etatsPaires = new Map\(\);/m.test(html) && /^let etatsPairesEnVol = null;$/m.test(html) && /^let etatsPairesRelances = 0;$/m.test(html),
  'B l etat de la page part VIDE (rien de lu = rien de grise) — les memes declarations que le bac a sable');
ok(/^void lireEtatsPaires\(\);$/m.test(html) && /^setInterval\(\(\) => \{ if \(!document\.hidden\) void lireEtatsPaires\(\); \}, 300000\);$/m.test(html),
  'B une requete au chargement, puis une toutes les 5 min quand l onglet est visible');
/* positions par regexp (\r?\n) : un litteral « \n… » rate un fichier CRLF (garde test-tests-portables, 2026-10-09) */
const pos = (re) => { const m = re.exec(html); return m ? m.index : -1; };
const pEtats = pos(/\r?\nlet etatsPaires = new Map\(\);/), pV3 = pos(/\r?\nlet v3Pret = false;/), pPeindre = pos(/\r?\nfunction peindrePaires\(\) \{/);
ok(pEtats > pV3 && pV3 >= 0 && pEtats < pPeindre,
  'B les declarations sont posees avant peindrePaires (apres v3Pret, que peindrePaires lit deja) : pas de lecture avant initialisation');
const corpsPeindre = extraire(html, '\nfunction peindrePaires() {') || '';
ok(!!SRC_APP.opt && corpsPeindre.includes(SRC_APP.opt) &&/base\.map\(opt\)/.test(corpsPeindre) && /actions\.map\(opt\)/.test(corpsPeindre),
  'B l option testee ici est bien celle de peindrePaires, pour les devises de base ET les actions');
ok(/if \(!o \|\| o\.disabled\) return '';/.test(extraire(html, '\nfunction peindrePaireChips() {') || ''), 'B une option grisee n a pas de puce (regle existante des puces, inchangee)');
ok(!/market not born/.test(html), 'B le libelle du patch d origine (« market not born yet ») n est pas dans la page');
await jeuApp(SRC_APP, M0, ok);

console.log('— C. le serveur');
const srv = lire('serveur-web.js');
const servis = (srv.match(/const SERVIS\s*=\s*\[([\s\S]*?)\];\n/) || [])[1] || '';
ok(/'etat-paires\.js'/.test(servis) && /'keccak\.js'/.test(servis), 'C etat-paires.js est dans SERVIS (app.html l importe : absent = page morte), sa dependance keccak.js aussi');
ok(/^import \{ creerEtatPaires \} from '\.\/etat-paires\.js';$/m.test(srv) && /^const etatPaires = creerEtatPaires\(\{ rpc: rpcRails, paires: \(\) => pairesProposees\(8453\) \}\);$/m.test(srv),
  'C le serveur lit la liste de l ECRAN (pairesProposees) avec le lecteur des rails — rien n est recopie');
ok(/if \(chemin === '\/api\/paires\/etat'\) \{/.test(srv) && /if \(req\.method !== 'GET'\) \{ rendreE\(405/.test(srv) && /etatPaires\.lire\(\)\.then\(\(r\) => rendreE\(200, r\)\)/.test(srv),
  'C la route /api/paires/etat existe, GET seulement');
ok(/paires: etatPaires\.resume\(\),/.test(srv), 'C /sante.paires rend les compteurs (lus en memoire)');

/* le VRAI serveur contre un faux noeud : deux devises a zero, une refusee par la « chaine », les autres avec des unites */
const zerosNoeud = [cibles[10].adr, cibles[40].adr], refusee = cibles[25].adr;
const vuNoeud = { supply: 0, parAdr: new Map() };
const noeud = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; });
  req.on('end', () => {
    let j = {}; try { j = JSON.parse(b); } catch (_) {}
    const c = (j.params && j.params[0]) || {};
    res.writeHead(200, { 'content-type': 'application/json' });
    if (j.method === 'eth_call' && c.data === SEL) {
      const a = String(c.to).toLowerCase();
      vuNoeud.supply += 1; vuNoeud.parAdr.set(a, (vuNoeud.parAdr.get(a) || 0) + 1);
      /* « execution reverted » n est pas une limite de debit : le lecteur des rails ne la reessaie pas (une reponse, pas une panne) */
      if (a === refusee) { res.end(JSON.stringify({ jsonrpc: '2.0', id: j.id, error: { code: 3, message: 'execution reverted' } })); return; }
      res.end(JSON.stringify({ jsonrpc: '2.0', id: j.id, result: zerosNoeud.includes(a) ? ZERO : MOT(123456) }));
      return;
    }
    res.end(JSON.stringify({ jsonrpc: '2.0', id: j.id, result: j.method === 'eth_blockNumber' ? '0x100000' : j.method === 'eth_getLogs' ? [] : ZERO }));
  });
});
await new Promise((o) => noeud.listen(0, '127.0.0.1', o));
const u = 'http://127.0.0.1:' + noeud.address().port;
const vol = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-paires-vol-'));
const port = 20000 + Math.floor(Math.random() * 20000);
const enfant = spawn(process.execPath, [path.join(ICI, 'serveur-web.js')], { cwd: ICI, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NODE_OPTIONS: '', PORT: String(port), BASE_RPC: u, BASE_RPC_LECTURE: u, RAILWAY_VOLUME_MOUNT_PATH: vol, TB_NOS_CREATEURS: '', TB_SONDES: '0', TB_REPLIS: '0' } });
let journal = '';
enfant.stdout.on('data', () => {}); enfant.stderr.on('data', (d) => { journal += d; });
const base = 'http://127.0.0.1:' + port;
const obtenir = async (chemin, init = {}) => {
  const r = await fetch(base + chemin, { ...init, signal: AbortSignal.timeout(30000) });
  return { code: r.status, cache: r.headers.get('cache-control'), corps: await r.json().catch(() => null) };
};
let pret = false;
for (let i = 0; i < 120 && !pret; i += 1) { try { pret = (await fetch(base + '/sante', { signal: AbortSignal.timeout(2000) })).ok; } catch (_) { await dormir(500); } }
ok(pret, 'C serveur demarre contre le faux noeud (port ' + port + ')' + (pret ? '' : ' — ' + journal.slice(-300)));
if (pret) {
  const s0 = (await obtenir('/sante')).corps;
  ok(!!s0 && !!s0.paires && s0.paires.lu === null && s0.paires.passes === 0 && vuNoeud.supply === 0, 'C /sante avant tout appel : aucune passe, et /sante n en declenche pas (0 lecture)');
  ok((await obtenir('/api/paires/etat', { method: 'POST' })).code === 405, 'C POST : 405');
  let r1 = await obtenir('/api/paires/etat');
  for (let i = 0; i < 40 && r1.corps && r1.corps.enCours; i += 1) { await dormir(250); r1 = await obtenir('/api/paires/etat'); }
  const d = r1.corps || {}, parAdr = new Map((d.paires || []).map((p) => [p.adresse, p]));
  ok(r1.code === 200 && r1.cache === 'no-store' && d.ok === true && d.enCours === false && (d.paires || []).length === cibles.length,
    'C GET /api/paires/etat : 200, ' + (d.paires || []).length + ' devises (la liste de l ecran), passe terminee');
  ok(zerosNoeud.every((a) => parAdr.get(a) && parAdr.get(a).etat === 'not_born' && vuNoeud.parAdr.get(a) === 2),
    'C les deux devises a zero sur le noeud : not_born, chacune lue deux fois');
  ok(!!parAdr.get(refusee) && parAdr.get(refusee).etat === 'not_read' && /reverted/.test(String(parAdr.get(refusee).pourquoi)),
    'C la devise que le noeud refuse : not_read, avec la raison du noeud — pas not_born');
  ok(d.compte && d.compte.born === cibles.length - 3 && d.compte.not_born === 2 && d.compte.not_read === 1,
    'C compteurs : ' + JSON.stringify(d.compte) + ' (attendu ' + (cibles.length - 3) + ' / 2 / 1)');
  const apresPasse = vuNoeud.supply;
  ok(apresPasse === cibles.length + 2, 'C lectures totalSupply recues par le noeud pour cette passe : ' + apresPasse + ' (attendu ' + cibles.length + ' + 2 zeros relus)');
  const etats = M0.etatsDepuisReponse(d);
  ok(!!etats && cibles.filter((c) => M0.estPasNeeMesuree(etats.get(c.adr), Date.now())).map((c) => c.adr).sort().join() === [...zerosNoeud].sort().join(),
    'C bout en bout : la regle de l ecran, appliquee a la reponse du vrai serveur, grise ces deux devises et aucune autre');
  /* passe incomplete (1 not_read) : la suivante n est due que 2 min plus tard — d ici la, aucun appel ne lit le noeud */
  const r2 = await obtenir('/api/paires/etat');
  const r3 = await obtenir('/api/paires/etat');
  ok(r2.corps.lu === d.lu && r3.corps.lu === d.lu && vuNoeud.supply === apresPasse, 'C deux appels de plus : servis de la memoire, AUCUNE lecture de plus sur le noeud (' + vuNoeud.supply + ')');
  const s1 = (await obtenir('/sante')).corps;
  ok(!!s1 && !!s1.paires && s1.paires.born === cibles.length - 3 && s1.paires.not_born === 2 && s1.paires.not_read === 1 && s1.paires.passes === 1 && s1.paires.lectures === apresPasse,
    'C /sante.paires : ' + JSON.stringify(s1 && s1.paires));
}
enfant.kill();
noeud.close();
try { fs.rmSync(vol, { recursive: true, force: true }); } catch (_) {}

console.log('— D. mutants');
const temoin = { a: 0, b: 0 };
await jeuModule(M0, (c) => { if (!c) temoin.a += 1; });
await jeuApp(SRC_APP, M0, (c) => { if (!c) temoin.b += 1; });
ok(temoin.a === 0 && temoin.b === 0, 'D TEMOIN : rejoues en mode compteur, les deux jeux ne comptent AUCUN rouge sur le code d origine');
const srcMod = lire('etat-paires.js');
const dirM = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-paires-mut-'));
fs.copyFileSync(path.join(ICI, 'keccak.js'), path.join(dirM, 'keccak.js'));
const MUTANTS_MODULE = [
  ['une lecture ratee devient un zero (le defaut du patch d origine)', [['      return { lu: false, pourquoi: court(e) };', '      return { lu: true, supply: 0n };']]],
  ['une reponse qui n est pas un mot de 32 octets est prise pour un nombre', [["if (typeof r !== 'string' || !MOT_32.test(r)) {", "if (typeof r !== 'string') {"]]],
  ['le temoin est retire (un zero compte meme si rien n a ete lu avec des unites)', [['const aRelire = zeros.filter(aTemoin);', 'const aRelire = zeros;'], ['      else if (!aTemoin(c)) pourquoi =', '      else if (false) pourquoi =']]],
  ['le temoin ne garde plus le verdict (seule la relecture le fait)', [['      else if (!aTemoin(c)) pourquoi =', '      else if (false) pourquoi =']]],
  ['les zeros sont relus meme sans temoin (lectures en trop)', [['const aRelire = zeros.filter(aTemoin);', 'const aRelire = zeros;']]],
  ['le temoin n a plus a etre du meme genre (lire USDC cautionne un B20)', [["const famille = (adr) => (adr.startsWith('0xb2') ? 'b20' : 'autre');", "const famille = () => 'toutes';"]]],
  ['un zero contredit par sa relecture compte quand meme', [["        else if (r2.supply !== 0n) pourquoi =", "        else if (false) pourquoi ="]]],
  ['un zero dont la relecture a rate n est plus distingue', [["        if (!r2 || !r2.lu) pourquoi =", "        if (false) pourquoi ="]]],
  ['un verdict mesure ne vieillit jamais', [['      if (v && t - v.t <= ageMaxMs) {', '      if (v) {']]],
  ['le cache est retire (une passe a chaque appel)', [['const due = dernierePasse === null || t - dernierePasse.fin >= (dernierePasse.complete ? ttlMs : repriseMs);', 'const due = true;']]],
  ['une passe incomplete attend 5 min comme une complete', [['(dernierePasse.complete ? ttlMs : repriseMs)', 'ttlMs']]],
  ['une passe complete est rejouee des 2 min', [['(dernierePasse.complete ? ttlMs : repriseMs)', 'repriseMs']]],
  ['plusieurs passes a la fois', [['    if (due && enCours === null) {', '    if (due) {']]],
  ['la coupure apres 3 echecs est retiree', [['if (garde.deSuite >= echecsDeSuiteMax) garde.coupee = true;', '']]],
  ['toutes les lectures partent en meme temps', [['Array.from({ length: Math.max(1, Math.min(enVolMax, liste.length)) }, ouvrier)', 'Array.from({ length: Math.max(1, liste.length) }, ouvrier)']]],
  ['une lecture n a plus de delai', [["minuteur = setTimeout(() => non(new Error('no answer within ' + delaiLectureMs + ' ms')), delaiLectureMs);", 'minuteur = null;']]],
  ['le premier appel attend la passe entiere', [['await Promise.race([enCours, new Promise((oui) => { minuteur = setTimeout(oui, attenteFroideMs); })]);', 'await enCours;']]],
  ['l ecran grise tout ce qui n est pas « born » (not_read compris)', [['  if (!e || e.etat !== PAS_NEE) return false;', '  if (!e || e.etat === NEE) return false;']]],
  ['l ecran ignore l age du verdict', [['  return maintenant - e.t <= ageMaxMs;', '  return true;']]],
  ['l ecran accepte un verdict sans heure', [["  if (typeof e.t !== 'number' || !Number.isFinite(e.t) || !Number.isFinite(maintenant)) return false;", '']]],
  ['une reponse ok:false est lue quand meme', [['  if (!d || d.ok !== true || !Array.isArray(d.paires)) return null;', '  if (!d || !Array.isArray(d.paires)) return null;']]],
  ['le natif est lu comme une devise', [["if (!ADRESSE.test(adr) || adr === ZERO || (p && p.type === 'NATIF') || vues.has(adr)) continue;", 'if (!ADRESSE.test(adr) || vues.has(adr)) continue;']]],
  ['les doublons sont lus deux fois', [["if (!ADRESSE.test(adr) || adr === ZERO || (p && p.type === 'NATIF') || vues.has(adr)) continue;", "if (!ADRESSE.test(adr) || adr === ZERO || (p && p.type === 'NATIF')) continue;"]]],
];
for (const [nom, remplacements] of MUTANTS_MODULE) {
  let mut = srcMod, present = true;
  for (const [de, a] of remplacements) { if (mut.split(de).length !== 2) present = false; mut = mut.replace(de, a); }
  if (!present) { ok(false, 'D mutant « ' + nom + ' » : motif introuvable ou multiple'); continue; }
  fs.writeFileSync(path.join(dirM, 'etat-paires.js'), mut);
  let rouges = 0;
  try {
    const Mm = await imp('etat-paires.js', dirM);
    await jeuModule(Mm, (c) => { if (!c) rouges += 1; });
    await jeuApp(SRC_APP, Mm, (c) => { if (!c) rouges += 1; });
  } catch (_) { rouges += 1; }
  ok(rouges > 0, 'D mutant « ' + nom + ' » : ROUGE (' + rouges + ' assertion(s))');
}
try { fs.rmSync(dirM, { recursive: true, force: true }); } catch (_) {}
const MUTANTS_APP = [
  ['paireGrisee grise tout ce qui n est pas « born » (fail-closed, le patch d origine)', 'pg',
    "  return estPasNeeMesuree(etatsPaires.get(String(p.adr || '').toLowerCase()), Date.now());",
    "  const e = etatsPaires.get(String(p.adr || '').toLowerCase()); return !e || e.etat !== 'born';"],
  ['paireGrisee grise sur « not_read »', 'pg',
    "  return estPasNeeMesuree(etatsPaires.get(String(p.adr || '').toLowerCase()), Date.now());",
    "  const e = etatsPaires.get(String(p.adr || '').toLowerCase()); return estPasNeeMesuree(e, Date.now()) || (!!e && e.etat === 'not_read');"],
  ['paireGrisee oublie le natif', 'pg', "  if (Number(CHAINE) !== 8453 || !p || p.type === 'NATIF') return false;", '  if (Number(CHAINE) !== 8453 || !p) return false;'],
  ['paireGrisee oublie la chaine', 'pg', "  if (Number(CHAINE) !== 8453 || !p || p.type === 'NATIF') return false;", "  if (!p || p.type === 'NATIF') return false;"],
  ['une requete ratee vide la table et grise tout', 'le', '    } catch (_) { /* requete ratee : rien ne change a l ecran */ }',
    "    } catch (_) { etatsPaires = new Map([['" + A(1) + "', { etat: 'not_born', t: Date.now() }], ['" + A(3) + "', { etat: 'not_born', t: Date.now() }]]); }"],
  ['une reponse illisible efface le verdict mesure', 'le', '      if (!lus) return;', '      if (!lus) { etatsPaires = new Map(); return; }'],
  ['la requete part aussi hors mainnet', 'le', '  if (Number(CHAINE) !== 8453) return Promise.resolve();', ''],
  ['les relectures ne sont plus plafonnees', 'le', 'if (d.enCours === true && etatsPairesRelances < 3) {', 'if (d.enCours === true) {'],
  ['deux requetes en meme temps', 'le', '  if (etatsPairesEnVol) return etatsPairesEnVol;', ''],
  ['l ecran est repeint a chaque lecture', 'le', 'if (grises(etatsPaires) !== avant) {', 'if (true) {'],
  ['l option « not_born » reste choisissable', 'opt', 'const pasNee = paireGrisee(p), ok = ouverte(p) && !pasNee;', 'const pasNee = paireGrisee(p), ok = ouverte(p);'],
  ['l option « not_born » ne dit pas pourquoi', 'opt', "(pasNee ? ' — ' + enTexte(LIBELLE_PAS_NEE) : (ok ? '' : ' — soon'))", "(ok ? '' : ' — soon')"],
  ['toute option est grisee', 'opt', 'const pasNee = paireGrisee(p), ok = ouverte(p) && !pasNee;', 'const pasNee = true, ok = ouverte(p) && !pasNee;'],
];
for (const [nom, cle, de, a] of MUTANTS_APP) {
  if (!SRC_APP[cle] || SRC_APP[cle].split(de).length !== 2) { ok(false, 'D mutant ecran « ' + nom + ' » : motif introuvable ou multiple'); continue; }
  let rouges = 0;
  try { await jeuApp({ ...SRC_APP, [cle]: SRC_APP[cle].replace(de, a) }, M0, (c) => { if (!c) rouges += 1; }); } catch (_) { rouges += 1; }
  ok(rouges > 0, 'D mutant ecran « ' + nom + ' » : ROUGE (' + rouges + ' assertion(s))');
}

console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions)');
process.exitCode = ko ? 1 : 0;
