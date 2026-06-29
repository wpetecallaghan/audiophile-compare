# Manual Testing Setup

Steps to go from an empty database to a working first test, ready for
manual verification of the test creation and detail page flows.

---

## Prerequisites

- Migration has been applied (all ten tables visible in Supabase Table Editor)
- `npm run dev` is running at `http://localhost:3000`
- Supabase dashboard is open in another tab

---

## Step 1 — Create your user account

1. Go to `http://localhost:3000/login`
2. Enter your email address and click **Send magic link**
3. Check your inbox and click the link
4. You should be redirected to `http://localhost:3000`

**Verify in Supabase:** Go to **Table Editor → users**. One row should exist
with your email. Copy your `id` (a UUID) — you will need it in step 2.

---

## Step 2 — Create a system and snapshots

The systems UI is not yet built. Run the following in **Supabase → SQL Editor**,
replacing `YOUR-USER-ID` with the UUID copied in step 1.

```sql
-- Create a system
insert into public.systems (owner_id, name, description)
values (
  'YOUR-USER-ID',
  'Main system',
  'Living room setup'
)
returning id;
```

Copy the returned system `id`, then run:

```sql
-- Create two snapshots on that system
insert into public.system_snapshots (system_id, version, label, notes, components)
values
  (
    'YOUR-SYSTEM-ID',
    1,
    'Before — stock power cable',
    'Baseline configuration',
    '[{"role":"Source","make":"Rega","model":"Planar 3","notes":""},
      {"role":"Amplifier","make":"Naim","model":"Nait 5si","notes":""},
      {"role":"Speakers","make":"ProAc","model":"Tablette 10","notes":""}]'
  ),
  (
    'YOUR-SYSTEM-ID',
    2,
    'After — upgraded power cable',
    'With Furutech power cable on the amplifier',
    '[{"role":"Source","make":"Rega","model":"Planar 3","notes":""},
      {"role":"Amplifier","make":"Naim","model":"Nait 5si","notes":""},
      {"role":"Speakers","make":"ProAc","model":"Tablette 10","notes":""}]'
  );
```

**Verify in Supabase:** Table Editor → system_snapshots should show two rows,
both linked to your system.

---

## Step 3 — Create a test through the UI

Go to `http://localhost:3000/tests/new` and complete the four-step wizard.

**Step 1 — Track**
- Search returns nothing on a fresh database — click **Add a track that isn't listed**
- Artist: `Nils Lofgren`
- Title: `Keith Don't Go`
- Album: `Acoustic Live`
- Passage note: `Opening bars` (optional)
- Click **Add track**, then **Continue**

**Step 2 — Systems**
- Select **v1 — Before — stock power cable** for Snapshot A
- Select **v2 — After — upgraded power cable** for Snapshot B
- Click **Continue**

**Step 3 — Clips**
- Clip A URL: `https://www.w3schools.com/html/horse.mp3`
- Click **Verify** — should show "Verified — direct, audio"
- Clip B URL: `https://www.w3schools.com/html/mov_bbb.mp4`
- Click **Verify** — should show "Verified — direct, video"
- Set before/after: select whichever you prefer
- Click **Continue**

> **Inline snapshot creation (optional path):**
> To test the inline creation flow, skip creating snapshots in Step 2 above.
> Instead, on the Systems wizard step:
> - [ ] At the bottom of each system group, a **+ Add new snapshot** link is visible
> - [ ] Clicking it opens an inline form with a Label input (required), Notes textarea (optional), and a note that components can be filled in later
> - [ ] Submitting with an empty label shows "Label is required" and does not submit
> - [ ] Submitting a valid label creates the snapshot and immediately selects it for that side
> - [ ] The new snapshot appears in both selectors (Snapshot A and Snapshot B columns)
> - [ ] A system with no existing snapshots still shows the **+ Add new snapshot** link (no dead-end message)
> - [ ] Both sides can have forms open independently

**Step 4 — Publish**
- Title: `Naim power cable comparison — Nils Lofgren`
- Review the summary
- Click **Publish test**

You should be redirected to `/tests/[id]`.

---

## Step 4 — Verify the test detail page

Check each of the following on the page you land on.

