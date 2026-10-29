export class Fenwick {
  constructor(length) {
    this.length = length;
    this.tree = new Int32Array(length + 1);
  }

  add(index, delta) {
    for (let i = index + 1; i <= this.length; i += i & -i) {
      this.tree[i] += delta;
    }
  }

  select(rank) {
    let index = 0;
    let bit = 1;
    while (bit * 2 <= this.length) bit *= 2;
    while (bit > 0) {
      const next = index + bit;
      if (next <= this.length && this.tree[next] < rank) {
        rank -= this.tree[next];
        index = next;
      }
      bit = Math.floor(bit / 2);
    }
    return index;
  }
}
