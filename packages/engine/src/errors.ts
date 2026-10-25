export class RouteError extends Error {
  readonly code: string;
  readonly path?: string;
  readonly sources?: string[];

  constructor(
    code: string,
    message: string,
    options: {
      path?: string;
      sources?: string[];
    } = {},
  ) {
    super(message);
    this.name = 'RouteError';
    this.code = code;
    this.path = options.path;
    this.sources = options.sources;
  }
}
