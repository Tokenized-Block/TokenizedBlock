// vendor-xmtp.mjs — recupere les fichiers du SDK XMTP et REFUSE au moindre octet different.
// ================================================================================================
// ⛔⛔ POURQUOI VENDORISER. Mesure du 2026-09-13 : `@xmtp/browser-sdk` ne se charge PAS tel quel depuis
//    le CDN — ses workers doivent etre servis par notre origine (regle navigateur), aux chemins
//    absolus `/npm/...` que son code calcule. Servis par nous, il se charge : import en 201 ms,
//    `Client.canMessage` OK. Voir `../MESURE-xmtp-sans-bundler-2026-09-13.md`.
//
// ⛔⛔ POURQUOI PAS DANS GIT. 46 fichiers, 14 Mo (dont 12,8 Mo de WASM). Dans un depot PUBLIC, ils
//    resteraient dans l historique pour toujours. Le manifeste des empreintes est suivi ; les fichiers
//    sont telecharges puis VERIFIES. Meme garantie, sans le poids.
//
// ⛔ FAIL-CLOSED. jsdelivr previent que ses `+esm` sont GENERES : un rebundle cote CDN changerait des
//    octets. Ce code manipule la signature du wallet de nos utilisateurs ; un fichier qui change sans
//    qu on l ait decide ne doit pas partir en production. Empreinte differente ⇒ sortie en erreur.
//
// Usage :
//   node vendor-xmtp.mjs --figer    lit le CDN, ecrit vendor/ ET le manifeste (a relire avant commit)
//   node vendor-xmtp.mjs            verifie vendor/ contre le manifeste, telecharge ce qui manque
//
// ⛔ LECTURE SEULE SUR LE RESEAU (cdn.jsdelivr.net). Ecrit UNIQUEMENT sous vendor/ et le manifeste.
// ⛔ N EXECUTE RIEN de ce qui est telecharge.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ici = dirname(fileURLToPath(import.meta.url));
const VENDOR = join(ici, 'vendor');
const MANIFESTE = join(ici, 'xmtp-manifeste.json');
const CDN = 'https://cdn.jsdelivr.net';
const MAX_FICHIERS = 200;

/* Chemin SERVI -> source CDN. Les workers sont servis sans extension : c est ce que le code calcule. */
const DEPART = [
  ['/npm/@xmtp/browser-sdk@7.1.0/+esm', '/npm/@xmtp/browser-sdk@7.1.0/+esm'],
  ['/npm/@xmtp/browser-sdk@7.1.0/dist/workers/client', '/npm/@xmtp/browser-sdk@7.1.0/dist/workers/client.js/+esm'],
  ['/npm/@xmtp/browser-sdk@7.1.0/dist/workers/opfs', '/npm/@xmtp/browser-sdk@7.1.0/dist/workers/opfs.js/+esm'],
  ['/npm/@xmtp/wasm-bindings@1.11.0/dist/bindings_wasm_bg.wasm', '/npm/@xmtp/wasm-bindings@1.11.0/dist/bindings_wasm_bg.wasm'],
];

const sha = (o) => createHash('sha256').update(o).digest('hex');
const local = (servi) => join(VENDOR, ...servi.split('/').filter(Boolean));

async function recuperer(source) {
  const r = await fetch(CDN + source, { headers: { 'x-ms-monitor': '1' } });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + source);
  return Buffer.from(await r.arrayBuffer());
}
function ecrire(servi, octets) {
  const cible = local(servi);
  mkdirSync(dirname(cible), { recursive: true });
  writeFileSync(cible, octets);
}

async function figer() {
  const vus = new Map();
  const file = [...DEPART];
  const imports = /["'](\/npm\/[^"'\s]+)["']/g;
  while (file.length) {
    if (vus.size >= MAX_FICHIERS) throw new Error('plafond de ' + MAX_FICHIERS + ' fichiers atteint — arbre inattendu, rien n est fige');
    const [servi, source] = file.shift();
    if (vus.has(servi)) continue;
    const octets = await recuperer(source);
    ecrire(servi, octets);
    vus.set(servi, { source, octets: octets.length, sha256: sha(octets) });
    if (servi.endsWith('.wasm')) continue;
    for (const m of octets.toString('utf8').matchAll(imports)) {
      const chemin = m[1].split('?')[0];
      if (!vus.has(chemin) && !file.some(([s]) => s === chemin)) file.push([chemin, chemin]);
    }
  }
  const fichiers = Object.fromEntries([...vus.entries()].sort());
  const total = [...vus.values()].reduce((s, v) => s + v.octets, 0);
  writeFileSync(MANIFESTE, JSON.stringify({ fige_le: new Date().toISOString().slice(0, 10), total, nombre: vus.size, fichiers }, null, 2) + '\n');
  console.log('fige :', vus.size, 'fichiers,', (total / 1e6).toFixed(2), 'Mo — RELIRE le manifeste avant de le committer.');
}

async function verifier() {
  if (!existsSync(MANIFESTE)) throw new Error('aucun manifeste — lancer d abord : node vendor-xmtp.mjs --figer');
  const { fichiers } = JSON.parse(readFileSync(MANIFESTE, 'utf8'));
  let telecharges = 0;
  const differents = [];
  for (const [servi, attendu] of Object.entries(fichiers)) {
    let octets = existsSync(local(servi)) ? readFileSync(local(servi)) : null;
    if (!octets) { octets = await recuperer(attendu.source); telecharges++; }
    if (sha(octets) !== attendu.sha256) { differents.push(servi); continue; }
    ecrire(servi, octets);
  }
  if (differents.length) {
    /* ⛔ ON N ECRASE RIEN ET ON SORT EN ERREUR : un octet different est une decision, pas un detail. */
    console.error('⛔ EMPREINTE DIFFERENTE pour ' + differents.length + ' fichier(s) :');
    for (const d of differents) console.error('   ' + d);
    process.exitCode = 1;
    return;
  }
  console.log('✅ ' + Object.keys(fichiers).length + ' fichier(s) verifies (' + telecharges + ' telecharge(s)) — empreintes conformes.');
}

if (process.argv.includes('--figer')) await figer(); else await verifier();
