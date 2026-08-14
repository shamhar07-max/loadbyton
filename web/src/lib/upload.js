// Client-side half of the base64-JSON upload (see saveUploadedFile in
// server/index.js) — no multipart/FormData involved, just a File read into
// a data URL and the base64 payload split off it.

export const UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
export const ALLOWED_UPLOAD_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export function fileToBase64(file) {
  if (!ALLOWED_UPLOAD_MIME_TYPES.includes(file.type)) {
    return Promise.reject(new Error('File must be a JPEG, PNG, WEBP, or PDF.'));
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Promise.reject(new Error(`File must be under ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.`));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ base64: reader.result.split(',')[1], mimeType: file.type });
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

export function documentFileUrl(jobId, doc) {
  return doc.storage_path ? `/api/jobs/${jobId}/documents/${doc.id}/file` : doc.file_url;
}
