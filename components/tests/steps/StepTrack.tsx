'use client'

import { useState, useEffect } from 'react'
import type { Track, TestDraft } from '@/lib/types/test-creation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { Heading } from '@/components/ui/Heading'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { TextInput } from '@/components/ui/TextField'
import { FormMessage } from '@/components/ui/FormMessage'
import { Callout } from '@/components/ui/Callout'
import { Text } from '@/components/ui/Text'

type Props = {
  draft: TestDraft
  onComplete: (updates: Partial<TestDraft>) => void
}

export default function StepTrack({ draft, onComplete }: Props) {
  const t = useTranslations('tests.trackStep')
  const tw = useTranslations('tests.wizard')
  const tCommon = useTranslations('common')
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState<Track[]>([])
  const [selected, setSelected] = useState<Track | null>(draft.track)
  const [creating, setCreating] = useState(false)
  const [loading, setLoading]   = useState(false)

  // New track form fields
  const [artist, setArtist]           = useState('')
  const [title, setTitle]             = useState('')
  const [album, setAlbum]             = useState('')
  const [passageNote, setPassageNote] = useState('')
  const [error, setError]             = useState<string | null>(null)

  const isDisabled = selected === null

  // Search as the user types — debounced by 300ms
  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true)
      const res = await fetch(`/api/tracks?q=${encodeURIComponent(query)}`)
      const json = await res.json()
      setResults(json.tracks ?? [])
      setLoading(false)
    }, 300)

    // Returning a cleanup function from useEffect cancels the previous
    // timer if the user types again before 300ms — this is the standard
    // JS debounce pattern
    return () => clearTimeout(timer)
  }, [query])

  async function handleCreate() {
    setError(null)
    const res = await fetch('/api/tracks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artist, title, album, passage_note: passageNote }),
    })
    const json = await res.json()
    if (!res.ok) {
      setError(json.error)
      return
    }
    setSelected(json.track)
    setCreating(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <Heading level={2}>Track</Heading>
        <Text className="mt-1">
          Find the recording used in this test, or add it if it's not listed.
        </Text>
      </div>

      {selected ? (
        <Callout tone="success" className="space-y-1">
          <p className="font-medium">{selected.artist} — {selected.title}</p>
          {selected.album && (
            <Text tone="body">{selected.album}</Text>
          )}
          {selected.passage_note && (
            <Text className="italic">{selected.passage_note}</Text>
          )}
          <Button variant="secondary" onClick={() => setSelected(null)} className="mt-2">
            Change track
          </Button>
        </Callout>
      ) : creating ? (
        <div className="space-y-4 rounded border border-border p-4">
        <h3 className="font-medium text-sm">{t('addTrackHeading')}</h3>
          {[
            { label: t('artistLabel'), value: artist, set: setArtist },
            { label: t('titleLabel'),  value: title,  set: setTitle  },
            { label: t('albumLabel'),  value: album,  set: setAlbum  },
          ].map(({ label, value, set }) => (
            <div key={label}>
              <FieldLabel>{label}</FieldLabel>
              <TextInput
                type="text"
                value={value}
                onChange={e => set(e.target.value)}
              />
            </div>
          ))}
          <div>
            <FieldLabel>
              {t('passageNoteLabel')}
              <span className="text-muted font-normal ml-1">
                (e.g. "Opening bars, track 3")
              </span>
            </FieldLabel>
            <TextInput
              type="text"
              value={passageNote}
              onChange={e => setPassageNote(e.target.value)}
            />
          </div>
          {error && <FormMessage tone="error">{error}</FormMessage>}
          <div className="flex gap-3">
            <Button onClick={handleCreate}>
              {t('createButton')}
            </Button>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              {tCommon('cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <TextInput
            type="text"
            placeholder={t('searchPlaceholder')}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {loading && <Text>{t('searching')}</Text>}
          {results.length > 0 && (
            <ul className="border border-border rounded divide-y divide-border">
              {results.map(track => (
                <li key={track.id}>
                  <button
                    onClick={() => setSelected(track)}
                    className="w-full text-left px-4 py-3 hover:bg-hover-surface text-sm"
                  >
                    <span className="font-medium">{track.artist}</span>
                    {' — '}
                    {track.title}
                    {track.album && (
                      <span className="text-muted ml-1">({track.album})</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!loading && query.trim() && results.length === 0 && (
            <Text>{t('noResults')}</Text>
          )}
          <Button variant="secondary" onClick={() => setCreating(true)}>
            {t('addTrackLink')}
          </Button>
        </div>
      )}

      <Button
        disabled={isDisabled ? true : undefined}
        onClick={() => onComplete({ track: selected })}
        className="w-full"
        suppressHydrationWarning
      >
        {tw('continueButton')}
      </Button>
    </div>
  )
}