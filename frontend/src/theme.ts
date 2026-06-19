export const theme = {
  color: {
    surface: '#F9F9F8',
    surfaceSecondary: '#FFFFFF',
    surfaceTertiary: '#F2F2F0',
    surfaceInverse: '#1A1A1A',
    onSurface: '#1A1A1A',
    onSurfaceMuted: '#4A4A4A',
    onSurfaceInverse: '#FFFFFF',
    brand: '#C25B4E',
    brandSecondary: '#E8A29A',
    brandTertiary: '#F7EBEA',
    onBrand: '#FFFFFF',
    success: '#317159',
    warning: '#B27C12',
    error: '#B94A4A',
    border: '#E5E5E3',
    borderStrong: '#D1D1CE',
    divider: '#E5E5E3',
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 6, md: 12, lg: 20, pill: 999 },
  font: {
    sm: 12,
    base: 14,
    lg: 16,
    xl: 20,
    xxl: 24,
  },
};

export const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  'Available': { bg: '#E0EFE7', fg: '#317159' },
  'Limited stock': { bg: '#FBEFD0', fg: '#B27C12' },
  'Will be available shortly': { bg: '#F7EBEA', fg: '#C25B4E' },
  'Out of stock': { bg: '#F2DCDC', fg: '#B94A4A' },
};

export const STATUS_OPTIONS = ['Available', 'Limited stock', 'Will be available shortly', 'Out of stock'];

export const BRAND_COLORS = ['#C25B4E', '#1A1A1A', '#317159', '#B27C12', '#4A4A4A', '#2D4F8E', '#7A3E9D', '#D2691E'];
