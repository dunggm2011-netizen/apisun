import fastify from "fastify";
import cors from "@fastify/cors";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import fetch from "node-fetch";

// --- CẤU HÌNH ---
const PORT = process.env.PORT || 3000;
const API_URL = "https://wtxmd52.tele68.com/v1/txmd5/sessions";

// --- GLOBAL STATE ---
let txHistory = []; 
let currentSessionId = null; 
let fetchInterval = null; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// HỆ THỐNG THUẬT TOÁN ĐỐI XỨNG TUYỆT ĐỐI (DEEP BRAIN v24 - v26)
// ============================================================

function tx_flip(c) { return c === 'T' ? 'X' : 'T'; }

function tx_runs(seq) {
    let out = []; let n = seq.length;
    if (!n) return out;
    let v = seq[0]; let len = 1;
    for (let i = 1; i < n; i++) {
        if (seq[i] === v) { len++; }
        else { out.push({ v: v, n: len }); v = seq[i]; len = 1; }
    }
    out.push({ v: v, n: len });
    return out;
}

// 1. MÔ HÌNH v24
function tx_models_v24(seq, tot) {
    let M = [];
    let n = seq.length;
    if (n < 5) return M;
    let add = (name, pick, w) => {
        if (w > 0.02) M.push({ name: name, pick: pick, w: Number(w.toFixed(3)) });
    };
    let cur = seq[0];
    let anti = tx_flip(cur);
    let runs = tx_runs(seq);
    let streak = runs[0].n;

    // Survival
    let cont = 0, stop = 0;
    for (let i = 1; i < runs.length; i++) {
        let L = runs[i].n;
        if (L >= streak) cont++;      
        if (L === streak) stop++;     
    }
    let tries = cont;
    if (tries >= 3) {
        let pSurv = (cont - stop + 0.5) / (tries + 1.0);   
        if (pSurv >= 0.55) add('Bệt còn sống ' + streak, cur,  0.9 + (pSurv - 0.5) * 2.6);
        if (pSurv <= 0.45) add('Bệt sắp gãy ' + streak, anti, 0.9 + (0.5 - pSurv) * 2.6);
    }

    // Chống đuổi bệt dài
    let lens = runs.slice(1).map(r => r.n);
    if (lens.length >= 5) {
        let avgL = lens.reduce((a,b)=>a+b,0) / lens.length;
        let mx = Math.max(...lens);
        if (streak <= Math.max(2.0, avgL)) {
            add('Theo bệt trong ngưỡng', cur, 1.05 + Math.min(0.5, (avgL - streak) * 0.22));
        } else if (streak >= mx) {
            add('Bệt vượt kỷ lục -> bẻ', anti, 1.55 + Math.min(0.8, (streak - mx) * 0.30));
        } else {
            add('Bệt quá trung bình -> canh bẻ', anti, 0.95 + Math.min(0.7, (streak - avgL) * 0.30));
        }
    }

    if (runs.length >= 2 && streak <= 2 && runs[1].n >= 4) {
        add('Cầu vừa bẻ (theo hướng mới)', cur, 1.30 + Math.min(0.6, (runs[1].n - 4) * 0.12));
    }

    // Khuôn cầu chu kỳ
    let shapes = {
        'Cầu 1-1': [[1, 1], 1.55],
        'Cầu 2-2': [[2, 2], 1.45],
        'Cầu 3-3': [[3, 3], 1.60],
        'Cầu 4-4': [[4, 4], 1.50],
        'Cầu 1-2': [[1, 2], 1.25],
        'Cầu 2-1': [[2, 1], 1.25],
        'Cầu 2-1-2': [[2, 1, 2], 1.70],
        'Cầu 3-1-3': [[3, 1, 3], 1.75]
    };
    for (let name in shapes) {
        let pat = shapes[name][0]; let L = pat.length;
        if (runs.length < L + 2) continue;
        for (let phase = 0; phase < L; phase++) {
            let want = pat[phase];
            if (streak > want) continue;            
            let hit = 0;
            for (let j = 1; j < runs.length - 1 && j <= L * 3; j++) {
                let exp = pat[(phase - j % L + L * 3) % L];
                if (runs[j].n !== exp) break;
                hit++;
            }
            if (hit >= Math.max(2, L)) {
                let pick = streak < want ? cur : anti;
                add(name, pick, shapes[name][1] + Math.min(0.45, hit * 0.06));
                break;
            }
        }
    }

    // Markov bậc 2..5
    for (let ord of [2, 3, 5]) {
        if (n <= ord + 4) continue;
        let key = seq.slice(0, ord).join('');
        let c = { T: 0, X: 0 };
        for (let i = 0; i + ord < n; i++) {
            if (seq.slice(i + 1, i + 1 + ord).join('') === key) c[seq[i]]++;
        }
        let tt = c.T + c.X;
        if (tt >= 3) {
            let p = (Math.max(c.T, c.X) + 0.5) / (tt + 1.0);
            if (p > 0.55) add('Markov-' + ord, c.T >= c.X ? 'T' : 'X', (ord === 2 ? 1.05 : 1.25) * (p - 0.5) * 3.0 * Math.min(1.0, tt / 8));
        }
    }
    return M;
}

