import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('mobile drawer manages focus, background access, dismissal, and desktop resizing', () => {
  const elements = new Map();
  let focused;
  function element() {
    const classes = new Set();
    return { handlers: {}, attributes: {}, inert: false, hidden: false,
      classList: { toggle(key, on) { on ? classes.add(key) : classes.delete(key); }, contains: key => classes.has(key) },
      addEventListener(type, fn) { this.handlers[type] = fn; },
      getAttribute(key) { return this.attributes[key]; },
      setAttribute(key, value) { this.attributes[key] = value; }, removeAttribute(key) { delete this.attributes[key]; },
      focus() { focused = this; }, getClientRects: () => [1],
    };
  }
  for (const id of ['sidebar', 'menu-open', 'menu-close', 'nav-scrim', 'main-content', 'header', 'filters', 'filter-button']) elements.set(id, element());
  const get = id => elements.get(id);
  get('filter-button').dataset = { mobileDisclosure: 'filters' };
  get('filter-button').attributes['aria-expanded'] = 'false';
  const link = element();
  get('sidebar').querySelectorAll = selector => selector === 'a' ? [link] : [get('menu-close'), link];
  get('sidebar').contains = el => [get('menu-close'), link].includes(el);
  const mobile = { matches: true, addEventListener(type, fn) { this.change = fn; } };
  const document = { body: element(), getElementById: get, querySelector: () => get('header'), querySelectorAll: () => [get('filter-button')], handlers: {}, addEventListener(type, fn) { this.handlers[type] = fn; }, get activeElement() { return focused; } };
  vm.runInNewContext(readFileSync('public/js/navigation.js', 'utf8'), { document, window: { matchMedia: () => mobile } });
  get('filter-button').handlers.click();
  assert.equal(get('filters').classList.contains('is-open'), true);
  assert.equal(get('filter-button').attributes['aria-expanded'], 'true');
  get('filter-button').handlers.click();
  assert.equal(get('filters').classList.contains('is-open'), false);
  assert.equal(get('filter-button').attributes['aria-expanded'], 'false');
  assert.equal(get('sidebar').inert, true);
  get('menu-open').handlers.click();
  assert.equal(get('sidebar').inert, false);
  assert.equal(get('main-content').inert, true);
  assert.equal(get('header').inert, true);
  assert.equal(get('sidebar').attributes['aria-modal'], 'true');
  assert.equal(focused, get('menu-close'));
  let prevented = false;
  document.handlers.keydown({ key: 'Tab', shiftKey: true, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(focused, link);
  document.handlers.keydown({ key: 'Escape', preventDefault() {} });
  assert.equal(focused, get('menu-open'));
  assert.equal(get('main-content').inert, false);
  assert.equal(get('nav-scrim').hidden, true);
  get('menu-open').handlers.click();
  get('nav-scrim').handlers.click();
  assert.equal(get('menu-open').attributes['aria-expanded'], 'false');
  mobile.matches = false;
  mobile.change();
  assert.equal(get('sidebar').inert, false);
  assert.equal(document.body.classList.contains('navigation-open'), false);
});
