export function logspace(start, end, num) {
    var logStart = Math.log10(start);
    var logEnd = Math.log10(end);
    var logStep = (logEnd - logStart) / (num - 1);
    return Array.from({ length: num }, function (_, i) { return Math.pow(10, logStart + i * logStep); });
}

export function linspace(start, end, num) {
    if (num === 1) return [start];
    var step = (end - start) / (num - 1);
    return Array.from({ length: num }, (_, i) => start + i * step);
}

export function closest(num, arr) {
    var curr = arr[0];
    var diff = Math.abs(num - curr);
    var index = 0;
    for (var val = 0; val < arr.length; val++) {
        var newDiff = Math.abs(num - arr[val]);
        if (newDiff < diff) {
            diff = newDiff;
            curr = arr[val];
            index = val;
        }
    }
    return index;
}


export function clamp(v, lower, upper) {
    return Math.max(lower, Math.min(upper, v));
}
    

export const average = array => array.reduce((a, b) => a + b) / array.length;

export const abs = (re, im = 0) => Math.sqrt(re * re + im * im);