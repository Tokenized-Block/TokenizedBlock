/* test-boutique-block-20261104.mjs -- LE « BLOCK MARCHAND » : la boutique Shopify gravee a la naissance, relue sur la page.
 *
 * Ce que ce banc PROUVE : l URL est refusee (jamais nettoyee) si elle n est pas https, porte un caractere invisible ou un override
 * bidirectionnel, sort de l ASCII, est en punycode, vise une IP, porte identifiants ou port, depasse 200 caracteres ; la requete et
 * le fragment ne sont pas graves ; la cle `shopify_store` arrive EN DERNIER (le marqueur `"face":{` relu par le hook est intact) et,
 * sans boutique, l URI de naissance est la MEME qu avant ; face.js re-valide a la lecture (une URI ecrite ailleurs ne rend pas un
 * javascript: cliquable) ; planNaissance refuse une boutique invalide AVANT toute lecture de chaine ; la page, le serveur et le
 * MCP sont cables ; huit mutants meurent.
 * Ce qu il NE PROUVE PAS : que la boutique gravee appartient au createur ni qu elle accepte l USDC (declaration, dite comme telle).
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { uriNaissance, planNaissance } from './naissance-api.js';
import { faceDepuisUri } from './face.js';

const ICI = new URL('./', import.meta.url);
const SRC = readFileSync(new URL('./boutique-block.js', ICI), 'utf8');
const PAGE = readFileSync(new URL('./app.html', ICI), 'utf8');
const SERVEUR = readFileSync(new URL('./serveur-web.js', ICI), 'utf8');
const MCP = readFileSync(new URL('./mcp-tblock.js', ICI), 'utf8');
const NAISSANCE = readFileSync(new URL('./naissance-api.js', ICI), 'utf8');
const RLO = String.fromCodePoint(0x202E); /* construit ici : aucun caractere invisible dans ce source */
const ZWSP = String.fromCodePoint(0x200B);
const ADR = '0x' + '7a'.repeat(20);

async function suite(B) {
  const ko = [];
  const ok = (c, m) => { if (!c) ko.push(m); };
  const essai = async (m, fn) => { try { await fn(); } catch (e) { ko.push(m + ' (jete : ' + String(e && e.message).slice(0, 90) + ')'); } };

  await essai('validation', () => {
    const a = B.validerUrlBoutique('https://Ma-Boutique.myshopify.com');
    ok(a.ok && a.url === 'https://ma-boutique.myshopify.com/' && a.myshopify === true, 'myshopify accepte, hote en minuscules');
    const c = B.validerUrlBoutique('https://shop.example.com/collections/tb?utm=1#haut');
    ok(c.ok && c.url === 'https://shop.example.com/collections/tb' && c.myshopify === false, 'domaine propre accepte ; requete et fragment NON graves');
    ok(B.validerUrlBoutique('https://a.b.myshopify.com').ok && B.validerUrlBoutique('https://a.b.myshopify.com').myshopify === false, 'sous-sous-domaine : pas marque myshopify');
    for (const [t, m] of [
      ['javascript:alert(1)', 'javascript:'], ['data:text/html,<b>x', 'data:'], ['http://a.myshopify.com', 'http'], ['ftp://a.com', 'ftp'],
      ['https://xn--80ak6aa92e.com', 'punycode'], ['https://1.2.3.4/', 'IP v4'], ['https://[::1]/', 'IP v6'], ['https://u:p@a.com', 'identifiants'],
      ['https://a.com:8443', 'port'], ['https://a.com/' + RLO + 'gpj', 'override bidi'], ['https://a.com/x' + ZWSP, 'largeur nulle'],
      ['https://boutié.com', 'non ASCII'], ['https://localhost/', 'sans point'], ['https://a.com/' + 'x'.repeat(200), 'trop long'],
      ['https://-a.com', 'label invalide'], ['https://a.123', 'TLD numerique'], ['', 'vide'], ['   ', 'blanc']]) {
      ok(B.validerUrlBoutique(t).ok === false, 'refuse : ' + m);
    }
    ok(B.validerUrlBoutique(42).ok === false, 'refuse : pas un texte');
    /* l ASCII seul suffirait a refuser ces deux-la ; la garde des invisibles DIT pourquoi (le createur voit la vraie raison) */
    ok(/hidden or direction-changing/.test(B.validerUrlBoutique('https://a.com/' + RLO + 'gpj').pourquoi), 'override bidi : nomme comme tel');
    ok(/hidden or direction-changing/.test(B.validerUrlBoutique('https://a.com/x' + ZWSP).pourquoi), 'largeur nulle : nomme comme tel');
    ok(B.validerUrlBoutique('https://a.com/#' + 'x'.repeat(250)).ok === false, 'texte tape > 200 refuse meme si sa forme canonique est courte');
    ok(/only plain ASCII/.test(B.validerUrlBoutique('https://a.com/caf' + String.fromCodePoint(0xE9)).pourquoi || ''), 'chemin non ASCII : refuse (pas re-encode en silence)');
  });

  await essai('champ', () => {
    ok(JSON.stringify(B.champBoutique('')) === '{}' && JSON.stringify(B.champBoutique(null)) === '{}', 'sans boutique : rien');
    ok(JSON.stringify(B.champBoutique('https://x.myshopify.com')) === '{"shopify_store":{"url":"https://x.myshopify.com/","currency":"USDC","declared_by":"creator"}}', 'avec : cle nommee, declaration dite');
    let jete = false; try { B.champBoutique('javascript:x'); } catch (_) { jete = true; }
    ok(jete, 'URL refusee : la gravure jette (jamais en silence)');
    ok(B.boutiqueDepuisMeta({ shopify_store: { url: 'javascript:alert(1)' } }) === null, 'relecture : un javascript: grave ailleurs ne rend rien');
    ok(B.boutiqueDepuisMeta({ shopify_store: { url: 'https://a.com/?q=1' } }).url === 'https://a.com/', 'relecture : forme canonique');
    ok(B.boutiqueDepuisMeta({ shopify_store: 'https://a.com' }) === null && B.boutiqueDepuisMeta(null) === null, 'relecture : forme inattendue = rien');
  });
  return ko;
}

