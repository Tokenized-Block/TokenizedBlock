/* test-missions-route-20261017.mjs - LA ROUTE D ATTESTATION NE LIT RIEN SANS CONTRAT, NE PREND SA CLE QUE DE L ENVIRONNEMENT, NE LA LOGUE JAMAIS.
 * AFFIRME (lecture du source servi) : (1) /api/missions et /api/missions/attestation rendent PAS_OUVERT AVANT tout appel rpc quand
 *   MISSIONS_DEPLOIEMENT.adresse est nulle ; (2) le contrat vient du fichier genere, jamais de process.env ; (3) la cle vient de
 *   process.env.MISSIONS_VERIFIER_KEY et de nulle part ailleurs ; (4) aucune ligne console.* dans les deux routes ; (5) l etat historique
 *   ne va a l archive qu en repli d un eth_call non-latest. EXECUTE a part (serveur local 9095, 2026-10-17) : les deux routes -> PAS_OUVERT.
 * NE PROUVE PAS le chemin avec une adresse deployee (aucun contrat sur Base) : attester() est prouve sur fausse chaine (test-missions-attestation). */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const debut = src.indexOf("if (chemin === '/api/missions' && req.method === 'GET')");
const fin = src.indexOf("if (chemin === '/sante')", debut);
vu(debut > 0 && fin > debut, 'les routes missions sont trouvees, avant /sante');
const bloc = src.slice(debut, fin);
for (const route of ["'/api/missions' && req.method === 'GET'", "'/api/missions/attestation' && req.method === 'POST'"]) {
  const r = bloc.slice(bloc.indexOf(route));
  const garde = r.indexOf('if (!MISSIONS_DEPLOIEMENT.adresse)'), rpc = r.search(/lireMissions\(|attester\(/);
  vu(garde > 0 && rpc > garde, route + ' : PAS_OUVERT avant toute lecture');
}
vu(!/process\.env\.[A-Z_]*(CONTRAT|MISSIONS_ADRESSE|ADDRESS)/.test(bloc) && /contrat: MISSIONS_DEPLOIEMENT\.adresse/.test(bloc), 'le contrat vient du fichier genere');
const cles = src.match(/MISSIONS_VERIFIER_KEY/g) || [];
vu(cles.length === 2 && /cle: process\.env\.MISSIONS_VERIFIER_KEY \|\| null/.test(bloc), 'la cle : une seule lecture, dans la route (+ le commentaire)');
vu(!/console\./.test(bloc), 'aucun console.* dans les routes missions');
const etat = src.slice(src.indexOf('async function rpcMissionsEtat'), src.indexOf('async function rpcMissionsEtat') + 500);
vu(/params\[1\] !== 'latest'/.test(etat) && /try \{ return await rpcServeur/.test(etat) && /if \(!historique \|\| !RPC_ARCHIVE\) throw e/.test(etat), 'archive seulement en repli d un eth_call historique');
vu(/import \{ attester(, mesurerFenetre)? \} from '\.\/missions-attestation\.js'/.test(src) && /import \{ MISSIONS_DEPLOIEMENT \} from '\.\/missions-deploiement\.js'/.test(src), 'imports presents');
/* Phil 2026-10-17 soir : le ticket du jour est exige AVANT attester() (pas de ticket -> REFUSE, aucune lecture) */
const att = src.slice(src.indexOf("if (chemin === '/api/missions/attestation'"), src.indexOf("if (chemin === '/api/missions/sonde-detention'"));
const iTicket = att.indexOf('ticketsJour(revenu.jours'), iAtt = att.indexOf('attester({');
vu(iTicket > 0 && iAtt > iTicket && /\.includes\(completer\)\)/.test(att) && /etat: 'REFUSE', pourquoi: 'missions are for today/.test(att), 'attestation : ticket du jour exige avant attester()');
/* chasse 2026-10-17 soir (MED) : la sonde de detention a un PLAFOND DU JOUR, avant tout appel (sinon 288 x ~44 lectures d archive / jour) */
const sonde = src.slice(src.indexOf("if (chemin === '/api/missions/sonde-detention'"), src.indexOf("if (chemin === '/sante')"));
const iPlafond = sonde.indexOf('if (sondeDetentionJour.n >= SONDE_DETENTION_MAX_JOUR)'), iMesure = sonde.indexOf('mesurerFenetre(');
vu(iPlafond > 0 && iMesure > iPlafond && /sondeDetentionJour\.n \+= 1;/.test(sonde), 'sonde : plafond du jour verifie AVANT la mesure, et compte');
console.log('ok missions-route - ' + n + ' assertions ; NE PROUVE PAS le chemin avec contrat deploye');
