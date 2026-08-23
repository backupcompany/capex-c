import assert from 'node:assert/strict';
import { caretAfterDigitCount, digitCountBefore } from './currencyInputCaret.ts';

// ponytail: caret math must survive live Rp formatting while typing
assert.equal(digitCountBefore('Rp 1.234', 8), 4);
assert.equal(digitCountBefore('4444444', 7), 7);
assert.equal(caretAfterDigitCount('Rp 4.444.444', 7), 'Rp 4.444.444'.length);
assert.equal(caretAfterDigitCount('Rp 4.444.444', 1), 'Rp 4'.length);
assert.equal(caretAfterDigitCount('Rp ', 0), 3);

console.log('currencyInputCaret: ok');
