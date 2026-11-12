export type EditorMode = 'simple' | 'bulk';

export interface EnvironmentVariable {
  key: string;
  value: string;
}

export interface EnvironmentFormData {
  name: string;
  project: string;
  description: string;
  variables: EnvironmentVariable[];
  host_id: string;
  default_remote_path: string;
}

export type EnvironmentFormErrors = Record<string, string>;

export interface SftpHostOption {
  id: string;
  label: string;
}
