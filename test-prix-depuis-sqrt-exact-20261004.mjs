/* test-prix-depuis-sqrt-exact-20261004.mjs — pool.js `prixDepuisSqrt` EXACT en BigInt (cbBTC ne tombe plus a « no market »).
 *
 * D OU IL VIENT. Correctif et test de Grok Bot (patch `0001-paires-mortes-prix-cbbtc-b274c78.patch`, sha256 ece3387b…e3e7, sim fork
 *   des 62 devises du hook 7030 le 2026-10-04) : un block appaire a cbBTC (8 decimales contre 18) avait une pool, et l app disait
 *   « this block has no market to trade on yet » — la virgule fixe a 64 bits tombait a 0 sous 2^-64 (ratio 3e-20).
 *   Phil a autorise la lecture du patch ; il est REECRIT ici a la main sur le code actuel (`git am` m est refuse). Cette moitie
 *   du test est la sienne (reference independante en BigInt decimal, 3 000 prix tires au hasard).
 * ⛔ CE QUI N EST PAS REPRIS, et pourquoi : l autre moitie du patch (paires « mortes » grisees a Create). Telle qu ecrite elle est
 *   FAIL-CLOSED sur une affordance — une lecture ratee grise TOUTES les paires sauf ETH avec « market not born yet », ce qui est
 *   faux quand c est NOTRE lecture qui a echoue (le depot a deja paye ce motif : puces 13 -> 2 en prod le 2026-09-29) — et elle
 *   ajoute 62 lectures de prix + 62 `totalSupply` par chargement sur des noeuds deja en 429. A refaire avec un verdict calcule
 *   UNE fois cote serveur et trois etats (ne / pas ne / non lu). */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const DIR = process.env.DIR || path.dirname(fileURLToPath(import.meta.url));
let ko = 0, n = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const P = await import(pathToFileURL(path.join(DIR, 'pool.js')).href + '?' + Math.random());
/* reference independante : 40 chiffres significatifs en BigInt decimal */
const ref = (s, dD, dB, d0) => {
  const num = d0 ? (1n << 192n) * 10n ** BigInt(dB) : s * s * 10n ** BigInt(dB), den = d0 ? s * s * 10n ** BigInt(dD) : (1n << 192n) * 10n ** BigInt(dD);
  const e = num.toString().length - den.toString().length - 40; const q = e >= 0 ? num / (den * 10n ** BigInt(e)) : num * 10n ** BigInt(-e) / den;
  return Number(q.toString().slice(0, 17) + 'e' + (q.toString().length - 17 + e));
};
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const cb = P.prixDepuisSqrt({ sqrtPriceX96: 14083906235069129859n, decDevise: 8, decBlock: 18, deviseEst0: false });
ok(cb !== null && rel(cb, ref(14083906235069129859n, 8, 18, false)) < 1e-12, 'cbBTC (valeur de la sim fork de Grok) : ' + cb + ' — plus null');
ok(rel(P.prixDepuisSqrt({ sqrtPriceX96: 1n << 96n, decDevise: 18, decBlock: 18, deviseEst0: true }), 1) < 1e-15, 'prix 1:1 exact');
/* tirage REPRODUCTIBLE (pas de Math.random : un rouge doit se rejouer) */
let graine = 20261004;
const alea = () => { graine = (Math.imul(graine, 1664525) + 1013904223) >>> 0; return graine / 2 ** 32; };
let pire = 0, nuls = 0, juges = 0;
for (let i = 0; i < 3000; i++) {
  const bits = 33 + Math.floor(alea() * 126); let s = 1n << BigInt(bits - 1); s += BigInt(Math.floor(alea() * 2 ** 50)) << BigInt(Math.max(0, bits - 52));
  const dD = [0, 6, 8, 18][i % 4], dB = 18, d0 = i % 2 === 0; const r = ref(s, dD, dB, d0);
  if (!(r > 0) || !Number.isFinite(r) || r < 1e-300) continue;
  juges += 1;
  const v = P.prixDepuisSqrt({ sqrtPriceX96: s, decDevise: dD, decBlock: dB, deviseEst0: d0 }); if (v === null) { nuls += 1; continue; } pire = Math.max(pire, rel(v, r));
}
ok(juges > 2000, juges + ' prix juges sur 3000 tires (le reste sort du domaine d un double)');
ok(nuls === 0, 'aucun prix valide rendu null par sous-precision (' + nuls + ')');
ok(pire < 1e-12, 'ecart relatif maximal a la reference : ' + pire);
ok(P.prixDepuisSqrt({ sqrtPriceX96: 0n, decDevise: 6, decBlock: 18, deviseEst0: false }) === null && P.prixDepuisSqrt({ sqrtPriceX96: 'x', decDevise: 6, decBlock: 18, deviseEst0: false }) === null
  && P.prixDepuisSqrt({ sqrtPriceX96: 1n << 96n, decDevise: 40, decBlock: 18, deviseEst0: false }) === null, 'entrees invalides -> null (jamais 0, qui se lirait « gratuit »)');
/* TEMOIN : l ancienne formule, rejouee ici, rend bien 0 sur cbBTC — c est elle qui fermait le marche */
const ancien = (s) => Number((s * s * (1n << 64n)) / (1n << 192n)) / Number(1n << 64n);
ok(ancien(14083906235069129859n) === 0, 'temoin : l ancienne virgule fixe a 64 bits rend 0 sur ce prix (donc « no market »)');
console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions)');
process.exit(ko ? 1 : 0);
