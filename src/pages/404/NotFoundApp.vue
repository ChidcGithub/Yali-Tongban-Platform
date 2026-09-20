<template>
  <ErrorPage current="404" :code="404"
             question="嗯？这个页面好像不存在……"
             hint="它可能被移除了，或者你输错了地址" />
</template>

<script setup lang="ts">
import ErrorPage from '../../components/ErrorPage.vue'
</script>
