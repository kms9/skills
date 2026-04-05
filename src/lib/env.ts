const DEFAULT_API_PATH = "/api/v1";
const DEFAULT_SITE_URL = "https://clawhub.ai";
const DEFAULT_SOUL_SITE_URL = "https://onlycrabs.ai";
const DEFAULT_SOUL_HOST = "onlycrabs.ai";
const DEFAULT_SKILLS_BRAND_NAME = "ClawHub";
const DEFAULT_SOULS_BRAND_NAME = "SoulHub";
const DEFAULT_CLI_NPM_REGISTRY = "https://registry.npmjs.org";
const DEFAULT_CLI_PACKAGE_NAME = "clawhub@latest";
const DEFAULT_GITLAB_HOSTS = ["gitlab.com", "gitlab.com"] as const;

function readMetaEnv(key: string) {
  const env = import.meta.env as unknown as Record<string, unknown>;
  const value = env[key];
  return typeof value === "string" ? value : undefined;
}

function readProcessEnv(key: string) {
  const env = process.env as Record<string, string | undefined>;
  return env[key];
}

function readTrimmed(...values: Array<string | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

export function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function normalizeOriginLike(value?: string | null) {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    return trimTrailingSlash(new URL(raw).toString());
  } catch {
    return trimTrailingSlash(raw);
  }
}

export function getSiteUrlEnv() {
  return readTrimmed(readMetaEnv("VITE_SITE_URL"), readProcessEnv("SITE_URL"));
}

export function getSiteUrl() {
  return normalizeOriginLike(getSiteUrlEnv()) ?? DEFAULT_SITE_URL;
}

export function getSiteModeEnv() {
  return readTrimmed(readMetaEnv("VITE_SITE_MODE"));
}

export function getSoulSiteUrlEnv() {
  return readTrimmed(readMetaEnv("VITE_SOULHUB_SITE_URL"));
}

export function getSoulSiteUrl() {
  const explicit = normalizeOriginLike(getSoulSiteUrlEnv());
  if (explicit) return explicit;

  const siteUrl = getSiteUrlEnv();
  if (siteUrl) {
    try {
      const url = new URL(siteUrl);
      if (
        url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "0.0.0.0"
      ) {
        return url.origin;
      }
    } catch {
      // Ignore invalid URLs and fall back to the default soul site origin.
    }
  }

  return DEFAULT_SOUL_SITE_URL;
}

export function getSoulHost() {
  return readTrimmed(readMetaEnv("VITE_SOULHUB_HOST")) || DEFAULT_SOUL_HOST;
}

export function getApiOrigin() {
  return normalizeOriginLike(
    readTrimmed(
      readMetaEnv("VITE_API_ORIGIN"),
      readMetaEnv("VITE_BACKEND_BASE"),
      readProcessEnv("API_ORIGIN"),
      readProcessEnv("BACKEND_URL"),
      readMetaEnv("VITE_CONVEX_SITE_URL"),
    ),
  );
}

export function getApiBase() {
  const explicit = readTrimmed(
    readMetaEnv("VITE_API_BASE"),
    readMetaEnv("VITE_API_BASE_URL"),
  );
  if (explicit) return explicit;

  const origin = getApiOrigin();
  return origin ? `${origin}${DEFAULT_API_PATH}` : DEFAULT_API_PATH;
}

export function getBackendBase() {
  return getApiOrigin() ?? "";
}

export function getAuthBase() {
  return (
    normalizeOriginLike(readTrimmed(readMetaEnv("VITE_AUTH_BASE_URL"))) ??
    getBackendBase()
  );
}

export function getSkillsBrandNameEnv() {
  return readTrimmed(readMetaEnv("VITE_SKILLS_BRAND_NAME"));
}

export function getSkillsBrandNameValue() {
  return getSkillsBrandNameEnv() || DEFAULT_SKILLS_BRAND_NAME;
}

export function getSoulsBrandNameValue() {
  return (
    readTrimmed(readMetaEnv("VITE_SOULS_BRAND_NAME")) ||
    DEFAULT_SOULS_BRAND_NAME
  );
}

export function getFeishuAppIdEnv() {
  return readTrimmed(readMetaEnv("VITE_FEISHU_APP_ID"));
}

export function getCliNpmRegistryValue() {
  return (
    normalizeOriginLike(readTrimmed(readMetaEnv("VITE_CLI_NPM_REGISTRY"))) ??
    DEFAULT_CLI_NPM_REGISTRY
  );
}

export function getCliPackageNameValue() {
  return (
    readTrimmed(readMetaEnv("VITE_CLI_PACKAGE_NAME")) ||
    DEFAULT_CLI_PACKAGE_NAME
  );
}

export function getCliSkillRegistryValue() {
  return (
    normalizeOriginLike(readTrimmed(readMetaEnv("VITE_CLI_SKILL_REGISTRY"))) ??
    getBackendBase() ??
    normalizeOriginLike(getSiteUrlEnv()) ??
    (typeof window !== "undefined"
      ? normalizeOriginLike(window.location.origin)
      : null) ??
    "http://localhost:10091"
  );
}

export function getAllowedGitLabHostsValue() {
  const raw = readTrimmed(readMetaEnv("VITE_GITLAB_IMPORT_HOSTS"));
  if (!raw) return [...DEFAULT_GITLAB_HOSTS];
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
        .concat(DEFAULT_GITLAB_HOSTS),
    ),
  );
}
