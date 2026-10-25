export type ContentDiagnostic = {
  code: string;
  severity: 'warning' | 'error';
  file?: string;
  path?: string;
  message: string;
};

export class ContentError extends Error {
  readonly code: string;
  readonly file?: string;
  readonly path?: string;

  constructor(
    code: string,
    message: string,
    options: {
      file?: string;
      path?: string;
    } = {},
  ) {
    super(message);
    this.name = 'ContentError';
    this.code = code;
    this.file = options.file;
    this.path = options.path;
  }
}
