import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Retrieve config from Vite environment variables or runtime setup
const getEnvVar = (name: string): string => {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.[name]) {
    return (import.meta as any).env[name];
  }
  if (typeof process !== 'undefined' && process.env?.[name]) {
    return process.env[name] as string;
  }
  return '';
};

const envUrl = getEnvVar('VITE_SUPABASE_URL');
const envKey = getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY') || getEnvVar('VITE_SUPABASE_ANON_KEY');

// Allow runtime configuration if user inputs it via the UI
const getStoredConfig = () => {
  try {
    if (typeof localStorage !== 'undefined') {
      const storedUrl = localStorage.getItem('classflow_supabase_url');
      const storedKey = localStorage.getItem('classflow_supabase_key');
      if (storedUrl && storedKey) {
        return { url: storedUrl, key: storedKey };
      }
    }
  } catch {
    // localStorage might not be accessible
  }
  return null;
};

const stored = getStoredConfig();
export const supabaseUrl = (envUrl && envUrl !== 'https://your-project-id.supabase.co') 
  ? envUrl 
  : (stored?.url || '');

export const supabaseAnonKey = (envKey && envKey !== 'your-anon-or-publishable-key') 
  ? envKey 
  : (stored?.key || '');

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl.startsWith('https://') &&
  supabaseUrl.includes('.supabase.co') &&
  supabaseAnonKey.length > 20
);

// Fallback dummy client if not configured so the app can mount the setup screen without crashing
export const supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key-placeholder-placeholder-placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'classflow_auth_session',
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);

export const saveRuntimeSupabaseConfig = (url: string, key: string) => {
  localStorage.setItem('classflow_supabase_url', url.trim());
  localStorage.setItem('classflow_supabase_key', key.trim());
  window.location.reload();
};

export const clearRuntimeSupabaseConfig = () => {
  localStorage.removeItem('classflow_supabase_url');
  localStorage.removeItem('classflow_supabase_key');
  window.location.reload();
};

// ============================================================================
// SHARED ERROR NORMALIZATION
// ============================================================================
export interface AppError {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
}

export function normalizeError(err: unknown): AppError {
  const isDev = (typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV) || process?.env?.NODE_ENV !== 'production';
  if (isDev) {
    console.error('[ClassFlow Error Details]:', err);
  }

  if (!err) {
    return { message: 'An unknown error occurred' };
  }

  if (typeof err === 'string') {
    return { message: err };
  }

  const errorObj = err as Record<string, any>;
  const code = errorObj.code || errorObj.status?.toString() || errorObj.statusCode?.toString();
  const rawMsg = errorObj.message || errorObj.error_description || 'Operation failed';
  const details = errorObj.details || null;
  const hint = errorObj.hint || null;

  // Map known database and storage error codes
  if (code === '42501' || rawMsg.toLowerCase().includes('violates row-level security')) {
    return {
      message: 'Access denied: You do not have permission to perform this action.',
      code: '42501',
      details,
      hint,
    };
  }

  if (code === '42703' || rawMsg.toLowerCase().includes('does not exist')) {
    return {
      message: 'Database schema mismatch. Please run the database repair migration in Supabase.',
      code: '42703',
      details,
      hint,
    };
  }

  if (code === '23505' || rawMsg.toLowerCase().includes('unique constraint')) {
    return {
      message: 'This record already exists.',
      code: '23505',
      details,
      hint,
    };
  }

  if (code === '23503' || rawMsg.toLowerCase().includes('foreign key constraint')) {
    return {
      message: 'Referenced classroom, user, or record was not found.',
      code: '23503',
      details,
      hint,
    };
  }

  if (code === '23502' || rawMsg.toLowerCase().includes('violates not-null constraint')) {
    return {
      message: 'A required field cannot be empty.',
      code: '23502',
      details,
      hint,
    };
  }

  if (rawMsg.toLowerCase().includes('bucket not found') || rawMsg.toLowerCase().includes('nosuchbucket')) {
    return {
      message: 'Storage bucket "classroom-materials" not found in Supabase. Please execute the Phase 1 migration (008) in the Supabase SQL Editor.',
      code: 'BUCKET_NOT_FOUND',
      details,
      hint,
    };
  }

  return {
    message: rawMsg,
    code: code || null,
    details,
    hint,
  };
}


