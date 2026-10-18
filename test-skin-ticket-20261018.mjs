/* test-skin-ticket-20261018.mjs - UN SKIN DETENU = LE TICKET DU JOUR, GARANTI (Phil 2026-10-18 13:30).
 * AFFIRME (lecture de serveur-web.js) : (1) crediterDetenteursSkins lit les skins SUR LA CHAINE (lireSkins du contrat actif) et n agit que si
 *   la lecture est LU ; (2) chaque detenteur externe recoit le jour COURANT dans revenu.passes (le registre que ticketsJour lit deja) — pas
 *   les jours suivants : la liste est figee jour par jour ; (3) exclus : le contrat lui-meme (skin en vente), l adresse nulle, les wallets
 *   internes ; (4) appele par /api/tirage (corpsTirage) et toutes les 10 min, jamais plus souvent que 10 min. (5) ticketsJour unit bien un
 *   pass a un volume nul (preuve fonctionnelle).
 * NE PROUVE PAS : une lecture reelle des detenteurs (aucun skin minte au 2026-10-18 : totalSupply 0, lu par cast). */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { ticketsJour } from './tirage-saison.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const f0 = srv.indexOf('async function crediterDetenteursSkins()'), f1 = srv.indexOf("setInterval(() => { void crediterDetenteursSkins(); }, 600000)");
vu(f0 > 0 && f1 > f0, 'crediterDetenteursSkins et son minuteur de 10 min existent');
const f = srv.slice(f0, f1);
vu(/await lireSkinsSrv\(\{ rpc: rpcServeur \}\)/.test(f) && /if \(!r \|\| r\.etat !== 'LU'\) return;/.test(f), 'lit la chaine, n agit que sur une lecture LU');
vu(/Date\.now\(\) - skinsDetenus\.lu < 600000/.test(f), 'jamais plus souvent que 10 min');
vu(/const jour = jourDe\(Date\.now\(\)\)\.id/.test(f) && /revenu\.passes\[a\] = \[\.\.\.ids, jour\]\.sort\(\)/.test(f), 'le jour COURANT seulement, dans revenu.passes');
vu(/a !== contrat/.test(f) && /!\/\^0x0\{40\}\$\/\.test\(a\)/.test(f) && /!internes\.has\(a\)/.test(f), 'exclus : le contrat, l adresse nulle, les internes');
vu(/function corpsTirage\(\) \{\s*void crediterDetenteursSkins\(\);/.test(srv), 'appele par /api/tirage (corpsTirage)');
const A = '0x' + 'ab'.repeat(20);
vu(ticketsJour({}, 'J2026-10-18', { [A]: ['J2026-10-18'] }).includes(A) && !ticketsJour({}, 'J2026-10-19', { [A]: ['J2026-10-18'] }).includes(A), 'un pass du jour = ticket ce jour-la, pas le lendemain (sans volume)');
console.log('ok skin-ticket - ' + n + ' assertions ; NE PROUVE PAS une lecture reelle (0 skin minte)');
