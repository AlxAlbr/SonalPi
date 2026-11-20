# Locuteurs selon le fournisseur

## État du raccord

Le modèle natif et les mutations métier sont communs. Les services métier et
journaux des thématiques ne sont pas utilisés pour publier les corrections des
locuteurs.

| Parcours | Local | GitLab | WebDAV / Nextcloud |
|---|---|---|---|
| Liste, interventions, statistiques et détails | Disponible. | Vue commune, parcours Electron réel vérifié. | Vue commune raccordée ; qualification de l’interface sur banc réel encore à faire. |
| Corrections depuis le corpus | Disponible. | Nouveau parcours sous commit gardé, éditions fermées. | Indisponible ; aucune ancienne commande réactivée. |
| Création au nommage et corrections globales depuis l’entretien ouvert | Disponible. | Nouveau raccord non réalisé. | Nouveau raccord non réalisé. |

Le nettoyage final des noms et le retrait des composants historiques restent à
faire. `PersonnesCorpus.vue` n’est plus affiché par la vue commune, mais n’est pas
encore supprimé avec ses anciens appelants et commandes.

## Consultation et aperçu sont distincts

La consultation utilise la copie du contexte courant. L’interface le signale et
indique la dernière synchronisation connue. Le bouton Actualiser déclenche le
tirage distant habituel ; un échec laisse le dernier résultat accompagné d’un
avertissement, sans le présenter comme une lecture serveur réussie.

`detailsLocuteursInventaire(false)` lit en une seule requête l’inventaire, les
variables et les catégories de notes. Les notes sont contextualisées par entretien
et id de participation ; des ids locaux identiques ne mélangent pas leurs notes.
Cette lecture n’acquiert pas de droit d’édition et ne modifie pas les sources.

Pour préparer une correction, `detailsLocuteursInventaire(true)` emprunte le
lecteur du fournisseur : GitLab résout un SHA et lit tous les membres à cet
instantané. Une source invalide ou manquante bloque l’aperçu ; aucun miroir de
secours ne le rend artificiellement complet.

## Corrections GitLab depuis le corpus

Le nouveau canal `corpus:corrigerLocuteurs` valide strictement les commandes et
contrôle leur geste précis. La capacité `correctionsLocuteurs` est distincte de
l’ancien drapeau `locuteurs`. `personnes.commande` reste refusé en distant.

Le contexte refuse les éditions locales protégées et les copies récupérables.
La transaction acquiert le droit corpus puis ceux de tous les membres dans un
ordre stable. Les modifications d’autres postes restent protégées par leurs
droits et par les gardes des fichiers ; une session n’est pas publiée pour faire
passer la correction.

`preparerCorrectionLocuteurs()` applique le métier existant à des copies des seules
sources serveur fournies. L’inventaire doit être complet et correspondre à la
confirmation. Les entretiens réellement modifiés portent leur nouvelle date ;
texte, codages, notes et champs étrangers à la commande restent inchangés.

Un seul commit porte les modifications et les gardes des membres inchangés, ainsi
que les droits. La borne actuelle est de 124 entretiens lorsque tous doivent être
réservés : le dépassement est refusé, pas transformé en lot partiel. Les limites
d’octets du publieur restent également applicables.

Le miroir n’est installé qu’après confirmation. Le journal de publication général
conserve les réponses inconnues. Les opérations préfixées `locuteurs-` sont
réconciliées avant le tirage suivant, sans renvoi du commit. Une issue encore
inconnue interdit une nouvelle correction. Aucun journal thématique n’est employé
et aucune annulation globale n’est promise.

## Qualification acquise et suite

Les tests ciblés couvrent la préparation sans mutation, les sources manquantes ou
périmées, les conflits de baux et de versions, les références des cas et des tiers,
les limites du commit, la réponse perdue et sa reconnaissance sans rejeu.

Deux scénarios de backend GitLab réel vérifient le refus d’une édition tierce,
le renommage après fermeture, l’aperçu périmé, la réunion et la suppression d’une
identité réellement vide. Un scénario Electron OAuth vérifie l’interface commune,
les notes contextualisées, le renommage depuis la sélection, les fichiers publiés
et le refus de l’ancienne commande par appel direct.

Onze scénarios Electron locaux de sélection, détails et renommage depuis
l’entretien passent également. Typage de l’application et des tests ciblés, ainsi
que build, sont validés. Il ne s’agit pas d’une qualification complète des lots
restants ni d’une validation des écritures Nextcloud.

La suite concerne le protocole WebDAV de correction et de reprise, les opérations
depuis une session d’entretien ouverte et le nettoyage final de nomenclature.
