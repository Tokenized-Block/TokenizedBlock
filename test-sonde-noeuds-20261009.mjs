/* test-sonde-noeuds-20261009.mjs — LA PANNE D UN NOEUD PUBLIC NE DOIT PLUS SE DECOUVRIR SUR UNE CAPTURE D ECRAN.
 *
 * Le motif (Phil, 2026-10-09 : « t as souvent des problemes repetitifs avec ca, fais que ce soit fixe a jamais ») : le role de
 * chaque noeud public etait ecrit en dur d apres une mesure ; quand mainnet.base.org s est mis a refuser tout eth_getLogs
 * (~2026-10-07), la Map, le Live et l index nos-blocks sont tombes en silence pendant ~2 jours.
 * A. TOUTES les lectures d historique du serveur (rpcServeur) passent par le repli publicnode (repli-logs.js), pas une seule.
 * B. La sonde des noeuds : 4 capacites (appel, logs, multi, archive) x chaque noeud, trois etats, publiee dans /sante.noeuds,
 *    et gardee par TB_SONDES. Une capacite non lue (tete inconnue) reste ABSENTE, jamais « ok ».
 * C. Le compteur logsServis (0 = historique aveugle) est publie.
 * ⛔ BORNE : lecture du source (le serveur ne demarre pas ici). Le comportement du repli est execute dans test-repli-logs-map.mjs. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const src = fs.readFileSync(path.join(ICI, 'serveur-web.js'), 'utf8').replace(/\r\n/g, '\n');
const nu = src.replace(/\/\*[\s\S]*?\*\//g, ' ');

console.log('— A. le repli pour tout le serveur');
ok(/async function rpcServeur\(methode, params\) \{\s+if \(!repliServeur\) repliServeur = avecRepliLogs\(rpcServeurBrut, REPLIS_LOGS_SERVEUR\.map\(\(u\) => lecteurUrl\(u\)\)\);\s+return repliServeur\(methode, params\);\s+\}/.test(nu),
  'A rpcServeur = le lecteur brut + les replis getLogs (toutes les lectures d historique du serveur)');
ok(/const REPLIS_LOGS_SERVEUR = ESSAI_SRV\.actif \? \[\] : \['https:\/\/base-rpc\.publicnode\.com'\];/.test(nu),
  'A publicnode seul en repli : drpc gratuit ne sert que 10 blocs par getLogs (mesure), nos fenetres en font 999');
ok(/async function rpcServeurBrut\(methode, params\) \{/.test(nu) && (nu.match(/\brpcServeurBrut\b/g) || []).length === 2, 'A le lecteur brut n est appele que par le repli (aucun contournement)');

console.log('— B. la sonde');
ok(/const NOEUDS_SONDES = \[\.\.\.new Set\(\[\.\.\.RPC_LIST, 'https:\/\/base-rpc\.publicnode\.com', 'https:\/\/base\.drpc\.org', 'https:\/\/1rpc\.io\/base'\]\)\];/.test(nu), 'B les noeuds sondes = ceux du serveur + les publics connus');
ok(/n\.logs = await essai\(url, 'eth_getLogs'/.test(nu) && /n\.multi = await essai\(url, 'eth_getLogs', \[\{ address: multi,/.test(nu) && /n\.archive = await essai\(url, 'eth_getLogs', \[\{ address: PM_V4, topics: \[TOPIC_INITIALIZE\], fromBlock: p, toBlock: p999 \}\]\);/.test(nu)
  && /p999 = '0x' \+ \(tete - 20000 \+ 998\)\.toString\(16\)/.test(nu),
  'B quatre capacites mesurees par noeud : appel, logs, multi-adresses (10), archive (une FENETRE de 999 blocs a -20 000, comme nos balayages)');
ok(/if \(Number\.isSafeInteger\(tete\)\) \{\s+const b = /.test(nu), 'B tete de chaine non lue : les capacites getLogs ne sont PAS ecrites (jamais un « ok » invente)');
ok(/if \(j && j\.result !== undefined && j\.result !== null && !j\.error\) return 'ok';/.test(nu) && /return j && j\.error \? 'refus: '/.test(nu) && /catch \(e\) \{ return 'muet: '/.test(nu),
  'B trois etats : ok (une reponse), refus (une erreur nommee), muet (rien)');
ok(/if \(process\.env\.TB_SONDES !== '0' && !ESSAI_SRV\.actif\) setTimeout\(\(\) => \{ void sonderNoeuds\(\)/.test(nu), 'B la sonde se coupe avec TB_SONDES=0 et en MODE ESSAI (un fork local ne joint aucun noeud public)');
console.log('— C. /sante');
ok(/noeuds: etatNoeuds,/.test(nu) && /logsServis: Number\.isSafeInteger\(tete\) \? compte\('logs'\) : null/.test(nu), 'C /sante.noeuds publie les etats et logsServis (null = non mesure, jamais 0 par defaut)');
console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions)');
process.exit(ko ? 1 : 0);
