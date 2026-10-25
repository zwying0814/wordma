export type ThemeOption = {
  label: string;
  value: string;
};

type FieldBase = {
  key: string;
  label: string;
  help?: string;
  group?: string;
  placeholder?: string;
  required?: boolean;
};

export type FieldDescriptor =
  | (FieldBase & {
      type: 'text';
      default?: string;
      minLength?: number;
      maxLength?: number;
    })
  | (FieldBase & {
      type: 'textarea';
      default?: string;
      rows?: number;
      minLength?: number;
      maxLength?: number;
    })
  | (FieldBase & {
      type: 'number';
      default?: number;
      min?: number;
      max?: number;
      step?: number;
    })
  | (FieldBase & {
      type: 'switch';
      default?: boolean;
    })
  | (FieldBase & {
      type: 'select';
      options: ThemeOption[];
      default?: string;
    })
  | (FieldBase & {
      type: 'color';
      default?: string;
    })
  | (FieldBase & {
      type: 'image';
      default?: string;
    })
  | (FieldBase & {
      type: 'date';
      default?: string;
    })
  | (FieldBase & {
      type: 'list';
      item: 'string' | 'number';
      default?: string[] | number[];
      minItems?: number;
      maxItems?: number;
    });

type SettingBase = {
  key: string;
  label: string;
  help?: string;
  required?: boolean;
};

export type ThemeSettingDescriptor =
  | (SettingBase & {
      type: 'text';
      default?: string;
    })
  | (SettingBase & {
      type: 'textarea';
      default?: string;
      rows?: number;
    })
  | (SettingBase & {
      type: 'number';
      default?: number;
      min?: number;
      max?: number;
      step?: number;
    })
  | (SettingBase & {
      type: 'switch';
      default?: boolean;
    })
  | (SettingBase & {
      type: 'select';
      options: ThemeOption[];
      default?: string;
    })
  | (SettingBase & {
      type: 'color';
      default?: string;
    })
  | (SettingBase & {
      type: 'image';
      default?: string;
    });

export type PageTypeDeclaration = {
  label: string;
  route: string;
  layout: string;
  collection?: string;
  fields: FieldDescriptor[];
};

export type ThemePageDeclaration = {
  id: string;
  path: string;
  layout: string;
};

export type ThemeContentConfig = {
  version: number;
  post: {
    fields: FieldDescriptor[];
  };
  page: {
    fields: FieldDescriptor[];
  };
  pageTypes: Record<string, PageTypeDeclaration>;
};

export type ThemePreview = {
  image?: string;
  colors: Record<string, string>;
};

export type ThemeManifest = {
  id: string;
  displayName: string;
  version: string;
  engines: {
    wordma: string;
  };
  preview?: ThemePreview;
  settings: ThemeSettingDescriptor[];
  content?: ThemeContentConfig;
  pages: ThemePageDeclaration[];
};
