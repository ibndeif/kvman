<script setup lang="ts">
import { ref } from 'vue';
import { useKvman } from './kvman.ts';
import { declinedKey, notificationsAvailable } from './needs-you-notices.ts';

// The one-time line that asks the browser for notifications, while the chat waits on the person (ADR 0091, 7). "Not
// now" is remembered in this browser; a page with no notifications never shows it.
const kvman = useKvman();

function wasDeclined(): boolean {
  try {
    return localStorage.getItem(declinedKey) === 'true';
  } catch (error) {
    // A browser that keeps no storage for this page can't remember the choice, so the line shows again.
    if (error instanceof DOMException) return false;
    throw error;
  }
}

const open = ref(notificationsAvailable() && Notification.permission === 'default' && !wasDeclined());

async function turnOn(): Promise<void> {
  await Notification.requestPermission();
  open.value = false;
}

function notNow(): void {
  try {
    localStorage.setItem(declinedKey, 'true');
  } catch (error) {
    if (!(error instanceof DOMException)) throw error;
  }
  open.value = false;
}
</script>

<template>
  <div v-if="open" class="kvc-notice" data-test="notify-line">
    {{ kvman.t('kvcoder.ui.notify.ask') }}
    <button type="button" class="kvc-link-button" data-test="notify-on" @click="turnOn">{{ kvman.t('kvcoder.ui.notify.on') }}</button>
    <button type="button" class="kvc-link-button" data-test="notify-later" @click="notNow">{{ kvman.t('kvcoder.ui.notify.later') }}</button>
  </div>
</template>
