/* outil-etat-index.mjs — met l index des sources TB dans un ETAT donne AVANT un banc (node --import ./outil-etat-index.mjs banc.mjs).
 * R8 (C2, R6-5) : les bancs doivent tourner index NON charge ET charge (plein, vide, perime, illisible). Pas un test (pas de prefixe
 * test-) : un outil. Etat lu dans TB_ETAT_INDEX : non | lu | vide | perime | nosvide | illisible. Ecrit l etat sur stderr. */
const IR = await import(new URL('./index-routeur.js', import.meta.url).href);
const T = await import(new URL('./tokenomics.js', import.meta.url).href);
const etat = String(process.env.TB_ETAT_INDEX || 'non');
const maintenant = Date.now();
const plein = () => ({ ok: true, couvertureComplete: true, fenetresRatees: 0, tete: 52100000, jusqua: 52100000, teteLueA: maintenant,
  blocks: IR.GRAINE_ROUTEUR.map((g) => ({ jeton: g.jeton, sel: g.sel, bloc: g.bloc, tx: g.tx })) });
/* /api/nos-blocks tel que lu le 2026-10-02 22:37 UTC (C2) */
const nos = () => ({ ok: true, couvertureComplete: true, fenetresRatees: 0, jusqua: 52095643,
  blocks: [T.TBLOCK, '0xb20000000000000000000003d296be435ae4bbe3', '0xb200000000000000000000e63ffc3f40bf92a042', '0xb200000000000000000000ab549fa65ad4edae3f'] });
if (etat === 'lu') { IR.chargerIndexRouteur(plein()); IR.chargerNosBlocksTb(nos()); }
else if (etat === 'vide') { IR.chargerIndexRouteur({ ...plein(), blocks: [] }); IR.chargerNosBlocksTb({ ...nos(), blocks: [] }); }
else if (etat === 'perime') { IR.chargerIndexRouteur({ ...plein(), teteLueA: maintenant - 3600 * 1000 }); IR.chargerNosBlocksTb(nos()); }
else if (etat === 'nosvide') { IR.chargerIndexRouteur(plein()); IR.chargerNosBlocksTb({ ...nos(), blocks: [] }); }
else if (etat === 'illisible') { IR.indexRouteurIllisible('outil'); IR.nosBlocksTbIllisibles('outil'); }
else if (etat !== 'non') throw new Error('TB_ETAT_INDEX inconnu : ' + etat);
process.stderr.write('[etat index] ' + etat + ' : index lu=' + IR.indexRouteurLu() + ' nos lus=' + IR.nosBlocksTbLus() + ' sources lues=' + IR.sourcesTbLues() + '\n');
