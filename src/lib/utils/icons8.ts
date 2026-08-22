// Icons8 Unified Graphic Asset Helper for Concord
// Pack locked: "color" (48px - 96px)

export interface IconItem {
  id: string;
  name: string;
  category: string;
  url: string;
}

export const ICONS8_ICONS: Record<string, { id: string; name: string; url: string }> = {
  // Roles & Badges
  crown: {
    id: '13728',
    name: 'Dono',
    url: 'https://img.icons8.com/?id=13728&format=png&size=48'
  },
  shield: {
    id: '16239',
    name: 'Admin',
    url: 'https://img.icons8.com/?id=16239&format=png&size=48'
  },
  robot: {
    id: '9tRPx6QHufDN',
    name: 'Bot',
    url: 'https://img.icons8.com/?id=9tRPx6QHufDN&format=png&size=48'
  },
  user: {
    id: '13042',
    name: 'Usuário',
    url: 'https://img.icons8.com/?id=13042&format=png&size=48'
  },

  // Avatars / Characters
  ninja: {
    id: '20809',
    name: 'Ninja',
    url: 'https://img.icons8.com/?id=20809&format=png&size=48'
  },
  wizard: {
    id: '17388',
    name: 'Mago',
    url: 'https://img.icons8.com/?id=17388&format=png&size=48'
  },
  astronaut: {
    id: '13474',
    name: 'Astronauta',
    url: 'https://img.icons8.com/?id=13474&format=png&size=48'
  },
  fox: {
    id: '40811',
    name: 'Raposa',
    url: 'https://img.icons8.com/?id=40811&format=png&size=48'
  },
  cat: {
    id: '16017',
    name: 'Gato',
    url: 'https://img.icons8.com/?id=16017&format=png&size=48'
  },
  dog: {
    id: '16018',
    name: 'Cachorro',
    url: 'https://img.icons8.com/?id=16018&format=png&size=48'
  },
  panda: {
    id: '16093',
    name: 'Panda',
    url: 'https://img.icons8.com/?id=16093&format=png&size=48'
  },
  lion: {
    id: '33035',
    name: 'Leão',
    url: 'https://img.icons8.com/?id=33035&format=png&size=48'
  },
  frog: {
    id: '18912',
    name: 'Sapo',
    url: 'https://img.icons8.com/?id=18912&format=png&size=48'
  },
  dragon: {
    id: 'NkphTkua9tjT',
    name: 'Dragão',
    url: 'https://img.icons8.com/?id=NkphTkua9tjT&format=png&size=48'
  },
  skull: {
    id: '14870',
    name: 'Caveira',
    url: 'https://img.icons8.com/?id=14870&format=png&size=48'
  },
  ghost: {
    id: '17343',
    name: 'Fantasma',
    url: 'https://img.icons8.com/?id=17343&format=png&size=48'
  },

  // Gaming & Server Themes
  controller: {
    id: '11907',
    name: 'Gaming',
    url: 'https://img.icons8.com/?id=11907&format=png&size=48'
  },
  rocket: {
    id: '15175',
    name: 'Foguete',
    url: 'https://img.icons8.com/?id=15175&format=png&size=48'
  },
  fire: {
    id: '18515',
    name: 'Fogo',
    url: 'https://img.icons8.com/?id=18515&format=png&size=48'
  },
  diamond: {
    id: '17333',
    name: 'Diamante',
    url: 'https://img.icons8.com/?id=17333&format=png&size=48'
  },
  lightning: {
    id: '15366',
    name: 'Raio',
    url: 'https://img.icons8.com/?id=15366&format=png&size=48'
  },
  headphones: {
    id: '20747',
    name: 'Áudio / Música',
    url: 'https://img.icons8.com/?id=20747&format=png&size=48'
  }
};

