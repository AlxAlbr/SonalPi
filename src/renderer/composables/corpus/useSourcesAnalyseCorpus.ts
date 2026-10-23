import { ref, type Ref } from 'vue'
import type { EntretienFichier, EntretienRef } from '../../../shared/format'
import {
  preparerSourcesPassages,
  type SourcePassageChargee,
  type SourcePassagePreparee,
} from '../../editor/passages'

/** Partage les lectures et le parse des transcriptions pendant une session de corpus. */
export function useSourcesAnalyseCorpus(deps: {
  membership: Ref<Record<string, EntretienRef>>
  ouvertId: Ref<string | null>
  sourceOuverte: () => EntretienFichier | null
}) {
  const cache = new Map<string, { version: string; source: SourcePassagePreparee; origine: 'memoire' | 'lecture' }>()
  const progressionSourcesAnalyse = ref({ faits: 0, total: 0 })
  const chargementSourcesAnalyse = ref(false)
  const revisionsLocales = new Map<string, number>()

  function version(id: string): string {
    return `${deps.membership.value[id]?.lastModified ?? ''}:${revisionsLocales.get(id) ?? 0}`
  }

  async function lire(id: string): Promise<SourcePassageChargee> {
    if (id === deps.ouvertId.value) {
      const data = deps.sourceOuverte()
      return data ? { ok: true, data } : { ok: false, raison: 'La source ouverte ne peut pas être lue.' }
    }
    try {
      const resultat = await window.sonal.corpus.lireEntretien(id)
      return resultat.ok
        ? { ok: true, data: resultat.data }
        : { ok: false, raison: resultat.raison, invalide: resultat.raison === 'version' }
    } catch (erreur) {
      return { ok: false, raison: erreur instanceof Error ? erreur.message : String(erreur) }
    }
  }

  async function chargerSourcesAnalyse(ids: string[]): Promise<Map<string, SourcePassagePreparee>> {
    const uniques = [...new Set(ids)].filter((id) => Boolean(deps.membership.value[id]))
    progressionSourcesAnalyse.value = { faits: 0, total: uniques.length }
    chargementSourcesAnalyse.value = true
    const resultat = new Map<string, SourcePassagePreparee>()
    let suivant = 0
    async function travailleur() {
      for (;;) {
        const index = suivant++
        if (index >= uniques.length) return
        const id = uniques[index]
        const versionCourante = version(id)
        const existante = cache.get(id)
        const origine = id === deps.ouvertId.value ? 'memoire' : 'lecture'
        let source = existante?.version === versionCourante
          && (origine === 'lecture' || existante.origine === 'memoire')
          ? existante.source
          : null
        if (!source) {
          const preparee = preparerSourcesPassages(new Map([[id, await lire(id)]]))
          source = preparee.get(id) ?? { ok: false, raison: 'Source indisponible.' }
          if (source.ok) cache.set(id, { version: versionCourante, source, origine })
        }
        resultat.set(id, source)
        progressionSourcesAnalyse.value = { faits: progressionSourcesAnalyse.value.faits + 1, total: uniques.length }
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(4, uniques.length) }, travailleur))
      return resultat
    } finally {
      chargementSourcesAnalyse.value = false
    }
  }

  function invaliderSourceAnalyse(id: string | null): void {
    if (!id) return
    revisionsLocales.set(id, (revisionsLocales.get(id) ?? 0) + 1)
    cache.delete(id)
  }

  function reinitialiserSourcesAnalyse(): void {
    cache.clear()
    revisionsLocales.clear()
    progressionSourcesAnalyse.value = { faits: 0, total: 0 }
    chargementSourcesAnalyse.value = false
  }

  return {
    chargementSourcesAnalyse,
    progressionSourcesAnalyse,
    chargerSourcesAnalyse,
    invaliderSourceAnalyse,
    reinitialiserSourcesAnalyse,
  }
}

export type SourcesAnalyseCorpus = ReturnType<typeof useSourcesAnalyseCorpus>
