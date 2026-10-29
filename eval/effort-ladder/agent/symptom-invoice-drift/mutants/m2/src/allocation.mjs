export function allocate(lines, discount) {
  if (!discount) return lines.map(() => 0);
  const sum = lines.reduce((total, line) => total + BigInt(line.grossCents), 0n);
  const shares = lines.map((line, index) => {
    const product = BigInt(discount) * BigInt(line.grossCents);
    return { index, id: line.id, whole: Number(product / sum), remainder: product % sum };
  });
  const remaining = discount - shares.reduce((total, item) => total + item.whole, 0);
  const ranked = [...shares].sort((a, b) => {
    if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
    return a.index - b.index;
  });
  for (let i = 0; i < remaining; i++) ranked[i].whole++;
  return shares.map((item) => item.whole);
}
