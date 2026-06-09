// Clean line icons for materials + UI (ported from the prototype)
import React from "react";

const MAT_PATHS = {
  pipe: (<g><rect x="3" y="9" width="18" height="6" rx="1.2" /><line x1="3" y1="9" x2="3" y2="15" /><line x1="21" y1="9" x2="21" y2="15" /><line x1="8" y1="9" x2="8" y2="15" /><line x1="16" y1="9" x2="16" y2="15" /></g>),
  elbow: (<g><path d="M5 19 L5 11 A6 6 0 0 1 11 5 L19 5" /><path d="M5 19 L9 19" /><path d="M5 15 L9 15" /><path d="M19 5 L19 9" /><path d="M15 5 L15 9" /></g>),
  couple: (<g><rect x="3" y="9" width="18" height="6" rx="1" /><line x1="9" y1="7" x2="9" y2="17" /><line x1="15" y1="7" x2="15" y2="17" /></g>),
  tank: (<g><rect x="7" y="6" width="10" height="15" rx="3" /><path d="M10 6 L10 3 L14 3 L14 6" /><line x1="9" y1="11" x2="15" y2="11" /></g>),
  foam: (<g><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.2" /></g>),
  wire: (<g><path d="M3 14 q3 -6 6 0 t6 0 t6 0" /><line x1="3" y1="18" x2="21" y2="18" /></g>),
  breaker: (<g><rect x="7" y="3" width="10" height="18" rx="1.5" /><rect x="10" y="8" width="4" height="6" rx="1" /><line x1="12" y1="3" x2="12" y2="6" /></g>),
  cap: (<g><rect x="8" y="4" width="8" height="14" rx="3" /><line x1="10" y1="18" x2="10" y2="21" /><line x1="14" y1="18" x2="14" y2="21" /><line x1="9" y1="8" x2="15" y2="8" /></g>),
  bracket: (<g><path d="M4 7 L20 7 L20 11 L8 11 L8 17" /><line x1="4" y1="5" x2="4" y2="9" /><circle cx="8" cy="17" r="1.4" /></g>),
  tape: (<g><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.4" /><path d="M12 4 L12 1" /></g>),
  drain: (<g><path d="M6 4 L6 14 A6 6 0 0 0 18 14 L18 4" /><line x1="4" y1="4" x2="20" y2="4" /></g>),
  gas: (<g><rect x="8" y="7" width="8" height="14" rx="2" /><path d="M10 7 L10 4 L14 4 L14 7" /><path d="M12 10 c1.5 1.5 1.5 3 0 4 c-1.5 -1 -1.5 -2.5 0 -4Z" fill="currentColor" stroke="none" /></g>),
  rod: (<g><line x1="4" y1="20" x2="20" y2="4" /><line x1="17" y1="4" x2="20" y2="4" /><line x1="20" y1="7" x2="20" y2="4" /></g>),
};

export function MatIcon({ name, size = 24, color = "currentColor", strokeWidth = 1.6, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      style={style} aria-hidden="true">
      {MAT_PATHS[name] || MAT_PATHS.couple}
    </svg>
  );
}

const UI_PATHS = {
  dashboard: "M4 13h7V4H4v9Zm0 7h7v-5H4v5Zm9 0h7v-9h-7v9Zm0-16v5h7V4h-7Z",
  withdraw: "M12 3v12m0 0 4-4m-4 4-4-4M5 21h14",
  ret: "M12 21V9m0 0 4 4m-4-4-4 4M5 3h14",
  purchase: "M6 6h15l-1.5 9h-12L6 6Zm0 0L5 3H2m4 18a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm12 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z",
  damage: "M10.3 4.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0ZM12 9v4m0 4h.01",
  catalog: "M4 5h16M4 12h16M4 19h16M8 5v14",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.3-4.3",
  camera: "M3 8a2 2 0 0 1 2-2h2l1.5-2h7L19 6h0a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Zm9 3a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z",
  check: "M5 13l4 4L19 7",
  alert: "M12 8v5m0 3h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z",
  edit: "M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Zm10.5-13 3 3",
  trash: "M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7",
  logout: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0",
  chevR: "M9 6l6 6-6 6",
  chevD: "M6 9l6 6 6-6",
  menu: "M4 6h16M4 12h16M4 18h16",
  clipboard: "M9 4h6a1 1 0 0 1 1 1v1h2a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h2V5a1 1 0 0 1 1-1Zm0 2v1h6V6",
  x: "M6 6l12 12M18 6 6 18",
  box: "M12 3 3 7.5V16.5L12 21l9-4.5v-9L12 3Zm0 0v18M3 7.5 12 12l9-4.5",
  trend: "M3 17l6-6 4 4 8-8m0 0h-5m5 0v5",
};

export function UIcon({ name, size = 20, color = "currentColor", strokeWidth = 1.8, style, fill = "none" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      style={style} aria-hidden="true">
      <path d={UI_PATHS[name] || ""} />
    </svg>
  );
}

export function MaterialThumb({ mat, size = 48, radius = 12 }) {
  const c = mat.color || "#64748b";
  return (
    <div style={{
      width: size, height: size, borderRadius: radius,
      background: `color-mix(in srgb, ${c} 14%, white)`,
      border: `1px solid color-mix(in srgb, ${c} 28%, white)`,
      color: c, flex: "none", display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <MatIcon name={mat.icon || "couple"} size={size * 0.56} color={c} strokeWidth={1.6} />
    </div>
  );
}
