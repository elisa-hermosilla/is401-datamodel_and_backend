import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ejs from 'ejs';

function calendar(date = '2026-11-12', gridHeight) {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: '', checked: false, innerHTML: '', dataset: {}, handlers: {},
      style: { setProperty(name, value) { this[name] = value; } }, classList: { remove() {} },
      addEventListener(type, fn) { this.handlers[type] = fn; },
      setAttribute(name, value) { this[name] = value; },
      querySelectorAll(selector) {
        if (selector !== '[data-date]') return [];
        return [...this.innerHTML.matchAll(/data-date="([^"]+)"/g)].map(match => {
          const button = element(`date-${match[1]}`);
          button.dataset.date = match[1];
          return button;
        });
      }, querySelector() { return null; },
      focus() {}, scrollIntoView() {},
    });
    return elements.get(id);
  }
  const context = vm.createContext({ document: { addEventListener() {}, getElementById: element, querySelector: () => element('main') }, window: {}, location: { search: `?date=${date}` }, URLSearchParams, console });
  vm.runInContext(readFileSync('public/js/app.js', 'utf8'), context);
  vm.runInContext(`
    LMS_SOURCES = [{ lms_source_id: 1, name: 'Manual' }];
    setClasses([{ course_id: 1, course_code: 'IS 402', course_name: 'Database Systems', color_hex: '#237346', lms_source_id: 1 }]);
    ASSIGNMENTS = Array.from({ length: 6 }, (_, i) => ({ assignment_id: i + 1, course_id: 1, course_code: 'IS 402', title: 'Project ' + (i + 1), due_at: '2026-11-12T12:00:00', estimated_minutes: 10 }));
  `, context);
  const source = readFileSync('public/js/calendar.js', 'utf8');
  vm.runInContext(source.slice(source.indexOf('function main()')), context);
  if (gridHeight) element('cal-grid').clientHeight = gridHeight;
  vm.runInContext('main()', context);
  return { element, context };
}

