export class MinTree {
  constructor(length) {
    let size = 1;
    while (size < length) size *= 2;
    this.size = size;
    this.tree = new Float64Array(size * 2);
    this.tree.fill(Infinity);
  }
  update(index, value) {
    let i = index + this.size;
    if (value >= this.tree[i]) return;
    this.tree[i] = value;
    while (i > 1) {
      i = Math.floor(i / 2);
      this.tree[i] = Math.min(this.tree[i * 2], this.tree[i * 2 + 1]);
    }
  }
  minimum(from, to) {
    let left = from + this.size;
    let right = to + this.size;
    let answer = Infinity;
    while (left < right) {
      if (left % 2) answer = Math.min(answer, this.tree[left++]);
      if (right % 2) answer = Math.min(answer, this.tree[--right]);
      left = Math.floor(left / 2);
      right = Math.floor(right / 2);
    }
    return answer;
  }
}
