-- Step 57 follow-up: the seeded description for the Tune Method row
-- ("Assesses rhythmic coherence, pace, and timing — whether the music
-- flows naturally") conflates Tune Method with PRaT (a separate row, now
-- deactivated — see 20260712170000_deactivate_non_tune_method_techniques.sql).
-- Per the two source documents backing this app's About page explanation
-- (Linn's "Tune Dem" and Lejonklou's "Tune Method"), the method is about
-- following the tune/melody itself — not rhythm, pace, or timing — so the
-- description shown alongside "Tune Method" on the vote form contradicted
-- the About page's own explanation. Corrected to match.
update public.listening_techniques
set description = 'Assesses how easily you can follow the tune — not tone, detail, or overall character'
where name = 'Tune Method';
