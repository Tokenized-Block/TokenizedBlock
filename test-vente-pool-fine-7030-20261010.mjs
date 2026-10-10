/* test-vente-pool-fine-7030-20261010.mjs — une pool v4 qui REVERT a cette taille mais cote une fraction est TROP FINE (REFUSE nomme),
 * pas « introuvable » (NON_MESURE). Cas mesure : vente de E.T.FFB (hook 7030, pool ETH/E.T.FFB d un seul cote) — le quoter rend
 * UnexpectedRevertBytes(NotEnoughLiquidity) au-dela de ~988 E.T.FFB (publicnode, bloc ~52 437 600).
 * Hors ligne (stubs). Temoin negatif : tout revert -> NON_MESURE inchange. Chemin heureux : aucune lecture de plus.
 * Mutant : la sonde retiree de meilleureClePourMontant -> ce test doit rougir. */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
const ici = dirname(fileURLToPath(import.meta.url));
let ok = 0, ko = 0;
const verifier = (c, nom) => { if (c) { ok += 1; console.log('ok  ' + nom); } else { ko += 1; console.log('KO  ' + nom); } };
const BLOC = '0xb200000000000000000000e0e18f3d8fd5a50164', ETH = '0x0000000000000000000000000000000000000000';
const H7030 = '0x32f3f572dd17625bab9035789c953e1d001864cc';
const CAND = [{ fee: 0, tickSpacing: 200, hooks: H7030 }, { fee: 500, tickSpacing: 10, hooks: ETH }];
const SEUIL = 988n * 10n ** 18n;
/* le quoter : la cle hookee cote jusqu a SEUIL et revert au-dessus ; l autre cle revert toujours */
function stub({ fine = true, morte = false } = {}) {
  const lus = [];
  const rpc = async (m, p) => {
    if (m !== 'eth_call') throw new Error('unexpected ' + m);
    const d = String(p[0].data);
    lus.push(d);
    const hookee = d.toLowerCase().includes(H7030.slice(2));
    const montant = BigInt('0x' + d.slice(10 + 64 * 7, 10 + 64 * 8));
    if (morte || !hookee) throw new Error('execution reverted');
    if (fine && montant > SEUIL) throw new Error('execution reverted');
    return '0x' + (montant / 10n ** 8n).toString(16).padStart(64, '0') + '0'.repeat(64);
  };
  return { rpc, lus };
}
async function juger(mod, etiquette) {
  const { meilleureClePourMontant } = mod;
  const m = 10n ** 23n;
  const s1 = stub();
  const r1 = await meilleureClePourMontant({ rpc: s1.rpc, chaine: 8453, de: BLOC, vers: ETH, montant: m, candidates: CAND });
  verifier(r1.etat === 'REFUSE' && r1.poolTropFine === true, etiquette + ' 1e23 E.T.FFB : REFUSE poolTropFine (rendu ' + r1.etat + ')');
  verifier(/too thin/.test(String(r1.pourquoi)) && r1.fractionCotee === 1000, etiquette + ' raison nommee, fraction 1/1000');
  verifier(s1.lus.length <= CAND.length + 3 * CAND.length, etiquette + ' au plus 3 sondes par candidat (' + s1.lus.length + ' lectures)');
  const s2 = stub({ morte: true });
  const r2 = await meilleureClePourMontant({ rpc: s2.rpc, chaine: 8453, de: BLOC, vers: ETH, montant: m, candidates: CAND });
  verifier(r2.etat === 'NON_MESURE' && /no v4 pool among the 2 tried/.test(r2.pourquoi), etiquette + ' temoin : tout revert -> NON_MESURE inchange');
  const s3 = stub();
  const r3 = await meilleureClePourMontant({ rpc: s3.rpc, chaine: 8453, de: BLOC, vers: ETH, montant: 500n * 10n ** 18n, candidates: CAND });
  verifier(r3.etat === 'OK' && r3.tickSpacing === 200, etiquette + ' 500 E.T.FFB : OK sur la cle hookee');
  verifier(s3.lus.length === CAND.length, etiquette + ' chemin heureux : 0 lecture de plus (' + s3.lus.length + ')');
}
const vrai = await import(pathToFileURL(join(ici, 'echange.js')).href);
await juger(vrai, 'VRAI');
const avant = ok, avantKo = ko;
/* mutant : la sonde de meilleureClePourMontant retiree */
const src = readFileSync(join(ici, 'echange.js'), 'utf8').replace(/\r\n/g, '\n'); /* worktree Windows : CRLF */
const debut = src.search(/    for \(let i = 0; i < essais\.length; i \+= 1\) \{\s*const e = essais\[i\];/);
let mutantTue = false;
if (debut < 0) { verifier(false, 'MUTANT : ancre de la sonde introuvable'); }
else {
  const fin = src.indexOf('    return { etat: \'NON_MESURE\', cle: null', debut);
  const f = join(ici, 'echange.mutant-' + process.pid + '.mjs');
  writeFileSync(f, src.slice(0, debut) + src.slice(fin));
  try {
    ok = 0; ko = 0;
    await juger(await import(pathToFileURL(f).href), 'MUTANT');
    mutantTue = ko > 0;
  } finally { unlinkSync(f); }
  ok = avant; ko = avantKo;
  verifier(mutantTue, 'mutant sans sonde TUE');
}
console.log((ko ? 'ROUGE' : 'VERT') + ' ' + ok + '/' + ko);
process.exit(ko ? 1 : 0);
