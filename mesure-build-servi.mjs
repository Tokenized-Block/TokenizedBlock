/* mesure-build-servi.mjs — LE BUILD ATTENDU EST-IL VRAIMENT CELUI QUI EST SERVI ?
 *
 * ⛔⛔ DEUX LECONS PAYEES CHER SONT DANS CE FICHIER.
 *     1. `deploy-page-two-phases` : un `railway up` qui rend une URL de logs n est PAS un
 *        deploiement en ligne. Declarer vert a ce moment-la, c est declarer vert AVANT le controle.
 *     2. `browser-verification-can-read-cache` : une verification qui lit une page en cache
 *        confirme l ancien deploiement avec enthousiasme. On casse le cache par un parametre
 *        unique ET par un en-tete `cache-control: no-cache`.
 *
 * ⛔ ON VERIFIE DEUX CHOSES INDEPENDANTES, pas une : l empreinte du build DANS la page, et le
 *    comportement d une ROUTE. Une page a jour avec un serveur mort est un cas reel — il s est
 *    produit ici (`guards-measured-transport-not-execution`).
 */
const BASE = process.argv[2] || 'https://tokenizedblock.space';
const ATTENDU = process.argv[3];
if (!ATTENDU) {
  console.log('usage : node mesure-build-servi.mjs <base-url> <empreinte-de-build>');
  console.log('⛔ sans empreinte attendue, cette sonde ne peut rien affirmer — elle ne devine pas.');
  process.exitCode = 2;
} else {
  const ESSAIS = 20, ATTENTE_MS = 15_000;
  let servi = null, vu = 0;
  for (let i = 1; i <= ESSAIS; i++) {
    /* ⛔ parametre unique a chaque essai : sans lui, un cache intermediaire rendrait vingt fois la
     *   MEME vieille page et on conclurait « le deploiement a echoue » sur une lecture ratee. */
    const url = BASE + '/?sonde=' + i + '-' + process.pid;
    try {
      const r = await fetch(url, { headers: { 'cache-control': 'no-cache', pragma: 'no-cache' } });
      const t = await r.text();
      const m = /data-build="([^"]+)"/.exec(t);
      servi = m ? m[1] : null;
      vu++;
      if (servi === ATTENDU) {
        console.log('✅ build servi = ' + servi + '  (essai ' + i + ', HTTP ' + r.status + ')');
        break;
      }
      console.log('… essai ' + i + '/' + ESSAIS + ' : servi=' + (servi || 'illisible')
        + ' attendu=' + ATTENDU);
    } catch (e) {
      /* ⛔ une panne de lecture n est PAS « l ancien build » : on le distingue, sinon on irait
       *   chercher un probleme de deploiement la ou il n y a qu un reseau coupe. */
      console.log('⚠️ essai ' + i + '/' + ESSAIS + ' : LECTURE ECHOUEE (' + String(e.message).slice(0, 50) + ')');
    }
    if (i < ESSAIS) await new Promise((k) => setTimeout(k, ATTENTE_MS));
  }

  if (!vu) {
    console.log('\n⛔ AUCUNE lecture n a abouti. On ne conclut RIEN — ni succes, ni echec du deploiement.');
    process.exitCode = 1;
  } else if (servi !== ATTENDU) {
    console.log('\n⛔ apres ' + ESSAIS + ' essais, le build servi est ' + (servi || 'illisible')
      + ' et pas ' + ATTENDU + '. Le deploiement n est PAS en ligne.');
    process.exitCode = 1;
  } else {
    /* ⛔ LE SERVEUR REPOND-IL, ou seule la page statique est-elle a jour ? Deux choses differentes. */
    console.log('\n── la route fiat, en production ──');
    try {
      const a = '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4';
      const r = await fetch(BASE + '/api/onramp/session?adresse=' + a + '&montant=20');
      const t = await r.text();
      console.log('   HTTP ' + r.status + '  ' + t.slice(0, 160));
      if (/pay\.coinbase\.com/.test(t)) {
        console.log('   ⛔⛔ une URL Coinbase a ete rendue : elle ne devrait exister qu avec une cle CDP.');
        process.exitCode = 1;
      } else if (r.status === 404) {
        console.log('   ⛔ 404 : la page est a jour mais la ROUTE n existe pas — build partiel.');
        process.exitCode = 1;
      } else if (/CDP_API_KEY_ID/.test(t)) {
        console.log('   ✅ la route vit et REFUSE proprement en nommant la variable manquante.');
        console.log('   ⚠️ C est l etat attendu aujourd hui : sans cle, pas de rail. 0 $ encaisse.');
      } else {
        console.log('   ⚠️ reponse inattendue — lue telle quelle ci-dessus, aucune conclusion tiree.');
      }
    } catch (e) {
      console.log('   ⚠️ route non lue (' + String(e.message).slice(0, 60) + ') — rien conclu.');
    }
  }
}
