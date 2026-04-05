import { getSkillsBrandName } from '../lib/brand'

export const authCopy = {
  brandName: getSkillsBrandName(),
  entry: {
    title: '欢迎回来',
    subtitle: '',
    feishu: '使用飞书登录',
    feishuHint: '',
    primaryLoading: '正在拉起飞书授权…',
  },
  info: {
    feishuAutoStarted: '已检测到飞书客户端，正在尝试飞书授权登录。',
  },
  errors: {
    feishuLoginFailed: '飞书登录失败。',
    loginFailed: '登录失败。',
    accountNotActivated: '当前账号暂时无法登录。',
    accountPendingReview: '当前账号暂时无法登录。',
    accountRejected: '你的账号审核未通过。',
    accountDisabled: '你的账号已被停用。',
    accountNotActivatedYet: '当前账号暂时无法登录。',
    emailNotBound: '当前账号暂时无法登录。',
  },
} as const

export function mapAuthErrorMessage(message: string | null | undefined) {
  switch (message) {
    case 'email not bound to any account':
      return authCopy.errors.emailNotBound
    case 'account not activated':
      return authCopy.errors.accountNotActivated
    case 'account pending review':
      return authCopy.errors.accountPendingReview
    case 'account rejected':
      return authCopy.errors.accountRejected
    case 'account disabled':
      return authCopy.errors.accountDisabled
    default:
      return message ?? null
  }
}

export function mapOAuthAuthErrorMessage(message: string | null | undefined) {
  switch (message) {
    case 'feishu auth unavailable':
      return authCopy.errors.feishuLoginFailed
    case 'account pending review':
      return authCopy.errors.accountPendingReview
    case 'account rejected':
      return authCopy.errors.accountRejected
    case 'account disabled':
      return authCopy.errors.accountDisabled
    case 'account not activated':
      return authCopy.errors.accountNotActivatedYet
    default:
      return message ?? null
  }
}
