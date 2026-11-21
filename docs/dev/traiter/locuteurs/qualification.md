# Qualification des locuteurs locaux

## Conclusion

Le lot local est clôturé : sélection et corrections corpus, renommage depuis
l’entretien, création au nommage et détails secondaires sont livrés et qualifiés.
Les droits distants restent inchangés. Les réserves transversales ci-dessous ne
sont pas intégrées à ce chantier ; la clôture ne signifie pas que toute la suite
historique est verte.

B1+B2 sont dans `2f33a3b`, B3+B4 dans `1d83616`. Le commit de clôture B5 livre
les compléments de qualification, les captures et la correction de coût des
suggestions. Aucun push supplémentaire n’a été effectué.

## Résultats acquis

- **4 236 tests locaux et fournisseurs simulés passent sur 294 fichiers.**
  Les tests exigeant les serveurs réels ne sont pas inclus dans ce total.
- **121 scénarios Electron ciblés sont validés**, inclus dans les **302 réussites**
  de la campagne locale élargie. Cette dernière compte aussi **21 échecs et 5 sauts**.
- Les **21 scénarios encore en échec échouent également sur `31ec321`**, avant le
  lot B. La comparaison ciblée de cette référence donne 33 réussites et 23 échecs,
  dont deux recettes d’anonymisation corrigées depuis dans la branche courante.
- Typage de l’application, typage strict des nouveaux tests et des recettes
  principales modifiées, build et contrôle des espaces réussis.
- Quatre captures actualisées : gestion dans l’entretien, statistiques,
  sélection corpus et détails. Les deux dernières sont ajoutées à l’aide utilisateur.

Les parcours ciblés couvrent notamment les homonymes, les refus et retraits
volontaires, les corrections périmées, la reprise après interruption, les saisies
récentes, les notes contextualisées, les rôles et données conservés, les statistiques,
les cas, les imports V1 et les exports actuels. Un parcours complet importe un
fichier V1, code du texte, crée puis renomme un locuteur, saisit une donnée et
vérifie le résultat exporté en TXT. Les anciennes recettes qui attendent encore
l’export individuel ne sont pas présentées comme réparées.

Les détails sont vérifiés au clavier et à 1 280 puis 760 pixels, sans débordement
horizontal ni écriture de consultation. Les documents natifs sans identifiant de
participation sont refusés sans réparation ni affichage partiel éditable.

## Volumes

Quatre tests supplémentaires couvrent un inventaire de **2 000 entretiens** :
homonymes séparés, proposition unique entre groupes, refus porté par un membre
éloigné, notes portant les mêmes ids locaux et absence de mutation. Les contrôles
de refus ne sont plus répétés pour chaque apparition d’une même identité.

Le banc Electron exécute les **neuf combinaisons** de 20 000, 80 000 et 200 000
caractères avec 0, 250 et 1 000 annotations, à neuf frappes par scénario.
Les neuf scénarios s’exécutent sans erreur. Cela ne signifie pas qu’ils sont tous
fluides : à 1 000 annotations, le p95 des corrections atteint **400 à 647 ms**.
Cette limite de réactivité de l’éditeur est conservée, sans abaisser le seuil de
200 ms. Les mesures locales ne constituent pas une garantie sur toute machine.

## Réserves conservées hors lot

Les échecs reproduits avant le lot B concernent :

- les anciennes entrées d’export individuel et plusieurs recettes de documentation ;
- la disposition du tableau de pseudonymisation au zoom ;
- la navigation, les récents, le nom du corpus et les menus ;
- des assertions de présentation des onglets et du volet Notes ;
- le curseur derrière la barre fixe et des étapes des parcours guidés ;
- le retour de consultation et le parcours de refus d’un format inconnu au démarrage.

Le test de maquette dépend d’un HTML absent de `31ec321` comme de la branche
courante ; il est exclu de la campagne finale, après constat de l’échec de collecte.
Les fichiers de bancs réels GitLab/Nextcloud/WebDAV, le multi-utilisateur et le
script de débogage du consentement sont également hors campagne locale finale.
Aucun nouveau parcours distant n’est ouvert ou revendiqué comme qualifié.

## Reproduction

```sh
npm run typecheck
npm run build
npx vitest run --exclude 'test/webdav/*nextcloud.test.ts' \
  --exclude 'test/gitlab/qualification*.test.ts' \
  --exclude 'test/gitlab/contrat-gitlab.test.ts'
SONAL_DOC_CAPTURES=1 npx playwright test e2e/documentation-locuteurs.e2e.ts \
  --project=local --workers=1
npm run test:charge -- --sans-build --tailles 20000,80000,200000 \
  --annotations 0,250,1000 --corrections 9
```

Les journaux, rapports détaillés et traces restent locaux ; ils ne sont pas des
livrables à publier. Aucune relance générale supplémentaire n’est requise pour
clôturer ce lot. Les réserves seront reprises dans leurs chantiers respectifs.
