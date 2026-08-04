import { homedir } from 'os'
import { readFileSync } from 'fs'
import path from 'path'

const AUTH_JSON = path.join(homedir(), '.local/share/opencode/auth.json')

export interface Credential {
  deepseek?: string
  zhipuVision?: string
}

function readAuth(): Record<string, { key?: string }> {
  try {
    return JSON.parse(readFileSync(AUTH_JSON, 'utf8')) as Record<string, { key?: string }>
  } catch {
    return {}
  }
}

export function getCredentials(): Credential {
  const auth = readAuth()
  return {
    deepseek: auth.deepseek?.key,
    zhipuVision: auth['zhipuai-coding-plan']?.key,
  }
}
