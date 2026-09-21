// test-descripteurs-deploy.mjs — UN DESCRIPTEUR DE DEPLOIEMENT NE DOIT JAMAIS MENTIR SUR SON CONTRAT.
//
// ⛔⛔ LE DEFAUT QUE CE FICHIER EXISTE POUR EMPECHER, ET QUI A COUTE UNE SIGNATURE (2026-09-21).
//    J ai ecrit `dimeCreateurPourCent: 0` dans `deploy-v7.json` — une INTENTION. Le contrat garde
//    volontairement 20, pour qu on puisse diffuser le V6 et le V7 et voir ce qui change. Personne
//    n a confronte les deux. Phil a signe sur des pre-controles verts, et la page a affiche
//    « ✗ creator tithe on chain: 20% — expected 0 » APRES le deploiement, sur un contrat sain.
//
// ⛔ LA LECON, ECRITE ICI PARCE QU ELLE SE REPETERA SINON : une page de deploiement a DEUX phases,
//    avant et apres. J avais verifie la premiere (adresse libre, dry run, gas) et pas la seconde —
//    alors que chacune de ses assertions etait lisible a l avance.
//
// ⛔ CE QUE CE FICHIER NE PEUT PAS FAIRE : lire la chaine. Il tourne AVANT tout deploiement, donc il
//    confronte le descripteur a la SOURCE et a l ARTEFACT COMPILE. Le lien avec ce qui sera
//    reellement deploye tient a une chose : l initcode du descripteur doit contenir le bytecode de
//    creation de cet artefact. C est verifie ici, et c est la borne de ce controle.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

const ICI = new URL('./', import.meta.url);
const HOOK = new URL('../tblock-hook/', import.meta.url);

/** Les constantes `public constant` d une source Solidity. ⛔ Rend une Map VIDE si le fichier manque —
 *  et l appelant doit alors ECHOUER, pas conclure. */
function constantesDe(chemin) {
  const m = new Map();
  if (!existsSync(chemin)) return m;
  const src = readFileSync(chemin, 'utf8');
  for (const x of src.matchAll(/(?:uint\d*|address|bytes32)\s+public\s+constant\s+(\w+)\s*=\s*([^;]+);/g)) {
    m.set(x[1], x[2].trim().replace(/_/g, ''));
  }
  /* le wallet de frais et les frais de vie ne sont pas des constantes : ils viennent du constructeur */
  return m;
}

/* les descripteurs a verifier, et la source qui leur correspond */
const PAIRES = readdirSync(ICI)
  .filter((f) => /^deploy-v\d+\.json$/.test(f))
  .map((f) => ({ json: f, version: f.match(/v(\d+)/)[1] }))
  .filter((p) => existsSync(new URL('src/TBlockFeeHookV' + p.version + '.sol', HOOK)));

ok(PAIRES.length >= 2, PAIRES.length + ' descripteur(s) avec leur source — pas une liste vide');

