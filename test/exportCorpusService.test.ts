import { describe, expect, it, vi } from 'vitest'
import type {
  FormatExport,
  InstantaneEntretienExport,
  OptionsExport,
} from '../src/shared/export/types'
import type {
  ResultatInstantaneCorpus,
} from '../src/shared/export/corpus'
import type { DemandeExportDocxCorpus } from '../src/shared/format'
import {
  enregistrerRapportPseudonymisationCorpus,
  exporterCorpus,
  preparerRapportPseudonymisationCorpus,
  type SourceExportCorpus,
  type SuiviEntretienLot,
} from '../src/renderer/services/exportCorpus'
import { entreeSentinelle } from './fixtures/export/entretiens'

/** Doublure d'écriture : mémoire de ce qui a été « écrit » sur disque. */
interface Ecritures {
  textes: Map<string, string>
  docx: Array<{ demande: DemandeExportDocxCorpus; nom: string }>
  pdf: Array<{ nom: string; html: string }>
  medias: string[]
}

/** Instantané de test pour un entretien du lot. */
function instantaneDeTest(id: string, titre: string, audioLocal: string | null = null): InstantaneEntretienExport {
  return {
    id,
    titre,
    date: '2024-05-01',
    entretien: entreeSentinelle(),
    notesPubliques: [],
    audioLocal,
  }
}

/** Doublure complète de la source : comportements configurables par test. */
function sourceDoublure(config: {
  nomCorpus?: string
  echecDistantPour?: string[]
  dossierRetourne?: string | null
  echecCopie?: boolean
  continuJusqua?: number
  ouvertId?: string | null
  fichierExistant?: string
} = {}) {
  const ecritures: Ecritures = { textes: new Map(), docx: [], pdf: [], medias: [] }
  let appelsInstantane = 0
  let progression: Array<[number, number, string]> = []
  const source: SourceExportCorpus = {
    nomCorpus: () => config.nomCorpus ?? 'Corpus test',
    instantaneOuvert: async () =>
      config.ouvertId ? instantaneDeTest(config.ouvertId, `Titre-${config.ouvertId}`) : null,
    instantaneDistant: async (id) => {
      appelsInstantane++
      if (config.echecDistantPour?.includes(id)) {
        return { etat: 'echec', message: `L'entretien « ${id} » est introuvable dans le corpus.` }
      }
      return { etat: 'succes', instantane: instantaneDeTest(id, `Titre-${id}`) }
    },
    choisirDossier: async (nomSuggere) =>
      config.dossierRetourne === undefined ? `/dest/${nomSuggere}` : config.dossierRetourne,
    listerDestination: async () => [],
    ecrireTexte: async (nom, contenu) => {
      ecritures.textes.set(nom, contenu)
      return { etat: 'succes', cheminRelatif: nom }
    },
    ecrireDocx: async (demande, nom) => {
      ecritures.docx.push({ demande, nom })
      return { etat: 'succes', cheminRelatif: nom }
    },
    ecrirePdf: async (nom, html) => {
      ecritures.pdf.push({ nom, html })
      return { etat: 'succes', cheminRelatif: nom }
    },
    copierMedia: async (urlAudio) => {
      if (config.echecCopie) return { etat: 'echec', message: "Le média n'est plus accessible sur ce poste." }
      ecritures.medias.push(urlAudio)
      return { etat: 'succes', cheminRelatif: 'medias/audio.mp3' }
    },
    fermer: async () => {},
    doitContinuer: () => appelsInstantane < (config.continuJusqua ?? Number.POSITIVE_INFINITY),
    surProgression: (faits, total, titre) => {
      progression.push([faits, total, titre])
    },
  }
  return { source, ecritures, progression }
}

const OPTIONS_DEFAUT: OptionsExport = {
  entete: true,
  notes: true,
  vars: true,
  time: true,
  loc: true,
  thm: true,
  anon: false,
}

