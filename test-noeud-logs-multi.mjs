/* test-noeud-logs-multi.mjs — UN getLogs MULTI-ADRESSES PART CHEZ LE SEUL NOEUD QUI LE SERT.
 *
 * ⛔⛔ CE QUE CETTE GARDE PROTEGE, ET POURQUOI ELLE N EST PAS UNE GARDE DE CORRECTION. Mesure du
 *     2026-09-23 en production, temoin pose sur `fetch` : 14 `eth_getLogs` multi-adresses par
 *     chargement, 7 chaines sur 7 de forme identique — PUBLICNODE 403 (3057-3165 ms) puis BASEORG
 *     200 (192-300 ms). Aucune donnee n est perdue : le failover de `rpcReseau` fait son travail.
 *     Ce qui est perdu, c est ~21 s par chargement, sur le Live feed. La note qui precedait disait
 *     « noisy but rpc() already rotates » : vraie sur la correction, muette sur le prix.
 *
 * ⛔ LA CAUSE EST ARITHMETIQUE. Plafond mesure de publicnode : 5,6,7,8,9 -> 200 · 10,20,40,80 ->
 *    403. `JETONS_PAR_REQUETE` vaut 50. 50 > 9, donc CENT POUR CENT de ces balayages etaient
 *    refuses — jamais « parfois », jamais « selon l egresse ».
 *
 * ⛔ CE TEST EXECUTE LE CODE LIVRE, il ne relit pas une chaine. Il extrait le bloc de selection de
 *    `app.html` et le fait tourner. Un test qui recopierait la logique prouverait sa copie : c est
 *    exactement le motif `canonical-helper-weaker-copy`, et il laisse le vrai code diverger.
 * ⛔ CE QU IL NE PEUT PAS PROUVER : que `mainnet.base.org` sert VRAIMENT — ca, seul le reseau le
 *    dit, et c est une mesure, pas un test. Il prouve l ORDRE, pas la reponse. */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
/* ⛔ PORTABLE LF/CRLF (test-tests-portables.mjs) : comme `s.indexOf('\n…', de)`, mais le saut
 *   de ligne peut etre `\r\n` (checkout Windows). Rend la position du `\n`, comme indexOf, ou -1. */
const indexEol = (s, re, de = 0) => {
  const g = new RegExp(re.source, 'g'); g.lastIndex = de;
  const m = g.exec(s); return m ? m.index + m[0].indexOf('\n') : -1;
};

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');

/* --- extraction du bloc reel ------------------------------------------------------------- */
/* ⛔ L EXTRACTION PART DE `const to =` ET NON DU PLAFOND : c est la que `viseFactory` est calcule,
 *    et c est LUI qui portait le second defaut (le jumeau `eth_getLogs` manquant). Extraire plus
 *    bas aurait laisse la regle de la factory hors de portee du test — un test qui s arrete juste
 *    avant le code qu on vient de changer est vert sans rien garder. */
const debut = html.indexOf('const to = params && params[0]');
assert.ok(debut > 0, 'bloc de selection introuvable dans app.html');
const ancre = html.indexOf('if (servant) noeuds =', debut);
assert.ok(ancre > debut, 'reordonnancement introuvable');
const fin = indexEol(html, /\r?\n  \}/, ancre);
assert.ok(fin > ancre, 'fin du bloc introuvable');
const source = html.slice(debut, fin + 4);

/* ⛔ LA GARDE S ACCUSE D ABORD : une extraction ratee rendrait une chaine courte, la fonction
 *    construite ne ferait rien, et tous les cas passeraient sur du vide. */
assert.ok(source.length > 300, 'extraction suspecte : ' + source.length + ' caracteres');
/* ⛔ CES JETONS DISENT « L EXTRACTION A RAMENE LE BON BLOC », JAMAIS « IL EST BIEN ECRIT ».
 *    La liste contenait `filter` : sur une mutation qui remplacait le reordonnancement par
 *    `noeuds = [servant]`, ce controle tirait AVANT l assertion « aucun noeud supprime » et
 *    masquait la vraie garde. Un auto-controle qui epingle l implementation eteint le test de
 *    comportement qu il etait cense proteger. */
