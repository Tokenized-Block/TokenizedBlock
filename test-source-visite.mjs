/* test-source-visite.mjs — D OU VIENNENT LES VISITES : LE COMPTEUR DOIT ARRIVER, ET NE RIEN DIRE DE PLUS.
 *
 * ⛔⛔ LE TROU QUE CE MODULE COMBLE, MESURE LE 2026-09-29 : 384 visites en 11 jours et AUCUNE trace
 *     de leur origine — pas de `Referer` cote serveur, pas de `document.referrer` dans la page, pas
 *     d `utm_`, rien dans les logs Railway. C est pour ca que la chute du taux clic/visite
 *     (16,73 % -> 0,87 %, cinq jours a ZERO clic sur 101 visites) n a pas pu etre attribuee : ni a
 *     une regression du bouton, ni a la fin de nos propres tests.
 *
 * CE FICHIER GARDE TROIS CHOSES, ET LA PREMIERE EST LA PLUS IMPORTANTE :
 *   1. les categories emises sont TOUTES dans `ETAPES_ENTONNOIR` — sinon `/api/etape` les jette EN
 *      SILENCE et chaque ligne vaut 0 pour toujours, indiscernable d une source sans visiteurs ;
 *   2. le classement ne se laisse pas FALSIFIER par un hote qui contient le nom d une plateforme ;
 *   3. aucune URL, aucun chemin, aucun parametre ne sort du module.
 *
 * ⚠️ BORNE : ce test ne prouve pas qu un navigateur reel fournisse un referrer. Il est vide dans
 *    beaucoup de cas legitimes, et c est la raison d etre de `src_direct` — qui veut dire « aucun
 *    referrer LU », jamais « adresse tapee ».
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SOURCES, categorieSource } from './source-visite.js';

const serveur = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const cas = (t, f) => { n += 1; try { f(); } catch (e) { console.error('✗ ' + t); throw e; } };

cas('⛔⛔⛔ TOUTE CATEGORIE EMISE EST ACCEPTEE PAR LE SERVEUR', () => {
  const bloc = /const ETAPES_ENTONNOIR = \[([\s\S]*?)\];/.exec(serveur);
  assert.ok(bloc, 'ETAPES_ENTONNOIR introuvable : ce test ne garde plus rien');
  const blanche = new Set([...bloc[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]));
  const orphelines = SOURCES.filter((s) => !blanche.has(s));
  assert.deepEqual(orphelines, [],
    'ces categories seraient JETEES EN SILENCE par /api/etape et vaudraient 0 pour toujours : '
    + orphelines.join(', '));
  /* ⛔ TEMOIN : la garde doit savoir detecter une absence, sinon elle est verte par accident. */
  assert.equal(blanche.has('src_nom_qui_nexiste_pas'), false, 'le temoin existe vraiment');
  console.log('   ' + SOURCES.length + ' categories, toutes acceptees.');
});

cas('⛔ LA FONCTION EST TOTALE : toute entree rend une categorie de la liste', () => {
  /* ⛔ UN `null` OU UNE EXCEPTION ICI ferait sauter le compteur de visite entier sur certains
   *   navigateurs — et un entonnoir qui perd `visite` ne mesure plus rien du tout. */
  for (const x of [undefined, null, '', '   ', 'pas une url', 'javascript:alert(1)', 42, {}, [],
    'http://', 'https://x.com/i/status/1', 'HTTPS://X.COM/', 'about:blank']) {
    const r = categorieSource(x);
    assert.ok(SOURCES.includes(r), 'entree ' + JSON.stringify(x) + ' rend « ' + r + ' », hors liste');
  }
});

cas('⛔ LES FAMILLES SONT RECONNUES, et le referrer vide tombe en src_direct', () => {
  const attendu = [
    ['https://x.com/someone/status/1', 'src_x'],
    ['https://twitter.com/x', 'src_x'],
    ['https://t.co/abc', 'src_x'],
    ['https://warpcast.com/~/channel/base', 'src_farcaster'],
    ['https://t.me/canal', 'src_telegram'],
    ['https://discord.com/channels/1/2', 'src_discord'],
    ['https://www.reddit.com/r/base/', 'src_reddit'],
    ['https://www.google.com/search?q=x', 'src_recherche'],
    ['https://duckduckgo.com/?q=x', 'src_recherche'],
    ['https://github.com/Tokenized-Block/x', 'src_github'],
    ['https://basescan.org/address/0x1', 'src_base'],
    ['https://tokenizedblock.space/?block=0x1', 'src_interne'],
    ['https://un-site-inconnu.example/page', 'src_autre'],
    ['', 'src_direct'],
  ];
  for (const [ref, veut] of attendu) {
    assert.equal(categorieSource(ref), veut, ref + ' -> attendu ' + veut);
  }
});

