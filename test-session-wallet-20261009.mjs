/* test-session-wallet-20261009.mjs — CE QU UNE SESSION AVEC WALLET CONNECTE A TROUVE (mode essai : wallet simule sur un fork local).
 *
 * Parcours joue le 2026-10-09 : connexion depuis le panneau -> Trade for me -> achat d IB022 confirme -> GM (tx status 1, « GM » dans
 * l input, 1 IB022 recu, 0,001 IB022 au wallet des frais) -> rencontre -> message paye (relu par messageDepuisTransfert : MESSAGE,
 * de = IB022, 0,10 USDC). Trois defauts trouves en chemin, gardes ici :
 *   A. l apercu ecrivait « Contract: the block USDC » (EXECUTE : nomDe) ;
 *   B. « Speak as » offrait USDC (une devise) — seuls les blocks B20 hors devises et hors actions ;
 *   C. le block tout juste achete n etait pas dans « Speak as » ; `await majWallet()` bloquait > 70 s — le solde du block qui
 *      parle est lu DIRECTEMENT, et majWallet n est PAS attendu.
 * ⛔ BORNE : le parcours lui-meme (navigateur + fork) n est pas rejoue ici ; ce banc garde les trois corrections. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { nomDe } from './apercu.js';
import { USDC_BASE } from './frais-creation.js';

let n = 0;
const cas = (t, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + t); throw e; } };
const IB = '0xb200000000000000000000e4b0c5fbe9c8df579e';
const AUTRE = '0x' + '12'.repeat(20);

cas('A l apercu nomme l USDC « USDC », un jeton hors B20 « the token », un block « the block »', () => {
  /* nomDe ajoute l adresse courte apres le nom ; on juge le nom */
  const u = nomDe(USDC_BASE, { chaine: 8453, jeton: USDC_BASE, symbole: 'USDC' });
  assert.ok(u.startsWith('USDC ') && !/block/.test(u), 'USDC : ' + u);
  assert.ok(nomDe(IB, { chaine: 8453, jeton: IB, symbole: 'IB022' }).startsWith('the block IB022'));
  assert.ok(nomDe(AUTRE, { chaine: 8453, jeton: AUTRE, symbole: 'XYZ' }).startsWith('the token XYZ'));
});

const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const corps = (debut) => { const i = app.indexOf(debut); assert.ok(i > 0, debut + ' absent'); const f = /\r?\n\}\r?\n/.exec(app.slice(i)); return app.slice(i, i + f.index); };
cas('B « Speak as » : blocks B20 seulement, sans devise de paire ni action Coinbase', () => {
  const c = corps('function blocsPourParler() {');
  assert.match(c, /\/\^0xb2\[0-9a-fA-F\]\{38\}\$\/\.test\(String\(x\.id/);
  assert.match(c, /!devises\.has\(String\(x\.id\)\.toLowerCase\(\)\) && !ACTIONS_PAR_ADR\.has\(/);
});
cas('C le block qui parle est lu directement ; majWallet n est pas attendu (il bloquait > 70 s)', () => {
  const c = corps('async function bcPreparerMessageRencontre(');
  assert.match(c, /const \[s, d\] = await Promise\.all\(\[bcSolde\(a, compte\), bcDecimales\(a\)\]\);/);
  assert.match(c, /if \(typeof s === 'bigint' && s > 0n && Number\.isInteger\(d\)\)/);
  assert.ok(!/await majWallet\(\)/.test(c.replace(/\/\*[\s\S]*?\*\//g, '')), 'majWallet est de nouveau attendu dans la preparation du message');
});

console.log('✓ ' + n + ' cas — session avec wallet connecte : apercu, Speak as, block qui parle');
