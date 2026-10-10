/* test-panneau-place-20261010.mjs — LE PANNEAU DE COMMANDE NE COUVRE JAMAIS DU CONTENU SANS LUI LAISSER SA PLACE.
 *
 * Capture de Phil (2026-10-10) : le panneau REPLIE, en bas a droite, pose sur la colonne des prix des Biggest blocks.
 * MESURE AVANT (sonde dans le navigateur, prod 20261010-progres-index, chaque vue, tout le defilement ; un element compte des que
 *   le panneau le recouvre) : replie 1600x900 Blocks 2 jamais visibles + 17 selon le defilement, Market 1 + 15 (des boutons Buy) ;
 *   replie 1280x800 « Connect wallet » jamais visible ; ouvert 1024x768 (rien ne poussait sous 1100 px) Blocks 76 / Market 86
 *   jamais visibles ; telephone 375x812 ouvert : 96 px reserves pour ~560 px de feuille + onglets, la fin de chaque page ne
 *   remontait jamais au-dessus (calcul) ; replie une barre de 160 px. ⚠️ « 41 / 62 » publie d abord : sonde a pas de 406 px pour
 *   une bande visible de 253 px, chiffres gonfles — retires.
 * MESURE EN PROD APRES DEPLOIEMENT (20261010-panneau-place, vrai contenu : Blocks 137 elements, Market 288) : 1600, 1280, 1024 px,
 *   8 vues, ouvert ET replie : 0 element cache (ni jamais, ni selon le defilement), 0 debordement ; 375x812 : 0 jamais visible
 *   (sonde a pas de 80 px), replie = 84 px.
 * MESURE APRES (serveur local, meme sonde + une preuve GEOMETRIQUE independante du contenu, car la page locale a moins de donnees :
 *   bord droit des cartes de la vue <= bord gauche du panneau) : 1600, 1280, 1024, 900, 800, 761 px, Blocks/Market/Create/Feed/
 *   Wallet, ouvert ET replie : chevauchement 0 px, aucun debordement horizontal ; 375x812 : defile au maximum, la fin du contenu
 *   passe au-dessus de la feuille (ouverte) et de la rangee (repliee, 86 px au lieu de 160) dans les 5 vues.
 * ⛔ BORNE DE CE BANC : il lit le TEXTE d app.html. Il garde la regle (et l ORDRE de la cascade, que la presence d un nom ne
 *   garantit pas) ; le comportement, lui, se mesure dans un navigateur — la sonde est rejouee en prod apres chaque deploiement.
 * ⛔ PORTABLE LF/CRLF : motifs sur une ligne. */
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./app.html', import.meta.url), 'utf8');

