<script setup lang="ts">
defineProps<{ design: 'countdown'; numeral?: number }>()
</script>

<template>
  <span :key="numeral" class="count-slate" aria-hidden="true">
    <i class="count-leading"></i><b>{{ numeral }}</b><i class="count-trailing"></i>
  </span>
</template>
