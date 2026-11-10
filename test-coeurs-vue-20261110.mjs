/* test-coeurs-vue-20261110.mjs — the words of the hearts: wallet lines, board, block signals (coeurs-vue.js). */
import { lignesCompte, lignesBoard, signauxBloc, nomDonneur, coeursTexte, tblockTexte } from './coeurs-vue.js';

let ok = 0, ko = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) === JSON.stringify(b)) ok++; else { ko++; console.log('KO', m, '\n   got', JSON.stringify(a), '\n  want', JSON.stringify(b)); } };
const NOMS = { '0xb1': 'FOO', '0xb2': 'BAR' };
const nom = (a) => NOMS[a] || (a.slice(0, 6) + '…');
const E = (n) => (BigInt(n) * 10n ** 18n).toString();

eq([coeursTexte('1'), coeursTexte(3n), tblockTexte(E(258000))], ['1 heart', '3 hearts', '258,000'], 'units');
eq(nomDonneur('0xaaaaaaaa', ['0xb1'], nom), 'FOO’s creator', 'a liker with a block is named by it');
eq(nomDonneur('0xaaaaaaaa', [], nom), '0xaaaa…', 'without a block: the address');

const c = { donnes: { likes: '3', burned: E(258000), vers: [] }, recus: { likes: '5', de: [
  { liker: '0xaaaaaaaa', likes: '4', rendus: '1', sesBlocks: ['0xb1'] },
  { liker: '0xcccccccc', likes: '1', rendus: '0', sesBlocks: ['0xb2'] },
  { liker: '0xdddddddd', likes: '1', rendus: '0', sesBlocks: [] },
] }, sesBlocks: ['0xb9'], blocsSansCreateur: 0 };
const l = lignesCompte(c, nom);
eq(l[0], { k: 'Hearts you gave', v: '3 hearts (258,000 TBLOCK burned)' }, 'given, with TBLOCK burned');
eq(l[1], { k: 'Hearts on your blocks', v: '5 hearts' }, 'received');
eq(l[2].v, '4 hearts · you gave back 1', 'a giver you answered: what you gave back');
eq([l[3].k, l[3].v, l[3].bloc], ['♥ from BAR’s creator', '1 heart · give one back to BAR', '0xb2'], 'a giver not answered yet: the block to answer, clickable');
eq(l[4].v, '1 heart', 'a giver without a block: nothing to answer');
const vide = lignesCompte({ donnes: { likes: '0', burned: '0' }, recus: { likes: '0', de: [] }, sesBlocks: [], blocsSansCreateur: 2 }, nom);
eq(vide.map((x) => x.v), ['none yet — the ♥ next to a block’s name', 'you have no block yet', '2 hearted block(s) whose creator is not indexed yet'], 'empty wallet: says what to do, and what is not counted');
eq(lignesCompte(null, nom), [], 'no wallet view: no line');

eq(lignesBoard({ ok: false }, nom), [{ k: 'Board', v: 'not read just now' }], 'unread: said');
eq(lignesBoard({ ok: true, board: [], complet: true }, nom)[0].v, 'no heart given yet — be the first', 'complete and empty: mainnet today');
eq(lignesBoard({ ok: true, board: [], complet: false, lusJusqua: 55601254, depuis: 55600255 }, nom)[0].v, 'reading the hearts… (1,000 blocks read)', 'still reading: never "no heart"');
const b = lignesBoard({ ok: true, complet: true, board: [{ rang: 1, liker: '0xaaaaaaaa', likes: '12', burned: E(1032000), sesBlocks: ['0xb1'] }, { rang: 2, liker: '0xeeeeeeee', likes: '1', burned: E(86000), sesBlocks: [] }] }, nom, '0xEEEEEEEE');
eq(b[0], { k: '#1 FOO’s creator', v: '12 hearts · 1,032,000 TBLOCK burned', bloc: '0xb1', moi: false }, 'board line');
eq([b[1].k, b[1].moi], ['#2 0xeeee… (you)', true], 'the viewer is marked');

eq(signauxBloc({ signaux: [] }, nom), null, 'no heart: no signal line');
const s = signauxBloc({ signaux: [{ liker: '0xaaaaaaaa', likes: '2', sesBlocks: ['0xb1'] }, { liker: '0xdddddddd', likes: '1', sesBlocks: [] }] }, nom);
eq(s, { texte: '♥ signals from FOO ×2, 0xdddd… ×1', blocs: ['0xb1'] }, 'signals named by the giver’s block');
const many = signauxBloc({ signaux: Array.from({ length: 6 }, (_, i) => ({ liker: '0x' + i + 'aaaaaaa', likes: '1', sesBlocks: [] })) }, nom);
eq(/and 2 more$/.test(many.texte), true, 'more than 4: counted, not dropped silently');
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
