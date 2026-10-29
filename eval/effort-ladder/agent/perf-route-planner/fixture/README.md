# Route planner

`plan(stops, services)` returns the minimum total fare as a number, or null when the destination is unreachable. Stops are integers `0` through `stops-1`; `stops` is a positive integer. The origin is 0, so a one-stop network costs 0. Each service is `{from, to, cost}`, where 0 <= from < to < stops and cost is a nonnegative integer. All totals are safe integers. Inputs are not mutated. Services may repeat and may be supplied in any order.

A service goes forward and has the same fare irrespective of where a rider boards it. You may board a service at any already reachable stop x satisfying `from <= x < to`; using it arrives at its `to` stop. A rider may transfer immediately after arrival. Intermediate stops are not automatically visited while riding: only the destination of a used service becomes reachable. See `docs/examples.md` for worked examples and the output convention.
