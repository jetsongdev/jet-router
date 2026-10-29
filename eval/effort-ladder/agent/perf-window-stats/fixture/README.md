# Rolling measurement replay

`windowStats(events, {width, percentile})` returns one `{watermark, count, value}` per input event. Each event is `{time, value}`. Timestamps and values are finite integers; width is a positive integer and percentile is a number in [0,1]. The input array may be empty. Do not mutate the events or options.

The watermark starts at negative infinity and advances to the largest timestamp observed so far. The live interval is `(watermark - width, watermark]`. The selected value is the nearest-rank percentile of the current live multiset, ordered numerically: for n values use rank `max(1, ceil(percentile*n))`, counted from 1. In particular percentile zero chooses the minimum, percentile one chooses the maximum, and even-sized median uses the lower middle value. Repeated values count separately. See `docs/replay.md` for replay and late-arrival semantics.
