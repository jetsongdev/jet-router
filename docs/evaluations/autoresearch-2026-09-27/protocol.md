# Jev instruction research protocol

Reference: https://github.com/karpathy/autoresearch/blob/master/program.md

Before results: freeze the corpus, scorer and gates. Modify only an added shadow effort instruction
in isolated temporary source copies. Preserve response validation, host safety policy and transport.
The existing 12 pilot cases are now development data, including the previously inspected holdout.
Eight new cases in eval/research-holdout.mjs are reserved for one final paired check.

Each trial: 12 cases × 3 rounds × 2 arms = at most 72 sequential calls. Alternate arm order.
No retry; first transport/schema failure stops the trial, records failure, and rejects the candidate.
A failed trial counts toward no-improvement, not evidence of equivalent quality.
No task execution or actual effort changes. Key comes only from the previously designated project .env.

Adopt only if complete and candidate gains at least 2/36 hypothesis matches (5.56 percentage points),
with zero call failures and no increase in required-keep misses or unnecessary keeps.
These are operational selection gates, not statistical significance or calibrated task accuracy.
A single hypothesis per trial; compare with the current best, keep or discard, then log the result.
Stop after at least 3 trials and 3 consecutive trials without adoption. An adoption resets the streak.

Final: original vs best on 8 fresh cases × 3 rounds × 2 arms (48 calls), no retuning using its results.
Require no loss in matches and no added failures/required-keep misses/unnecessary keeps to ship.
If no candidate was adopted, final check can be omitted because production instructions are unchanged.
Preserve all results, rejected instructions and source/request hashes. Do not weaken gates after seeing scores.
