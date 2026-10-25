export interface Refusal {
  readonly file: string;
  readonly line: number;
  readonly key: string;
}
export declare const ROOT: string;
export declare function refusalKey(message: string): string;
export declare function listRefusals(): Refusal[];
export interface VariableRefusal {
  readonly file: string;
  readonly line: number;
  readonly variable: string;
  /** The function the variable was assigned from, or null when not found. */
  readonly from: string | null;
}
export declare function variableRefusals(): VariableRefusal[];
