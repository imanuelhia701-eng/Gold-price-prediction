let model = null;
const kursRupiah = 18000;
let modelReady = false;
let historicalData = { prices: [] };
const gramPerOz = 31.1034768;

let normParams = {
    min: [Infinity, Infinity, Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity, -Infinity, -Infinity]
};
const SEQUENCE_LEN = 10;

let growthStats = {
    daily: 0,
    monthly: 0,
    yearly: 0
};

let modelEvaluation = {
    accuracy: 0,
    mape: 0
};

const tanggalInput = document.getElementById('tanggal');
const bulanInput = document.getElementById('bulan');
const tahunInput = document.getElementById('tahun');
const karatSelect = document.getElementById('karatSelect');
const predictBtn = document.getElementById('predictBtn');
const validationMsgDiv = document.getElementById('inputValidationMsg');

function validateInputsAndEnableButton() {
    if (!modelReady) {
        predictBtn.disabled = true;
        validationMsgDiv.innerText = '';
        return false;
    }
    const tanggal = tanggalInput.value.trim();
    const bulan = bulanInput.value.trim();
    const tahun = tahunInput.value.trim();
    const karat = karatSelect.value;
    let isValid = true;
    let msg = '';
    if (!tanggal) {
        isValid = false;
        msg = '❌ Tanggal harus diisi';
    } else if (!bulan) {
        isValid = false;
        msg = '❌ Bulan harus diisi';
    } else if (!tahun) {
        isValid = false;
        msg = '❌ Tahun harus diisi';
    } else if (!karat) {
        isValid = false;
        msg = '❌ Silakan pilih karat';
    } else {
        const tgl = parseInt(tanggal);
        const bln = parseInt(bulan);
        const thn = parseInt(tahun);
        if (isNaN(tgl) || isNaN(bln) || isNaN(thn)) {
            isValid = false;
            msg = '❌ Input tanggal/bulan/tahun tidak valid';
        } else if (bln < 1 || bln > 12) {
            isValid = false;
            msg = '❌ Bulan harus antara 1 - 12';
        } else {
            const maxDay = new Date(thn, bln, 0).getDate();
            if (tgl < 1 || tgl > maxDay) {
                isValid = false;
                msg = `❌ Tanggal ${tgl} tidak valid untuk bulan ${bln}/${thn}`;
            }
        }
    }
    if (isValid && modelReady) {
        predictBtn.disabled = false;
        validationMsgDiv.innerText = '✅ Semua input valid, siap prediksi!';
        validationMsgDiv.style.color = '#aaffaa';
    } else {
        predictBtn.disabled = true;
        if (msg) {
            validationMsgDiv.innerText = msg;
            validationMsgDiv.style.color = '#ffaa66';
        } else if (!modelReady) {
            validationMsgDiv.innerText = '⏳ Model sedang memuat, tunggu sebentar...';
            validationMsgDiv.style.color = '#ffd966';
        } else {
            validationMsgDiv.innerText = '⚠️ Lengkapi semua data untuk memprediksi';
            validationMsgDiv.style.color = '#ffaa66';
        }
    }
    return isValid && modelReady;
}

function bindInputEvents() {
    tanggalInput.addEventListener('input', validateInputsAndEnableButton);
    bulanInput.addEventListener('input', validateInputsAndEnableButton);
    tahunInput.addEventListener('input', validateInputsAndEnableButton);
    karatSelect.addEventListener('change', validateInputsAndEnableButton);
}

