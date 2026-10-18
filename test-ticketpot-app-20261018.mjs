/* test-ticketpot-app-20261018.mjs - TICKETPOT LIVE (0xf986…1df1, bloc 52 776 705) EST BRANCHE : le serveur LIT le pot de la veille, l app
 * le MONTRE et laisse ALIMENTER le pot du jour ; rien n est signe par le serveur (Phil signe les parts lui-meme).
 * AFFIRME (lecture de serveur-web.js et app.html) : (1) la fiche notee porte une adresse et un bloc ; (2) le serveur lit lireJour sur un
 *   minuteur (60 s), jamais par requete, et sert /api/tirage.ticketpot = { contrat, bloc, veille, lu, erreur } ; sans adresse : null et
 *   aucune lecture ; (3) l app importe planFund + dayDeJourId, montre #potJour / #jourFondPot / #potFondLab seulement avec la fiche servie
 *   (le bouton seulement avec un wallet), le montant est TAPE (jamais fixe), le plan est planFund(contrat servi, USDC_BASE, jour du
 *   contrat) et part par envoyerAppels ; (4) la ligne dit que la reclamation attend la signature du verifier (rien promis).
 * NE PROUVE PAS : une lecture reelle ni un fund reel. */
import { readFileSync } from 'node:fs';
import { TICKETPOT_DEPLOIEMENT } from './ticketpot-deploiement.js';
let n = 0;
const vu = (c, m) => { if (!c) { console.error('KO ' + m); process.exit(1); } n++; };
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
/* (1) */
vu(/^0x[0-9a-f]{40}$/.test(String(TICKETPOT_DEPLOIEMENT.adresse)) && Number.isSafeInteger(TICKETPOT_DEPLOIEMENT.bloc) && TICKETPOT_DEPLOIEMENT.bloc > 52770558, 'fiche notee : adresse + bloc (' + TICKETPOT_DEPLOIEMENT.adresse + ', ' + TICKETPOT_DEPLOIEMENT.bloc + ')');
/* (2) */
vu(/import \{ TICKETPOT_DEPLOIEMENT \} from '\.\/ticketpot-deploiement\.js';/.test(srv) && /import \{ lireJour as lireJourTicketPot \} from '\.\/ticketpot-attestation\.js';/.test(srv), 'serveur : fiche + lireJour importes');
const ts = srv.slice(srv.indexOf('const ticketpotSrv = {'), srv.indexOf('/* ══ LES DUELS LUS SUR LA CHAINE'));
vu(ts.length > 100 && /if \(!contrat \|\| ticketpotSrv\.enVol\) return;/.test(ts) && /await lireJourTicketPot\(\{ rpc: rpcServeur, contrat \}, day\)/.test(ts), 'lecture : sans adresse rien ; lireJour(rpcServeur, contrat, jour de la veille)');
vu(/if \(TICKETPOT_DEPLOIEMENT\.adresse\) \{ setTimeout\(\(\) => \{ void lireTicketPotSrv\(\); setInterval\(\(\) => \{ void lireTicketPotSrv\(\); \}, 60000\)/.test(ts), 'minuteur 60 s, seulement avec la fiche');
vu(/if \(!contrat\) return null;/.test(ts) && /veille: ticketpotSrv\.etat \? \{ jourId: ticketpotSrv\.jourId, day: ticketpotSrv\.day, \.\.\.ticketpotSrv\.etat \} : null/.test(ts), 'ticketpotJson : null sans fiche ; veille = l etat lu (ou null)');
vu(/mode: 'SHADOW', pot: 0, seuilVolumeUsd: SEUIL_VOLUME_JOUR_USD, veille, rolls, ticketpot: ticketpotJson\(\),/.test(srv), '/api/tirage sert ticketpot');
vu(!/MISSIONS_VERIFIER_KEY/.test(ts) && !/signerDigest|attesterPart|attesterJour/.test(ts), 'le serveur ne signe RIEN pour le pot (aucune cle, aucune attestation ici)');
/* (3) */
vu(/import \{ planFund as planFundPot, dayDeJourId as dayDeJourIdPot \} from '\.\/ticketpot-plan\.js';/.test(app), 'app : planFund + dayDeJourId importes');
const carte = app.slice(app.indexOf('id="tirCarte"'), app.indexOf('id="missionsCarte"'));
vu(/<p class="note" id="potJour"[^>]*\bhidden\b/.test(carte) && /<label class="champ" id="potFondLab" hidden>[^<]*<input id="potMontant"/.test(carte) && /<button[^>]*\bid="jourFondPot"[^>]*\bhidden\b/.test(carte), 'ligne, montant et bouton caches dans le HTML');
vu(!/value="1"[^>]*>[^<]*USDC/.test(carte.replace(/<!--[\s\S]*?-->/g, '')) , 'aucun montant fixe dans la carte');
const pp = app.slice(app.indexOf('function peindrePotJour('), app.indexOf('async function fondPot()'));
vu(/\/\^0x\[0-9a-fA-F\]\{40\}\$\/\.test\(String\(t\.ticketpot\.contrat\)\)/.test(pp) && /p\.hidden = !tp; b\.hidden = !\(tp && c\);/.test(pp), 'montre seulement avec la fiche servie ; le bouton seulement avec un wallet');
vu(/Shares are signed by the verifier wallet; your claim opens here once yours is signed\./.test(pp) && /yesterday\\'s pot not read yet/.test(pp), 'la ligne dit l etat lu et que la reclamation attend la signature du verifier');
const fp = app.slice(app.indexOf('async function fondPot()'), app.indexOf("$('#jourFondPot').addEventListener"));
vu(/const montant = bjUsdc\(\(\$\('#potMontant'\) \|\| \{\}\)\.value\);/.test(fp) && /if \(montant === null \|\| montant <= 0n\)/.test(fp), 'le montant est tape et verifie');
vu(/planFundPot\(\{ contrat: potCfg\.contrat, usdc: USDC_BASE, day, montant: montant\.toString\(\) \}\)/.test(fp) && /const jourId = jourDeApp\(Date\.now\(\)\), day = dayDeJourIdPot\(jourId\);/.test(fp), 'planFund : contrat servi, USDC_BASE, le jour UTC du contrat');
vu(/if \(plan\.etat !== 'PRET'\) \{ dit\('Not funded: ' \+ plan\.pourquoi\); return; \}/.test(fp) && /await envoyerAppels\(plan\.appels, c\)/.test(fp) && /it never comes back to you/.test(fp), 'refus dit ; envoi par envoyerAppels ; « never comes back » dit avant la signature');
vu(/peindrePotJour\(t, c0\); \}/.test(app) && /\$\('#jourFondPot'\)\.addEventListener\('click', \(\) => \{ void fondPot\(\); \}\);/.test(app), 'cable : peindreTirage peint le pot ; le bouton appelle fondPot');
console.log('ok ticketpot-app - ' + n + ' assertions ; NE PROUVE PAS une lecture ni un fund reel');
