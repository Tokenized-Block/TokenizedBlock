/* test-panneau-suit-le-block-20261010.mjs - LE PANNEAU OUVERT SUIT LE BLOCK DONT LE PROFIL S OUVRE (re-QA Grok Super, prod 20261010-p1-panneau-live :
 * panneau sur DJTc, Find 0xb200...579e -> profil IB022, panneau reste sur DJTc ; et l inverse depuis Blocks). EXECUTE ouvrirProfil EXTRAITE
 * d app.html (TB_APP = ancienne) avec des doublures. AFFIRME : panneau ouvert + autre block -> choisirBrain(adr) + bcRepeindre ; meme block
 * -> rien ; panneau ferme -> il suit aussi, sans repeint (2e passe) ; le profil se lit dans tous les cas. NE PROUVE PAS : le rendu navigateur.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
const i = html.indexOf('async function ouvrirProfil(');
let prof = 0, fin = -1;
for (let k = html.indexOf(') {', i) + 2; k < html.length; k++) { if (html[k] === '{') prof++; else if (html[k] === '}') { prof--; if (!prof) { fin = k + 1; break; } } }
const src = html.slice(i, fin);
const IB = '0xb200000000000000000000e4b0c5fbe9c8df579e', DJ = '0x' + 'd1'.repeat(20);
async function cas({ ouvert, brain }) {
  const journal = [];
  const f = new Function('ADRESSE', '$', 'brainAdr', 'adrBrainEq', 'choisirBrain', 'bcRepeindre', 'lireProfil', 'jetonProfil', 'profilEnLecture',
    'return (' + src + ');')(/^0x[0-9a-fA-F]{40}$/, (q) => (q === '#bcPop' ? { open: ouvert } : null), brain, (x, y) => String(x).toLowerCase() === String(y).toLowerCase(),
    (a) => journal.push('choisir ' + a), () => journal.push('repeindre'), async (a) => journal.push('profil ' + a), 0, false);
  await f(IB, 'IB022');
  return journal;
}
assert.deepEqual(await cas({ ouvert: true, brain: DJ }), ['choisir ' + IB, 'repeindre', 'profil ' + IB], 'panneau ouvert sur DJTc : ne suit pas IB022');
assert.deepEqual(await cas({ ouvert: true, brain: IB }), ['profil ' + IB], 'meme block : rien a changer');
/* 2026-10-10 (QA Grok, 2e passe) : panneau FERME, il suit aussi (sinon il se rouvre sur l ancien block) ; pas de repeint tant qu il est ferme */
assert.deepEqual(await cas({ ouvert: false, brain: DJ }), ['choisir ' + IB, 'profil ' + IB], 'panneau ferme : il doit suivre IB022 sans repeindre');
console.log('ok panneau-suit-le-block - ouvert : suit ; ferme ou meme block : rien ; NE PROUVE PAS le rendu navigateur');