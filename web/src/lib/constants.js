export const CONTAINER_SIZES = ['20FT', '40FT', '40HC', 'REEFER'];
export const CONTAINER_TYPES = ['DRY', 'REEFER', 'HAZMAT', 'OPEN_TOP', 'FLAT_RACK'];
export const TERMINALS = ['JEBEL_ALI_T1', 'JEBEL_ALI_T2', 'JEBEL_ALI_T4', 'KHALIFA_PORT', 'PORT_KHALID', 'FUJAIRAH_PORT'];
export const AREAS = ['AL_QUOZ', 'JAFZA_SOUTH', 'DUBAI_SOUTH', 'DIP', 'AL_QUSAIS', 'MUSAFFAH', 'SHARJAH_INDUSTRIAL', 'FUJAIRAH_FREEZONE'];
export const STATUS_FLOW = ['DRAFT', 'OPEN', 'AWARDED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'];

// Terminal → emirate/operator, for the UAE coverage section and any "which
// emirate is this in" display. Keys must match TERMINALS above.
export const TERMINAL_INFO = {
  JEBEL_ALI_T1: { emirate: 'Dubai', operator: 'DP World' },
  JEBEL_ALI_T2: { emirate: 'Dubai', operator: 'DP World' },
  JEBEL_ALI_T4: { emirate: 'Dubai', operator: 'DP World' },
  KHALIFA_PORT: { emirate: 'Abu Dhabi', operator: 'Abu Dhabi Ports' },
  PORT_KHALID: { emirate: 'Sharjah', operator: 'Gulftainer' },
  FUJAIRAH_PORT: { emirate: 'Fujairah', operator: 'Fujairah Port Authority' },
};

// Equipment/vehicle types a job can require and a carrier can bid with. The
// two container-carrying types are the only ones where container size/type
// apply — everything else is general UAE road freight.
export const EQUIPMENT_TYPES = [
  'CONTAINER_CHASSIS', 'REEFER_TRUCK', 'LOWBED_TRAILER', 'FLATBED_TRAILER', 'BOX_TRUCK',
  'CURTAIN_TRUCK', 'PICKUP_3T', 'PICKUP_5T', 'PICKUP_7T', 'PICKUP_10T',
  'SIDE_LOADER_TRAILER', 'TRIPPER',
];
export const CONTAINER_EQUIPMENT = ['CONTAINER_CHASSIS', 'REEFER_TRUCK'];
export const EQUIPMENT_TYPE_LABELS = {
  CONTAINER_CHASSIS: 'Container chassis',
  REEFER_TRUCK: 'Reefer truck',
  LOWBED_TRAILER: 'Lowbed trailer',
  FLATBED_TRAILER: 'Flatbed trailer',
  BOX_TRUCK: 'Box truck',
  CURTAIN_TRUCK: 'Curtain-side truck',
  PICKUP_3T: 'Pickup — 3 tonne',
  PICKUP_5T: 'Pickup — 5 tonne',
  PICKUP_7T: 'Pickup — 7 tonne',
  PICKUP_10T: 'Pickup — 10 tonne',
  SIDE_LOADER_TRAILER: 'Side loader trailer',
  TRIPPER: 'Tripper',
};
export function equipmentLabel(value) {
  return EQUIPMENT_TYPE_LABELS[value] || formatLabel(value);
}

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
