---
name: audit
description: Full-surface pattern migration audit
---

Given a pattern to standardize ($ARGUMENTS):
1. ripgrep the whole repo for every occurrence; print the complete file list with counts
2. Wait for my confirmation of scope
3. Migrate all files
4. Re-run the same ripgrep and prove zero remaining occurrences
