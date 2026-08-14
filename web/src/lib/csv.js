// Minimal RFC4180-ish CSV parser — handles quoted fields, embedded commas,
// embedded newlines, and "" as an escaped quote. Good enough for a job
// import sheet; not a general CSV library (no alternate delimiters, no BOM
// stripping beyond the one check below).
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const src = text.startsWith('﻿') ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

const BOOLEAN_TRUE = new Set(['true', '1', 'yes', 'y']);
const NUMERIC_FIELDS = new Set(['maxBudgetAed', 'containerCount', 'truckCount', 'freeTimeDays', 'demurrageRateAed']);
const BOOLEAN_FIELDS = new Set(['requiresReefer', 'requiresHazmat']);

// Header row + data rows -> array of job-shaped objects (same field names
// POST /api/jobs takes). Unknown headers are dropped; blank cells become
// undefined so the server's own defaults apply.
export function csvRowsToJobs(rows) {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const job = {};
    headers.forEach((h, idx) => {
      const raw = (cells[idx] ?? '').trim();
      if (!raw) return;
      if (BOOLEAN_FIELDS.has(h)) job[h] = BOOLEAN_TRUE.has(raw.toLowerCase());
      else if (NUMERIC_FIELDS.has(h)) job[h] = Number(raw);
      else job[h] = raw;
    });
    return job;
  });
}

export const JOB_IMPORT_TEMPLATE_HEADERS = [
  'pickupTerminal', 'deliveryArea', 'deliveryAddress', 'readyAt', 'deadline',
  'equipmentType', 'containerSize', 'containerType', 'containerNumber',
  'maxBudgetAed', 'requiresReefer', 'requiresHazmat', 'notes', 'containerCount', 'truckCount',
];

export const JOB_IMPORT_TEMPLATE_EXAMPLE_ROW = [
  'JEBEL_ALI_T1', 'AL_QUOZ', 'Street 14, Warehouse 8B, Al Quoz 3, Dubai', '2026-09-01T09:00', '2026-09-02T18:00',
  'CONTAINER_CHASSIS', '40HC', 'DRY', '', '900', 'false', 'false', '', '1', '1',
];

export function downloadJobImportTemplate() {
  const csv = [JOB_IMPORT_TEMPLATE_HEADERS.join(','), JOB_IMPORT_TEMPLATE_EXAMPLE_ROW.map((v) => (v.includes(',') ? `"${v}"` : v)).join(',')].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'loadbyton-job-import-template.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
