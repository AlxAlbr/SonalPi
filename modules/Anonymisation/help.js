////////////////////////////////////////////////////////////////////////
// GESTION DU SYSTEME D'AIDE POUR L'ANONYMISATION
////////////////////////////////////////////////////////////////////////

/**
 * Ouvre la fenêtre modale d'aide pour l'anonymisation
 */
function ouvrirAideAnonymisation() {
    const aideHtml = `
        <div id="aide-anonymisation-overlay" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        ">
            <div style="
                background: white;
                border-radius: 8px;
                padding: 30px;
                max-width: 700px;
                max-height: 85vh;
                overflow-y: auto;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
                font-family: Arial, sans-serif;
            ">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="margin: 0; color: #333;">📖 Guide d'Anonymisation</h2>
                    <button onclick="fermerAideAnonymisation()" style="
                        background: none;
                        border: none;
                        font-size: 24px;
                        cursor: pointer;
                        color: #999;
                    ">✕</button>
                </div>

                <div style="color: #555; line-height: 1.6;">
                    <h3 style="color: #2196F3; margin-top: 0;">1️⃣ Ajouter une entité à anonymiser</h3>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li>Sélectionnez un mot ou un ensemble de mots contigus (avec la souris, cliquez et faites glisser, puis relâchez)</li>
                        <li>L'entité apparaît en jaune dans le texte et automatiquement sur la dernière ligne vide du tableau dans la colonne "Nom"</li>
                    </ul>

                    <h3 style="color: #2196F3;">2️⃣ Remplir les champs d'anonymisation</h3>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li><strong>Nom</strong> : Le texte à anonymiser (rempli automatiquement ou vous pouvez le faire manuellement)</li>
                        <li><strong>Entité de remplacement</strong> : Le texte qui remplacera l'entité initiale. A vous de le remplir</li>
                        <li>Une fois l'entité de remplacement choisi, appuyez sur <strong>Entrée</strong> pour valider et appliquer l'anonymisation</li>
                        <li>Attention, toutes les occurences de l'entité initiale seront touchées. Si vous voulez exclure certaines, utilisez les exceptions</li>
                    </ul>

                    <h3 style="color: #2196F3;">3️⃣ Marquer une occurrence comme exception</h3>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li>Cliquez sur un mot anonymisé dans le texte</li>
                        <li>Sélectionnez <strong>« ⊘ Ajouter une exception »</strong> dans le menu</li>
                        <li>Le mot restera visible et ne sera pas anonymisé</li>
                        <li>Le compteur d'exceptions « X except » s'affiche dans le tableau</li>
                        <li>Vous pouvez annuler une exception en cliquant à nouveau sur le mot et en sélectionnant « Supprimer l'exception »</li>
                    </ul>

                    <h3 style="color: #2196F3;">4️⃣ Bouton d'action à la fin du tableau</h3>
                    <div style="background: #f5f5f5; padding: 15px; border-radius: 4px; margin: 10px 0;">
                        <p><strong>Appliquer</strong><br>
                        Valide automatiquement toutes les lignes où vous avez rempli l'entité initiale et la replacement, mais sans appuyer sur Entrée.</p>
                    </div>

                    <h3 style="color: #2196F3;">5️⃣ Export et import de table de correspondance</h3>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li>En haut à droite du tableau, l'icône avec une disquette vous permet d'exporter la table de correspondance en format json</li>
                        <li>A côté de l'icône avec la disquette, l'icône sous la forme un dossier vous permet d'importer un ou plusieurs tables de correspondance au format json. Cela permet de maintenir une cohérence dans la pseudonymisation ou l'anonymisation sur plusieurs fichiers</li>
                    </ul>

                    <h3 style="color: #2196F3;">5️⃣ Gestion des conflits lors de l'import</h3>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li>Si une entité est déjà anonymisée, vous pouvez choisir de garder l'existant ou d'utiliser l'import</li>
                        <li>Si plusieurs fichiers ont des pseudos différents pour la même entité, sélectionnez le pseudo à utiliser</li>
                        <li>Vous pouvez aussi choisir de <strong>ne pas anonymiser</strong> avec l'option « ⊘ Pas d'anonymisation »</li>
                    </ul>

                    <h3 style="color: #2196F3;">6️⃣ Éditer une ligne déjà validée</h3>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li>Cliquez sur le bouton <strong>✏️ Éditer</strong> dans la colonne Actions</li>
                        <li>L'anonymisation est retirée du texte et les champs deviennent éditables</li>
                        <li>Vous pouvez modifier les valeurs et appuyer de nouveau sur Entrée</li>
                    </ul>

                    <h3 style="color: #2196F3;">7️⃣ Supprimer une ligne</h3>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li>Cliquez sur le bouton <strong>🗑️ Supprimer</strong></li>
                        <li>L'anonymisation est retirée du texte et la ligne disparaît du tableau</li>
                    </ul>

                    <h3 style="color: #2196F3;">💡 Conseils</h3>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li>Gardez l'historique de vos exports pour pouvoir les réutiliser sur d'autres textes ou pour avoir une cohérence sur un corpus</li>
                        <li>Si vous voulez anonymiser/pseudonymiser une entité de manière différente. Par exemple, si vous avez deux Dupond dans votre texte, 
                        vous pouvez leur attribuer des noms fictifs différents déjà dans le texte. ce qui vous permettra de gérer ensuite des pseudonymes distincts</li>
                    </ul>
                </div>

                <div style="margin-top: 20px; text-align: right;">
                    <button onclick="fermerAideAnonymisation()" style="
                        padding: 8px 16px;
                        background-color: #2196F3;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-weight: bold;
                    ">Fermer</button>
                </div>
            </div>
        </div>
    `;

    // Créer le conteneur et l'ajouter au DOM
    const overlayContainer = document.createElement('div');
    overlayContainer.innerHTML = aideHtml;
    document.body.appendChild(overlayContainer);
}

/**
 * Ferme la fenêtre modale d'aide
 */
function fermerAideAnonymisation() {
    const overlay = document.getElementById('aide-anonymisation-overlay');
    if (overlay) {
        overlay.parentElement.remove();
    }
}