function demande(formats: FormatExport[], extra: Partial<Parameters<typeof exporterCorpus>[0]> = {}) {
  return {
    selection: [
      { id: 'e1', titre: 'Entretien un', date: '2024-05-01' },
      { id: 'e2', titre: 'Entretien deux', date: null },
      { id: 'e3', titre: 'Entretien deux', date: '2024-06-01' },
    ],
    formats,
    options: OPTIONS_DEFAUT,
    copierMedias: false,
    enregistrerRapport: false,
    ...extra,
  }
}

function suivi(faits: SuiviEntretienLot[], id: string): SuiviEntretienLot | undefined {
  return faits.find((f) => f.id === id)
}

describe('rapport de corpus avant export', () => {
  it('prépare un aperçu agrégé sans choisir de destination ni écrire', async () => {
    const { source } = sourceDoublure({ ouvertId: 'e1' })
    const choisirDossier = vi.spyOn(source, 'choisirDossier')
    const ecrireTexte = vi.spyOn(source, 'ecrireTexte')
    const distant = vi.spyOn(source, 'instantaneDistant')

    const preparation = await preparerRapportPseudonymisationCorpus(
      demande(['txt', 'html'], {
        idOuvert: 'e1',
        options: { ...OPTIONS_DEFAUT, anon: true },
      }),
      source,
    )

    expect(preparation.etat).toBe('succes')
    expect(choisirDossier).not.toHaveBeenCalled()
    expect(ecrireTexte).not.toHaveBeenCalled()
    expect(distant).not.toHaveBeenCalledWith('e1')
    if (preparation.etat !== 'succes') return
    expect(preparation.apercu.entretiens).toHaveLength(3)
    expect(preparation.apercu.entretiens[0].formats.map((r) => r.format)).toEqual(['txt', 'html'])
    expect(preparation.apercu.texte).toContain('Format : TXT')
    expect(preparation.apercu.texte).toContain('Format : HTML')
    expect(preparation.apercu.nomSuggere).toBe('Corpus test_rapport-pseudonymisation.txt')
  })

  it('signale les entretiens indisponibles tout en présentant les autres', async () => {
    const { source } = sourceDoublure({ echecDistantPour: ['e2'] })
    const preparation = await preparerRapportPseudonymisationCorpus(demande(['txt']), source)

    expect(preparation.etat).toBe('succes')
    if (preparation.etat !== 'succes') return
    expect(preparation.apercu.entretiens.map((e) => e.id)).toEqual(['e1', 'e3'])
    expect(preparation.apercu.indisponibles).toEqual([
      { id: 'e2', titre: 'Entretien deux', raison: "L'entretien « e2 » est introuvable dans le corpus." },
    ])
  })

  it('enregistre séparément le rapport déjà consulté', async () => {
    const { source } = sourceDoublure()
    const preparation = await preparerRapportPseudonymisationCorpus(demande(['txt']), source)
    expect(preparation.etat).toBe('succes')
    if (preparation.etat !== 'succes') return
    const ecrire = vi.fn(async (nom: string, _contenu: string) => `/rapports/${nom}`)

    const resultat = await enregistrerRapportPseudonymisationCorpus(preparation.apercu, ecrire)

    expect(resultat.etat).toBe('succes')
    expect(ecrire).toHaveBeenCalledWith(preparation.apercu.nomSuggere, preparation.apercu.texte)
  })
})

