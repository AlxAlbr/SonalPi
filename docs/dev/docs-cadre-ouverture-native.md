# Choix natif d'une autre application — étude séparée

## Décision actuelle

Ne pas livrer de bouton **Ouvrir avec…**. **Ouvrir** utilise l'association du système ;
**Afficher dans le dossier** donne accès au menu natif du gestionnaire de fichiers.
Ce parcours fonctionne sans choix d'exécutable ni préférence d'application dans SonalPi.

Electron expose [`shell.openPath` et `shell.showItemInFolder`](https://www.electronjs.org/docs/latest/api/shell),
mais pas de sélecteur d'application multiplateforme. Aucune commande shell ni association
personnalisée n'est ajoutée au produit.

## Pistes pour un prototype isolé

| Plateforme | Piste | Condition avant intégration |
| --- | --- | --- |
| Windows | API native `SHOpenWithDialog`, via un composant natif isolé | Vérifier SDK, ABI Electron, architectures, signature et retour d'annulation. Ne pas utiliser une commande `rundll32` non documentée. |
| macOS | Sélection native d'un paquet `.app`, puis `/usr/bin/open -a <application> <document>` | Vérifier filtre des paquets, applications déplacées, restrictions d'un paquet signé et retour d'erreur. |
| Linux | Portail XDG OpenURI/OpenFile avec demande de choix | Vérifier l'option de choix, le passage du fichier par descripteur, GNOME, KDE, présence du portail et applications Flatpak/Snap. Ne pas supposer que `xdg-open` ouvre un sélecteur. |

Références pour l'expérimentation :

- [Windows : SHOpenWithDialog](https://learn.microsoft.com/en-us/windows/win32/api/shlobj_core/nf-shlobj_core-shopenwithdialog) ;
- macOS : manuel système `man open` sur le poste de test ;
- [Portail XDG OpenURI](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.OpenURI.html).

Un prototype devra rester hors du pont de production et de l'interface principale.
Il ne recevra qu'une cible locale déjà validée, lancera les programmes directement avec
`shell: false`, ne mémorisera aucune application par extension et ne modifiera pas les
fichiers. Une annulation sera silencieuse ; un échec sera traduit en message courant.
Le dossier lui-même ne sera pas ouvert avec une application arbitraire.

## Validation restante

L'environnement de développement de ce chantier est Linux. Aucun résultat natif Windows,
macOS ou de paquet signé sur ces plateformes n'est revendiqué. Les essais du portail et
des bureaux Linux, notamment avec Flatpak et Snap, restent également à effectuer : lancer
l'application par défaut ne prouve pas qu'un sélecteur natif fonctionne.

Avant toute décision de livraison, exécuter sur chaque plateforme : choix puis annulation,
nom avec espaces et accents, application absente, document disparu, associations manquantes,
poste sans service de sélection, paquet installé et signé. Vérifier aussi qu'aucune ouverture
externe ne transmet de chemin absolu au renderer.

Si l'expérience est satisfaisante partout, proposer un bouton commun. Si seules certaines
plateformes sont fiables, évaluer un bouton conditionnel compréhensible. Sinon, conserver
**Afficher dans le dossier**. Le lot exploratoire reste donc ouvert, sans bouton ni prototype
natif prétendument validé dans cette livraison.
