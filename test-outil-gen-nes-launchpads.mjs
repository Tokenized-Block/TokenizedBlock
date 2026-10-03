/* test-outil-gen-nes-launchpads.mjs — LE GENERATEUR DE LA LISTE o1 (outil-gen-nes-launchpads.mjs, R10 : C2 backlog F1/F2).
 * Sur une chaine SIMULEE (RPC fictif, aucun reseau) : fenetres eth_getLogs couvrant toute la plage sans trou ni recouvrement,
 * division par 2 sur erreur, ARRET sans rien produire si une fenetre echoue pour de bon ou si une reponse sort du filtre ;
 * un jeton = le B20 lance (topics[1]) ne dans la MEME tx que son lancement et que sa pool, jamais le cote cotation ;
 * exclus : hors B20, ne ailleurs, pool ailleurs, ensemble TB, pool sur nos hooks ; sortie deterministe ; le fichier livre
 * jetons-nes-launchpads.js est EXACTEMENT la sortie du generateur ; 0 recouvrement avec l ensemble TB (22 jetons, C2 R9).
 * ⛔ PORTABLE LF/CRLF : chemins par pathToFileURL ; le fichier livre est compare apres \r\n -> \n.
 * ⛔ TEMOINS NEGATIFS : le banc tourne sur une COPIE du depot (doit rester vert), puis sur des MUTANTS ; chacun DOIT le rougir. */
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (dir, f) => import(pathToFileURL(path.join(dir, f)).href);
const bas = (a) => String(a).toLowerCase();
const pad = (h, n = 64) => bas(h).replace(/^0x/, '').padStart(n, '0');
const mot = (a) => '0x' + pad(a);
const B = (s) => '0xb2' + '0'.repeat(20) + s; /* s : 18 chiffres hexa */
const ETH = '0x' + '0'.repeat(40);
const HOOK_O1 = '0x1f91c998e7c2f4b690d75bdbf6502bdcd6e02acc';
/* ensemble TB (C2 R9, r9-review-logs/tbset.json : 22 jetons) */
const TB22 = ['913c2d82ea435eb2aa', '72eb43b8db1029b7d9', 'df3ffcd9be89b3843c', 'baa5356bfc210cc30a', '5113f47a963ebdc45c',
  'e7e9db76e8234f8f56', '05090fb1d9da0e5949', 'e63ffc3f40bf92a042', '407ee1732664dc8028', 'dae0212b61be4c49bb', '03d296be435ae4bbe3',
  '24c30d3fcb7931272e', 'e7e544d1292a095c36', '4ff41cbd5ef8e49f14', '71224edc6587e362d2', '6d6f9102e9e4b221e0', 'a3f3e63b48ef57c481',
  'ab549fa65ad4edae3f', '809778b2d38d114351', 'e4b0c5fbe9c8df579e', 'eedb997f91ceb22b8a', '7b9fcbd005511acbd5'].map(B);
const SPCX = B('7b9fcbd005511acbd5'); /* action Coinbase SPCXc : devise connue, jamais un block */

