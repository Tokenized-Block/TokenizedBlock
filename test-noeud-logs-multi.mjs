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

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');

/* --- extraction du bloc reel ------------------------------------------------------------- */
const debut = html.indexOf('const ADRESSES_MAX_PUBLICNODE');
assert.ok(debut > 0, 'bloc de selection introuvable dans app.html');
const ancre = html.indexOf('if (servant) noeuds =', debut);
assert.ok(ancre > debut, 'reordonnancement introuvable');
const fin = html.indexOf('\n  }', ancre);
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
for (const jeton of ['ADRESSES_MAX_PUBLICNODE', 'logsMultiRpc', 'noeuds']) {
  assert.ok(source.includes(jeton), 'extraction incomplete, il manque ' + jeton);
}

const choisir = new Function('RESEAUX', 'CHAINE', 'methode', 'params', 'viseFactory',
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
  const out = choisir(RESEAUX, 8453, 'eth_getLogs', logs(adresses(50)), false);
  assert.equal(out[0], ORG, 'base.org doit passer devant');
});

/* 2. ⛔ ET AUCUN NOEUD N EST PERDU. Une optimisation qui supprime un repli transforme un
 *    ralentissement en panne le jour ou base.org tombe. */
v('aucun noeud supprime', () => {
  const out = choisir(RESEAUX, 8453, 'eth_getLogs', logs(adresses(50)), false);
  assert.deepEqual([...out].sort(), [DRPC, ORG, PUB].sort(), 'un noeud a disparu');
  assert.equal(new Set(out).size, out.length, 'un noeud est en double');
});

/* 3. LE SEUIL, DES DEUX COTES — un test qui ne regarde qu un cote ne mesure pas un seuil. */
v('9 adresses : ordre INCHANGE (publicnode sert encore)', () => {
  assert.equal(choisir(RESEAUX, 8453, 'eth_getLogs', logs(adresses(9)), false)[0], PUB);
});
v('10 adresses : base.org en tete (premier refus mesure)', () => {
  assert.equal(choisir(RESEAUX, 8453, 'eth_getLogs', logs(adresses(10)), false)[0], ORG);
});

/* 4. UNE SEULE ADRESSE EN CHAINE, PAS EN TABLEAU — la forme la plus courante de tout le code. */
v('adresse unique (chaine) : inchange', () => {
  assert.equal(choisir(RESEAUX, 8453, 'eth_getLogs', [{ address: PUB, fromBlock: '0x1', toBlock: '0x2' }], false)[0], PUB);
});
v('tableau d UNE adresse : inchange', () => {
  assert.equal(choisir(RESEAUX, 8453, 'eth_getLogs', logs(adresses(1)), false)[0], PUB);
});

/* 5. UNE AUTRE METHODE NE DOIT RIEN DEPLACER, meme avec un tableau qui ressemble. */
v('eth_call avec un params[0].address : inchange', () => {
  assert.equal(choisir(RESEAUX, 8453, 'eth_call', [{ address: adresses(50) }, 'latest'], false)[0], PUB);
});

/* 6. LES ENTREES TORDUES NE DOIVENT PAS JETER — `nan-walks-through-every-bound`. */
v('params absent / vide / null : inchange et sans exception', () => {
  for (const p of [undefined, null, [], [null], ['latest'], [{}], [{ address: null }]]) {
    assert.equal(choisir(RESEAUX, 8453, 'eth_getLogs', p, false)[0], PUB, 'casse sur ' + JSON.stringify(p));
  }
});

/* 7. ⛔ LA FACTORY B20 GARDE SA REGLE : elle est PINNEE, et le reordonnancement ne doit pas la
 *    elargir a trois noeuds — les secours ont deja rendu `0x` sur ces lectures. */
v('viseFactory : un seul noeud, inchange', () => {
  const out = choisir(RESEAUX, 8453, 'eth_getLogs', logs(adresses(50)), true);
  assert.deepEqual(out, [ORG], 'la factory ne doit jamais tourner');
});

/* 8. ⛔ UNE CHAINE SANS MESURE NE SE FAIT PAS REORDONNER. Sepolia n a pas de `logsMultiRpc` :
 *    deviner un noeud la-bas serait inventer une mesure qu on n a pas faite. */
v('Sepolia (pas de logsMultiRpc) : inchange', () => {
  const out = choisir(RESEAUX, 84532, 'eth_getLogs', logs(adresses(50)), false);
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

assert.equal(n, 13, 'compte d assertions inattendu : ' + n);
console.log('ok noeud-logs-multi — ' + n + ' cas, bloc reel extrait de app.html ('
  + source.length + ' caracteres)');
