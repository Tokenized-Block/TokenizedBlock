// test-tam-onglet-20261031.mjs — TAM PHASE C : l onglet (logique pure), le plan du mint, le serveur, la liste servie.
// Ce que ce banc PROUVE : le badge du rejeu ne dit « identical ✓ » que sur des octets egaux ; pas d adresse = pas de bouton Mint ;
//   le plan paie EXACTEMENT 5 USDC (approve au contrat, contrat LU qui paie le FEE_WALLET) et Pay with garde ces appels tels quels ;
//   une couche eteinte retire SA dimension et pas une autre ; /api/tam/oeuvres avant deploiement = liste vide + raison ; la liste servie
//   contient les modules TAM.
// Ce qu il NE prouve PAS : le dessin, les gestes, le son (navigateur), ni un mint reel (TamArt n est pas deploye).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from './tam-moteur.js';
import * as V from './tam-vue.js';
import * as TP from './tam-plan.js';
import { serveurTam, etatCerveauTam } from './tam-serveur.js';
import { TAMART_DEPLOIEMENT } from './tamart-deploiement.js';
import { planJeuUsdc, besoinDuJeu, planPayerEnJeton, usdcAViser, CANDIDATS_CL } from './misables.js';
import { FEE_WALLET } from './frais-creation.js';
import { keccak256Hex } from './keccak.js';
import { FACTORY_AERODROME_CL } from './calldata-aerodrome.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const bas = (x) => String(x).toLowerCase();
const graineDe = (s) => keccak256Hex(new TextEncoder().encode(s));

/* ── 1. le rejeu ── */
const ch = T.choisirOeuvre({ graine: graineDe('tam-echantillon-1'), etatCerveau: { tick: 1 }, existantes: [] });
ok(ch.ok, 'une oeuvre certifiee pour la graine d echantillon 1');
const r = T.rejouer(JSON.parse(JSON.stringify(ch.params)));
ok(V.verdictRejeu(r.octets, ch.octets).identique === true && V.verdictRejeu(r.octets, ch.octets).texte === 'identical ✓', 'rejouer(params) = les memes octets : identical ✓');
for (const i of [0, 7, Math.floor(ch.octets.length / 2), ch.octets.length - 1]) {
  const m = ch.octets.slice(); m[i] ^= 1;
  ok(V.verdictRejeu(r.octets, m).identique === false && V.verdictRejeu(r.octets, m).texte === 'different ✗', 'un octet change (index ' + i + ') : different ✗');
}
const plus = new Uint8Array(ch.octets.length + 1); plus.set(ch.octets);
ok(!V.verdictRejeu(r.octets, plus).identique, 'un octet de plus : different ✗');
ok(!V.verdictRejeu(r.octets, ch.octets.slice(0, -1)).identique, 'un octet de moins : different ✗');
ok(!V.verdictRejeu(null, ch.octets).identique && !V.verdictRejeu(r.octets, null).identique, 'rejeu rate ou chaine non lue : different ✗');
ok(!V.verdictRejeu(new Uint8Array(0), new Uint8Array(0)).identique, 'deux vides : jamais ✓');
ok(!V.verdictRejeu(Array.from(ch.octets), ch.octets).identique, 'un tableau qui n est pas des octets : jamais ✓');

/* ── 2. le bouton Mint ── */
ok(TAMART_DEPLOIEMENT.adresse === null, 'temoin : la fiche du depot n a PAS d adresse (TamArt non deploye)');
ok(V.mintVisible(TAMART_DEPLOIEMENT) === false, 'sans adresse : pas de bouton Mint');
const DEP = { ...TAMART_DEPLOIEMENT, adresse: '0x' + '11'.repeat(20), bloc: 1000 };
ok(V.mintVisible(DEP) === true, 'adresse ET bloc : le bouton Mint');
ok(V.mintVisible({ ...DEP, bloc: null }) === false, 'adresse sans bloc : pas de bouton');
ok(V.mintVisible({ ...DEP, adresse: '0x' + '00'.repeat(20) }) === false, 'adresse zero : pas de bouton');
ok(V.mintVisible({ ...DEP, adresse: '0x1234' }) === false, 'adresse tronquee : pas de bouton');
ok(V.mintVisible(null) === false && V.mintVisible(undefined) === false, 'pas de fiche : pas de bouton');
const onglet = readFileSync(new URL('./tam-onglet.js', import.meta.url), 'utf8');
ok(/const visible = V\.mintVisible\(TAMART_DEPLOIEMENT\) && /.test(onglet) && /zMint\.hidden = !visible/.test(onglet), 'l onglet cache la zone Mint par CETTE regle');
ok(/if \(!visible\) \{ zMint\.replaceChildren\(\); return; \}/.test(onglet), 'sans adresse, la zone Mint est VIDEE (aucun bouton construit)');

