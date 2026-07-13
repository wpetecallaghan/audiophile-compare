import { describe, it, expect } from 'vitest'
import { getAdjacentIds } from '../get-adjacent-ids'

describe('getAdjacentIds', () => {
  const ids = ['a', 'b', 'c', 'd']

  it('returns prev/next/first/last for an id in the middle of the list', () => {
    expect(getAdjacentIds(ids, 'b')).toEqual({
      prevId: 'a',
      nextId: 'c',
      firstId: 'a',
      lastId: 'd',
    })
  })

  it('hides prev/first for the id at the start of the list', () => {
    expect(getAdjacentIds(ids, 'a')).toEqual({
      prevId: null,
      nextId: 'b',
      firstId: null,
      lastId: 'd',
    })
  })

  it('hides next/last for the id at the end of the list', () => {
    expect(getAdjacentIds(ids, 'd')).toEqual({
      prevId: 'c',
      nextId: null,
      firstId: 'a',
      lastId: null,
    })
  })

  it('hides everything for a single-item list', () => {
    expect(getAdjacentIds(['only'], 'only')).toEqual({
      prevId: null,
      nextId: null,
      firstId: null,
      lastId: null,
    })
  })

  it('hides everything when currentId is not present in ids', () => {
    expect(getAdjacentIds(ids, 'missing')).toEqual({
      prevId: null,
      nextId: null,
      firstId: null,
      lastId: null,
    })
  })

  it('hides everything for an empty ids array', () => {
    expect(getAdjacentIds([], 'a')).toEqual({
      prevId: null,
      nextId: null,
      firstId: null,
      lastId: null,
    })
  })
})
