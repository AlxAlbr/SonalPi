import { describe, expect, test } from 'vitest'
import { FORMAT_VERSION } from '../src/shared/format'
import { classifierCorpus } from '../src/shared/ouvertureFichier'
import { squeletteCorpus } from '../src/shared/corpus/squelette'
import { verifierVersionNative, versionNativeReconnue } from '../src/shared/versionsNatives'

describe('versions natives et classification', () => {
  test('le contrôle natif reconnaît uniquement V2, sans intervalle de compatibilité', () => {
    expect(FORMAT_VERSION).toBe(2)
    for (let version = 0; version < 100; version++) {
      expect(versionNativeReconnue(version)).toBe(version === FORMAT_VERSION)
    }
    expect(classifierCorpus(JSON.stringify(squeletteCorpus())).type).toBe('v2')
  })

  test.each([1, 99])('un numéro natif incompatible %i ne déclenche pas un import V1', (formatVersion) => {
    const corpus = { ...squeletteCorpus(), formatVersion }
    expect(() => verifierVersionNative(corpus, 'corpus')).toThrow('Version native non supportée')
    expect(() => classifierCorpus(JSON.stringify(corpus))).toThrow('non supportée')
  })

  test.each([-1, 0, 99, '2', true, null, undefined, NaN, Infinity, 1.5])('refuse une version non reconnue : %s', (formatVersion) => {
    expect(versionNativeReconnue(formatVersion)).toBe(false)
    expect(() => verifierVersionNative({ formatVersion }, 'entretien')).toThrow(/Version native non supportée.*entretien/)
  })

  test('le marqueur des identités cibles interdit le repli vers V1', () => {
    expect(() => classifierCorpus(JSON.stringify({ locuteurs: {} }))).toThrow('Version')
    expect(() => classifierCorpus(JSON.stringify({ locuteurs: {}, tabEnt: [] }))).toThrow('ambigu')
    expect(classifierCorpus('{"tabEnt":[]}').type).toBe('v1')
  })
})
