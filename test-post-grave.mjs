/* test-post-grave.mjs — ON MONTRE LE POST, ET ON DIT EXACTEMENT CE QU ON EN SAIT.
 *
 * ⛔⛔ CE QUE CE MODULE FAIT BASCULER. L app affichait un LIEN et se tenait a « We have not opened
 *     it » — c etait vrai. Afficher le CONTENU rend cette phrase fausse. La reserve doit donc
 *     changer EN MEME TEMPS que l affichage : garder un texte rassurant qui ne decrit plus ce
 *     qu on fait serait pire que l ancien silence.
 *
 * ⛔ CE QUE CE TEST PROUVE : l extraction du texte (pure, donc entierement exercable), les trois
 *   etats de la lecture, et qu aucun HTML de X ne peut entrer dans la page.
 * ⛔ CE QU IL NE PROUVE PAS : que X repondra demain comme aujourd hui. Un appel reel est fait
 *   separement, une fois, et son resultat est dit — pas suppose.
 */
import { strict as assert } from 'node:assert';
import { texteDuPost, lirePostPublie, LIEN_X, HOTE_OEMBED } from './post-grave.js';

let n = 0;
const v = (nom, fn) => { fn(); n++; };
const va = async (nom, fn) => { await fn(); n++; };

const LIEN = 'https://x.com/Clansy314495853/status/2102752171326640353';
/* la forme REELLE d une reponse oEmbed, relevee sur l appel du 2026-09-25 */
const HTML_REEL = '<blockquote class="twitter-tweet" data-dnt="true"><p lang="en" dir="ltr">'
  + 'Just Begin Base szn damn 🟦 <a href="https://t.co/tj3OzFpyCv">https://t.co/tj3OzFpyCv</a>'
  + '</p>&mdash; Clansy.base.eth (@Clansy314495853) <a href="https://twitter.com/x/status/2102752171326640353">September 24, 2026</a></blockquote>';

/* ───────── l extraction du texte ───────── */

v('le texte du post est extrait, sans une seule balise', () => {
  const t = texteDuPost(HTML_REEL);
  assert.match(t, /^Just Begin Base szn damn/);
  assert.doesNotMatch(t, /</, 'une balise a survecu : elle finirait dans la page');
  assert.doesNotMatch(t, /twitter-tweet|blockquote/, 'du balisage de X a survecu');
});

v('⛔ on s arrete au PREMIER paragraphe', () => {
  /* ⛔ Le blockquote contient aussi la ligne d auteur et la date. Les melanger au message
   *   changerait ce que le post a l air de dire — on attribuerait a quelqu un des mots qui ne
   *   sont pas les siens. */
  const t = texteDuPost(HTML_REEL);
  assert.doesNotMatch(t, /September 24/, 'la ligne de date est entree dans le texte du post');
  assert.doesNotMatch(t, /Clansy\.base\.eth/, 'la ligne d auteur est entree dans le texte du post');
});

v('les retours a la ligne sont preserves, les entites decodees', () => {
  /* ⛔ 128302 = 0x1F52E. J avais ecrit U+1F702 dans l attendu : c est MON attendu qui etait faux,
   *   pas le code — et le test l a dit. On corrige l attendu, jamais le code pour faire passer. */
  const t = texteDuPost('<p>un<br>deux &amp; trois &#128302;</p>');
  assert.equal(t, 'un\ndeux & trois \u{1F52E}');
});

v('une entite inconnue reste telle quelle plutot que de disparaitre', () => {
  /* ⛔ `neutral-return-swallows-failure` : avaler ce qu on ne sait pas decoder ferait perdre des
   *   caracteres du message sans que personne le voie. */
  assert.equal(texteDuPost('<p>a &zzz; b</p>'), 'a &zzz; b');
});

v('un point de code hors plage ne fait pas jeter', () => {
  /* ⛔ `String.fromCodePoint` leve au-dela de 0x10FFFF : une entite malformee ferait tomber tout
   *   le rendu du profil. */
  assert.doesNotThrow(() => texteDuPost('<p>x &#999999999; y</p>'));
});

v('un html vide, absent ou sans paragraphe rend null — jamais une chaine vide trompeuse', () => {
  for (const rien of [null, undefined, '', 123, '<blockquote>pas de p</blockquote>', '<p>   </p>']) {
    assert.equal(texteDuPost(rien), null, 'valeur inattendue pour ' + String(rien));
  }
});

/* ───────── la lecture ───────── */

v('la forme du lien est exigee AVANT tout appel', () => {
  assert.ok(LIEN_X.test(LIEN));
  for (const mauvais of ['https://x.com/a/status/abc', 'https://evil.test/x', 'https://x.com/status/1',
    'https://x.com/' + 'a'.repeat(16) + '/status/1']) {
    assert.ok(!LIEN_X.test(mauvais), 'lien accepte a tort : ' + mauvais);
  }
});