for (const jeton of ['ADRESSES_MAX_PUBLICNODE', 'logsMultiRpc', 'noeuds', 'viseFactory', 'FACTORY_B20']) {
  assert.ok(source.includes(jeton), 'extraction incomplete, il manque ' + jeton);
}

/* ⛔ `viseFactory` N EST PLUS UN PARAMETRE : il est CALCULE par le code livre. Le lui passer de
 *    l exterieur reviendrait a tester ma propre idee de ce qu est la factory au lieu de la sienne
 *    — et c est justement cette regle-la qui etait fausse. */
/* ⛔⛔ `tourEthCall` EST PASSE EN PARAMETRE, ET CE N EST PAS UN CONTOURNEMENT. Le compteur de
 *   rotation des `eth_call` vit en portee module dans `app.html`, donc HORS du bloc extrait : sans
 *   lui, le bloc leve `ReferenceError` des qu on lui donne un `eth_call` — ce qui est exactement ce
 *   qui est arrive la premiere fois, et c est le test qui l a dit.
 * ⛔ Le passer le rend aussi TESTABLE : on peut demander « et au tour suivant ? » au lieu de le
 *   deviner. En parametre il est LOCAL, donc le `+= 1` du code livre n a pas d effet d un cas sur
 *   l autre et le test reste rejouable a l identique. */
const choisir = new Function('RESEAUX', 'CHAINE', 'methode', 'params', 'tourEthCall',
  source + '\n; return noeuds;');

const PUB = 'https://base-rpc.publicnode.com';
const ORG = 'https://mainnet.base.org';
const DRPC = 'https://base.drpc.org';
const RESEAUX = {
  8453: { rpc: PUB, logsMultiRpc: ORG, secours: [ORG, DRPC], b20Rpc: ORG },
  84532: { rpc: 'https://sepolia.base.org', secours: ['https://base-sepolia-rpc.publicnode.com'] },
};
const adresses = (n) => Array.from({ length: n }, (_, i) => '0xb2' + String(i).padStart(38, '0'));
const logs = (adr) => [{ address: adr, fromBlock: '0x1', toBlock: '0x2' }];

let n = 0;
const v = (nom, fn) => { fn(); n++; };

/* 1. LE CAS QUI COUTE 21 s : 50 adresses. */
v('50 adresses -> base.org en tete', () => {
  const out = choisir(RESEAUX, 8453, 'eth_getLogs', logs(adresses(50)));
  assert.equal(out[0], ORG, 'base.org doit passer devant');
});

/* 2. ⛔ ET AUCUN NOEUD N EST PERDU. Une optimisation qui supprime un repli transforme un
 *    ralentissement en panne le jour ou base.org tombe. */
v('aucun noeud supprime', () => {
  const out = choisir(RESEAUX, 8453, 'eth_getLogs', logs(adresses(50)));
  assert.deepEqual([...out].sort(), [DRPC, ORG, PUB].sort(), 'un noeud a disparu');
  assert.equal(new Set(out).size, out.length, 'un noeud est en double');
});

/* 3. LE SEUIL, DES DEUX COTES — un test qui ne regarde qu un cote ne mesure pas un seuil. */
v('9 adresses : ordre INCHANGE (publicnode sert encore)', () => {
  assert.equal(choisir(RESEAUX, 8453, 'eth_getLogs', logs(adresses(9)))[0], PUB);
});
v('10 adresses : base.org en tete (premier refus mesure)', () => {
  assert.equal(choisir(RESEAUX, 8453, 'eth_getLogs', logs(adresses(10)))[0], ORG);
});

