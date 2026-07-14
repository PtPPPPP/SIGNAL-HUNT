export type RendererEntry =
  | {
      kind: 'url';
      value: string;
    }
  | {
      hash: string;
      kind: 'file';
      value: string;
    };

type RendererEntryInput = {
  devServerUrl?: string;
  distIndexHtml?: string;
  route: string;
};

export function buildRendererEntry({ devServerUrl, distIndexHtml, route }: RendererEntryInput): RendererEntry {
  const normalizedRoute = normalizeHashRoute(route);

  if (devServerUrl?.trim()) {
    const url = new URL(devServerUrl);
    url.hash = normalizedRoute;

    return { kind: 'url', value: url.toString() };
  }

  if (!distIndexHtml) {
    throw new Error('distIndexHtml is required when devServerUrl is not provided.');
  }

  return {
    kind: 'file',
    value: distIndexHtml,
    hash: normalizedRoute,
  };
}

export function rendererUrlMatchesRoute(rendererUrl: string, route: string): boolean {
  try {
    const currentHash = new URL(rendererUrl).hash;
    if (!currentHash) return false;

    return normalizeHashRoute(currentHash) === normalizeHashRoute(route);
  } catch {
    return false;
  }
}

function normalizeHashRoute(route: string): string {
  const trimmed = route.trim();

  if (!trimmed || trimmed === '#') {
    return '/display';
  }

  const withoutHash = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  return withoutHash.startsWith('/') ? withoutHash : `/${withoutHash}`;
}
