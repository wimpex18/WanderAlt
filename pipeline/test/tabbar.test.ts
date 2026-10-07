import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

class Node {
  style: Record<string, string> = {}; children: Node[] = []; listeners = new Map<string, Function[]>();
  classes = new Set<string>(); className = ''; hidden = false; offsetLeft = 0; offsetTop = 5; offsetWidth = 100; offsetHeight = 56;
  clientWidth = 310; clientHeight = 66;
  classList = { add: (...s: string[]) => s.forEach(x => this.classes.add(x)), remove: (...s: string[]) => s.forEach(x => this.classes.delete(x)) };
  parent: Node | null = null; capture?: (node: Node, id: number) => void;
  setAttribute() {} append(n: Node) { this.children.push(n); } prepend(n: Node) { this.children.unshift(n); }
  set innerHTML(html: string) { this.children = Array.from(html.matchAll(/<span class=/g), () => new Node()); }
  get innerHTML() { return 'tab'; }
  getBoundingClientRect() { return { left: 0, width: this.offsetWidth }; }
  addEventListener(s: string, fn: Function) { this.listeners.set(s, [...(this.listeners.get(s) ?? []), fn]); }
  fire(s: string, extra = {}) {
    const event = { type: s, pointerId: 1, isPrimary: true, pointerType: 'touch', clientX: 50, target: this, preventDefault() {}, ...extra };
    for (let node: Node | null = this; node; node = node.parent) for (const f of node.listeners.get(s) ?? []) f(event);
  }
  setPointerCapture(id: number) { this.capture?.(this, id); }
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

/** Capture changes become got/lost events before the next pointer event, and bubble
 * from the old child through the bar, as they do in a real browser. */
function touchControl(count: number, closeOnCommit = false) {
  const bar = new Node(); bar.clientWidth = bar.offsetWidth = count * 102 + 4;
  const items = Array.from({ length: count }, (_, i) => { const n = new Node(); n.offsetLeft = 5 + i * 102; n.parent = bar; return n; });
  const icon = new Node(); icon.parent = items[0];
  let currentCapture: Node | null = null, pendingCapture: Node | null = null, selected = 0;
  const capture = (n: Node) => { pendingCapture = n; };
  [bar, ...items, icon].forEach(n => { n.capture = capture; });
  const timers = new Map<number, { fn: Function; delay: number }>(); let next = 0;
  const WA: Record<string, any> = {}, events = new Map<string, Function>();
  const ctx = createContext({ window: { WA }, document: { createElement: () => new Node(), querySelector: () => null, addEventListener() {} },
    addEventListener: (name: string, fn: Function) => events.set(name, fn), requestAnimationFrame: (fn: Function) => fn(), navigator: {},
    setTimeout: (fn: Function, delay: number) => { timers.set(++next, { fn, delay }); return next; }, clearTimeout: (id: number) => timers.delete(id) });
  runInContext(readFileSync(new URL('../../tabbar.js', import.meta.url), 'utf8'), ctx);
  Object.assign(bar, { querySelectorAll: () => items });
  const commits: number[] = [];
  const slider = WA.glassDrop(bar, { name:'test', item:'.tab', itemClass:'tab', current:()=>selected,
    enabled:()=>!bar.hidden, commitSame:closeOnCommit, commit:(i: number)=>{ selected=i; commits.push(i); if(closeOnCommit) { bar.hidden=true; slider.reset(); } } });
  const process = () => {
    if (currentCapture !== pendingCapture) {
      if (currentCapture) currentCapture.fire('lostpointercapture');
      if (pendingCapture) pendingCapture.fire('gotpointercapture');
      currentCapture = pendingCapture;
    }
  };
  const pointer = (type: string, x: number, target = icon) => {
    process(); (currentCapture || target).fire(type, { clientX:x });
    if (type === 'pointerup' || type === 'pointercancel') { pendingCapture=null; process(); }
  };
  return { bar, items, icon, commits, slider, pointer, events,
    hold:()=>{ for(const [id,t] of timers) if(t.delay===140) { timers.delete(id); t.fn(); } },
    lose:()=>{ pendingCapture=null; process(); }, capture:()=>currentCapture };
}

for (const [name,count,close] of [['footer',4,false],['language',4,true],['map',3,false],['days',4,false]] as const) {
  test(`${name} touch sliding survives multiple moves from the icon and commits once on release`, () => {
    const p=touchControl(count,close);
    p.pointer('pointerdown',55);
    let last='';
    for(const x of [90,150,210,count*102-40]) {
      p.pointer('pointermove',x);
      assert.ok(p.bar.classes.has('is-lifted'), 'capture transfer must not cancel the slide');
      const transform=p.bar.children[1].style.transform;
      assert.notEqual(transform,last, 'the drop follows each move'); last=transform;
      assert.equal(p.commits.length,0);
      assert.equal(p.capture(),p.icon, 'capture stays on the initial target');
    }
    p.pointer('pointerup',count*102-40);
    assert.deepEqual(p.commits,[count-1]);
    assert.ok(!p.bar.classes.has('is-lifted'));
    assert.equal(p.bar.hidden,close);
    // Closing the language popup must not let its follow-up click choose twice.
    let prevented=false;
    p.bar.fire('click',{ preventDefault:()=>{ prevented=true; }, stopPropagation() {} });
    assert.equal(prevented,true);
    assert.deepEqual(p.commits,[count-1]);
  });
}

test('touch hold, cancellation, lost capture and blur return the selector to rest', () => {
  for(const end of ['pointercancel','lostpointercapture','blur']) {
    const p=touchControl(4); p.pointer('pointerdown',55); p.hold();
    assert.ok(p.bar.classes.has('is-lifted')); p.pointer('pointermove',200);
    if(end==='lostpointercapture') p.lose(); else if(end==='blur') p.events.get('blur')!(); else p.pointer(end,200);
    assert.ok(!p.bar.classes.has('is-lifted')); assert.equal(p.commits.length,0);
    p.pointer('pointerup',200); assert.equal(p.commits.length,0);
  }
});

test('a quick touch tap preserves the button target without committing a slide', () => {
  const p=touchControl(4);
  const seen: string[]=[]; p.items[0].addEventListener('pointerup',()=>seen.push('button up'));
  p.pointer('pointerdown',55,p.items[0]); p.pointer('pointerup',55);
  assert.deepEqual(seen,['button up']); assert.equal(p.commits.length,0);
  assert.ok(!p.bar.classes.has('is-lifted'));
});


test('a cancelled touch slide does not swallow the next quick tap', () => {
  const p=touchControl(3); p.pointer('pointerdown',55); p.pointer('pointermove',200); p.pointer('pointercancel',200);
  p.pointer('pointerdown',157,p.items[1]); p.pointer('pointerup',157);
  Object.assign(p.items[1],{closest:()=>p.items[1]});
  let prevented=false;
  p.items[1].fire('click',{preventDefault:()=>{prevented=true;},stopPropagation(){}});
  assert.equal(prevented,false); assert.equal(p.commits.length,0);
});

test('releasing on the highlighted Now tab opens its parent from a child destination', () => {
  for (const ariaCurrent of ['location', 'page']) {
    const bar = new Node(); bar.offsetWidth = bar.clientWidth = 412;
    const items = Array.from({ length:4 }, (_, i) => Object.assign(new Node(), {
      offsetLeft:5 + i * 102, href:`https://wanderalt.app/${i ? 'map' : 'index'}.html`,
      getAttribute:(name: string) => name === 'aria-current' && i === 0 ? ariaCurrent : null,
    }));
    Object.assign(bar, { querySelectorAll:() => items });
    const timers = new Map<number, { fn:Function; delay:number }>(); let next = 0;
    const location = { href:'https://wanderalt.app/discover.html' };
    const context = createContext({ window:{ WA:{} }, location,
      document:{ createElement:() => new Node(), querySelector:(s: string) => s === '.wa-tabbar' ? bar : null, addEventListener() {} },
      matchMedia:() => ({ matches:true }), navigator:{}, localStorage:{ getItem:() => null },
      addEventListener() {}, requestAnimationFrame:(fn: Function) => fn(), setInterval:() => 0,
      setTimeout:(fn: Function, delay: number) => { timers.set(++next, { fn, delay }); return next; },
      clearTimeout:(id: number) => timers.delete(id) });
    runInContext(readFileSync(new URL('../../tabbar.js', import.meta.url), 'utf8'), context);
    bar.fire('pointerdown');
    for (const [id, timer] of timers) if (timer.delay === 140) { timers.delete(id); timer.fn(); }
    bar.fire('pointerup');
    assert.equal(location.href, ariaCurrent === 'location' ? 'https://wanderalt.app/index.html' : 'https://wanderalt.app/discover.html');
  }
});
