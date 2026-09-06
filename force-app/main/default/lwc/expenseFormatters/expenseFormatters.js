const PHP_CURRENCY = new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP'
});
const PHP_COMPACT_CURRENCY = new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    notation: 'compact',
    maximumFractionDigits: 1
});
const DATE_FORMAT = new Intl.DateTimeFormat('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC'
});
const MONTH_LABEL_FORMAT = new Intl.DateTimeFormat('en-PH', {
    year: 'numeric',
    month: 'long'
});
const CURRENCY_FORMATTERS = new Map();

export function formatPHP(value) {
    return PHP_CURRENCY.format(value);
}

export function formatCompactPHP(value) {
    const amount = value || 0;
    return Math.abs(amount) < 1000 ? formatPHP(amount) : PHP_COMPACT_CURRENCY.format(amount);
}

export function formatCurrency(value, currencyCode) {
    const normalizedCode = String(currencyCode || '').toUpperCase();
    const amount = Number(value);

    if (!normalizedCode || !Number.isFinite(amount)) {
        return '-';
    }

    try {
        if (!CURRENCY_FORMATTERS.has(normalizedCode)) {
            CURRENCY_FORMATTERS.set(
                normalizedCode,
                new Intl.NumberFormat('en-PH', {
                    style: 'currency',
                    currency: normalizedCode,
                    currencyDisplay: 'code',
                    maximumFractionDigits: 4
                })
            );
        }
        return CURRENCY_FORMATTERS.get(normalizedCode).format(amount);
    } catch {
        return `${normalizedCode} ${amount.toLocaleString('en-PH', {
            maximumFractionDigits: 4
        })}`;
    }
}

export function formatDate(isoDate) {
    return isoDate ? DATE_FORMAT.format(new Date(isoDate)) : '-';
}

export function formatPeriodRange(startDate, endDate) {
    const startLabel = formatDate(startDate);
    const endLabel = formatDate(endDate);
    return startLabel === '-' && endLabel === '-' ? 'All dates' : `${startLabel} - ${endLabel}`;
}

export function formatActiveWindow(startDate, endDate) {
    return endDate
        ? `${formatDate(startDate)} – ${formatDate(endDate)}`
        : `From ${formatDate(startDate)}`;
}

export function formatIsoDateRange(startDate, endDate) {
    return `${startDate || ''} - ${endDate || ''}`;
}

export function formatTime(value) {
    if (!value) {
        return '-';
    }

    const timeValue = typeof value === 'number' ? millisecondsToTime(value) : value;
    const [hourText, minuteText] = String(timeValue).split(':');
    const hour = Number(hourText);
    const minute = Number(minuteText);

    if (Number.isNaN(hour) || Number.isNaN(minute)) {
        return '-';
    }

    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
}

export function formatDateISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function formatMonthLabel(date) {
    return MONTH_LABEL_FORMAT.format(date);
}

export function getMonthBounds(date) {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return {
        startDate: formatDateISO(firstDay),
        endDate: formatDateISO(lastDay)
    };
}

export function parseDateString(value) {
    if (!value) {
        return null;
    }

    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
}

function millisecondsToTime(value) {
    const totalMinutes = Math.floor(value / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00.000`;
}
