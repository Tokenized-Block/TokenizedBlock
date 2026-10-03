# Le pont du block — plan (2026-10-03)

Idée de Phil : le block devient lui-même un multipool. Il est coté sur plusieurs marchés (ETH, OUSD, actions Coinbase comme NVDAc).
Son bot a un wallet, et son métier est de faire le pont entre deux points de liquidité du même block : quand les prix s'écartent,
il les rapproche, en unités B20. Chaque passage paie le hook de chaque marché traversé, et l'économie des blocks tourne en continu.
Les actions tokenisées, avec OUSD comme stablecoin, sont la liquidité prioritaire : « pas de panne de liquidité ».

## Ce qui est MESURÉ (lecture seule, Base mainnet, 2026-10-03)

| Fait | Chiffre | Source |
|---|---|---|
| NVDAc, pool principale | Aerodrome NVDAc/USDC : liquidité 2,09 M$, volume 24 h 4,60 M$, prix 234,64 $ | dexscreener |
| Cours NVDA en bourse | 233,95 $ (clôture du 2026-10-02) ; écart avec la pool : +0,3 % | Yahoo chart v8 |
| NVDAc admis comme devise | V8 : oui · 7030 : oui | `paires.js` |
| Memes appariés à NVDAc (v4) | 4 pools (PrinterInkCoin, JENSEN, OCCUPY, BLOCKY), environ 137 k$, **toutes sur le hook Doppler** `0xbdf9…6544` | Initialize lus, 16/16, 0 erreur RPC |
| Blocks TB appariés à NVDAc | **0** | même scan |
| Blocks TB dans `/api/trending` (liquidité ≥ 500 $) | **0 sur 217 lignes** (IB022, baa5, e7e9, ab54 et TTB absents) | prod |
| Block → block en une tx | en ligne (build 20261003-bloc-vers-bloc). IB022 → baa5 coté sur le Quoter réel ; 0,25 % de mieux que LI.FI | test-bloc-vers-bloc |

**À relancer :** la carte complète de la liquidité des blocks TB. Le premier run était aveugle : `mainnet.base.org` limite
`eth_getLogs` à 2 000 blocs, et publicnode refuse l'archive. Le script corrigé existe : fenêtres de 2 000 sur base.org seulement.

## Le cycle du pont : atomique, il ne peut pas perdre au-delà du gas

Un cycle part de la devise X et y revient, **dans une seule transaction**, avec `minOut ≥ amountIn + gas`. S'il n'est pas
rentable, il revert : aucun stock gardé, aucun risque de marché.

Exemple : `ETH → [ETH/BLOCK] → BLOCK → [BLOCK/NVDAc] → NVDAc → [NVDAc/USDC Aerodrome] → USDC → [USDC/ETH] → ETH`.

Cela tient par construction dans les limites dures du brain wallet : spot, sans levier, sans marge, et sans
liquidation possible, puisqu'aucune position n'est gardée.

**Seuil de rentabilité** : l'écart de prix entre les deux marchés du block doit dépasser
Σ frais de hook + Σ frais de pool + gas.
- V8 : 2 × 0,5 % = **1 % de frais de hook**, plus les frais de pool.
- 7030 : 2 × 0,1 % = **0,2 %**, dont 0,07 % pour a6cf et 0,03 % pour le créateur à chaque passage.
  ⇒ Le 7030 rend le pont environ **5 fois plus souvent rentable**. C'est lui qui fait tourner l'économie en continu.
  **Le 7030 n'est pas déployé** : signature de Phil, et la liste de 62 devises est introuvable chez Grok (à demander à Zero 1).

**Ce que chaque cycle verse** : V8 → 0,5 % du notionnel de chaque jambe de block à a6cf. 7030 → 0,07 % à a6cf et 0,03 % au
créateur, par jambe.

## Règles à poser (fail-closed, comme le reste de l'app)

1. **Rail séparé du rail utilisateur.** La règle R4 « pas de block au milieu d'une route » reste vraie pour les utilisateurs.
   Le cycle du pont est un rail à part, réservé au wallet du bot, où le block est au milieu par définition.
2. **Chaque jambe hookée paie a6cf dans une devise vendable.** Une pool V8 dont le block est currency0 verse le frais EN BLOCK :
   elle est exclue du pont. Le 7030 paie toujours dans la devise.
3. **Le cycle est simulé (`eth_call`) sur la transaction exacte** avant tout envoi. `minOut` est encodé dans le dernier TAKE.
4. **Plafonds par token** (B1) : par cycle, par jour, sur un registre persisté côté serveur, et un bouton d'arrêt.
5. **Seule la transaction exacte du planificateur est exécutable** (B2), liée à son aperçu (identifiant, expiration, re-planification
   et comparaison à l'exécution).
6. **La clé CDP est posée par Phil, avec un drapeau OFF par défaut.** Claude prépare et vérifie, il ne signe jamais.

## Ordre

1. Relancer la carte de liquidité corrigée (blocks TB × marchés × liquidité).
2. Ouvrir « Receive » aux actions Coinbase et à OUSD (la liquidité est là), en plus des blocks TB.
3. Prioriser la paire **block/NVDAc (ou une autre action) sur notre hook** au Create : V8 l'admet déjà, sans toucher au contrat.
4. Le planificateur du cycle du pont (lecture seule, eth_call) : il mesure combien de cycles auraient été rentables sur N jours,
   V8 contre 7030, **avant** d'écrire la moindre exécution.
5. Le brain wallet (Grok `4a55540`, B1 et B2 à finir : registre, exécution liée à l'aperçu), puis la clé et le GO de Phil.
