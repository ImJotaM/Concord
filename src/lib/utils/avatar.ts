// Concord Discord-Style Avatar & Server Acronym Helpers

export const DISCORD_PALETTE = [
  '#5865f2', // Discord Blurple
  '#57f287', // Discord Green
  '#fee75c', // Discord Yellow
  '#eb459e', // Discord Pink / Fuchsia
  '#ed4245', // Discord Red
  '#00a8fc', // Discord Cyan / Teal
  '#f47b67', // Discord Coral
  '#9b59b6', // Amethyst Purple
  '#e67e22', // Orange
  '#1abc9c', // Emerald
];

export function getUserColor(idOrName?: string): string {
  if (!idOrName) return DISCORD_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < idOrName.length; i++) {
    hash = (hash << 5) - hash + idOrName.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % DISCORD_PALETTE.length;
  return DISCORD_PALETTE[index];
}

export function getUserInitials(name?: string): string {
  if (!name) return 'U';
  const clean = name.trim().replace(/^@/, '');
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  if (clean.length >= 2 && !clean.includes(' ')) {
    return clean.slice(0, 2).toUpperCase();
  }
  return clean.slice(0, 1).toUpperCase();
}

export function getServerAcronym(name?: string): string {
  if (!name) return 'S';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return words
    .map((w) => w[0])
    .slice(0, 3)
    .join('')
    .toUpperCase();
}

export function isCustomImage(avatar?: string): boolean {
  if (!avatar) return false;
  return (
    avatar.startsWith('http://') ||
    avatar.startsWith('https://') ||
    avatar.startsWith('data:image/') ||
    avatar.startsWith('/uploads/')
  );
}
