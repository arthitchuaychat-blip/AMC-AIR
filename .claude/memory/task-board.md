---
name: task-board
description: "internal Kanban task board — assign/attach/comment/status; module \"tasks\", mig 056"
metadata: 
  node_type: memory
  type: project
  originSessionId: 85b6d010-27bd-419a-ad75-1ac380626a9a
---

Task board / กระดานสั่งงาน (v136, 2026-06-21 — needs migration `056_tasks.sql`). Internal work-assignment Kanban, separate from job orders.

- **TaskBoard.jsx** (`me`=profile, `role`): 3 columns todo/doing/done (+cancelled hidden behind a filter chip); scope filter ทั้งหมด/งานที่ฉันสั่ง/งานที่มอบให้ฉัน. Card → detail modal with status buttons + comment thread. TaskEditor (create/edit) + TaskDetail + AttachRow (multi-file upload) are inner components.
- Tables: `tasks` (title, detail, assigner, assignee, priority low/normal/high, status todo/doing/done/cancelled, due_date, attachments text[]) + `task_comments` (task_id, author, body, attachments text[]). RLS = authenticated all (internal board). Both spread `select("*")`.
- api.js: listTasks/saveTask/setTaskStatus/deleteTask/listTaskComments/addTaskComment/deleteTaskComment/uploadTaskFile (→ `photos` bucket /tasks/).
- Permission module **`tasks`** in lib/permissions.js (E for all roles); NAV entry + route in App.jsx. Gating in UI: edit/delete = assigner or admin/exec; status change = assigner/assignee/admin/exec; comment = anyone.
- Attachments reuse AttachThumb + ATTACH_ACCEPT (lib/format). Relates to [[team-chat-push]] (also internal collab).
