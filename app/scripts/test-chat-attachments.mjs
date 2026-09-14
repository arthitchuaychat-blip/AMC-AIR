import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from '@babel/parser';
import { CHAT_FILE_LIMIT, transferFiles, transferHasFiles, prepareChatFile, createChatUploadQueue, isChatSendKey } from '../src/lib/chatAttachments.js';

const png = new File(['image'], 'screen.png', { type: 'image/png' });
const pdf = new File(['pdf'], 'quote.pdf', { type: 'application/pdf' });
const video = new File(['movie'], 'clip.mp4');
const item = (f) => ({ kind: 'file', getAsFile: () => f });
assert.deepEqual(transferFiles({ items: [item(png)], files: [png] }), [png], 'one clipboard image, not duplicated through files');
assert.deepEqual(transferFiles({ files: [png, pdf, video] }), [png, pdf, video]);
assert.deepEqual(transferFiles({ items: [{ ...item(png), webkitGetAsEntry: () => ({ isDirectory: true }) }] }), []);
assert.equal(transferHasFiles({ types: ['Files'] }), true, 'dragover can identify protected file data');
assert.equal(transferHasFiles({ types: ['text/plain'] }), false);
assert.equal(prepareChatFile(video).file.type, 'video/mp4');
assert.equal(prepareChatFile(video).type, 'file');
assert.equal(prepareChatFile(video).media, 'video');
assert.equal(prepareChatFile(png).type, 'image');
assert.equal(prepareChatFile(png, true).type, 'file', 'existing file-picker image semantics remain available');
assert.equal(prepareChatFile(new File(['x'], '')).file.type, 'application/octet-stream');
assert.throws(() => prepareChatFile(new File([], 'empty')), /ว่างเปล่า/);
assert.throws(() => prepareChatFile({ name: 'large.mp4', size: CHAT_FILE_LIMIT + 1 }), /25 MB/);
for (const e of [{ key: 'Enter', shiftKey: true }, { key: 'Enter', isComposing: true }, { key: 'Enter', nativeEvent: { isComposing: true } }, { key: 'Enter', keyCode: 229 }, { key: 'v', ctrlKey: true }]) assert.equal(isChatSendKey(e), false);
assert.equal(isChatSendKey({ key: 'Enter' }), true);

let appended = [], busy = [], errors = [], uploaded = [], release;
const queue = createChatUploadQueue({
  upload: async (f) => { uploaded.push(f.name); if (f === png) await new Promise((r) => { release = r; }); if (f === pdf) throw Error('offline'); return 'https://fixture.invalid/' + f.name; },
  append: (a) => appended.push(a), busy: (b) => busy.push(b), error: (e) => errors.push(e),
});
const old = queue.add([png, video]);
assert.equal(queue.uploading, true);
await queue.add([video]);
assert.equal(uploaded.length, 1, 'a second paste while uploading does not race or upload twice');
queue.reset(); queue.reset(); // A → B → A still invalidates the first A upload.
const current = queue.add([video, pdf]);
release(); await Promise.all([old, current]);
assert.deepEqual(appended.map((a) => a.name), ['clip.mp4'], 'late old-room upload never becomes an attachment');
assert.ok(errors.some((e) => e.includes('offline')));
assert.equal(queue.uploading, false);
assert.equal(busy.at(-1), false);

// Execute actual Chat component handlers with state/API doubles; no customer messages.
const src = fs.readFileSync('src/components/Chat.jsx', 'utf8');
const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
const component = ast.program.body.find((n) => n.type === 'ExportDefaultDeclaration' && n.declaration.id?.name === 'Chat').declaration;
const fn = (name, env) => {
  const n = component.body.body.find((n) => n.type === 'FunctionDeclaration' && n.id.name === name);
  return new Function(...Object.keys(env), `return (${src.slice(n.start, n.end)});`)(...Object.values(env));
};
let staged = [], prevented = 0;
const paste = fn('onPasteFiles', { transferFiles, stageFiles: (files) => staged.push(files) });
paste({ clipboardData: { items: [{ kind: 'string' }] }, preventDefault() { prevented++; } });
assert.equal(prevented, 0, 'ordinary text paste remains native');
paste({ clipboardData: { items: [item(png)], files: [png] }, preventDefault() { prevented++; } });
assert.equal(prevented, 1); assert.deepEqual(staged, [[png]]);
let focused = false;
fn('onDropFiles', { transferHasFiles, transferFiles, dragDepth: { current: 2 }, setDraggingFiles() {}, setAttachmentError() {}, stageFiles: (files) => staged.push(files), inputRef: { current: { focus() { focused = true; } } } })({ dataTransfer: { types: ['Files'], files: [png, video, pdf] }, preventDefault() {}, stopPropagation() {} });
assert.deepEqual(staged[1], [png, video, pdf]); assert.ok(focused);
let addCalls = 0;
for (const blocked of [{ canSend: false }, { sel: null }, { isCm: true }, { sending: true }, { uploading: true }]) {
  fn('stageFiles', { canSend: true, sel: 'A', isCm: false, sending: false, sendingRef: { current: false }, uploading: false, setAttachmentError() {}, uploadQueue: { current: { add() { addCalls++; } } }, ...blocked })([png]);
}
assert.equal(addCalls, 0, 'read-only, no contact, comments and busy states never upload');

