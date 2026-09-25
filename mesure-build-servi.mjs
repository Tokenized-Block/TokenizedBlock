/* mesure-build-servi.mjs — LE BUILD ATTENDU EST-IL VRAIMENT CELUI QUI EST SERVI ?
 *
 * ⛔⛔ TROIS LECONS PAYEES CHER SONT DANS CE FICHIER.
 *     1. `deploy-page-two-phases` : un `railway up` qui rend une URL de logs n est PAS un
 *        deploiement en ligne. Declarer vert a ce moment-la, c est declarer vert AVANT le controle.
 *     2. `browser-verification-can-read-cache` : une verification qui lit une page en cache
 *        confirme l ancien deploiement avec enthousiasme. On casse le cache par un parametre
 *        unique ET par un en-tete `cache-control: no-cache`.
 *     3. 2026-09-25 — CETTE SONDE A CRIE AU LOUP SUR UN SUCCES. Ecrite avant que la cle CDP
 *        existe, elle comptait « une URL Coinbase a ete rendue » comme un defaut. La cle est
 *        posee depuis le 2026-09-24 : cette URL est devenue exactement la forme du succes, et la
 *        sonde echouait donc a CHAQUE deploiement de l app. Une sonde qui hurle toujours
 *        n avertit plus jamais. Une regle qui encode l ancienne configuration ne vieillit pas :
 *        elle se retourne.
 *
 * ⛔ ON VERIFIE DEUX CHOSES INDEPENDANTES, pas une : l empreinte du build DANS la page, et le
 *    comportement d une ROUTE. Une page a jour avec un serveur mort est un cas reel — il s est
 *    produit ici (`guards-measured-transport-not-execution`).
 *
 * ⛔ LE VERDICT DE LA ROUTE EST UNE FONCTION PURE, EXPORTEE. Il a fallu trois deploiements pour
 *    voir que la version precedente se trompait de camp : un verdict qu on ne peut juger que
 *    « en production, apres un deploy » ne se relit jamais. `test-verdict-route-fiat.mjs`
 *    exerce ses quatre issues sur la MEME fonction — pas sur une copie plus faible.
 */
import { fileURLToPath } from 'node:url';

/** Quatre issues, et une seule est un succes. `corps` est le texte brut de la reponse.
 *  ⛔ Aucune n est « on ne sait pas » deguisee en vert : l issue inconnue reste inconnue. */
export function verdictRouteFiat(statut, corps) {
  const t = String(corps == null ? '' : corps);
  if (statut === 404) {
    return { etat: 'ROUTE_ABSENTE', rouge: true,
      lignes: ['⛔ 404 : la page est a jour mais la ROUTE n existe pas — build partiel.'] };
  }
  /* ⛔⛔ REGRESSION, et ce n est plus « l etat attendu » : la cle etait posee et livrait des jetons
   *   frais. Si la route reclame de nouveau la variable, le rail fiat est REDEVENU mort sans que
   *   personne ne l ait decide — variable effacee, service relie ailleurs, ou deploy vers un autre
   *   environnement. C etait le vert de septembre ; c est le rouge d aujourd hui. */
  if (/CDP_API_KEY_ID|CDP_API_KEY_SECRET/.test(t)) {
    return { etat: 'CLE_DISPARUE', rouge: true,
      lignes: ['⛔⛔ la route RECLAME la cle CDP : le rail fiat est retombe mort.'] };
  }
  if (/pay\.coinbase\.com/.test(t)) {
    /* ⛔ UNE URL N EST PAS UN RAIL. Sans `sessionToken`, Coinbase ouvre une page qui ne peut pas
     *   aboutir : l URL existerait, le paiement non. On exige le jeton, pas l hote. */
    if (/sessionToken=[A-Za-z0-9_=-]{8,}/.test(t)) {
      return { etat: 'RAIL_VIVANT', rouge: false, lignes: [
        '✅ la route vit et rend un sessionToken frais : Coinbase a accepte notre JWT.',
        '⚠️ NE PROUVE PAS qu un centime est entre. Le parcours d achat n est pas exerce,',
        '   et le montant encaisse reste 0 $ jusqu a preuve du contraire.'] };
    }
    return { etat: 'URL_SANS_JETON', rouge: true,
      lignes: ['⛔⛔ URL Coinbase SANS sessionToken : elle ouvrirait une page inutilisable.'] };
  }
  return { etat: 'INATTENDU', rouge: false,
    lignes: ['⚠️ reponse inattendue — lue telle quelle ci-dessus, aucune conclusion tiree.'] };
}

/* ⛔ le corps de sonde ne tourne QUE si ce fichier est lance directement : sinon l importer depuis
 *   un test declencherait vingt requetes reseau et un exitCode parasite. */
const lanceDirectement = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (lanceDirectement) {
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
        const v = verdictRouteFiat(r.status, t);
        for (const l of v.lignes) console.log('   ' + l);
        if (v.rouge) process.exitCode = 1;
      } catch (e) {
        console.log('   ⚠️ route non lue (' + String(e.message).slice(0, 60) + ') — rien conclu.');
      }
    }
  }
}
