import React from "react";

// AMC AIR custom 3D artwork. One local atlas; no runtime third-party requests.
const ICONS = {"dashboard": [0, 0], "users": [1, 0], "document": [2, 0], "clipboard": [3, 0], "receipt": [4, 0], "wallet": [0, 1], "wrench": [1, 1], "box": [2, 1], "settings": [3, 1], "calendar": [4, 1], "chat": [0, 2], "mail": [1, 2], "book": [2, 2], "target": [3, 2], "phone": [4, 2], "star": [0, 3], "ticket": [1, 3], "purchase": [2, 3], "globe": [3, 3], "megaphone": [4, 3], "trend": [0, 4], "building": [1, 4], "repeat": [2, 4], "withdraw": [3, 4], "catalog": [4, 4]};

export default function FloatingIcon({ name, size = 34, className = "" }) {
  const [x, y] = ICONS[name] || ICONS.document;
  return <span aria-hidden="true" className={"floating-icon " + className} style={{ "--float-size": `${size}px`, "--float-x": x, "--float-y": y }} />;
}