/* ── chaine simulee ── */
const A = B('a00000000000000101'), BB = B('b00000000000000201'), Q = B('c00000000000000301'), C = '0x1234567890123456789012345678901234567801';
const D = B('d00000000000000401'), E = B('e00000000000000501'), F = B('f00000000000000601'), G = B('aa0000000000000701');
const H = B('bb0000000000000801'), EFIX = B('eedb997f91ceb22b8a');
function chaine(G_) {
  const { gen, T } = G_;
  const tx = (n) => '0x' + pad(n.toString(16));
  const pid = (n) => '0x' + pad('f00d' + n.toString(16));
  const L = [], N = [], I = [];
  const lance = (bloc, n, jeton, quote, { neTx = n, poolTx = n, c0 = null, c1 = null, hook = HOOK_O1, ne = true } = {}) => {
    L.push({ address: gen.O1_STANDARD_FACTORY, topics: [gen.TOPIC_LAUNCHED, mot(jeton), pid(n), mot('0x' + 'ab'.repeat(20))],
      data: '0x' + pad(quote) + pad('64') + pad('c8'), blockNumber: '0x' + bloc.toString(16), transactionHash: tx(n) });
    if (ne) N.push({ address: T.FACTORY_B20, topics: [T.TOPIC_B20_CREATED, mot(jeton)], data: '0x', blockNumber: '0x' + bloc.toString(16), transactionHash: tx(neTx) });
    const [x0, x1] = c0 ? [c0, c1] : (bas(quote) < bas(jeton) ? [quote, jeton] : [jeton, quote]);
    I.push({ address: gen.POOL_MANAGER, topics: [gen.TOPIC_INITIALIZE, pid(n), mot(x0), mot(x1)],
      data: '0x' + pad('0') + pad('c8') + pad(hook) + pad('1') + pad('0'), blockNumber: '0x' + bloc.toString(16), transactionHash: tx(poolTx) });
  };
  lance(1200, 1, A, ETH);                                   /* retenu */
  lance(2500, 2, BB, Q);                                    /* retenu ; Q (B20) = cote cotation */
  N.push({ address: T.FACTORY_B20, topics: [T.TOPIC_B20_CREATED, mot(Q)], data: '0x', blockNumber: '0x9c4', transactionHash: tx(2) }); /* Q ne dans la meme tx */
  lance(3100, 3, C, ETH);                                   /* hors B20 */
  lance(4000, 4, D, ETH, { neTx: 99 });                     /* B20 ne dans une autre tx */
  lance(4700, 5, E, ETH, { poolTx: 98 });                   /* pool creee dans une autre tx */
  lance(5300, 6, F, ETH, { c0: ETH, c1: G });               /* pool du lancement sans ce jeton */
  lance(6100, 7, EFIX, ETH);                                /* ensemble TB */
  lance(7000, 8, H, ETH);                                   /* retenu au lancement, MAIS pool sur nos hooks plus tard : */
  I.push({ address: gen.POOL_MANAGER, topics: [gen.TOPIC_INITIALIZE, '0x' + pad('beef'), mot(ETH), mot(H)],
    data: '0x' + pad('0') + pad('c8') + pad(G_.HOOK_V8) + pad('1') + pad('0'), blockNumber: '0x' + (8800).toString(16), transactionHash: tx(97) });
  lance(9900, 9, G, ETH);                                   /* retenu */
  /* bruit : pools d autres jetons, journaux de B20 non lances */
  for (let b = 150; b < 10000; b += 333) I.push({ address: gen.POOL_MANAGER, topics: [gen.TOPIC_INITIALIZE, '0x' + pad('9' + b), mot(ETH), mot(B('99' + b.toString(16).padStart(16, '0')))],
    data: '0x' + pad('0') + pad('3c') + pad('0') + pad('1') + pad('0'), blockNumber: '0x' + b.toString(16), transactionHash: tx(5000 + b) });
  return [...L, ...N, ...I];
}
function rpcFictif(logs, { limite = 700, tete = 10000, mort = null, intrus = false } = {}) {
  const f = { appels: 0, fenetresOk: [] };
  f.rpc = async (m, p) => {
    f.appels += 1;
    if (m === 'eth_blockNumber') return '0x' + tete.toString(16);
    if (m !== 'eth_getLogs') throw new Error('methode interdite : ' + m);
    const q = p[0]; const de = parseInt(q.fromBlock, 16), a = parseInt(q.toBlock, 16);
    if (a - de + 1 > limite) throw new Error('413 range too large');
    if (mort && de <= mort && mort <= a) throw new Error('503');
    const r = logs.filter((l) => bas(l.address) === bas(q.address) && l.topics[0] === q.topics[0]
      && parseInt(l.blockNumber, 16) >= de && parseInt(l.blockNumber, 16) <= a);
    if (intrus && r.length) r.push({ ...r[0], address: '0x' + '77'.repeat(20) });
    f.fenetresOk.push([bas(q.address), de, a]);
    return r;
  };
  return f;
}

