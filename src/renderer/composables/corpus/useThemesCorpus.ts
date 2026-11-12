import { ref } from 'vue'
import { ordreThemes } from '../../../shared/corpus'
import type { Categorie, PatchCategorie, SegmentThematique } from '../../../shared/format'
import { couleurPourCode, couleurHexPourCode } from '../../editor/decorations'

/** Gère les thèmes du corpus et leurs projections. */
export function useThemesCorpus(opts: { flush: () => Promise<void> }) {
  const codebook = ref<Categorie[]>([])
  const codeCourant = ref('')
  const usages = ref<Record<string, number>>({})
  const resumes = ref<Record<string, SegmentThematique[]>>({})
  const messageTheme = ref<string | null>(null)

  function couleurTrait(code: string): string {
    const categorie = codebook.value.find((item) => item.id === code)
    return categorie?.couleur || couleurPourCode(categorie?.codeExport ?? code).trait
  }

  function couleurHex(categorie: Categorie): string {
    return categorie.couleur || couleurHexPourCode(categorie.codeExport)
  }

  function tailleTheme(code: string): number | undefined {
    return codebook.value.find((categorie) => categorie.id === code)?.taille
  }

  function estCodeActif(code: string): boolean {
    return codebook.value.find((categorie) => categorie.id === code)?.actif ?? true
  }

  function peintureSegment(codes: string[]): {
    background?: string
    borderBottom?: string
    masque: boolean
  } {
    const actifs = codes.filter((code) => estCodeActif(code))
    const couleurs = actifs
      .map((code) => couleurTrait(code))
      .filter((couleur) => !/^#f{3}(f{3})?$/i.test(couleur) && couleur.toLowerCase() !== 'white')
    const stops = couleurs.flatMap((couleur, index) => [
      `${couleur} ${((index / couleurs.length) * 100).toFixed(2)}%`,
      `${couleur} ${(((index + 1) / couleurs.length) * 100).toFixed(2)}%`,
    ])
    const ponderation = actifs.some((code) => (tailleTheme(code) ?? 0) > 16)
    return {
      background: stops.length ? `linear-gradient(to bottom, ${stops.join(', ')})` : undefined,
      borderBottom: ponderation ? '3px solid #000' : undefined,
      masque: !stops.length && !ponderation,
    }
  }

  function nomTheme(id: string): string {
    return codebook.value.find((categorie) => categorie.id === id)?.nom ?? id
  }

  function arbreThemes() {
    return ordreThemes(Object.fromEntries(codebook.value.map((categorie) => [categorie.id, categorie])))
  }

  function majCodebook(categories: Record<string, Categorie>) {
    codebook.value = Object.values(categories).sort((a, b) => a.ordre - b.ordre)
    if (!codeCourant.value && codebook.value.length > 0) codeCourant.value = codebook.value[0].id
  }

  function reinitialiser() {
    codebook.value = []
    codeCourant.value = ''
    usages.value = {}
    resumes.value = {}
    messageTheme.value = null
  }

  async function rafraichirUsages() {
    usages.value = await window.sonal.corpus.usagesParCategorie()
    resumes.value = await window.sonal.corpus.resumesThematiques()
  }

  async function ajouterTheme(): Promise<string> {
    const resultat = await window.sonal.corpus.ajouterCategorie('Nouveau thème')
    majCodebook(resultat.corpus.codebook)
    codeCourant.value = resultat.id
    return resultat.id
  }

  async function ajouterSousTheme(parentId: string): Promise<string> {
    const resultat = await window.sonal.corpus.ajouterCategorie('Nouveau sous-thème', parentId)
    majCodebook(resultat.corpus.codebook)
    codeCourant.value = resultat.id
    return resultat.id
  }

  async function modifierTheme(id: string, patch: PatchCategorie) {
    const corpus = await window.sonal.corpus.modifierCategorie(id, patch)
    majCodebook(corpus.codebook)
  }

  async function deplacerTheme(id: string, sens: -1 | 1) {
    const corpus = await window.sonal.corpus.deplacerCategorie(id, sens)
    majCodebook(corpus.codebook)
  }

  async function migrerTheme(id: string, parentId: string | null) {
    const corpus = await window.sonal.corpus.migrerCategorie(id, parentId)
    majCodebook(corpus.codebook)
  }

  return {
    codebook,
    codeCourant,
    usages,
    resumes,
    messageTheme,
    couleurTrait,
    couleurHex,
    tailleTheme,
    estCodeActif,
    peintureSegment,
    nomTheme,
    arbreThemes,
    majCodebook,
    reinitialiser,
    rafraichirUsages,
    ajouterTheme,
    ajouterSousTheme,
    modifierTheme,
    deplacerTheme,
    migrerTheme,
  }
}
