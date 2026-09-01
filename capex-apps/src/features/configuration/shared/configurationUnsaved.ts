/** Spreadsheet / draft editors register here so Configuration can block navigation. */
export type ConfigurationUnsavedHandle = {
  label: string;
  save: () => Promise<void>;
  discard: () => void;
};

export type ConfigurationUnsavedRegistry = {
  report: (key: string, handle: ConfigurationUnsavedHandle | null) => void;
};
