import { describe, it, expect } from 'vitest'
import { formatSnapshotLine, formatOneSnapshot } from '../format-snapshot-line'

describe('formatSnapshotLine', () => {
  it('joins both snapshots with their system name', () => {
    const line = formatSnapshotLine(
      { label: 'v1 baseline', system: { name: 'Living room rig' } },
      { label: 'v2 new DAC', system: { name: 'Living room rig' } },
    )
    expect(line).toBe('Living room rig · v1 baseline  vs  Living room rig · v2 new DAC')
  })

  it('falls back to "?" when a snapshot has no joined system', () => {
    const line = formatSnapshotLine({ label: 'v1 baseline', system: null }, { label: 'v2 new DAC', system: null })
    expect(line).toBe('? · v1 baseline  vs  ? · v2 new DAC')
  })

  it('shows only snapshot A when snapshot B is null', () => {
    const line = formatSnapshotLine({ label: 'v1 baseline', system: { name: 'Living room rig' } }, null)
    expect(line).toBe('Living room rig · v1 baseline')
  })

  it('shows only snapshot B when snapshot A is null', () => {
    const line = formatSnapshotLine(null, { label: 'v2 new DAC', system: { name: 'Living room rig' } })
    expect(line).toBe('Living room rig · v2 new DAC')
  })

  it('returns an empty string when both snapshots are null', () => {
    expect(formatSnapshotLine(null, null)).toBe('')
  })
})

describe('formatOneSnapshot', () => {
  it('formats a single snapshot as "SystemName · label"', () => {
    expect(formatOneSnapshot({ label: 'v2 new DAC', system: { name: 'Living room rig' } }))
      .toBe('Living room rig · v2 new DAC')
  })

  it('falls back to "?" when the snapshot has no joined system', () => {
    expect(formatOneSnapshot({ label: 'v2 new DAC', system: null })).toBe('? · v2 new DAC')
  })

  it('returns null when the snapshot itself is null', () => {
    expect(formatOneSnapshot(null)).toBeNull()
  })
})
