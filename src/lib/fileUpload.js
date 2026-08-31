import crypto from 'crypto';

/**
 * File Upload Security, Magic Byte MIME Inspection & Pre-Signed URL Generator
 */

export const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_MIME_TYPES = {
  'image/jpeg': { ext: 'jpg', magic: [[0xFF, 0xD8, 0xFF]] },
  'image/png': { ext: 'png', magic: [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]] },
  'image/webp': { ext: 'webp', magic: [[0x52, 0x49, 0x46, 0x46]] }, // RIFF header
  'application/pdf': { ext: 'pdf', magic: [[0x25, 0x50, 0x44, 0x46]] }, // %PDF
};

/**
 * Inspect buffer header magic bytes to verify genuine file type
 * Prevents disguised executable / script upload attacks (.php.png, .exe disguised as .pdf)
 * @param {Buffer|Uint8Array} buffer
 * @returns {string|null} Validated MIME type or null if invalid/unrecognized
 */
export function inspectMagicBytes(buffer) {
  if (!buffer || buffer.length < 8) return null;

  const bytes = new Uint8Array(buffer.slice(0, 16));

  for (const [mime, spec] of Object.entries(ALLOWED_MIME_TYPES)) {
    for (const signature of spec.magic) {
      let match = true;
      for (let i = 0; i < signature.length; i++) {
        if (bytes[i] !== signature[i]) {
          match = false;
          break;
        }
      }
      if (match) {
        // Extra validation for WEBP: check WEBP signature at offset 8
        if (mime === 'image/webp') {
          if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
            return mime;
          }
          continue;
        }
        return mime;
      }
    }
  }

  return null;
}

/**
 * Validate upload metadata and buffer
 * @param {Buffer|Uint8Array} buffer
 * @param {string} declaredMime
 * @param {number} size
 */
export function validateUploadBuffer(buffer, declaredMime, size) {
  if (size > MAX_UPLOAD_SIZE || (buffer && buffer.length > MAX_UPLOAD_SIZE)) {
    throw new Error(`File exceeds maximum permitted size of ${MAX_UPLOAD_SIZE / (1024 * 1024)}MB.`);
  }

  const inspectedMime = inspectMagicBytes(buffer);
  if (!inspectedMime) {
    throw new Error('Invalid file format: Magic byte signature does not match permitted receipt types (PDF, PNG, JPEG, WEBP).');
  }

  if (declaredMime && declaredMime.toLowerCase() !== inspectedMime) {
    throw new Error(`MIME type mismatch: Declared '${declaredMime}' does not match actual file contents '${inspectedMime}'.`);
  }

  return { mimeType: inspectedMime, extension: ALLOWED_MIME_TYPES[inspectedMime].ext };
}

/**
 * Generate a Cryptographic Pre-Signed Direct Upload URL (Cloudflare R2 / AWS S3 direct client upload)
 * Avoids server buffering bottleneck by uploading straight to object store
 * @param {Object} params
 * @param {string} params.filename - Original client filename
 * @param {string} params.contentType - Validated MIME type
 * @param {number} [params.expiresInSeconds=900] - Expiration duration (default 15 minutes)
 * @param {string} [params.secretKey] - Storage signing secret
 */
export function generatePresignedUploadUrl({
  filename,
  contentType,
  expiresInSeconds = 900,
  secretKey = process.env.SESSION_SECRET || 'masjid_storage_signing_key'
}) {
  const ext = ALLOWED_MIME_TYPES[contentType]?.ext || 'bin';
  const cleanBase = filename.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 32);
  const randomSuffix = crypto.randomBytes(8).toString('hex');
  const objectKey = `receipts/${new Date().getFullYear()}/${cleanBase}_${randomSuffix}.${ext}`;
  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;

  // Build canonical string to sign
  const stringToSign = `PUT\n${objectKey}\n${contentType}\n${expires}`;
  const signature = crypto.createHmac('sha256', secretKey).update(stringToSign).digest('hex');

  const storageBaseUrl = process.env.STORAGE_PUBLIC_URL || 'https://storage.bsmc.org.uk';
  const uploadUrl = `${storageBaseUrl}/${objectKey}?expires=${expires}&signature=${signature}`;
  const publicUrl = `${storageBaseUrl}/${objectKey}`;

  return {
    uploadUrl,
    publicUrl,
    objectKey,
    expires,
    headers: {
      'Content-Type': contentType,
      'x-amz-acl': 'private'
    }
  };
}
