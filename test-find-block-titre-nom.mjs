/* test-find-block-titre-nom.mjs — « FIND A BLOCK » : UN BLOCK SANS SYMBOLE NE MONTRE PAS SON ADRESSE DEUX FOIS.
 *
 * Ce qui etait a l ecran (game56) : un resultat sans symbole s affichait « 0xb200…7a38 · 0xb200…7a38 · Block · United Oil Trust
 *   Fund » — le titre retombait sur l adresse courte, et le detail la repetait.
 * Ce qui est attendu : « United Oil Trust Fund · 0xb200…7a38 · Block » (nom · adresse courte · rang). Sans nom non plus : l adresse
 *   courte UNE fois, puis le rang. Avec un symbole : rien ne change (symbole, puis adresse · rang · nom).
 *
 * ⛔ PORTABLE LF/CRLF : l extraction cherche la fin de fonction avec \r?\n, et tout le test est rejoue sur une copie CRLF d app.html.
 * ⛔ EXTRACTION PROUVEE : chaque fonction extraite doit etre TROUVEE et etre une fonction ; sinon le test leve (jamais vert sur du vide).
 * ⛔ BORNE : ce test execute le vrai peindreResultatsB20 d app.html avec un faux element ; il ne prouve pas le rendu CSS d un navigateur. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(fileURLToPath(new URL('./app.html', import.meta.url)), 'utf8');

let n = 0, ko = 0;
const ok = (c, m, vu) => { n += 1; if (c) console.log('  ok  ' + m); else { ko += 1; console.log('  KO  ' + m + (vu === undefined ? '' : '\n        vu : ' + vu)); } };

/** la source d une fonction de premier niveau : de `function nom(` a la premiere ligne `}` seule (LF ou CRLF) */
function extraire(src, nom) {
  const debut = new RegExp('\\r?\\nfunction ' + nom + '\\(').exec(src);
  if (!debut) throw new Error(nom + ' introuvable dans app.html');
  const d = debut.index + debut[0].indexOf('function');
  const fin = /\r?\n\}\r?\n/g; fin.lastIndex = d;
  const m = fin.exec(src);
  if (!m) throw new Error(nom + ' : fin de fonction introuvable');
  const t = src.slice(d, m.index + m[0].length);
  if (t.length < 80) throw new Error(nom + ' : extraction suspecte (' + t.length + ' caracteres)');
  return t;
}

function charger(src) {
  const code = ['libelleRangB20', 'peindreResultatsB20'].map((f) => extraire(src, f)).join('\n');
  const enTexte = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const court = (a) => a.slice(0, 6) + '…' + a.slice(-4);
  const phraseRechercheVide = () => 'vide';
  const f = new Function('enTexte', 'court', 'phraseRechercheVide', code + '\nreturn { libelleRangB20, peindreResultatsB20 };')(enTexte, court, phraseRechercheVide);
  if (typeof f.peindreResultatsB20 !== 'function' || typeof f.libelleRangB20 !== 'function') throw new Error('extraction : fonctions non definies');
  return f;
}

/** le texte visible d un resultat (balises retirees ; <b> et <span> separes comme a l ecran) */
const lignes = (html) => [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => {
  const b = (m[1].match(/<b>([\s\S]*?)<\/b>/) || [])[1];
  const s = (m[1].match(/<span>([\s\S]*?)<\/span>/) || [])[1];
  return { titre: b, detail: s, tout: b + ' · ' + s };
});

const ADR = '0xb2000000000000000000000000000000000a7a38';
const ADR2 = '0xb200000000000000000000000000000000001234';
const ADR3 = '0xb20000000000000000000000000000000000beef';

function verifier(src, quoi) {
  console.log('— ' + quoi);
  const { peindreResultatsB20 } = charger(src);
  const el = { hidden: true, innerHTML: '', onclick: null };
  peindreResultatsB20(el, 'united', { etat: 'TROUVE', resultats: [
    { adr: ADR, sym: null, nom: 'United Oil Trust Fund', rang: 'NOM_DEBUT' },
    { adr: ADR2, sym: '', nom: '', rang: 'ADRESSE_DEBUT' },
    { adr: ADR3, sym: 'UNIT', nom: 'Unit Coin', rang: 'SYMBOLE' },
  ] }, () => {});
  const L = lignes(el.innerHTML);
  ok(L.length === 3, 'trois resultats peints', el.innerHTML);
  const [a, b, c] = L;
  const occ = (s, x) => s.split(x).length - 1;
  ok(a && a.tout === 'United Oil Trust Fund · 0xb200…7a38 · Block', 'sans symbole : « nom · adresse courte · Block »', a && a.tout);
  ok(a && occ(a.tout, '0xb200…7a38') === 1, 'sans symbole : l adresse courte UNE seule fois', a && a.tout);
  ok(b && b.tout === '0xb200…1234 · Block', 'ni symbole ni nom : l adresse courte une fois, puis le rang', b && b.tout);
  ok(b && occ(b.tout, '0xb200…1234') === 1, 'ni symbole ni nom : pas d adresse en double', b && b.tout);
  ok(c && c.tout === 'UNIT · 0xb200…beef · Block · Unit Coin', 'avec symbole : inchange (symbole · adresse · rang · nom)', c && c.tout);
  ok(!/0xa6cf/i.test(el.innerHTML), 'aucune adresse du wallet de frais dans la liste');
}

verifier(SRC, 'app.html tel qu il est sur le disque');
verifier(SRC.replace(/\r?\n/g, '\r\n'), 'app.html en CRLF (checkout Windows)');

console.log((ko ? 'KO' : 'OK') + ' — ' + (n - ko) + '/' + n);
process.exit(ko ? 1 : 0);