const B = await import('./boutique-block.js');
const ko = await suite(B);

/* la naissance (naissance-api.js) et la relecture (face.js) — avec le vrai module */
const sans = uriNaissance({ nom: 'Shop', symbole: 'SHOP', adresse: ADR, paire: null });
const avec = uriNaissance({ nom: 'Shop', symbole: 'SHOP', adresse: ADR, paire: null, boutique: 'https://ma-boutique.myshopify.com' });
const jSans = decodeURIComponent(sans.slice(sans.indexOf(',') + 1));
const jAvec = decodeURIComponent(avec.slice(avec.indexOf(',') + 1));
if (sans !== uriNaissance({ nom: 'Shop', symbole: 'SHOP', adresse: ADR, paire: null, boutique: '' })) ko.push('boutique vide : URI identique a celle sans boutique');
if (!jAvec.startsWith(jSans.slice(0, -1)) || !jAvec.endsWith(',"shopify_store":{"url":"https://ma-boutique.myshopify.com/","currency":"USDC","declared_by":"creator"}}')) ko.push('shopify_store EN DERNIER, le reste octet pour octet');
if (!jAvec.includes('"face":{') || jSans.includes('shopify_store')) ko.push('marqueur "face":{ present ; sans boutique, aucune cle');
const fr = faceDepuisUri(avec);
if (fr.etat !== 'LU' || !fr.boutique || fr.boutique.url !== 'https://ma-boutique.myshopify.com/' || fr.boutique.myshopify !== true) ko.push('face.js relit la boutique');
if (faceDepuisUri(sans).boutique !== null) ko.push('face.js : sans boutique, null');
const falsifiee = 'data:application/json,' + encodeURIComponent(JSON.stringify({ ...JSON.parse(jSans), shopify_store: { url: 'javascript:alert(1)' } }));
if (faceDepuisUri(falsifiee).boutique !== null) ko.push('face.js : une boutique falsifiee (gravee ailleurs) n est pas rendue');
let rpcAppele = false;
const p = await planNaissance({ nom: 'Shop', symbole: 'SHOP', compte: ADR, paire: 'ETH', sel: 's', boutique: 'http://x.com' },
  { rpc: async () => { rpcAppele = true; throw new Error('pas de reseau ici'); }, prixUsd: async () => null });
if (p.etat !== 'REFUSE' || !/Shopify store URL/.test(p.pourquoi) || rpcAppele) ko.push('planNaissance : boutique invalide refusee AVANT toute lecture de chaine');
if (ko.length) { for (const k of ko) console.log('KO ' + k); process.exit(1); }
console.log('  ok  suite verte (validation, gravure, relecture, plan)');

