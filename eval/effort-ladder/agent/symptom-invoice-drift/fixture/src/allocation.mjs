export function allocate(lines, discount) {
  const sum = lines.reduce((total, line) => total + line.grossCents, 0);
  if (!discount) return lines.map(() => 0);
  const shares = lines.map((line, index) => {
    const exact = discount * line.grossCents / sum;
    return { index, whole: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = discount - shares.reduce((total, item) => total + item.whole, 0);
  const ranked = [...shares].sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < remaining; i++) ranked[i].whole++;
  return shares.map((item) => item.whole);
}
