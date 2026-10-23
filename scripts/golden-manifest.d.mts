export interface Pin {
  readonly sha256: string;
  readonly schemaVersion: number;
}
export interface Manifest {
  readonly files: Readonly<Record<string, Pin>>;
}
export declare const GOLDEN_DIR: string;
export declare const MANIFEST: string;
export declare function sha256(text: string | Uint8Array): string;
export declare function currentSchemaVersion(source?: string): number;
export declare function readGoldens(dir?: string): Record<string, Uint8Array>;
export declare function verify(
  files: Readonly<Record<string, string | Uint8Array>>,
  manifest: Manifest,
  schemaVersion: number,
): string[];
export declare function record(
  files: Readonly<Record<string, string | Uint8Array>>,
  manifest: Manifest,
  schemaVersion: number,
): Manifest;
export declare function readManifest(path?: string): Manifest;
