import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ejs from 'ejs';

test('Settings template retains controls within six distinct categories', async () => {
  const html = await ejs.renderFile('views/settings.ejs', { user: { name: 'Student', email: 'student@example.com' } });
  assert.equal((html.match(/data-settings-panel=/g) || []).length, 6);
  assert.equal((html.match(/data-settings-category=/g) || []).length, 6);
  for (const id of ['password-form', 'summary-on', 'hours-chips', 'dnd-start', 'push-test', 'canvas-row', 'ls-row', 'save', 'settings-back']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /Email delivery is not available/);
  assert.match(html, /assignments\?add_class=1/);
});

function classCreation() {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, { value: '', hidden: true, dataset: {}, handlers: {}, classList: { remove() {}, add() {} }, addEventListener(type, fn) { this.handlers[type] = fn; }, focus() {} });
    return elements.get(id);
  };
  const context = vm.createContext({ document: { addEventListener() {}, getElementById: get }, window: {}, console });
  const source = readFileSync('public/js/app.js', 'utf8');
  vm.runInContext(source, context);
  vm.runInContext(`
    LMS_SOURCES = [{ lms_source_id: 1, name: 'Manual' }];
    var createCalls = [];
    var API = { courses: { create: async fields => { createCalls.push(fields); return { ...fields, course_id: 9 }; } } };
    toast = () => {};
    var submit = {};
    ${source.slice(source.indexOf('  const classSelect =', source.indexOf('function ensureAssignmentModal')), source.indexOf('  form.addEventListener("submit"', source.indexOf('function ensureAssignmentModal')))}
  `, context);
  return { context, get };
}

test('inline class creation selects saved class without changing assignment draft', async () => {
  const { context, get } = classCreation();
  get('a-title').value = 'Keep my essay';
  get('a-notes').value = 'Draft notes';
  get('a-course-code').value = 'IS 402';
  get('a-course-name').value = 'Databases';
  get('a-course-color').value = '#237346';
  await get('a-course-save').handlers.click();
  assert.equal(context.createCalls.length, 1);
  assert.equal(context.createCalls[0].color_hex, '#237346');
  assert.equal(get('a-class').value, '9');
  assert.equal(get('a-title').value, 'Keep my essay');
  assert.equal(get('a-notes').value, 'Draft notes');
  assert.equal(get('a-new-class').hidden, true);
});

test('duplicate course codes reuse the existing class', async () => {
  const { context, get } = classCreation();
  vm.runInContext("setClasses([{ course_id: 4, course_code: 'IS 402', color_hex: '#237346', lms_source_id: 1 }])", context);
  get('a-course-code').value = 'is  402';
  get('a-course-name').value = 'Databases';
  await get('a-course-save').handlers.click();
  assert.equal(context.createCalls.length, 0);
  assert.equal(get('a-class').value, '4');
});

test('category switching preserves form values and supports connected-account deep links and mobile back', () => {
  const keys = ['account', 'password', 'notifications', 'delivery', 'connected-accounts', 'classes'];
  function el() {
    const classes = new Set();
    return { handlers: {}, dataset: {}, classList: { add: k => classes.add(k), remove: k => classes.delete(k), contains: k => classes.has(k), toggle: (k, on) => on ? classes.add(k) : classes.delete(k) }, addEventListener(type, fn) { this.handlers[type] = fn; }, setAttribute() {}, removeAttribute() {}, focus() {} };
  }
  const links = keys.map(key => ({ ...el(), dataset: { settingsCategory: key } }));
  const panels = keys.map(key => ({ ...el(), dataset: { settingsPanel: key } }));
  const elements = new Map(['settings-shell', 'settings-back', 'settings-save-actions', 'account-name', 'account-username', 'account-email', 'settings-class-list'].map(id => [id, el()]));
  const context = vm.createContext({
    document: { getElementById: id => elements.get(id), querySelectorAll: selector => selector === '[data-settings-category]' ? links : panels },
    location: { hash: '#connected-accounts' }, window: { addEventListener() {} }, history: { replaceState() {} },
    USER: { first_name: 'Test', last_name: 'Student', username: 'test', email: 'test@example.com' }, CLASSES: [],
  });
  const source = readFileSync('public/js/settings.js', 'utf8');
  vm.runInContext(source.slice(source.indexOf('  const shell'), source.indexOf('  /* ---------- Account')), context);
  assert.equal(panels[4].hidden, false);
  links[2].handlers.click({ preventDefault() {} });
  assert.equal(panels[4].hidden, true);
  assert.equal(panels[2].hidden, false);
  assert.equal(elements.get('settings-save-actions').hidden, false);
  elements.get('settings-back').handlers.click();
  assert.equal(elements.get('settings-shell').classList.contains('show-detail'), false);
  links[1].handlers.click({ preventDefault() {} });
  assert.equal(panels[1].hidden, false);
  assert.equal(elements.get('settings-save-actions').hidden, true);
});
