'use client'

import { useState, useEffect } from 'react'
import type { Track, TestDraft } from '@/lib/types/test-creation'
import { useTranslations } from 'next-intl'

type Props = {
  draft: TestDraft
  onComplete: (updates: Partial<TestDraft>) => void
}

export default function StepTrack({ draft, onComplete }: Props) {
  const t = useTranslations('tests.trackStep')
  const tw = useTranslations('tests.wizard')
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
        <h2 className="text-lg font-semibold">Track</h2>
        <p className="text-sm text-gray-500 mt-1">
          Find the recording used in this test, or add it if it's not listed.
        </p>
      </div>

      {selected ? (
        <div className="rounded border border-green-200 bg-green-50 p-4 space-y-1">
          <p className="font-medium">{selected.artist} — {selected.title}</p>
          {selected.album && (
            <p className="text-sm text-gray-600">{selected.album}</p>
          )}
          {selected.passage_note && (
            <p className="text-sm text-gray-500 italic">{selected.passage_note}</p>
          )}
          <button
            onClick={() => setSelected(null)}
            className="text-sm text-blue-600 underline mt-2 block"
          >
            Change track
          </button>
        </div>
      ) : creating ? (
        <div className="space-y-4 rounded border p-4">
        <h3 className="font-medium text-sm">{t('addTrackHeading')}</h3>
          {[
            { label: t('artistLabel'), value: artist, set: setArtist },
            { label: t('titleLabel'),  value: title,  set: setTitle  },
            { label: t('albumLabel'),  value: album,  set: setAlbum  },
          ].map(({ label, value, set }) => (
            <div key={label}>
              <label className="block text-sm font-medium mb-1">{label}</label>
              <input
                type="text"
                value={value}
                onChange={e => set(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium mb-1">
              {t('passageNoteLabel')}
              <span className="text-gray-400 font-normal ml-1">
                (e.g. "Opening bars, track 3")
              </span>
            </label>
            <input
              type="text"
              value={passageNote}
              onChange={e => setPassageNote(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={handleCreate}
              className="bg-black text-white rounded px-4 py-2 text-sm font-medium"
            >
              {t('createButton')}
            </button>
            <button
              onClick={() => setCreating(false)}
              className="text-sm text-gray-600 underline"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
          />
          {loading && <p className="text-sm text-gray-400">{t('searching')}</p>}
          {results.length > 0 && (
            <ul className="border rounded divide-y">
              {results.map(track => (
                <li key={track.id}>
                  <button
                    onClick={() => setSelected(track)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 text-sm"
                  >
                    <span className="font-medium">{track.artist}</span>
                    {' — '}
                    {track.title}
                    {track.album && (
                      <span className="text-gray-500 ml-1">({track.album})</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!loading && query.trim() && results.length === 0 && (
            <p className="text-sm text-gray-500">{t('noResults')}</p>
          )}
          <button
            onClick={() => setCreating(true)}
            className="text-sm text-blue-600 underline"
          >
            {t('addTrackLink')}
          </button>
        </div>
      )}

      <button
        disabled={isDisabled ? true : undefined}
        onClick={() => onComplete({ track: selected })}
        className="w-full bg-black text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-40"
        suppressHydrationWarning
      >
        {tw('continueButton')}
      </button>
    </div>
  )
}