/* ── 3. le plan : exactement 5 USDC, vers le FEE_WALLET ── */
const LU = { prix: 5000000n, beneficiaire: bas(FEE_WALLET), usdc: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' };
const paramsJson = JSON.stringify(ch.params);
const jeu = { genre: 'tam', contrat: DEP.adresse, deploiement: DEP, lu: LU, octets: ch.octets, graine: ch.params.graine, paramsJson };
const p = planJeuUsdc(jeu);
ok(p.etat === 'PRET' && p.appels.length === 2, 'planJeuUsdc genre tam : PRET, 2 appels');
ok(bas(p.appels[0].to) === LU.usdc && p.appels[0].data.startsWith('0x095ea7b3'), 'appel 1 : approve sur USDC');
ok('0x' + p.appels[0].data.slice(34, 74) === DEP.adresse, 'approve : le spender est TamArt');
ok(BigInt('0x' + p.appels[0].data.slice(74)) === 5000000n, 'approve : EXACTEMENT 5 000 000 (5 USDC)');
ok(besoinDuJeu(p, DEP.adresse) === 5000000n, 'Pay with lit un besoin de 5 USDC exactement');
ok(p.resume.vers === bas(FEE_WALLET) && p.resume.prixUsdc === 5000000n, 'le resume dit 5 USDC au FEE_WALLET');
ok(p.resume.empreinte === ch.hash && p.resume.octets === ch.octets.length, 'le resume dit les octets et leur keccak');
/* le calldata du mint se relit : data, graine, params */
const d = p.appels[1].data.slice(10), w = (i) => d.slice(64 * i, 64 * (i + 1));
ok(p.appels[1].data.startsWith(TP.appelLecture(DEP.adresse, TP.SIG_TAM.mint).data) && bas(p.appels[1].to) === DEP.adresse, 'appel 2 : mint(bytes,bytes32,bytes) sur TamArt');
const offD = Number(BigInt('0x' + w(0))) * 2, offP = Number(BigInt('0x' + w(2))) * 2;
const lenD = Number(BigInt('0x' + d.slice(offD, offD + 64))), lenP = Number(BigInt('0x' + d.slice(offP, offP + 64)));
ok(d.slice(offD + 64, offD + 64 + lenD * 2) === Buffer.from(ch.octets).toString('hex'), 'mint : les octets de l oeuvre, octet pour octet');
ok('0x' + w(1) === bas(ch.params.graine), 'mint : la graine');
ok(Buffer.from(d.slice(offP + 64, offP + 64 + lenP * 2), 'hex').toString('utf8') === paramsJson, 'mint : le JSON des params');
ok(p.appels.every((a) => a.value === '0x0'), 'aucun ETH envoye');
/* les refus */
const refuse = (o, code, m) => { const x = planJeuUsdc({ ...jeu, ...o }); ok(x.etat === 'REFUSE' && (!code || x.code === code), m + ' (' + x.code + ')'); };
refuse({ deploiement: TAMART_DEPLOIEMENT, contrat: DEP.adresse }, 'PAS_DEPLOYE', 'fiche sans adresse : refuse');
refuse({ lu: { ...LU, beneficiaire: '0x' + 'be'.repeat(20) } }, 'BENEFICIAIRE', 'contrat LU qui paie un autre wallet : refuse');
refuse({ lu: { ...LU, prix: 5000001n } }, 'PRIX', 'contrat LU a 5,000001 USDC : refuse');
refuse({ lu: { ...LU, prix: 4999999n } }, 'PRIX', 'contrat LU a 4,999999 USDC : refuse');
refuse({ lu: null }, 'NON_LU', 'contrat non lu : refuse');
refuse({ lu: { ...LU, usdc: '0x' + '22'.repeat(20) } }, 'USDC', 'contrat LU sur un autre jeton : refuse');
refuse({ deploiement: { ...DEP, constructeur: { ...DEP.constructeur, beneficiaire: '0x' + 'be'.repeat(20) } } }, 'BENEFICIAIRE', 'fiche qui paie un autre wallet : refuse');
refuse({ deploiement: { ...DEP, prix: 1000000 } }, 'PRIX', 'fiche a 1 USDC : refuse');
refuse({ octets: ch.octets.slice(1) }, 'DONNEES', 'octets sans en-tete TAM : refuse');
refuse({ graine: '0x1234' }, 'GRAINE', 'graine tronquee : refuse');
refuse({ paramsJson: 'x'.repeat(4097) }, 'PARAMS', 'params trop longs : refuse');
/* Pay with un jeton : le swap pour 5 USDC, puis CES deux appels, inchanges */
const cand = CANDIDATS_CL.find((c) => !c.natif);
const vise = usdcAViser({ besoin: 5000000n });
const devis = { etat: 'PRET', jeton: cand.jeton, jetonIn: cand.jeton, natif: false, symbole: 'TEST', route: 'aerodrome-cl', factory: FACTORY_AERODROME_CL, pool: cand.pool,
  tickSpacing: cand.tickSpacing, usdcSortie: vise, montantIn: 1000000000000000000n, ecartBps: 20, usdcPool: 50000000000n, bloc: 100 };
const pj = planPayerEnJeton({ devis, compte: '0x' + 'ab'.repeat(20), jeu, blocActuel: 105, maintenant: 1800000000 });
ok(pj.etat === 'PRET', 'Pay with un jeton profond a 5 USDC : PRET (' + (pj.pourquoi || '') + ')');
if (pj.etat === 'PRET') {
  ok(pj.resume.besoinUsdc === 5000000n && pj.resume.usdcSortie === vise, 'le swap vise 5 USDC + le frais d interface, le jeu prend 5 USDC');
  const fin = pj.appels.slice(-2);
  ok(fin.every((a, i) => bas(a.to) === bas(p.appels[i].to) && a.data === p.appels[i].data), 'les 2 derniers appels = le plan USDC du mint, octet pour octet');
}
const pjUsdc = planPayerEnJeton({ devis: { jeton: LU.usdc }, compte: '0x' + 'ab'.repeat(20), jeu, blocActuel: 1, maintenant: 1 });
ok(pjUsdc.etat === 'PRET' && pjUsdc.appels.length === 2 && pjUsdc.appels[1].data === p.appels[1].data, 'Pay with USDC : le plan du mint tel quel');

/* ── 4. les couches : eteindre j retire j, et pas une autre ── */
const P12 = V.paramsExplorateur({ famille: 'lorenz', copies: 4 });
const o12 = T.generer(P12);
ok(o12.bornee && o12.D === 12, 'explorateur : Lorenz x4 couple = 12-D, borne');
const z = V.standardiser(o12.brut, o12.n, o12.D);
const sansCol = (j) => { const c = z.slice(); for (let i = 0; i < o12.n; i++) c[i * 12 + j] = 0; return c; };
const egal = (a, b) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-12);
let e = V.etatCouches(12);
for (const j of [0, 1, 3, 7, 11]) {
  const ej = V.basculer(e, j);
  ok(ej.actives.filter((x) => !x).length === 1 && ej.actives[j] === false, 'basculer(' + j + ') eteint SEULEMENT x' + (j + 1));
  for (const t of [0, 1.3]) {
    const a = V.projeterVivant({ z, n: o12.n, D: 12, actives: ej.actives, angles: P12.angles, t });
    const b = V.projeterVivant({ z: sansCol(j), n: o12.n, D: 12, actives: null, angles: P12.angles, t });
    const k = (j + 1) % 12, c2 = V.projeterVivant({ z: sansCol(k), n: o12.n, D: 12, actives: null, angles: P12.angles, t });
    ok(egal(a, b), 'x' + (j + 1) + ' eteinte (t=' + t + ') = la projection SANS la colonne ' + j);
    ok(!egal(a, c2), 'x' + (j + 1) + ' eteinte (t=' + t + ') != la projection sans la colonne ' + k + ' (pas la mauvaise dimension)');
  }
}
ok(V.dimsVisibles(V.isoler(e, 5)).join() === '5', 'isoler(5) : seule x6');
ok(V.dimsVisibles(V.jusqua(e, 3)).join() === '0,1,2', 'curseur a 3 : x1..x3');
ok(V.dimsVisibles(V.jusqua(e, 12)).length === 12 && V.pairesVisibles(e).length === 66, 'curseur a 12 : 12 couches, 66 paires');
ok(V.pairesVisibles(V.jusqua(e, 3)).length === 3, '3 couches : 3 paires');
/* t = 0, toutes couches : exactement la projection du moteur (les points stockes) */
const pos0 = V.projeterVivant({ z, n: o12.n, D: 12, actives: null, angles: P12.angles, t: 0 });
const M = (1 << o12.params.q) - 1;
let diff = 0; for (let i = 0; i < pos0.length; i++) { const q = Math.min(M, Math.max(0, Math.round((pos0[i] + 1) / 2 * M))); if (Math.abs(q - o12.points[i]) > 1) diff++; }
ok(diff === 0, 'vue vivante a t=0 = les points du moteur (a 1 pas de quantification pres, cos/sin natifs) : ' + diff + ' ecarts');
/* 2026-10-31 (cascade decroissante du moteur) : la vue STOCKEE porte aussi x7..x12 */
const sans9 = V.projeterVivant({ z: sansCol(9), n: o12.n, D: 12, actives: null, angles: P12.angles, t: 0 });
ok(!egal(pos0, sans9), 'a t=0 (vue stockee) la dimension x10 change la vue');
ok(!egal(V.projeterVivant({ z, n: o12.n, D: 12, actives: null, angles: P12.angles, t: 0.8 }), V.projeterVivant({ z: sansCol(9), n: o12.n, D: 12, actives: null, angles: P12.angles, t: 0.8 })), 'rotation vivante : x10 apparait');

