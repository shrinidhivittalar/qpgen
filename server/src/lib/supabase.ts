const BUCKET = 'QPGen-images';

export function supabaseConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

export async function uploadSourceFile(
  uploadId: string,
  buffer: Buffer,
  mimetype: string,
): Promise<string> {
  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
    'application/pdf': 'pdf',
  };
  const ext      = extMap[mimetype] ?? 'bin';
  const filePath = `${uploadId}.${ext}`;
  const url      = `${process.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${filePath}`;

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'Content-Type':  mimetype,
    },
    body: new Uint8Array(buffer),
  });

  if (!res.ok) throw new Error(`Supabase upload failed: ${await res.text()}`);

  return `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${filePath}`;
}