async function banc(dir) {
  const res = []; const v = (id, c) => res.push({ id, ok: !!c });
  const gen = await imp(dir, 'outil-gen-nes-launchpads.mjs');
  const T = await imp(dir, 'index-routeur.js'); const TK = await imp(dir, 'tokenomics.js');
  const PS = await imp(dir, 'pool-sans-hook.js'); const NL = await imp(dir, 'jetons-nes-launchpads.js');
  const G_ = { gen, T, HOOK_V8: TK.HOOK_V8 };
  const logs = chaine(G_);
  const vite = () => Promise.resolve();
  const run = async (opts = {}, args = {}) => { const f = rpcFictif(logs, opts);
    try { return { f, r: await gen.generer({ rpc: f.rpc, de: 100, attendre: vite, pauseMs: 0, ...args }) }; } catch (e) { return { f, err: String(e.message || e) }; } };

  /* G1 fenetres */
  const { f, r } = await run();
  const parAdr = {}; for (const [ad, de, a] of f.fenetresOk) (parAdr[ad] ||= []).push([de, a]);
  const couvre = Object.values(parAdr).length === 3 && Object.values(parAdr).every((w) => w[0][0] === 100 && w[w.length - 1][1] === 10000
    && w.every((x, i) => i === 0 || x[0] === w[i - 1][1] + 1) && w.every((x) => x[1] - x[0] + 1 <= 700));
  v('G1 fenetres : 3 balayages, toute la plage 100..10000, sans trou ni recouvrement, chaque fenetre <= limite du RPC', couvre);
  v('G1 fenetre divisee par 2 sur erreur (413) puis lue', !!r && r.rapport.divisions.launched > 0 && r.rapport.divisions.init > 0);
  v('G1 seuls eth_blockNumber et eth_getLogs (le RPC fictif refuse le reste)', !!r && f.appels > 0);
  /* G2 arret */
  const mort = await run({ mort: 5555 });
  v('G2 fenetre morte : ARRET, aucun module produit', !mort.r && /ratee/.test(mort.err || ''));
  const intr = await run({ intrus: true });
  v('G2b journal hors filtre dans la reponse : ARRET', !intr.r && /ratee/.test(intr.err || ''));
  /* G3..G8 tri */
  const J = r ? r.jetons : [];
  v('G3 retenus : les lancements propres (A, BB, G), tries', JSON.stringify(J) === JSON.stringify([A, BB, G].sort()));
  v('G3 cote cotation jamais retenu (Q, B20 ne dans la tx du lancement de BB)', !!r && !J.includes(Q) && r.rapport.quotesB20HorsListe.includes(Q));
  v('G4 B20 ne dans une autre tx : exclu', !!r && !J.includes(D) && r.rapport.exclus.neAilleurs.includes(D));
  v('G5 hors B20 : exclu', !!r && !J.includes(bas(C)) && r.rapport.exclus.nonB20.includes(bas(C)));
  v('G6 ensemble TB (EFIX) : exclu', !!r && !J.includes(EFIX) && r.rapport.exclus.tb.includes(EFIX));
  v('G7 pool sur NOS hooks (V8) dans la plage : exclu, et la pool est rapportee', !!r && !J.includes(H) && r.rapport.exclus.surNosHooks.includes(H)
    && r.rapport.poolsNosHooks.length === 1);
  v('G8 pool du lancement dans une autre tx, ou sans ce jeton : exclu', !!r && !J.includes(E) && !J.includes(F)
    && r.rapport.exclus.sansPool.includes(E) && r.rapport.exclus.sansPool.includes(F));
  v('G8b comptes du rapport = listes', !!r && r.rapport.comptes.jetons === 3 && r.rapport.comptes.lancements === 9);
  /* G9 sortie deterministe et importable */
  const m1 = gen.ecrireModule({ jetons: [G, A, BB], de: 100, tete: 10000, comptes: { a: 1 } });
  const m2 = gen.ecrireModule({ jetons: [BB, G, A], de: 100, tete: 10000, comptes: { a: 1 } });
  const dt = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-gen-sortie-')); tmp.push(dt); const tmpf = path.join(dt, 'sortie.js'); fs.writeFileSync(tmpf, m1.replace(/\n/g, '\r\n'));
  const relu = await import(pathToFileURL(tmpf).href);
  v('G9 sortie deterministe (ordre d entree indifferent), LF, relue en CRLF = la liste', m1 === m2 && !m1.includes('\r')
    && JSON.stringify(relu.NES_LAUNCHPADS_O1) === JSON.stringify([A, BB, G].sort()) && relu.TETE_NES_LAUNCHPADS === 10000);
  let refus = false; try { gen.ecrireModule({ jetons: [A, '0xb2' + '0'.repeat(19) + '1' + '0'.repeat(18)], de: 1, tete: 2, comptes: {} }); } catch { refus = true; }
  v('G9b un jeton hors format B20 ne s ecrit pas', refus);
  /* G10 l ancienne liste doit etre contenue */
  const anc = await run({}, { ancienne: [A, D] });
  v('G10 un jeton de l ancienne liste absent : ARRET', !anc.r && /ancienne liste/.test(anc.err || ''));
  const anc2 = await run({}, { ancienne: [A] });
  v('G10b ancienne liste contenue : ok', !!anc2.r);
  /* G11 le fichier livre = la sortie du generateur */
  const livre = fs.readFileSync(path.join(dir, 'jetons-nes-launchpads.js'), 'utf8').replace(/\r\n/g, '\n');
  let regen = null; try { regen = gen.ecrireModule({ jetons: NL.NES_LAUNCHPADS_O1, de: NL.DE_NES_LAUNCHPADS, tete: NL.TETE_NES_LAUNCHPADS, comptes: NL.COMPTES_NES_LAUNCHPADS }); } catch {}
  v('G11 jetons-nes-launchpads.js = sortie du generateur, octet pour octet (apres CRLF -> LF)', regen === livre);
  v('G11b comptes du fichier = la liste ; plage depuis le deploiement o1', !!NL.COMPTES_NES_LAUNCHPADS && NL.COMPTES_NES_LAUNCHPADS.jetons === NL.NES_LAUNCHPADS_O1.length
    && NL.DE_NES_LAUNCHPADS === gen.BLOC_DEPLOIEMENT_O1 && gen.BLOC_DEPLOIEMENT_O1 === 50579785 && NL.TETE_NES_LAUNCHPADS > 52100212);
  /* G12 preuves sur la liste livree */
  const S = new Set(NL.NES_LAUNCHPADS_O1);
  v('G12 0 recouvrement avec l ensemble TB (22 jetons, C2 R9) ; chacun reste TB (ou devise connue) dans le code', TB22.length === 22
    && TB22.every((x) => !S.has(x)) && TB22.every((x) => PS.classeBlock(x) === 'TB' || (x === SPCX && PS.classeBlock(x) === null)));
  v('G12b 0 jeton de la liste sur la liste statique de nos hooks ; le generateur n a exclu aucun lance pour une pool sur nos hooks',
    PS.BLOCKS_SUR_NOS_HOOKS.every((x) => !S.has(x)) && !!NL.COMPTES_NES_LAUNCHPADS && NL.COMPTES_NES_LAUNCHPADS.surNosHooks === 0);
  /* G13 la ligne de commande : RPC injoignable -> code 1, fichier intact */
  const cible = path.join(dir, 'jetons-nes-launchpads.js'); const avant = fs.readFileSync(cible);
  let code = 0; try { execFileSync(process.execPath, [path.join(dir, 'outil-gen-nes-launchpads.mjs'), '--rpc', 'http://127.0.0.1:9', '--pause', '1', '--ecrire'],
    { stdio: 'pipe', env: { ...process.env, NODE_OPTIONS: '' } }); } catch (e) { code = e.status; }
  v('G13 ligne de commande, RPC injoignable : code 1, jetons-nes-launchpads.js intact', code === 1 && Buffer.compare(avant, fs.readFileSync(cible)) === 0);
  return res;
}

