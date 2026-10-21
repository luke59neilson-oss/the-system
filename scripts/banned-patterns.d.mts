export declare const BANNED: readonly { name: string; regex: RegExp }[];
export declare function findBanned(text: string): { line: number; name: string }[];
