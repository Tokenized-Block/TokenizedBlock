/* mesure-routage-quatre-pools.mjs — UN ROUTAGE BLOCK -> ACTION -> ACTION -> BLOCK EST-IL POSSIBLE ?
 *
 * ⛔⛔ L IDEE DE PHIL (2026-09-27), telle que je la comprends : pairer un block A avec une action
 *     (MSTRc), un block B avec une autre (SPCXc), puis relier les deux blocks. Quatre actifs, et
 *     donc QUATRE POOLS a traverser — l interet etant de faire passer de la liquidite sans avoir a
 *     tout vendre dans une seule pool, ce qui stabiliserait les fonds tokenises.
 *
 * ⇒ AVANT DE CONCEVOIR QUOI QUE CE SOIT, LA QUESTION QUI DECIDE : ces pools EXISTENT-ELLES, et avec
 *   quelle profondeur ? Un routage a quatre sauts n est pas meilleur qu une vente directe si l un
 *   des sauts est vide : il est PIRE, parce qu il ajoute des frais et du glissement a chaque saut
 *   tout en concentrant la perte sur le maillon le plus mince.
 *   ⛔ Le maillon FAIBLE decide du chemin entier. Une moyenne de profondeur ne veut rien dire ici :
 *     c est le MINIMUM qui compte, et c est lui qu on affiche.
 *
 * ⛔ CE QU ON MESURE, ET AVEC QUEL INSTRUMENT. DexScreener, la MEME source que l application
 *   (`/api/prix-usd`), avec le MEME seuil de 10 000 $ — sinon la sonde dirait autre chose que ce que
 *   l ecran montre, et on ne saurait plus laquelle croire.
 *
 * ⛔ CE QUE CETTE SONDE NE DIT PAS : que le routage serait rentable, ni qu un agregateur accepterait
 *   ce chemin. Elle dit ce qui EXISTE comme profondeur. Le reste est une decision produit.
 *
 * ⚠️ LECTURE SEULE. Aucune signature, aucune cle.
 */
import { ACTIONS_COINBASE } from './paires.js';

const SEUIL = 10000;   /* ⛔ le meme que `/api/prix-usd` — une sonde qui use un autre seuil ment */
const souffler = (ms = 320) => new Promise((r) => setTimeout(r, ms));

async function pools(adr) {
  try {
    const r = await fetch('https://api.dexscreener.com/tokens/v1/base/' + adr,
      { signal: AbortSignal.timeout(9000), headers: { accept: 'application/json' } });
    if (!r.ok) return { ko: 'HTTP ' + r.status };
    const j = await r.json();
    const a = (Array.isArray(j) ? j : []).filter((x) => String(x.baseToken && x.baseToken.address).toLowerCase() === adr);
    return { ok: a.map((x) => ({
      contre: (x.quoteToken && x.quoteToken.symbol) || '?',
      liq: (x.liquidity && Number(x.liquidity.usd)) || 0,
      vol24: (x.volume && Number(x.volume.h24)) || 0,
      dex: x.dexId || '?',
    })).sort((p, q) => q.liq - p.liq) };
  } catch (e) { return { ko: String((e && e.message) || e).slice(0, 60) }; }
}

console.log('═══ UN ROUTAGE A QUATRE POOLS EST-IL POSSIBLE ? ═══\n');
console.log('  instrument : DexScreener, la MEME source que /api/prix-usd de l app');
console.log('  seuil      : ' + SEUIL.toLocaleString('en-US') + ' $ de liquidite — le MEME que l app\n');
console.log('  actif   pools  meilleure pool                 volume 24 h');
console.log('  ---------------------------------------------------------------');

const bons = [], vides = [], nonLus = [];
for (const a of ACTIONS_COINBASE) {
  await souffler();
  const p = await pools(a.adr.toLowerCase());
  if (p.ko) { console.log('  ' + a.symbole.padEnd(7) + ' ⛔ NON LU : ' + p.ko); nonLus.push(a.symbole); continue; }
  const liste = p.ok;
  const top = liste[0];
  if (!top || top.liq < SEUIL) {
    console.log('  ' + a.symbole.padEnd(7) + ' ' + String(liste.length).padStart(3)
      + '    ' + (top ? (Math.round(top.liq).toLocaleString('en-US') + ' $ contre ' + top.contre).padEnd(30) : 'AUCUNE'.padEnd(30))
      + '  ⛔ sous le seuil');
    vides.push(a.symbole);
    continue;
  }
  console.log('  ' + a.symbole.padEnd(7) + ' ' + String(liste.length).padStart(3)
    + '    ' + (Math.round(top.liq).toLocaleString('en-US') + ' $ contre ' + top.contre + ' (' + top.dex + ')').padEnd(30)
    + '  ' + Math.round(top.vol24).toLocaleString('en-US') + ' $');
  bons.push({ sym: a.symbole, liq: top.liq, contre: top.contre, vol: top.vol24 });
}

console.log('\n── VERDICT ──');
console.log('  actions avec une pool AU-DESSUS du seuil : ' + bons.length + ' / ' + ACTIONS_COINBASE.length);
console.log('  actions SOUS le seuil                    : ' + vides.length + (vides.length ? '  (' + vides.join(', ') + ')' : ''));
if (nonLus.length) console.log('  ⛔ NON LUES : ' + nonLus.join(', ') + ' — « pas regarde » n est pas « rien trouve ».');

if (bons.length < 2) {
  /* ⛔⛔ UN ZERO QUI PEUT MONTER : il suffirait que deux actions gagnent un marche. Il dit donc
   *     quelque chose de reel sur aujourd hui, pas une impossibilite de principe. */
  console.log('\n  ⛔⛔ MOINS DE DEUX ACTIONS ONT UNE POOL UTILISABLE : un routage a quatre actifs n a');
  console.log('    pas de substrat. Ce n est pas une question de code — il n y a rien a traverser.');
} else {
  /* ⛔ LE MAILLON FAIBLE DECIDE DU CHEMIN ENTIER. On classe donc par la PLUS PETITE des pools
   *   utilisables : c est elle qui fixe ce qu on peut faire passer sans tout casser. */
  const tri = bons.slice().sort((a, b) => a.liq - b.liq);
  const faible = tri[0];
  console.log('\n  la plus MINCE des pools utilisables : ' + faible.sym + ' — '
    + Math.round(faible.liq).toLocaleString('en-US') + ' $ contre ' + faible.contre);
  console.log('  ⇒ C EST ELLE QUI BORNE UN CHEMIN QUI LA TRAVERSE, pas la moyenne des quatre.');
  console.log('    Un routage a quatre sauts ajoute des frais et du glissement a CHAQUE saut : il');
  console.log('    n est un gain que si chaque maillon est plus epais que la vente directe.');
}
console.log('\n⛔ CE QUE CETTE SONDE NE DIT PAS : nos propres pools block<->action. Mesure du');
console.log('   2026-09-26 : 685 pools B20 ouvertes en 24 h, ZERO sur notre hook. Les pools ci-dessus');
console.log('   sont celles des ACTIONS entre elles — le premier et le dernier saut du chemin');
console.log('   imagine (block -> action, action -> block) n existent pas encore.');
