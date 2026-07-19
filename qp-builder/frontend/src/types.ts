export type QuestionType =
  | 'mcq'
  | 'figure_based'
  | 'table_based'
  | 'text'
  | 'multi_part'
  | 'custom'

export interface ImageEntry {
  fid:    string
  file:   string
  width:  number
  height: number
}

export interface TableEntry {
  tid:     string
  qid:     string
  headers: string[]
  rows:    Record<string, string>[]
}

export interface BankQuestion {
  qid:        string
  number:     number
  text:       string
  type:       QuestionType
  options:    string[] | null   // MCQ options A/B/C/D
  has_figure: boolean
  has_table:  boolean
  images:     ImageEntry[]
  tables:     TableEntry[]
  source:      string          // 'qp' | 'textbook'
  chapter:     string | null
  chapter_num: number | null
  section:     string | null   // 'exercises' | 'in_text' | null
}

export interface PaperItem extends BankQuestion {
  uid:          string   // unique slot ID in this paper
  subject:      string
  marks:        number
  isRephrased:  boolean
  originalText: string
}

export interface PaperTab {
  id:    string
  title: string
  items: PaperItem[]
}

// Raw question returned by /api/upload before user review
export interface RawQuestion {
  number:  number
  text:    string
  type:    'mcq' | 'figure_based' | 'text'
  options: string[] | null
  images:  { fid: string; file: string }[]
}

export interface UploadParseResult {
  upload_id: string
  name:      string
  raw:       RawQuestion[]
  warnings:  string[]
}

export const MARKS_DEFAULT: Record<string, number> = {
  mcq:          1,
  figure_based: 2,
  table_based:  3,
  text:         2,
  multi_part:   3,
  custom:       2,
}

export const TYPE_LABELS: Record<string, string> = {
  mcq:          'MCQ',
  figure_based: 'Figure',
  table_based:  'Table',
  text:         'Text',
  multi_part:   'Multi-part',
  custom:       'Custom',
}

export const TYPE_COLORS: Record<string, string> = {
  mcq:          'bg-blue-100 text-blue-700',
  figure_based: 'bg-amber-100 text-amber-700',
  table_based:  'bg-purple-100 text-purple-700',
  text:         'bg-gray-100 text-gray-600',
  multi_part:   'bg-orange-100 text-orange-700',
  custom:       'bg-green-100 text-green-700',
}
