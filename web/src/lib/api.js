// Thin fetch wrapper: credentials included (session cookie), JSON in/out,
// throws ApiError with the backend's { error } message on any non-2xx.

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json().catch(() => ({})) : null;
  if (!res.ok) {
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  }
  return data;
}

const get = (path) => request('GET', path);
const post = (path, body) => request('POST', path, body ?? {});
const patch = (path, body) => request('PATCH', path, body ?? {});

export const api = {
  // auth
  register: (body) => post('/auth/register', body),
  login: (body) => post('/auth/login', body),
  me: () => get('/auth/me'),
  logout: () => post('/auth/logout'),
  mfaSetup: () => post('/auth/mfa/setup'),
  mfaDisable: () => post('/auth/mfa/disable'),
  updateProfile: (body) => patch('/profile', body),

  // public
  publicLanes: () => get('/public/lanes'),
  publicCarriers: () => get('/public/carriers'),
  publicMarket: () => get('/public/market'),

  // jobs
  listJobs: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
    const suffix = qs.toString() ? `?${qs}` : '';
    return get(`/jobs${suffix}`);
  },
  createJob: (body) => post('/jobs', body),
  getJob: (id) => get(`/jobs/${id}`),
  placeBid: (id, body) => post(`/jobs/${id}/bids`, body),
  rateEstimate: (id, body) => post(`/jobs/${id}/rate`, body),
  optimizeRoute: (id, body) => post(`/jobs/${id}/optimize-route`, body),
  awardJob: (id, bidId) => post(`/jobs/${id}/award`, { bidId }),
  setStatus: (id, status) => patch(`/jobs/${id}/status`, { status }),
  submitPod: (id, body) => post(`/jobs/${id}/pod`, body),
  track: (id) => get(`/jobs/${id}/track`),
  addDocument: (id, body) => post(`/jobs/${id}/documents`, body),
  rateJob: (id, body) => post(`/jobs/${id}/rating`, body),
  getMessages: (id) => get(`/jobs/${id}/messages`),
  sendMessage: (id, content) => post(`/jobs/${id}/messages`, { content }),

  // retention
  listTemplates: () => get('/templates'),
  createTemplate: (body) => post('/templates', body),
  rerunTemplate: (id) => post(`/templates/${id}/rerun`),
  listContracts: () => get('/contracts'),
  createContract: (body) => post('/contracts', body),
  analytics: () => get('/analytics/mine'),
  earnings: () => get('/earnings'),
  notifications: () => get('/notifications'),
  markNotificationsRead: () => post('/notifications/read'),

  // admin
  adminHealth: () => get('/admin/health'),
  adminVerificationQueue: () => get('/admin/verification'),
  adminVerify: (id, body) => post(`/admin/verify/${id}`, body),
  adminConfirmReceipt: (jobId) => post('/admin/confirm-receipt', { jobId }),
  adminAudit: () => get('/admin/audit'),
  adminDisputes: () => get('/admin/disputes'),
  adminOpenDispute: (body) => post('/admin/disputes', body),
  adminResolveDispute: (id, body) => post(`/admin/disputes/${id}/resolve`, body),
  adminEvidence: (jobId) => get(`/admin/evidence/${jobId}`),
  adminRevenue: () => get('/admin/revenue'),
  adminGetSettings: () => get('/admin/settings'),
  adminUpdateSettings: (body) => patch('/admin/settings', body),
  runAutoRelease: () => post('/system/auto-release'),
};
