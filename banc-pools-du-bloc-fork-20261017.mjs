/* banc-pools-du-bloc-fork-20261017.mjs — LA JAMBE D UN BLOCK COTE TOUTES SES POOLS ; LE MEILLEUR DEVIS GAGNE ; LE FRAIS ARRIVE OU DIT.
 *
 * POURQUOI (dig du 2026-10-17) : /api/cle de UNIT rend deux cles (ETH/hook 7030 et mmETH/hook tiers) ; le planificateur ne cotait
 *   que la cle du marche lu. Ce banc EXECUTE le planificateur serveur (rails-api.js planRail) sur un fork de Base, et lit les SOLDES.
 *   I.   UNIT reel (2 cles de /api/cle, lues en prod) : la cle mmETH est ecartee et dite ; achat ETH > UNIT execute sur la 7030 ;
 *        le wallet des frais recoit de l ETH, rien d autre.
 *   II.  rdstr reel (2 cles) : aucune des deux pools ne cote / n est admise -> rien ne se signe, le wallet des frais ne bouge pas.
 *   III. UNE SECONDE POOL UNIT/ETH sur NOTRE hook V8, ouverte SUR LE FORK (planLancement, compte impersonne) :
 *        A. V8 lancee MOINS chere -> ETH > UNIT et USDC > UNIT (jambe du block d un multi-sauts) passent par la V8 ; le compte recoit
 *           PLUS d UNIT qu avec le code d avant (HEAD, meme fork, meme instant : snapshot/revert) ; frais au wallet = celui du hook V8 ;
 *        B. V8 lancee PLUS chere -> la 7030 reste choisie (nouveau = ancien).
 * TEMOIN DE POOL : le slot0 (StateView) de CHAQUE pool avant/apres — la pool dont le prix a bouge est celle qui a ete tradee.
 * ⛔ BORNES : fork (comptes impersonnes, aucune cle, rien sur mainnet) ; la seconde pool UNIT/ETH n existe PAS sur mainnet (elle est
 *   fabriquee ici pour avoir deux pools de la meme paire) ; ne prouve ni l interface ni un vrai wallet.
 * Usage : "C:\Users\VolKov\.foundry\versions\base-v1.1.1\anvil.exe" --base --fork-url https://mainnet.base.org --port 9917
 *         node banc-pools-du-bloc-fork-20261017.mjs [http://127.0.0.1:9917] [dossier du code d avant, pour la comparaison] */
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:9917';
const AVANT = process.argv[3] || null;
const imp = (dir, f) => import(pathToFileURL(path.join(dir, f)).href);
const R = await imp(ICI, 'rails-api.js');
const Rv = AVANT ? await imp(AVANT, 'rails-api.js') : null;
const F = await imp(ICI, 'frais-creation.js');
const T = await imp(ICI, 'tokenomics.js');
const L = await imp(ICI, 'lancer-pool.js');
const L2 = await imp(ICI, 'lancer-pool-v2.js');
const P = await imp(ICI, 'pool.js');
let n = 0, ko = 0, idRpc = 0;
const ok = (c, m) => { n += 1; if (!c) { ko += 1; console.log('KO  ' + m); } else console.log('ok  ' + m); return c; };
const rpc = async (method, params) => {
  const r = await fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) }).then((x) => x.json());
  if (r.error) { const e = new Error(r.error.message); e.data = r.error.data; throw e; }
  return r.result;
};
const ETH = R.ETH, USDC = F.USDC_BASE.toLowerCase(), FRAIS = F.FEE_WALLET.toLowerCase();
const SV = L.V4_ADRESSES[8453].stateView;
const adrMot = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const solde = async (j, qui) => (j === ETH ? BigInt(await rpc('eth_getBalance', [qui, 'latest'])) : BigInt(await rpc('eth_call', [{ to: j, data: '0x70a08231' + adrMot(qui) }, 'latest'])));
const slot0 = async (cle) => BigInt(String(await rpc('eth_call', [{ to: SV, data: '0x' + P.selecteur('getSlot0(bytes32)') + P.poolId(cle).slice(2) }, 'latest'])).slice(0, 66));
async function envoyer(de, tx) {
  let gas = 3000000n;
  try { gas = BigInt(await rpc('eth_estimateGas', [{ from: de, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0' }])) * 13n / 10n; } catch (_) { /* on l envoie pour lire le status */ }
  const h = await rpc('eth_sendTransaction', [{ from: de, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0', gas: '0x' + gas.toString(16) }]);
  /* le fork lit l etat de mainnet a la demande : un recu peut mettre plus de 10 s — borne a 180 s (un recu absent n est pas un echec du contrat) */
  for (let i = 0; i < 1800; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return { status: r.status, gaz: BigInt(r.gasUsed) * BigInt(r.effectiveGasPrice || '0x0') }; await new Promise((o) => setTimeout(o, 100)); }
  throw new Error('receipt never came');
}
/* les cles REELLES, lues en prod (route mise en cache cote serveur) — copiees de la reponse, jamais de memoire */
const lireCles = async (a) => {
  const j = await fetch('https://tokenizedblock.space/api/cle/' + a, { headers: { 'x-ms-monitor': '1' } }).then((x) => x.json());
  if (!j || j.ok !== true || !Array.isArray(j.cles)) throw new Error('/api/cle ' + a + ' : ' + JSON.stringify(j).slice(0, 120));
  return j.cles.map((c) => ({ currency0: c.currency0, currency1: c.currency1, fee: c.fee, tickSpacing: c.tickSpacing, hooks: c.hooks }));
};
const UNIT = '0xb2000000000000000000007afa7ed748b0874f27';
const RDSTR = '0xb200000000000000000000282d6e57408885df98';
const clesReelles = { [UNIT]: await lireCles(UNIT), [RDSTR]: await lireCles(RDSTR) };
const cles = new Map(Object.entries(clesReelles));
const deps = () => ({ rpc, clesDe: async (a) => cles.get(String(a).toLowerCase()) || [] });
const plan = (Mod, de, vers, montant, compte) => Mod.planRail({ de, vers, montant: String(montant), compte }, deps());
async function trader(Mod, nom, de, vers, montant, compte, jetons, pools) {
  const avant = { c: {}, f: {} }, s0 = [];
  for (const j of jetons) { avant.c[j] = await solde(j, compte); avant.f[j] = await solde(j, FRAIS); }
  for (const c of pools) s0.push(await slot0(c));
  let p = await plan(Mod, de, vers, montant, compte), gaz = 0n, tours = 0;
  while (p.etat === 'APPROBATIONS' && tours < 3) {
    tours += 1;
    for (const c of p.aSigner) { const r = await envoyer(compte, c); gaz += r.gaz; if (r.status !== '0x1') return { etat: 'APPROBATION_REVERTEE' }; }
    p = await plan(Mod, de, vers, montant, compte);
  }
  if (p.etat !== 'PRET') return { etat: p.etat, pourquoi: p.pourquoi, via: p.via, pools: p.pools };
  const st = [];
  for (const c of p.aSigner) { const r = await envoyer(compte, c); gaz += r.gaz; st.push(r.status); if (r.status !== '0x1') break; }
  if (!ok(st.every((s) => s === '0x1'), nom + ' : plan PRET (' + p.via + ') execute sans revert')) return { etat: 'REVERTE' };
  const d = { c: {}, f: {} };
  for (const j of jetons) { d.c[j] = await solde(j, compte) - avant.c[j]; d.f[j] = await solde(j, FRAIS) - avant.f[j]; }
  if (d.c[ETH] !== undefined) d.c[ETH] += gaz;
  const bouge = [];
  for (const [i, c] of pools.entries()) if ((await slot0(c)) !== s0[i]) bouge.push(i);
  return { etat: 'EXECUTE', via: p.via, recu: d.c[vers], paye: -d.c[de], frais: jetons.filter((j) => d.f[j] !== 0n).map((j) => [j, d.f[j]]), resume: p.resume, pools: p.pools, bouge };
}
const nom = (j) => (j === ETH ? 'ETH' : j === USDC ? 'USDC' : j === UNIT ? 'UNIT' : j === RDSTR ? 'rdstr' : j.slice(0, 8));
const fr = (r) => r.frais.map(([j, v]) => v + ' ' + nom(j)).join(' + ') || 'rien';

const chaine = parseInt(await rpc('eth_chainId', []), 16), tete = parseInt(await rpc('eth_blockNumber', []), 16);
console.log('fork ' + URL_FORK + ' · chaine ' + chaine + ' · bloc ' + tete + (AVANT ? ' · code d avant : ' + AVANT : ' · (sans comparaison au code d avant)'));
if (!ok(chaine === 8453, 'le fork est Base')) process.exit(1);
ok(clesReelles[UNIT].length === 2 && clesReelles[RDSTR].length === 2, '/api/cle : UNIT et rdstr ont chacun 2 cles (' + clesReelles[UNIT].length + ', ' + clesReelles[RDSTR].length + ')');
const K7030 = clesReelles[UNIT].find((c) => String(c.hooks).toLowerCase() === T.HOOK_7030.toLowerCase());
const KMM = clesReelles[UNIT].find((c) => c !== K7030);
if (!ok(!!K7030 && !!KMM, 'UNIT : une cle ETH/7030 et une autre (' + (KMM && KMM.currency0) + ')')) process.exit(1);

const compte = '0x' + ('b10c' + tete).padEnd(40, 'e').slice(0, 40);
await rpc('anvil_impersonateAccount', [compte]);
await rpc('anvil_setBalance', [compte, '0x' + (50n * 10n ** 18n).toString(16)]);
const snap0 = await rpc('evm_snapshot', []);
try {
  /* ── I. UNIT reel ── */
  const a1 = await trader(R, 'I. ETH > UNIT (2 cles reelles)', ETH, UNIT, 10n ** 15n, compte, [ETH, UNIT], [K7030]);
  if (ok(a1.etat === 'EXECUTE', 'I. ETH > UNIT : ' + a1.etat + (a1.pourquoi ? ' (' + a1.pourquoi + ')' : ''))) {
    ok(/set aside/.test(String(a1.pools || '')) && /another pair/.test(String(a1.pools || '')), 'I. la cle mmETH est ecartee ET dite : ' + a1.pools);
    ok(a1.bouge.length === 1 && a1.bouge[0] === 0, 'I. la pool 7030 est celle qui a bouge');
    ok(a1.recu > 0n, 'I. le compte recoit ' + a1.recu + ' UNIT pour ' + a1.paye + ' wei');
    ok(a1.frais.length === 1 && a1.frais[0][0] === ETH && a1.frais[0][1] > 0n, 'I. le wallet des frais recoit de l ETH, et rien d autre : ' + fr(a1));
  }
  /* ── II. rdstr reel ── */
  for (const [de, vers, mt] of [[ETH, RDSTR, 10n ** 15n], [RDSTR, ETH, 10n ** 18n]]) {
    const r = await trader(R, 'II. ' + nom(de) + ' > ' + nom(vers), de, vers, mt, compte, [ETH, RDSTR], []);
    ok(r.etat !== 'EXECUTE' && r.etat !== 'PRET', 'II. ' + nom(de) + ' > ' + nom(vers) + ' : rien a signer (' + r.etat + ' : ' + String(r.pourquoi || '').slice(0, 140) + ')');
    console.log('     pools : ' + (r.pools || '(aucune phrase : le marche n a pas ete lu, ou une seule cle)'));
  }
  /* ── III. une seconde pool UNIT/ETH sur notre hook V8, ouverte sur le fork ── */
  const KV8 = { currency0: ETH, currency1: UNIT, fee: 0, tickSpacing: 200, hooks: T.HOOK_V8 };
  ok((await slot0(KV8)) === 0n, 'III. avant : aucune pool UNIT/ETH V8 sur la chaine (on la fabrique ici)');
  const graine = await trader(R, 'III. ETH > UNIT (graine du lanceur)', ETH, UNIT, 2n * 10n ** 16n, compte, [ETH, UNIT], [K7030]);
  if (!ok(graine.etat === 'EXECUTE' && graine.recu > 0n, 'III. le lanceur detient ' + (graine.recu || 0n) + ' UNIT')) throw new Error('graine');
  /* ⛔ le V8 n inscrit que le CREATEUR du block (custom error 0x37d927c1 pour un autre compte, mesure sur ce fork) : les UNIT de la
   *   graine lui sont transferees, et c est lui (impersonne, adresse LUE dans banc-unit-lancement-fork-20261017.mjs) qui lance. */
  const CREATEUR = ((await import('node:fs')).readFileSync(path.join(ICI, 'banc-unit-lancement-fork-20261017.mjs'), 'utf8').match(/CREATEUR \|\| '(0x[0-9a-f]{40})'/) || [])[1];
  if (!ok(/^0x[0-9a-f]{40}$/.test(String(CREATEUR)), 'III. le createur de UNIT se lit dans banc-unit-lancement-fork-20261017.mjs (' + CREATEUR + ')')) throw new Error('createur');
  await rpc('anvil_impersonateAccount', [CREATEUR]);
  await rpc('anvil_setBalance', [CREATEUR, '0x' + (5n * 10n ** 18n).toString(16)]);
  const tr = await envoyer(compte, { to: UNIT, data: '0xa9059cbb' + adrMot(CREATEUR) + graine.recu.toString(16).padStart(64, '0') });
  if (!ok(tr.status === '0x1', 'III. les ' + graine.recu + ' UNIT de la graine passent au createur')) throw new Error('transfert');
  const prixCourant = await slot0(K7030);
  console.log('     7030 sqrtPriceX96 apres graine : ' + prixCourant);
  for (const [cas, valo] of [['A (V8 moins chere)', 5], ['B (V8 plus chere)', 40]]) {
    const snap = await rpc('evm_snapshot', []);
    try {
      /* le V8 exige l inscription payee (`inscrire`, lancer-pool-v2.js) avant l ouverture : meme chemin que l app */
      const planL = async () => L2.completerInscriptionPayee({ rpc, compte: CREATEUR, fraisWei: 300000000000000n, hook: T.HOOK_V8,
        plan: await L.planLancement({ rpc, chaine: 8453, jeton: UNIT, compte: CREATEUR, valorisationEth: valo, partPourMille: 999, hooks: T.HOOK_V8, quoteEthWei: 0n,
          maintenant: Number(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp)) * 1000 }) });
      let pl = await planL(), lanc = true, toursL = 0;
      while (pl.etat === 'APPROBATIONS' && toursL < 3 && lanc) {
        toursL += 1;
        for (const e of (pl.etapes || [])) { const r = await envoyer(CREATEUR, e); if (r.status !== '0x1') { lanc = false; break; } }
        pl = await planL();
      }
      if (!ok(pl.etat === 'PRET' && !!pl.tx, 'III.' + cas + ' planLancement V8 a ' + valo + ' ETH : ' + pl.etat + ' ' + (pl.pourquoi || '') + ' (approbations : ' + toursL + ' tour(s))')) continue;
      if (lanc) { const r = await envoyer(CREATEUR, pl.tx); lanc = r.status === '0x1'; console.log('     lancement : status ' + r.status + ' · cle ' + JSON.stringify(pl.cle)); }
      /* la cle EXACTE que planLancement a construite (jamais supposee) ; elle doit etre UNIT/ETH sur le hook V8 */
      if (!ok(pl.cle && String(pl.cle.hooks).toLowerCase() === T.HOOK_V8.toLowerCase() && String(pl.cle.currency0).toLowerCase() === ETH, 'III.' + cas + ' la cle lancee est UNIT/ETH sur le hook V8')) continue;
      Object.assign(KV8, { fee: Number(pl.cle.fee), tickSpacing: Number(pl.cle.tickSpacing) });
      const sV8 = await slot0(KV8);
      if (!ok(lanc && sV8 !== 0n, 'III.' + cas + ' la pool V8 existe (status 1, sqrtPriceX96 ' + sV8 + ')')) continue;
      cles.set(UNIT, [...clesReelles[UNIT], KV8]);
      const montant = 10n ** 15n;
      const s1 = await rpc('evm_snapshot', []);
      const neuf = await trader(R, 'III.' + cas + ' NOUVEAU ETH > UNIT', ETH, UNIT, montant, compte, [ETH, UNIT], [K7030, KV8]);
      await rpc('evm_revert', [s1]);
      const s1b = await rpc('evm_snapshot', []);
      const vieux = Rv ? await trader(Rv, 'III.' + cas + ' AVANT ETH > UNIT', ETH, UNIT, montant, compte, [ETH, UNIT], [K7030, KV8]) : null;
      await rpc('evm_revert', [s1b]);
      if (!ok(neuf.etat === 'EXECUTE', 'III.' + cas + ' nouveau : ' + neuf.etat + ' ' + (neuf.pourquoi || ''))) continue;
      const attendue = cas.startsWith('A') ? 1 : 0;
      ok(neuf.bouge.length === 1 && neuf.bouge[0] === attendue, 'III.' + cas + ' nouveau : la pool tradee est la ' + (attendue ? 'V8' : '7030') + ' (bougees : ' + neuf.bouge.map((i) => (i ? 'V8' : '7030')).join(',') + ')');
      ok(neuf.frais.length === 1 && neuf.frais[0][0] === ETH && neuf.frais[0][1] > 0n, 'III.' + cas + ' nouveau : frais en ETH seulement, au wallet des frais : ' + fr(neuf) + ' (' + (Number(neuf.frais[0] ? neuf.frais[0][1] : 0n) * 10000 / Number(montant)).toFixed(2) + ' bps de ' + montant + ' wei)');
      console.log('     nouveau : ' + neuf.recu + ' UNIT pour ' + neuf.paye + ' wei · ' + neuf.pools);
      if (vieux) {
        ok(vieux.etat === 'EXECUTE' && vieux.bouge.length === 1 && vieux.bouge[0] === 0, 'III.' + cas + ' AVANT : le code d avant trade la 7030 quoi qu il arrive (bougees : ' + (vieux.bouge || []).map((i) => (i ? 'V8' : '7030')).join(',') + ')');
        console.log('     avant   : ' + vieux.recu + ' UNIT pour ' + vieux.paye + ' wei · frais ' + fr(vieux));
        if (cas.startsWith('A')) ok(neuf.recu > vieux.recu, 'III.A le compte recoit PLUS avec le nouveau code : ' + neuf.recu + ' > ' + vieux.recu + ' UNIT (+' + ((Number(neuf.recu - vieux.recu) / Number(vieux.recu)) * 100).toFixed(2) + ' %)');
        else ok(neuf.recu === vieux.recu, 'III.B nouveau = avant quand la 7030 est meilleure : ' + neuf.recu + ' = ' + vieux.recu);
      }
      /* la jambe du block d un multi-sauts : USDC > UNIT (USDC -> ETH -> UNIT), le resolveur `resolveurAvec` */
      if (cas.startsWith('A')) {
        const u = await trader(R, 'III.A ETH > USDC (mise en place)', ETH, USDC, 10n ** 16n, compte, [ETH, USDC], []);
        if (ok(u.etat === 'EXECUTE' && u.recu > 0n, 'III.A le compte detient ' + (u.recu || 0n) + ' USDC (unites)')) {
          const mu = u.recu / 2n;
          const s2 = await rpc('evm_snapshot', []);
          const m1 = await trader(R, 'III.A NOUVEAU USDC > UNIT', USDC, UNIT, mu, compte, [ETH, USDC, UNIT], [K7030, KV8]);
          await rpc('evm_revert', [s2]);
          const m0 = Rv ? await trader(Rv, 'III.A AVANT USDC > UNIT', USDC, UNIT, mu, compte, [ETH, USDC, UNIT], [K7030, KV8]) : null;
          if (ok(m1.etat === 'EXECUTE', 'III.A nouveau USDC > UNIT : ' + m1.etat + ' ' + (m1.pourquoi || '') + ' via ' + m1.via)) {
            ok(m1.bouge.length === 1 && m1.bouge[0] === 1, 'III.A multi-sauts : la jambe du block passe par la V8 (bougees : ' + m1.bouge.map((i) => (i ? 'V8' : '7030')).join(',') + ')');
            ok(m1.frais.length === 1 && m1.frais[0][0] === ETH, 'III.A multi-sauts : UN frais, en ETH (hook V8 ; routeur 0) : ' + fr(m1) + ' · fraisParHook ' + (m1.resume && m1.resume.fraisParHook));
            console.log('     nouveau : ' + m1.recu + ' UNIT pour ' + m1.paye + ' USDC (unites)');
          }
          if (m0) {
            ok(m0.etat === 'EXECUTE' && m0.bouge[0] === 0, 'III.A AVANT multi-sauts : la jambe du block passe par la 7030 (' + m0.etat + ')');
            console.log('     avant   : ' + m0.recu + ' UNIT pour ' + m0.paye + ' USDC (unites) · frais ' + fr(m0));
            if (m1.etat === 'EXECUTE' && m0.etat === 'EXECUTE') ok(m1.recu > m0.recu, 'III.A multi-sauts : PLUS d UNIT avec le nouveau code : ' + m1.recu + ' > ' + m0.recu);
          }
        }
        /* LA VENTE (la jambe du block d un block -> ETH -> USDC, et la vente directe) : les deux pools ont de l ETH (graine sur la 7030,
         *   un achat sur la V8). La V8 donne PLUS d UNIT par ETH, donc MOINS d ETH par UNIT : a la vente, c est la 7030 qui doit gagner. */
        const sv = await rpc('evm_snapshot', []);
        try {
          const seed = await trader(R, 'III.A achat sur la V8 (de l ETH dans la V8)', ETH, UNIT, 5n * 10n ** 15n, compte, [ETH, UNIT], [K7030, KV8]);
          if (ok(seed.etat === 'EXECUTE' && seed.bouge[0] === 1, 'III.A la V8 recoit ' + seed.paye + ' wei (bougees : ' + (seed.bouge || []).map((i) => (i ? 'V8' : '7030')).join(',') + ')')) {
            const qte = seed.recu / 4n;
            for (const [vers, libelle] of [[ETH, 'UNIT > ETH (vente directe)'], [USDC, 'UNIT > USDC (block -> ETH -> USDC)']]) {
              const s4 = await rpc('evm_snapshot', []);
              const v1 = await trader(R, 'III.A NOUVEAU ' + libelle, UNIT, vers, qte, compte, [ETH, USDC, UNIT], [K7030, KV8]);
              await rpc('evm_revert', [s4]);
              const s5 = await rpc('evm_snapshot', []);
              const v0 = Rv ? await trader(Rv, 'III.A AVANT ' + libelle, UNIT, vers, qte, compte, [ETH, USDC, UNIT], [K7030, KV8]) : null;
              await rpc('evm_revert', [s5]);
              if (!ok(v1.etat === 'EXECUTE', 'III.A nouveau ' + libelle + ' : ' + v1.etat + ' ' + (v1.pourquoi || '') + ' via ' + v1.via)) continue;
              ok(v1.bouge.length === 1 && v1.bouge[0] === 0, 'III.A nouveau ' + libelle + ' : la 7030 (meilleure a la vente) est tradee (bougees : ' + v1.bouge.map((i) => (i ? 'V8' : '7030')).join(',') + ')');
              ok(v1.frais.length === 1 && v1.frais[0][0] === ETH && !v1.frais.some(([j]) => j === UNIT), 'III.A nouveau ' + libelle + ' : UN frais, en ETH, jamais en block : ' + fr(v1));
              console.log('     nouveau : ' + v1.recu + ' ' + nom(vers) + ' pour ' + qte + ' UNIT · ' + (v1.pools || '(phrase de pools non rendue sur ce chemin)'));
              if (v0) {
                console.log('     avant   : ' + v0.recu + ' ' + nom(vers) + ' · frais ' + fr(v0) + ' · bougees ' + (v0.bouge || []).map((i) => (i ? 'V8' : '7030')).join(','));
                ok(v0.etat === 'EXECUTE' && v1.recu === v0.recu, 'III.A ' + libelle + ' : nouveau = avant quand la pool du marche lu est la meilleure (' + v1.recu + ' = ' + v0.recu + ')');
              }
            }
          }
        } finally { await rpc('evm_revert', [sv]); }
      }
    } finally { await rpc('evm_revert', [snap]); cles.set(UNIT, clesReelles[UNIT]); }
  }
} finally { await rpc('evm_revert', [snap0]); }
console.log((n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) — fork rendu a son etat d avant le banc');
process.exit(ko ? 1 : 0);
