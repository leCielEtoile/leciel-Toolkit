<script lang="ts">
  import { toast } from '@/lib/toast.svelte'
</script>

{#if toast.message}
  <div
    class="msg-animate px-4 py-3 rounded-2xl text-sm font-medium border
      {toast.message.type === 'success'
        ? 'bg-[var(--success-bg)] text-[var(--success-text)] border-[var(--success-border)]'
        : 'bg-[var(--error-bg)] text-[var(--error-text)] border-[var(--error-border)]'}"
  >
    {toast.message.text}
  </div>
{/if}
