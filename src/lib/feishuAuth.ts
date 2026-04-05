import { getFeishuAppIdEnv } from './env'

const FEISHU_SDK_URL = 'https://lf-scm-cn.feishucdn.com/lark/op/h5-js-sdk-1.5.30.js'

declare global {
  interface Window {
    tt?: {
      requestAccess?: (options: {
        appID: string
        scopeList: string[]
        success?: (result: { code: string }) => void
        fail?: (error: { errno?: number; errString?: string; errMsg?: string }) => void
      }) => void
      requestAuthCode?: (options: {
        appId: string
        success?: (result: { code: string }) => void
        fail?: (error: { errno?: number; errString?: string; errMsg?: string }) => void
      }) => void
    }
  }
}

let sdkPromise: Promise<void> | null = null

export function getFeishuAppId() {
  return getFeishuAppIdEnv()
}

export function isFeishuClient() {
  if (typeof navigator === 'undefined') return false
  return /(feishu|lark)/i.test(navigator.userAgent)
}

export function isFeishuAvailable() {
  return isFeishuClient() && !!getFeishuAppId()
}

export async function ensureFeishuSDK() {
  if (typeof window === 'undefined') return
  if (window.tt?.requestAccess || window.tt?.requestAuthCode) return
  if (sdkPromise) return sdkPromise

  sdkPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-feishu-sdk="true"]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('failed to load feishu sdk')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = FEISHU_SDK_URL
    script.async = true
    script.dataset.feishuSdk = 'true'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('failed to load feishu sdk'))
    document.head.appendChild(script)
  })

  return sdkPromise
}

export async function requestFeishuAuthCode() {
  const appId = getFeishuAppId()
  if (!appId) {
    throw new Error('飞书应用未配置')
  }
  await ensureFeishuSDK()

  return new Promise<string>((resolve, reject) => {
    const onFail = (error?: { errno?: number; errString?: string; errMsg?: string }) => {
      reject(new Error(error?.errString || error?.errMsg || '飞书授权失败'))
    }

    if (window.tt?.requestAccess) {
      window.tt.requestAccess({
        appID: appId,
        scopeList: [],
        success: (result) => resolve(result.code),
        fail: (error) => {
          if (error?.errno === 103 && window.tt?.requestAuthCode) {
            window.tt.requestAuthCode({
              appId,
              success: (result) => resolve(result.code),
              fail: onFail,
            })
            return
          }
          onFail(error)
        },
      })
      return
    }

    if (window.tt?.requestAuthCode) {
      window.tt.requestAuthCode({
        appId,
        success: (result) => resolve(result.code),
        fail: onFail,
      })
      return
    }

    reject(new Error('当前飞书客户端不支持授权'))
  })
}
