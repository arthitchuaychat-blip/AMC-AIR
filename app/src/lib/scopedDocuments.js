// Legacy document loaders treat [] or >200 IDs as unscoped. Keep requests bounded.
export async function scopedDocuments(loader, ids) {
  const unique = [...new Set(ids.filter(Boolean))].sort();
  const rows = [];
  for (let i = 0; i < unique.length; i += 200) {
    const batches = [unique.slice(i, i + 100), unique.slice(i + 100, i + 200)].filter(x => x.length);
    rows.push(...(await Promise.all(batches.map(nos => loader({ nos })))).flat());
  }
  return rows;
}
