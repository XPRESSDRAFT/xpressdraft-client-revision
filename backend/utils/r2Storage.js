const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// Anything at or above this goes to R2 instead of Supabase — Supabase's
// project-wide hard limit is 50MB, so this stays safely under it.
const LARGE_FILE_THRESHOLD = 45 * 1024 * 1024;

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

function isLargeFile(byteLength) {
  return byteLength >= LARGE_FILE_THRESHOLD;
}

// Uploads a buffer to R2 and returns its public URL. Used whenever a file
// is too large for Supabase Storage's project-wide 50MB cap — everything
// else (drawing records, markup, PDF.js rendering) works identically
// afterward, since it's all just a URL either way.
async function uploadToR2(buffer, fileName, contentType) {
  const key = `large-files/${Date.now()}-${fileName.replace(/\s+/g, '_')}`;
  await r2Client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

module.exports = { isLargeFile, uploadToR2, LARGE_FILE_THRESHOLD };
