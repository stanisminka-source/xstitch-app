// Пути к настоящим схемам на компьютере владелицы. Сами схемы и их имена в репозиторий не попадают:
// пути берутся из переменных XSTITCH_PATTERN_JSON / XSTITCH_PATTERN_PDF
// или из файла tests/paths.local (он в .gitignore), например:
//   { "json": "/Users/…/схема.pattern.json", "pdf": "/Users/…/схема.pdf" }
// Если путей нет или файлов нет, проверки на настоящих схемах пропускаются.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function fromFile(): { json?: string; pdf?: string } {
  const f = join(__dirname, 'paths.local');
  if (!existsSync(f)) return {};
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return {};
  }
}

const local = fromFile();

export const REAL_JSON = process.env.XSTITCH_PATTERN_JSON ?? local.json ?? '';
export const REAL_PDF = process.env.XSTITCH_PATTERN_PDF ?? local.pdf ?? '';

export const haveFile = (p: string) => p !== '' && existsSync(p);
