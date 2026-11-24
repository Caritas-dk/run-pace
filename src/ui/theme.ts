// K39: jeansblå hovedfarve, limegrøn accent, hvid og sort. Kontrast efter K40.
export const colors = {
  blue: '#2F5D8A', // hvid tekst: 6,6:1
  blueDark: '#244A6F',
  blueLight: '#E8EFF6',
  lime: '#B7EF00', // sort tekst: 14:1; brug aldrig som tekst på hvid
  white: '#FFFFFF',
  black: '#111111',
  text: '#111111',
  textMuted: '#4A5563', // 7,5:1 på hvid
  border: '#C9D3DE',
  surface: '#F4F7FA',
  danger: '#B42318', // 6,5:1 på hvid
  warningBg: '#FFF4D6',
  warningText: '#6B4E00',
  // Statusfarver bruges altid sammen med ikon og tekst (K40)
  fast: '#B42318',
  slow: '#2F5D8A',
  stable: '#111111',
};

export const fonts = {
  regular: 'Archivo_400Regular',
  semibold: 'Archivo_600SemiBold',
  bold: 'Archivo_700Bold',
  display: 'Archivo_900Black_Italic',
};

/** K40: mindst 44 pt (iOS) / 48 dp (Android). */
export const TOUCH = 48;

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 };
export const radius = { s: 8, m: 12, l: 16, pill: 999 };
