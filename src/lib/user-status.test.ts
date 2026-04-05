import { describe, expect, it } from 'vitest'
import { formatUserStatus } from './user-status'

describe('formatUserStatus', () => {
  it('formats known user statuses', () => {
    expect(formatUserStatus('active')).toBe('正常')
    expect(formatUserStatus('email_pending')).toBe('待激活')
    expect(formatUserStatus('review_pending')).toBe('待审核')
    expect(formatUserStatus('rejected')).toBe('已拒绝')
    expect(formatUserStatus('disabled')).toBe('已禁用')
  })

  it('falls back for unknown or empty statuses', () => {
    expect(formatUserStatus('')).toBe('未知')
    expect(formatUserStatus('custom')).toBe('未知')
    expect(formatUserStatus(undefined)).toBe('未知')
  })
})
