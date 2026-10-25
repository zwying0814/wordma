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

export class ThemeError extends Error {
  readonly code: string;
  readonly themeId?: string;
  readonly path?: string;

  constructor(
    code: string,
    message: string,
    options: {
      themeId?: string;
      path?: string;
    } = {},
  ) {
    super(message);
    this.name = 'ThemeError';
    this.code = code;
    this.themeId = options.themeId;
    this.path = options.path;
  }
}

export class BuildError extends Error {
  readonly code: string;
  readonly path?: string;

  constructor(
    code: string,
    message: string,
    options: {
      path?: string;
    } = {},
  ) {
    super(message);
    this.name = 'BuildError';
    this.code = code;
    this.path = options.path;
  }
}

