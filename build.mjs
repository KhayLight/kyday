import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
async function read(name) {
  try { return await readFile(path.join(root, name), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
}
const names = ['src/base.css', 'src/app.css', 'src/shell.html', 'src/views-site.html', 'src/views-app.html', 'src/core.js', 'src/site.js', 'src/app.js'];
const [base, appCss, shell, siteViews, appViews, core, site, app] = await Promise.all(names.map(read));
const fonts = 'https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Unbounded:wght@500;600;700&display=swap';
const page = `<meta charset="utf-8">
<title>Бюро Кудайбердина</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="${fonts.replaceAll('&', '&amp;')}">
<style>
${base}
${appCss}
</style>
${shell.replace('<!--VIEWS-->', siteViews + '\n' + appViews)}
<script>
${core}
${site}
${app}
</script>
`;
await mkdir(path.join(root, 'dist'), { recursive: true });
await Promise.all([
  writeFile(path.join(root, 'dist/page.html'), page, 'utf8'),
  writeFile(path.join(root, 'dist/index.html'), '<!doctype html>\n' + page, 'utf8')
]);
console.log('Готово: dist/page.html и dist/index.html');