async function loadCSVData() {
    const statusDiv = document.getElementById('status');
    statusDiv.innerHTML = '<span class="loading-spinner"></span> Membaca file CSV...';
    try {
        const response = await fetch('Data-harga.csv');
        if (!response.ok) throw new Error(`File CSV tidak ditemukan`);
        const csvText = await response.text();
        const lines = csvText.trim().split('\n');
        const prices = [];
        for (let i = 1; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line) continue;
            let delimiter = line.includes(';') ? ';' : ',';
            let cols = line.split(delimiter);
            let rawDate = cols[0].trim().replace(/["']/g, '');
            let day, month, year;
            let validDate = false;
            if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
                let parts = rawDate.split('-');
                year = parseInt(parts[0]);
                month = parseInt(parts[1]);
                day = parseInt(parts[2]);
                validDate = true;
            } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(rawDate)) {
                let parts = rawDate.split('/');
                day = parseInt(parts[0]);
                month = parseInt(parts[1]);
                year = parseInt(parts[2]);
                validDate = true;
            } else if (/^\d{8}$/.test(rawDate)) {
                year = parseInt(rawDate.substring(0,4));
                month = parseInt(rawDate.substring(4,6));
                day = parseInt(rawDate.substring(6,8));
                validDate = true;
            }
            if (!validDate) continue;
            if (month < 1 || month > 12) continue;
            let parsedDate = `${day.toString().padStart(2,'0')}/${month.toString().padStart(2,'0')}/${year}`;
            let priceValues = [];
            for (let j = 1; j <= 5; j++) {
                let val = cols[j] ? cols[j].trim() : "0";
                val = val.replace(/\./g, '').replace(',', '.');
                let num = parseFloat(val);
                priceValues.push(isNaN(num) ? 0 : num);
            }
            if (priceValues.every(p => p === 0)) continue;
            prices.push({
                date: parsedDate,
                prices: priceValues,
                timestamp: new Date(year, month-1, day).getTime()
            });
        }
        prices.sort((a, b) => a.timestamp - b.timestamp);
        historicalData.prices = prices;
        if (prices.length === 0) {
            throw new Error("Tidak ada data valid dalam CSV");
        }
        statusDiv.innerHTML = `✅ Data loaded: ${prices.length} entries (${prices[0].date} - ${prices[prices.length-1].date})`;
        statusDiv.className = 'status-card success';
        adjustNormParams();
        calculateGrowthStatistics();
        return true;
    } catch (err) {
        statusDiv.innerHTML = `❌ Gagal: ${err.message}`;
        statusDiv.className = 'status-card error';
        return false;
    }
}

function adjustNormParams() {
    if (historicalData.prices.length === 0) return;
    for (let i = 0; i < 5; i++) {
        normParams.min[i] = Infinity;
        normParams.max[i] = -Infinity;
    }
    for (const entry of historicalData.prices) {
        for (let i = 0; i < 5; i++) {
            if (entry.prices[i] < normParams.min[i]) normParams.min[i] = entry.prices[i];
            if (entry.prices[i] > normParams.max[i]) normParams.max[i] = entry.prices[i];
        }
    }
    for (let i = 0; i < 5; i++) {
        const margin = (normParams.max[i] - normParams.min[i]) * 0.05;
        normParams.min[i] = Math.max(0, normParams.min[i] - margin);
        normParams.max[i] = normParams.max[i] + margin;
    }
}

function calculateGrowthStatistics() {
    if (historicalData.prices.length < 2) {
        growthStats = {
            daily: 0.04,
            monthly: 1.00,
            yearly: 15.00
        };
        return;
    }
    const prices = historicalData.prices.map(item => item.prices[0]);
    let totalDaily = 0;
    let count = 0;
    for (let i = 1; i < prices.length; i++) {
        if (prices[i - 1] <= 0) continue;
        totalDaily += (prices[i] - prices[i - 1]) / prices[i - 1];
        count++;
    }
    let avgDaily = totalDaily / count;
    let avgMonthly = Math.pow(1 + avgDaily, 30) - 1;
    let avgYearly = Math.pow(1 + avgDaily, 365) - 1;
    let dailyPercent = avgDaily * 100;
    let monthlyPercent = avgMonthly * 100;
    let yearlyPercent = avgYearly * 100;
    dailyPercent = Math.max(0.03, Math.min(0.05, dailyPercent));
    monthlyPercent = Math.max(0.5, Math.min(1.5, monthlyPercent));
    yearlyPercent = Math.max(10, Math.min(20, yearlyPercent));
    growthStats = {
        daily: dailyPercent,
        monthly: monthlyPercent,
        yearly: yearlyPercent
    };
}

function normalizeData(data) {
    return data.map((val, i) => {
        const range = normParams.max[i] - normParams.min[i];
        if (range === 0 || isNaN(range)) return 0.5;
        return (val - normParams.min[i]) / range;
    });
}

function denormalizePrice(normVal) {
    const range = normParams.max[0] - normParams.min[0];
    return normVal * range + normParams.min[0];
}

function createSequences() {
    const sequences = [];
    const targets = [];
    const normalizedData = historicalData.prices.map(p => normalizeData(p.prices));
    for (let i = SEQUENCE_LEN; i < normalizedData.length; i++) {
        sequences.push(normalizedData.slice(i - SEQUENCE_LEN, i));
        targets.push([normalizedData[i][0]]);
    }
    return { sequences, targets };
}

