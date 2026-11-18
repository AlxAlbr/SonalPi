export function objet(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** Valide les définitions partagées sans changer leur contenu ni leurs propriétaires. */
export function validerBlocsCorpus(v: Record<string, unknown>, porteesVariables: readonly string[]): void {
  for (const cle of ['codebook', 'variables', 'reglesAnon', 'membership']) {
    if (!objet(v[cle])) throw new Error(`Structure de corpus invalide : ${cle}.`)
  }
  if (v.nom !== undefined && typeof v.nom !== 'string') throw new Error('Nom de corpus invalide.')
  for (const [id, ref] of Object.entries(v.membership as Record<string, unknown>)) {
    if (!/^[^\\/:*?"<>|\u0000-\u001f]+$/.test(id) || id === '.' || id === '..'
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(id)
      || !objet(ref) || typeof ref.titre !== 'string'
      || (ref.date !== null && typeof ref.date !== 'string') || typeof ref.lastModified !== 'string') {
      throw new Error('Référence d’entretien invalide dans le corpus.')
    }
  }
  for (const c of Object.values(v.codebook as Record<string, unknown>)) {
    if (!objet(c) || typeof c.id !== 'string' || typeof c.nom !== 'string'
      || typeof c.ordre !== 'number' || typeof c.actif !== 'boolean'
      || (c.parent !== null && typeof c.parent !== 'string') || typeof c.codeExport !== 'string') {
      throw new Error('Définition de thème invalide.')
    }
  }
  for (const c of Object.values(v.variables as Record<string, unknown>)) {
    if (!objet(c) || typeof c.id !== 'string' || typeof c.lib !== 'string'
      || !porteesVariables.includes(c.portee as string)
      || typeof c.priv !== 'boolean' || typeof c.ordre !== 'number' || typeof c.vExport !== 'number'
      || !Array.isArray(c.modalites) || c.modalites.some((m) => !objet(m)
        || typeof m.id !== 'string' || typeof m.lib !== 'string' || typeof m.mExport !== 'number')) {
      throw new Error('Définition de variable invalide.')
    }
  }
  for (const r of Object.values(v.reglesAnon as Record<string, unknown>)) {
    if (!objet(r) || typeof r.id !== 'string' || !Array.isArray(r.entite)
      || !Array.isArray(r.pseudos) || [...r.entite, ...r.pseudos].some((s) => typeof s !== 'string')) {
      throw new Error('Règle d’anonymisation invalide.')
    }
  }
  if (v.categoriesNote != null && (!Array.isArray(v.categoriesNote)
    || v.categoriesNote.some((c) => !objet(c)))) {
    throw new Error('Catégories de note invalides.')
  }
  if (v.paramsAnon != null) {
    const p = v.paramsAnon
    if (!objet(p) || (p.prioriteValidation !== undefined && !['corpus', 'entretien'].includes(p.prioriteValidation as string))) {
      throw new Error('Paramètres d’anonymisation invalides.')
    }
    for (const cle of ['motsLiaison', 'thematiques']) {
      const liste = p[cle]
      if (liste != null && (!objet(liste)
        || (liste.actif !== undefined && typeof liste.actif !== 'boolean')
        || (liste.liste !== undefined && (!Array.isArray(liste.liste) || liste.liste.some((s) => typeof s !== 'string'))))) {
        throw new Error('Liste des paramètres d’anonymisation invalide.')
      }
    }
  }
  if (v.demo != null && (!objet(v.demo) || typeof v.demo.racineSources !== 'string')) {
    throw new Error('Marqueur de démonstration invalide.')
  }
}
