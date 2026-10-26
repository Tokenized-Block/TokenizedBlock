// muter-wallet-fiat-20261026.mjs — chaque mutant est une COPIE de wallet-fiat.js (wallet-fiat.mutant.js, effacee apres) ;
// le banc test-wallet-fiat-20261026.mjs doit la TUER (sortie non nulle). Le fichier suivi n est jamais ecrit.
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('./wallet-fiat.js', import.meta.url));
const copie = fileURLToPath(new URL('./wallet-fiat.mutant.js', import.meta.url));
const banc = fileURLToPath(new URL('./test-wallet-fiat-20261026.mjs', import.meta.url));
const orig = readFileSync(src, 'utf8');
const MUTANTS = [
  ['MoonPay promis en mode test (pret suffit)', "const rail = choisirRail({ coinbaseMoyens: moyensCb, moonpay: mp || null });",
    "const rail = mp && mp.pret === true ? 'moonpay' : choisirRail({ coinbaseMoyens: moyensCb, moonpay: mp || null });"],
  ['MoonPay : liste de pays recopiee de la recherche', "etatMp = 'MoonPay is not offered for ' + actif",
    "etatMp = 'MoonPay: coming for NG, MX, KR, ZA, TR. MoonPay is not offered for ' + actif"],
  ['EURC offert dans « a venir » (ban retire)', "return liste.filter((x) => !DEVISES_BANNIES.has(x.adr) && !routees.has(x.adr))",
    "return liste.filter((x) => !routees.has(x.adr))"],
  ['EURC dans les monnaies locales (ban retire)', "if (!adr || DEVISES_BANNIES.has(adr)) continue;", "if (!adr) continue;"],
  ['ETH avant USDC', "['USDC', 'ETH'].filter((a) => ACTIFS_CARTE.includes(a))", "['ETH', 'USDC'].filter((a) => ACTIFS_CARTE.includes(a))"],
  ['achat AUDF toujours ouvert (bouton mort)', 'const achat = offerts.has(adr);', 'const achat = true;'],
  ['chiffre recite (pool AUDF arrondie a la main)', "usdcPool: '25103701609'", "usdcPool: '25000000000'"],
  ['frais Coinbase non dits', "' ' + PHRASE_FRAIS_COINBASE, moonpay: etatMp", "'', moonpay: etatMp"],
];
let tues = 0;
const lignes = [];
for (const [nom, de, vers] of MUTANTS) {
  if (!orig.includes(de)) { lignes.push('INAPPLICABLE ' + nom); continue; }
  writeFileSync(copie, orig.replace(de, vers));
  const r = spawnSync(process.execPath, [banc], { env: { ...process.env, MODULE_FIAT: copie }, encoding: 'utf8' });
  const mort = r.status !== 0;
  if (mort) tues++;
  lignes.push((mort ? 'TUE      ' : 'SURVIT   ') + nom + (mort ? ' — ' + String(r.stderr).split('\n').find((l) => /AssertionError|Error/.test(l)) : ''));
}
rmSync(copie, { force: true });
console.log(lignes.join('\n'));
console.log('mutants : ' + tues + '/' + MUTANTS.length + ' tues');
if (tues !== MUTANTS.length) process.exit(1);
