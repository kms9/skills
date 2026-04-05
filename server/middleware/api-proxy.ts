import {
  appendResponseHeader,
  createError,
  getProxyRequestHeaders,
  defineEventHandler,
  getMethod,
  getRequestProtocol,
  getRequestURL,
  proxyRequest,
  setResponseStatus,
} from 'h3'

const BACKEND_TARGET = process.env.BACKEND_URL || 'http://localhost:10081'

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  const path = url.pathname
  const method = getMethod(event)

  let shouldProxy = false

  if (path.startsWith('/api/v1')) {
    shouldProxy = true
  } else if (path.startsWith('/.well-known/clawhub')) {
    shouldProxy = true
  } else if (path.startsWith('/auth/')) {
    if (method !== 'GET') {
      shouldProxy = true
    } else if (!path.startsWith('/auth/login')) {
      shouldProxy = true
    }
  }

  if (!shouldProxy) return

  const target = `${BACKEND_TARGET}${path}${url.search}`
  try {
    if (path.startsWith('/auth/') && method === 'GET') {
      const response = await fetch(target, {
        method,
        headers: {
          ...getProxyRequestHeaders(event),
          'x-forwarded-host': url.host,
          'x-forwarded-proto': getRequestProtocol(event, { xForwardedProto: true }),
        },
        redirect: 'manual',
      })

      setResponseStatus(event, response.status, response.statusText)

      for (const [key, value] of response.headers.entries()) {
        if (key.toLowerCase() === 'set-cookie') {
          for (const cookie of response.headers.getSetCookie()) {
            appendResponseHeader(event, 'set-cookie', cookie)
          }
          continue
        }
        appendResponseHeader(event, key, value)
      }

      return await response.text()
    }
    return await proxyRequest(event, target)
  } catch {
    throw createError({ statusCode: 502, message: 'Backend service unavailable' })
  }
})
