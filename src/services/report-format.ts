const wibDay = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Jakarta', year:'numeric', month:'2-digit', day:'2-digit' });
const wibTime = new Intl.DateTimeFormat('id-ID', { timeZone:'Asia/Jakarta', dateStyle:'medium', timeStyle:'short' });

export function todayWib(now = new Date()) {
  const parts = Object.fromEntries(wibDay.formatToParts(now).map(({type,value}) => [type,value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatWib(value: string | null) {
  return value ? wibTime.format(new Date(value)) + ' WIB' : '—';
}

export function shiftDay(day: string, delta: number) {
  return new Date(Date.parse(day+'T00:00:00Z') + delta*86_400_000).toISOString().slice(0,10);
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(value+'T00:00:00Z');
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0,10) === value && value >= '1900-01-01';
}

export function reportFilters(params: URLSearchParams, now = new Date()) {
  const to = params.get('to') ?? todayWib(now);
  const from = params.get('from') ?? shiftDay(todayWib(now),-6);
  const className = params.get('class')?.trim() ?? '';
  const valid = validDate(from) && validDate(to) && from<=to && Date.parse(to)-Date.parse(from)<=365*86_400_000
    && className.length <= 60;
  return { from,to,className,valid };
}

export interface TeacherRow {
  name: string;
  className: string;
  uniqueBooks: number;
  pages: number;
  lastBook: string | null;
  lastActive: string | null;
}

function csvCell(value: string | number) {
  let text = String(value);
  if (typeof value === 'string' && /^[\s\uFEFF]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"','""') + '"';
}

export function teacherCsv(rows: TeacherRow[]) {
  const info = [['No','Nama Lengkap Siswa','Kelas','Judul Buku Dibaca (Unik)','Total Halaman Dibaca','Buku Terakhir Dibaca','Aktif Terakhir (WIB)']];
  const lines: (string|number)[][] = [...info,...rows.map((r,i) =>
    [i+1,r.name,r.className,r.uniqueBooks,r.pages,r.lastBook??'',r.lastActive ? formatWib(r.lastActive) : ''])];
  return '\uFEFF' + lines.map((values) => values.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
