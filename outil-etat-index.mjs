/* outil-etat-index.mjs — met les sources TB (index routeur + /api/nos-blocks) dans un ETAT donne AVANT un banc :
 *   TB_ETAT_INDEX=<etat> node --import ./outil-etat-index.mjs banc.mjs      (ou NODE_OPTIONS=--import=file:///…/outil-etat-index.mjs)
 * R8 (C2, R6-5) : les bancs tournent index NON charge ET charge (plein, vide, perime, illisible). Pas un test (pas de prefixe
 * test-) : un outil. Etats : non | lu | vide | perime | nosvide | illisible.
 * R9 (C2 R8 F5) : l etat s applique a CHAQUE instance de index-routeur.js chargee par le processus — le depot ET les copies
 * mutees des temoins negatifs — par un crochet de chargement (module.register) qui ajoute l application de l etat a la fin du
 * module : les mutants tournent eux aussi index charge. Chaque instance ecrit son etat sur stderr. */
import { register } from 'node:module';
const etat = String(process.env.TB_ETAT_INDEX || 'non');
if (!['non', 'lu', 'vide', 'perime', 'nosvide', 'illisible'].includes(etat)) throw new Error('TB_ETAT_INDEX inconnu : ' + etat);
/* Code ajoute a la fin de index-routeur.js (portee du module : GRAINE_ROUTEUR et les fonctions de chargement y sont visibles). */
const AJOUT = `
;{ const __e = ${JSON.stringify(etat)}, __m = Date.now();
  const __plein = () => ({ ok: true, couvertureComplete: true, fenetresRatees: 0, tete: 52100000, jusqua: 52100000, teteLueA: __m,
    blocks: GRAINE_ROUTEUR.map((g) => ({ jeton: g.jeton, sel: g.sel, bloc: g.bloc, tx: g.tx })) });
  /* /api/nos-blocks tel que lu le 2026-10-02 22:37 UTC (C2) */
  const __nos = () => ({ ok: true, couvertureComplete: true, fenetresRatees: 0, jusqua: 52095643,
    blocks: ['0xb20000000000000000000024c30d3fcb7931272e', '0xb20000000000000000000003d296be435ae4bbe3', '0xb200000000000000000000e63ffc3f40bf92a042', '0xb200000000000000000000ab549fa65ad4edae3f'] });
  if (__e === 'lu') { chargerIndexRouteur(__plein()); chargerNosBlocksTb(__nos()); }
  else if (__e === 'vide') { chargerIndexRouteur({ ...__plein(), blocks: [] }); chargerNosBlocksTb({ ...__nos(), blocks: [] }); }
  else if (__e === 'perime') { chargerIndexRouteur({ ...__plein(), teteLueA: __m - 3600 * 1000 }); chargerNosBlocksTb(__nos()); }
  else if (__e === 'nosvide') { chargerIndexRouteur(__plein()); chargerNosBlocksTb({ ...__nos(), blocks: [] }); }
  else if (__e === 'illisible') { indexRouteurIllisible('outil'); nosBlocksTbIllisibles('outil'); }
  process.stderr.write('[etat index] ' + __e + ' : index lu=' + indexRouteurLu() + ' nos lus=' + nosBlocksTbLus() + ' sources lues=' + sourcesTbLues() + ' (' + import.meta.url.replace(/^.*\\/([^/]+\\/[^/]+)$/, '$1') + ')\\n'); }
`;
const CROCHET = `
const AJOUT = ${JSON.stringify(AJOUT)};
export async function load(url, context, nextLoad) {
  const r = await nextLoad(url, context);
  if (!/\\/index-routeur\\.js$/.test(url.split('?')[0]) || r.format !== 'module' || r.source == null) return r;
  return { ...r, source: String(Buffer.isBuffer(r.source) ? r.source.toString('utf8') : typeof r.source === 'string' ? r.source : Buffer.from(r.source).toString('utf8')) + AJOUT, shortCircuit: true };
}`;
register('data:text/javascript,' + encodeURIComponent(CROCHET));
