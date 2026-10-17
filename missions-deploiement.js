/* missions-deploiement.js — GENERE par contracts/preparer-deploiement-missions.mjs. NE PAS EDITER A LA MAIN.
 * La transaction de deploiement NON SIGNEE de BlockMissionsV3. Rien ici ne signe ni n envoie. */
export const MISSIONS_DEPLOIEMENT = Object.freeze({
  chaine: 8453,
  contrat: 'BlockMissionsV3',
  compilateur: '0.8.24+commit.e11b9ed9',
  optimiseur: {"enabled":true,"runs":200},
  evm: 'cancun',
  constructeur: Object.freeze({"hook":"0x32f3f572dd17625bab9035789c953e1d001864cc","poolManager":"0x498581ff718922c3f8e6a244956af099b2652b2b","devWallet":"0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4","usdc":"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913","communityReserve":"","verifier":"","guardian":"","rail":""}),
  ordre: ["hook","poolManager","devWallet","communityReserve","usdc","verifier","guardian","rail"],
  pret: false,
  manquants: ["communityReserve","verifier","guardian","rail"],
  refus: [],
  sha256Source: '91937cb7fab1c5267f9ce5da725ec45961f00c231fc060c1013b7d79bff71c4c',
  sha256Creation: null,
  octetsCreation: null,
  adresse: null,
  creation: null,
});
