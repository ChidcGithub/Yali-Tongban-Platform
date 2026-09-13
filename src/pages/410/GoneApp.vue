<template>
  <ErrorPage current="410" :code="410"
             question="这个功能已经下线了"
             hint="相关页面已被移除，你可以从服务面板重新开始" />
</template>

<script setup lang="ts">
import ErrorPage from '../../components/ErrorPage.vue'
</script>
