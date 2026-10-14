import { mkdir, open, rename } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';

const columns = {
  tags: ['name', 'category', 'post_count', 'is_deprecated'],
  tag_aliases: ['antecedent_name', 'consequent_name', 'status']
};
export async function downloadTable(table, directory, fetcher = fetch, pause = delay) {
  const fields = columns[table];
  if (!fields) throw new Error('Unknown table');
  const partial = path.join(directory, `${table}.partial.csv`);
  const output = await open(partial, 'wx');
  let cursor = null, count = 0;
  try {
    await output.writeFile(fields.join(',') + '\n');
    while (true) {
      const url = new URL(`https://danbooru.donmai.us/${table}.json`);
      url.searchParams.set('limit', '1000');
      url.searchParams.set('search[order]', 'id_desc');
      url.searchParams.set('only', ['id', ...fields].join(','));
      if (cursor !== null) url.searchParams.set('page', `b${cursor}`);
      let response;
      for (let attempt = 0; attempt < 5; attempt++) {
        response = await fetcher(url, { headers: { 'User-Agent': 'PromptManager-TagIndex/1.0 (https://github.com/ArcherMei/prompt-manager)' }, signal: AbortSignal.timeout(60000) });
        if (response.status !== 429 && response.status < 500) break;
        await pause(2000 * 2 ** attempt);
      }
      if (!response.ok) throw new Error(`Danbooru HTTP ${response.status}; partial file is NOT complete`);
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error('Unexpected Danbooru response');
      if (!rows.length) break;
      let previous = cursor ?? Infinity;
      for (const row of rows) {
        if (!Number.isSafeInteger(row.id) || row.id >= previous || fields.some(field => row[field] === undefined)) throw new Error('Invalid API row / cursor order; download stopped');
        previous = row.id;
      }
      await output.writeFile(rows.map(row => fields.map(field => '"' + String(row[field]).replaceAll('"', '""') + '"').join(',')).join('\n') + '\n');
      count += rows.length; cursor = previous;
      console.log(`${table}: ${count}`);
      await pause(1100);
    }
  } finally { await output.close(); }
  await rename(partial, path.join(directory, `${table}.csv`));
  return count;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const directory = path.resolve(process.argv[2] || `danbooru-data-${Date.now()}`);
  // New directory avoids overwriting any previous download.
  await mkdir(directory);
  try {
    for (const table of Object.keys(columns)) await downloadTable(table, directory);
    console.log(`Complete: ${directory}. Import tags.csv, then tag_aliases.csv in the app.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
