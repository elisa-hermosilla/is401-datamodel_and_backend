import { test } from 'node:test';
import assert from 'node:assert/strict';
import ejs from 'ejs';
import { BUILT_IN_TYPES, isBuiltInType, cleanTypeName, matchTypeName, customTypeNames } from '../server/assignmentTypes.js';

/* canvas.js pulls in db.js, which needs a DATABASE_URL to exist; the pool
   only connects on the first query, so a placeholder is enough here. */
process.env.DATABASE_URL ||= 'postgresql://test@localhost/test';
const { guessType } = await import('../server/canvas.js');

test('Admin template has the three panels, the user and type controls, and no quick-start fact', async () => {
  const html = await ejs.renderFile('views/admin.ejs', { user: { name: 'Admin', email: 'admin@example.com', is_admin: true } });
  assert.equal((html.match(/data-settings-panel=/g) || []).length, 3);
  assert.equal((html.match(/data-settings-category=/g) || []).length, 3);
  assert.match(html, /data-settings-category="types"[^>]*>[\s\S]*?Assignment types/);
  for (const id of ['user-add', 'user-search', 'user-filter', 'user-list', 'user-modal', 'user-form', 'u-first', 'u-last',
    'u-username', 'u-email', 'u-password', 'u-admin', 'user-save', 'type-form', 'type-name', 'type-add', 'type-list',
    'confirm-modal', 'confirm-title', 'confirm-text', 'confirm-delete']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, id);
  }
  assert.doesNotMatch(html, /Quick start/);
  assert.doesNotMatch(html, /data-toggle-admin/);
});

test('built-in types are the seven seed names plus other', () => {
  assert.deepEqual(BUILT_IN_TYPES, ['homework', 'quiz', 'exam', 'paper', 'project', 'reading', 'discussion', 'other']);
  assert.equal(isBuiltInType('Quiz'), true);
  assert.equal(isBuiltInType('lab report'), false);
  assert.deepEqual(customTypeNames({ quiz: 2, 'lab report': 9, other: 8, presentation: 10 }), ['lab report', 'presentation']);
});

test('type names are trimmed, lowercased and checked', () => {
  assert.equal(cleanTypeName('  Lab   Report '), 'lab report');
  assert.throws(() => cleanTypeName(''), /Enter a name/);
  assert.throws(() => cleanTypeName('a'.repeat(51)), /50 characters/);
  assert.throws(() => cleanTypeName('quiz!'), /letters, numbers, spaces, and dashes/);
});

test('matchTypeName finds whole words, case-insensitively, longest first', () => {
  const names = ['lab', 'lab report', 'presentation'];
  assert.equal(matchTypeName('Lab Report 3', names), 'lab report');
  assert.equal(matchTypeName('Week 4 LAB', names), 'lab');
  assert.equal(matchTypeName('Labs and more', names), null);
  assert.equal(matchTypeName('Final Presentation', names), 'presentation');
  assert.equal(matchTypeName('Final Presentation', []), null);
  assert.equal(matchTypeName('', names), null);
});

test('guessType prefers an admin-added type over the keyword patterns', () => {
  assert.equal(guessType('Lab Report 2'), 'homework');
  assert.equal(guessType('Lab Report 2', ['lab report']), 'lab report');
  assert.equal(guessType('Midterm Exam', ['lab report']), 'exam');
  assert.equal(guessType('Weekly Reflection', ['lab report']), null);
});
