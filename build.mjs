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
const fonts = 'https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;650;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap';
const page = `<meta charset="utf-8">
<title>Kyday — регистрация ИП и расчётный счёт</title>
<meta name="description" content="Онлайн-регистрация ИП и помощь с открытием расчётного счёта. Выберите услуги Kyday, узнайте стоимость и отслеживайте заявку.">
<meta property="og:title" content="Kyday — регистрация ИП и расчётный счёт">
<meta property="og:description" content="Начните своё дело с понятного плана. Документы, регистрация и расчётный счёт — с поддержкой Kyday.">
<meta property="og:type" content="website">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%233a2fb8'/%3E%3Cpath d='M20 15v34m24-34L20 33l25 16' fill='none' stroke='white' stroke-width='7' stroke-linejoin='round'/%3E%3C/svg%3E">
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
  writeFile(path.join(root, 'dist/index.html'), '<!doctype html>\n<html lang="ru"><head>\n' + page.replace('</style>', '</style>\n</head><body>') + '</body></html>\n', 'utf8')
]);
console.log('Готово: dist/page.html и dist/index.html');