const tmp = [];
function copie(mutation) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-gen-')); tmp.push(dir);
  for (const f of fs.readdirSync(ICI)) if (/\.js$/.test(f) || f === 'package.json' || f === 'outil-gen-nes-launchpads.mjs') fs.copyFileSync(path.join(ICI, f), path.join(dir, f));
  for (const [fichier, de, vers] of (mutation ? mutation.edits : [])) {
    const p = path.join(dir, fichier); const src = fs.readFileSync(p, 'utf8'); const n = src.split(de).length - 1;
    if (n !== 1) throw new Error('mutant ' + mutation.nom + ' : motif trouve ' + n + ' fois dans ' + fichier + ' (attendu 1)');
    fs.writeFileSync(p, src.replace(de, vers));
  }
  return dir;
}
const O = 'outil-gen-nes-launchpads.mjs';
const MUTANTS = [
  { nom: 'm1 pas de division de fenetre', edits: [[O, 'if ((taille || rate > essais) && w > min) {', 'if (false) {']], casse: [/^G1 /] },
  { nom: 'm2 fenetre morte sautee en silence', edits: [[O, 'if (rate > essais) throw new Error(', 'if (rate > essais) { x = y + 1; rate = 0; continue; } if (false) throw new Error(']], casse: [/^G2 fenetre morte/] },
  { nom: 'm3 journaux non verifies', edits: [[O, 'throw new Error(`journal hors filtre dans ${x}-${y}`);', '{}']], casse: [/^G2b /] },
  { nom: 'm4 trou d un bloc entre fenetres', edits: [[O, 'x = y + 1;', 'x = y + 2;']], casse: [/^G1 fenetres/] },
  { nom: 'm5 cote cotation lu comme jeton lance', edits: [[O, 'jeton: adr(l.topics[1]), poolId', 'jeton: mots[0] && /^0+b2/.test(mots[0]) ? adr(mots[0]) : adr(l.topics[1]), poolId'],
    [O, "if (L.quote && t === L.quote) { exclus.quote.push(t); continue; }", '']], casse: [/^G3 cote cotation/] },
  { nom: 'm6 ne n importe ou (tx non comparee)', edits: [[O, 'if (!(neDans.get(t) || new Set()).has(L.tx))', 'if (!neDans.has(t))']], casse: [/^G4 /] },
  { nom: 'm7 prefixe B20 non exige', edits: [[O, 'if (!(RE_B20.test(t) && /^0x[0-9a-f]{40}$/.test(t)))', 'if (!(/^0x[0-9a-f]{40}$/.test(t)))']], casse: [/^G5 |^G3 retenus/] },
  { nom: 'm8 ensemble TB non exclu', edits: [[O, 'if (estTb(t)) {', 'if (false) {']], casse: [/^G6 /] },
  { nom: 'm9 pools sur nos hooks ignorees', edits: [[O, 'if (estNotre(i.hook)) {', 'if (false) {']], casse: [/^G7 /] },
  { nom: 'm9b balayage Initialize ne garde que les pools des lancements', edits: [[O, 'return ids.has(i.id) || estNotreHook(i.hook); }', 'return ids.has(i.id); }']], casse: [/^G7 /] },
  { nom: 'm10 pool du lancement non verifiee (tx, devise)', edits: [[O, 'if (!p || p.tx !== L.tx || (p.c0 !== t && p.c1 !== t))', 'if (!p)']], casse: [/^G8 /] },
  { nom: 'm11 sortie non triee', edits: [[O, 'const tri = [...jetons].sort();', 'const tri = [...jetons];']], casse: [/^G9 /] },
  { nom: 'm12 ancienne liste non exigee', edits: [[O, 'if (manque.length) throw', 'if (false) throw']], casse: [/^G10 /] },
  { nom: 'm13 fichier livre edite a la main (un jeton retire)', edits: [['jetons-nes-launchpads.js', '000648ac7599ab8601 ', '']], casse: [/^G11 /] },
  { nom: 'm14 un jeton TB (EFIX) ajoute a la main a la liste', edits: [['jetons-nes-launchpads.js', '000648ac7599ab8601 ', '000648ac7599ab8601 eedb997f91ceb22b8a ']], casse: [/^G11 /, /^G12 /] },
  { nom: 'm15 ecriture meme apres echec', edits: [[O, "principal(process.argv.slice(2)).catch((e) => {", "writeFileSync(fileURLToPath(new URL('./jetons-nes-launchpads.js', import.meta.url)), '/* vide */');\n  principal(process.argv.slice(2)).catch((e) => {"]], casse: [/^G13 /] },
];

