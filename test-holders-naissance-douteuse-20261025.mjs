/* test-holders-naissance-douteuse-20261025.mjs — UNE NAISSANCE CHERCHEE PLUS HAUT QUE LA CREATION CONNUE NE REVIENT PAS DU VOLUME.
 *
 * Mesure prod (2026-10-25 17:2x UTC) : NVDAc, GOOGLc, TSLAc « a replay is running but 807/858/843 window(s) were refused » — leur
 * naissance est posee en memoire, cherchee depuis le plancher (50 861 088) alors qu elles sont creees a ~49,1 M : un mint POSTERIEUR.
 * La premiere passe complete l ecrirait dans holders-cache.json, et elle ne serait plus jamais cherchee.
 * Ce banc fait ce que fait un redemarrage : il pose sur un volume TEMPORAIRE un holders-cache.json qui porte
 *   - NVDAc (action PROUVEE dans actions-chaine.json, creee au bloc 49145311) avec la naissance 50861188 et SANS naissanceDepuis ;
 *   - un block TB sans creation connue (temoin), SANS naissanceDepuis non plus ;
 * demarre le VRAI serveur dans un processus neuf, et interroge la route /api/holders pour les deux.
 *   D1 NVDAc : la naissance 50861188 n est PAS servie (l entree est jetee a la relecture, la route repart d une recherche).
 *   D2 TEMOIN : le block TB garde son entree exactement comme avant (la route ne repart pas d une recherche).
 * Formes copiees de actions-chaine-graine.js (NVDAc, tx de creation 0x35e3…a507, bloc 49145311).
 * ⚠️ Le serveur demarre pour de vrai (comme test-holders-persistent) : ses lectures de fond peuvent partir vers les noeuds publics
 *   (lecture seule). Les deux reponses verifiees sont rendues AVANT toute lecture (branche synchrone de holdersCorps). */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { strict as assert } from 'node:assert';

const NVDAC = '0xb20000000000000000000078ee7ce2fe4908108c';
const NVDAC_TX = '0x35e3070e771162d7abf2a5cb64408cae55b9cf0d307bfbc1bb12b486442fa507';
const TB = '0xb20000000000000000000016d09cd53724fc0601';
const dossier = mkdtempSync(join(tmpdir(), 'tb-naissance-douteuse-'));
let n = 0; const rates = [];
const cas = (titre, f) => { n++; try { f(); console.log('  ok  ' + titre); } catch (e) { rates.push(titre); console.error('  x ' + titre + '\n      ' + String(e && e.message).split('\n')[0]); } };
try {
  writeFileSync(join(dossier, 'holders-cache.json'), JSON.stringify([
    [NVDAC, { soldes: [['0x1111111111111111111111111111111111111111', '1000']], naissance: 50861188, jusqua: 53000000, ratees: 0, lu: '2026-10-25T17:20:00.000Z' }],
    [TB, { soldes: [['0x2222222222222222222222222222222222222222', '7']], naissance: 50861088, jusqua: 51000000, ratees: 0, lu: '2026-10-25T17:20:00.000Z' }],
  ]));
  writeFileSync(join(dossier, 'actions-chaine.json'), JSON.stringify({ v: 2, a: Date.now(),
    preuves: [{ etat: 'PROUVE', adr: NVDAC, symbole: 'NVDAc', nom: 'NVIDIA', decimales: 6, tx: NVDAC_TX, bloc: 49145311, createur: '0xe090ecbee12d4b6aee5e73ff60945f2545ef5c6f' }],
    creations: [], routes: [], pools: [] }));
  const code = "await import('./serveur-web.js');"
    + "await new Promise((k) => setTimeout(k, 1200));"
    + "const p = Number(process.env.PORT_TEST);"
    + "for (const j of ['" + NVDAC + "', '" + TB + "']) { const t = await fetch('http://127.0.0.1:' + p + '/api/holders/' + j).then((x) => x.text()).catch((e) => 'FETCH_KO ' + e.message);"
    + "  console.log('REPONSE ' + j + '>>>' + t); }"
    + "process.exit(0);";
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    env: { ...process.env, RAILWAY_VOLUME_MOUNT_PATH: dossier, PORT: '8793', PORT_TEST: '8793', TB_SONDES: '0' },
    encoding: 'utf8', timeout: 90000,
  });
  const sortie = (r.stdout || '') + (r.stderr || '');
  const rep = (j) => { const i = sortie.indexOf('REPONSE ' + j + '>>>'); assert.ok(i >= 0, 'pas de reponse pour ' + j + ' : ' + sortie.slice(0, 300)); return sortie.slice(i + ('REPONSE ' + j + '>>>').length).split('\n')[0]; };
  cas('D1 NVDAc (action prouvee, creee au bloc 49145311) : la naissance 50861188 relue du volume sans naissanceDepuis n est PAS servie', () => {
    const c = rep(NVDAC);
    console.log('      NVDAc : ' + c.slice(0, 160));
    assert.doesNotMatch(c, /"naissance"\s*:\s*50861188/, 'la naissance cherchee depuis le plancher est servie : ' + c.slice(0, 200));
    assert.match(c, /reading every transfer of this block from its birth/, 'l entree n a pas ete jetee a la relecture : ' + c.slice(0, 200));
  });
  cas('D2 TEMOIN block TB sans creation connue, sans naissanceDepuis : relu et servi comme avant', () => {
    const c = rep(TB);
    assert.doesNotMatch(c, /reading every transfer of this block from its birth/, 'l entree du temoin a ete jetee : ' + c.slice(0, 200));
    assert.match(c, /"naissance"\s*:\s*50861088/, 'reponse du temoin : ' + c.slice(0, 200));
  });
} finally {
  try { rmSync(dossier, { recursive: true, force: true }); } catch (_) { /* rien */ }
}
console.log((n - rates.length) + '/' + n + ' cas verts' + (rates.length ? ' — ROUGES : ' + rates.join(' | ') : ''));
process.exit(rates.length ? 1 : 0);