/* 4. UNE SEULE ADRESSE EN CHAINE, PAS EN TABLEAU — la forme la plus courante de tout le code. */
v('adresse unique (chaine) : inchange', () => {
  assert.equal(choisir(RESEAUX, 8453, 'eth_getLogs', [{ address: PUB, fromBlock: '0x1', toBlock: '0x2' }])[0], PUB);
});
v('tableau d UNE adresse : inchange', () => {
  assert.equal(choisir(RESEAUX, 8453, 'eth_getLogs', logs(adresses(1)))[0], PUB);
});

/* 5. UNE AUTRE METHODE NE DOIT RIEN DEPLACER, meme avec un tableau qui ressemble. */
v('eth_call avec un params[0].address : inchange', () => {
  assert.equal(choisir(RESEAUX, 8453, 'eth_call', [{ address: adresses(50) }, 'latest'])[0], PUB);
});

/* 6. LES ENTREES TORDUES NE DOIVENT PAS JETER — `nan-walks-through-every-bound`. */
v('params absent / vide / null : inchange et sans exception', () => {
  for (const p of [undefined, null, [], [null], ['latest'], [{}], [{ address: null }]]) {
    assert.equal(choisir(RESEAUX, 8453, 'eth_getLogs', p)[0], PUB, 'casse sur ' + JSON.stringify(p));
  }
});

/* 7. ⛔⛔ LA FACTORY B20 EST PINNEE SUR LES DEUX METHODES. Le pin n existait que pour `eth_call` :
 *     un `eth_getLogs` ne porte pas de `to`, donc les balayages de la factory partaient chez
 *     publicnode — 34 refus 403 par chargement, mesures en production le 2026-09-23. */
const FACTORY = '0xb20f000000000000000000000000000000000000';
v('eth_call sur la factory : pinne', () => {
  assert.deepEqual(choisir(RESEAUX, 8453, 'eth_call', [{ to: FACTORY, data: '0x' }, 'latest']), [ORG]);
});
v('eth_getLogs sur la factory : pinne AUSSI (le jumeau qui manquait)', () => {
  assert.deepEqual(choisir(RESEAUX, 8453, 'eth_getLogs', logs(FACTORY)), [ORG],
    'le balayage de la factory doit etre pinne comme son jumeau eth_call');
});
v('la factory en MAJUSCULES est reconnue', () => {
  assert.deepEqual(choisir(RESEAUX, 8453, 'eth_getLogs', logs(FACTORY.toUpperCase().replace('0X', '0x'))), [ORG]);
});
v('la factory dans un tableau d UNE entree est reconnue', () => {
  assert.deepEqual(choisir(RESEAUX, 8453, 'eth_getLogs', logs([FACTORY])), [ORG]);
});

/* 8. ⛔⛔ ET LE PIEGE DU PREFIXE RESTE FERME. Le 2026-09-14, `to.startsWith('0xb20')` avait attrape
 *     TOUS les jetons (CREATE2 0xb200…), TBLOCK compris, et les avait colles sur un noeud limite :
 *     « market unread » permanent. L egalite doit rester EXACTE. */
v('un jeton 0xb200… n est PAS la factory', () => {
  const jeton = '0xb2000000000000000000005c3130457551052401';
  assert.equal(choisir(RESEAUX, 8453, 'eth_getLogs', logs(jeton))[0], PUB,
    'un jeton ne doit jamais etre pris pour la factory');
  assert.equal(choisir(RESEAUX, 8453, 'eth_call', [{ to: jeton, data: '0x' }, 'latest']).length, 3,
    'un eth_call sur un jeton doit garder ses trois noeuds');
});
v('la factory NOYEE dans un lot multi-adresses n est pas pinnee', () => {
  /* ⛔ un lot qui contient la factory PARMI d autres n est pas « un balayage de la factory » :
   *   le pinner priverait les 49 autres adresses de leur repli. */
  const lot = [FACTORY, ...adresses(49)];
  assert.equal(choisir(RESEAUX, 8453, 'eth_getLogs', logs(lot)).length, 3);
});

/* 8. ⛔ UNE CHAINE SANS MESURE NE SE FAIT PAS REORDONNER. Sepolia n a pas de `logsMultiRpc` :
 *    deviner un noeud la-bas serait inventer une mesure qu on n a pas faite. */
