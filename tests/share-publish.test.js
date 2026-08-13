const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('新しいシェア書き込みは publish Edge Function 経由', () => {
  const app = read('js/app.js');
  const publishFunction = read('supabase/functions/publish-parallel-coordinates-share/index.ts');
  const migration = read('supabase/migrations/20260813_add_source_project_id_to_parallel_coordinates_shares.sql');

  assert.match(app, /functions\/v1\/publish-parallel-coordinates-share/);
  assert.match(app, /X-Dataviz-Authorization/);
  assert.match(app, /shareRequiresSavedProject/);
  assert.doesNotMatch(app, /from\("parallel_coordinates_shares"\)/);
  assert.doesNotMatch(app, /prompt\(i18n\.shareTitle/);
  assert.match(publishFunction, /const SHARE_TABLE = "parallel_coordinates_shares"/);
  assert.match(publishFunction, /source_project_id/);
  assert.match(publishFunction, /chartType !== CHART_TYPE/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS source_project_id/);
});

test('既存シェアの読み取り経路は残す', () => {
  const shareHtml = read('share.html');
  const ogFunction = read('supabase/functions/og-parallel-coordinates-share/index.ts');

  assert.match(shareHtml, /parallel_coordinates_shares/);
  assert.match(ogFunction, /from\("parallel_coordinates_shares"\)/);
  assert.match(ogFunction, /share\.html\?id=/);
});
