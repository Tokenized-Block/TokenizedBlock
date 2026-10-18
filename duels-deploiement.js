/* duels-deploiement.js — GENERE par contracts/preparer-deploiement-duels.mjs. NE PAS EDITER A LA MAIN.
 * La transaction de deploiement NON SIGNEE de BlockDuels. Rien ici ne signe ni n envoie. usdc et devWallet viennent du depot ; rewardPool
 * et guardian de contracts/duels-parametres.json (Phil). pret: false -> la page ne propose rien. */
export const DUELS_DEPLOIEMENT = Object.freeze({
  chaine: 8453,
  contrat: 'BlockDuels',
  compilateur: '0.8.24+commit.e11b9ed9',
  optimiseur: {"enabled":true,"runs":200},
  evm: 'cancun',
  constructeur: Object.freeze({"usdc":"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913","devWallet":"0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4","rewardPool":"","guardian":""}),
  ordre: ["usdc","devWallet","rewardPool","guardian"],
  pret: false,
  manquants: ["rewardPool","guardian"],
  refus: [],
  octetsArgs: null,
  sha256Sources: Object.freeze({"src/BlockDuels.sol":"a0e758c494989c41c659da503ef256a063e868dd753a9fde26cef9df72ca3bec"}),
  sha256Creation: null,
  octetsCreation: null,
  adresse: null,
  bloc: null,
  creation: null,
});
