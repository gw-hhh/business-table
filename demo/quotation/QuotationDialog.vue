<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import TableIcon from '../../src/components/TableIcon.vue'
defineProps<{ title: string; wide?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const panel = ref<HTMLElement>()
const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); emit('close') }
  if (event.key !== 'Tab') return
  const items = [...(panel.value?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]') ?? [])]
  const first = items[0], last = items.at(-1)
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}
onMounted(async () => {
  await nextTick()
  const autofocus = panel.value?.querySelector<HTMLElement>('[autofocus]:not(:disabled)')
  const firstControl = panel.value?.querySelector<HTMLElement>('input:not(:disabled):not([readonly]),button:not(:disabled)')
  ;(autofocus ?? firstControl ?? panel.value)?.focus()
})
onBeforeUnmount(() => previousFocus?.focus())
</script>

<template>
  <Teleport to="body">
    <div class="q-dialog-overlay" @click.self="emit('close')">
      <section ref="panel" class="q-dialog" :class="{ 'q-dialog--wide': wide }" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1" @keydown="keydown">
        <header class="q-dialog-heading"><h2>{{ title }}</h2><button class="q-icon-btn" type="button" aria-label="关闭弹窗" @click="emit('close')"><TableIcon name="close"/></button></header>
        <div class="q-dialog-content"><slot/></div>
        <footer class="q-dialog-footer"><slot name="footer"/></footer>
      </section>
    </div>
  </Teleport>
</template>