describe('exporterCorpus — formats par entretien', () => {
  it('un fichier par entretien, index avec tous les exportés, ordre de la sélection', async () => {
    const { source, ecritures } = sourceDoublure()
    const r = await exporterCorpus(demande(['txt']), source)
    expect(r.etat).toBe('succes')
    expect([...ecritures.textes.keys()].filter((n) => n.endsWith('.txt'))).toEqual([
      'Entretien un.txt',
      'Entretien deux.txt',
      'Entretien deux (2).txt',
      '_index.txt',
    ])
    expect(ecritures.textes.get('Entretien un.txt')).toContain('Entretien : Titre-e1')
    const index = ecritures.textes.get('_index.txt')!
    expect(index).toContain('3 entretiens exportés.')
    expect(index).toContain('- Entretien un (2024-05-01)')
    expect(index).toContain('- Entretien deux — ')
    expect(index).toContain('mots')
  })

  it('pseudonymisation : suffixe _pseudonymise sur les fichiers du lot', async () => {
    const { source, ecritures } = sourceDoublure()
    await exporterCorpus(
      demande(['txt'], { options: { ...OPTIONS_DEFAUT, anon: true } }),
      source,
    )
    expect([...ecritures.textes.keys()].filter((n) => n.endsWith('.txt'))).toEqual([
      'Entretien un_pseudonymise.txt',
      'Entretien deux_pseudonymise.txt',
      'Entretien deux_pseudonymise (2).txt',
      '_index.txt',
    ])
  })

  it('plusieurs formats en une passe : TXT et HTML produits sans relecture des instantanés', async () => {
    const { source, ecritures } = sourceDoublure()
    await exporterCorpus(demande(['txt', 'html']), source)
    expect([...ecritures.textes.keys()].filter((n) => n.endsWith('.html'))).toEqual([
      'Entretien un.html',
      'Entretien deux.html',
      'Entretien deux (2).html',
    ])
    expect(ecritures.textes.get('Entretien un.html')).toContain('<html')
    expect(ecritures.textes.get('_index.txt')).toContain('3 entretiens exportés.')
  })

  it('médias copiés : l\'HTML référence la copie relative', async () => {
    const { source, ecritures } = sourceDoublure({ ouvertId: 'e1' })
    // Seul e1 a un média résolu : la doublure instantanée par défaut est sans
    // audio ; on forge un instantané avec audio pour l'entretien distant e2.
    source.instantaneDistant = async (id) => ({
      etat: 'succes',
      instantane: instantaneDeTest(id, `Titre-${id}`, 'file:///media/audio.mp3'),
    })
    await exporterCorpus(
      demande(['html'], { copierMedias: true }),
      source,
    )
    expect(ecritures.medias).toHaveLength(3)
    const html = ecritures.textes.get('Entretien un.html')!
    expect(html).toContain('src="medias/audio.mp3"')
  })

  it('échec de copie média : pas de player, l\'export continue', async () => {
    const { source, ecritures } = sourceDoublure({ echecCopie: true })
    source.instantaneDistant = async (id) => ({
      etat: 'succes',
      instantane: instantaneDeTest(id, `Titre-${id}`, 'file:///media/audio.mp3'),
    })
    const r = await exporterCorpus(demande(['html'], { copierMedias: true }), source)
    expect(r.etat).toBe('succes')
    const html = ecritures.textes.get('Entretien un.html')!
    expect(html).not.toContain('<audio id="audio-export"')
  })
})

describe('exporterCorpus — documents combinés', () => {
  it('DOCX combiné : un titre par entretien, un seul appel d\'écriture', async () => {
    const { source, ecritures } = sourceDoublure()
    await exporterCorpus(demande(['docx']), source)
    expect(ecritures.docx).toHaveLength(1)
    const { demande: d, nom } = ecritures.docx[0]
    expect(nom).toBe('Corpus test.docx')
    expect(d.titre).toBe('Corpus test')
    const titres = d.document.blocs.filter((b) => b.type === 'titre')
    expect(titres).toHaveLength(3)
    expect(titres[0].runs?.[0].texte).toBe('Titre-e1')
    // Un DOCX combiné n'écrase pas l'index du lot.
    expect(ecritures.textes.has('_index.txt')).toBe(true)
  })

  it('PDF combiné : une section par entretien, sans player audio', async () => {
    const { source, ecritures } = sourceDoublure()
    await exporterCorpus(demande(['pdf']), source)
    expect(ecritures.pdf).toHaveLength(1)
    const { html, nom } = ecritures.pdf[0]
    expect(nom).toBe('Corpus test.pdf')
    expect(html).toContain('<h1>Titre-e1</h1>')
    expect(html).toContain('<h1>Titre-e2</h1>')
    expect(html).not.toContain('<audio id="audio-export"')
  })

  it('combinés sautés si aucun entretien n\'a réussi', async () => {
    const { source, ecritures } = sourceDoublure({ echecDistantPour: ['e1', 'e2', 'e3'] })
    const r = await exporterCorpus(demande(['docx', 'pdf']), source)
    expect(r.etat).toBe('succes')
    expect(ecritures.docx).toHaveLength(0)
    expect(ecritures.pdf).toHaveLength(0)
    expect(ecritures.textes.get('_index.txt')).toContain('0 entretien exporté.')
  })
})

