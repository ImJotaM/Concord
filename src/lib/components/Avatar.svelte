<script lang="ts">
  import { getUserInitials, getUserColor, isCustomImage } from '../utils/avatar';

  interface Props {
    name?: string;
    avatar?: string;
    userId?: string;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
    class?: string;
    shape?: 'circle' | 'rounded';
    isSpeaking?: boolean;
  }

  let {
    name = '',
    avatar = '',
    userId = '',
    size = 'md',
    class: customClass = '',
    shape = 'circle',
    isSpeaking = false,
  }: Props = $props();

  let initials = $derived(getUserInitials(name || userId));
  let bgColor = $derived(getUserColor(userId || name));
  let hasImage = $derived(isCustomImage(avatar));

  const sizeClasses = {
    xs: 'w-5 h-5 min-w-[20px] min-h-[20px] aspect-square text-[9px]',
    sm: 'w-6 h-6 min-w-[24px] min-h-[24px] aspect-square text-[10px]',
    md: 'w-8 h-8 min-w-[32px] min-h-[32px] aspect-square text-xs',
    lg: 'w-10 h-10 min-w-[40px] min-h-[40px] aspect-square text-sm font-bold',
    xl: 'w-16 h-16 min-w-[64px] min-h-[64px] aspect-square text-xl font-bold',
    '2xl': 'w-20 h-20 min-w-[80px] min-h-[80px] aspect-square text-2xl font-extrabold',
  };
</script>

<div
  class="relative inline-flex items-center justify-center select-none shrink-0 font-bold tracking-tight uppercase overflow-hidden shadow-sm transition-all {sizeClasses[size] || sizeClasses.md} {shape === 'circle' ? 'rounded-full' : 'rounded-2xl'} {isSpeaking ? 'ring-2 ring-[#23a55a] ring-offset-1 ring-offset-[#111214]' : ''} {customClass}"
  style={!hasImage ? `background-color: ${bgColor}; color: #ffffff;` : ''}
>
  {#if hasImage}
    <img src={avatar} alt={name} class="w-full h-full object-cover" loading="lazy" />
  {:else}
    <span class="leading-none flex items-center justify-center select-none pointer-events-none">{initials}</span>
  {/if}
</div>