const imageA = { type: 'image', url: 'image-A' }, fileB = { type: 'file', url: 'video-B', name: 'clip.mp4' };
let state, sent, generation, uploading, sendRelease, sendFails;
function setup({ fb = false, gate = false } = {}) {
  state = { text: 'hello', qrPendImgs: [], pending: [imageA, fileB], qrButtons: [], replyTo: null, msgs: [] }; sent = []; generation = 1; uploading = gate; sendFails = true;
  const setter = (k) => (v) => { state[k] = typeof v === 'function' ? v(state[k]) : v; };
  const env = { ...state, sel: 'A', canSend: true, isFb: fb, isSup: false, sending: false, sendingRef: { current: false }, uploading: false,
    uploadQueue: { current: { get generation() { return generation; }, get uploading() { return uploading; } } },
    setSending() {}, setText: setter('text'), setPending: setter('pending'), setQrPendImgs: setter('qrPendImgs'), setQrButtons: setter('qrButtons'), setReplyTo: setter('replyTo'), setMsgs: setter('msgs'),
    sendLineMessage: async (id, t) => sent.push(['line', id, t]), sendFbMessage: async (id, t) => sent.push(['fb', id, t]),
    chSendImage: async (id, url) => { if (sendRelease === 'delay') await new Promise((r) => { sendRelease = r; }); sent.push(['image', id, url]); },
    sendLineFile: async (id, url) => { if (sendFails) throw Error('offline'); sent.push(['file-line', id, url]); },
    sendFbFile: async (id, url) => { if (sendFails) throw Error('offline'); sent.push(['file-fb', id, url]); },
    chListMessages: async () => [], myId: null, selContact: null, flash() {},
  };
  return () => fn('send', { ...env, ...state });
}
let makeSend = setup({ gate: true }); await makeSend()(); assert.deepEqual(sent, [], 'Enter cannot send a partially uploaded batch');
for (const fb of [false, true]) {
  makeSend = setup({ fb }); await makeSend()();
  assert.equal(state.text, ''); assert.deepEqual(state.pending, [fileB], 'only unsent attachment remains after partial failure');
  sendFails = false; await makeSend()();
  assert.equal(sent.filter((s) => s[0] === 'image').length, 1, 'retry does not resend confirmed image');
  assert.equal(sent.filter((s) => s[0] === (fb ? 'file-fb' : 'file-line')).length, 1);
  assert.deepEqual(state.pending, []);
}
makeSend = setup(); sendRelease = 'delay'; const inFlight = makeSend()();
await Promise.resolve(); await Promise.resolve();
generation++; const otherRoom = { type: 'file', url: 'other-room' }; state.pending = [otherRoom]; state.text = 'new room';
sendFails = false; sendRelease(); await inFlight;
assert.deepEqual(state.pending, [otherRoom]); assert.equal(state.text, 'new room', 'old send completion cannot clear new-room draft');
assert.ok(sent.every((s) => s[1] === 'A'), 'an approved batch keeps its original recipient');

// Execute the Messenger endpoint with fake HTTP only; verify multipart media type.
const endpointSource = fs.readFileSync('api/fb-send.js', 'utf8').replace(/^import .* from "\.\/_fb\.js";$/m, '').replace('export default async function handler', 'async function handler');
for (const [mime, expected] of [['video/mp4', 'video'], ['application/pdf', 'file'], ['image/png', 'image']]) {
  let posted, saved, status;
  const fakeFetch = async (url, options = {}) => {
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'fixture-user' });
    if (url.includes('/profiles?')) return Response.json([{ role: 'sales', active: true }]);
    if (url === 'https://fixture.invalid/asset') return new Response('fixture bytes', { headers: { 'content-type': mime } });
    if (url.startsWith('https://graph.fixture.invalid/')) { posted = JSON.parse(options.body.get('message')); return Response.json({ message_id: 'fixture-message' }); }
    if (url.endsWith('/fb_messages')) { saved = JSON.parse(options.body); return Response.json({}); }
    if (url.includes('/fb_contacts?')) return Response.json({});
    throw Error('Unexpected fixture request');
  };
  const endpoint = new Function('fetch', 'process', 'pageToken', 'pageId', 'GRAPH', endpointSource + '\nreturn handler;')(fakeFetch, { env: { SUPABASE_URL: 'https://db.fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only' } }, async () => 'fixture-page-token', () => 'fixture-page', 'https://graph.fixture.invalid');
  await endpoint({ method: 'POST', headers: { authorization: 'Bearer fixture-only' }, body: { to: 'fixture-recipient', fileUrl: 'https://fixture.invalid/asset', fileName: 'fixture-file' } }, { status(n) { status = n; return this; }, json() {} });
  assert.equal(status, 200); assert.equal(posted.attachment.type, expected); assert.equal(saved.file_url, 'https://fixture.invalid/asset');
}
console.log('PASS customer-chat file paste/drop, MIME/size validation, upload failures, room isolation, IME, upload send gate, LINE/FB routing and partial-send retry');