/* ── 5. la carte ── */
const cc = T.certifier(T.generer(ch.params), []);
const L = V.carte({ P: ch.params, c: cc, choix: { graine: ch.params.graine, bloc: 123, empreinteEtat: ch.params.empreinteEtat, essai: ch.params.essai, rejets: ch.rejets } });
const v = (k) => (L.find((x) => x.k === k) || {}).v || '';
ok(v('Chaotic').startsWith('yes, λ = ' + cc.lyapunov.toFixed(3)), 'Chaotic : yes, λ = la VALEUR mesuree (' + v('Chaotic') + ')');
ok(v('Bounded').startsWith('yes'), 'Bounded : yes');
ok(v('Box dimension').includes(cc.dimension.toFixed(2)) && v('Box dimension').includes('rough estimate'), 'Box dimension : valeur + « rough estimate »');
ok(v('Distinct from the minted works').startsWith('yes (no minted work'), 'Distinct : yes, et dit qu il n y a rien a comparer');
ok(/not new mathematics/.test(v('Why this one')), 'la carte dit : pas de nouvelles mathematiques');
ok(V.carte({ P: ch.params, c: { ...cc, lyapunov: -0.1 } }).find((x) => x.k === 'Chaotic').v.startsWith('no'), 'λ negatif : « no »');

