export type DesignTheme = {
    name: string;
    path: string;
    label?: string;
};

export const themes = [
    { name: 'claude', path: '@/themes/claude.css', label: 'Claude' },
    { name: 'zen', path: '@/themes/zen.css', label: 'Zen' },
    { name: 'blue', path: '@/themes/blue.css', label: 'Blue' },
    { name: 'purple', path: '@/themes/purple.css', label: 'Purple' },
] as const satisfies readonly DesignTheme[];

const cssLoaders = import.meta.glob('/src/themes/*.css');
const loadedThemePaths = new Set<string>();

export const DEFAULT_THEME_NAME = themes[0]?.name ?? 'claude';

function toLoaderPath(path: string): string {
    if (path.startsWith('@/')) {
        return `/src/${path.slice(2)}`;
    }
    return path;
}

function getThemeByName(name: string) {
    return themes.find((theme) => theme.name === name);
}

export function resolveDesignThemeName(name: string | null | undefined): string {
    const normalized = typeof name === 'string' ? name.trim() : '';
    return getThemeByName(normalized)?.name ?? DEFAULT_THEME_NAME;
}

export function getDesignThemeLabel(theme: DesignTheme): string {
    if (theme.label && theme.label.trim()) {
        return theme.label;
    }

    return theme.name.charAt(0).toUpperCase() + theme.name.slice(1);
}

export async function applyDesignTheme(name: string): Promise<string> {
    const resolvedName = resolveDesignThemeName(name);
    const theme = getThemeByName(resolvedName);

    if (!theme) {
        return DEFAULT_THEME_NAME;
    }

    const loaderPath = toLoaderPath(theme.path);
    const loader = cssLoaders[loaderPath];

    if (loader && !loadedThemePaths.has(loaderPath)) {
        await loader();
        loadedThemePaths.add(loaderPath);
    }

    document.documentElement.setAttribute('data-design-theme', resolvedName);
    return resolvedName;
}