test('month shows three previews plus overflow and daily pagination', () => {
  const { element } = calendar();
  assert.equal((element('cal-grid').innerHTML.match(/class="cal-preview /g) || []).length, 3);
  assert.match(element('cal-grid').innerHTML, /\+3 more/);
  assert.equal(element('day-page').textContent, '1–4 of 6');
  element('day-next-page').handlers.click();
  assert.equal(element('day-page').textContent, '5–6 of 6');
  assert.equal(element('cal-grid')['aria-busy'], 'false');
});

test('search filters month and agenda by title and class and clears cleanly', () => {
  const { element } = calendar();
  element('calendar-search').value = 'Database project 5';
  element('calendar-search').handlers.input();
  assert.match(element('cal-grid').innerHTML, /Project 5/);
  assert.doesNotMatch(element('day-list').innerHTML, /Project 1/);
  assert.match(element('day-list').innerHTML, /Project 5/);
  assert.equal(element('calendar-search-status').textContent, '1 matching assignment');
  element('calendar-search').value = 'no match';
  element('calendar-search').handlers.input();
  assert.match(element('day-list').innerHTML, /No matching assignments/);
  assert.match(element('calendar-search-status').textContent, /0 matching assignments/);
  element('calendar-search-clear').handlers.click();
  assert.equal(element('calendar-search').value, '');
  assert.equal(element('calendar-search-clear').hidden, true);
  assert.match(element('day-list').innerHTML, /Project 1/);
});

test('overflow selection exposes every assignment for the day', () => {
  const { element } = calendar();
  element('date-2026-11-12').handlers.click({ target: { closest: () => ({}) } });
  assert.equal(element('day-pagination').hidden, true);
  assert.match(element('day-list').innerHTML, /Project 6/);
  // Arrow navigation still advances a day and updates its agenda.
  element('next-day').handlers.click();
  assert.match(element('day-sub').textContent, /November 13, 2026/);
  element('prev-day').handlers.click();
  assert.match(element('day-list').innerHTML, /Project 1/);
});

test('calendar template includes accessible search and initial skeletons', async () => {
  const html = await ejs.renderFile('views/calendar.ejs', { user: { name: 'Student', email: 'student@example.com' } });
  assert.match(html, /aria-label="Search assignments by title or class"/);
  assert.match(html, /calendar-loading/);
  assert.equal((html.match(/class="calendar-skeleton-cell"/g) || []).length, 42);
});


test('five- and six-week months adapt preview counts to available grid height', () => {
  const { element } = calendar('2026-11-12', 600);
  assert.equal(element('cal-grid').style['--calendar-weeks'], 5);
  assert.equal((element('cal-grid').innerHTML.match(/class="cal-preview /g) || []).length, 3);
  // August 2026 starts on Saturday and requires six rows.
  const six = calendar('2026-08-12', 600);
  assert.equal(six.element('cal-grid').style['--calendar-weeks'], 6);
  // Move fixture assignments into this six-week month, then re-render via filter.
  vm.runInContext("ASSIGNMENTS.forEach(a => a.due_at = '2026-08-12T12:00:00')", six.context);
  six.element('calendar-completed').handlers.change();
  assert.equal((six.element('cal-grid').innerHTML.match(/class="cal-preview /g) || []).length, 2);
  assert.match(six.element('cal-grid').innerHTML, /\+4 more/);
  six.element('next-month').handlers.click();
  assert.equal(six.element('cal-grid').style['--calendar-weeks'], 5);
  assert.equal(six.element('month-label').textContent, 'September 2026');
  six.element('prev-month').handlers.click();
  assert.equal(six.element('cal-grid').style['--calendar-weeks'], 6);
});

test('short grid shows overflow instead of clipping hidden previews', () => {
  const { element } = calendar('2026-11-12', 380);
  assert.equal((element('cal-grid').innerHTML.match(/class="cal-preview /g) || []).length, 1);
  assert.match(element('cal-grid').innerHTML, /\+5 more/);
});


test('search and selected day survive refreshed sync data', async () => {
  const { element, context } = calendar();
  element('calendar-search').value = 'project 5';
  element('calendar-search').handlers.input();
  vm.runInContext(`
    var API = {
      assignments: { list: async () => ASSIGNMENTS.map(a => ({ ...a, title: a.assignment_id === 5 ? 'Project 5 updated' : a.title })) },
      courses: { list: async () => CLASSES }
    };
  `, context);
  await context.window.refreshCalendarPage();
  assert.equal(element('calendar-search').value, 'project 5');
  assert.match(element('day-sub').textContent, /November 12, 2026/);
  assert.match(element('day-list').innerHTML, /Project 5 updated/);
  assert.doesNotMatch(element('day-list').innerHTML, /Project 1/);
  assert.match(element('cal-grid').innerHTML, /Project 5 updated/);
});

test('failed refresh keeps the displayed calendar and search intact', async () => {
  const { element, context } = calendar();
  element('calendar-search').value = 'project 2';
  element('calendar-search').handlers.input();
  const before = element('day-list').innerHTML;
  vm.runInContext(`var API = { assignments: { list: async () => { throw new Error('offline'); } }, courses: { list: async () => CLASSES } };`, context);
  await assert.rejects(context.window.refreshCalendarPage(), /offline/);
  assert.equal(element('day-list').innerHTML, before);
  assert.equal(element('calendar-search').value, 'project 2');
});

test('fresh page initialization recreates the month and leaves loading state', () => {
  const first = calendar();
  first.element('calendar-search').value = 'no results';
  first.element('calendar-search').handlers.input();
  const reloaded = calendar();
  assert.equal(reloaded.element('calendar-search').value, '');
  assert.equal(reloaded.element('cal-grid')['aria-busy'], 'false');
  assert.match(reloaded.element('day-list').innerHTML, /Project 1/);
  assert.equal(reloaded.element('month-label').textContent, 'November 2026');
});
