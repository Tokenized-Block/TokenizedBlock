/* ticketpot-deploiement.js — GENERE par contracts/preparer-deploiement-ticketpot.mjs. NE PAS EDITER A LA MAIN.
 * La transaction de deploiement NON SIGNEE de TicketPot. Rien ici ne signe ni n envoie. usdc vient du depot ; verifier et guardian de
 * contracts/ticketpot-parametres.json (Phil). pret: false -> la page ne propose rien. */
export const TICKETPOT_DEPLOIEMENT = Object.freeze({
  chaine: 8453,
  contrat: 'TicketPot',
  compilateur: '0.8.24+commit.e11b9ed9',
  optimiseur: {"enabled":true,"runs":200},
  evm: 'cancun',
  constructeur: Object.freeze({"usdc":"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913","verifier":"","guardian":""}),
  ordre: ["usdc","verifier","guardian"],
  feeWallet: '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4',
  pret: false,
  manquants: ["verifier","guardian"],
  refus: [],
  octetsArgs: null,
  sha256Sources: Object.freeze({"src/TicketPot.sol":"a9d4b1fae7531070de948d60120afb6cefae5111e3d07fc19c52717de7eeadf7"}),
  sha256Creation: null,
  octetsCreation: null,
  adresse: null,
  bloc: null,
  creation: null,
});
