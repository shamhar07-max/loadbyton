export const CONTAINER_SIZES = ['20FT', '40FT', '40HC', 'REEFER'];
export const CONTAINER_TYPES = ['DRY', 'REEFER', 'HAZMAT', 'OPEN_TOP', 'FLAT_RACK'];
export const TERMINALS = ['JEBEL_ALI_T1', 'JEBEL_ALI_T2', 'JEBEL_ALI_T4', 'KHALIFA_PORT'];
export const AREAS = ['AL_QUOZ', 'JAFZA_SOUTH', 'DUBAI_SOUTH', 'DIP', 'AL_QUSAIS', 'MUSAFFAH'];
export const STATUS_FLOW = ['DRAFT', 'OPEN', 'AWARDED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'];

export function formatLabel(value) {
  return value ? value.replaceAll('_', ' ') : '';
}

export function formatAED(amount) {
  if (amount === null || amount === undefined) return '—';
  return `AED ${Number(amount).toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;
}

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') || iso.includes('Z') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') || iso.includes('Z') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-AE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
