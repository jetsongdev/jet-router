export function costFromUsage(usage, {batch = false} = {}) {
 const u = usage ?? {};
 const c = u.cache_creation;
 const five = c ? (c.ephemeral_5m_input_tokens ?? 0) : (u.cache_creation_input_tokens ?? 0);
 const hour = c?.ephemeral_1h_input_tokens ?? 0;
 return ((u.input_tokens ?? 0)*4 + (u.output_tokens ?? 0)*20 + (u.cache_read_input_tokens ?? 0)*0.2 + five*5 + hour*8)/1e6*(batch ? 0.5 : 1);
}
