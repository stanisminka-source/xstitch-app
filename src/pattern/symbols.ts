// Собственный набор хорошо различимых символов.
// Символы из файла схемы — это знаки шрифта Pattern Maker, перекодированные
// в Latin-1; часть из них похожи друг на друга, один вообще невидим (мягкий перенос).
// Поэтому показываем свои, а исходные храним для справки.

const VS15 = '︎'; // просим текстовый, а не эмодзи-вид

const SHAPES = ['●', '○', '■', '□', '▲', '△', '▼', '▽', '◆', '◇', '★', '☆', `♥${VS15}`, `♦${VS15}`, `♣${VS15}`, `♠${VS15}`, '+', '×', '÷', '=', '#', '%', '&', '@', '?', '!', '§', '∞', '≈', '¤'];
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'.split(''); // без I и O
const LOWER = 'abdefghkmnpqrstuvwxyz'.split(''); // без похожих c, i, j, l, o
const GREEK = 'αβγδεθλμπσφψΓΔΘΛΞΠΣΦΨΩ'.split('');
// Дальше — до 130 цветов, как в конструкторе схем (тот же порядок):
// кириллица, не похожая на латиницу и греческие буквы, и ещё фигуры.
const CYRILLIC = 'БДЖЗИЙЦЧШЩЪЫЬЭЮЯ'.split('');
const MORE_SHAPES = ['◐', '◑', '◒', '◓', '▣', '◈', '◉', '◎', '⊕', '⊗', '⊞', '⊠', '☼', '♪', '♫', '⌂'];

export const SYMBOL_SET: readonly string[] = [...SHAPES, ...UPPER, ...DIGITS, ...LOWER, ...GREEK, ...CYRILLIC, ...MORE_SHAPES];

/** Назначает символы цветам: самым частым цветам — самые простые знаки.
 *  Возвращает символ для каждого индекса палитры. */
export function assignSymbols(counts: readonly number[]): string[] {
  const order = counts.map((c, i) => [c, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const out = new Array<string>(counts.length);
  order.forEach(([, i], rank) => {
    out[i] = rank < SYMBOL_SET.length ? SYMBOL_SET[rank] : String(rank + 1);
  });
  return out;
}
