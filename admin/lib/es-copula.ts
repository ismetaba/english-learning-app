// Spanish ser/estar + adjective vocabulary, shared by the pattern scenes
// route and the content pipeline's scene estimates (scripts/es/).

/** Spanish words that complete ser/estar as a predicate ("estoy
 *  cansado", "es muy guapo"), with the gender/number variants (-o/-a/
 *  -os/-as) Spanish adjectives agree in. "bien"/"mal" are adverbs but
 *  fill the same slot in beginner staples ("Estoy bien" = İyiyim).
 *  Lowercased; accents as written in the subtitles, plus a few common
 *  unaccented spellings. */
export const ADJ_AFTER_COPULA = [
  // estar-leaning states / moods
  'bien', 'mal',
  'feliz', 'felices', 'triste', 'tristes',
  'contento', 'contenta', 'contentos', 'contentas',
  'cansado', 'cansada', 'cansados', 'cansadas',
  'ocupado', 'ocupada', 'ocupados', 'ocupadas',
  'enfermo', 'enferma', 'enfermos', 'enfermas',
  'listo', 'lista', 'listos', 'listas',
  'nervioso', 'nerviosa', 'nerviosos', 'nerviosas',
  'preocupado', 'preocupada', 'preocupados', 'preocupadas',
  'emocionado', 'emocionada', 'emocionados', 'emocionadas',
  'sorprendido', 'sorprendida', 'perdido', 'perdida',
  'enojado', 'enojada', 'enojados', 'enojadas', 'enfadado', 'enfadada',
  'aburrido', 'aburrida', 'asustado', 'asustada', 'asustados', 'asustadas',
  'seguro', 'segura', 'seguros', 'seguras',
  'solo', 'sola', 'solos', 'solas', 'libre', 'libres',
  'loco', 'loca', 'locos', 'locas',
  'despierto', 'despierta', 'dormido', 'dormida', 'muerto', 'muerta',
  'mojado', 'mojada', 'lleno', 'llena', 'vacío', 'vacía',
  // ser-leaning traits
  'alto', 'alta', 'altos', 'altas', 'bajo', 'baja', 'bajos', 'bajas',
  'joven', 'jóvenes', 'viejo', 'vieja', 'viejos', 'viejas',
  'nuevo', 'nueva', 'guapo', 'guapa', 'guapos', 'guapas',
  'feo', 'fea', 'feos', 'feas', 'bonito', 'bonita', 'bonitos', 'bonitas',
  'lindo', 'linda', 'lindos', 'lindas', 'hermoso', 'hermosa', 'precioso', 'preciosa',
  'fuerte', 'fuertes', 'débil', 'débiles',
  'rico', 'rica', 'ricos', 'ricas', 'pobre', 'pobres',
  'bueno', 'buena', 'buenos', 'buenas', 'malo', 'mala', 'malos', 'malas',
  'grande', 'grandes', 'pequeño', 'pequeña', 'pequeños', 'pequeñas', 'enorme', 'enormes',
  'gordo', 'gorda', 'flaco', 'flaca', 'delgado', 'delgada',
  'inteligente', 'inteligentes', 'amable', 'amables',
  'simpático', 'simpática', 'tonto', 'tonta',
  'importante', 'importantes', 'famoso', 'famosa',
  'divertido', 'divertida', 'divertidos', 'divertidas',
  'delicioso', 'deliciosa', 'emocionante', 'maravilloso', 'maravillosa',
  'fantástico', 'fantástica', 'estupendo', 'estupenda',
  'perfecto', 'perfecta', 'increíble', 'increíbles', 'increible',
  'difícil', 'difíciles', 'fácil', 'fáciles',
  'caro', 'cara', 'barato', 'barata', 'rápido', 'rápida',
  'lento', 'lenta', 'limpio', 'limpia', 'sucio', 'sucia',
  'frío', 'fría', 'caliente', 'calientes',
  // high-frequency conversational + description adjectives
  'normal', 'normales', 'real', 'reales', 'mejor', 'mejores', 'peor', 'peores',
  'igual', 'iguales', 'diferente', 'diferentes', 'posible', 'posibles', 'imposible',
  'rubio', 'rubia', 'rubios', 'rubias', 'moreno', 'morena', 'morenos', 'morenas',
  'mayor', 'mayores', 'menor', 'menores',
  'raro', 'rara', 'claro', 'clara', 'cierto', 'cierta',
  'genial', 'geniales', 'tranquilo', 'tranquila',
  'sincero', 'sincera', 'serio', 'seria',
];

/** Spanish intensifiers between a copula and an adjective:
 *  "es muy guapo", "estoy tan cansado". */
export const COPULA_INTENSIFIERS = [
  'muy', 'tan', 'súper', 'super', 'bastante', 'demasiado', 'realmente',
];

/** Copula forms per pattern id, in the order the iOS catalog lists them. */
export const COPULAS_BY_PATTERN: Record<string, string[]> = {
  'ser-estar-adj-yo': ['soy', 'estoy'],
  'ser-estar-adj-tu': ['eres', 'estás'],
  'ser-estar-adj-el': ['es', 'está'],
  'ser-estar-adj-nosotros': ['somos', 'estamos'],
  'ser-estar-adj-ellos': ['son', 'están'],
};
