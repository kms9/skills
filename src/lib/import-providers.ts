import { getAllowedGitLabHostsValue } from "./env";

export type ImportProviderKind = "github" | "gitlab";

export type ImportCandidate = {
  path: string;
  readmePath: string;
  name: string | null;
  description: string | null;
};

export type RepositoryFile = {
  path: string;
  size: number;
  downloadUrl: string;
};

export type ImportResolvedRepo = {
  kind: ImportProviderKind;
  host: string;
  repo: string;
  ref: string;
  commit: string;
  path: string;
  repoUrl: string;
};

export type ImportRepositorySnapshot = {
  provider: ImportProviderKind;
  resolved: ImportResolvedRepo;
  files: RepositoryFile[];
  candidates: ImportCandidate[];
};

export type CandidatePreview = {
  resolved: ImportResolvedRepo;
  candidate: ImportCandidate;
  defaults: {
    selectedPaths: string[];
    slug: string;
    displayName: string;
    version: string;
    tags: string[];
  };
  files: Array<RepositoryFile & { defaultSelected: boolean }>;
};

type FetchLike = typeof fetch;

type GitHubParsedUrl = {
  owner: string;
  repo: string;
  ref?: string;
  path?: string;
};

const SKILL_FILENAMES = new Set(["skill.md", "skills.md"]);
const DEFAULT_GITLAB_HOSTS = ["gitlab.com", "gitlab.com"];

function normalizeRepoPath(path: string) {
  return path.replace(/^\/+/, "").replace(/\/+/g, "/").replace(/\/$/, "");
}

function basename(path: string) {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

export function deriveSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "imported-skill"
  );
}

export function deriveDisplayName(name: string): string {
  return name
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function buildCandidates(
  files: RepositoryFile[],
  fallbackName: string,
): ImportCandidate[] {
  return files
    .filter((file) => SKILL_FILENAMES.has(basename(file.path).toLowerCase()))
    .map((file) => {
      const path = normalizeRepoPath(
        file.path.split("/").slice(0, -1).join("/"),
      );
      return {
        path,
        readmePath: normalizeRepoPath(file.path),
        name: path ? basename(path) : fallbackName,
        description: null,
      };
    })
    .filter((candidate, index, items) => {
      const key = `${candidate.path}:${candidate.readmePath}`;
      return (
        items.findIndex((item) => `${item.path}:${item.readmePath}` === key) ===
        index
      );
    });
}

export function buildCandidatePreview(
  snapshot: ImportRepositorySnapshot,
  candidatePath: string,
): CandidatePreview {
  const normalizedCandidatePath = normalizeRepoPath(candidatePath);
  const candidate = snapshot.candidates.find(
    (item) => item.path === normalizedCandidatePath,
  );
  if (!candidate) throw new Error("Candidate not found");

  const prefix = normalizedCandidatePath ? `${normalizedCandidatePath}/` : "";
  const files = snapshot.files
    .filter(
      (file) =>
        !prefix ||
        file.path === normalizedCandidatePath ||
        file.path.startsWith(prefix),
    )
    .map((file) => ({
      path: prefix ? file.path.slice(prefix.length) : file.path,
      size: file.size,
      downloadUrl: file.downloadUrl,
      defaultSelected: true,
    }));

  const candidateName =
    candidate.name ||
    (normalizedCandidatePath
      ? basename(normalizedCandidatePath)
      : basename(snapshot.resolved.repo));
  return {
    resolved: snapshot.resolved,
    candidate,
    defaults: {
      selectedPaths: files.map((file) => file.path),
      slug: deriveSlug(candidateName),
      displayName: deriveDisplayName(candidateName),
      version: "0.1.0",
      tags: ["latest"],
    },
    files,
  };
}

export function detectImportProvider(raw: string): ImportProviderKind | null {
  if (parseGitHubUrl(raw)) return "github";
  if (looksLikeGitLabUrl(raw)) return "gitlab";
  return null;
}

export async function detectGitHubRepositoryImport(
  raw: string,
  fetcher: FetchLike = fetch,
) {
  const github = parseGitHubUrl(raw);
  if (github) return loadGitHubRepositoryImport(github, fetcher);
  throw new Error("Unsupported GitHub URL. Use: https://github.com/owner/repo");
}

function parseGitHubUrl(raw: string): GitHubParsedUrl | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" || url.hostname !== "github.com") return null;
    const parts = url.pathname
      .replace(/^\//, "")
      .replace(/\/$/, "")
      .split("/")
      .filter(Boolean);
    if (parts.length < 2) return null;

    const owner = parts[0] ?? "";
    const repo = (parts[1] ?? "").replace(/\.git$/, "");
    if (!owner || !repo) return null;

    if (parts[2] === "tree" || parts[2] === "blob") {
      const ref = parts[3] ?? "";
      if (!ref) return null;
      const rest = normalizeRepoPath(parts.slice(4).join("/"));
      return {
        owner,
        repo,
        ref,
        path:
          parts[2] === "blob"
            ? normalizeRepoPath(rest.split("/").slice(0, -1).join("/"))
            : rest,
      };
    }

    return { owner, repo };
  } catch {
    return null;
  }
}

