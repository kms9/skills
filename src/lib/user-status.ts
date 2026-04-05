export function formatUserStatus(status?: string | null) {
  switch ((status ?? '').trim()) {
    case 'active':
      return '正常'
    case 'email_pending':
      return '待激活'
    case 'review_pending':
      return '待审核'
    case 'rejected':
      return '已拒绝'
    case 'disabled':
      return '已禁用'
    default:
      return '未知'
  }
}
