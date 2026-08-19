export type DurableSchemaContract = Readonly<{
  currentVersion: number;
  supportedVersions: readonly number[];
  unversionedVersion: number | null;
}>;

export type DurableSchemaVersionResolution =
  | {
      status: "supported";
      schemaVersion: number;
      current: boolean;
    }
  | {
      status: "unsupported";
      reason: "missing" | "invalid" | "unsupported";
      schemaVersion?: number;
    };

function isSchemaVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * Resolves only the version decision for a durable document.
 *
 * Shape parsing and migrations remain explicit responsibilities of the
 * document-specific reader. In particular, this helper never treats an
 * unknown future version as the current shape.
 */
export function resolveDurableSchemaVersion(
  value: unknown,
  contract: DurableSchemaContract,
): DurableSchemaVersionResolution {
  let schemaVersion: unknown = value;

  if (schemaVersion === undefined) {
    if (contract.unversionedVersion === null) {
      return { status: "unsupported", reason: "missing" };
    }
    schemaVersion = contract.unversionedVersion;
  }

  if (!isSchemaVersion(schemaVersion)) {
    return { status: "unsupported", reason: "invalid" };
  }

  if (!contract.supportedVersions.includes(schemaVersion)) {
    return {
      status: "unsupported",
      reason: "unsupported",
      schemaVersion,
    };
  }

  return {
    status: "supported",
    schemaVersion,
    current: schemaVersion === contract.currentVersion,
  };
}
