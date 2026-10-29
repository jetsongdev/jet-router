# Worked journeys

A service from 0 to 3 costs 5. A second service from 1 to 5 costs 2: reaching 3 permits boarding the second service and reaching 5 for 7. Reaching 3 does not imply reaching 1 or 2. A service from 3 to 5 can also be boarded there, but a service ending at 3 cannot be boarded there because the endpoint is excluded. Multiple services may end at the same stop; consider every fare before using that stop for a later service. If no chain reaches the last stop, return null, not Infinity.
