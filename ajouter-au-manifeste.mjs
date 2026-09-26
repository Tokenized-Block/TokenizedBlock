/* ajouter-au-manifeste.mjs — AJOUTE UNE SEULE ENTREE, ET REFUSE DE TOUCHER AUX AUTRES.
 *
 * ⛔⛔ POURQUOI CE SCRIPT EXISTE AU LIEU DE `vendor-xmtp.mjs --figer`. Le re-figeage reecrit TOUTES
 *     les empreintes a partir de ce que le CDN sert aujourd hui. L utiliser pour ajouter une ligne
 *     accepterait en silence un rebundle des 45 fichiers XMTP — et c est precisement ce que ce
 *     fail-closed existe pour empecher. jsdelivr previent lui-meme que ses `+esm` sont GENERES.
 *   ⇒ Ici : une entree, calculee depuis les octets telecharges, inseree sans qu aucune autre bouge.
 *     Si une cle existe deja, on SORT EN ERREUR au lieu de l ecraser.
 *
 * Usage : node ajouter-au-manifeste.mjs <chemin-servi> [source-cdn]
 * ⛔ LECTURE SEULE SUR LE RESEAU. Ecrit uniquement le manifeste et le fichier sous vendor/.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ici = dirname(fileURLToPath(import.meta.url));
const MANIFESTE = join(ici, 'xmtp-manifeste.json');
const CDN = 'https://cdn.jsdelivr.net';

const servi = process.argv[2];
const source = process.argv[3] || servi;
if (!servi || !servi.startsWith('/npm/') || servi.includes('..')) {
  console.error('⛔ chemin servi attendu, sous /npm/, sans « .. »');
  process.exit(1);
}

const m = JSON.parse(readFileSync(MANIFESTE, 'utf8'));
const avant = JSON.stringify(m.fichiers);
if (m.fichiers[servi]) {
  console.error('⛔ cette cle existe deja : ' + servi + ' — ce script n ecrase rien.');
  process.exit(1);
}

const r = await fetch(CDN + source, { headers: { 'x-ms-monitor': '1' } });
if (!r.ok) { console.error('⛔ HTTP ' + r.status + ' sur ' + source); process.exit(1); }
const octets = Buffer.from(await r.arrayBuffer());
/* ⛔ L EMPREINTE EST CALCULEE ICI, DEPUIS LES OCTETS. La recopier a la main depuis une sortie de
 *   terminal serait exactement le geste qui a deja coute une adresse completee de memoire. */
const sha256 = createHash('sha256').update(octets).digest('hex');

const cible = join(ici, 'vendor', ...servi.split('/').filter(Boolean));
mkdirSync(dirname(cible), { recursive: true });
writeFileSync(cible, octets);

m.fichiers[servi] = { source, octets: octets.length, sha256 };
m.fichiers = Object.fromEntries(Object.entries(m.fichiers).sort());
m.nombre = Object.keys(m.fichiers).length;
m.total = Object.values(m.fichiers).reduce((s, v) => s + v.octets, 0);

/* ⛔ CONTROLE AVANT ECRITURE : toute entree preexistante doit etre IDENTIQUE, au caractere. */
const apres = Object.fromEntries(Object.entries(m.fichiers).filter(([k]) => k !== servi));
const avantObj = JSON.parse(avant);
const bouge = Object.keys(avantObj).filter((k) => JSON.stringify(avantObj[k]) !== JSON.stringify(apres[k]));
if (bouge.length) {
  console.error('⛔ ' + bouge.length + ' entree(s) preexistante(s) auraient change — rien n est ecrit :');
  for (const b of bouge) console.error('   ' + b);
  process.exit(1);
}

writeFileSync(MANIFESTE, JSON.stringify(m, null, 2) + '\n');
console.log('ajoute : ' + servi);
console.log('  octets : ' + octets.length);
console.log('  sha256 : ' + sha256);
console.log('  manifeste : ' + m.nombre + ' fichiers, ' + (m.total / 1e6).toFixed(2) + ' Mo');
console.log('✅ les ' + Object.keys(avantObj).length + ' entrees preexistantes sont INCHANGEES.');