describe('exporterCorpus — échecs, annulation, progression, rapport', () => {
  it('échec d\'un entretien distant : le lot continue, index sans l\'échec', async () => {
    const { source, ecritures } = sourceDoublure({ echecDistantPour: ['e2'] })
    const r = await exporterCorpus(demande(['txt']), source)
    expect(r.etat).toBe('succes')
    expect(r.etat === 'succes' && r.faits).toBeTruthy()
    if (r.etat === 'succes') {
      expect(suivi(r.faits, 'e1')?.etat).toBe('succes')
      expect(suivi(r.faits, 'e2')?.etat).toBe('echec')
      expect(suivi(r.faits, 'e2')?.raison).toContain('introuvable')
      expect(suivi(r.faits, 'e3')?.etat).toBe('succes')
    }
    expect(ecritures.textes.get('_index.txt')).toContain('2 entretiens exportés.')
    expect(ecritures.textes.get('_index.txt')).not.toContain('Titre-e2')
  })

  it('entretien ouvert : instantané pris en mémoire, pas d\'appel distant', async () => {
    const { source } = sourceDoublure({ ouvertId: 'e1' })
    const distant = vi.fn(async (id: string): Promise<ResultatInstantaneCorpus> => ({
      etat: 'succes',
      instantane: instantaneDeTest(id, `Titre-${id}`),
    }))
    source.instantaneDistant = distant
    const r = await exporterCorpus(demande(['txt'], { idOuvert: 'e1' }), source)
    expect(r.etat).toBe('succes')
    expect(distant).not.toHaveBeenCalledWith('e1')
  })

  it('annulation : les entretiens restants sont abandonnés, état annulé', async () => {
    const { source, ecritures } = sourceDoublure({ continuJusqua: 2 })
    const r = await exporterCorpus(demande(['txt']), source)
    expect(r.etat).toBe('annule')
    if (r.etat === 'annule') {
      expect(suivi(r.faits, 'e3')?.etat).toBe('abandonne')
      expect(r.dossier).toBe(`/dest/Corpus test_${new Date().toISOString().slice(0, 10)}`)
    }
    // L'index ne liste que les deux entretiens passés avant l'annulation.
    expect(ecritures.textes.get('_index.txt')).toContain('2 entretiens exportés.')
  })

  it('annulation au choix du dossier : rien n\'est traité', async () => {
    const { source, ecritures } = sourceDoublure({ dossierRetourne: null })
    const r = await exporterCorpus(demande(['txt']), source)
    expect(r.etat).toBe('annule')
    expect(r.dossier).toBeNull()
    expect(r.faits).toEqual([])
    expect(ecritures.textes.size).toBe(0)
  })

  it('progression : compteur croissant, titres de la sélection', async () => {
    const { source, progression } = sourceDoublure()
    await exporterCorpus(demande(['txt']), source)
    expect(progression).toEqual([
      [1, 3, 'Entretien un'],
      [2, 3, 'Entretien deux'],
      [3, 3, 'Entretien deux'],
    ])
  })

  it('rapport détaillé : une section par entretien, enregistré si demandé', async () => {
    const { source, ecritures } = sourceDoublure()
    await exporterCorpus(demande(['txt'], { enregistrerRapport: true }), source)
    const rapport = ecritures.textes.get('_rapport-pseudonymisation.txt')
    expect(rapport).toContain('Entretien : Titre-e1')
    expect(rapport).toContain('Entretien : Titre-e2')
    expect(rapport).toContain('Rapport de pseudonymisation')
  })

  it('rapport non demandé : aucun fichier de rapport', async () => {
    const { source, ecritures } = sourceDoublure()
    await exporterCorpus(demande(['txt']), source)
    expect(ecritures.textes.has('_rapport-pseudonymisation.txt')).toBe(false)
  })
})
