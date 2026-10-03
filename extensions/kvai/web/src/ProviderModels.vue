<script setup lang="ts">
import { useKvman } from './kvman.ts';
import { useProviderModels } from './use-provider-models.ts';

// The provider's models (plan 07 §7.3, ADR 0009, 247): "Models N" with a search, one card of rows, and "Make
// default" on each row but the default's. Numbers follow the page's language, as kvcoder's `pageLanguage()` does.
const props = defineProps<{ providerId: string }>();
const kvman = useKvman();
const { models, loading, making, failure, search, visible, hasMore, noMatch, more, makeDefault } = useProviderModels(
  () => props.providerId,
);

/** Numbers in the UI language (ADR 0009, 132): kvwebui sets it on the page, not the browser's. */
function formatCount(value: number): string {
  const language = document.documentElement.lang === '' ? undefined : document.documentElement.lang;
  return new Intl.NumberFormat(language).format(value);
}

function choose(modelId: string): void {
  void makeDefault(modelId);
}
</script>

<template>
  <section data-test="provider-models" :aria-label="kvman.t('kvai.ui.models.title')">
    <div class="kvai-section-head">
      <h2 class="kvai-section-title" data-test="models-title">
        {{ kvman.t('kvai.ui.models.title') }} <span class="kvai-muted" data-test="models-count">{{ models.length }}</span>
      </h2>
      <span class="kvai-spacer"></span>
      <span class="kvai-search">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <label class="kvai-hidden" for="kvai-provider-search">{{ kvman.t('kvai.ui.provider.searchModels') }}</label>
        <input
          id="kvai-provider-search"
          v-model="search"
          type="search"
          class="kvai-search-input"
          data-test="models-search"
          :placeholder="kvman.t('kvai.ui.provider.searchModels')"
        />
      </span>
    </div>
    <p v-if="loading" class="kvai-text" data-test="models-loading" role="status">{{ kvman.t('kvai.ui.connection.loading') }}</p>
    <template v-else>
      <p v-if="failure !== null" class="kvai-error" data-test="models-error" role="alert">
        {{ kvman.t(failure.key, failure.params) }}
      </p>
      <div v-if="visible.length > 0" class="kvai-card kvai-model-list">
        <div
          v-for="model in visible"
          :key="model.id"
          class="kvai-model-row"
          data-test="model-row"
          :data-default="model.isDefault ? 'true' : 'false'"
        >
          <div class="kvai-model-text">
            <span class="kvai-model-name">{{ model.name }}</span>
            <span class="kvai-muted kvai-mono" data-test="model-id">{{ model.id }}</span>
          </div>
          <span class="kvai-model-flag"><span v-if="model.reasoning" class="kvai-muted kvai-thinking" data-test="model-thinking">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.4"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
              class="kvai-check"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
            {{ kvman.t('kvai.ui.columns.reasoning') }}
          </span></span>
          <span class="kvai-muted kvai-model-context" data-test="model-context">{{ formatCount(model.contextWindow) }}</span>
          <span v-if="model.isDefault" class="kvai-chip" data-test="model-default" data-tone="info">{{
            kvman.t('kvai.ui.models.default')
          }}</span>
          <button v-else type="button" class="kvai-button" data-test="make-default" :disabled="making" @click="choose(model.id)">
            {{ kvman.t('kvai.ui.models.makeDefault') }}
          </button>
        </div>
      </div>
      <p v-else-if="noMatch" class="kvai-muted" data-test="models-no-match" role="status">
        {{ kvman.t('kvai.ui.provider.noModelMatch') }}
      </p>
      <p v-else-if="models.length === 0" class="kvai-muted" data-test="models-empty">{{ kvman.t('kvai.ui.models.empty') }}</p>
      <button v-if="hasMore" type="button" class="kvai-button kvai-more" data-test="models-more" @click="more">
        {{ kvman.t('kvai.ui.providers.showMore', { count: '25' }) }}
      </button>
    </template>
  </section>
</template>