let nAssert = 0, ko = 0;
const ok = (c, m) => { nAssert += 1; if (!c) { ko += 1; console.log('  KO ' + m); } };
try {
  const reel = await banc(ICI);
  for (const x of reel) ok(x.ok, 'depot : ' + x.id);
  console.log('depot : ' + reel.length + ' verifications, ' + reel.filter((x) => !x.ok).length + ' KO');
  const temoin = await banc(copie(null));
  ok(temoin.length === reel.length && temoin.every((x) => x.ok), 'copie non mutee : verte');
  for (const M of MUTANTS) {
    const r = await banc(copie(M));
    const rouges = r.filter((x) => !x.ok).map((x) => x.id);
    console.log('mutant ' + M.nom + ' : ' + rouges.length + ' rouge(s) — ' + rouges.join(' | '));
    ok(rouges.length > 0, 'mutant ' + M.nom + ' : le banc doit devenir ROUGE');
    for (const re of M.casse) ok(rouges.some((id) => re.test(id)), 'mutant ' + M.nom + ' : doit casser ' + re);
  }
} finally {
  for (const d of tmp) fs.rmSync(d, { recursive: true, force: true });
}
console.log(nAssert + ' assertions, ' + ko + ' KO');
if (nAssert === 0) { console.log('⛔ aucune assertion executee'); process.exit(1); }
process.exit(ko ? 1 : 0);
