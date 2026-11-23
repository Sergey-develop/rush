<script setup lang="ts">
import { formatNumber, type Run } from '../ui/profile'
import PilotPortrait from './PilotPortrait.vue'

defineProps<{ rows: Run[]; slots?: boolean; portraits?: readonly string[] }>()
</script>

<template>
  <ol class="leader-rows">
    <li v-for="(runner, index) in rows" :key="runner.pilot" class="leader-row">
      <span class="rank-number" :class="'rank-number--' + (index+1)">{{ index + 1 }}</span>
      <img v-if="portraits?.length" :src="portraits[index % portraits.length]" class="pilot-portrait" alt="" width="74" height="74" />
      <PilotPortrait v-else :variant="index + 1" />
      <span class="runner-name">{{ runner.pilot }}</span>
      <span class="runner-score">{{ formatNumber(runner.score) }}</span>
    </li>
    <template v-if="slots">
      <li v-for="n in Math.max(0, 3 - rows.length)" :key="'blank'+n" class="leader-row leader-row--empty">
        <span class="rank-number">{{ rows.length + n }}</span><span class="vacant-name">Свободное место</span><span>—</span>
      </li>
    </template>
  </ol>
</template>
