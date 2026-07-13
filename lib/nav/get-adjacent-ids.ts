export type AdjacentIds = {
  prevId: string | null
  nextId: string | null
  firstId: string | null
  lastId: string | null
}

// Position math shared by any item-to-item footer nav (First/Previous/
// Next/Last) — takes a same-order id list and the current id, and reads
// neighbors off by array position. Callers own building `ids` in whatever
// order/filter their originating list uses; this only does the arithmetic.
export function getAdjacentIds(ids: string[], currentId: string): AdjacentIds {
  const idx = ids.indexOf(currentId)
  return {
    prevId: idx > 0 ? ids[idx - 1] : null,
    nextId: idx !== -1 && idx < ids.length - 1 ? ids[idx + 1] : null,
    firstId: idx > 0 ? ids[0] : null,
    lastId: idx !== -1 && idx < ids.length - 1 ? ids[ids.length - 1] : null,
  }
}
