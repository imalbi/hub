/** Phone-style widget sizes on the 12-column desk grid; one row is `--spacing-widget-row`. */
export const widgetCells = {
  small: { w: 3, h: 1 },
  medium: { w: 6, h: 1 },
  large: { w: 6, h: 2 },
  wide: { w: 12, h: 1 },
  full: { w: 12, h: 2 },
} as const;

export type WidgetSize = keyof typeof widgetCells;
