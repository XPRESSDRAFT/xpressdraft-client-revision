const { supabase } = require('../db');
const { isLargeFile, uploadToR2 } = require('./r2Storage');

// Keeps our own copy of every submitted markup PDF. Previously the only
// copy went to Monday, so if Monday rejected or misplaced it the file was
// simply gone. This copy also means admin and contractors can always open
// it without a Monday login. Large files go to R2, like everywhere else.
async function storeMarkupCopy(buffer, fileName, projectId) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storedName = `${Date.now()}-${safeName}`;
  if (isLargeFile(buffer.length)) return await uploadToR2(buffer, storedName, 'application/pdf');
  const path = `instructions/${projectId}/${storedName}`;
  const { error } = await supabase.storage.from('drawings').upload(path, buffer, { contentType: 'application/pdf', upsert: false });
  if (error) throw error;
  const { data } = await supabase.storage.from('drawings').createSignedUrl(path, 365 * 24 * 60 * 60);
  return data?.signedUrl || null;
}

module.exports = { storeMarkupCopy };
