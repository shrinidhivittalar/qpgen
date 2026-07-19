import type { BankQuestion, RawQuestion, UploadParseResult } from './types'

export async function fetchSubjects(): Promise<Record<string, Record<string, number>>> {
  const res = await fetch('/api/subjects')
  if (!res.ok) throw new Error('Failed to load subjects')
  return res.json()
}

export async function fetchQuestions(subject: string, source: string): Promise<BankQuestion[]> {
  const res = await fetch(`/api/questions/${subject}/${source}`)
  if (!res.ok) throw new Error('Failed to load questions')
  return res.json()
}

export async function rephraseQuestion(text: string, type: string): Promise<string> {
  const res = await fetch('/api/rephrase', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ text, type }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Rephrase failed')
  return data.rephrased
}

export interface UploadResult {
  id:        string
  name:      string
  count:     number
  questions: BankQuestion[]
}

export interface UploadMeta {
  id:    string
  name:  string
  count: number
}

export async function fetchUploads(): Promise<UploadMeta[]> {
  const res = await fetch('/api/uploads')
  if (!res.ok) throw new Error('Failed to load uploads')
  return res.json()
}

// Step 1: parse PDF, return raw questions for review (does NOT save to DB)
export async function uploadPaper(file: File, paperType: string): Promise<UploadParseResult> {
  const form = new FormData()
  form.append('file', file)
  form.append('paper_type', paperType)
  const res  = await fetch('/api/upload', { method: 'POST', body: form })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Upload failed')
  return data as UploadParseResult
}

// Step 2: save reviewed questions to DB
export async function confirmUpload(
  upload_id: string, name: string, questions: RawQuestion[]
): Promise<UploadResult> {
  const res = await fetch('/api/upload/confirm', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ upload_id, name, questions }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Save failed')
  return data as UploadResult
}

export async function deleteUpload(id: string): Promise<void> {
  const res = await fetch(`/api/uploads/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Delete failed')
}

export async function deleteQuestionSource(subject: string, source: string): Promise<void> {
  const res = await fetch(`/api/questions/${subject}/${source}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Delete failed')
}

export async function editBankQuestion(
  uploadId: string, qid: string, text: string, type: string
): Promise<void> {
  const res = await fetch(`/api/uploads/${uploadId}/questions/${qid}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ text, type }),
  })
  if (!res.ok) throw new Error('Edit failed')
}

export async function deleteBankQuestion(uploadId: string, qid: string): Promise<void> {
  const res = await fetch(`/api/uploads/${uploadId}/questions/${qid}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Delete failed')
}

export async function renameUpload(id: string, name: string): Promise<void> {
  const res = await fetch(`/api/uploads/${id}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error('Rename failed')
}

export function imageUrl(subject: string, source: string, filename: string): string {
  const base = import.meta.env.VITE_SUPABASE_IMAGES_URL
  if (base) return `${base}/${subject}/${source}/${filename}`
  return `/api/images/${subject}/${source}/${filename}`  // local fallback
}
