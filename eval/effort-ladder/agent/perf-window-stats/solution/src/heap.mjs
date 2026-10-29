export class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  peek() { return this.items[0]; }
  push(item) {
    const items = this.items;
    let index = items.length;
    items.push(item);
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (items[parent].time <= item.time) break;
      items[index] = items[parent];
      index = parent;
    }
    items[index] = item;
  }
  pop() {
    const items = this.items;
    const first = items[0];
    const last = items.pop();
    if (items.length === 0) return first;
    let index = 0;
    while (true) {
      let child = index * 2 + 1;
      if (child >= items.length) break;
      if (child + 1 < items.length && items[child + 1].time < items[child].time) child++;
      if (items[child].time >= last.time) break;
      items[index] = items[child];
      index = child;
    }
    items[index] = last;
    return first;
  }
}
