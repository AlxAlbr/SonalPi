// ----------------------------------------------------------------
// EXPORT D'UN RECUEIL - Formats TXT, MD, DOCX, PDF
// ----------------------------------------------------------------

// Lance la boîte de dialogue d'export (identique en style à exportSynthese)
function exportRecueil(recueil) {
    if (!recueil) return;

    let element = document.getElementById('dlg');
    element.style.display = "block";

    let contenu = document.getElementById('ssdlg');
    contenu.style.top = "20%";
    contenu.style.height = "";

    contenu.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <img src="img/logoSonal.png" alt="" style="height:36px; width:auto;">
            <div class="close" onclick="hidedlg()">✖️</div>
        </div>
        <h3 style="margin-top:0;margin-bottom:18px;">Choisissez un format d'export</h3>
        <div class="menudrlnt">
            <div class="lblmnuxprt" onclick="exportRecueilFormat('txt')"><label class="lblformat">.txt</label> <span class="lbldetails">Texte brut</span></div>
            <div class="lblmnuxprt" onclick="exportRecueilFormat('md')"><label class="lblformat">.md</label> <span class="lbldetails">Markdown</span></div>
            <div class="lblmnuxprt" onclick="exportRecueilFormat('docx')"><label class="lblformat">.docx</label> <span class="lbldetails">Traitement de texte (Word)</span></div>
            <div class="lblmnuxprt" onclick="exportRecueilFormat('pdf')"><label class="lblformat">.pdf</label> <span class="lbldetails">Document PDF</span></div>
        </div>`;
}

// Dispatch vers le bon générateur
async function exportRecueilFormat(format) {
    const inclureCommentaires = true;
    const recueil = _recueilCourant;

    hidedlg();

    if (!recueil || !recueil.items || recueil.items.length === 0) {
        afficherNotification("Aucun item à exporter dans ce recueil.", "warning");
        return;
    }

    const nomBase = (recueil.nom || 'Recueil').replace(/[/\\?%*:|"<>]/g, '-');
    const nomFichier = nomBase + '_' + new Date().toISOString().split('T')[0] + '.' + format;

    if (format === 'txt') {
        const contenu = genererExportTxtRecueil(recueil, inclureCommentaires);
        SauvegarderSurDisque(contenu, nomFichier, 'UTF-8');
    } else if (format === 'md') {
        const contenu = genererExportMdRecueil(recueil, inclureCommentaires);
        SauvegarderSurDisque(contenu, nomFichier, 'UTF-8');
    } else if (format === 'docx') {
        await genererExportDocxRecueil(recueil, nomFichier, inclureCommentaires);
    } else if (format === 'pdf') {
        await genererExportPdfRecueil(recueil, nomFichier, inclureCommentaires);
    }
}

// ----------------------------------------------------------------
// Génération TXT
// ----------------------------------------------------------------
function genererExportTxtRecueil(recueil, inclureCommentaires = true) {
    const nom = recueil.nom || 'Recueil';
    let txt = nom.toUpperCase() + '\n';
    txt += '='.repeat(70) + '\n';
    txt += 'Exporté par Sonal π (version ' + (window.versionSonal || '') + ') le ' + new Date().toLocaleString() + '\n';
    txt += '='.repeat(70) + '\n\n';

    for (const item of recueil.items) {
        if (item.type === 'titre') {
            const niv = item.niveau || 1;
            const libelle = item.libelle || '';
            if (niv === 1) {
                txt += '\n' + libelle.toUpperCase() + '\n' + '='.repeat(Math.min(libelle.length + 4, 70)) + '\n\n';
            } else if (niv === 2) {
                txt += '\n' + libelle + '\n' + '-'.repeat(Math.min(libelle.length + 4, 70)) + '\n\n';
            } else {
                txt += '\n  ▸ ' + libelle + '\n\n';
            }
        } else if (item.type === 'extrait') {
            const texte = (item.texte || '').trim();
            if (texte) {
                txt += texte.split('\n').map(l => '  > ' + l).join('\n') + '\n';
            }
            if (inclureCommentaires && item.commentaire && item.commentaire.trim()) {
                txt += '  [' + item.commentaire.trim() + ']\n';
            }
            txt += '\n';
        } else if (item.type === 'texte') {
            const texte = (item.texte || '').trim();
            if (texte) txt += texte + '\n\n';
        }
    }

    return txt;
}

// ----------------------------------------------------------------
// Génération Markdown
// ----------------------------------------------------------------
function genererExportMdRecueil(recueil, inclureCommentaires = true) {
    const nom = recueil.nom || 'Recueil';
    let md = '# ' + nom + '\n\n';
    md += '*Exporté par Sonal π (version ' + (window.versionSonal || '') + ') le ' + new Date().toLocaleString() + '*\n\n';
    md += '---\n\n';

    for (const item of recueil.items) {
        if (item.type === 'titre') {
            const niv = item.niveau || 1;
            // niveau 1 → ## (H2), niveau 2 → ###, niveau 3 → ####
            const prefix = '#'.repeat(niv + 1);
            md += prefix + ' ' + (item.libelle || '') + '\n\n';
        } else if (item.type === 'extrait') {
            const texte = (item.texte || '').trim();
            if (texte) {
                md += texte.split('\n').map(l => '> ' + l).join('\n') + '\n';
            }
            if (inclureCommentaires && item.commentaire && item.commentaire.trim()) {
                md += '>\n> *' + item.commentaire.trim() + '*\n';
            }
            md += '\n';
        } else if (item.type === 'texte') {
            const texte = (item.texte || '').trim();
            if (texte) md += texte + '\n\n';
        }
    }

    return md;
}

// ----------------------------------------------------------------
// Export DOCX (via IPC vers main.js)
// ----------------------------------------------------------------
async function genererExportDocxRecueil(recueil, nomFichier, inclureCommentaires = true) {
    try {
        const donnees = {
            nom: recueil.nom || 'Recueil',
            items: recueil.items,
            nomFichier,
            opts: { inclureCommentaires }
        };

        const result = await window.electronAPI.exportRecueilDocx(donnees);
        if (result.success) {
            afficherNotification("Recueil exporté en DOCX : " + nomFichier, "success");
        } else if (!result.canceled) {
            afficherNotification("Erreur lors de l'export DOCX : " + (result.error || ''), "error");
        }
    } catch (error) {
        console.error("Erreur export DOCX recueil :", error);
        afficherNotification("Erreur lors de l'export DOCX", "error");
    }
}

// ----------------------------------------------------------------
// Export PDF (via IPC vers main.js)
// ----------------------------------------------------------------
async function genererExportPdfRecueil(recueil, nomFichier, inclureCommentaires = true) {
    try {
        const donnees = {
            nom: recueil.nom || 'Recueil',
            items: recueil.items,
            nomFichier,
            opts: { inclureCommentaires }
        };

        const result = await window.electronAPI.exportRecueilPdf(donnees);
        if (result.success) {
            afficherNotification("Recueil exporté en PDF : " + nomFichier, "success");
        } else if (!result.canceled) {
            afficherNotification("Erreur lors de l'export PDF : " + (result.error || ''), "error");
        }
    } catch (error) {
        console.error("Erreur export PDF recueil :", error);
        afficherNotification("Erreur lors de l'export PDF", "error");
    }
}
