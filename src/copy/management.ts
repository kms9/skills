export const managementCopy = {
  loading: '正在加载管理后台…',
  signInRequired: '需要先登录。',
  noAccess: '当前账号无权访问管理后台。',
  title: '管理后台',
  subtitle: '管理全站技能，并处理技能生命周期。',
  signedInAs: '当前登录账号',
  superuserTag: '（超级管理员）',
  filters: {
    skills: {
      all: '全部',
      active: '正常',
      deleted: '已删除',
      searchPlaceholder: '搜索技能',
    },
  },
  actions: {
    restore: '恢复',
    delete: '删除',
    highlight: '设为精选',
    unhighlight: '取消精选',
  },
  skills: {
    loading: '正在加载技能…',
    loadFailed: '加载技能失败。',
    ownerPrefix: '作者',
    statusPrefix: '状态',
    highlightedPrefix: '精选',
    highlightedYes: '是',
    highlightedNo: '否',
    versionsPrefix: '版本数',
    unknownOwner: '未知',
  },
} as const