// 2. MÔ HÌNH v25
function tx_models_v25(seq, tot) {
    let M = []; let n = seq.length;
    if (n < 6) return M;
    let add = (name, pick, w) => {
        if (w > 0.02 && (pick === 'T' || pick === 'X')) M.push({ name: name, pick: pick, w: Number(w.toFixed(3)) });
    };
    let cur = seq[0]; let anti = tx_flip(cur);
    let runs = tx_runs(seq); let streak = runs[0].n;

    // N-gram Trie 4..7
    for (let L = 4; L <= 7; L++) {
        if (n < L + 8) break;
        let key = seq.slice(0, L).join('');
        let cT = 0, cX = 0;
        for (let i = 0; i + L < n; i++) {
            if (seq.slice(i + 1, i + 1 + L).join('') === key) { if (seq[i] === 'T') cT++; else cX++; }
        }
        let t = cT + cX;
        if (t >= 3) {
            let p = (Math.max(cT, cX) + 0.5) / (t + 1.0);
            if (p > 0.58) add('n-gram ' + L, cT >= cX ? 'T' : 'X', (0.55 + L * 0.10) * (p - 0.5) * 3.0 * Math.min(1.0, t / 6));
        }
    }

    // Động lượng EWMA
    if (n >= 10) {
        let s = 0.0, w = 0.0;
        for (let i = 0; i < Math.min(20, n); i++) { let k = Math.exp(-i / 6); s += (seq[i] === 'T' ? 1 : -1) * k; w += k; }
        let m = w > 0 ? s / w : 0.0;
        if (Math.abs(m) > 0.22) add('Động lượng EWMA', m > 0 ? 'T' : 'X', 0.60 + Math.min(0.75, Math.abs(m) * 1.3));
    }
    return M;
}

// 3. MÔ HÌNH v26
function tx_models_v26(seq, tot) {
    let M = []; let n = seq.length;
    if (n < 10) return M;
    let add = (name, pick, w) => {
        if (w > 0.02 && (pick === 'T' || pick === 'X')) M.push({ name: name, pick: pick, w: Number(w.toFixed(3)) });
    };
    let cur = seq[0]; let anti = tx_flip(cur);
    let bit = c => c === 'T' ? 1.0 : -1.0;

    // Hậu nghiệm Bayes đảo cửa
    let win = Math.min(60, n - 1);
    let flipC = 0;
    for (let i = 0; i < win; i++) if (seq[i] !== seq[i + 1]) flipC++;
    let a = flipC + 1.0; let b = (win - flipC) + 1.0;
    let pFlip = a / (a + b);
    if (Math.abs(pFlip - 0.5) > 0.06) {
        let pk = pFlip > 0.5 ? anti : cur;
        add('Bayes đảo cửa', pk, 1.05 + Math.min(1.05, Math.abs(pFlip - 0.5) * 3.6));
    }

    // Chi-square lệch cửa
    let w2 = Math.min(40, n);
    let cT = 0;
    for (let i = 0; i < w2; i++) if (seq[i] === 'T') cT++;
    let expVal = w2 / 2;
    if (expVal > 0) {
        let chi = Math.pow(cT - expVal, 2) / expVal + Math.pow((w2 - cT) - expVal, 2) / expVal;
        if (chi >= 3.84) {
            add('Hồi quy trung bình (chi²)', cT > expVal ? 'X' : 'T', 1.0 + Math.min(0.95, (chi - 3.84) * 0.12));
        }
    }
    return M;
}

function tx_collect(seq, tot) {
    let models = [];
    models = models.concat(tx_models_v24(seq, tot));
    models = models.concat(tx_models_v25(seq, tot));
    models = models.concat(tx_models_v26(seq, tot));
    return models;
}

