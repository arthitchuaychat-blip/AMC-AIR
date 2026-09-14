// Shared by the customer-chat picker, drop target and paste handler.
export const CHAT_FILE_LIMIT = 25 * 1024 * 1024;
export const CHAT_FILE_ACCEPT = "image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip";

const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", heic: "image/heic", heif: "image/heif", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", m4v: "video/mp4", pdf: "application/pdf", txt: "text/plain", csv: "text/csv", zip: "application/zip" };

export function transferHasFiles(data) {
  return Array.from(data?.types || []).includes("Files") || Array.from(data?.items || []).some((i) => i.kind === "file");
}

export function transferFiles(data) {
  const items = Array.from(data?.items || []).filter((i) => i.kind === "file");
  // Prefer items: reading both items and files would attach clipboard images twice.
  if (items.length) return items.filter((i) => !i.webkitGetAsEntry?.()?.isDirectory).map((i) => i.getAsFile()).filter(Boolean);
  return Array.from(data?.files || []);
}

export function prepareChatFile(file, asFile = false) {
  if (!file.size) throw new Error(`${file.name || "ไฟล์"}: ไฟล์ว่างเปล่าหรือเป็นโฟลเดอร์`);
  if (file.size > CHAT_FILE_LIMIT) throw new Error(`${file.name || "ไฟล์"}: ขนาดเกิน 25 MB`);
  const ext = (file.name || "").split(".").pop().toLowerCase();
  const mime = file.type || MIME[ext] || "application/octet-stream";
  const name = file.name || `clipboard-${Date.now()}.${Object.keys(MIME).find((x) => MIME[x] === mime) || "bin"}`;
  const normalized = file.name === name && file.type === mime ? file : new File([file], name, { type: mime, lastModified: file.lastModified });
  return { file: normalized, type: !asFile && mime.startsWith("image/") ? "image" : "file", media: mime.startsWith("video/") ? "video" : null, name };
}

// A room switch invalidates work even if the user switches A → B → A before it finishes.
export function createChatUploadQueue({ upload, append, busy, error }) {
  let generation = 0, uploading = false;
  return {
    get generation() { return generation; },
    get uploading() { return uploading; },
    reset() { generation++; uploading = false; busy(false); },
    async add(files, asFile = false) {
      if (uploading) { error("กำลังอัปโหลด กรุณารอแล้วแนบไฟล์เพิ่มอีกครั้ง"); return; }
      const batch = Array.from(files || []);
      if (!batch.length) return;
      const current = generation, failed = [];
      uploading = true; busy(true); error("");
      try {
        for (const file of batch) {
          if (current !== generation) return;
          try {
            const a = prepareChatFile(file, asFile);
            const url = await upload(a.file);
            if (current !== generation) return;
            append({ type: a.type, media: a.media, url, name: a.name });
          } catch (e) {
            if (current !== generation) return;
            failed.push(e.message || String(e));
          }
        }
        if (failed.length) error(`แนบไม่สำเร็จ: ${failed.join(" · ")}`);
      } finally {
        if (current === generation) { uploading = false; busy(false); }
      }
    },
  };
}

export function isChatSendKey(e) {
  return e.key === "Enter" && !e.shiftKey && !e.isComposing && !e.nativeEvent?.isComposing && e.keyCode !== 229;
}