/* cablage */
assert.ok(PAGE.includes("from './boutique-block.js'"), 'page : module importe');
assert.ok(SERVEUR.includes("'boutique-block.js',") && SERVEUR.includes("'texte-onchain.js',"), 'serveur : module SERVI (et sa dependance)');
assert.ok(/<input id="cBoutique" type="url"[^>]*maxlength="200"/.test(PAGE), 'page : champ facultatif de la naissance');
assert.ok(/\.\.\.champBoutique\(\$\('#cBoutique'\)/.test(PAGE), 'page : uriCreation grave la boutique');
const iMeta = PAGE.indexOf('function uriCreation()');
const blocMeta = PAGE.slice(iMeta, PAGE.indexOf('const uri =', iMeta));
assert.ok(blocMeta.lastIndexOf('champBoutique') > blocMeta.lastIndexOf('pair:'), 'page : la boutique en DERNIER dans la meta');
assert.ok(/<div id="pBoutique" hidden><\/div>/.test(PAGE), 'page : bloc boutique cache par defaut');
const iProfil = PAGE.indexOf("const elBoutique = $('#pBoutique');");
const blocProfil = PAGE.slice(iProfil, PAGE.indexOf("const elTweet = $('#pTweet');", iProfil));
assert.ok(iProfil > 0 && blocProfil.includes('validerUrlBoutique(j.boutique.url)') && blocProfil.includes('a.href = v.url') && blocProfil.includes('TEXTE_LIEN_BOUTIQUE'), 'page : lien re-valide avant d etre cliquable');
assert.ok(!/innerHTML/.test(blocProfil), 'page : aucun innerHTML pour un texte grave par d autres');
assert.ok(B.TEXTE_LIEN_BOUTIQUE === "Pay this block's shop in USDC (Shopify)", 'libelle demande');
assert.ok(/boutique: r\.boutique \|\| null/.test(SERVEUR), 'serveur : /api/face rend la boutique relue');
assert.ok(/boutique: qN\.get\('boutique'\)/.test(SERVEUR) && /boutique: a\.shopifyStore \|\| null/.test(SERVEUR), 'serveur : /api/naissance/plan et le MCP passent la boutique');
assert.ok(/shopifyStore: \{ type: 'string', maxLength: 200/.test(MCP), 'MCP : champ shopifyStore declare');
assert.ok(NAISSANCE.includes('...champBoutique(boutique)'), 'naissance-api : gravure par le module partage');
console.log('  ok  cablage page + serveur + MCP');

const MUTANTS = [
  ['https non exige', "if (u.protocol !== 'https:')", 'if (false)'],
  ['invisibles ignores', "if (INVISIBLE.test(t)) return", 'if (false) return'],
  ['ASCII non exige', 'if (!ASCII_IMPRIMABLE.test(t)) return', 'if (false) return'],
  ['punycode accepte', "if (labels.some((l) => l.startsWith('xn--')))", 'if (false)'],
  ['port accepte', 'if (u.port) return', 'if (false) return'],
  ['longueur non bornee', 'if (t.length > MAX_URL_BOUTIQUE) return', 'if (false) return'],
  ['relecture non revalidee', 'return v.ok ? v : null;', 'return { ok: true, url: brut, hote: brut, myshopify: false };'],
  ['requete gravee', "(u.pathname === '/' ? '/' : u.pathname)", "(u.pathname === '/' ? '/' : u.pathname) + u.search"],
];
const tmp = mkdtempSync(path.join(tmpdir(), 'mut-boutique-'));
try {
  writeFileSync(path.join(tmp, 'texte-onchain.js'), readFileSync(new URL('./texte-onchain.js', ICI), 'utf8'));
  let k = 0;
  for (const [nom, de, vers] of MUTANTS) {
    assert.ok(SRC.includes(de), 'mutant « ' + nom + ' » : motif introuvable');
    const f = path.join(tmp, 'boutique-block-' + (k++) + '.mjs');
    writeFileSync(f, SRC.replace(de, vers));
    const r = await suite(await import(pathToFileURL(f).href));
    assert.ok(r.length > 0, 'le mutant « ' + nom + ' » a SURVECU');
    console.log('  ok  mutant « ' + nom + ' » tue (' + r.length + ' rouge(s), ex. ' + r[0] + ')');
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }
console.log('test-boutique-block-20261104 : VERT');
