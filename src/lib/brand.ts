import type { SiteMode } from './site'
import { getSkillsBrandNameValue, getSoulsBrandNameValue } from './env'

export function getSkillsBrandName() {
  return getSkillsBrandNameValue()
}

export function getSoulsBrandName() {
  return getSoulsBrandNameValue()
}

export function getBrandName(mode: SiteMode) {
  return mode === 'souls' ? getSoulsBrandName() : getSkillsBrandName()
}