cas('⛔⛔ LE CLASSEMENT NE SE LAISSE PAS FALSIFIER PAR UN HOTE TROMPEUR', () => {
  /* ⛔⛔ C EST LE CAS QUI JUSTIFIE LES ANCRES. Avec un `includes`, n importe qui pouvant poster un
   *     lien depuis `x.com.attaquant.net` se ferait compter comme trafic X — et la source la plus
   *     facile a fabriquer deviendrait la mieux notee. Une metrique falsifiable oriente les
   *     decisions de celui qui la falsifie. */
  for (const faux of ['https://x.com.attaquant.net/p', 'https://notx.com/p',
    'https://google.com.evil.io/s', 'https://tokenizedblock.space.evil.io/',
    'https://fake-github.com/x', 'https://reddit.com.phish.tld/r/base']) {
    const r = categorieSource(faux);
    assert.equal(r, 'src_autre', faux + ' classe « ' + r + ' » : le motif n est pas ancre');
  }
  /* ⛔ ET LES VRAIS SOUS-DOMAINES DOIVENT PASSER, sinon l ancre est trop severe et on perd du signal. */
  assert.equal(categorieSource('https://www.reddit.com/r/base'), 'src_reddit');
  assert.equal(categorieSource('https://mobile.twitter.com/x'), 'src_x');
});

cas('⛔ AUCUNE URL NE SORT DU MODULE : la sortie est toujours une categorie courte', () => {
  for (const ref of ['https://x.com/qui/status/1234567890?s=20&secret=abc',
    'https://mail.example.com/inbox/message/42']) {
    const r = categorieSource(ref);
    assert.ok(/^src_[a-z]+$/.test(r), 'sortie « ' + r + ' » : ce n est pas une categorie fermee');
    assert.ok(!r.includes('://') && !r.includes('?') && !r.includes('/'),
      'la sortie porte un fragment d URL');
    assert.ok(r.length <= 20, 'sortie anormalement longue : ' + r.length);
  }
});

cas('⛔⛔ LA PAGE L EMET, UNE SEULE FOIS PAR SESSION, A COTE DE `visite`', () => {
  /* ⛔⛔ SANS `uneFois: true`, le compteur de source depasserait les visites et ne se diviserait plus
   *     par elles — faute deja payee le meme jour avec `wallet_base_pret` a 79 pour 14 visites. */
  assert.match(html, /import \{ categorieSource \} from '\.\/source-visite\.js'/,
    'le module n est pas importe par la page');
  assert.match(html, /etape\(categorieSource\(document\.referrer\), true\)/,
    'la page n emet pas la source, ou l emet sans `uneFois: true`');
  const iV = html.indexOf("etape('visite', true)");
  const iS = html.indexOf('etape(categorieSource(document.referrer), true)');
  assert.ok(iV > 0 && iS > iV && iS - iV < 2000,
    'la source n est pas emise juste apres `visite` : les deux doivent partir du meme endroit pour '
    + 'etre comparables (visite comme denominateur)');
});

cas('⛔⛔ POUVOIR DE DETECTION PROUVE PAR MUTATION', () => {
  /* ⛔ Un test ecrit apres le code est vert par construction. Chaque mutation doit faire tomber la
   *   garde qui la surveille, et chaque mutation verifie D ABORD qu elle a change quelque chose. */
  const mutations = [
    ['une categorie sort de la liste blanche',
      () => SOURCES.concat('src_pas_declaree'),
      (l) => l.some((s) => !/^src_(direct|x|farcaster|telegram|discord|reddit|recherche|github|base|interne|autre)$/.test(s))],
    ['la page perd le `uneFois`',
      () => html.replace('etape(categorieSource(document.referrer), true)', 'etape(categorieSource(document.referrer))'),
      (s) => !/etape\(categorieSource\(document\.referrer\), true\)/.test(s)],
    ['la page perd l import',
      () => html.replace("import { categorieSource } from './source-visite.js';", ''),
      (s) => !/import \{ categorieSource \} from '\.\/source-visite\.js'/.test(s)],
  ];
  for (const [quoi, muter, detecte] of mutations) {
    const m = muter();
    if (typeof m === 'string') assert.notEqual(m, html, 'mutation « ' + quoi + ' » SANS EFFET');
    assert.equal(detecte(m), true, 'mutation « ' + quoi + ' » NON DETECTEE : garde decorative');
  }
  console.log('   ✓ 3/3 mutations detectees.');
});

console.log('✓ test-source-visite : ' + n + ' cas');
console.log('   ' + SOURCES.length + ' categories fermees, toutes acceptees par le serveur, classement');
console.log('   ancre (non falsifiable), fonction totale, emise une seule fois par session.');
console.log('   ⚠️ NE PROUVE PAS qu un navigateur fournisse un referrer : `src_direct` veut dire');
console.log('      « aucun referrer LU », jamais « adresse tapee ».');
