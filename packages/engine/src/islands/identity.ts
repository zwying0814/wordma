import type { IslandReference } from './analyze';

export type IslandAsset = {
  js?: string;
  css?: string;
};

export function islandExportName(
  reference: IslandReference,
): string {
  const importedName = reference.import.importedName;

  return reference.propertyPath.length > 0
    ? `${importedName}.${reference.propertyPath.join('.')}`
    : importedName;
}

export function islandKey(
  source: string,
  exportName: string,
): string {
  return `${source}#${exportName}`;
}

export function referenceIslandKey(
  reference: IslandReference,
): string {
  return islandKey(
    reference.import.filePath,
    islandExportName(reference),
  );
}
