export declare const HEADER: string;

export interface RunEntry {
  id: string;
  date: string;
  minutes: number;
}
export declare function parseRuns(progress: string): RunEntry[];

export interface ReviewEntry {
  title: string;
  rounds: number;
  high: number;
  medium: number;
}
export declare function parseReviews(log: string): ReviewEntry[];

export declare function boxDeltas(counts: readonly number[]): number[];

export interface CiRun {
  name: string;
  head_branch: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  run_started_at: string;
}
export interface CiSummary {
  runs: number;
  red: number;
  meanMinutes: number;
}
export declare function ciSummary(runs: readonly CiRun[] | null, nowMs: number): CiSummary | null;

export declare function orientWords(files: {
  claude: string;
  loop: string;
  design: string;
  answers: string;
  progress: string;
  roadmap: string;
  decisions: string;
}): number;

export declare function scorecardRow(input: {
  date: string;
  runs: readonly RunEntry[];
  deltas: readonly number[];
  reviews: readonly ReviewEntry[];
  ci: CiSummary | null;
  orient: number;
  window: number;
}): string;
