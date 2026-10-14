import { computed, ref, type Ref } from 'vue'
import { importerFichier } from '../../formatSonal/sas'
import type { ResultatImport } from '../../formatSonal/importSonal'
import { urlMediaAudio, urlMediaWaveform, genererEtEcrireWaveform } from '../../audio/waveform'
import { choisirSrtAvantMutation } from '../../couturesApplication'
import { texteDuCorps } from '../../../shared/entretien/entretien'
import { referenceMediaDistant, type EntretienRef, type ReferenceMediaDistant } from '../../../shared/format'
import type { DetailsSelectionCorpus } from './useSelectionCorpus'
import type { MotifLectureMediaDistante } from '../../../shared/distant'

type InventaireMedias = Record<string, { audio: string | null; waveform: string | null }>
type AudiosManquants = Record<string, 'manquant'>

interface SelectionMediaCorpus {
  corpusSelId: Ref<string | null>
  corpusSelMeta: Ref<DetailsSelectionCorpus | null>
  rafraichirMetaSelection: () => Promise<void>
}

interface EntretienMediaCorpus {
  ouvertId: Ref<string | null>
  meta: {
    audioRef: string | null
    audioDistant?: ReferenceMediaDistant | null
  }
  sauver: () => Promise<void>
  reouvrir: (id: string, sessionExistante?: boolean) => Promise<boolean>
}