// ============================================================================
// STORAGE HELPERS (CANONICAL PATHS & CLIENT-SIDE VALIDATION)
// ============================================================================
export const STORAGE_LIMITS = {
  'classroom-materials': {
    maxBytes: 10 * 1024 * 1024, // 10 MB
    allowedMimes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
    ],
  },
  'assignment-attachments': {
    maxBytes: 10 * 1024 * 1024, // 10 MB
    allowedMimes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
    ],
  },
  'student-submissions': {
    maxBytes: 10 * 1024 * 1024, // 10 MB
    allowedMimes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
    ],
  },
  'profile-avatars': {
    maxBytes: 5 * 1024 * 1024, // 5 MB
    allowedMimes: ['image/png', 'image/jpeg', 'image/webp'],
  },
} as const;

export type StorageBucketName = keyof typeof STORAGE_LIMITS;

export function validateStorageFile(
  bucket: StorageBucketName,
  file: File
): { valid: boolean; error?: string } {
  const config = STORAGE_LIMITS[bucket];
  if (!config) {
    return { valid: true };
  }

  if (file.size > config.maxBytes) {
    const limitMb = Math.round(config.maxBytes / (1024 * 1024));
    return {
      valid: false,
      error: `File size exceeds the ${limitMb}MB limit (actual: ${(file.size / (1024 * 1024)).toFixed(1)}MB).`,
    };
  }

  const isAllowedMime = config.allowedMimes.includes(file.type as any);
  const ext = file.name.split('.').pop()?.toLowerCase();
  const allowedExts = ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'webp'];
  const isValidExt = ext ? allowedExts.includes(ext) : false;

  if (!isAllowedMime && !isValidExt) {
    return {
      valid: false,
      error: 'File format not supported. Allowed formats: PDF, DOC, DOCX, PNG, JPG.',
    };
  }

  return { valid: true };
}



export async function uploadFileToBucket(
  bucket: StorageBucketName | string,
  path: string,
  file: File,
  options?: { upsert?: boolean }
): Promise<{ path: string; error: AppError | null }> {
  try {
    if (bucket in STORAGE_LIMITS) {
      const validation = validateStorageFile(bucket as StorageBucketName, file);
      if (!validation.valid) {
        return {
          path: '',
          error: { message: validation.error || 'Invalid file format or size' },
        };
      }
    }

    const sanitizedPath = path
      .replace(/(\.\.\/|\.\.\\)/g, '')
      .replace(/\/+/g, '/');

    const { data, error } = await supabase.storage.from(bucket).upload(sanitizedPath, file, {
      cacheControl: '3600',
      upsert: options?.upsert ?? false,
      contentType: file.type || 'application/octet-stream',
    });

    if (error) {
      return { path: '', error: normalizeError(error) };
    }

    return { path: data?.path || sanitizedPath, error: null };
  } catch (err: unknown) {
    return { path: '', error: normalizeError(err) };
  }
}

export async function removeStorageFile(
  bucket: StorageBucketName | string,
  path: string
): Promise<{ success: boolean; error: AppError | null }> {
  try {
    if (!path) return { success: true, error: null };
    const { error } = await supabase.storage.from(bucket).remove([path]);
    if (error) {
      return { success: false, error: normalizeError(error) };
    }
    return { success: true, error: null };
  } catch (err: unknown) {
    return { success: false, error: normalizeError(err) };
  }
}

export async function getSignedFileUrl(
  bucket: StorageBucketName | string,
  path: string,
  expiresInSeconds: number = 60
): Promise<string | null> {
  try {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }
    return null;
  } catch {
    return null;
  }
}

export function getPublicFileUrl(bucket: StorageBucketName | string, path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
