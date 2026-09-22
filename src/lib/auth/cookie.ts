// Cookies were named a2a_* before the rename to Holloway. New cookies are
// written under holloway_*; both names are read (new first), so a browser that
// logged in before the rename stays logged in, and both are cleared on logout.
export const SESSION_COOKIE = 'holloway_session'
export const LEGACY_SESSION_COOKIE = 'a2a_session'
export const SESSION_COOKIES = [SESSION_COOKIE, LEGACY_SESSION_COOKIE] as const

export const ACTIVE_AGENT_COOKIE = 'holloway_active_agent'
export const LEGACY_ACTIVE_AGENT_COOKIE = 'a2a_active_agent'
export const ACTIVE_AGENT_COOKIES = [ACTIVE_AGENT_COOKIE, LEGACY_ACTIVE_AGENT_COOKIE] as const

type CookieReader = { get: (name: string) => { value: string } | undefined }

const firstValue = (store: CookieReader, names: readonly string[]) => {
  for (const name of names) {
    const value = store.get(name)?.value
    if (value) return value
  }
  return undefined
}

export const readSessionCookie = (store: CookieReader) => firstValue(store, SESSION_COOKIES)
export const readActiveAgentCookie = (store: CookieReader) => firstValue(store, ACTIVE_AGENT_COOKIES)
