<script setup lang="ts">
// Placeholder rows while something loads (ADR 0009, 75).
</script>

<template>
  <div class="flex flex-col gap-2.5 py-2" data-test="loading" aria-busy="true">
    <div class="h-3.5 w-3/5 rounded-md bg-neutral-soft" />
    <div class="h-3.5 w-4/5 rounded-md bg-neutral-soft" />
    <div class="h-3.5 w-2/5 rounded-md bg-neutral-soft" />
  </div>
</template>
