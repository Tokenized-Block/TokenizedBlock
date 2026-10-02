/* test-launch-lock-24h.mjs — le berceau de 24 h cote app : lore Create + avertissement « seize ».
 *
 * ⛔ CE QU IL PROUVE :
 *   · drapeau ETEINT par defaut ; drapeau eteint => ni lore ni avertissement (meme seize ACTIF) ;
 *   · drapeau allume => lore EXACTE (titre + corps approuves) ;
 *   · seize actif => texte « enabled » avec {SYM} remplace ; inconnu => texte « unknown » ;
 *     inactif => RIEN ; devise absente du recensement => inconnu ; ETH/USDC/cbBTC/TOSHI => rien ;
 *   · la table de l app == le fichier de recensement lu sur la chaine (bloc 52070900) ;
 *   · app.html porte les trois emplacements, CACHES et VIDES dans le HTML statique, le module est
 *     importe et servi (liste de serveur-web.js) ;
 *   · 3 lignes a 375 px : la CSS mesuree (11.5 px, -10 px) est en place et aucun texte du registre
 *     ne depasse la longueur du plus long texte MESURE a 3 lignes (mesure-berceau-375.mjs).
 * ⛔ TEMOINS : un etat « disabled » passe par le MEME chemin qu « enabled » et DOIT rendre null ;
 *   l extracteur DOIT trouver la meme chose sur un app.html en CRLF, et DOIT echouer sur un HTML
 *   sans l element ; un texte double DOIT depasser le budget. */
import { readFileSync } from 'node:fs';
import {
  LAUNCH_LOCK_24H, BERCEAU_TITRE, BERCEAU_CORPS, SAISIE_PAR_DEVISE, BLOC_RECENSEMENT_SAISIE,
  etatSaisie, texteSaisie, peindreSaisie, peindreBerceau,
} from './berceau-24h.js';

let n = 0, ko = 0;
const ok = (nom, cond, vu) => {
  n += 1;
  if (cond) { console.log('  ok  ' + nom); return true; }
  ko += 1; console.log('  KO  ' + nom + (vu === undefined ? '' : '\n        vu : ' + JSON.stringify(vu)));
  return false;
};

/* Textes approuves (fondateur, 2026-10-02) — recopies ici A LA MAIN, exprès : le test compare. */
const TITRE = 'First 24 hours: the cradle.';
const CORPS = 'Every block is born protected. For its first day, it lives only in its own pool: anyone can feed it, and anyone who fed it can take back what they bought. No one can drain it, no one can copy it elsewhere. After 24 hours the cradle opens, and your block walks on its own.';
const ACTIF = (s) => `The issuer of ${s} can take back ${s} from any wallet, including your block's collateral. If it does, the collateral shrinks, and we can't reverse it.`;
const INCONNU = (s) => `We couldn't check whether the issuer of ${s} can take back ${s}. Assume it can: your block's collateral could be reduced by the issuer, and we couldn't reverse it.`;

const NVDA = '0xb20000000000000000000078ee7ce2fe4908108c';
const INCONNUE = '0xb200000000000000000000000000000000c0ffee';
const faux = () => ({ textContent: 'ancien', hidden: false });
const fauxBerceau = () => {
  const t = { textContent: '' }, c = { textContent: '' };
  return { hidden: true, t, c, querySelector: (q) => (q.includes('titre') ? t : q.includes('corps') ? c : null) };
};

console.log('\n1. Drapeau');
ok('LAUNCH_LOCK_24H vaut false (ETEINT par defaut)', LAUNCH_LOCK_24H === false, LAUNCH_LOCK_24H);

console.log('\n2. Lore du berceau (Create)');
ok('titre exact', BERCEAU_TITRE === TITRE, BERCEAU_TITRE);
ok('corps exact', BERCEAU_CORPS === CORPS, BERCEAU_CORPS);
{ const b = fauxBerceau(); const r = peindreBerceau(b);
  ok('drapeau par defaut (OFF) : lore ABSENTE (cachee, vide)', r === false && b.hidden === true && b.t.textContent === '' && b.c.textContent === '', b); }
{ const b = fauxBerceau(); peindreBerceau(b, true);
  ok('drapeau ON : lore PRESENTE, titre + corps exacts', b.hidden === false && b.t.textContent === TITRE && b.c.textContent === CORPS, b); }
{ const b = fauxBerceau(); peindreBerceau(b, true); peindreBerceau(b, false);
  ok('TEMOIN : ON puis OFF => la lore disparait (le OFF n est pas un simple « ne rien faire »)', b.hidden === true && b.t.textContent === '' && b.c.textContent === '', b); }
{ const b = fauxBerceau(); peindreBerceau(b, 'true');
  ok('TEMOIN : un drapeau « truthy » non booleen ("true") n allume PAS', b.hidden === true, b); }

