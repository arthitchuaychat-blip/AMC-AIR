import assert from 'node:assert/strict';
import fs from 'node:fs';
const caps = fs.readFileSync(new URL('../src/lib/roleCapabilities.js', import.meta.url), 'utf8');
const code = fs.readFileSync(new URL('../src/lib/permissions.js', import.meta.url), 'utf8').replace(/^import .*;\n/, '');
const mod = await import('data:text/javascript;base64,' + Buffer.from(caps + '\n' + code).toString('base64'));
const {ROLES,MODULES,can,setPerms,DEFAULT_PERMS,canManagePermissions,canApprovePayroll,canPay,canViewAllTeams}=mod;
// Stale configuration must never re-enable HR's former sales/finance inheritance.
setPerms(Object.fromEntries(ROLES.map(r=>[r,Object.fromEntries(MODULES.map(m=>[m.id,'edit']))])));
for(const m of ['customers','chat','email','boq','quote','cashflow','profit','po','joborders','settings']) assert.equal(can('hr',m),false,`HR ${m}`);
for(const r of ROLES) assert.equal(can(r,'attendance','edit'),true,`${r} self-service`);
for(const r of ['sales','field_sales','finance','stock','lead_tech','tech','assistant','graphic','maid']) assert.equal(can(r,'hr'),false,`${r} HR`);
for(const r of ['exec','admin']) for(const m of MODULES) assert.equal(can(r,m.id,'edit'),true,`${r} ${m.id}`);
assert.equal(canManagePermissions('exec'),true); assert.equal(canManagePermissions('admin'),false);
for(const r of ['hr','sales','finance']) assert.equal(canApprovePayroll(r),false);
assert.equal(canPay('finance'),true); assert.equal(canPay('hr'),false);
assert.equal(canViewAllTeams('lead_tech'),true); assert.equal(canViewAllTeams('tech'),false);
setPerms(DEFAULT_PERMS);
assert.equal(can('assistant','movements','edit'),true); // preserved existing role
assert.equal(can('field_sales','po','edit'),true);
assert.equal(can('sales','movements','edit'),true);
assert.equal(can('hr','hr','edit'),true);
console.log('PASS: role ceilings, stale overrides, all-role self-service, owner/manager, HR and field-sales boundaries');
