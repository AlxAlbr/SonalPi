# Utiliser les cas

Un **cas** est un dossier d’étude qui rassemble des passages de tes entretiens autour
d’une personne, d’un établissement, d’un groupe, d’un événement ou d’une autre unité
que tu souhaites analyser.

Les passages restent dans leurs entretiens. Le cas permet de les retrouver ensemble,
de les relire et d’ouvrir leur contexte, sans fabriquer une nouvelle transcription.

> La création en lot, les entretiens entiers, les familles de modalités et les
> attributs de cas sont disponibles. L’export natif QualCoder est accessible depuis
> Organiser et exporter → Exporter le corpus ; il produit un projet `.qda` avec les sources, les cas
> sélectionnés et les attributs disponibles. L’audio reste différé.

## Cas, personne, thème ou recueil ?

| Objet | À quoi sert-il ? | Exemple |
| --- | --- | --- |
| Personne | Relier une même personne entre plusieurs entretiens | Marie intervient dans trois entretiens |
| Cas | Rassembler les matériaux d’une unité étudiée | Le dossier analytique Marie |
| Thème | Identifier un sujet ou un concept dans un passage | Difficultés au travail |
| Variable | Décrire un entretien ou un locuteur | Établissement = A |
| Recueil | Organiser des citations et des textes de liaison | Préparer une synthèse ou un article |

Un passage peut être codé avec un thème, appartenir à plusieurs cas et être utilisé
dans un recueil. Ces usages restent indépendants : retirer le thème ne retire pas
le passage du cas.

## 1. Fonctions présentes

### Ouvrir les cas

Dans **Organiser et exporter**, ouvre l’onglet **Cas**.
Le panneau occupe toute la largeur, avec un répertoire à gauche et la fiche du cas choisi à droite.
Depuis un entretien, cet espace masque le texte sans fermer ton travail :
**Importer et traiter** retrouve l’entretien ouvert, avec l’audio en pause.
L’ajout d’une sélection reste accessible dans le menu contextuel de l’entretien.
Tu peux rechercher un cas par son nom ou son mémo.

### Créer un cas manuel vide

1. Ouvre **Cas**, puis **Nouveau cas**.
2. Choisis **Cas manuel vide**.
3. Renseigne un nom et, si tu le souhaites, un mémo.
4. Clique sur **Créer le cas**.

Aucune personne ni sélection n’est nécessaire. Le dossier est enregistré immédiatement,
sans créer de passage artificiel. Tu peux le fermer, le retrouver plus tard et le compléter
depuis l’éditeur. Annuler avant confirmation ne crée rien.

### Créer un cas depuis une personne

1. Ouvre **Cas**, puis **Nouveau cas**.
2. Choisis une personne du répertoire.
3. Vérifie le nom proposé et l’aperçu des entretiens et interventions.
4. Choisis, si nécessaire, d’inclure ses interventions où elle est enquêteur.
5. Renseigne un mémo si tu le souhaites, puis clique sur **Créer le cas**.

Le cas rassemble les paroles des locuteurs liés à cette personne, pas l’ensemble
des entretiens où elle apparaît. Les questions sont exclues de la règle par défaut
lorsque le locuteur est identifié comme enquêteur.

