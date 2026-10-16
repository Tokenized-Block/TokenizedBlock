// test-mise-en-vie-suit-le-block-cree-20261016.mjs - 2026-10-16, UNIT : apres la naissance, le lien explorer (tx de UNIT) et le
// profil montraient deux blocks (profil sur TBGAS). Cause dans le code : goLaunch fait ouvrirProfil(adresseCreee).then(...) puis
// calculerLancement, qui lit `$('#profil').dataset.block`. Un autre ouvrirProfil lance entre-temps (lien ?block=, bouton TBGAS de
// la map / du fil, panneau) gagne le jeton et le profil ; la suite planifiait alors sur CE block. Garde : avant de planifier, le
// profil doit etre le block cree ; sinon on le rouvre, et s il ne l est toujours pas, on s arrete sans rien demander.
import { readFileSync } from 'node:fs';
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log('ok  ' + m); else { ko++; console.log('KO  ' + m); } };
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const i0 = html.indexOf('const goLaunch = () => {');
ok(i0 > 0, 'goLaunch trouve');
const corps = html.slice(i0, html.indexOf('const btn = $(\'#cLaunchNow\')', i0));
const iThen = corps.indexOf('{ sansNaviguer: true })');
const iCalc = corps.indexOf('void calculerLancement()');
const iGarde = corps.search(/profilEstLeBlockCree\(/);
ok(iThen > 0 && iCalc > iThen, 'ouvrirProfil(...sansNaviguer) puis calculerLancement');
ok(iGarde > iThen && iGarde < iCalc, 'la garde du block cree est entre l ouverture du profil et le plan');
ok(/function profilEstLeBlockCree\(adr\)\s*\{[\s\S]{0,300}dataset\.block[\s\S]{0,120}toLowerCase\(\)/.test(html), 'profilEstLeBlockCree compare dataset.block a l adresse, sans casse');
console.log(ko ? 'FAIL mise-en-vie-suit-le-block ' + ko + '/' + n + ' KO' : 'ALL PASS mise-en-vie-suit-le-block ' + n + ' assertions');
process.exit(ko ? 1 : 0);
