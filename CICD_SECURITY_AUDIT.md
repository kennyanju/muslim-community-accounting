# Masjid Accounting — CI/CD Pipeline Security & Credential Audit

This document details the security posture, least-privilege credential architecture, and log hygiene controls enforced in the GitHub Actions deployment pipeline ([`.github/workflows/deploy.yml`](file:///Users/sadiqadeyanju/Library/CloudStorage/GoogleDrive-kennyanju@gmail.com/My%20Drive/Masjid%20Software/.github/workflows/deploy.yml)).

---

## 1. Principle of Least Privilege (POLP)

### GitHub Token Permissions
The workflow explicitly restricts the default `GITHUB_TOKEN` to read-only repository contents:

```yaml
permissions:
  contents: read
```

This prevents any compromised third-party GitHub Action from writing to issues, creating releases, modifying pull requests, or tampering with repository settings.

### Deployment Credentials (Cloudflare API Token)
Instead of using a Global Cloudflare API Key, the pipeline uses a fine-grained, scoped **Cloudflare API Token** with strictly minimal permissions:

| Resource | Permission Scope | Target |
|---|---|---|
| **Account** | `Workers Scripts: Edit` | Single Account ID (`CLOUDFLARE_ACCOUNT_ID`) |
| **Account** | `Workers KV Storage: Edit` | Single Account ID (`CLOUDFLARE_ACCOUNT_ID`) |
| **Zone** | `Workers Routes: Edit` | Single Zone (e.g. `bsmc.org.uk`) |

---

## 2. Secret Masking & Log Hygiene

1. **Automatic GitHub Actions Masking**:
   - All referenced repository secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) are automatically registered with GitHub Actions secret masking. If any command attempts to print these values, they are masked as `***`.
2. **Zero Shell Interpolation in Logging**:
   - Secrets are passed directly to official Actions (`cloudflare/wrangler-action@v4`) as encrypted input parameters, never concatenated into shell `echo` statements or unmasked variables.
3. **Artifact Hygiene**:
   - Build artifacts (`.next`, `.open-next`) contain compiled client bundles and server entrypoints without embedded `.env` secrets. Secret tokens are resolved at runtime via environment variables.

---

## 3. Supply Chain & Build Integrity

1. **Strict Lockfile Enforcement (`npm ci`)**:
   - All pipeline builds use `npm ci` rather than `npm install`, ensuring that dependencies match `package-lock.json` with cryptographic SHA-512 integrity hashes.
2. **High-Severity Vulnerability Gating**:
   - The pipeline executes `npm audit --audit-level=high` before testing and compilation. If a high or critical vulnerability is detected, the build fails immediately.
3. **Automated PITR Verification**:
   - The test phase runs `npm test`, executing both the 80+ compliance unit tests and the end-to-end Point-In-Time recovery validation script.
