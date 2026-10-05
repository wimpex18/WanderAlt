import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

class Node {
  style: Record<string, string> = {}; children: Node[] = []; listeners = new Map<string, Function[]>();
  classes = new Set<string>(); className = ''; hidden = false; offsetLeft = 0; offsetTop = 5; offsetWidth = 100; offsetHeight = 56;
  clientWidth = 310; clientHeight = 66;
  classList = { add: (...s: string[]) => s.forEach(x => this.classes.add(x)), remove: (...s: string[]) => s.forEach(x => this.classes.delete(x)) };
  setAttribute() {} append(n: Node) { this.children.push(n); } prepend(n: Node) { this.children.unshift(n); }
  set innerHTML(html: string) { this.children = Array.from(html.matchAll(/<span class=/g), () => new Node()); }
  get innerHTML() { return 'tab'; }
  getBoundingClientRect() { return { left: 0, width: this.offsetWidth }; }
  addEventListener(s: string, fn: Function) { this.listeners.set(s, [...(this.listeners.get(s) ?? []), fn]); }
  fire(s: string, extra = {}) { for (const f of this.listeners.get(s) ?? []) f({ pointerId: 1, isPrimary: true, pointerType: 'touch', clientX: 50, preventDefault() {}, ...extra }); }
  setPointerCapture() {}
}

for (const count of [3, 4]) test(`glass copies match ${count} measured tabs; cancellation, lost capture and reset remove the drop`, () => {
  const items = Array.from({ length: count }, (_, i) => 5 + 102 * i).map(x => { const n = new Node(); n.offsetLeft = x; return n; });
  const bar = new Node(); bar.offsetWidth = 310;
  const timers = new Map<number, Function>(); let next = 0;
  const WA: Record<string, any> = {};
  const ctx = createContext({ window: { WA }, document: { createElement: () => new Node(), querySelector: () => null, addEventListener() {} },
    addEventListener() {}, requestAnimationFrame: (fn: Function) => fn(), navigator: {},
    setTimeout: (fn: Function) => { timers.set(++next, fn); return next; }, clearTimeout: (id: number) => timers.delete(id) });
  runInContext(readFileSync(new URL('../../tabbar.js', import.meta.url), 'utf8'), ctx);
  Object.assign(bar, { querySelectorAll: () => items });
  const commits: number[] = [];
  const config = { name: 'test', item: '.tab', itemClass: 'tab', current: () => 0, commitSame: false, commit: (i: number) => commits.push(i) };
  const drop = WA.glassDrop(bar, config);
  const lens = bar.children[1], copy = lens.children[0];
  assert.equal(lens.style.width, '130px');
  assert.deepEqual(copy.children.map(c => c.style.left), items.map(c => `${c.offsetLeft}px`));
  for (const event of ['pointercancel', 'lostpointercapture']) {
    bar.fire('pointerdown'); bar.fire('pointermove', { clientX: 150 });
    assert.ok(bar.classes.has('is-lifted')); bar.fire(event);
    assert.ok(!bar.classes.has('is-lifted')); assert.equal(commits.length, 0);
  }
  bar.fire('pointerdown'); drop.reset();
  for (const fn of timers.values()) fn();
  assert.ok(!bar.classes.has('is-lifted'));
  bar.fire('pointerdown'); bar.fire('pointermove', { clientX: 150 }); bar.fire('pointerup');
  assert.deepEqual(commits, [1]); assert.ok(!bar.classes.has('is-lifted'));
  config.commitSame = true; // A language popup also closes when releasing on the current choice.
  bar.fire('pointerdown'); bar.fire('pointermove', { clientX: 60 }); bar.fire('pointerup');
  assert.deepEqual(commits, [1, 0]);
});
