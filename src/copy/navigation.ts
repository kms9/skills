import { getSkillsBrandName } from '../lib/brand'

export const navigationCopy = {
  links: {
    clawHub: getSkillsBrandName(),
    skills: '技能',
    souls: '灵魂',
    mySkills: '我的技能',
    search: '搜索',
    stars: '收藏',
    management: '管理后台',
  },
} as const