for (const { json, version } of PAIRES) {
  const d = JSON.parse(readFileSync(new URL(json, ICI), 'utf8'));
  const cs = constantesDe(new URL('src/TBlockFeeHookV' + version + '.sol', HOOK));
  ok(cs.size > 0, json + ' : des constantes ont ete lues dans la source V' + version);

  // ══ LE COEUR : chaque valeur ANNONCEE doit exister dans le contrat ══════════════════════════
  // ⛔ C EST EXACTEMENT LE CONTROLE QUI MANQUAIT. `dimeCreateurPourCent: 0` contre un contrat qui
  //    declare 20 aurait vire au ROUGE ici, avant la moindre signature.
  if (d.dimeCreateurPourCent !== undefined) {
    const enSource = cs.get('DIME_CREATEUR_POUR_CENT');
    ok(enSource !== undefined, json + ' : la source V' + version + ' declare bien la dime');
    eq(String(d.dimeCreateurPourCent), enSource,
      json + ' : la dime ANNONCEE (' + d.dimeCreateurPourCent + ') doit etre celle que le contrat '
      + 'DECLARE (' + enSource + ') — sinon la page criera au loup apres le deploiement');
  }

  // ⛔ LE MARQUEUR N EST EXIGE QUE DES HOOKS QUI ONT LE VERROU DU LABEL. Le V2 est anterieur : lui
  //    reclamer un champ qu il n a jamais eu ferait echouer une garde sur un descripteur sain — et
  //    une garde qui echoue a tort finit par etre desactivee. La condition est donc LUE dans la
  //    source, pas supposee de la version.
  const sourceTexte = readFileSync(new URL('src/TBlockFeeHookV' + version + '.sol', HOOK), 'utf8');
  const aLeVerrouLabel = sourceTexte.includes('porteLeLabel');
  if (aLeVerrouLabel) {
    ok(typeof d.marqueur === 'string' && d.marqueur.length > 0,
      json + ' : ce hook a le verrou du label, donc son descripteur porte un marqueur');
    eq(d.marqueur.length, 16, json + ' : le marqueur fait 16 octets, comme `tailleMarqueur()`');
  } else {
    ok(true, json + ' : pas de verrou de label dans la source V' + version + ' — marqueur non exige');
  }

  // ⛔ LE LIEN AVEC CE QUI SERA DEPLOYE : l initcode doit contenir le bytecode de creation compile.
  //    Sans ce lien, tout le reste ne parlerait que d une source qui n a rien a voir.
  const art = new URL('out/TBlockFeeHookV' + version + '.sol/TBlockFeeHookV' + version + '.json', HOOK);
  if (existsSync(art)) {
    const creation = String(JSON.parse(readFileSync(art, 'utf8')).bytecode.object).replace(/^0x/, '').toLowerCase();
    const data = String(d.data || '').replace(/^0x/, '').toLowerCase();
    ok(creation.length > 1000, json + ' : le bytecode de creation compile est bien la');
    ok(data.includes(creation),
      json + ' : l initcode du descripteur CONTIENT le bytecode compile — c est ce qui relie ce '
      + 'controle au contrat qui sera reellement deploye');
  } else {
    // ⛔ ON NE FAIT PAS SEMBLANT : sans artefact, ce lien n a PAS ete verifie.
    ok(false, json + ' : artefact forge introuvable — le lien descripteur/contrat n est PAS verifie');
  }

  // ══ UNE PAGE DOIT VERIFIER CE POUR QUOI SA VERSION EXISTE ══════════════════════════════════
  // ⛔⛔ LE DEFAUT DU 2026-09-21, APRES LE V8. La page a rendu CINQ lignes vertes — wallet, label,
  //    dime, topic de preuve, verrou du label — sans JAMAIS lire HOOK_FEE(). Or le taux de 0,5 %
  //    etait la SEULE raison d etre du V8 : un hook reste a 3 % aurait passe tous ses controles et
  //    serait parti avec un feu vert complet.
  // ⛔ LA PARADE N EST PAS DE MIEUX SE SOUVENIR. Le descripteur DECLARE ce que la version change
  //    (`tauxPourCent`), et cette garde exige que la page le LISE. Ce qu une version change doit
  //    etre ce qu elle verifie en premier.
  if (d.tauxPourCent !== undefined) {
    const pf = new URL('deploy-v' + version + '.html', ICI);
    ok(existsSync(pf), json + ' : un taux est declare, donc une page doit exister pour le verifier');
    if (existsSync(pf)) {
      const page = readFileSync(pf, 'utf8');
      ok(/selecteurs\.hookFee/.test(page),
        'deploy-v' + version + '.html DOIT lire le taux sur la chaine — c est ce que cette version change');
      ok(/tauxPourCent/.test(page),
        'et le confronter au taux DECLARE dans le descripteur, pas a une constante ecrite dans la page');
      ok(d.selecteurs && d.selecteurs.hookFee,
        json + ' : le selecteur `hookFee` doit etre fourni, sinon la page ne peut rien lire');
    }
    // ⛔ ET LE TAUX DECLARE DOIT CORRESPONDRE A LA SOURCE, comme la dime.
    const enSource = cs.get('HOOK_FEE');
    if (enSource !== undefined) {
      eq(String(Math.round(d.tauxPourCent * 10000)), enSource,
        json + ' : le taux ANNONCE (' + d.tauxPourCent + ' %) doit valoir ce que la source DECLARE ('
        + enSource + ' / 1e6)');
    }
  }

  // ⛔⛔ LES CHAMPS EXIGES SONT CEUX QUE LA PAGE LIT VRAIMENT, pas une liste ecrite a la main. Une
  //    liste figee reclamait `fraisVieWei` au descripteur du V2, qui n en a jamais eu — et une garde
  //    qui echoue a tort finit par etre desactivee. Ici l exigence se DEDUIT de la page.
  // ⛔ ET C EST LE PIEGE QUE CA FERME : un champ absent rend `undefined`, et `undefined === undefined`
  //    passerait pour une egalite reussie dans la page.
  const pageFichier = new URL('deploy-v' + version + '.html', ICI);
  if (existsSync(pageFichier)) {
    const page = readFileSync(pageFichier, 'utf8');
    const lus = new Set([...page.matchAll(/\btx\.(\w+)/g)].map((x) => x[1]));
    ok(lus.size > 0, json + ' : la page lit au moins un champ du descripteur');
    for (const champ of lus) {
      ok(d[champ] !== undefined && d[champ] !== null && d[champ] !== '',
        'deploy-v' + version + '.html lit `tx.' + champ + '` — ' + json + ' doit le renseigner');
    }
  } else {
    ok(false, json + ' : aucune page deploy-v' + version + '.html — les champs exiges sont INCONNUS');
  }
  ok(/^0x[0-9a-fA-F]{40}$/.test(d.hook), json + ' : `hook` est une adresse');
  ok(/^0x[0-9a-fA-F]{40}$/.test(d.feeWallet), json + ' : `feeWallet` est une adresse');
}

// ══ LE TEMOIN QUI DONNE SA VALEUR AU FICHIER ═══════════════════════════════════════════════════
// ⛔ Sans lui, un test qui ne comparerait rien du tout passerait aussi. On fabrique le defaut exact
//    qui s est produit, et on verifie qu il serait ATTRAPE.
{
  const cs = constantesDe(new URL('src/TBlockFeeHookV7.sol', HOOK));
  const vraie = cs.get('DIME_CREATEUR_POUR_CENT');
  ok(vraie !== undefined, 'temoin : la dime est lisible dans la source du V7');
  const fauxDescripteur = { dimeCreateurPourCent: 0 };
  ok(String(fauxDescripteur.dimeCreateurPourCent) !== vraie,
    'temoin : un descripteur qui annoncerait 0 contre un contrat a ' + vraie
    + ' SERAIT attrape — c est exactement l erreur du 2026-09-21');
}

console.log('test-descripteurs-deploy : ' + n + ' assertions, ' + PAIRES.length + ' descripteur(s), OK');
