# Mode S.I : une signature, une autorisation plafonnee sur la chaine (design, 2026-10-10)

Demande de Phil (17:00) : le mode S.I (Pay with / Per trade 0.002 / Budget 0.01 / Stops after 24h) devient UNE signature de la
personne, qui accorde une autorisation PLAFONNEE ; ensuite le cerveau trade seul, sans confirmation par trade.
Statut : DRAPEAU OFF (`SI_AUTORISATION=1` cote serveur, `SI_AUTORISATION_ACTIVE = false` dans app.html). Rien n est deploye.

## Ce qui existe deja (Claude, canal)
- `DESIGN-BRAIN-WALLET-COINBASE.md` (2026-10-03) : un wallet serveur par block = CDP Server Wallet / AgentKit (cle API, TEE),
  compte `tb-block-<id>`, policy CDP fail-closed (Base seulement, routeurs TB seulement, pas d approbation illimitee), budget
  quotidien reserve dans un ledger TB, journal, kill switch, `BRAIN_WALLET=off`. Phase 0/1 jamais codees.
- `test-cerveau-ne-signe-pas.mjs` : aucun module du cerveau ne signe ni n envoie. Reste VERT : l execution n est pas dans le cerveau.

## Options comparees
| Option | Plafond sur la chaine | Expiration | Revocation | Wallets compatibles | Limite |
|---|---|---|---|---|---|
| **Permit2 AllowanceTransfer** (PermitSingle signe hors chaine) | oui (`amount` uint160) | oui (`expiration` uint48) | `approve(token, spender, 0, 0)` ou `lockdown` | tout wallet EOA + Smart Wallet (EIP-712) | ERC-20 seulement (ETH -> WETH d abord) ; une approbation Permit2 du jeton par la personne une fois |
| **Base Spend Permissions** (SpendPermissionManager) | oui (allowance par periode) | oui (start/end) | `revoke` | **Coinbase Smart Wallet seulement** | exclut Rabby / MetaMask EOA (les wallets de nos QA) |
| Session key (ERC-7715 / smart account) | selon le module | oui | oui | smart accounts seulement | pile encore heterogene |

**Choix : Permit2 en premier** (marche pour les wallets reellement utilises ici ; plafond + expiration appliques par Permit2 lui-meme),
Spend Permissions en second rail pour les Smart Wallets.

## Flux
1. La personne choisit Pay with / Per trade / Budget / duree (<= 24 h). Le serveur LIT le nonce Permit2.
2. ETH : une transaction WETH.deposit (budget). Jeton : une approbation Permit2 si absente (une fois).
3. **Une signature** EIP-712 `PermitSingle { token, amount = budget, expiration = maintenant + duree, nonce, spender = executeur }`
   (`si-autorisation.js messageAutorisation`, ne signe rien).
4. Le cerveau PROPOSE (inchange). Le module d execution SEPARE (`execution-si.js`, a ecrire, serveur, wallet CDP du block) verifie
   `tradeAdmis` (SPOT, jeton autorise, par-trade, budget cumule, expiration, sortie rendue au compte qui a signe), construit le plan
   par nos rails (`planRail`, simule), `permit2.transferFrom` du montant EXACT, swap avec `recipient = la personne`.
5. Revocation : bouton Stop S.I = transaction `approve(token, executeur, 0, 0)` (la personne), plus arret serveur immediat.

## Limites dures
- SPOT seulement, aucun levier, aucun emprunt, aucune sortie vers une autre adresse que celle qui a signe.
- Le plafond et l expiration sont appliques PAR LA CHAINE (Permit2) : un serveur compromis ne prend jamais plus que le budget,
  ni apres l expiration.
- ⚠️ Risque restant : le spender peut, dans le plafond, envoyer les jetons ailleurs. A fermer avant ON : un **contrat executeur**
  minimal (spender = contrat, qui n accepte qu un swap sur nos routeurs avec recipient = owner du permit) — a ecrire, auditer,
  deployer ; ou, a defaut, la policy CDP (moins forte : hors chaine).
- Le frais TB reste celui de nos rails (une fois par swap).

## Non fait / non mesure
- Module d execution, contrat executeur, policy CDP, wallets CDP : NON ECRITS. Aucun appel CDP.
- Aucune signature Permit2 testee sur fork ni avec un vrai wallet.
- Spend Permissions : documentation non relue aujourd hui (adresse du manager non copiee : a lire avant tout code).
