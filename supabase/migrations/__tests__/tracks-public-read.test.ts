import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('20260717120000_tracks_public_read.sql', () => {
  const migration = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260717120000_tracks_public_read.sql'),
    'utf-8',
  )

  it('drops the old authenticated-only read policy and replaces it with public read', () => {
    expect(migration).toContain('drop policy "tracks: authenticated read" on public.tracks')
    expect(migration).toContain('create policy "tracks: public read"')
    expect(migration).toContain('on public.tracks for select using (true)')
  })

  it('does not touch the tracks insert policy, table shape, or any other table', () => {
    expect(migration).not.toContain('tracks: authenticated insert')
    expect(migration).not.toMatch(/\b(alter table|delete from|create table|drop table)\b/i)
    expect(migration).not.toMatch(/on public\.(?!tracks)\w+/)
  })
})