v('Sepolia (pas de logsMultiRpc) : inchange', () => {
  const out = choisir(RESEAUX, 84532, 'eth_getLogs', logs(adresses(50)));
  assert.equal(out[0], 'https://sepolia.base.org');
  assert.equal(out.length, 2);
});

/* 9. LA CONFIGURATION LIVREE DOIT VRAIMENT PORTER LA CLE — sinon les cas ci-dessus passent sur un
 *    RESEAUX de test pendant que la production n a rien. */
v('app.html declare logsMultiRpc sur mainnet', () => {
  assert.ok(/logsMultiRpc:\s*'https:\/\/mainnet\.base\.org'/.test(html), 'logsMultiRpc absent de app.html');
});
v('le plafond livre est bien 9', () => {
  assert.ok(/ADRESSES_MAX_PUBLICNODE\s*=\s*9\b/.test(html), 'plafond livre different de la mesure');
});

/* 10. ⛔ ET LE DEMANDEUR RESTE AU-DESSUS DU PLAFOND. Si un jour `JETONS_PAR_REQUETE` descend a 9,
 *     ce reordonnancement devient inutile — et ce test doit le DIRE, pas rester vert en silence. */
v('JETONS_PAR_REQUETE est bien au-dessus du plafond', () => {
  const fl = readFileSync(new URL('./fil-live.js', import.meta.url), 'utf8');
  const m = fl.match(/JETONS_PAR_REQUETE\s*=\s*(\d+)/);
  assert.ok(m, 'JETONS_PAR_REQUETE introuvable');
  assert.ok(Number(m[1]) > 9, 'JETONS_PAR_REQUETE=' + m[1] + ' <= 9 : le reordonnancement ne sert plus a rien, le retirer');
});

/* ══ LA ROTATION DES `eth_call` ENTRE LES NOEUDS ════════════════════════════════════════════════
 *
 * ⛔⛔⛔ LA MESURE QUI L A DECIDEE (2026-10-01, production, temoin pose sur `fetch` — l instrument
 *      `performance.getEntriesByType('resource')` est AVEUGLE aux requetes cross-origin qui
 *      echouent, il rendait « 0 requete » pendant que la console enregistrait 57 erreurs) :
 *          76 requetes RPC en 14 s   ·   publicnode 61  ·  base.org 15  ·  drpc 0
 *          eth_call 39  ·  eth_getLogs 33   ·   200 x 73, 429 x 3
 *          pic : 14 requetes dans UNE seconde, concurrence max 2
 *      ⇒ limite de DEBIT, pas de concurrence. Et les secours ne servaient qu APRES un echec : la
 *        charge n etait jamais REPARTIE, seulement reparee.
 *
 * ⛔⛔ ET POURQUOI SEULEMENT LES `eth_call`. Les trois noeuds n ont PAS les memes capacites, rejoue
 *     depuis le navigateur, formes reelles, appels espaces :
 *         eth_call decimals()      publicnode 200 · base.org 200 · drpc 200
 *         eth_getLogs 2 000 blocs  publicnode 500 APRES 30 s · base.org 413 · drpc 400
 *         eth_getLogs archive      publicnode 403 · base.org 200 · drpc 400
 *     Faire tourner les `getLogs` echangerait un ralentissement contre une PANNE. */
