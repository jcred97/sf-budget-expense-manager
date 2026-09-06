/**
 * Multiplies two unsigned decimal values and rounds the result with decimal HALF_UP semantics.
 * The string result avoids JavaScript binary floating-point differences from Apex Decimal.
 */
export function multiplyDecimalHalfUp(leftValue, rightValue, fractionDigits = 2) {
    const left = parseUnsignedDecimal(leftValue);
    const right = parseUnsignedDecimal(rightValue);

    if (!left || !right || !Number.isInteger(fractionDigits) || fractionDigits < 0) {
        return null;
    }

    const productDigits = multiplyDigitStrings(left.digits, right.digits);
    return roundAndFormat(productDigits, left.scale + right.scale, fractionDigits);
}

function parseUnsignedDecimal(value) {
    const match = String(value ?? '')
        .trim()
        .match(/^(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/);

    if (!match) {
        return null;
    }

    const fraction = match[2] || '';
    const exponent = Number(match[3] || 0);
    let digits = stripLeadingZeros(`${match[1]}${fraction}`);
    let scale = fraction.length - exponent;

    if (scale < 0) {
        digits += '0'.repeat(-scale);
        scale = 0;
    }

    return { digits, scale };
}

function multiplyDigitStrings(left, right) {
    if (left === '0' || right === '0') {
        return '0';
    }

    const result = new Array(left.length + right.length).fill(0);
    for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
        for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
            const resultIndex = leftIndex + rightIndex + 1;
            const total = Number(left[leftIndex]) * Number(right[rightIndex]) + result[resultIndex];
            result[resultIndex] = total % 10;
            result[resultIndex - 1] += Math.floor(total / 10);
        }
    }

    return stripLeadingZeros(result.join(''));
}

function roundAndFormat(digits, sourceScale, targetScale) {
    let coefficient = digits.padStart(sourceScale + 1, '0');
    const discardedDigits = sourceScale - targetScale;

    if (discardedDigits > 0) {
        const retainedLength = coefficient.length - discardedDigits;
        const shouldRoundUp = Number(coefficient[retainedLength]) >= 5;
        coefficient = coefficient.slice(0, retainedLength);
        if (shouldRoundUp) {
            coefficient = incrementDigitString(coefficient);
        }
    } else if (discardedDigits < 0) {
        coefficient += '0'.repeat(-discardedDigits);
    }

    coefficient = coefficient.padStart(targetScale + 1, '0');
    if (targetScale === 0) {
        return stripLeadingZeros(coefficient);
    }

    const splitIndex = coefficient.length - targetScale;
    const whole = stripLeadingZeros(coefficient.slice(0, splitIndex));
    return `${whole}.${coefficient.slice(splitIndex)}`;
}

function incrementDigitString(value) {
    const digits = value.split('');
    for (let index = digits.length - 1; index >= 0; index -= 1) {
        if (digits[index] !== '9') {
            digits[index] = String(Number(digits[index]) + 1);
            return digits.join('');
        }
        digits[index] = '0';
    }
    return `1${digits.join('')}`;
}

function stripLeadingZeros(value) {
    return value.replace(/^0+(?=\d)/, '') || '0';
}
