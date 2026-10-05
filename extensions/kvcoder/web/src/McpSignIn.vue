<script setup lang="ts">
import { CircleAlert, CircleCheck } from '@lucide/vue';
import { onMounted, ref } from 'vue';
import { problemKey, problemOf, useKvman } from './kvman.ts';

// The page an MCP server sends the browser back to after a sign-in (plan 08 §8.7, ADR 0020, 11): it hands the code
// and state of its address to kvcoder, and says how that went. It opens in a tab of its own, which the person closes.
const kvman = useKvman();
const outcome = ref<{ kind: 'working' } | { kind: 'done'; name: string } | { kind: 'failed'; text: string }>({ kind: 'working' });

onMounted(async () => {
  const address = new URLSearchParams(window.location.search);
  const code = address.get('code');
  const state = address.get('state');
  if (address.has('error') || code === null || code === '' || state === null || state === '') return void (outcome.value = { kind: 'failed', text: kvman.t('kvcoder.config.mcp.signIn.unfinished') });
  try {
    outcome.value = { kind: 'done', name: (await kvman.exec('kvcoder.mcp.sign-in.finish', { state, code })).name };
  } catch (error) {
    const problem = problemOf(error);
    outcome.value = { kind: 'failed', text: problem === undefined ? kvman.t('kvcoder.ui.failed') : kvman.t(problemKey(problem.code), problem.params) };
  }
});
</script>

<template>
  <div class="kvc-sign-in" role="status" :data-outcome="outcome.kind" data-test="mcp-sign-in">
    <template v-if="outcome.kind === 'working'">
      <span class="kvc-setting-title">{{ kvman.t('kvcoder.config.mcp.signIn.working') }}</span>
    </template>
    <template v-else-if="outcome.kind === 'done'">
      <CircleCheck :size="28" class="kvc-sign-in-done" aria-hidden="true" />
      <span class="kvc-setting-title" data-test="mcp-sign-in-title">{{ kvman.t('kvcoder.config.mcp.signIn.done', { name: outcome.name }) }}</span>
      <span class="kvc-muted">{{ kvman.t('kvcoder.config.mcp.signIn.close') }}</span>
    </template>
    <template v-else>
      <CircleAlert :size="28" class="kvc-sign-in-failed" aria-hidden="true" />
      <span class="kvc-setting-title" data-test="mcp-sign-in-title">{{ kvman.t('kvcoder.config.mcp.signIn.failed') }}</span>
      <span class="kvc-muted" dir="auto" data-test="mcp-sign-in-reason">{{ outcome.text }}</span>
      <span class="kvc-muted">{{ kvman.t('kvcoder.config.mcp.signIn.retry') }}</span>
    </template>
  </div>
</template>
