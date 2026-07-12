import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { TUNE_METHOD_TECHNIQUE_NAME } from '@/lib/ingestion/ingest-test-payload'

describe('20260712174500_correct_tune_method_description.sql', () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      'supabase/migrations/20260712174500_correct_tune_method_description.sql',
    ),
    'utf-8',
  )

  it('updates only the Tune Method row', () => {
    expect(migration).toContain('update public.listening_techniques')
    expect(migration).toContain(`where name = '${TUNE_METHOD_TECHNIQUE_NAME}'`)
  })

  it('new description no longer conflates Tune Method with PRaT (rhythm/pace/timing)', () => {
    // Scoped to the `set description = '...'` clause itself — the
    // preceding comment legitimately quotes the OLD, incorrect
    // description for context, so a whole-file check would false-fail.
    const setClauseMatch = migration.match(/set description = '([^']+)'/)
    expect(setClauseMatch).not.toBeNull()
    expect(setClauseMatch![1]).not.toMatch(/rhythm|pace|timing/i)
  })

  it('does not touch table shape or any other table', () => {
    expect(migration).not.toMatch(/\b(drop|alter table|delete from|create table|insert into)\b/i)
  })
})