function getLatestSequence() {
    if (historicalData.prices.length < SEQUENCE_LEN) return null;
    const sequence = [];
    const startIdx = historicalData.prices.length - SEQUENCE_LEN;
    for (let i = startIdx; i < historicalData.prices.length; i++) {
        sequence.push(normalizeData(historicalData.prices[i].prices));
    }
    return sequence;
}

function getSequenceByIndex(targetIndex) {
    if (targetIndex < SEQUENCE_LEN || targetIndex > historicalData.prices.length) return null;
    const sequence = [];
    for (let i = targetIndex - SEQUENCE_LEN; i < targetIndex; i++) {
        sequence.push(normalizeData(historicalData.prices[i].prices));
    }
    return sequence;
}

async function buildLSTMModel() {
    const statusDiv = document.getElementById('status');
    if (historicalData.prices.length < SEQUENCE_LEN + 5) {
        throw new Error(`Data tidak cukup (minimal ${SEQUENCE_LEN + 5} baris)`);
    }
    const { sequences, targets } = createSequences();
    if (sequences.length === 0) {
        throw new Error("Tidak dapat membuat sequence data");
    }
    statusDiv.innerHTML = '<span class="loading-spinner"></span> Membangun model LSTM ringan...';
    model = tf.sequential();
    model.add(tf.layers.lstm({
        units: 32,
        returnSequences: false,
        inputShape: [SEQUENCE_LEN, 5]
    }));
    model.add(tf.layers.dropout({ rate: 0.2 }));
    model.add(tf.layers.dense({ units: 8, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 1 }));
    model.compile({
        optimizer: tf.train.adam(0.002),
        loss: 'meanSquaredError'
    });
    const xs = tf.tensor3d(sequences);
    const ys = tf.tensor2d(targets);
    const progressWrapper = document.getElementById('progressWrapper');
    const progressFill = document.getElementById('progressFill');
    const progressPercentSpan = document.getElementById('progressPercent');
    progressWrapper.style.display = 'block';
    const epochs = 30;
    const batchSize = Math.min(32, Math.floor(sequences.length / 4) || 8);
    statusDiv.innerHTML = `<span class="loading-spinner"></span> Training LSTM (${epochs} epochs)...`;
    await model.fit(xs, ys, {
        epochs: epochs,
        batchSize: batchSize,
        verbose: false,
        callbacks: {
            onEpochEnd: (epoch, logs) => {
                const progress = ((epoch + 1) / epochs) * 100;
                progressFill.style.width = `${progress}%`;
                progressPercentSpan.innerText = `${Math.round(progress)}%`;
                if (epoch % 5 === 0 || epoch === epochs - 1) {
                    statusDiv.innerHTML = `<span class="loading-spinner"></span> Training: ${epoch + 1}/${epochs} (Loss: ${logs.loss.toFixed(5)})`;
                }
            }
        }
    });
    xs.dispose();
    ys.dispose();
    modelReady = true;
    await evaluateModel();
    progressWrapper.style.display = 'none';
    statusDiv.innerHTML = `✅ Model siap!`;
    statusDiv.className = 'status-card success';
    validateInputsAndEnableButton();
}

async function evaluateModel() {
    if (!model || historicalData.prices.length <= SEQUENCE_LEN) return;
    let totalError = 0;
    let totalData = 0;
    for (let i = SEQUENCE_LEN; i < historicalData.prices.length; i++) {
        const sequence = getSequenceByIndex(i);
        if (!sequence) continue;
        const inputTensor = tf.tensor3d([sequence]);
        const prediction = model.predict(inputTensor);
        const predictedPrice = denormalizePrice(prediction.dataSync()[0]);
        const actualPrice = historicalData.prices[i].prices[0];
        if (actualPrice > 0) {
            const error = Math.abs((actualPrice - predictedPrice) / actualPrice);
            totalError += error;
            totalData++;
        }
        inputTensor.dispose();
        prediction.dispose();
    }
    const mape = (totalError / totalData) * 100;
    modelEvaluation.mape = mape;
    modelEvaluation.accuracy = Math.max(0, 100 - mape);
}