La règle est dynamique : lors d’une actualisation, les corrections du texte et des
associations entre locuteurs et personne sont prises en compte.
Si la personne n’existe pas encore, commence par le répertoire
[Personnes de la vue Corpus](vue-corpus.md#personnes).

### Créer plusieurs cas en une seule opération

1. Dans **Cas → Nouveau cas**, choisis **Plusieurs personnes** ou **Depuis des entretiens**.
2. Coche les éléments voulus, ou utilise **Tout sélectionner**. La recherche aide à retrouver
   une source ; Tout sélectionner porte sur la liste entière, pas seulement les résultats visibles.
3. Choisis **Un cas par personne / entretien**, ou **Un cas collectif**.
4. Pour des personnes, les interventions d’enquêteurs sont exclues par défaut ; tu peux les inclure.
5. Clique sur **Prévisualiser les cas**, puis vérifie les noms, mémos et matériaux annoncés.
6. Confirme avec **Créer les cas**.

**Sélectionner 30 personnes et choisir Un cas par personne crée 30 cas en une opération.**
Le choix collectif crée au contraire un seul dossier réunissant leurs interventions.
Les personnes homonymes restent distinctes ; des suffixes de noms sont proposés, modifiables
avant confirmation. Un nom vide ou déjà utilisé empêche la validation du lot entier.
L’aperçu indique aussi si d’autres cas utilisent déjà les mêmes critères.

Annuler l’aperçu ne crée rien. Après une erreur, **Réessayer la création** réutilise le lot
initial pour éviter les doublons. **Abandonner la tentative** ne supprime pas des cas qui
auraient déjà été enregistrés avant une perte de réponse.

### Inclure des entretiens entiers

**Depuis des entretiens** inclut les textes complets des fichiers choisis : questions,
réponses et passages sans locuteur. La règle suit les futurs ajouts au texte ; ce n’est
pas une sélection figée à la longueur du document au moment de la création.
Un entretien vide reste une source du cas, avec zéro passage de texte, sans être signalé
comme introuvable. Un fichier externe doit d’abord être importé dans le corpus.

Les cas individuels comme les collectifs peuvent ensuite recevoir des ajouts manuels.

### Créer un cas depuis un passage, ou compléter un cas

1. Dans l’éditeur d’un entretien, sélectionne librement un passage.
2. Dans le menu contextuel, choisis **Associer à un cas…**.
3. Coche un ou plusieurs cas existants, ou choisis **Créer un nouveau cas**.
4. Vérifie les destinations et confirme l’association.

Le dialogue montre seulement le passage et les destinations possibles, pas tout
le gestionnaire des cas. Après l’ajout, tu restes dans l’entretien avec ta sélection.
La confirmation propose **Ouvrir le cas…** pour chaque destination ; ce choix est
facultatif. Après consultation, **Revenir au passage…** retrouve le travail de départ.
Échap annule sans créer de repère si aucun ajout n’a été confirmé.
Après un échec, tu peux fermer puis reprendre la tentative avec le même repère,
ou choisir explicitement **Abandonner la tentative**.

Le passage n’a pas besoin d’être codé ou commenté. Un simple clic sur une annotation
sans sélection libre ne remplace pas cette sélection.

Tu peux compléter aussi bien un cas manuel qu’un cas créé depuis des personnes ou des entretiens.
Un nom de cas déjà utilisé est signalé ; l’interface propose alors d’associer le
passage au cas existant plutôt que de créer un doublon.

Après avoir sélectionné un passage, déplie **Associations du passage** au-dessus
de la transcription pour retrouver ses cas. Le résumé indique si le lien vient
d’un ajout manuel, d’une règle automatique ou des deux. Cliquer le nom ouvre le
cas et conserve un retour vers la sélection.

### Exemple : les paroles de Marie et les passages sur Marie

Le cas Marie peut contenir :

- ses propres interventions, ajoutées par la **règle de personne** ;
- un passage où Paul parle de Marie, ajouté **manuellement**.

Le second passage appartient au dossier Marie, mais reste une parole de Paul.
Le cas devient enrichi ou « mixte », sans changer de nature ni devoir être converti.

### Relire et modifier la fiche

La fiche permet de modifier le nom et le mémo, de consulter les passages regroupés
par entretien et de choisir **Voir dans l’entretien** pour retrouver le contexte.
**Revenir au cas…** retrouve ensuite le cas choisi, ses filtres et sa position de lecture.
Choisir librement un autre espace ou un autre objet du répertoire termine cette
chaîne de consultation.
La provenance distingue **Ajout manuel**, **Règle de personne**, **Règle d’entretien entier** et **Règle de modalité**.
Le mode du cas est indiqué : **Manuel** ou **Avec règle**. Déplie **Critères automatiques**
pour voir les membres de la règle et les filtres d’enquêteurs. La modification directe
de ces critères dans un cas existant n’est pas encore proposée.

Le choix **Matériaux affichés** propose :

- **Tous les matériaux** : contributions automatiques et ajouts manuels ;
- **Passages issus des règles** : uniquement les contributions automatiques ;
- **Ajouts manuels** : uniquement les passages associés explicitement.

Les compteurs et diagnostics suivent la vue choisie. Un avertissement signale les
problèmes présents dans les autres matériaux ; un filtre ne les efface pas.
Ce choix de lecture ne modifie pas le cas et revient à Tous les matériaux quand tu
ouvres un autre cas. Deux entretiens portant le même titre restent présentés séparément.

Le mode **Pseudonymisé** est proposé par défaut ; **Original** affiche les textes
et noms originaux. Le nom et le mémo du cas ne sont pas automatiquement pseudonymisés.
Les pseudonymes doivent avoir été préparés : un affichage pseudonymisé ne garantit
pas à lui seul l’absence d’informations identifiantes.

Un avertissement signale les chevauchements. Le volume textuel ne compte chaque zone
qu’une fois, même si elle apparaît par plusieurs rattachements. Le compteur de mots
n’est pas un compteur de mots de vocabulaire différents.

### Retirer un passage ou supprimer un cas

**Retirer du cas** retire un ajout manuel, pas le texte de l’entretien.
Si ce même passage est toujours retenu par la règle, il reste présent à ce titre.
Les passages automatiques ne proposent pas de retrait individuel.

**Supprimer** efface le cas après confirmation, pas les personnes, entretiens ou codages.
Un cas devenu vide reste consultable, comme un cas créé volontairement vide.
Supprimer un entretien avertit aussi des cas qui le référencent entièrement ; leurs règles
restent conservées et signalent ensuite la source retirée.

Une personne utilisée dans une règle ne peut pas être supprimée sans traiter ses cas.
Réunir deux personnes redirige leurs règles vers l’identité conservée. Si l’une des règles
incluait les enquêteurs, leur réunion conserve cette inclusion. Séparer une personne
n’ajoute pas automatiquement la nouvelle identité à ses anciens cas.

### Comprendre les avertissements

| Situation | Signification et action |
| --- | --- |
| Repère orphelin | Le texte couvert a disparu ou la transcription a été remplacée ; vérifier la source |
| Repère introuvable | Le passage référencé ne peut plus être retrouvé ; examiner l’entretien |
| Source indisponible ou invalide | Le résultat peut être incomplet ; ne pas conclure que le cas est vide |
| Entretien retiré du corpus | La règle d’entretien entier est conservée, mais ne peut plus lire cette source |
| Personne introuvable | Une règle référence une identité absente ; vérifier les associations du corpus |
| Chevauchements | Des contributions couvrent la même zone ; le volume total évite le double comptage |

Dans un corpus distant, une association nécessite l’enregistrement du passage puis
sa publication et celle du rattachement. Si l’interface indique que le repère est
conservé mais que l’association reste à terminer, utilise **Réessayer l’association**.
Le passage n’est pas confirmé dans le cas tant que l’opération n’a pas abouti.
Les actions d’édition peuvent être désactivées en lecture seule.

### Créer une famille depuis une variable

1. Dans **Cas → Nouveau cas**, choisis **Variable de locuteur** ou **Variable d’entretien**.
2. Choisis la variable par sa portée, puis le nom de famille proposé ou un autre nom.
3. Pour les locuteurs, indique explicitement si les enquêteurs doivent être inclus.
4. Clique sur **Prévisualiser la famille**. Chaque modalité déclarée apparaît avec ses membres
   observés, passages et sources. Les valeurs absentes sont comptées hors regroupement :
   aucun cas « Inconnu » n’est inventé.
5. Les modalités observées sont cochées. Une modalité non observée doit être cochée
   volontairement pour créer son cas, même vide. Un membre sans paroles compte comme observé.
6. Vérifie les noms et mémos. Les noms de cas doivent être uniques dans tout le corpus.
   Clique sur **Créer la famille**. Annuler avant confirmation n’enregistre rien.

```text
Famille Établissement
  ├── Cas A
  ├── Cas B
  └── Cas C (si observé ou choisi explicitement)
```

La famille organise les cas : ce n’est pas un quatrième cas contenant tous les textes.
Tu peux créer volontairement plusieurs familles depuis la même variable, avec des noms
familiaux distincts. L’aperçu signale les familles déjà existantes ; les cas restent indépendants.

Pour une **variable de locuteur**, seules les interventions portant localement la modalité
sont retenues, même si le locuteur n’est lié à aucune personne du registre. Une même personne
peut contribuer à A dans un entretien, puis à B dans un autre. Les questions des enquêteurs
exclus, les autres participants et les paroles sans locuteur ne sont pas ajoutés par voisinage.
Pour une **variable d’entretien**, le cas réunit les sources entières portant la modalité,
y compris questions, passages sans locuteur et futurs ajouts au texte.

Un aperçu illisible ou incomplet ne prouve jamais qu’un cas est vide. Tu peux enregistrer
sa règle, mais pas considérer les compteurs comme une garantie de lecture complète.
Les ajouts manuels et les trois vues de matériaux fonctionnent comme pour les autres cas ;
ils ne modifient pas les membres observés par la règle.

### Compléter ou dissoudre une famille

Le filtre **Famille** du répertoire affiche ses cas et sa fiche. Une nouvelle modalité
ne crée aucun cas pendant la lecture. Choisis **Compléter la famille**, puis
**Prévisualiser la famille** pour sélectionner explicitement les nouvelles modalités voulues.
Les modalités déjà présentes sont désactivées : pas de doublon dans une même famille.
Le filtre de rôle de la famille reste conservé.

Après une réponse non confirmée, **Réessayer la famille** reprend exactement les mêmes
identités. **Abandonner la tentative** ne supprime pas ce qui aurait déjà été enregistré.
Une modification concurrente peut imposer de refaire l’aperçu ; aucun lot partiel n’est ajouté.
Changer de corpus abandonne les tentatives du corpus précédent.

**Dissoudre la famille** demande confirmation. Seule l’organisation disparaît : les cas,
noms, mémos, règles et ajouts manuels restent intacts. Une famille dont tous les cas ont été
supprimés reste visible jusqu’à sa dissolution.

Renommer une variable ou une modalité ne renomme pas les cas. Les règles continuent de
suivre les mêmes identifiants. Une variable ou modalité utilisée par des cas ne peut pas
être supprimée sans traiter ces usages ; une famille protège aussi sa variable de regroupement.
Dissoudre ne retire pas les règles des cas : elles continuent donc de protéger leurs variables.

## 2. Attributs saisis ou dérivés

Un attribut décrit un cas. Deux origines sont distinguées :

- **Saisi** : tu renseignes directement une propriété, par exemple le statut de suivi du dossier.
- **Dérivé** : SonalPi utilise une variable des membres sélectionnés par la règle.

### Définir et saisir un attribut

Dans l’onglet **Cas**, choisis **Attributs** pour ouvrir le registre partagé du corpus.
Tu peux y créer un attribut de texte libre ou un attribut avec modalités, le renommer,
modifier son domaine de saisie et le déclarer **privé**. Une modalité encore utilisée
ne peut pas être retirée. Une définition encore liée à une valeur ou à une recette
ne peut pas être supprimée avant traitement de ces usages.

Ouvre ensuite un cas et déplie **Saisir un attribut**. Choisis sa définition et sa valeur.
Les cas manuels, y compris vides, peuvent recevoir des valeurs saisies. Une valeur saisie
et une recette ne peuvent pas occuper le même attribut sur le même cas.

### Dériver depuis une règle ou une famille

Pour un cas avec règle qui n’appartient pas à une famille, déplie
**Dériver un attribut des membres de la règle**. Pour une famille, utilise le filtre
**Famille**, puis **Attributs de la famille** et **Ajouter un attribut à la famille**.
L’aperçu détaille chaque cas avant l’enregistrement.

Exemple : les locuteurs portent les variables **Établissement** et
**Taille de l’établissement**. Tu crées les cas A/B/C depuis Établissement, puis choisis
Taille comme attribut dérivé. Les deux variables doivent avoir la **même portée** : ici,
celle du locuteur. Les dérivations entre portée entretien et portée locuteur ne sont
pas proposées.

Le logiciel vérifie les valeurs sur l’ensemble des membres et entretiens concernés :

- aucune valeur connue : attribut absent ;
- une valeur connue, même avec des données manquantes : disponible, avec avertissement ;
- plusieurs valeurs contradictoires pour A : attribut suspendu pour **toute la famille A/B/C** ;
- source illisible ou référence invalide : cohérence non vérifiable, sans valeur certifiée.

La fiche conserve les observations locales pour expliquer le diagnostic. Une valeur
localement cohérente de B n’est plus affichée comme disponible tant que le conflit de A
suspend la recette familiale. Après correction des données et **Actualiser**, les valeurs
sont recalculées sans perdre les cas, règles ou passages.

Avoir une taille différente pour A et B est normal : le problème est d’avoir plusieurs
tailles pour le même établissement sur le périmètre choisi. Une variation peut aussi
être légitime, comme un âge qui change ; elle ne fournit simplement pas une valeur unique
non datée.

**Les ajouts manuels ne modifient pas les attributs dérivés.** Ajouter au cas A un passage
d’un locuteur de B n’introduit ni la taille de B ni ses données manquantes dans le calcul.
Une variable privée propose un nouvel attribut privé par défaut. Vérifie malgré tout les
noms de cas et de familles : ils peuvent eux-mêmes révéler une information sensible.

Une famille portant une recette ne peut pas être dissoute avant retrait explicite de ses
recettes. Dans un corpus distant, les sources de contrôle sont relues sous verrou lors de
l’ajout d’une recette ; une modification concurrente impose de refaire l’aperçu.

## 3. Export vers QualCoder

Depuis **Organiser et exporter → Exporter le corpus**, choisis les entretiens,
**Projet QualCoder (.qda)** et les cas à inclure dans le panneau de gauche.
Vérifie le récapitulatif à droite, puis lance l’export et choisis sa destination.
Le dossier produit s’ouvre comme un projet
QualCoder et contient les transcriptions complètes, les passages des cas et les
attributs disponibles. Les ajouts manuels font partie des matériaux exportés.

Les règles SonalPi ne deviennent pas des règles dynamiques dans QualCoder : le projet
reçoit une photographie des matériaux au moment de l’export. Les familles sont
conservées comme organisation de cas ; les noms et mémos sont visibles. Cette première
version utilise le texte source : la pseudonymisation et le rapport détaillé des pertes
restent à valider avant de partager un projet. L’audio et sa synchronisation sont
différés.

## Pour aller plus loin

- [Vue Corpus : personnes et données](vue-corpus.md)
- [Travail en corpus distant](corpus-distant.md)
- [Documentation technique des cas](../dev/cas.md)
