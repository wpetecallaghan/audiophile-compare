-- Step 57: Audiophile Compare now only offers Tune Method when casting a
-- new vote — a product decision that blind clips/phone recordings can't
-- reliably carry the cues the other five techniques depend on (absolute
-- tonal balance, soundstage precision, treble/bass extremes), while
-- Tune Method's rhythm/timing/musical-flow focus survives that
-- degradation. Deactivating rather than deleting: past votes cast under
-- PRaT / Tonal / Frequency balance / Soundstage & imaging / General
-- preference / Other stay exactly as they are, and every existing test's
-- results still render its full historical per-technique breakdown
-- (computeTally/TallyDisplay are untouched) — only what a NEW vote can be
-- cast under changes. is_active = false already has well-defined,
-- pre-existing meaning everywhere it's read (app/tests/[id]/page.tsx's
-- technique fetch, POST /api/votes' active-technique check): a
-- deactivated technique's past votes persist untouched in the DB/tally
-- but stops being offered on the vote form going forward.
update public.listening_techniques
set is_active = false
where name <> 'Tune Method';