async function loadGitHubRepositoryImport(
  parsed: GitHubParsedUrl,
  fetcher: FetchLike,
) {
  const ref = parsed.ref ?? (await resolveGitHubDefaultBranch(parsed, fetcher));
  const commit = await resolveGitHubCommit(
    parsed.owner,
    parsed.repo,
    ref,
    fetcher,
  );
  const path = normalizeRepoPath(parsed.path ?? "");
  const files = await fetchAllGitHubFiles(
    parsed.owner,
    parsed.repo,
    path,
    commit,
    fetcher,
  );
  const candidates = buildCandidates(files, parsed.repo);

  if (candidates.length === 0)
    throw new Error("No SKILL.md found in this repository or path.");

  return {
    provider: "github" as const,
    resolved: {
      kind: "github" as const,
      host: "github.com",
      repo: `${parsed.owner}/${parsed.repo}`,
      ref,
      commit,
      path,
      repoUrl: `https://github.com/${parsed.owner}/${parsed.repo}`,
    },
    files,
    candidates,
  };
}

async function resolveGitHubDefaultBranch(
  parsed: GitHubParsedUrl,
  fetcher: FetchLike,
) {
  const response = await fetcher(
    `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,
  );
  if (!response.ok)
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText}`,
    );
  const data = (await response.json()) as { default_branch?: string };
  return data.default_branch || "main";
}

async function resolveGitHubCommit(
  owner: string,
  repo: string,
  ref: string,
  fetcher: FetchLike,
) {
  const response = await fetcher(
    `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`,
  );
  if (!response.ok)
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText}`,
    );
  const data = (await response.json()) as { sha?: string };
  if (!data.sha) throw new Error("GitHub commit sha missing");
  return data.sha;
}

async function fetchGitHubContents(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  fetcher: FetchLike,
) {
  const encodedPath = path || "";
  const response = await fetcher(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
  );
  if (!response.ok)
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText}`,
    );
  const data = await response.json();
  return Array.isArray(data) ? data : [data];
}

async function fetchAllGitHubFiles(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  fetcher: FetchLike,
): Promise<RepositoryFile[]> {
  const items = await fetchGitHubContents(owner, repo, path, ref, fetcher);
  const files: RepositoryFile[] = [];

  for (const item of items) {
    if (item.type === "file" && item.download_url) {
      files.push({
        path: normalizeRepoPath(item.path),
        size: Number(item.size ?? 0),
        downloadUrl: item.download_url,
      });
      continue;
    }
    if (item.type === "dir") {
      files.push(
        ...(await fetchAllGitHubFiles(
          owner,
          repo,
          normalizeRepoPath(item.path),
          ref,
          fetcher,
        )),
      );
    }
  }

  return files;
}

function getAllowedGitLabHosts() {
  return getAllowedGitLabHostsValue();
}

function looksLikeGitLabUrl(raw: string) {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:") return false;
    return getAllowedGitLabHosts().includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}