function tx_norm_name(n) {
    return n.replace(/\s*\(.*$/u, '').replace(/\s+\d+$/, '').trim();
}

function tx_selfweights(seq, tot) {
    let n = seq.length;
    let depth = Math.min(36, n - 10);
    if (depth < 6) return {};
    let acc = {};
    for (let k = 1; k <= depth; k++) {
        let sub = seq.slice(k); let subT = tot.slice(k);
        if (sub.length < 8) break;
        let truth = seq[k - 1];
        let models = tx_collect(sub, subT);
        for (let m of models) {
            let name = tx_norm_name(m.name);
            if (!acc[name]) acc[name] = { h: 0.0, a: 0.0 };
            let rw = Math.exp(-(k - 1) / 16);
            acc[name].a += rw;
            if (m.pick === truth) acc[name].h += rw;
        }
    }
    let w = {};
    for (let name in acc) {
        if (acc[name].a < 3) continue;
        let r = acc[name].h / acc[name].a;
        let edge = r - 0.5;
        let mag = Math.max(0.20, Math.min(2.4, Math.pow(Math.max(0.04, Math.abs(edge) * 2), 1.30) * 2.1));
        w[name] = edge >= 0 ? mag : -mag;
    }
    return w;
}

function tx_score(seq, tot) {
    let flipSeq = seq.map(tx_flip);
    let flipTot = tot.map(t => t > 0 ? 21 - t : 0);

    let A = tx_collect(seq, tot);
    let B = tx_collect(flipSeq, flipTot);
    let selfW = tx_selfweights(seq, tot);

    let bag = {};
    let push = (m, mirror) => {
        let pick = mirror ? tx_flip(m.pick) : m.pick;
        let key = tx_norm_name(m.name);
        let k = selfW[key] !== undefined ? selfW[key] : 1.0;
        if (k < 0) { pick = tx_flip(pick); k = Math.abs(k); }
        let w = m.w * k * 0.5;
        if (w <= 0) return;
        if (!bag[m.name]) bag[m.name] = { T: 0.0, X: 0.0 };
        bag[m.name][pick] += w;
    };
    for (let m of A) push(m, false);
    for (let m of B) push(m, true);

    let sT = 0.0, sX = 0.0, out = [];
    for (let name in bag) {
        let net = bag[name].T - bag[name].X;
        if (Math.abs(net) < 0.01) continue;
        if (net > 0) sT += net; else sX += -net;
        out.push({ name: name, pick: net > 0 ? 'T' : 'X', w: Number(Math.abs(net).toFixed(2)) });
    }
    out.sort((a, b) => b.w - a.w);
    return { T: sT, X: sX, models: out };
}

function tx_shape_name(seq) {
    let runs = tx_runs(seq);
    if (runs.length < 2) return '';
    let s = runs[0].n;
    let side = runs[0].v === 'T' ? 'TÀI' : 'XỈU';
    if (s >= 4) return 'BỆT ' + side + ' ' + s;
    let sig = runs.slice(0, 6).map(r => r.n);
    let j = sig.slice(0, 4).join('');
    if (j === '1111') return 'CẦU 1-1';
    if (j === '2222') return 'CẦU 2-2';
    if (j === '3333') return 'CẦU 3-3';
    if (s >= 2) return 'BỆT ' + side + ' ' + s;
    return 'CẦU NGẮN ' + sig.slice(0, 3).join('-');
}

// --- HÀM UTILITIES CŨ CHO API ---
function parseLines(data) {
    if (!data || !Array.isArray(data.list)) return [];
    const sortedList = data.list.sort((a, b) => b.id - a.id);
    return sortedList.map(item => ({
        session: item.id,
        dice: item.dices,
        total: item.point,
        result: item.resultTruyenThong,
        tx: item.point >= 11 ? 'T' : 'X'
    })).sort((a, b) => a.session - b.session);
}

function lastN(arr, n) {
    const start = Math.max(0, arr.length - n);
    return arr.slice(start);
}

// --- ENSEMBLE CLASSIFIER (TÍCH HỢP DEEP BRAIN) ---
class SEIUEnsemble {
    constructor(algorithms, opts = {}) { 
        this.algs = algorithms;
        this.weights = {};
        for (const a of algorithms) {
            this.weights[a.id] = 1.0;
        }
    }
    
    fitInitial(history) {}
    updateWithOutcome(historyPrefix, actualTx) {}

    predict(history) {
        if (history.length < 4) {
            return { prediction: 'tài', confidence: 0.5, rawPrediction: 'T' };
        }
        const seq = history.map(h => h.tx).reverse(); // Mới nhất lên đầu
        const tot = history.map(h => h.total).reverse();
        
        let sc = tx_score(seq, tot);
        let sumW = Math.max(0.0001, sc.T + sc.X);
        let pick = sc.T >= sc.X ? 'T' : 'X';
        let edge = Math.abs(sc.T - sc.X) / sumW;
        let conf = Math.min(97, Math.max(52, Math.round(50 + edge * 46)));

        return {
            prediction: pick === 'T' ? 'tài' : 'xỉu',
            confidence: conf / 100,
            rawPrediction: pick
        };
    }
}

// Danh sách giả lập thuật toán để tương thích với framework cũ
const ALL_ALGS = [
    { id: '@duybmw v26', fn: (h) => {
        if (h.length < 4) return null;
        let seq = h.map(x => x.tx).reverse();
        let tot = h.map(x => x.total).reverse();
        let sc = tx_score(seq, tot);
        return sc.T >= sc.X ? 'T' : 'X';
    }}
];

function getComplexPattern(history) {
    const minHistory = 15;
    if (history.length < minHistory) return "n/a";
    const historyTx = history.map(h => h.tx);
    return historyTx.slice(-minHistory).join('').toLowerCase();
}

class SEIUManager {
    constructor(opts = {}) {
        this.history = [];
        this.ensemble = new SEIUEnsemble(ALL_ALGS, opts);
        this.currentPrediction = null;
    }
    
    calculateInitialStats() {}

    loadInitial(lines) {
        this.history = lines;
        this.currentPrediction = this.getPrediction();
        console.log("📦 Đã tải lịch sử. Hệ thống Deep Brain v26 sẵn sàng.");
        const nextSession = this.history.at(-1) ? this.history.at(-1).session + 1 : 'N/A';
        console.log(`🔮 Dự đoán phiên ${nextSession}: ${this.currentPrediction.prediction} (${(this.currentPrediction.confidence * 100).toFixed(0)}%)`);
    }

    pushRecord(record) {
        this.history.push(record);
        if (this.history.length > 500) {
            this.history = this.history.slice(-450);
        }
        this.currentPrediction = this.getPrediction();
        console.log(`📥 ${record.session} → ${record.result}. Dự đoán ${record.session + 1}: ${this.currentPrediction.prediction} (${(this.currentPrediction.confidence * 100).toFixed(0)}%)`);
    }

    getPrediction() {
        return this.ensemble.predict(this.history);
    }
}

const seiuManager = new SEIUManager();

// --- API SERVER ---
const app = fastify({ logger: true });
await app.register(cors, { origin: "*" });

async function fetchAndProcessHistory() {
    try {
        const response = await fetch(API_URL);
        const data = await response.json();
        const newHistory = parseLines(data);
        
        if (newHistory.length === 0) return;

        const lastSessionInHistory = newHistory.at(-1);

        if (!currentSessionId) {
            seiuManager.loadInitial(newHistory);
            txHistory = newHistory;
            currentSessionId = lastSessionInHistory.session;
            console.log(`✅ Đã tải ${newHistory.length} phiên lịch sử.`);
        } else if (lastSessionInHistory.session > currentSessionId) {
            const newRecords = newHistory.filter(r => r.session > currentSessionId);
            for (const record of newRecords) {
                seiuManager.pushRecord(record);
                txHistory.push(record);
            }
            if (txHistory.length > 350) {
                txHistory = txHistory.slice(-300);
            }
            currentSessionId = lastSessionInHistory.session;
        }
    } catch (e) {
        console.error("❌ Lỗi fetch dữ liệu:", e.message);
    }
}

fetchAndProcessHistory();
clearInterval(fetchInterval);
fetchInterval = setInterval(fetchAndProcessHistory, 5000);

// API Endpoints
app.get("/api/md5/lc79", async () => {
    const lastResult = txHistory.at(-1) || null;
    const currentPrediction = seiuManager.currentPrediction;
    const pattern = getComplexPattern(seiuManager.history);

    if (!lastResult || !currentPrediction) {
        return {
            id: "Tduy Lc79",
            phien_truoc: null,
            xuc_xac1: null,
            xuc_xac2: null,
            xuc_xac3: null,
            tong: null,
            ket_qua: "đang chờ...",
            pattern: "đang phân tích...",
            phien_hien_tai: null,
            du_doan: "chưa có",
            do_tin_cay: "0%"
        };
    }

    return {
        id: "Tduy Lc79",
        phien_truoc: lastResult.session,
        xuc_xac1: lastResult.dice[0],
        xuc_xac2: lastResult.dice[1],
        xuc_xac3: lastResult.dice[2],
        tong: lastResult.total,
        ket_qua: lastResult.result.toLowerCase(),
        pattern: pattern,
        phien_hien_tai: lastResult.session + 1,
        du_doan: currentPrediction.prediction,
        do_tin_cay: `${(currentPrediction.confidence * 100).toFixed(0)}%`
    };
});

app.get("/api/md5/his", async () => { 
    if (!txHistory.length) return { message: "không có dữ liệu lịch sử." };
    const reversedHistory = [...txHistory].sort((a, b) => b.session - a.session);
    return reversedHistory.map((i) => ({
        session: i.session,
        dice: i.dice,
        total: i.total,
        result: i.result.toLowerCase(),
        tx_label: i.tx.toLowerCase(),
    }));
});

app.get("/", async () => { 
    return {
        status: "ok sếp ơi",
        msg: " lc79 Pro - v26 Engine",
        version: "4.0",
        algorithms: "v24 + v25 + v26",
        endpoints: ["/api/md5/lc79", "/api/md5/his", "/api/md5/stats"]
    };
});

// 4. Endpoint thống kê chi tiết tổng ván, thắng, thua, tỷ lệ winrate
app.get("/api/md5/stats", async () => {
    const totalSessions = txHistory.length;
    if (totalSessions < 5) {
        return {
            success: true,
            message: "Chưa đủ dữ liệu phiên để thống kê thắng thua (cần ít nhất 5 phiên).",
            stats: { totalSessions, taiCount: 0, xiuCount: 0, wins: 0, losses: 0, winRate: "0%" }
        };
    }

    let taiCount = 0;
    let xiuCount = 0;
    let wins = 0;
    let losses = 0;
    let currentStreakType = null;
    let currentStreakCount = 0;

    // Chạy đánh giá ngược lại lịch sử (Backtest / Thực chiến mô phỏng) để tính chính xác thắng thua
    // Bắt đầu từ phiên thứ 5 trở đi vì AI cần ít nhất 4 phiên để phân tích
    for (let i = 4; i < txHistory.length; i++) {
        const pastSlice = txHistory.slice(0, i);
        const actualResult = txHistory[i].tx; // 'T' hoặc 'X'
        
        // Gọi lại thuật toán dự đoán cho thời điểm đó
        const pred = seiuManager.ensemble.predict(pastSlice);
        const predictedSide = pred.rawPrediction; // 'T' hoặc 'X'

        if (predictedSide === actualResult) {
            wins++;
        } else {
            losses++;
        }
    }

    // Thống kê Tài / Xỉu tổng quan
    txHistory.forEach(s => {
        if (s.tx === 'T') taiCount++;
        else xiuCount++;
    });

    const totalPredictions = wins + losses;
    const winRate = totalPredictions > 0 ? ((wins / totalPredictions) * 100).toFixed(1) + '%' : '0%';

    // Tính chuỗi kết quả thực tế gần nhất
    let streakType = txHistory[txHistory.length - 1].tx;
    let streakCount = 0;
    for (let i = txHistory.length - 1; i >= 0; i--) {
        if (txHistory[i].tx === streakType) {
            streakCount++;
        } else {
            break;
        }
    }

    return {
        success: true,
        stats: {
            totalSessions: totalSessions,
            taiCount: taiCount,
            xiuCount: xiuCount,
            taiRate: ((taiCount / totalSessions) * 100).toFixed(1) + '%',
            xiuRate: ((xiuCount / totalSessions) * 100).toFixed(1) + '%',
            predictionStats: {
                totalPredictions: totalPredictions,
                wins: wins,
                losses: losses,
                winRate: winRate
            },
            marketStreak: `${streakType === 'T' ? 'TÀI' : 'XỈU'} (${streakCount} tay liên tiếp)`
        }
    };
});

const start = async () => {
    try {
        await app.listen({ port: PORT, host: "0.0.0.0" });
    } catch (err) {
        process.exit(1);
    }
    console.log(`🚀 Server chạy thành công tại cổng ${PORT}`);
};

start();
