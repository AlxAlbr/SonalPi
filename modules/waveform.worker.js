// Web Worker : calcul des enveloppes min/max à partir des données audio brutes
// Reçoit : { channelData: Float32Array (transféré), width: number }
// Envoie : { minValues: Float32Array, maxValues: Float32Array }
// Le décodage audio a lieu dans le renderer (AudioContext garanti disponible).

self.onmessage = function(e) {
    const { channelData, width } = e.data;
    const step = Math.max(1, Math.ceil(channelData.length / width));

    const minValues = new Float32Array(width);
    const maxValues = new Float32Array(width);

    for (let i = 0; i < width; i++) {
        let min = 1.0;
        let max = -1.0;
        for (let j = 0; j < step; j++) {
            const idx = (i * step) + j;
            if (idx >= channelData.length) break;
            const d = channelData[idx];
            if (d < min) min = d;
            if (d > max) max = d;
        }
        minValues[i] = min;
        maxValues[i] = max;
    }

    // Transfert sans copie vers le fil principal
    self.postMessage({ minValues, maxValues }, [minValues.buffer, maxValues.buffer]);
};
