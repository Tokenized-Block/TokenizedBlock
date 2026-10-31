/* contracts/fiche-tamart.mjs — L ECRIVAIN UNIQUE de tamart-deploiement.js (2026-11-01). Pur : aucun fichier, aucun reseau.
 *   preparer-deploiement-tamart.mjs l appelle avec adresse/bloc = null ; noter-deploiement-tamart.mjs le rappelle avec la MEME fiche,
 *   adresse et bloc relus sur la chaine. Personne n edite la fiche a la main : un seul gabarit, deux appelants. */
const S = (x) => "'" + String(x) + "'";

/** f = les champs de la fiche ; rend le texte complet du module tamart-deploiement.js */
export function texteFicheTamart(f) {
  const deploye = f.adresse !== null && f.adresse !== undefined;
  return [
    '/* tamart-deploiement.js — GENERE par contracts/preparer-deploiement-tamart.mjs. NE PAS EDITER A LA MAIN.',
    ' * La transaction de deploiement NON SIGNEE de TamArt. Rien ici ne signe ni n envoie. usdc et beneficiaire viennent du depot',
    ' * (frais-creation.js USDC_BASE, FEE_WALLET). TamArt n a pas d owner. */',
    'export const TAMART_DEPLOIEMENT = Object.freeze({',
    '  chaine: 8453,',
    "  contrat: 'TamArt',",
    '  compilateur: ' + S(f.compilateur) + ',',
    '  optimiseur: ' + JSON.stringify(f.optimiseur ?? null) + ',',
    '  evm: ' + S(f.evm) + ',',
    '  constructeur: Object.freeze(' + JSON.stringify(f.constructeur) + '),',
    '  ordre: ' + JSON.stringify(f.ordre) + ',',
    '  prix: ' + Number(f.prix) + ',',
    '  pret: ' + (f.pret === true) + ',',
    '  octetsArgs: ' + Number(f.octetsArgs) + ',',
    '  sha256Sources: Object.freeze(' + JSON.stringify(f.sha256Sources) + '),',
    '  sha256Creation: ' + S(f.sha256Creation) + ',',
    '  octetsCreation: ' + Number(f.octetsCreation) + ',',
    /* apres le deploiement reel : l adresse et le bloc, RELUS sur la chaine, ecrits ENSEMBLE (jamais l un sans l autre) */
    '  adresse: ' + (deploye ? S(f.adresse) : 'null') + ',',
    '  bloc: ' + (deploye ? Number(f.bloc) + ', /* tx ' + f.tx + ' signed by ' + f.signataire + ' */' : 'null,'),
    '  creation: ' + S(f.creation) + ',',
    '});',
    '',
  ].join('\n');
}
