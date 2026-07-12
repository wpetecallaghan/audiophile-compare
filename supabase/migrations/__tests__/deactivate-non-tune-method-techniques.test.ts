import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { TUNE_METHOD_TECHNIQUE_NAME } from '@/lib/ingestion/ingest-test-payload'

describe('20260712170000_deactivate_non_tune_method_techniques.sql', () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      'supabase/migrations/20260712170000_deactivate_non_tune_method_techniques.sql',
    ),
    'utf-8',
  )

  it('deactivates every technique except Tune Method', () => {
    expect(migration).toContain('set is_active = false')
    expect(migration).toContain(`where name <> '${TUNE_METHOD_TECHNIQUE_NAME}'`)
  })

  it('does not touch the listening_techniques table shape or any other table', () => {
    expect(migration).not.toMatch(/\b(drop|alter table|delete from|create table)\b/i)
  })
})
