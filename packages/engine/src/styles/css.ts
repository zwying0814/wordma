import { bundle, transform } from 'lightningcss';

export const CSS_TARGETS = {
  chrome: 120 << 16,
  safari: 17 << 16,
  firefox: 120 << 16,
};

export function compileCssFile(filePath: string): string {
  const result = bundle({
    filename: filePath,
    minify: true,
    sourceMap: false,
    targets: CSS_TARGETS,
  });

  return new TextDecoder().decode(result.code);
}

export function minifyCss(
  source: string,
  filename: string,
): string {
  const result = transform({
    filename,
    code: Buffer.from(source, 'utf8'),
    minify: true,
    sourceMap: false,
    targets: CSS_TARGETS,
  });

  return new TextDecoder().decode(result.code);
}
