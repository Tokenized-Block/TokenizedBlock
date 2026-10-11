/* test-historique-par-block-20261011.mjs - L HISTORIQUE DU PANNEAU NE MONTRE QUE LE BLOCK OUVERT.
 * Prod 20261011-sent-retry-skins-market (QA Grok 17:47) : panneau sur UNALYN, History affichait « Swap 0.002 ETH -> IB022 . LEFT UNFINISHED »
 *   (une operation d un AUTRE block) : bc.ops est une seule liste pour toute la page, sans block.
 * EXECUTE bcOpsDuBlock (extraite d app.html) ; AFFIRME que bcOp note le block, que bcPeindreOps filtre, et que choisirBrain repeint.
 * NE PROUVE PAS : le rendu navigateur. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const src = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const corps = (nom) => { const d = src.indexOf('function ' + nom + '('); if (d < 0) return null; const m = /\r?\n\}/.exec(src.slice(d)); return src.slice(d, d + m.index + m[0].length); };
const f = corps('bcOpsDuBlock');
vu(!!f, 'ROUGE->VERT : app.html n a pas bcOpsDuBlock (History partage entre blocks)');
const bcOpsDuBlock = new Function(f + '\nreturn bcOpsDuBlock;')();
const IB = '0xb200000000000000000000000000000000000ib0', UN = '0xb2000000000000000000000000000000000002bed';
const ops = [{ texte: 'Swap 0.002 ETH -> IB022', block: IB, etat: 'interrupted' }, { texte: 'Swap 1 USDC -> UNALYN', block: UN, etat: 'done' }, { texte: 'vieux', etat: 'done' }];
const v = bcOpsDuBlock(ops, UN.toUpperCase());
vu(v.length === 1 && v[0].texte === 'Swap 1 USDC -> UNALYN', 'UNALYN montre : ' + JSON.stringify(v.map((x) => x.texte)));
vu(bcOpsDuBlock(ops, null).length === 3, 'sans block ouvert : tout reste visible');
vu(/const op = \{ id: [^\n]*block: brainAdr \? String\(brainAdr\)\.toLowerCase\(\) : null/.test(src), 'bcOp ne note pas le block');
vu(/const ops = bcOpsDuBlock\(bc\.ops, brainAdr\);/.test(corps('bcPeindreOps')), 'bcPeindreOps ne filtre pas');
/* (integration Claude 2026-10-11 : sans bcBanqueSuivreBlock - la Bank suit le block par bcChangerFil, 76cc62c) */
vu(/if \(!meme\) \{ try \{ bcPeindreOps\(\); \} catch \(_\) \{/.test(corps('choisirBrain')), 'choisirBrain ne repeint pas l historique');
console.log('OK test-historique-par-block-20261011 : ' + n + ' assertions');