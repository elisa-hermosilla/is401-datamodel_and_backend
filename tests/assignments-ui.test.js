import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ejs from 'ejs';

function app() {
  const context = vm.createContext({ document: { addEventListener() {} }, window: {}, console });
  vm.runInContext(readFileSync('public/js/app.js', 'utf8'), context);
  vm.runInContext(`
    LMS_SOURCES = [{ lms_source_id: 1, name: 'Manual' }];
    setClasses([{ course_id: 1, course_code: 'IS 401', color_hex: '#173b60', lms_source_id: 1 }]);
    ASSIGNMENTS = [{ assignment_id: 7, course_id: 1, title: '<Essay>', due_at: '2026-11-12T18:00:00Z', notes: 'My notes' }];
  `, context);
  return context;
}

test('assignment cards escape content and separate details, edit, notes, completion', () => {
  const context = app();
  const html = vm.runInContext('assignmentRow(ASSIGNMENTS[0], { details: true })', context);
  assert.match(html, /&lt;Essay&gt;/);
  assert.match(html, /data-card-view="7"/);
  assert.match(html, /data-view="7"/);
  assert.match(html, /data-edit-assignment="7"/);
  assert.match(html, /data-edit-note="7"/);
  assert.match(html, /aria-pressed="false"/);
  assert.doesNotMatch(html, /data-open=/);
  assert.match(vm.runInContext('assignmentRow(ASSIGNMENTS[0])', context), /data-open="7"/);
});

test('card background opens details while interactive children stay independent', () => {
  const context = app();
  vm.runInContext(`
    var calls = [];
    openAssignmentView = id => calls.push(id);
    var handler;
    var card = { dataset: { cardView: '7' }, addEventListener: (type, fn) => handler = fn };
    var container = { dataset: { noteActionsBound: 'true' }, querySelectorAll: selector => selector === '[data-card-view]' ? [card] : [] };
    bindChecks(container, () => {});
    handler({ target: { closest: () => null } });
    handler({ target: { closest: () => ({}) } });
  `, context);
  assert.equal(JSON.stringify(context.calls), '[7]');
});

test('Assignments template renders skeleton placeholders and page controls', async () => {
  const html = await ejs.renderFile('views/assignments.ejs', { user: { name: 'Student', email: 'student@example.com' } });
  assert.equal((html.match(/class="card assignments-skeleton"/g) || []).length, 3);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /id="show-done"/);
  assert.match(html, /id="class-form"/);
  assert.match(html, /id="confirm-delete"/);
});

test('class collapse persists through re-render and removes hidden content from keyboard navigation', () => {
  const context = app();
  const source = readFileSync('public/js/assignments.js', 'utf8');
  const renderSection = source.slice(source.indexOf('  const showDone'), source.indexOf('  /* ---------- Add / edit class ---------- */'));
  vm.runInContext(`
    USER = { user_id: 42 };
    var savedState = null;
    var localStorage = { getItem: () => savedState, setItem: (key, value) => savedState = value };
    var toggleAllHandler;
    var toggleAllButton = { addEventListener: (type, fn) => toggleAllHandler = fn };
    document.querySelectorAll = () => [button];
    var toggleHandler;
    var attributes = {};
    var panel = { inert: false };
    var button = {
      dataset: { toggle: '1' },
      addEventListener: (type, fn) => toggleHandler = fn,
      setAttribute: (name, value) => attributes[name] = value,
      getAttribute: () => 'class-body-1',
      closest: () => ({ classList: { toggle() {} } })
    };
    var grid = {
      innerHTML: '', setAttribute() {},
      querySelectorAll: selector => selector === '[data-toggle]' ? [button] : []
    };
    var showDoneElement = { checked: false, addEventListener() {} };
    document.getElementById = id => id === 'class-grid' ? grid : id === 'show-done' ? showDoneElement : id === 'toggle-all-classes' ? toggleAllButton : panel;
    bindChecks = () => {};
    ${renderSection}
    render();
    toggleHandler();
  `, context);
  assert.equal(context.savedState, '[1]');
  assert.equal(context.toggleAllButton.textContent, 'Expand All');
  assert.equal(context.attributes['aria-expanded'], 'false');
  assert.equal(context.panel.inert, true);
  vm.runInContext('render()', context);
  assert.match(context.grid.innerHTML, /is-collapsed/);
  assert.match(context.grid.innerHTML, /aria-expanded="false"/);
  vm.runInContext('toggleHandler()', context);
  assert.equal(context.panel.inert, false);
  assert.equal(context.attributes['aria-expanded'], 'true');
  assert.equal(context.savedState, '[]');
  assert.match(context.grid.innerHTML, /1 remaining<\/strong> of 1/);
  vm.runInContext('toggleAllHandler()', context);
  assert.equal(context.panel.inert, true);
  assert.equal(context.savedState, '[1]');
  vm.runInContext('toggleAllHandler()', context);
  assert.equal(context.panel.inert, false);
  assert.equal(context.savedState, '[]');
  // A new page visit reads the previous state for this signed-in user.
  vm.runInContext(`savedState = '[1]'; (function () { ${renderSection} render(); })()`, context);
  assert.match(context.grid.innerHTML, /aria-expanded="false"/);
});
