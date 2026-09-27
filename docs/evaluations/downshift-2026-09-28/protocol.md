# Downshift token comparison — preregistered

Question: when a user would run xhigh and production Jev recommends less, does applying that recommendation reduce reported generation tokens without observed task-quality loss?
Baseline is a user default, NOT proven minimum required effort. Model: gpt-6-astra.
Use all six existing task-quality tasks with their unchanged withheld checks. These tasks are previously seen evaluation tasks, not a fresh generalization holdout.

Route all six prompts once through the current production classifier/harness with reference xhigh, known model candidate list, and prompt-only context with missingRequired=null (matching MCP provenance). Freeze the recommendations before generation; no retuning or rerouting. Include every valid strict downshift; report keep/equal/upward/failure exclusions. Stop on routing transport errors; no retries.

For each eligible task run three independent paired repetitions: xhigh versus recommended effort. Alternate arm order by task index and round; sequential calls, no repair feedback, fresh ephemeral sessions, identical prompt/hidden checks. At most 36 model calls plus six Jev calls. A generation infrastructure error stops the experiment; keep all observations. Failed quality tests remain observations, never retried.

Primary token metric: sum of Codex-reported output_tokens per arm and paired reduction. Also report input_tokens, cached_input_tokens, reasoning_output_tokens separately. Do not add reasoning tokens again to output; never claim dollar savings from token counts. Paired per-task means and an exact task-level sign-flip test (all 2^N signs, one-sided saving hypothesis) describe consistency; small N and reused synthetic tasks limit inference. Quality regression means baseline passes but paired recommendation fails. Both-fail cases do not establish successful savings. A useful pilot signal requires >=10% aggregate output-token reduction, no observed pass-to-fail pair, and a fully completed run. Statistical uncertainty and latency/cache confounding must be explicit regardless of threshold.

Record original code, hashes, usage, tests, unique thread IDs, requested effort, execution order, CLI version and route latency. CLI effort configuration is observed; server wire setting is not. Production remains shadow-only: evaluator applies the recommendation explicitly. Jev token usage/billing are not exposed by this adapter, so total net router-inclusive savings remain unknown. A single frozen route is reused for repetitions to isolate execution; this does not estimate routing stability.

## User-requested cost-estimate extension (during execution)

The user requested price-weighted savings while the 24-call run was in progress. This adds descriptive rate-card estimates only; it does not change tasks, effort selection, tests, repetition counts, or the primary quality/token criteria above. Rates verified from official OpenAI model/pricing pages on 2026-09-28 KST and stored in pricing.json. Use Standard short-context API USD and Codex credit rates, not actual subscription invoices. All observed cache-write fields must be zero; refuse to price nonzero writes or long contexts with this limited calculator.

Show (1) each arm's observed cache counts; (2) both arms assigned the pooled observed cache fraction; (3) equal 0% cache; (4) equal 90% cache. Scenarios 2–4 are counterfactual arithmetic, not measurements. Show per-request gross saving as the maximum affordable extra router cost, conditional on passing tests. No assumed Jev unit price, exchange rate, plan discount, or repaired-task cost.
