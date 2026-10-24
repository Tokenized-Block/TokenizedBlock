/* muter-misables-20261024.mjs — chaque garde de misables.js est RETIREE une a la fois dans une COPIE (.mutant-misables-<pid>.js, a cote du
 * module pour ses imports relatifs, effacee a la fin) ; test-misables-20261024 (MISABLES_MODULE) doit rougir. Le module du depot n est
 * jamais ecrit. Usage : node muter-misables-20261024.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const original = fs.readFileSync(path.join(ICI, 'misables.js'), 'utf8');
const COPIE = path.join(ICI, '.mutant-misables-' + process.pid + '.js');
const lancer = () => {
  try { execFileSync(process.execPath, [path.join(ICI, 'test-misables-20261024.mjs')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, MISABLES_MODULE: COPIE } }); return true; }
  catch (_) { return false; }
};
const M = [
  ['approve ILLIMITE au routeur', 'const ap = calldataApprove({ token: jetonIn, montant: maxIn, beneficiaire: ROUTEUR_AERODROME_CL });', "const ap = { etat: 'PRET', ...approveBrut(jetonIn, ROUTEUR_AERODROME_CL, UINT256_MAX) };"],
  ['devis PERIME accepte', 'if (bt - bq > DEVIS_BLOCS_MAX) return', 'if (false && bt - bq > DEVIS_BLOCS_MAX) return'],
  ['devis d un bloc FUTUR accepte', "if (bq > bt) return refuse('DEVIS_PERIME'", "if (false) return refuse('DEVIS_PERIME'"],
  ['MAUVAIS destinataire du swap (frais 0 : le routeur)', 'const destSwap = f > 0n ? ROUTEUR_AERODROME_CL : bas(compte);', 'const destSwap = ROUTEUR_AERODROME_CL;'],
  ['MAUVAIS destinataire du balayage (le wallet des frais)', 'amountMinimum: besoin, recipient: compte, feeBips', 'amountMinimum: besoin, recipient: beneficiaireFrais, feeBips'],
  ['route INJOIGNABLE admise (nouvelle factory / aero-nouvelle)', 'if (bas(m.factory) === FACTORY_NOUVELLE_INJOIGNABLE || m.route === ROUTES.NOUVELLE) {', 'if (false) {'],
  ['pool d une AUTRE factory admise', 'if (bas(m.factory) !== FACTORY_AERODROME_CL) return non(', 'if (false) return non('],
  ['route v4 admise', "if (m.route === ROUTES.V4) return non('ROUTE_NON_CONSTRUITE'", "if (false) return non('ROUTE_NON_CONSTRUITE'"],
  ['controle d ECART (impact) retire', "if (e > seuil) return non('ECART'", "if (false) return non('ECART'"],
  ['profondeur minimum retiree', "if (prof < profMin) return non('PEU_PROFONDE'", "if (false) return non('PEU_PROFONDE'"],
  ['cout contre la reference retire', "if (cr !== null && cr > seuil) return non('SOUS_LE_MARCHE'", "if (false) return non('SOUS_LE_MARCHE'"],
  ['taille au-dela de 10 USDC admise', "if (taille === null) return non('TAILLE_NON_MESUREE'", "if (false) return non('TAILLE_NON_MESUREE'"],
  ['allowance non remise a zero', 'if (!natif) appels.push({ ...approveBrut(jetonIn, ROUTEUR_AERODROME_CL, 0n)', 'if (false) appels.push({ ...approveBrut(jetonIn, ROUTEUR_AERODROME_CL, 0n)'],
  ['tolerance oubliee dans le max-in', 'return plafond(m * (10000n + t), 10000n);', 'return m;'],
  ['devis pour un AUTRE montant accepte', "if (entier(devis.usdcSortie) !== vise) return refuse('DEVIS_MONTANT'", "if (false) return refuse('DEVIS_MONTANT'"],
  ['sortie visee non minimale (arrondi du frais)', 'while (x > b && (x - 1n) - ((x - 1n) * f) / 10000n >= b) x -= 1n;', ''],
  ['spender du jeu non verifie', 'if (spender !== bas(contrat)) return null;', ''],
  ['deadline lointaine', 'const deadline = BigInt(now + DELAI_S);', 'const deadline = BigInt(now + 86400);'],
  ['tolerance hors bornes acceptee', "if (tol === null || tol < 1n || tol > TOLERANCE_MAX_BPS) return refuse('TOLERANCE'", "if (tol === null) return refuse('TOLERANCE'"],
  ['refundETH oublie (ETH natif)', 'if (natif) parts.push(selecteur(SIG.refundETH));', ''],
  ['ligne servie : la factory LUE n est plus transmise a la regle', 'const mesure = ok ? { jeton: bas(candidat.jeton), route: ROUTES.CL, factory: cot.factory,', 'const mesure = ok ? { jeton: bas(candidat.jeton), route: ROUTES.CL, factory: FACTORY_AERODROME_CL,'],
  ['liste : la pool la MOINS misable retenue', 'if (a1 > b1 || (a1 === b1 && a2 > b2)) parJeton.set(l.jeton, l);', 'if (a1 < b1 || (a1 === b1 && a2 < b2)) parJeton.set(l.jeton, l);'],
];
let survivants = 0, introuvables = 0, temoin = true;
try {
  fs.writeFileSync(COPIE, original);
  temoin = lancer();
  console.log((temoin ? 'ok  ' : 'KO  ') + 'temoin : la copie non mutee est verte');
  if (temoin) for (const [nom, de, vers] of M) {
    const k = original.split(de).length - 1;
    if (k !== 1) { introuvables += 1; console.log('??  ' + nom + ' — ancre trouvee ' + k + ' fois (attendu 1)'); continue; }
    fs.writeFileSync(COPIE, original.replace(de, () => vers));
    if (lancer()) { survivants += 1; console.log('SURVIT  ' + nom); } else console.log('tue ' + nom);
  }
} finally {
  fs.rmSync(COPIE, { force: true });
}
if (!temoin) process.exit(1);

/* le serveur : une COPIE mutee de serveur-web.js (.mutant-serveur-misables-<pid>.js), test-serveur-misables-20261024 (SERVEUR_MODULE) */
const srvOriginal = fs.readFileSync(path.join(ICI, 'serveur-web.js'), 'utf8');
const SRV_COPIE = path.join(ICI, '.mutant-serveur-misables-' + process.pid + '.js');
const lancerSrv = () => {
  try { execFileSync(process.execPath, [path.join(ICI, 'test-serveur-misables-20261024.mjs')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SERVEUR_MODULE: SRV_COPIE }, timeout: 240000 }); return true; }
  catch (_) { return false; }
};
const MS = [
  ['serveur : cache retire (chaque requete relit la chaine)', 'const MISABLES_TTL_MS = 60_000,', 'const MISABLES_TTL_MS = 0,'],
  ['serveur : misables.js retire de la liste servie', "  'misables.js', /* 2026-10-24", "  /* 'misables.js', 2026-10-24"],
];
let temoinSrv = true;
try {
  fs.writeFileSync(SRV_COPIE, srvOriginal);
  temoinSrv = lancerSrv();
  console.log((temoinSrv ? 'ok  ' : 'KO  ') + 'temoin : la copie non mutee du serveur est verte');
  if (temoinSrv) for (const [nom, de, vers] of MS) {
    const k = srvOriginal.split(de).length - 1;
    if (k !== 1) { introuvables += 1; console.log('??  ' + nom + ' — ancre trouvee ' + k + ' fois (attendu 1)'); continue; }
    fs.writeFileSync(SRV_COPIE, srvOriginal.replace(de, () => vers));
    if (lancerSrv()) { survivants += 1; console.log('SURVIT  ' + nom); } else console.log('tue ' + nom);
  }
} finally {
  fs.rmSync(SRV_COPIE, { force: true });
}
if (!temoinSrv) process.exit(1);
console.log('\n' + (M.length + MS.length) + ' mutants, ' + survivants + ' survivant(s), ' + introuvables + ' ancre(s) introuvable(s)');
process.exit(survivants || introuvables ? 1 : 0);
