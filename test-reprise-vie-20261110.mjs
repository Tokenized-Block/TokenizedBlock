// test-reprise-vie-20261110.mjs — game342: a block created but never opened can be resumed from its own page. No network.
// Live test by Grok, 2026-11-10 (block TEST 0xb200…3F35): created, approved, hook registration paid, then the market opening stopped.
// From ?block= the page offered only "Re-scan market"; once opened by hand, the launch card stopped on "how this block was created could
// not be read yet" because the Create salt lived only in the creating browser. Proves the wiring of both fixes.
// Measured once in a browser on mainnet reads (local server, read-only test wallet): the button showed, the plan asked 2 signatures
// (Permit2 again, then the opening), the wallet was asked for the first and declined. Does NOT prove: a real signature.
import { readFileSync } from 'node:fs';
let ok = 0, ko = 0;
const t = (n, c, x = '') => { if (c) ok++; else { ko++; console.log('RED', n, x); } };
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');

t('the profile has the Continue button, hidden by default', /<button class="bouton" id="pReprendreVie" type="button" hidden[^>]*>Continue: open its market/.test(app));
const f = app.slice(app.indexOf('async function majReprendreVie('), app.indexOf("$('#pReprendreVie').addEventListener('click'"));
t('shown only on Base, for a block with NO market, to a connected wallet', /if \(CHAINE !== 8453 \|\| etatVieProfil !== 'NON_TROUVEE' \|\| !compte/.test(f));
t('shown only to a wallet that holds the block', /if \(bal <= 0n \|\|/.test(f));
t('shown only when the birth gate agrees', /const el = await eligibleNaissanceV8\(adrRep\);/.test(f) && /if \(!el\.ok/.test(f));
t('re-checked at profile paint, at connect (twice: connecter and the header pill) and at account change', (app.match(/void majReprendreVie\(\);/g) || []).length === 4, String((app.match(/void majReprendreVie\(\);/g) || []).length));
const c = app.slice(app.indexOf("$('#pReprendreVie').addEventListener('click'"), app.indexOf("$('#pReveiller').addEventListener('click'"));
t('the click runs the asleep-list resume: ETH pair, 99.9 %, auto, plan', /lancementLien = String\(adr\)\.toLowerCase\(\);/.test(c) && /part\.value = '99\.9'/.test(c) && /ouvrirLancement\(\);/.test(c) && /vieAuto = true;/.test(c) && /void calculerLancement\(\);/.test(c));
const g = app.slice(app.indexOf('let dejaInscrit = false;'), app.indexOf('let dejaInscrit = false;') + 900);
t('an already-registered pool skips the unknown-salt stop', /createurs\(bytes32\)/.test(g) && /if \(estHook7030\(hooks\) && !dejaInscrit && selNe === null && !indexRouteurLu\(\)\)/.test(g));
t('an unread registration keeps the old guard (fail-closed)', /catch \(_\) \{ dejaInscrit = false; \}/.test(g));
t('shared-link copy says $5, not 0.001 ETH', /Create my own — \$5/.test(app) && !/Create my own — 0\.001 ETH/.test(app));
console.log(ko === 0 ? 'GREEN' : 'RED', ok + '/' + (ok + ko));
