import { appState } from '../stores/appState.svelte';

export interface PendingAttachment {
  id: string;
  file: File;
  previewUrl: string;
  name: string;
  size: number;
  isImage: boolean;
  uploadedUrl?: string | null;
  isUploading?: boolean;
  uploadFailed?: boolean;
}

export function getFullAttachmentUrl(urlOrPath: string): string {
  if (!urlOrPath) return '';
  if (urlOrPath.startsWith('data:') || urlOrPath.startsWith('blob:')) {
    return urlOrPath;
  }
  const uploadsIndex = urlOrPath.indexOf('/uploads/');
  if (uploadsIndex !== -1) {
    const relativePath = urlOrPath.substring(uploadsIndex);
    return `${appState.serverUrl}${relativePath}`;
  }
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
    return urlOrPath;
  }
  return `${appState.serverUrl}${urlOrPath.startsWith('/') ? '' : '/'}${urlOrPath}`;
}

export function getFilename(urlOrPath: string): string {
  try {
    const clean = urlOrPath.split('?')[0];
    const parts = clean.split('/');
    const last = parts[parts.length - 1];
    return decodeURIComponent(last) || 'arquivo';
  } catch {
    return 'arquivo';
  }
}

export function isImageUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('data:image/') || url.startsWith('blob:')) return true;
  return /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|avif)(\?.*)?$/i.test(url);
}

export function isVideoUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('data:video/')) return true;
  return /\.(mp4|webm|mov|mkv|avi|ogv)(\?.*)?$/i.test(url);
}

export function isAudioUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('data:audio/')) return true;
  return /\.(mp3|wav|ogg|flac|m4a|aac|opus)(\?.*)?$/i.test(url);
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const formatted = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1);
  return `${formatted} ${units[i]}`;
}

/**
 * Extracts image or general files from a ClipboardEvent (supporting clipboard screenshots, copied files, etc.)
 */
export function extractFilesFromClipboard(e: ClipboardEvent): File[] {
  const clipboardData = e.clipboardData;
  if (!clipboardData) return [];

  const files: File[] = [];

  // 1. Check items (standard for pasted screenshots e.g. Win+Shift+S, copy image from web, etc.)
  if (clipboardData.items && clipboardData.items.length > 0) {
    for (let i = 0; i < clipboardData.items.length; i++) {
      const item = clipboardData.items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }
  }

  // 2. Fallback to clipboardData.files if items was empty
  if (files.length === 0 && clipboardData.files && clipboardData.files.length > 0) {
    for (let i = 0; i < clipboardData.files.length; i++) {
      files.push(clipboardData.files[i]);
    }
  }

  return files;
}

export function generatePastedFileName(originalName: string, mimeType: string): string {
  if (originalName && originalName !== 'image.png' && originalName !== 'blob' && originalName !== 'file') {
    return originalName;
  }
  const ext = mimeType?.split('/')[1]?.replace('+xml', '') || 'png';
  const pad = (n: number) => n.toString().padStart(2, '0');
  const d = new Date();
  const timestamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `clipboard_${timestamp}.${ext}`;
}
