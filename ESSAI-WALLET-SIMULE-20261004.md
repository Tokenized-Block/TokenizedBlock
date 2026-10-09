# Essai avec un wallet simulé, sur un fork local

Ce document est cité par `mode-essai.js`, `banc-wallet-simule-fork-20261004.mjs`, `essai-wallet-simule-session.mjs`, `test-mode-essai-20261004.mjs` et `app.html`.

Il a été écrit le 2026-10-09, quand la branche a été récupérée : les commentaires le citaient, mais il n'existait pas.

## Ce que c'est

Le mode essai rejoue l'app réelle avec trois substitutions :
- un fork local de Base (`base-anvil`) ;
- un fournisseur EIP-1193 **sans clé**, qui « signe » par impersonation sur ce fork ;
- un serveur dont les quatre listes de nœuds pointent vers le fork.

Rien ne part sur Base mainnet.

Le mode est éteint par défaut. Il ne s'allume que si **toutes** les conditions suivantes sont réunies.

Côté page (`modeEssai`), il faut à la fois :
- un hôte local en égalité exacte (`localhost`, `127.0.0.1` ou `[::1]`) ;
- `?essai=wallet` dans l'URL ;
- un nœud d'essai local, en http, sans identifiants ;
- l'adresse entière d'un compte.

Côté serveur (`essaiServeur`), il faut à la fois :
- `TB_RPC_TEST` qui désigne un nœud local ;
- aucune variable `RAILWAY_*` ;
- `NODE_ENV` différent de `production`.

`wallet-simule.js` n'est servi que si le serveur lui-même est en mode essai.

## Les gestes

> ⚠️ Sur cette machine, le port 8549 tombe dans une plage réservée par Windows (os error 10013). Le fork tourne donc sur **9549**.

1. Lancer le fork :

   ```
   FOUNDRY_BASE=true base-anvil --base --fork-url https://mainnet.base.org --port 9549
   ```

2. Lancer le banc sans navigateur :

   ```
   node banc-wallet-simule-fork-20261004.mjs http://127.0.0.1:9549
   ```

   Il prend un instantané du fork (`evm_snapshot`), joue les parcours, puis le rend (`evm_revert`).

3. Lancer une session pour le navigateur :

   ```
   node essai-wallet-simule-session.mjs --port 8091 http://127.0.0.1:9549
   ```

   Ouvrir ensuite l'URL affichée (`http://localhost:8091/?essai=wallet&…`). Pendant la session, `--soldes 0x<compte>` affiche les soldes. Après un arrêt brutal, `--rendre` remet l'instantané et tue le serveur.

## Ce qui a été mesuré

Banc fork du 2026-10-09 : **60 ok / 0 KO**. Fork au bloc 52381049, sur le code de la branche (base `9ab857e`). Une attente de budget (429) a été comptée.

| Parcours | Route | Frais mesuré sur les soldes |
|---|---|---|
| USDC → NVDAc | Aerodrome | 9,9 bps |
| NVDAc → ETH | Aerodrome | 9,9 bps |
| USDC → LLYc | pool v4 | 50 bps |
| LLYc → IB022 | multi-sauts | 50 bps, sur le hook |
| ETH → USDC | — | 20 bps |
| Message payé | — | 100 000 unités USDC, soit 0,10 USDC |

Pour chaque parcours :
- le frais est vérifié sur les **soldes** (débit du compte, crédit du wallet des frais), jamais sur un événement seul ;
- un témoin, un transfert simple de 0,0001 ETH, est jugé « sans frais » par le même juge ;
- le serveur n'a joint que le fork et lui-même.

## Ce que ça ne prouve pas

- **Un vrai wallet.** Le wallet simulé n'a ni écran, ni clé, ni estimation de gaz à lui, et ce n'est pas un smart wallet. Le chemin `wallet_sendCalls`, utilisé par l'Instant Birth en une signature et par le lot atomique, **n'est pas supporté** par ce mode.
- **L'écran.** Le banc tourne sans navigateur. La session sert au contrôle à la main.
- **Les temps.** Le fork lit à froid vers le réseau, donc les durées ne valent pas pour la prod.
