/* test-sondes-relecture-boot-20261011.mjs - APRES UN DEPLOIEMENT, UNE SONDE QUI N A PAS PU LIRE EST RELUE 90 S PLUS TARD (pas 10 min).
 * Mesure en prod (2026-10-11, 17:43 et 18:25) : le 1er passage 45 s apres le boot tombait sur un 429 « Public endpoint rate limit »,
 *   marche NON_LUE -> echange NON_MESURE -> cerveau REFUSE pendant 10 min, retabli au passage suivant.
 * AFFIRME (EXECUTE passageSondes extrait de serveur-web.js, sondes et minuterie factices) : un echec de LECTURE programme UNE relecture a
 *   90 s ; la relecture n en programme pas d autre ; un refus mesure (REFUSE) ou des sondes PRET n en programment aucune.
 * NE PROUVE PAS : le debit reel du noeud public (la relecture peut encore etre refusee : la sonde le dira jusqu au passage suivant). */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const src = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const d = src.indexOf('const SONDE_RELECTURE_MS');
vu(d > 0, 'serveur-web.js n a pas la relecture des sondes');
const f = src.indexOf('function passageSondes(', d);
const fin = /\n\}\n/.exec(src.slice(f));
const bloc = src.slice(d, f + fin.index + fin[0].length);
vu(/setTimeout\(\(\) => \{ passageSondes\(\); setInterval\(\(\) => passageSondes\(\), 10 \* 60 \* 1000\)\.unref\(\); \}, 45000\)\.unref\(\);/.test(src), 'le demarrage ne passe pas par passageSondes');
const lancer = async (etats) => {
  const minuteries = [], passages = [];
  const env = { naissanceSonde: null, autresSondes: { marche: {}, echange: {}, cerveau: {} } };
  let k = 0;
  const sonderNaissance = async () => { const e = etats[Math.min(k, etats.length - 1)]; env.naissanceSonde = { etat: e.naissance }; };
  const sonderLeReste = async () => { const e = etats[Math.min(k, etats.length - 1)]; env.autresSondes = { marche: { etat: e.marche }, echange: { etat: e.echange }, cerveau: { etat: e.cerveau } }; k += 1; };
  /* les deux etats globaux du serveur sont lus dans `env` (les sondes factices les ecrivent la) */
  const fn = new Function('consommateurArchive', 'sonderNaissance', 'sonderLeReste', 'setTimeout', 'env',
    bloc.replace(/naissanceSonde/g, 'env.naissanceSonde').replace(/autresSondes/g, 'env.autresSondes') + '\nreturn passageSondes;');
  const consommateurArchive = { run: (label, g) => { passages.push(label); return g(); } };
  const passage = fn(consommateurArchive, sonderNaissance, sonderLeReste, (g, ms) => { minuteries.push({ g, ms }); return { unref() {} }; }, env);
  passage();
  await new Promise((r) => setTimeout(r, 10));
  while (minuteries.length) { const m = minuteries.shift(); vu(m.ms === 90000, 'relecture a 90 s : ' + m.ms); m.g(); await new Promise((r) => setTimeout(r, 10)); }
  return passages;
};
const BOOT = { naissance: 'PRET', marche: 'NON_LUE', echange: 'NON_MESURE', cerveau: 'REFUSE' }, OK = { naissance: 'PRET', marche: 'PRET', echange: 'PRET', cerveau: 'PRET' };
let p = await lancer([BOOT, OK]);
vu(JSON.stringify(p) === JSON.stringify(['fond sondes', 'fond sondes (relecture)']), 'boot en 429 : UNE relecture : ' + JSON.stringify(p));
p = await lancer([BOOT, BOOT]);
vu(p.length === 2, 'relecture encore refusee : pas de troisieme passage (le passage suivant est celui des 10 min) : ' + JSON.stringify(p));
p = await lancer([OK]);
vu(p.length === 1, 'tout PRET : aucune relecture');
p = await lancer([{ naissance: 'PRET', marche: 'PRET', echange: 'REFUSE', cerveau: 'PRET' }]);
vu(p.length === 1, 'un refus MESURE (REFUSE) ne declenche pas de relecture');
p = await lancer([{ naissance: 'NON_MESURE', marche: 'PRET', echange: 'PRET', cerveau: 'PRET' }, OK]);
vu(p.length === 2, 'naissance non mesuree : relue aussi');
console.log('ok sondes-relecture-boot - ' + n + ' assertions ; NE PROUVE PAS le debit reel du noeud');
