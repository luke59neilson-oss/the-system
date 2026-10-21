export interface BannedRule {
  name: string;
  regex: RegExp;
}
export declare const BANNED: readonly BannedRule[];
export declare const BANNED_IN_TESTS: readonly BannedRule[];
export declare function isTestFile(file: string): boolean;
export declare function findBanned(
  text: string,
  options?: { test?: boolean },
): { line: number; name: string }[];