async function recursivePredict(daysAhead) {
    if (!model || !modelReady) return null;
    if (daysAhead === 0) {
        const sequence = getLatestSequence();
        if (!sequence || sequence.length !== SEQUENCE_LEN) return null;
        const inputTensor = tf.tensor3d([sequence]);
        const prediction = model.predict(inputTensor);
        const price = denormalizePrice(prediction.dataSync()[0]);
        inputTensor.dispose();
        prediction.dispose();
        return price;
    }
    const historicalCopy = {
        prices: historicalData.prices.map(p => ({ 
            ...p, 
            prices: [...p.prices] 
        }))
    };
    const originalPrices = historicalData.prices;
    try {
        let currentSequence = getLatestSequence();
        if (!currentSequence || currentSequence.length !== SEQUENCE_LEN) return null;
        let predictedPrice = null;
        for (let day = 0; day < daysAhead; day++) {
            const inputTensor = tf.tensor3d([currentSequence]);
            const prediction = model.predict(inputTensor);
            const normPrice = prediction.dataSync()[0];
            inputTensor.dispose();
            prediction.dispose();
            predictedPrice = denormalizePrice(normPrice);
            predictedPrice = applyGrowthConstraint(predictedPrice, day + 1);
            const lastPrice = historicalData.prices[historicalData.prices.length - 1].prices[0];
            predictedPrice = (lastPrice * 0.25) + (predictedPrice * 0.75);
            const newData = normalizeData([
                predictedPrice,
                predictedPrice * 0.95,
                predictedPrice * 0.92,
                predictedPrice * 0.70,
                predictedPrice * 0.50
            ]);
            currentSequence = [...currentSequence.slice(1), newData];
        }
        return predictedPrice;
    } catch (error) {
        console.error('Error dalam recursivePredict:', error);
        return null;
    }
}

function applyGrowthConstraint(price, daysAhead) {
    const lastPrice = historicalData.prices[historicalData.prices.length - 1].prices[0];
    const growth = Math.pow(1 + (growthStats.daily / 100), daysAhead) - 1;
    const maxPrice = lastPrice * (1 + growth);
    const minPrice = lastPrice * (1 - growth);
    if (price > maxPrice) price = maxPrice;
    if (price < minPrice) price = minPrice;
    return price;
}

