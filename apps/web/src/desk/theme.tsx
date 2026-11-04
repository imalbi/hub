import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
type Theme = 'ink' | 'paper';
const storageKey = 'hub.theme';
const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void } | null>(null);
function readTheme(): Theme {
  try {
    return localStorage.getItem(storageKey) === 'paper' ? 'paper' : 'ink';
  } catch {
    return 'ink';
  }
}
export function DeskTheme({ children }: { children: ReactNode }) {
  const [theme, updateTheme] = useState(readTheme);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    return () => {
      document.documentElement.dataset.theme = 'ink';
    };
  }, [theme]);
  function setTheme(value: Theme) {
    updateTheme(value);
    try {
      localStorage.setItem(storageKey, value);
    } catch {
      /* The current view can still switch when storage is unavailable. */
    }
  }
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}
export function useDeskTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('DeskTheme is missing');
  return context;
}