/* ── 6. le serveur ── */
const HASH = graineDe('bloc-de-test');
const appels = [];
const rpcFaux = async (m, params) => { appels.push(m); if (m === 'eth_getBlockByNumber') return { number: '0x64', hash: HASH }; throw new Error('pas attendu: ' + m); };
const UNIT = '0xb2000000000000000000007afa7ed748b0874f27', IB022 = '0xb200000000000000000000e4b0c5fbe9c8df579e';
const viesLues = [];
const lireVie = async (a) => { viesLues.push(a); if (a === IB022) throw new Error('rpc en panne'); return { etat: 'LUE', vie: 1234.5, bloc: 100 }; };
const srv = serveurTam({ rpc: rpcFaux, deploiement: TAMART_DEPLOIEMENT, lireVie, lireSymbole: async () => 'ZZZ' });
const oe = await srv.oeuvres();
ok(oe.ok === true && oe.etat === 'PAS_DEPLOYE' && Array.isArray(oe.oeuvres) && oe.oeuvres.length === 0 && /not deployed/.test(oe.pourquoi), '/api/tam/oeuvres avant deploiement : liste vide + raison');
ok(!appels.includes('eth_getLogs'), 'avant deploiement : aucun eth_getLogs');
const c1 = await srv.choix(null);
ok(c1.ok && c1.graine === HASH && c1.bloc === 100, '/api/tam/choix sans graine : le hash du dernier bloc');
const etU = etatCerveauTam(UNIT, { vie: 1234.5, etatVie: 'LUE', bloc: 100, symbole: 'UNIT' });
ok(c1.empreinteEtat === keccak256Hex(new TextEncoder().encode(T.canon(etU))), 'defaut : le cerveau de UNIT (24 battements, sa vie lue) ; empreinte = keccak(canon(etat))');
ok(c1.cerveau.adresse === UNIT && c1.cerveau.symbole === 'UNIT' && c1.cerveau.battement === 24 && c1.cerveau.vivant === false && c1.cerveau.repli === false, 'la reponse nomme le cerveau : UNIT, battement 24, pas vivant');
ok(/^brain of UNIT at beat 24, rebuilt on the server from its seed, fed its market life read on chain at block 100; not your live brain$/.test(c1.cerveau.etiquette), 'etiquette : ' + c1.cerveau.etiquette);
ok(etU.empreinte !== etatCerveauTam(IB022).empreinte, 'temoin : le connectome depend du block (empreinte UNIT != IB022)');
const cI = await srv.choix(null, IB022);
ok(cI.ok && cI.cerveau.symbole === 'IB022' && cI.cerveau.etatVie === 'NON_LUE' && /with its market life not read/.test(cI.cerveau.etiquette) && cI.empreinteEtat !== c1.empreinteEtat, 'block=IB022 (vie non lue) : SON cerveau, dit « not read », autre empreinte');
const cZ = await srv.choix(null, '0x' + '12'.repeat(20));
ok(cZ.ok && cZ.cerveau.symbole === 'ZZZ' && /^brain of ZZZ at beat 24/.test(cZ.cerveau.etiquette), 'block quelconque : son symbol() lu');
ok((await srv.choix(null, '0x1234')).etat === 'REFUSE', 'block tronque : refuse');
const Lc = V.carte({ P: c1.params, c: c1.certificats, choix: { ...c1, essai: c1.params.essai } });
const wb = (Lc.find((x) => x.k === 'Which brain') || {}).v || '';
ok(wb === 'Seed: hash of Base block 100 + ' + c1.cerveau.etiquette + '.', 'la carte : « Seed: hash of Base block N + brain of SYM at beat B … »');
ok(!/live brain/.test(wb.replace('not your live brain', '')), 'la carte ne pretend jamais un cerveau vivant');
ok(/an unnamed brain state/.test(V.carte({ P: c1.params, c: c1.certificats, choix: { graine: c1.graine, bloc: 1, empreinteEtat: c1.empreinteEtat, essai: 0, rejets: [] } }).find((x) => x.k === 'Which brain').v), 'sans etiquette : « an unnamed brain state », jamais un nom invente');
const rr = T.rejouer(c1.params);
ok(V.verdictRejeu(rr.octets, TP.octetsDe(c1.octets)).identique && rr.hash === c1.hash, 'les octets servis se rejouent a l identique depuis les params servis');
ok(c1.certificats && c1.certificats.signature === undefined && Number.isFinite(c1.certificats.lyapunov), 'certificats servis (sans la signature de 512 cases)');
await srv.choix(null);
ok(appels.filter((m) => m === 'eth_getBlockByNumber').length === 1, 'la tete est en cache (une lecture pour deux choix)');
ok((await srv.choix('0x12')).etat === 'REFUSE', 'graine invalide : refuse');
const c2 = await srv.choix(graineDe('autre'));
ok(c2.ok && c2.graine === graineDe('autre') && c2.bloc === null, 'graine donnee : utilisee telle quelle');

/* ── 7. la liste servie ── */
const serveur = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const bloc = serveur.match(/const SERVIS\s*=\s*\[([\s\S]*?)\];/);
const servis = new Set([...bloc[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
for (const f of ['tam-onglet.js', 'tam-vue.js', 'tam-moteur.js', 'tam-plan.js', 'tamart-deploiement.js', 'keccak.js', 'misables.js', 'map3d.js', 'vision-inside.js', 'calldata-aerodrome.js', 'frais-creation.js'])
  ok(servis.has(f), f + ' est servi');
ok(/import\('\.\/tam-onglet\.js'\)/.test(readFileSync(new URL('./app.html', import.meta.url), 'utf8')), 'app.html importe tam-onglet.js (suivi par test-imports-servis)');
ok(/chemin === '\/api\/tam\/choix' \|\| chemin === '\/api\/tam\/oeuvres'/.test(serveur), 'les routes /api/tam/* existent');

console.log('test-tam-onglet-20261031 : ' + n + ' assertions OK');