function verifier(html) {
  const ko = [];
  const ok = (c, m) => { if (!c) ko.push(m); };
  const at = (s) => html.indexOf(s);
  /* 1. l ancienne exception « replie, il ne pousse rien » a disparu */
  ok(!html.includes('body.bcOuvert:has(dialog.bcPop.bcReduit){padding-right:0}'), 'P1 l exception « replie = ne pousse rien » est revenue');
  /* 2. >= 761 px : la page est poussee de la largeur MESUREE du panneau, ouvert ou replie */
  ok(/@media \(min-width:761px\)\{\s*body\.bcOuvert\{padding-right:calc\(var\(--bcPopW,430px\) \+ 24px\);box-sizing:border-box\}/.test(html), 'P2 >= 761 px : la page n est plus poussee de la largeur mesuree');
  /* 3. le rail replie, et APRES la regle de base du replie (sinon la cascade la rend sans effet) */
  const base = at('dialog.bcPop.bcReduit{top:auto;bottom:calc(var(--bcNav,66px) + 8px);height:auto}');
  const rail = at('dialog.bcPop.bcReduit{top:12px;bottom:calc(var(--bcNav,66px) + 12px);height:auto;width:58px}');
  ok(base > 0, 'P3a la regle de base du replie (telephone) a disparu');
  ok(rail > 0, 'P3b le rail replie (>= 761 px) a disparu');
  ok(rail > base, 'P3c le rail est AVANT la regle de base du replie : la cascade l annule (meme specificite, la derniere gagne)');
  const carteRail = at('dialog.bcPop.bcReduit>.carte{height:100%;padding:10px 6px;overflow:hidden}');
  const carteBase = at('dialog.bcPop.bcReduit>.carte{height:auto;overflow:hidden}');
  ok(carteRail > carteBase && carteBase > 0, 'P3d la carte du rail est avant celle du replie de base');
  /* 4. telephone : la page reserve la hauteur MESUREE de la feuille / de la rangee */
  ok(/@media \(max-width:760px\)\{\s*body\.bcOuvert\{padding-bottom:calc\(var\(--bcPopH,62dvh\) \+ var\(--bcNav,66px\) \+ 24px\)\}/.test(html), 'P4 telephone : rien n est reserve sous le panneau');
  ok(html.includes('body.bcOuvert.bcReplie .mapZoom{transform:translateY(calc(-1 * var(--bcPopH,60px) - 14px))}'), 'P4b telephone replie : le zoom de la Map n suit plus la rangee');
  /* 5. replie = une seule rangee : la recherche et « Agent link » se cachent */
  ok(html.includes('dialog.bcPop.bcReduit .bcCherche,dialog.bcPop.bcReduit #bcLier,dialog.bcPop.bcReduit #bcChercheNote,dialog.bcPop.bcReduit .bcPousse{display:none}'), 'P5 replie : la recherche reste (le replie retrouve deux rangees)');
  /* 6. la taille est MESUREE : ResizeObserver, apres l ouverture, apres un repli ; la classe suit l etat */
  ok(/function bcPoserTaille\(\) \{/.test(html) && html.includes("s.setProperty('--bcPopW', d.offsetWidth + 'px'); s.setProperty('--bcPopH', d.offsetHeight + 'px');"), 'P6a la taille n est plus mesuree');
  ok(html.includes("try { new ResizeObserver(() => bcPoserTaille()).observe(document.getElementById('bcPop')); }"), 'P6b aucun observateur ne suit la taille du panneau');
  const show = at("if (d && !d.open) { try { d.show(); } catch (_) { d.setAttribute('open', ''); } }");
  ok(show > 0 && html.slice(show, show + 220).includes('bcPoserTaille(); /* 2026-10-10 : la place laissee a la page, mesuree juste apres l ouverture */'), 'P6c la taille n est pas mesuree juste apres l ouverture');
  ok(/bcPoserTaille\(\); \/\* 2026-10-10 : la place laissee suit le replie/.test(html), 'P6d le repli ne remesure pas');
  ok(html.includes("document.body.classList.toggle('bcReplie', !!d.open && d.classList.contains('bcReduit'));"), 'P6e la classe bcReplie ne suit pas l etat');
  /* 7. fermer rend TOUTE la place (les deux classes) */
  ok(html.includes("$('#bcFermer').addEventListener('click', () => { $('#bcPop').close(); try { document.body.classList.remove('bcOuvert', 'bcReplie'); } catch (_) {} });"), 'P7a ✕ laisse une classe : la page resterait poussee');
  ok(html.includes("$('#bcPop').addEventListener('close', () => { try { document.body.classList.remove('bcOuvert', 'bcReplie'); } catch (_) {} });"), 'P7b une fermeture par un autre chemin laisse une classe');
  /* 8. replie, tout l en-tete deplie d un clic ; un bouton garde son geste */
  ok(html.includes("if (!$('#bcPop').classList.contains('bcReduit') || (e.target && e.target.closest && e.target.closest('button, a, input, form, select'))) return;"), 'P8 le rail ne deplie plus au clic (ou un bouton deplie au lieu de fermer)');
  /* 9. (Phil, 2026-10-10 : « lire a la verticale quand la barre est de cote ») : lettres DROITES empilees, aucune rotation ;
   *   l agent en un mot et un point, sa phrase entiere gardee (DOM + bulle) */
  ok(html.includes('dialog.bcPop.bcReduit .titre,dialog.bcPop.bcReduit #bcAgent{order:3;writing-mode:vertical-rl;text-orientation:upright;white-space:nowrap;'), 'P9a le rail ne lit plus a la verticale (lettres droites)');
  ok(!/dialog\.bcPop\.bcReduit[^{]*\{[^}]*rotate\(180deg\)/.test(html), 'P9b le texte du rail est de nouveau tourne (lu de bas en haut)');
  ok(html.includes("dialog.bcPop.bcReduit #bcAgent.actif::after{content:'Agent \\25CF';color:var(--accent)}") && html.includes("dialog.bcPop.bcReduit #bcAgent::after{content:'Agent \\25CB';"), 'P9c l etat de l agent n a plus son point (connecte / non)');
  ok(html.includes("$('#bcAgent').classList.toggle('actif', actif); $('#bcAgent').title = $('#bcAgent').textContent;"), 'P9d la classe de l agent ne suit plus son etat');
  ok(html.includes('<span class="puce" id="bcAgent" title="Agent: not connected">Agent: not connected</span>'), 'P9e la phrase de l agent n est plus en bulle au depart');
  return ko;
}

let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (!c) { ko += 1; console.log('  KO ' + m); } else console.log('  ok ' + m); };

const base = verifier(SRC);
ok(base.length === 0, 'code livre : 0 regle manquante' + (base.length ? ' — ' + base.join(' | ') : ''));

/* MUTANTS : chacun casse UNE regle ; le banc doit rougir sur la bonne */
const railLigne = 'dialog.bcPop.bcReduit{top:12px;bottom:calc(var(--bcNav,66px) + 12px);height:auto;width:58px}';
const MUTANTS = [
  ['m1 l exception « replie ne pousse rien » revient', '@media (max-width:440px)', 'body.bcOuvert:has(dialog.bcPop.bcReduit){padding-right:0}\n@media (max-width:440px)', /^P1 /],
  ['m2 poussee codee en dur (pas la largeur mesuree)', 'body.bcOuvert{padding-right:calc(var(--bcPopW,430px) + 24px);box-sizing:border-box}', 'body.bcOuvert{padding-right:calc(480px + 24px);box-sizing:border-box}', /^P2 /],
  ['m3 le rail remonte AVANT la regle de base (cascade)', null, null, /^P3c /],
  ['m4 telephone : plus rien de reserve', 'body.bcOuvert{padding-bottom:calc(var(--bcPopH,62dvh) + var(--bcNav,66px) + 24px)}', 'body.bcOuvert{padding-bottom:96px}', /^P4 /],
  ['m5 replie : la recherche reste', 'dialog.bcPop.bcReduit .bcCherche,dialog.bcPop.bcReduit #bcLier,', 'dialog.bcPop.bcReduit #bcLier,', /^P5 /],
  ['m6 pas d observateur', "try { new ResizeObserver(() => bcPoserTaille()).observe(document.getElementById('bcPop')); }", 'try { }', /^P6b /],
  ['m7 pas de mesure apres l ouverture', 'bcPoserTaille(); /* 2026-10-10 : la place laissee a la page, mesuree juste apres l ouverture */', '/* plus de mesure */', /^P6c /],
  ['m8 ✕ laisse bcReplie', "$('#bcFermer').addEventListener('click', () => { $('#bcPop').close(); try { document.body.classList.remove('bcOuvert', 'bcReplie');", "$('#bcFermer').addEventListener('click', () => { $('#bcPop').close(); try { document.body.classList.remove('bcOuvert');", /^P7a /],
  ['m10 une autre fermeture laisse bcReplie', "$('#bcPop').addEventListener('close', () => { try { document.body.classList.remove('bcOuvert', 'bcReplie');", "$('#bcPop').addEventListener('close', () => { try { document.body.classList.remove('bcOuvert');", /^P7b /],
  ['m11 le rail tourne de nouveau son texte', 'writing-mode:vertical-rl;text-orientation:upright;white-space:nowrap;', 'writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;', /^P9a /],
  ['m12 la classe de l agent ne suit plus', "$('#bcAgent').classList.toggle('actif', actif); ", '', /^P9d /],
  ['m9 un bouton deplie au lieu de garder son geste', "e.target.closest('button, a, input, form, select')", "e.target.closest('a, input, form, select')", /^P8 /],
];
for (const [nom, de, vers, casse] of MUTANTS) {
  let mute;
  if (de === null) {
    /* m3 : le rail est deplace juste AVANT la regle de base du replie (fin de ligne \r?\n : portable LF/CRLF) */
    const reRail = new RegExp(railLigne.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\r?\\n');
    const ancre = 'dialog.bcPop.bcReduit{top:auto;bottom:calc(var(--bcNav,66px) + 8px);height:auto}';
    ok(reRail.test(SRC) && SRC.split(ancre).length === 2, 'mutant ' + nom + ' : la ligne du rail et la regle de base sont trouvees');
    mute = SRC.replace(reRail, '').replace(ancre, '@media (min-width:761px){' + railLigne + '}' + ancre);
  } else {
    /* motifs sur UNE ligne (portable LF/CRLF) */
    const fois = SRC.split(de).length - 1;
    ok(fois === 1, 'mutant ' + nom + ' : motif trouve ' + fois + ' fois (attendu 1)');
    if (fois !== 1) continue;
    mute = SRC.replace(de, vers);
  }
  const r = verifier(mute);
  ok(r.some((m) => casse.test(m)), 'mutant ' + nom + ' : ROUGE sur la bonne regle (' + (r.join(' | ').slice(0, 160) || 'rien') + ')');
}
console.log(n + ' assertions, ' + ko + ' KO');
if (n === 0) { console.log('⛔ aucune assertion executee'); process.exit(1); }
process.exit(ko ? 1 : 0);
