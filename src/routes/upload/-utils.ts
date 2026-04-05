import { uploadCopy } from '../../copy/upload'
import { isTextContentType, TEXT_FILE_EXTENSION_SET } from 'clawhub-schema'

export async function uploadFile(uploadUrl: string, file: File) {
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  if (!response.ok) {
    throw new Error(`Upload failed: ${await response.text()}`)
  }
  const payload = (await response.json()) as { storageId: string }
  return payload.storageId
}

export async function hashFile(file: File) {
  const buffer =
    typeof file.arrayBuffer === 'function'
      ? await file.arrayBuffer()
      : await new Response(file).arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(buffer))
  const bytes = new Uint8Array(hash)
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size.toFixed(size < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`
}

export function formatPublishError(error: unknown) {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: unknown }).data
    if (
      data &&
      typeof data === 'object' &&
      'code' in data &&
      typeof (data as { code?: unknown }).code === 'string'
    ) {
      const code = (data as { code: string }).code
      if (code === 'version_exists') return uploadCopy.status.versionExists
      if (code === 'skill_owned_by_another_user') return uploadCopy.status.ownerConflict
    }
    if (typeof data === 'string' && data.trim()) return data.trim()
    if (
      data &&
      typeof data === 'object' &&
      'error' in data &&
      typeof (data as { error?: unknown }).error === 'string'
    ) {
      const message = (data as { error?: string }).error?.trim()
      if (message === 'version already exists') return uploadCopy.status.versionExists
      if (message === 'skill owned by another user') return uploadCopy.status.ownerConflict
      if (message) return message
    }
    if (
      data &&
      typeof data === 'object' &&
      'message' in data &&
      typeof (data as { message?: unknown }).message === 'string'
    ) {
      const message = (data as { message?: string }).message?.trim()
      if (message) return message
    }
  }
  if (error instanceof Error) {
    const cleaned = error.message
      .replace(/\[CONVEX[^\]]*\]\s*/g, '')
      .replace(/\[Request ID:[^\]]*\]\s*/g, '')
      .replace(/^Server Error Called by client\s*/i, '')
      .replace(/^ConvexError:\s*/i, '')
      .trim()
    if (cleaned.includes('version already exists')) return uploadCopy.status.versionExists
    if (cleaned.includes('skill owned by another user')) return uploadCopy.status.ownerConflict
    if (cleaned && cleaned !== 'Server Error') return cleaned
  }
  return uploadCopy.status.publishFailed
}

export function isTextFile(file: File) {
  const path = (file.webkitRelativePath || file.name).trim().toLowerCase()
  if (!path) return false
  const parts = path.split('.')
  const extension = parts.length > 1 ? (parts.at(-1) ?? '') : ''
  if (file.type && isTextContentType(file.type)) return true
  if (extension && TEXT_FILE_EXTENSION_SET.has(extension)) return true
  return false
}

export async function readText(blob: Blob) {
  if (typeof (blob as Blob & { text?: unknown }).text === 'function') {
    return (blob as Blob & { text: () => Promise<string> }).text()
  }
  return new Response(blob as BodyInit).text()
}
