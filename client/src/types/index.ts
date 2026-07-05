export type Role = 'teacher' | 'hod' | 'principal' | 'student';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  department?: string | null;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
  role: Role;
  department?: string;
}

export type QuestionType =
  | 'fillInBlanks'
  | 'multipleChoice'
  | 'multiSelect'
  | 'matchTheFollowing'
  | 'reordering'
  | 'sorting'
  | 'trueFalse';

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  fillInBlanks:      'Fill in the Blanks',
  multipleChoice:    'Multiple Choice',
  multiSelect:       'Multi-Select',
  matchTheFollowing: 'Match the Following',
  reordering:        'Reordering',
  sorting:           'Sorting',
  trueFalse:         'True / False',
};

export const ALL_QUESTION_TYPES: QuestionType[] = [
  'fillInBlanks', 'multipleChoice', 'multiSelect',
  'matchTheFollowing', 'reordering', 'sorting', 'trueFalse',
];

export type DifficultyLevel = 'easy' | 'moderate' | 'hard';
export type ToneOption     = 'formal-board-exam' | 'neutral' | 'conversational';

export interface TypeConfig {
  type:             QuestionType;
  count:            number;
  marksPerQuestion: number;
  difficulty?:      DifficultyLevel;
}

export interface ReferenceBank {
  id:   string;
  name: string;
}

export interface Scheme {
  schemeId:     string;
  name:         string;
  subject:      string;
  standard:     string;
  examType:     string | null;
  fileType:     'pdf' | 'docx';
  parsedConfig: TypeConfig[];
  updatedAt:    string;
}

export interface QuestionBlockResult {
  questionType: string;
  totalMarks:   number;
  status:       'success' | 'failed';
  questions:    unknown[];
}

export interface GenerationError {
  type:      string;
  requested: number;
  received:  number;
  error:     string;
}

export type TypeResultStatus = 'idle' | 'generating' | 'success' | 'failed';

export interface TypeResult {
  status:       TypeResultStatus;
  questions?:   unknown[];
  totalMarks?:  number;
  received?:    number;
  requested?:   number;
  error?:       string;
}

export interface ChapterInfo {
  _id:               string;
  chapterName:       string;
  chapterNumber:     number;
  weightPercent:     number;
  subject:           string;
}
