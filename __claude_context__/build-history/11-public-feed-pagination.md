---
name: audiophile-compare-build-history-11
description: Build step 11 — Public feed + pagination.
---

# ✅ 11 — Public feed + pagination

`app/page.tsx` — server component, public. `?page=N`; `PAGE_SIZE=20`; `.range()` + `count: 'exact'`.
`FeedCard` server component. Normalises Supabase array/object join ambiguity before passing typed props.