**As the logged-in creator:**
- [ ] Title and track info appear in the header
- [ ] Status shows "Blind test"
- [ ] Vote count in the header reads "0 votes"
- [ ] Both clips are playable — starting one pauses the other
- [ ] "Reveal before/after" button is visible
- [ ] Vote tally section is **not** visible (you haven't voted yet)
- [ ] "Cast your vote" form is visible, listing all six techniques with Clip A / Clip B radio buttons
- [ ] Submit button is disabled until at least one technique is selected

**Reveal flow:**
- [ ] Click "Reveal before/after" — confirmation panel appears
- [ ] Confirm — page refreshes, blue "Revealed" badge appears
- [ ] Clip A and Clip B are labelled as Before or After correctly

**As a logged-out visitor (open an incognito window):**
- [ ] Title and track info are visible
- [ ] Player is replaced by "Sign in to listen" prompt
- [ ] No reveal button visible
- [ ] No vote form visible
- [ ] Status shows "Blind test" (or "Revealed" if you revealed it)

---

## Step 5 — Voting flow

**Cast a vote as the creator:**
1. Return to the test detail page as your logged-in user
2. In the "Cast your vote" form, select **Clip A** for **Tune Method**
3. Add an optional observation in the textarea that appears — e.g. `Better pace`
4. Select **Clip B** for **General preference** (leave all others blank)
5. Click **Submit votes**

- [ ] Page refreshes automatically
- [ ] Heading changes to "Update your vote"
- [ ] Vote count in the header now reads "1 vote"
- [ ] Submit button now reads "Update votes"
- [ ] Vote tally section is now visible (you have voted)
- [ ] Tally shows percentage bars for each technique you voted on

**Verify you can update your vote:**
1. Change the **Tune Method** selection from Clip A to **Clip B**
2. Click **Update votes**

- [ ] Page refreshes, selections are preserved
- [ ] Vote count still reads "1 vote" (same listener — not double-counted)

**Verify the Other technique requires a description:**
1. Select **Clip A** for the **Other** technique
2. Leave the description field blank
3. Click **Update votes**

- [ ] Error message appears: `Please describe your criterion for the "Other" technique`
- [ ] No network request is made (check browser DevTools → Network)

**Verify vote visibility rules as a logged-out visitor:**
1. Open an incognito window and navigate to the same test URL

- [ ] Vote form is not shown
- [ ] Vote tally is not shown (test is still open)
- [ ] Vote count is visible in the header

**Verify a second user can vote independently:**
1. Log in as a second user (use a different email, or a private browsing session)
2. Open the same test URL

- [ ] "Cast your vote" form is shown (fresh — no pre-selections)
- [ ] Vote on at least one technique and submit
- [ ] Vote count increments to "2 votes"
- [ ] Tally is now visible for this user too

**Verify the vote form disappears after reveal:**
1. Log back in as the creator and click **Reveal before/after**
2. Confirm the reveal

- [ ] Vote form is gone (test is now revealed)
- [ ] Tally is visible to everyone, including logged-out visitors
- [ ] Vote count is still shown in the header

---

## Step 7 — Tally display

This step assumes you have at least one test where:
- Two or more users have voted on multiple techniques
- The test has been revealed

If you only have one voter, the bars will show 100 % / 0 % on every technique.
For a more realistic result, log in as a second user and cast votes that
differ from the first (e.g. first user picks Clip A for Tune Method,
second user picks Clip B).

**Percentage bars:**
- [ ] Each technique voted on shows a row with Clip A % and Clip B %
- [ ] The bar for the winning side is blue; the losing side is grey
- [ ] Percentages in a single row add up to 100
- [ ] Techniques with equal votes show 50 % / 50 % (no highlighted winner)
- [ ] The voter count below each bar matches the number of people who voted on that technique

**Divergence callout:**
- [ ] If two or more curated techniques have clear but *opposing* winners, an amber callout appears: "Interesting — techniques diverged"
- [ ] If all curated techniques agree (or only one has a clear winner), no callout appears

**Other approaches:**
- [ ] If any voter used the "Other" technique, a qualitative list appears below the bars
- [ ] Each entry shows the listener's description and their chosen clip
- [ ] Observations entered during voting appear indented under the technique row

**Logged-out visitor after reveal:**
- [ ] Open the test URL in an incognito window
- [ ] Tally section is visible even without logging in

---

## Step 8 — Systems and tracks catalogue

These pages require the middleware-protected routes, so you must be logged in.

**Tracks list — `/tracks`**
1. Navigate to `http://localhost:3000/tracks`

- [ ] The track created in Step 3 (Nils Lofgren — Keith Don't Go) is listed
- [ ] Test count next to the track reflects the number of tests using it
- [ ] Clicking the track navigates to `/tracks/[id]`

**Track detail — `/tracks/[id]`**
- [ ] Artist, title, album, and passage note are shown in the header
- [ ] A breadcrumb link returns you to `/tracks`
- [ ] The test created in Step 3 is listed
- [ ] Blind tests show a "Blind" badge; revealed tests show a "Revealed" badge
- [ ] Clicking a test navigates to `/tests/[id]`

**Systems list — `/systems`**
1. Navigate to `http://localhost:3000/systems`

- [ ] The system created in Step 2 (Main system) is listed
- [ ] The snapshot count and latest snapshot label are shown
- [ ] Clicking the system navigates to `/systems/[id]`
- [ ] Systems belonging to other users are not shown

**System detail — `/systems/[id]`**
- [ ] System name, description, and snapshots are shown
- [ ] Each snapshot shows a test history section
- [ ] The test from Step 3 appears under the correct snapshot (whichever was Clip A or Clip B)
- [ ] Blind tests show "In progress" — no outcome until revealed
- [ ] After revealing the test (Step 5 flow), the snapshot shows Win, Loss, or Draw
- [ ] Win/loss counts are correct across all tests for that snapshot

**Verify win/loss counts in SQL:**
```sql
-- Confirm revealed test outcome data (replace YOUR-TEST-ID and SNAPSHOT-IDs)
select
  t.id,
  t.status,
  t.snapshot_a_id,
  t.snapshot_b_id,
  count(v.id) filter (where v.chosen_clip_id = (
    select id from public.clips where test_id = t.id and label = 'A'
  )) as clip_a_votes,
  count(v.id) filter (where v.chosen_clip_id = (
    select id from public.clips where test_id = t.id and label = 'B'
  )) as clip_b_votes
from public.tests t
join public.votes v on v.test_id = t.id
where t.id = 'YOUR-TEST-ID'
group by t.id, t.status, t.snapshot_a_id, t.snapshot_b_id;
```

---

## Step 9 — Cross-check view

This step requires at least **two snapshots** and at least **one test** that
uses each snapshot — so the app can find a shared track with recordings for
both sides. Complete Steps 1–5 at least twice with different snapshot pairs
before attempting this.

**Access the cross-check section:**
1. Navigate to `http://localhost:3000/systems/[id]`
2. Scroll to the bottom of the page — the **Cross-check** section appears below
   the per-snapshot history

**Snapshot pickers:**
- [ ] Two dropdowns are shown — "Snapshot A" and "Snapshot B"
- [ ] Selecting the same snapshot in both dropdowns disables that option in the
      other select (an option is greyed out / unselectable once chosen)
- [ ] Selecting a second distinct snapshot triggers an automatic query (no
      button click required)
- [ ] "Finding shared tracks…" loading text appears briefly while the query runs

**No shared tracks:**
1. Select a snapshot pair that has never been tested on the same recording
- [ ] "No shared tracks found — these snapshots haven't been tested on the same
      recording yet." message appears

**Shared tracks found:**
1. Select a snapshot pair where both have been tested on the same track
- [ ] A card appears for each shared track showing: artist — title, album, and
      provider/media-type badges for both clips
- [ ] A **Create test** button appears for tracks without an existing cross-check test

**Create a cross-check test:**
1. Click **Create test** on a shared track
- [ ] Button shows "Creating…" while the request is in flight
- [ ] On success you are redirected to `/tests/[newId]`
- [ ] The new test is blind (status "open"), title includes "Cross-check"
- [ ] The clips are playable on the test detail page

**Existing test detection:**
1. Return to `/systems/[id]` and select the same snapshot pair again
- [ ] The card for the just-created test shows **Test exists →** link instead of
      a "Create test" button
- [ ] Clicking the link navigates to the existing test

**Verify in SQL:**
```sql
-- Confirm the cross-check test was created correctly
-- (replace the snapshot IDs with your values)
select
  t.id,
  t.title,
  t.status,
  t.snapshot_a_id,
  t.snapshot_b_id,
  cm.before_clip_id,
  cm.after_clip_id
from public.tests t
join public.clip_mapping cm on cm.test_id = t.id
where t.title ilike '%cross-check%'
order by t.created_at desc
limit 5;
```

The `before_clip_id` should correspond to the lower-version snapshot, and
`after_clip_id` to the higher-version snapshot.

---

## Step 6 — Verify security rules in SQL

Run these in the SQL editor to confirm the data is correct.

```sql
-- Confirm source_ref is null for web-created tests
select id, title, status, revealed_at, source_ref
from public.tests;

-- Confirm clip_mapping was written
select * from public.clip_mapping;

-- Confirm both clips exist with correct labels
select id, label, provider, media_type, url_status
from public.clips
order by label;

-- Confirm listening_techniques are seeded
select name, sort_order, is_other
from public.listening_techniques
order by sort_order;

-- Confirm votes were recorded (replace YOUR-TEST-ID)
select
  u.email,
  lt.name  as technique,
  c.label  as chose_clip,
  v.observation,
  v.other_description
from public.votes v
join public.users              u  on u.id  = v.user_id
join public.listening_techniques lt on lt.id = v.technique_id
join public.clips              c  on c.id  = v.chosen_clip_id
where v.test_id = 'YOUR-TEST-ID'
order by u.email, lt.sort_order;

-- Confirm distinct voter count matches what the UI shows
select public.test_vote_count('YOUR-TEST-ID');
```

---

## Resetting between test runs

To clear all test data without dropping the schema:

```sql
-- Deletes cascade through foreign keys in the correct order
delete from public.comments;
delete from public.votes;
delete from public.clip_mapping;
delete from public.clips;
delete from public.tests;
delete from public.tracks;
delete from public.system_snapshots;
delete from public.systems;
-- Leave users intact so you don't need to log in again
```

To also remove your user and start completely fresh, add:

```sql
delete from public.users;
-- Then delete the corresponding row in auth.users via
-- Supabase dashboard → Authentication → Users
```