/** Gère les médias disponibles sur la machine et les transcriptions importées. */
export function useMediasCorpus(deps: {
  membership: Ref<Record<string, EntretienRef>>
  selection: SelectionMediaCorpus
  entretien: EntretienMediaCorpus
  chargerLecteur: (audio: string | null, waveform: string | null) => void
  perimerScanAnon: () => void
  choisirSrt: () => Promise<{ nom: string; contenu: string } | null>
  distantActif: () => boolean
  fournisseurDistant: () => 'webdav' | 'gitlab' | null
  etatBaseMedia: () => 'sans-objet' | 'configuree' | 'non-configuree' | 'secret-indisponible'
  actualiserDistant: (silencieux?: boolean) => Promise<boolean>
}) {
  const audiosCorpus = ref<InventaireMedias>({})
  const audiosManquants = ref<AudiosManquants>({})
  const audiosInaccessibles = ref<{ chemin: string; raison: string }[]>([])
  const srtASurEcrire = ref<string | null>(null)
  const srtMessage = ref<string | null>(null)
  const designationAudioId = ref<string | null>(null)
  const preparationLectureDistante = ref(false)
  const lectureDistanteActive = ref(false)
  const lectureDistanteDemandee = ref(false)
  const mediaDistantDesigne = computed(() =>
    deps.fournisseurDistant() === 'gitlab' && Boolean(deps.entretien.meta.audioDistant),
  )
  const audioLocalDisponible = computed(() => {
    const id = deps.entretien.ouvertId.value
    return Boolean(id && audiosCorpus.value[id]?.audio)
  })
  const verificationMediaDistant = ref<{
    id: string
    chemin: string
    motif: MotifLectureMediaDistante | null
  } | null>(null)

  const etatAudioOuvert = computed(() => {
    const id = deps.entretien.ouvertId.value
    if (!id || !deps.distantActif()) return { etat: 'sans-objet' as const }
    if (audiosCorpus.value[id]?.audio && !lectureDistanteDemandee.value) {
      return { etat: 'ok' as const }
    }
    const designation = deps.entretien.meta.audioDistant
    if (!designation) return { etat: 'hors-designation' as const }
    if (deps.fournisseurDistant() === 'gitlab') {
      const verification = verificationMediaDistant.value?.id === id &&
        verificationMediaDistant.value.chemin === designation.chemin
        ? verificationMediaDistant.value
        : null
      if (verification?.motif === 'fichier-absent') return { etat: 'media-absent' as const }
      if (verification?.motif === 'droits') return { etat: 'media-droits' as const }
      if (verification?.motif === 'indisponible') return { etat: 'media-indisponible' as const }
      if (verification?.motif === 'plages-non-prises-en-charge') {
        return { etat: 'plages-non-prises-en-charge' as const }
      }
      if (verification?.motif === 'format-non-pris-en-charge') {
        return { etat: 'format-non-pris-en-charge' as const }
      }
      if (verification && verification.motif === null) return { etat: 'distant-gitlab' as const }
      if (designation.fournisseur === 'gitlab') {
        const inaccessible = audiosInaccessibles.value.find((audio) => audio.chemin === designation.chemin)
        return inaccessible
          ? { etat: 'inaccessible' as const, raison: inaccessible.raison }
          : { etat: 'media-absent' as const }
      }
      const base = deps.etatBaseMedia()
      if (base === 'non-configuree' || verification?.motif === 'non-configuree') {
        return { etat: 'base-non-configuree' as const }
      }
      if (base === 'secret-indisponible' || verification?.motif === 'secret-indisponible') {
        return { etat: 'base-secret-indisponible' as const }
      }
      if (verification?.motif) return { etat: 'media-indisponible' as const }
      return { etat: 'distant-gitlab' as const }
    }
    const inaccessible = audiosInaccessibles.value.find(
      (audio) => audio.chemin === designation.chemin,
    )
    return inaccessible
      ? { etat: 'inaccessible' as const, raison: inaccessible.raison }
      : { etat: 'distant' as const }
  })

  function majAudiosInaccessibles(liste: { chemin: string; raison: string }[]): void {
    audiosInaccessibles.value = liste
  }

  async function rafraichirAudios(): Promise<void> {
    audiosCorpus.value = await window.sonal.corpus.audios()
  }

  async function verifierIntegriteAudios(): Promise<AudiosManquants> {
    const resultat = await window.sonal.corpus.verifierAudios()
    const manquants: AudiosManquants = {}
    for (const [id, statut] of Object.entries(resultat)) {
      if (statut === 'manquant') manquants[id] = 'manquant'
    }
    return manquants
  }

  async function rafraichirIntegriteAudios(): Promise<void> {
    audiosManquants.value = await verifierIntegriteAudios()
  }

  async function genererOnde(id: string, audioRef: string): Promise<void> {
    await genererEtEcrireWaveform(id, audioRef)
  }

  async function regenererOndesManquantes(): Promise<void> {
    const cibles = Object.entries(audiosCorpus.value).filter(([, media]) => media.audio && !media.waveform)
    if (cibles.length === 0) return
    for (const [id, media] of cibles) {
      await genererEtEcrireWaveform(id, media.audio!)
    }
    await rafraichirAudios()
  }

  function urlWaveform(id: string): string | null {
    const waveform = audiosCorpus.value[id]?.waveform
    return waveform
      ? urlMediaWaveform(id, deps.membership.value[id]?.lastModified ?? '')
      : null
  }

  async function majAudioEntretien(id: string): Promise<void> {
    lectureDistanteActive.value = false
    lectureDistanteDemandee.value = false
    await rafraichirAudios()
    const audioRef = deps.entretien.meta.audioRef
    const media = audiosCorpus.value[id]
    verificationMediaDistant.value = null
    if (!audioRef || !media?.audio) {
      deps.chargerLecteur(null, null)
      const designation = deps.entretien.meta.audioDistant
      if (designation && deps.fournisseurDistant() === 'gitlab') {
        const chemin = designation.chemin
        const resultat = await window.sonal.distant.verifierMedia(chemin)
        if (
          deps.entretien.ouvertId.value === id &&
          deps.entretien.meta.audioDistant?.chemin === chemin
        ) {
          verificationMediaDistant.value = {
            id,
            chemin,
            motif: resultat.ok ? null : (resultat.raison ?? 'indisponible'),
          }
        }
      } else {
        verificationMediaDistant.value = null
      }
      return
    }
    verificationMediaDistant.value = null
    if (!media.waveform) {
      const chemin = await genererEtEcrireWaveform(id, audioRef)
      if (chemin) await rafraichirAudios()
    }
    const waveform = audiosCorpus.value[id]?.waveform
    deps.chargerLecteur(
      urlMediaAudio(audioRef),
      waveform ? urlMediaWaveform(id, Date.now()) : null,
    )
  }

  async function assignerAudioSelection(): Promise<void> {
    const id = deps.selection.corpusSelId.value
    if (!id) return
    const source = await window.sonal.dialog.choisirAudio()
    if (!source) return
    const audio = await window.sonal.corpus.assignerAudio(id, source)
    if (!audio) return
    await genererEtEcrireWaveform(id, audio.audioRef)
    await rafraichirAudios()
    if (deps.selection.corpusSelMeta.value) {
      deps.selection.corpusSelMeta.value = {
        ...deps.selection.corpusSelMeta.value,
        audio: true,
      }
    }
    if (deps.entretien.ouvertId.value === id) {
      deps.entretien.meta.audioRef = audio.audioRef
      await majAudioEntretien(id)
    }
  }

  async function effacerAudioSelection(): Promise<void> {
    const id = deps.selection.corpusSelId.value
    if (!id) return
    if (deps.entretien.ouvertId.value === id) {
      deps.entretien.meta.audioRef = null
      deps.entretien.meta.audioDistant = null
      await deps.entretien.sauver()
    }
    await window.sonal.corpus.effacerAudio(id)
    await rafraichirAudios()
    await rafraichirIntegriteAudios()
    await deps.selection.rafraichirMetaSelection()
    if (deps.entretien.ouvertId.value === id) await majAudioEntretien(id)
  }

  async function demanderSrt(): Promise<void> {
    const id = deps.selection.corpusSelId.value
    if (!id) return
    if (deps.entretien.ouvertId.value === id) await deps.entretien.sauver()
    const lecture = await window.sonal.corpus.lireEntretien(id)
    if (!lecture.ok) return
    srtMessage.value = null
    if (texteDuCorps(lecture.data.corpsTexte).trim() !== '') {
      srtASurEcrire.value = id
      return
    }
    await importerSrtDans(id)
  }

  function confirmerSrt(): void {
    const id = srtASurEcrire.value
    srtASurEcrire.value = null
    if (id) void importerSrtDans(id)
  }

  async function importerSrtDans(id: string): Promise<void> {
    await choisirSrtAvantMutation(deps.choisirSrt, async (fichier) => {
      let importe: ResultatImport
      try {
        importe = importerFichier(fichier.nom, fichier.contenu, (html) =>
          new DOMParser().parseFromString(html, 'text/html'),
        )
      } catch (erreur) {
        srtMessage.value = erreur instanceof Error ? erreur.message : String(erreur)
        return
      }
      srtMessage.value = null
      const ouvert = deps.entretien.ouvertId.value === id
      if (ouvert) await deps.entretien.sauver()
      try {
        await window.sonal.corpus.remplacerTranscription(id, {
          corpsTexte: importe.payload.corpsTexte,
          annotations: importe.payload.annotations,
          ancres: importe.payload.ancres,
          locuteurs: importe.payload.locuteurs,
        })
        deps.perimerScanAnon()
      } catch (erreur) {
        srtMessage.value = erreur instanceof Error ? erreur.message : String(erreur)
        return
      }
      if (ouvert) await deps.entretien.reouvrir(id, true)
      await deps.selection.rafraichirMetaSelection()
    })
  }

  async function reassignerAudioEntretienOuvert(): Promise<void> {
    const id = deps.entretien.ouvertId.value
    if (!id) return
    const source = await window.sonal.dialog.choisirAudio()
    if (!source) return
    const audio = await window.sonal.corpus.assignerAudio(id, source)
    if (!audio) return
    await genererEtEcrireWaveform(id, audio.audioRef)
    if (deps.entretien.ouvertId.value === id) {
      deps.entretien.meta.audioRef = audio.audioRef
      await majAudioEntretien(id)
    }
  }

  async function associerAudioEntretienOuvert(): Promise<void> {
    const id = deps.entretien.ouvertId.value
    if (!id) return
    const source = await window.sonal.dialog.choisirAudio()
    if (!source) return
    const audio = await window.sonal.corpus.associerAudioLocal(id, source)
    if (!audio) return
    await genererEtEcrireWaveform(id, audio.audioRef)
    if (deps.entretien.ouvertId.value === id) await majAudioEntretien(id)
    await rafraichirIntegriteAudios()
  }

  async function rapatrierAudioMaintenant(): Promise<void> {
    await deps.actualiserDistant(true)
    await rafraichirAudios()
    const id = deps.entretien.ouvertId.value
    if (id) await majAudioEntretien(id)
  }

  async function lireAudioDistant(): Promise<void> {
    const id = deps.entretien.ouvertId.value
    const chemin = deps.entretien.meta.audioDistant?.chemin
    if (!id || !chemin || deps.fournisseurDistant() !== 'gitlab') return
    lectureDistanteDemandee.value = true
    preparationLectureDistante.value = true
    try {
      const resultat = await window.sonal.distant.preparerLectureMedia(id)
      if (
        deps.entretien.ouvertId.value !== id ||
        deps.entretien.meta.audioDistant?.chemin !== chemin
      ) return
      if (!resultat.ok) {
        verificationMediaDistant.value = { id, chemin, motif: resultat.raison }
        deps.chargerLecteur(null, null)
        return
      }
      verificationMediaDistant.value = { id, chemin, motif: null }
      lectureDistanteActive.value = true
      deps.chargerLecteur(resultat.url, null)
    } finally {
      preparationLectureDistante.value = false
    }
  }

  async function lireAudioLocal(): Promise<void> {
    const id = deps.entretien.ouvertId.value
    if (id) await majAudioEntretien(id)
  }

  window.sonal.distant.surEtatLectureMedia((id, motif) => {
    const chemin = deps.entretien.meta.audioDistant?.chemin
    if (deps.entretien.ouvertId.value !== id || !chemin || !lectureDistanteDemandee.value) return
    if (motif === 'version-changee') {
      lectureDistanteActive.value = false
      deps.chargerLecteur(null, null)
      void lireAudioDistant()
      return
    }
    lectureDistanteActive.value = false
    verificationMediaDistant.value = { id, chemin, motif }
    deps.chargerLecteur(null, null)
  })

  async function creerEntretienVideDistant(titre: string): Promise<string | null> {
    if (!titre.trim()) return null
    const resultat = await window.sonal.corpus.creerEntretienVide(titre.trim())
    deps.membership.value = resultat.corpus.membership
    deps.perimerScanAnon()
    await rafraichirAudios()
    return resultat.id
  }

  function ouvrirDesignationAudio(id: string): void {
    designationAudioId.value = id
  }

  function fermerDesignationAudio(): void {
    designationAudioId.value = null
  }

  async function confirmerDesignationAudio(chemin: string): Promise<void> {
    const id = designationAudioId.value
    if (!id) return
    const verification = await window.sonal.distant.verifierMedia(chemin)
    if (!verification.ok) throw new Error(verification.raison ?? 'refus')
    if (deps.entretien.ouvertId.value === id) {
      deps.entretien.meta.audioDistant = referenceMediaDistant(chemin)
      await deps.entretien.sauver()
      designationAudioId.value = null
      await majAudioEntretien(id)
    } else {
      const resultat = await window.sonal.distant.designerAudio(id, chemin)
      if (!resultat.ok) throw new Error(resultat.raison ?? 'refus')
      designationAudioId.value = null
    }
    await deps.actualiserDistant(true)
    await rafraichirAudios()
    await rafraichirIntegriteAudios()
  }

  return {
    audiosCorpus,
    audiosManquants,
    srtASurEcrire,
    srtMessage,
    designationAudioId,
    preparationLectureDistante,
    lectureDistanteActive,
    mediaDistantDesigne,
    audioLocalDisponible,
    etatAudioOuvert,
    majAudiosInaccessibles,
    rafraichirAudios,
    rafraichirIntegriteAudios,
    genererOnde,
    regenererOndesManquantes,
    urlWaveform,
    majAudioEntretien,
    assignerAudioSelection,
    effacerAudioSelection,
    demanderSrt,
    confirmerSrt,
    reassignerAudioEntretienOuvert,
    associerAudioEntretienOuvert,
    rapatrierAudioMaintenant,
    lireAudioDistant,
    lireAudioLocal,
    creerEntretienVideDistant,
    ouvrirDesignationAudio,
    fermerDesignationAudio,
    confirmerDesignationAudio,
  }
}
