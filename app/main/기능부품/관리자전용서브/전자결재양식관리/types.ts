export type TemplateDesign = {
  title?: string;
  subtitle?: string;
  companyLabel?: string;
  primaryColor?: string;
  borderColor?: string;
  footerText?: string;
  showSignArea?: boolean;
  showBackgroundLogo?: boolean;
  backgroundLogoUrl?: string;
  backgroundLogoOpacity?: number;
  showSeal?: boolean;
  sealLabel?: string;
  sealImageUrl?: string;
  titleXPercent?: number;
  titleYPercent?: number;
  subtitleXPercent?: number;
  subtitleYPercent?: number;
  signXPercent?: number;
  signYPercent?: number;
};

export type FormTypeRow = {
  id: string;
  name: string;
  slug?: string;
  base_slug?: string | null;
  company_name?: string | null;
  sort_order?: number | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type TemplateOption = {
  slug: string;
  name: string;
  summary: string;
};

export type PreviewRow = {
  label: string;
  value: string;
};

export type TemplatePreviewSpec = {
  badge: string;
  intro: string;
  summary: string;
  metaRows: PreviewRow[];
  detailRows: PreviewRow[];
  footerNote: string;
};

export type TemplateDesignStore = {
  version: 2;
  defaults: Record<string, TemplateDesign>;
  companies: Record<string, Record<string, TemplateDesign>>;
};

export type FormTypeStore = {
  version: 2;
  defaults: FormTypeRow[];
  companies: Record<string, FormTypeRow[]>;
};