// Emoji to Icons8 Mapping (For seamless backward compatibility with existing data)
const EMOJI_MAP: Record<string, string> = {
  '👤': ICONS8_ICONS.user.url,
  '👑': ICONS8_ICONS.crown.url,
  '🛡️': ICONS8_ICONS.shield.url,
  '🤖': ICONS8_ICONS.robot.url,
  '🥷': ICONS8_ICONS.ninja.url,
  '🧙': ICONS8_ICONS.wizard.url,
  '👨‍🚀': ICONS8_ICONS.astronaut.url,
  '🦊': ICONS8_ICONS.fox.url,
  '🐱': ICONS8_ICONS.cat.url,
  '🐶': ICONS8_ICONS.dog.url,
  '🐼': ICONS8_ICONS.panda.url,
  '🦁': ICONS8_ICONS.lion.url,
  '🐸': ICONS8_ICONS.frog.url,
  '🐉': ICONS8_ICONS.dragon.url,
  '💀': ICONS8_ICONS.skull.url,
  '👻': ICONS8_ICONS.ghost.url,
  '🎮': ICONS8_ICONS.controller.url,
  '🚀': ICONS8_ICONS.rocket.url,
  '🔥': ICONS8_ICONS.fire.url,
  '💎': ICONS8_ICONS.diamond.url,
  '⚡': ICONS8_ICONS.lightning.url,
  '🎧': ICONS8_ICONS.headphones.url,
  '💬': ICONS8_ICONS.controller.url,
  '🎬': ICONS8_ICONS.headphones.url,
  '🌐': ICONS8_ICONS.rocket.url,
  '💻': ICONS8_ICONS.robot.url,
  '👾': ICONS8_ICONS.controller.url,
  '🎵': ICONS8_ICONS.headphones.url
};

/**
 * Returns a high-res Icons8 image URL for any avatar representation (URL, key, or emoji)
 */
export function getAvatarUrl(avatar: string | null | undefined): string {
  if (!avatar) return ICONS8_ICONS.user.url;
  if (avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('data:')) {
    return avatar;
  }
  if (ICONS8_ICONS[avatar]) {
    return ICONS8_ICONS[avatar].url;
  }
  if (EMOJI_MAP[avatar]) {
    return EMOJI_MAP[avatar];
  }
  return ICONS8_ICONS.user.url;
}

/**
 * Returns a high-res Icons8 image URL for server icons
 */
export function getServerIconUrl(icon: string | null | undefined): string {
  if (!icon) return ICONS8_ICONS.controller.url;
  if (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('data:')) {
    return icon;
  }
  if (ICONS8_ICONS[icon]) {
    return ICONS8_ICONS[icon].url;
  }
  if (EMOJI_MAP[icon]) {
    return EMOJI_MAP[icon];
  }
  return ICONS8_ICONS.controller.url;
}

// User Avatars list for the settings picker
export const AVATAR_OPTIONS = [
  { key: 'user', name: 'Padrão', url: ICONS8_ICONS.user.url },
  { key: 'ninja', name: 'Ninja', url: ICONS8_ICONS.ninja.url },
  { key: 'wizard', name: 'Mago', url: ICONS8_ICONS.wizard.url },
  { key: 'robot', name: 'Robô', url: ICONS8_ICONS.robot.url },
  { key: 'astronaut', name: 'Astronauta', url: ICONS8_ICONS.astronaut.url },
  { key: 'fox', name: 'Raposa', url: ICONS8_ICONS.fox.url },
  { key: 'cat', name: 'Gato', url: ICONS8_ICONS.cat.url },
  { key: 'dog', name: 'Cachorro', url: ICONS8_ICONS.dog.url },
  { key: 'panda', name: 'Panda', url: ICONS8_ICONS.panda.url },
  { key: 'lion', name: 'Leão', url: ICONS8_ICONS.lion.url },
  { key: 'dragon', name: 'Dragão', url: ICONS8_ICONS.dragon.url },
  { key: 'skull', name: 'Caveira', url: ICONS8_ICONS.skull.url },
  { key: 'ghost', name: 'Fantasma', url: ICONS8_ICONS.ghost.url },
  { key: 'controller', name: 'Gamer', url: ICONS8_ICONS.controller.url },
  { key: 'fire', name: 'Fogo', url: ICONS8_ICONS.fire.url },
  { key: 'diamond', name: 'Diamante', url: ICONS8_ICONS.diamond.url }
];

// Server Icons list for Create Server modal
export const SERVER_ICON_OPTIONS = [
  { key: 'controller', name: 'Gaming', url: ICONS8_ICONS.controller.url },
  { key: 'rocket', name: 'Comunidade', url: ICONS8_ICONS.rocket.url },
  { key: 'fire', name: 'Squad', url: ICONS8_ICONS.fire.url },
  { key: 'headphones', name: 'Música / Call', url: ICONS8_ICONS.headphones.url },
  { key: 'lightning', name: 'Ação', url: ICONS8_ICONS.lightning.url },
  { key: 'diamond', name: 'VIP', url: ICONS8_ICONS.diamond.url },
  { key: 'dragon', name: 'Guild', url: ICONS8_ICONS.dragon.url },
  { key: 'robot', name: 'Tech / Dev', url: ICONS8_ICONS.robot.url }
];
