import { createContext, use } from 'react';

export const WidgetContext = createContext(false);
export function useInWidget() {
  return use(WidgetContext);
}
