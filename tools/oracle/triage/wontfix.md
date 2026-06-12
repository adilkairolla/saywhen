# Oracle wontfix — deliberate semantic differences vs chrono

First sweep: 2026-06-13, agreement 115/131 (87.8%), chrono-node 2.9.x.
All 16 diffs fall into the three families below; none violate our own spec.

| family | example | ours | chrono | rationale |
| --- | --- | --- | --- | --- |
| this/next/last <weekday> | last monday | 2026-06-01 | 2026-06-08 | spec: this/next/last are week-relative (plan 01 resolver semantics); chrono uses most-recent-past / upcoming-occurrence |
| this/next/last <weekday> | this monday | 2026-06-08 | 2026-06-15 | same week-relative rule: "this X" = X of the current week (can be past with allowPast) |
| bare <weekday> | tuesday | 2026-06-16 | 2026-06-09 | spec: bare weekday = next occurrence (incl. today); chrono resolves into the current calendar week, even when past. Only weekdays earlier in the week than the Friday reference diverge (tue/wed/thu), confirming the pattern |
| bare <month> <day> | december 15 | 2026-12-15 | 2025-12-15 | spec: month+day without year rolls forward to the next occurrence; chrono picks the chronologically nearest (Dec 2025 is closer to June 2026 than Dec 2026). "december 1" agrees because forward is nearest there |