await va('⛔ un lien non canonique n est JAMAIS demande a X', async () => {
  /* ⛔⛔ TEMOIN NEGATIF : le fetch EXPLOSE s il est appele. Sans ce cas, une chaine arbitraire
   *     pourrait choisir ce qu on va chercher sur le reseau. */
  let appele = 0;
  const r = await lirePostPublie({ lien: 'https://evil.test/a',
    fetchImpl: () => { appele++; throw new Error('le reseau ne devait PAS etre touche'); } });
  assert.equal(r.etat, 'NON_MESURE');
  assert.equal(appele, 0, 'un lien non canonique a declenche un appel reseau');
});

await va('l hote appele est FIXE, le lien ne voyage qu en parametre', async () => {
  /* ⛔ `ssrf-guard-must-run-per-hop` : c est ici que la connexion se fait, donc c est ici que
   *   l hote doit etre en dur. */
  let vue = null;
  await lirePostPublie({ lien: LIEN, fetchImpl: async (u) => { vue = String(u); return { ok: true, status: 200, json: async () => ({ html: HTML_REEL }) }; } });
  assert.ok(vue.startsWith(HOTE_OEMBED + '?'), 'l hote appele n est plus celui attendu : ' + vue.slice(0, 60));
  assert.ok(vue.includes('omit_script=1'), 'on ne demande plus a X d omettre son script');
  assert.ok(vue.includes('dnt=true'), 'on ne demande plus a X de ne pas pister');
});

await va('⛔ 404 et 403 parlent du POST — pas de nous', async () => {
  for (const code of [404, 403]) {
    const r = await lirePostPublie({ lien: LIEN, fetchImpl: async () => ({ ok: false, status: code }) });
    assert.equal(r.etat, 'INTROUVABLE', 'HTTP ' + code + ' mal classe');
  }
});

await va('⛔ une panne parle de NOUS — jamais « ce post n existe pas »', async () => {
  /* ⛔⛔ Confondre les deux ferait ecrire « ce post n existe pas » a cause d une coupure reseau :
   *     une accusation gratuite sur le block de quelqu un d autre. */
  const r = await lirePostPublie({ lien: LIEN, fetchImpl: async () => { throw new Error('socket hang up'); } });
  assert.equal(r.etat, 'NON_MESURE');
  assert.notEqual(r.etat, 'INTROUVABLE');
  const r2 = await lirePostPublie({ lien: LIEN, fetchImpl: async () => ({ ok: false, status: 500 }) });
  assert.equal(r2.etat, 'NON_MESURE');
});

await va('une lecture reussie rend l auteur et le texte, jamais le HTML', async () => {
  const r = await lirePostPublie({ lien: LIEN, fetchImpl: async () => ({ ok: true, status: 200,
    json: async () => ({ html: HTML_REEL, author_name: 'Clansy.base.eth 🟦', author_url: 'https://x.com/Clansy314495853' }) }) });
  assert.equal(r.etat, 'LU');
  assert.match(r.texte, /Just Begin Base szn damn/);
  assert.equal(r.auteur, 'Clansy.base.eth 🟦');
  assert.equal(r.auteurLien, 'https://x.com/Clansy314495853');
  /* ⛔⛔ LE CAS QUI PROTEGE LA PAGE : aucun champ rendu ne doit contenir de balise. */
  assert.ok(!JSON.stringify(r).includes('<'), 'du HTML de X est rendu par la lecture');
});

await va('⛔ un lien d auteur qui ne pointe pas vers X est REFUSE', async () => {
  /* ⛔ Il devient un lien cliquable dans notre page : le laisser passer ferait de nous un tremplin
   *   vers n importe ou, sur la foi d une reponse tierce. */
  const r = await lirePostPublie({ lien: LIEN, fetchImpl: async () => ({ ok: true, status: 200,
    json: async () => ({ html: HTML_REEL, author_url: 'https://evil.test/piege' }) }) });
  assert.equal(r.etat, 'LU');
  assert.equal(r.auteurLien, null, 'un lien d auteur hors X a ete accepte');
});

await va('le texte est BORNE : un post immense ne peut pas remplir la page', async () => {
  const long = '<p>' + 'a'.repeat(5000) + '</p>';
  const r = await lirePostPublie({ lien: LIEN, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ html: long }) }) });
  assert.equal(r.etat, 'LU');
  assert.ok(r.texte.length <= 600, 'texte non borne : ' + r.texte.length + ' caracteres');
});

assert.equal(n, 14, 'compte de cas inattendu : ' + n);
console.log('ok post-grave — ' + n + ' cas : texte extrait sans balise, hote fixe, trois etats');
console.log('   distincts, lien d auteur borne a X, et aucun HTML de X ne peut entrer dans la page.');
console.log('⚠️ NE PROUVE PAS que X repondra demain comme aujourd hui : un appel reel est fait');
console.log('   separement, et son resultat est DIT, pas suppose.');
