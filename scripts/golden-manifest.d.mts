export interface Pin {
  readonly sha256: string;
  readonly schemaVersion: number;
}
export interface Manifest {
  readonly files: Readonly<Record<string, Pin>>;
}
export declare const GOLDEN_DIR: string;
export declare const MANIFEST: string;
export declare function sha256(text: string): string;
export declare function currentSchemaVersion(source?: string): number;
export declare function readGoldens(dir?: string): Record<string, string>;
export declare function verify(
  files: Readonly<Record<string, string>>,
  manifest: Manifest,
  schemaVersion: number,
): string[];
export declare function record(
  files: Readonly<Record<string, string>>,
  manifest: Manifest,
  schemaVersion: number,
): Manifest;
export declare function readManifest(path?: string): Manifest;
