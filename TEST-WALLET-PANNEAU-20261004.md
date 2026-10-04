# Test wallet connecté — panneau de commande (pour Grok Bot)

**Build attendu** : `20261004-panneau-remplace-la-fiche` ou plus récent (lire `https://tokenizedblock.space/sante` → `build`, et `sondes` : les 4 à `PRET`).
**Ouvrir** : `https://tokenizedblock.space/app.html?panel=1#b=0xb200000000000000000000e4b0c5fbe9c8df579e` (IB022).
**Wallet** : un wallet de TEST avec un peu d'ETH et ≥ 2 USDC sur Base. ⛔ Jamais le wallet des frais `0xa6cf…f5d4`.
**Ce qui n'a JAMAIS été mesuré** (c'est l'objet de ce test) : toute signature depuis le panneau avec un vrai wallet.

Pour chaque étape : noter **vu / pas vu**, le texte exact si différent, et le hash de transaction s'il y en a un. Une capture par étape en échec.

## A. Lecture (aucune signature)
1. Le panneau s'ouvre **à droite** (ou en bas sur téléphone), l'app reste visible derrière. Titre `IB022`, sous-titre `Smoke IB022`, adresse entière.
2. Connecter le wallet. Onglet **Trade** → « You hold » affiche 3 cases (IB022, ETH, USDC) avec des montants, jamais « not read » plus de 20 s.
3. Onglet **Market** → `Market: read on chain`, `Venue: TokenizedBlock`, `Quoted in: ETH`.
4. Champ de recherche : taper `NVDAc` + Entrée → le panneau passe sur NVDAc, prix et liquidité affichés, « Live on this block » liste des transactions.
5. Revenir sur IB022 (coller son adresse dans la recherche).

## B. Achat d'un block (1 signature)
6. Trade → Buy → `0.0001` → ETH → **Review the buy of IB022**. Attendu dans le Chat : `0.0001 ETH → IB022`, `Its brain (…) accepts.`
7. **Prepare the plan** → attendu : `Market fee: 0.5 %, taken by this block’s own market inside the swap.` puis `You receive at least … IB022.`
8. **Sign in my wallet** → le wallet montre UNE transaction, valeur 0.0001 ETH. Signer. Attendu : `Confirmed.` puis `Done — 0x….` + lien explorateur.
9. Trade → « You hold » : le solde IB022 a augmenté (dans les 20 s). « History » montre l'opération `done`.
10. Brain (onglet de l'app, carte journal) : une ligne « Control panel · you signed ».

## C. Vente (2 signatures : approbation puis swap)
11. Trade → Sell → toucher `25 %` → **Review the sale** → Prepare the plan → `Sign the 2 approval(s)` (ou 1) → puis le swap. Attendu : `Done`.
12. Refus volontaire : refaire une vente et **refuser** dans le wallet. Attendu : `You declined in your wallet — nothing more was sent.`

## D. Action tokenisée par Aerodrome (le chemin NEUF)
13. Chat : `buy NVDAc with 2 USDC` → Prepare → signer (approbation + swap). Attendu : `App fee: 0.1 %`.
14. Chat : `sell 0.004 NVDAc` (ou le solde reçu) → Prepare → signer. Attendu : `Done`, USDC reçus. **C'est la vente Aerodrome, jamais exécutée avec un vrai wallet.**
15. Sans solde : `sell 5 NVDAc` → attendu AVANT toute signature : `This wallet holds … NVDAc — not enough. Nothing was asked.`

## E. Skin à 1 USDC (1 signature)
16. Onglet Brain du panneau → `+` → `🎲 Random` (ou régler les 6 curseurs) → le contour, les arêtes et le noyau du cube changent.
17. **Buy** → carte `Skin … for IB022 — 1 USDC` → **Pay 1 USDC** → attendu : `1 USDC goes to 0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4 (TokenizedBlock).`
18. **Sign in my wallet** → le wallet montre UN transfert de 1 USDC vers `0xa6cf…f5d4`. Signer. Attendu : `Paid. Recording it…` puis `Recorded. This skin is yours on this block`.
19. Vérifier : `https://tokenizedblock.space/api/skins/0xb200000000000000000000e4b0c5fbe9c8df579e` contient une ligne avec `payeur` = le wallet de test et le hash.
20. Recharger la page → la barre de skin dit `yours — paid on chain` ; sur la **Map**, le block IB022 porte un anneau coloré (dans les 15 s).
21. Déconnecter le wallet → l'anneau disparaît de la Map.

## F. AiFi (aucune signature attendue tant que l'humeur ne change pas)
22. Trade → AiFi → cocher « Buy when it gets excited » → Per trade `0.0001`, Budget `0.0003`, Stops after `1` → **Start AiFi**. Attendu : `On for IB022 · proposed 0 of 0.0003 ETH · 1 h left.`
23. Laisser ouvert. Si l'humeur passe à `excited`, une carte `Its brain · AiFi · swap` s'ouvre seule : la **confirmer ou l'écarter**. Noter l'heure et l'humeur avant/après.
24. **Stop AiFi** → `AiFi stopped.`

## G. Smart wallet (Base Account / passkey), si disponible
25. Refaire l'étape 17-19 avec un smart wallet. Attendu identique. Si `The registry refused it` : copier la raison et le hash — c'est le cas non testé sur la chaîne.

## H. Map → panneau, et les saluts (1 signature)
26. Onglet Map → cliquer un block. Attendu : la fiche d'info NE s'affiche PAS ; le panneau s'ouvre déplié sur ce block, vue Market, avec `Buy | Open profile | GM | BM | GN | Gmeow`. Les boutons + − recentrer rotation sont en bas à GAUCHE.
27. Dans le panneau, **GM 👋** (wallet connecté, en détenant un peu du block) → la colonne s'ouvre avec le formulaire d'envoi : `GM ready: paste who receives it…`, montant `1`. Coller une adresse de test, signer. Attendu : le transfert part, avec la ligne de frais séparée (0,1 %).
28. Onglet **Blocks** → le panneau s'ouvre (vue Trade) sans quitter Blocks ; déjà ouvert, il ne change pas de vue.

## I. Un agent pilote le panneau (MCP)
29. Dans le panneau : **Agent link** → copier la session. Depuis un client MCP branché sur `https://tokenizedblock.space/mcp` : `tblock_command` `{session, type:"trade", block:"0xb200…579e", side:"buy", amount:"100000000000000", with:"ETH"}`. Attendu : `Agent: connected`, une carte `Your agent · swap` s'ouvre seule ; **Prepare the plan** puis signer. `tblock_panel_state` doit ensuite rendre un événement `signed` avec le hash.

## À me renvoyer
- Pour chaque lettre A–I : OK / KO + texte exact + hash.
- Toute différence entre ce que la carte annonce (« You receive at least », frais) et ce que le wallet montre.