console.log('\n3. Avertissement seize — les quatre cas');
ok('ON + actif : texte « enabled », {SYM}=NVDAc remplace deux fois', texteSaisie('NVDAc', 'enabled', true) === ACTIF('NVDAc'), texteSaisie('NVDAc', 'enabled', true));
ok('ON + inconnu : texte « unknown », {SYM}=AAPLc', texteSaisie('AAPLc', 'unknown', true) === INCONNU('AAPLc'), texteSaisie('AAPLc', 'unknown', true));
ok('ON + inactif : RIEN (null)', texteSaisie('NVDAc', 'disabled', true) === null);
ok('OFF + actif : RIEN', texteSaisie('NVDAc', 'enabled', false) === null);
ok('OFF + inconnu : RIEN', texteSaisie('NVDAc', 'unknown', false) === null);
ok('drapeau par defaut (OFF) + actif : RIEN', texteSaisie('NVDAc', 'enabled') === null);
ok('aucun {SYM} residuel', !/\{SYM\}/.test(texteSaisie('X', 'enabled', true) + texteSaisie('X', 'unknown', true)));
ok('TEMOIN : meme chemin, seul l etat change => enabled non-null, disabled null',
  texteSaisie('TSLAc', 'enabled', true) !== null && texteSaisie('TSLAc', 'disabled', true) === null);
ok('symbole vide => rien (pas de « issuer of  »)', texteSaisie('', 'enabled', true) === null);

