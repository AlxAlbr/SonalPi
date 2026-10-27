// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useMediasCorpus } from '../src/renderer/composables/corpus/useMediasCorpus'

vi.mock('../src/renderer/audio/waveform', () => ({
  urlMediaAudio: (chemin: string) => `media:${chemin}`,
  urlMediaWaveform: (id: string) => `waveform:${id}`,
  genererEtEcrireWaveform: vi.fn(async () => null),
}))
afterEach(() => vi.unstubAllGlobals())

function lecteur(audioRef: string | null, copie: string | null, externe = false) {
  const charger = vi.fn(), verifier = vi.fn(async () => ({ ok: true }))
  vi.stubGlobal('window', { sonal: {
    corpus: { audios: vi.fn(async () => ({ e: { audio: copie, waveform: copie ? 'png/e.png' : null } })) },
    distant: { verifierMedia: verifier, surEtatLectureMedia: vi.fn(() => vi.fn()) },
  } })
  const deps: Parameters<typeof useMediasCorpus>[0] = {
    membership: ref({}), selection: { corpusSelId: ref(null), corpusSelMeta: ref(null), rafraichirMetaSelection: async () => {} },
    entretien: { ouvertId: ref('e'), meta: { audioRef, audioDistant: { chemin: 'medias/voix.wav', fournisseur: externe ? 'webdav' : 'gitlab' } },
      sauver: async () => {}, reouvrir: async () => true },
    chargerLecteur: charger, perimerScanAnon: () => {}, choisirSrt: async () => null,
    distantActif: () => true, fournisseurDistant: () => 'gitlab', etatBaseMedia: () => 'configuree', actualiserDistant: async () => true,
  }
  return { medias: useMediasCorpus(deps), charger, verifier, deps }
}

describe('résolution du lecteur après migration', () => {
  it('charge la copie miroir du dépôt sans audioRef locale et sans consulter WebDAV', async () => {
    const f = lecteur(null, '/miroir/medias/voix.wav')
    await f.medias.majAudioEntretien('e')
    expect(f.charger).toHaveBeenCalledExactlyOnceWith('media:/miroir/medias/voix.wav', 'waveform:e')
    expect(f.verifier).not.toHaveBeenCalled()
    expect(f.deps.entretien.meta.audioRef).toBeNull()
  })

  it('utilise aussi une association propre au poste plutôt que la référence d’un autre poste', async () => {
    const f = lecteur('/autre-poste/voix.wav', '/mon-poste/voix.wav')
    await f.medias.majAudioEntretien('e')
    expect(f.charger).toHaveBeenCalledExactlyOnceWith('media:/mon-poste/voix.wav', 'waveform:e')
    expect(f.deps.entretien.meta.audioRef).toBe('/autre-poste/voix.wav')
  })

  it('conserve la préparation distante lorsque le média externe n’a pas de copie locale', async () => {
    const f = lecteur(null, null, true)
    await f.medias.majAudioEntretien('e')
    expect(f.charger).toHaveBeenCalledExactlyOnceWith(null, null)
    expect(f.verifier).toHaveBeenCalledExactlyOnceWith('medias/voix.wav')
    expect(f.medias.etatAudioOuvert.value.etat).toBe('distant-gitlab')
  })
})
