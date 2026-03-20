import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import crypto from 'node:crypto';

const uploadRoot = path.resolve(process.cwd(), 'backend', 'uploads');

if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadRoot),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname || '');
    callback(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`);
  }
});

export const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 10
  }
});

export function mapUploadedFile(file) {
  const mimeType = file.mimetype || 'application/octet-stream';
  let type = 'file';
  if (mimeType.startsWith('image/')) type = 'image';
  else if (mimeType.startsWith('video/')) type = 'video';
  else if (mimeType.startsWith('audio/')) type = 'audio';

  return {
    type,
    name: file.originalname,
    mimeType,
    size: file.size,
    url: `/uploads/${file.filename}`
  };
}
