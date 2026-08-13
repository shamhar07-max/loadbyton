# Deploying to Oracle Cloud Always Free — UAE-resident, $0

This is the free, UAE-data-resident alternative to `render.yaml`. Oracle
Cloud Infrastructure's **Always Free** tier is free forever (not a trial),
includes a real Abu Dhabi region (`me-abudhabi-1`), and includes persistent
block storage — the two things Render's free plan cannot offer together.

This solves the two CRITICAL findings from the corporate-readiness review:
production data no longer resets on restart, and UAE personal data (TRN,
IBAN, driver phone numbers) rests inside the UAE instead of transiting to
Oregon or Frankfurt.

## What's free, permanently

- 4 Arm-based OCPUs + 24GB RAM (or 2 AMD VMs), split across up to 2 instances
- 200GB total block storage
- 10TB/month outbound data transfer
- A public IP

More than this app needs at 300 jobs/day.

## Setup (one-time)

1. Create an Oracle Cloud account at oracle.com/cloud/free — **select "United
   Arab Emirates" as the home region at signup**. This cannot be changed
   later without a new account, so get it right the first time.
2. Compute → Instances → Create Instance:
   - Shape: `VM.Standard.A1.Flex` (Arm, Always Free eligible), 2 OCPU / 12GB
   - Image: **Canonical Ubuntu 22.04**
   - Add your SSH public key
3. Storage → Block Volumes → Create Block Volume (50GB, Always Free eligible),
   attach it to the instance, then on the instance:
   ```bash
   sudo mkdir -p /data
   sudo mkfs.ext4 /dev/oracleoci/oraclevdb   # first attach only
   sudo mount /dev/oracleoci/oraclevdb /data
   echo '/dev/oracleoci/oraclevdb /data ext4 defaults,nofail 0 2' | sudo tee -a /etc/fstab
   ```
4. Install Docker on the instance:
   ```bash
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER
   ```
5. Networking → Virtual Cloud Networks → your VCN → Security Lists → add an
   ingress rule for TCP/443 (and 80 for the ACME HTTP challenge if using
   Caddy/certbot). Do **not** expose 4000 publicly — put a reverse proxy in
   front (Caddy is the simplest zero-config TLS option).

## Deploy

From your machine, with Docker installed and pointed at the instance
(`DOCKER_HOST=ssh://ubuntu@<instance-ip>`), or by copying the repo to the
instance and building there:

```bash
docker build -f deploy/oracle-cloud/Dockerfile -t loadbyton:latest .
docker run -d --name loadbyton \
  -p 4000:4000 \
  -v /data:/data \
  -e FRONTEND_URL=https://your-domain.ae \
  -e ENCRYPTION_KEY="$(openssl rand -hex 32)"   \
  --restart unless-stopped \
  loadbyton:latest
```

Save the `ENCRYPTION_KEY` you generate somewhere durable outside the
container — it decrypts every stored IBAN/TRN (see `server/lib/crypto.js`).
Losing it means those fields become unrecoverable, not just the container.

Put Caddy (or nginx + certbot) in front for TLS:

```
your-domain.ae {
    reverse_proxy localhost:4000
}
```

## What this does and doesn't fix

**Fixes:** data-loss-on-redeploy, data residency (UAE region), and gives you
a real `ENCRYPTION_KEY` slot for field-level encryption.

**Doesn't fix:** this is a single instance with a single disk — it's a
correct MVP/pilot deployment, not a highly-available production one. A
managed Postgres + multi-AZ setup is the right call once transaction volume
or an enterprise SLA requires it; treat this as the bridge, not the
destination.
