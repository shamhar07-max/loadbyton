// VAT invoice generation for platform commission — fixes the gap between
// docs/STRATEGY.md's claim ("invoice generated on every payout") and the
// code, which generated none.
//
// SCOPE, DELIBERATELY NARROW: Loadbyton's taxable supply to the carrier is
// the commission (facilitation) fee, not the freight amount — the freight
// contract is between shipper and carrier, Loadbyton is not a party to it.
// So this invoices platform_fee_aed only, addressed to the carrier.
//
// TAX-INCLUSIVE ASSUMPTION — CONFIRM WITH A TAX ADVISOR BEFORE GOING LIVE:
// this treats the existing commission_rate_bps fee as VAT-inclusive (i.e.
// it extracts 5% VAT out of the fee already being deducted) rather than
// adding 5% on top. That was the deliberate choice here because it changes
// no money movement anywhere else in the app — carrier net payout is
// unaffected. Whether FTA registration requires the fee to be exclusive
// instead (increasing what's deducted from the carrier) is a pricing/tax
// decision for the business, not something this code should decide
// unilaterally. Flip TAX_INCLUSIVE below once that's settled.

const { decryptField } = require('./crypto');

const VAT_RATE_BPS = 500; // 5% UAE standard rate
const TAX_INCLUSIVE = true;

function vatBreakdown(feeAed) {
  if (TAX_INCLUSIVE) {
    const taxable = feeAed / (1 + VAT_RATE_BPS / 10000);
    const vat = feeAed - taxable;
    return { taxableAed: round2(taxable), vatAed: round2(vat), totalAed: round2(feeAed) };
  }
  const vat = (feeAed * VAT_RATE_BPS) / 10000;
  return { taxableAed: round2(feeAed), vatAed: round2(vat), totalAed: round2(feeAed + vat) };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function nextInvoiceNumber(db) {
  const year = new Date().getUTCFullYear();
  const { c } = db.prepare(`SELECT COUNT(*) c FROM invoices WHERE invoice_number LIKE ?`).get(`LBT-INV-${year}-%`);
  const seq = String(c + 1).padStart(6, '0');
  return `LBT-INV-${year}-${seq}`;
}

// Issues an invoice for a job's payout if one doesn't already exist for it
// (idempotent — safe to call from any release path without double-invoicing
// a job that somehow gets touched twice).
function issueInvoice(db, jobId) {
  const existing = db.prepare('SELECT * FROM invoices WHERE job_id=?').get(jobId);
  if (existing) return existing;

  const payout = db.prepare('SELECT * FROM payouts WHERE job_id=?').get(jobId);
  if (!payout) return null;
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);
  const carrierProfile = db.prepare('SELECT * FROM profiles WHERE user_id=?').get(payout.carrier_id);

  const { taxableAed, vatAed, totalAed } = vatBreakdown(payout.platform_fee_aed);
  const invoiceNumber = nextInvoiceNumber(db);
  const supplierTrn = process.env.PLATFORM_TRN || null;

  const result = db
    .prepare(
      `INSERT INTO invoices
         (invoice_number, payout_id, job_id, carrier_id, supplier_trn, customer_trn,
          gross_aed, commission_aed, vat_rate_bps, taxable_aed, vat_aed, total_aed)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      invoiceNumber,
      payout.id,
      jobId,
      payout.carrier_id,
      supplierTrn,
      carrierProfile ? decryptField(carrierProfile.trn_number) : null,
      payout.gross_aed,
      payout.platform_fee_aed,
      VAT_RATE_BPS,
      taxableAed,
      vatAed,
      totalAed
    );

  return db.prepare('SELECT * FROM invoices WHERE id=?').get(Number(result.lastInsertRowid));
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderInvoiceHtml({ invoice, job, carrierProfile }) {
  const supplierTrn = invoice.supplier_trn;
  const trnWarning = supplierTrn
    ? ''
    : `<p style="color:#8f2f24;font:600 13px sans-serif;border:1px solid #8f2f24;padding:8px 12px;">
         ⚠ PLATFORM_TRN is not configured (env var). This invoice is not FTA-compliant
         until the platform's own TRN is set — see docs/DEVELOPER_GUIDE.md §7.
       </p>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Invoice ${esc(invoice.invoice_number)}</title>
<style>
  body{ font-family: Arial, Helvetica, sans-serif; color:#16211f; max-width:720px; margin:40px auto; padding:0 20px; }
  h1{ font-size:20px; margin-bottom:2px; }
  .muted{ color:#666; font-size:13px; }
  table{ width:100%; border-collapse:collapse; margin-top:24px; }
  th,td{ text-align:left; padding:8px 6px; border-bottom:1px solid #ddd; font-size:14px; }
  th{ font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:#666; }
  .totals td{ font-weight:600; }
  .cols{ display:flex; justify-content:space-between; margin-top:20px; gap:24px; }
  .cols div{ flex:1; }
  .print-bar{ display:flex; justify-content:flex-end; margin-bottom:16px; }
  .print-bar button{ font:600 13px Arial, sans-serif; padding:8px 16px; border-radius:6px; border:1px solid #16211f; background:#16211f; color:#fff; cursor:pointer; }
  .print-bar button:hover{ opacity:0.85; }
  @media print {
    @page { margin: 16mm; }
    body{ margin:0; max-width:none; }
    .no-print{ display:none !important; }
  }
</style>
</head>
<body>
  <div class="print-bar no-print"><button id="invoice-print-btn">Print / Save as PDF</button></div>
  ${trnWarning}
  <h1>Tax Invoice</h1>
  <p class="muted">Invoice ${esc(invoice.invoice_number)} · Issued ${esc(invoice.issued_at)}</p>

  <div class="cols">
    <div>
      <strong>Supplier</strong><br/>
      ${esc(process.env.PLATFORM_LEGAL_NAME || 'Loadbyton (legal name not configured)')}<br/>
      TRN: ${esc(supplierTrn || 'NOT CONFIGURED')}
    </div>
    <div>
      <strong>Customer</strong><br/>
      ${esc(carrierProfile ? carrierProfile.company_name : '—')}<br/>
      TRN: ${esc(invoice.customer_trn || '—')}
    </div>
  </div>

  <table>
    <thead><tr><th>Description</th><th>Job</th><th style="text-align:right">Amount (AED)</th></tr></thead>
    <tbody>
      <tr><td>Platform commission — facilitation service</td><td>${esc(job ? job.job_code : invoice.job_id)}</td><td style="text-align:right">${invoice.taxable_aed.toFixed(2)}</td></tr>
      <tr><td>VAT @ ${(invoice.vat_rate_bps / 100).toFixed(0)}%</td><td></td><td style="text-align:right">${invoice.vat_aed.toFixed(2)}</td></tr>
      <tr class="totals"><td>Total</td><td></td><td style="text-align:right">${invoice.total_aed.toFixed(2)}</td></tr>
    </tbody>
  </table>

  <p class="muted" style="margin-top:24px;">
    Freight amount (AED ${Number(invoice.gross_aed).toFixed(2)}) is a supply between shipper and
    carrier and is not part of this invoice — this invoice covers Loadbyton's commission only.
  </p>
  <script src="/api/invoices/print.js"></script>
</body>
</html>`;
}

module.exports = { issueInvoice, renderInvoiceHtml, VAT_RATE_BPS };
