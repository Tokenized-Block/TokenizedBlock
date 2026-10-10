/* test-24h-absurde-20261010.mjs - LE 24H N AFFICHE JAMAIS '+1.2841821084296753e+29 %' (QA Grok Super, DJTc, prod
 * 20261010-rail-hook-dex). AFFIRME, sur les 3 formateurs EXTRAITS d app.html (TB_APP = ancienne version) : non fini (NaN, Infinity,
 * texte) ou absurde (> 100 000 %) -> '—' ; une vraie valeur (+12.3, -4.56) reste un pourcentage. Le seuil 100 000 % est un CHOIX.
 * NE PROUVE PAS : d ou vient la valeur 1e29 (source DexScreener ? calcul local ?) - NON mesure.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
const ligneDe = (motif) => { const l = html.split(/\r?\n/).find((x) => x.includes(motif)); assert.ok(l, 'introuvable : ' + motif); return l.trim(); };
const pctTxt = new Function(ligneDe('const pctTxt = (v) =>') + '; return pctTxt;')();
const pct = new Function(ligneDe("const pct = (v) => v === null") + '; return pct;')();
const l3 = ligneDe("ligne('24 h',");
const panneau = (v) => { let out = null; new Function('ligne', 'mk', l3)((k, x) => { out = x; }, { change24h: v }); return out; };
const fmts = [['pctTxt', pctTxt], ['pct', pct], ['panneau', panneau]];
for (const [nom, f] of fmts) {
  for (const v of [1.2841821084296753e+29, NaN, Infinity, -Infinity, 'abc', 1e6]) {
    const s = String(f(v));
    assert.ok(!/e\+|NaN|Infinity/.test(s), nom + '(' + v + ') = ' + s);
    assert.ok(s.includes('\u2014'), nom + '(' + v + ') sans tiret : ' + s);
  }
  assert.match(String(f(12.3)), /\+12\.3/, nom + ' casse une vraie valeur');
  assert.match(String(f(-4.56)), /-4\.6|-4\.56/, nom + ' casse une valeur negative');
}
console.log('ok 24h-absurde - 3 formateurs ; seuil 100 000 % = choix ; NE PROUVE PAS la source du 1e29');