async function predictWithLSTM() {
    if (!modelReady || !model) {
        alert("Model sedang dipersiapkan, tunggu sebentar...");
        return;
    }
    if (!validateInputsAndEnableButton()) {
        alert("Harap lengkapi semua input dengan benar terlebih dahulu.");
        return;
    }
    const tanggal = parseInt(tanggalInput.value);
    const bulan = parseInt(bulanInput.value);
    const tahun = parseInt(tahunInput.value);
    const selectedKarat = parseInt(karatSelect.value);
    if (bulan < 1 || bulan > 12) {
        alert(`Bulan ${bulan} tidak valid. Bulan harus antara 1 - 12`);
        return;
    }
    const maxDay = new Date(tahun, bulan, 0).getDate();
    if (tanggal < 1 || tanggal > maxDay) {
        alert(`Tanggal ${tanggal} tidak valid untuk bulan ${bulan}/${tahun}`);
        return;
    }
    const targetDate = new Date(tahun, bulan-1, tanggal);
    const targetDateStr = `${tanggal.toString().padStart(2, '0')}/${bulan.toString().padStart(2, '0')}/${tahun}`;
    const targetTimestamp = targetDate.getTime();
    let targetEntry = null;
    for (let i = 0; i < historicalData.prices.length; i++) {
        if (historicalData.prices[i].date === targetDateStr) {
            targetEntry = { data: historicalData.prices[i], index: i };
            break;
        }
    }
    let predictedPrice24K = null;
    let predictionMethod = "";
    if (targetEntry) {
        const sequence = getSequenceByIndex(targetEntry.index);
        if (sequence && sequence.length === SEQUENCE_LEN) {
            const inputTensor = tf.tensor3d([sequence]);
            const prediction = model.predict(inputTensor);
            predictedPrice24K = denormalizePrice(prediction.dataSync()[0]);
            inputTensor.dispose();
            prediction.dispose();
            predictionMethod = "LSTM Prediction";
        } else {
            predictedPrice24K = targetEntry.data.prices[0];
            predictionMethod = "Actual Data (no history)";
        }
    } else {
        const lastDate = historicalData.prices[historicalData.prices.length - 1];
        const daysDiff = Math.round((targetTimestamp - lastDate.timestamp) / (1000 * 3600 * 24));
        if (Math.abs(daysDiff) <= 30) {
            const prediction = await recursivePredict(daysDiff);
            if (prediction !== null) {
                predictedPrice24K = prediction;
                predictionMethod = `LSTM Recursive Prediction (${Math.abs(daysDiff)} days ${daysDiff > 0 ? 'ahead' : 'before'})`;
            } else {
                const sequence = getLatestSequence();
                if (sequence && sequence.length === SEQUENCE_LEN) {
                    const inputTensor = tf.tensor3d([sequence]);
                    const predictionResult = model.predict(inputTensor);
                    let lastPrediction = denormalizePrice(predictionResult.dataSync()[0]);
                    inputTensor.dispose();
                    predictionResult.dispose();
                    const growthFactor = Math.pow(1 + (growthStats.daily / 100), daysDiff);
                    predictedPrice24K = lastPrediction * growthFactor;
                    predictionMethod = `LSTM with Growth Stats (${Math.abs(daysDiff)} days)`;
                } else {
                    predictedPrice24K = historicalData.prices[historicalData.prices.length - 1].prices[0];
                    predictionMethod = "Latest Price (fallback)";
                }
            }
        } else {
            const growthFactor = Math.pow(1 + (growthStats.daily / 100), daysDiff);
            const lastPrice = historicalData.prices[historicalData.prices.length - 1].prices[0];
            predictedPrice24K = lastPrice * growthFactor;
            predictionMethod = `Long-term Trend (${Math.abs(daysDiff)} days)`;
        }
        if (!predictedPrice24K || predictedPrice24K <= 0) {
            predictedPrice24K = historicalData.prices[historicalData.prices.length - 1].prices[0];
            predictionMethod = "Latest Price (fallback)";
        }
    }
    const actualPrice24K = targetEntry ? targetEntry.data.prices[0] : null;
    const hargaPerKaratPredicted = predictedPrice24K * (selectedKarat / 24);
    const usdPerGramPredicted = hargaPerKaratPredicted / kursRupiah;
    const usdPerOuncePredicted = usdPerGramPredicted * gramPerOz;
    let outputHTML = `
        <h3>📊 HASIL PREDIKSI</h3>
        <table class="prediction-table">
            <tr><th colspan="2">📋 PARAMETER INPUT</th></tr>
            <tr><td style="width:40%">Tanggal</td><td><strong>${targetDateStr}</strong></td></tr>
            <tr><td>Karat</td><td><strong>${selectedKarat} Karat</strong></td></tr>
            <tr><td>Metode</td><td><span style="color:#FFD966;">${predictionMethod}</span></td></tr>
        </table>
        <h3>💰 HARGA ${selectedKarat} KARAT</h3>
        <table class="prediction-table">
            <tr><th colspan="2">HASIL PREDIKSI</th></tr>
            <tr><td>Rupiah per gram (Rp/gr)</td><td class="highlight-price">Rp ${Math.round(hargaPerKaratPredicted).toLocaleString('id-ID')}</td></tr>
            <tr><td>USD per Troy Ounce (USD/oz)</td><td>$${usdPerOuncePredicted.toFixed(2)}</td></tr>
        </table>
        <h3>📊 EVALUASI MODEL</h3>
        <table class="prediction-table">
            <tr><th colspan="2">HASIL EVALUASI ANN-LSTM</th></tr>
            <tr><td>Akurasi Model</td><td><strong style="color:#00ff88;">${modelEvaluation.accuracy.toFixed(2)}%</strong></td></tr>
            <tr><td>Rata-rata Error (MAPE)</td><td><strong style="color:#FFD966;">${modelEvaluation.mape.toFixed(2)}%</strong></td></tr>
        </table>
    `;
    if (actualPrice24K !== null) {
        const hargaPerKaratActual = actualPrice24K * (selectedKarat / 24);
        const errorPercent = Math.abs((predictedPrice24K - actualPrice24K) / actualPrice24K * 100);
        outputHTML += `
            <div class="note">
                📊 Data aktual: Rp ${Math.round(hargaPerKaratActual).toLocaleString('id-ID')}/gr (Error: ${errorPercent.toFixed(1)}%)
            </div>
        `;
    } else {
        // Baris kosong
    }
    document.getElementById('output').innerHTML = outputHTML;
}

async function init() {
    bindInputEvents();
    const success = await loadCSVData();
    if (!success) {
        document.getElementById('predictBtn').disabled = true;
        validationMsgDiv.innerText = '❌ Gagal memuat data, periksa file CSV';
        return;
    }
    await buildLSTMModel();
}
init();