console.log('\n4. Etat seize par devise');
ok('NVDAc (recensement : policy 0) => disabled', etatSaisie(NVDA) === 'disabled', etatSaisie(NVDA));
ok('adresse en casse mixte acceptee', etatSaisie('0xb20000000000000000000078EE7CE2FE4908108C') === 'disabled');
ok('devise absente du recensement => unknown (et l inconnu S AFFICHE)', etatSaisie(INCONNUE) === 'unknown' && texteSaisie('ZZZ', etatSaisie(INCONNUE), true) === INCONNU('ZZZ'));
ok('ETH / USDC / cbBTC / TOSHI => null (pas de seize possible)', [
  '0x0000000000000000000000000000000000000000', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', '0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4'].every((a) => etatSaisie(a) === null));
ok('adresse invalide => null', etatSaisie('nope') === null && etatSaisie(null) === null);
ok('table injectee « enabled » => enabled', etatSaisie(NVDA, { [NVDA]: 'enabled' }) === 'enabled');

console.log('\n5. Peinture (element factice)');
{ const e = faux(); const t = peindreSaisie(e, NVDA, 'NVDAc', true);
  ok('ON + NVDAc (inactif au recensement) => cache, vide', t === null && e.hidden === true && e.textContent === '', e); }
{ const e = faux(); peindreSaisie(e, INCONNUE, 'ZZZ', true);
  ok('ON + devise inconnue => visible, texte « unknown »', e.hidden === false && e.textContent === INCONNU('ZZZ'), e); }
{ const e = faux(); peindreSaisie(e, INCONNUE, 'ZZZ');
  ok('OFF (defaut) + devise inconnue => cache, vide', e.hidden === true && e.textContent === '', e); }
{ const e = faux(); peindreSaisie(e, INCONNUE, 'ZZZ', true); peindreSaisie(e, null, null, true);
  ok('TEMOIN : changement de paire vers « aucune » => l avertissement precedent s efface', e.hidden === true && e.textContent === '', e); }

console.log('\n6. Table de l app == recensement lu sur la chaine');
const tsv = readFileSync(new URL('./contracts/launch-lock/seize-census-52070900.tsv', import.meta.url), 'utf8');
const lignes = tsv.split(/\r?\n/).filter((l) => l && !l.startsWith('#') && !l.startsWith('symbole'));
const lue = Object.fromEntries(lignes.map((l) => l.split('\t')).map(([, a, , e]) => [a.toLowerCase(), e]));
ok('recensement : 17 devises lues', lignes.length === 17, lignes.length);
ok('recensement : bloc 52070900 dans l en-tete, et le module dit le meme', /# bloc 52070900 /.test(tsv) && BLOC_RECENSEMENT_SAISIE === 52070900);
ok('recensement : temoin FOO_BAR_POLICY a bien reverte (la cle seize est connue du noeud)', /FOO_BAR_POLICY -> ERR:revert/.test(tsv));
ok('table du module == recensement (memes adresses, memes etats)', JSON.stringify(Object.entries(lue).sort()) === JSON.stringify(Object.entries(SAISIE_PAR_DEVISE).sort()), { lue, module: SAISIE_PAR_DEVISE });
{ const lf = tsv.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  ok('TEMOIN CRLF : le recensement relu en CRLF donne les memes 17 lignes', lf.split(/\r?\n/).filter((l) => l && !l.startsWith('#') && !l.startsWith('symbole')).length === 17); }

console.log('\n7. app.html : emplacements, import, service');
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const balise = (src, id) => { const m = src.match(new RegExp('<([a-z]+)[^>]*\\bid="' + id + '"[^>]*>([\\s\\S]*?)</\\1>')); return m ? { tag: m[0].slice(0, m[0].indexOf('>') + 1), contenu: m[2] } : null; };
for (const id of ['cBerceau', 'cSaisie', 'pSaisie']) {
  const b = balise(html, id);
  ok(`#${id} present, avec l attribut hidden`, !!b && /\shidden(\s|>|=)/.test(b.tag), b && b.tag);
}
ok('#cBerceau statique ne porte AUCUN texte (lore absente avec drapeau OFF)', (() => { const b = balise(html, 'cBerceau'); return !!b && b.contenu.replace(/<[^>]+>/g, '').trim() === ''; })());
ok('#cSaisie et #pSaisie statiques sont vides', ['cSaisie', 'pSaisie'].every((id) => { const b = balise(html, id); return b && b.contenu.trim() === ''; }));
ok('la lore n est PAS ecrite en dur dans app.html (elle ne vient que du module)', !html.includes('the cradle opens') && !html.includes('First 24 hours'));
ok('les textes seize ne sont PAS ecrits en dur dans app.html', !html.includes('can take back') && !html.includes("couldn't check whether"));
ok('app.html importe peindreSaisie et peindreBerceau de ./berceau-24h.js', /import\s*\{[^}]*peindreSaisie[^}]*peindreBerceau[^}]*\}\s*from\s*'\.\/berceau-24h\.js'/.test(html));
ok('majPaire peint #cSaisie a partir de la paire qualifiee (via peindreSaisie importe)', /const saisieC = typeof peindreSaisie === 'function' \? peindreSaisie/.test(html) && /saisieC\(\$\('#cSaisie'\),\s*q\.paire\.adr,\s*q\.paire\.symbole\)/.test(html));
ok('le profil peint #pSaisie depuis la cle de pool', /peindreSaisie\(\$\('#pSaisie'\),[^;]*v\.cle\.currency1[^;]*deviseProfil\)/.test(html));
ok('#cBerceau peint au chargement', /peindreBerceau\(\$\('#cBerceau'\)\)/.test(html));
ok('serveur-web.js sert berceau-24h.js', /'berceau-24h\.js'/.test(readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8')));
{ const crlf = html.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  ok('TEMOIN CRLF : l extracteur trouve les memes emplacements sur un app.html en CRLF', ['cBerceau', 'cSaisie', 'pSaisie'].every((id) => { const b = balise(crlf, id); return b && /\shidden/.test(b.tag); })); }
ok('TEMOIN : l extracteur rend null sur un HTML sans l element', balise('<p id="autre" hidden></p>', 'cSaisie') === null);

console.log('\n8. Trois lignes a 375 px');
const css = (html.match(/\.avertSaisie\{[^}]*\}/) || [''])[0];
ok('CSS mesuree en place : font-size 11.5px, marges -10px, max-width none', /font-size:11\.5px/.test(css) && /margin:8px -10px 0/.test(css) && /max-width:none/.test(css), css);
/* Budget : le plus long texte MESURE a 3 lignes par mesure-berceau-375.mjs (GOOGLc / unknown). */
const BUDGET = texteSaisie('GOOGLc', 'unknown', true).length;
const SYMS = ['AAPLc', 'AMZNc', 'AVGOc', 'BEc', 'GOOGLc', 'HIMSc', 'METAc', 'MSFTc', 'MSTRc', 'MUc', 'NVDAc', 'PLTRc', 'SNDKc', 'SPCXc', 'TSLAc', 'OUSD', 'TBLOCK'];
const trop = SYMS.flatMap((s) => ['enabled', 'unknown'].map((e) => [s, e, texteSaisie(s, e, true).length])).filter(([, , l]) => l > BUDGET);
ok(`aucun texte du registre ne depasse ${BUDGET} caracteres (le plus long mesure a 3 lignes)`, trop.length === 0, trop);
ok('TEMOIN : un texte double depasse le budget', (texteSaisie('NVDAc', 'unknown', true) + ' ' + texteSaisie('NVDAc', 'unknown', true)).length > BUDGET);

console.log(`\n${n} assertions, ${ko} KO`);
process.exit(ko ? 1 : 0);
