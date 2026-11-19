import assert from 'node:assert/strict';
import test from 'node:test';
import {formatWib,reportFilters,teacherCsv,todayWib} from '../src/services/report-format.ts';

test('WIB report dates change at 17:00 UTC and reject impossible or oversized ranges', () => {
  const before=new Date('2026-11-18T16:59:59Z');
  const after=new Date('2026-11-18T17:00:00Z');
  assert.equal(todayWib(before),'2026-11-18');
  assert.equal(todayWib(after),'2026-11-19');
  assert.deepEqual(reportFilters(new URLSearchParams(),after),{
    from:'2026-11-13',to:'2026-11-19',className:'',valid:true,
  });
  for (const query of ['from=2026-02-29&to=2026-03-01','from=2026-11-20&to=2026-11-19',
    'from=2025-11-18&to=2026-11-19']) {
    assert.equal(reportFilters(new URLSearchParams(query),after).valid,false,query);
  }
});

test('CSV escapes quotes and protects spreadsheet formula-like student fields', () => {
  const csv=teacherCsv([{name:' =1+1',className:'XI "RPL", 1',uniqueBooks:1,pages:3,
    lastBook:'Buku A',lastActive:'2026-11-18T17:00:00Z'}]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /"' =1\+1","XI ""RPL"", 1","1","3"/);
  assert.match(formatWib('2026-11-18T17:00:00Z'),/19.+00[.:]00 WIB/);
  assert.ok(csv.includes(formatWib('2026-11-18T17:00:00Z')));
});