v('eth_call : la tete TOURNE, et JAMAIS vers le noeud des getLogs', () => {
  /* ⛔⛔⛔ CETTE ASSERTION A ETE ECRITE FAUSSE D ABORD, ET C EST LA MESURE APRES DEPLOIEMENT QUI
   *      L A CORRIGEE. Ma premiere version exigeait TROIS tetes differentes — rotation sur les
   *      trois noeuds. Deploye, mesure, meme instrument :
   *          publicnode        25 requetes   0 refus
   *          drpc              13 requetes   0 refus
   *          mainnet.base.org  59 requetes  12 REFUS (4 eth_call 429 + 8 getLogs 429)
   *      Les douze refus etaient TOUS sur base.org. Il porte deja les `getLogs` que LUI SEUL sait
   *      servir ; lui ajouter des `eth_call` le saturait. L intention juste n est donc pas « tourner
   *      partout » mais « tourner sur ce qui est LIBRE ».
   *      ⇒ Le test dit maintenant la regle mesuree, pas celle que j avais devinee. */
  const p = [{ to: '0xb200000000000000000000397293cb8cda9a10c5', data: '0x313ce567' }, 'latest'];
  const tetes = [0, 1, 2].map((t) => choisir(RESEAUX, 8453, 'eth_call', p, t)[0]);
  assert.equal(new Set(tetes.slice(0, 2)).size, 2, 'deux tours doivent donner DEUX tetes differentes');
  assert.equal(tetes[2], tetes[0], 'et le troisieme revient au premier : c est un tour de role');
  for (const t of [0, 1, 2]) {
    assert.notEqual(choisir(RESEAUX, 8453, 'eth_call', p, t)[0], ORG,
      'tour ' + t + ' : base.org porte les getLogs, il ne doit JAMAIS etre en tete d un eth_call');
  }
});

v('eth_call : AUCUN noeud n est perdu — le repli reste entier', () => {
  /* ⛔ « UNE OPTIMISATION QUI SUPPRIME UN REPLI TRANSFORME UN RALENTISSEMENT EN PANNE » — la regle
   *   que ce fichier porte deja deux fois. On reordonne, on ne retire pas. */
  const p = [{ to: '0xb200000000000000000000397293cb8cda9a10c5', data: '0x313ce567' }, 'latest'];
  for (const t of [0, 1, 2]) {
    const out = choisir(RESEAUX, 8453, 'eth_call', p, t);
    assert.equal(out.length, 3, 'tour ' + t + ' : il doit rester TROIS noeuds');
    assert.equal(new Set(out).size, 3, 'tour ' + t + ' : aucun doublon');
    for (const u of [PUB, ORG, DRPC]) assert.ok(out.includes(u), 'tour ' + t + ' : ' + u + ' a disparu');
  }
});

v('⛔ les eth_getLogs ne tournent PAS : leurs contraintes sont differentes par noeud', () => {
  /* ⛔⛔ CE CAS EST LE GARDE-FOU DE LA ROTATION. S il tombe, c est qu une rotation aveugle a ete
   *     introduite et que les reordonnancements mesures (plafond de 9 adresses, archive) sont
   *     court-circuites un tour sur trois — un defaut INTERMITTENT, le pire a diagnostiquer. */
  for (const t of [0, 1, 2]) {
    assert.equal(choisir(RESEAUX, 8453, 'eth_getLogs', logs(adresses(50)), t)[0], ORG,
      'tour ' + t + ' : base.org doit RESTER en tete pour un multi-adresses');
    assert.equal(choisir(RESEAUX, 8453, 'eth_getLogs', logs(adresses(1)), t)[0], PUB,
      'tour ' + t + ' : un getLogs simple ne doit pas bouger de tete');
  }
});

v('⛔ la factory B20 reste EPINGLEE, quel que soit le tour', () => {
  /* ⛔ Son pin ne rotate pas DELIBEREMENT : un secours qui se trompe rend `0x` sur un eth_call —
   *   visiblement faux — mais sur un getLogs il rendrait une LISTE VIDE, indistinguable de
   *   « aucun evenement ». La rotation ne doit pas l atteindre. */
  const pf = [{ to: '0xb20f000000000000000000000000000000000000', data: '0x313ce567' }, 'latest'];
  for (const t of [0, 1, 2]) {
    const out = choisir(RESEAUX, 8453, 'eth_call', pf, t);
    assert.equal(out.length, 1, 'tour ' + t + ' : la factory reste sur UN seul noeud');
  }
});

assert.equal(n, 22, 'compte d assertions inattendu : ' + n);
console.log('ok noeud-logs-multi — ' + n + ' cas, bloc reel extrait de app.html ('
  + source.length + ' caracteres)');
