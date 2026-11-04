import { useEffect } from 'react';

// The root font size and other layout-wide rules in index.css key off html[data-layout].
export function useLayout(layout: 'desk' | 'deck') {
  useEffect(() => {
    document.documentElement.dataset.layout = layout;
    return () => {
      delete document.documentElement.dataset.layout;
    };
  }, [layout]);
}
