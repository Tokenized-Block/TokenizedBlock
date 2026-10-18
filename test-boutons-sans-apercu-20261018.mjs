/* test-boutons-sans-apercu-20261018.mjs - LES BOUTONS PAYANTS SE POSENT DES QUE /api/tirage REPOND, MEME SANS APERCU LIVE
 *   (revue adverse 2026-10-18, MOYEN : peindreDernierBlock sortait sur « pas d apercu » AVANT poserBoutonsRolls — tete pas encore lue par le
 *   serveur = aucun bouton payant, alors que le contrat etait servi).
 * AFFIRME (EXECUTION de peindreDernierBlock et peindreTirage extraits de app.html, fetch et DOM simules) : (1) /api/tirage sans apercu ->
 *   poserBoutonsRolls appele avec le corps et le wallet, Auto-roll montre ; le texte « could not be read » reste dit ; (2) /api/tirage en
 *   echec -> poserBoutonsRolls PAS appele (rien d invente) ; (3) peindreTirage pose aussi les boutons (au chargement, toutes les 60 s).
 * NE PROUVE PAS : le rendu. */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tranche = (debut, fin) => { const i = app.indexOf(debut); assert.ok(i > 0, 'trouve : ' + debut); const j = app.indexOf(fin, i); assert.ok(j > i, 'fin trouvee : ' + fin); return app.slice(i, j); };
const srcDB = tranche('async function peindreDernierBlock()', '/* ══ BLOCKROLLS DANS L APP');
const srcT = tranche('async function peindreTirage()', '/* ══ YOUR DAY');
function dom() {
  const els = {};
  const $ = (s) => (els[s] = els[s] || { textContent: '', innerHTML: '', hidden: true, style: {}, setAttribute() {} });
  return { $, els };
}
const W = '0x' + 'ab'.repeat(20);
const corps = { ok: true, mode: 'SHADOW', apercu: null, jour: { id: 'J20380', fin: new Date(Date.now() + 3600e3).toISOString(), tickets: [], wallets: [] }, semaine: { n: 0, entrees: [] }, mois: { n: 0, entrees: [] }, seuilVolumeUsd: 10,
  rolls: { contrat: '0x0c5b490196f06db40ab8af68ecb2313029460fe9', prixRoll: '500000', prixPass: '10000000', passRolls: 30, prizes: ['5000000', '3000000', '1000000', '500000'], minScore: 2, bloc: 52770558 } };
async function jouer(src, nom, reponse) {
  const { $, els } = dom(); const appels = [];
  const fetch = async () => { if (reponse instanceof Error) throw reponse; return { json: async () => reponse }; };
  const f = new Function('$', 'fetch', 'compte', 'poserBoutonsRolls', 'rollEnCours', 'peindreJour', src + '\nreturn ' + nom + ';');
  await f($, fetch, W, (t, c) => appels.push([t, c]), false, async () => {})();
  return { els, appels };
}
/* (1) */
{ const { els, appels } = await jouer(srcDB, 'peindreDernierBlock', corps);
  vu(appels.length === 1 && appels[0][0] === corps && appels[0][1] === W, 'sans apercu : poserBoutonsRolls(t, wallet) est appele');
  vu(els['#jourAuto'] && els['#jourAuto'].hidden === false, 'sans apercu : Auto-roll montre (wallet connecte)');
  vu(/could not be read just now/.test(els['#dernierNom'].textContent), 'l absence d apercu reste DITE'); }
/* (2) */
{ const { appels } = await jouer(srcDB, 'peindreDernierBlock', new Error('reseau'));
  vu(appels.length === 0, '/api/tirage en echec : aucun bouton pose (rien d invente)'); }
/* (3) */
{ const { appels } = await jouer(srcT, 'peindreTirage', corps);
  vu(appels.length >= 1 && appels[0][0] === corps, 'peindreTirage pose aussi les boutons des que /api/tirage repond'); }
console.log('ok boutons-sans-apercu - ' + n + ' assertions ; NE PROUVE PAS le rendu');
