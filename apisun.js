const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3001;

// ==================== FILE STORAGE ====================
const HISTORY_FILE = './history.json';
const PATTERNS_FILE = './patterns.json';
const MODEL_WEIGHTS_FILE = './model_weights.json';

// Load history if exists
let resultHistory = [];
if (fs.existsSync(HISTORY_FILE)) {
    try {
        resultHistory = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
        console.log(`[📂] Đã tải ${resultHistory.length} phiên từ history.json`);
    } catch (e) {
        console.error('[❌] Lỗi đọc history.json:', e.message);
    }
}

// Load model weights if exists
let modelWeights = {
    'model1': 1.0, 'model2': 1.0, 'model3': 1.0, 'model4': 1.0,
    'model5': 1.0, 'model6': 1.0, 'model7': 1.0, 'model8': 1.0,
    'model9': 1.0, 'model10': 1.0, 'model11': 1.0, 'model12': 1.0,
    'model13': 1.0, 'model14': 1.0, 'model15': 1.0, 'model16': 1.0,
    'model17': 1.0, 'model18': 1.0, 'model19': 1.0, 'model20': 1.0,
    'model21': 1.0
};

// Load sub model weights
let subModelWeights = {};
for (let i = 1; i <= 42; i++) {
    subModelWeights[`sub_model_${i}`] = 1.0;
}

// Load mini model weights
let miniModelWeights = {};
for (let i = 1; i <= 21; i++) {
    miniModelWeights[`mini_model_${i}`] = 1.0;
}

if (fs.existsSync(MODEL_WEIGHTS_FILE)) {
    try {
        const savedWeights = JSON.parse(fs.readFileSync(MODEL_WEIGHTS_FILE, 'utf8'));
        modelWeights = savedWeights.modelWeights || modelWeights;
        subModelWeights = savedWeights.subModelWeights || subModelWeights;
        miniModelWeights = savedWeights.miniModelWeights || miniModelWeights;
        console.log('[📂] Đã tải model_weights.json');
    } catch (e) {
        console.error('[❌] Lỗi đọc model_weights.json:', e.message);
    }
}

// Save history
function saveHistory(entry) {
    resultHistory.push(entry);
    if (resultHistory.length > 1000) resultHistory.shift();
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(resultHistory, null, 2));
}

// Save model weights
function saveModelWeights() {
    const weights = {
        modelWeights,
        subModelWeights,
        miniModelWeights
    };
    fs.writeFileSync(MODEL_WEIGHTS_FILE, JSON.stringify(weights, null, 2));
}

// ==================== GLOBAL VARIABLES ====================
let currentSessionId = null;
let lastResult = null;
let lastPrediction = null;
let stats = {
    total: 0,
    correct: 0,
    wrong: 0,
    consecutiveLosses: 0,
    modelPerformance: {}
};

let apiResponseData = {
    "Phien": null,
    "Xuc_xac_1": null,
    "Xuc_xac_2": null,
    "Xuc_xac_3": null,
    "Tong": null,
    "Ket_qua": "",
    "Phien_hien_tai": null,
    "Du_doan": "",
    "Loai_cau": "",
    "Mau_cau_phat_hien": "",
    "Do_tin_cay": "0%",
    "Trang_thai": "",
    "Ket_qua_du_doan": "",
    "Thong_ke": {
        "tong": 0,
        "dung": 0,
        "sai": 0,
        "ti_le": "0%"
    },
    "id": "@nhan161019"
};

// ==================== TAI XIU ANALYZER ====================
class TaiXiuAnalyzer {
    constructor() {
        // Model weights
        this.modelWeights = modelWeights;
        this.subModelWeights = subModelWeights;
        this.miniModelWeights = miniModelWeights;
        
        // Sub models (42 cái với chuyên môn riêng)
        this.subModels = {};
        this.initSubModels();
        
        // Mini models (21 cái)
        this.miniModels = {};
        this.initMiniModels();
        
        this.performanceHistory = {};
        this.patternLibrary = this.loadPatternLibrary();
    }
    
    loadPatternLibrary() {
        // Thư viện các mẫu cầu đã gặp
        if (fs.existsSync(PATTERNS_FILE)) {
            try {
                return JSON.parse(fs.readFileSync(PATTERNS_FILE, 'utf8'));
            } catch (e) {
                console.error('[❌] Lỗi đọc patterns.json:', e.message);
            }
        }
        return {
            '1-1': [], '2-2': [], '3-3': [], '1-2': [], '2-1': [],
            '2-1-2': [], '1-2-1': [], 'bệt': [], 'loạn': []
        };
    }
    
    savePatternLibrary() {
        fs.writeFileSync(PATTERNS_FILE, JSON.stringify(this.patternLibrary, null, 2));
    }
    
    initSubModels() {
        // 42 sub models với chuyên môn khác nhau
        const subModelSpecialties = {
            // Model 1-6: Chuyên phân tích cầu 1-1 các biến thể
            1: { name: '1-1 thuần', type: '1-1', logic: 'pure', minLength: 4, threshold: 0.9 },
            2: { name: '1-1 biến thể', type: '1-1', logic: 'variant', minLength: 5, threshold: 0.8 },
            3: { name: '1-1 dài hạn', type: '1-1', logic: 'long', minLength: 8, threshold: 0.75 },
            4: { name: '1-1 kết hợp', type: '1-1', logic: 'hybrid', minLength: 6, threshold: 0.7 },
            5: { name: '1-1 gãy', type: '1-1', logic: 'break', minLength: 6, threshold: 0.8 },
            6: { name: '1-1 phục hồi', type: '1-1', logic: 'recovery', minLength: 7, threshold: 0.7 },
            
            // Model 7-12: Chuyên cầu 2-2
            7: { name: '2-2 chuẩn', type: '2-2', logic: 'pure', minLength: 6, threshold: 0.9 },
            8: { name: '2-2 lệch', type: '2-2', logic: 'offset', minLength: 7, threshold: 0.8 },
            9: { name: '2-2 biến tướng', type: '2-2', logic: 'variant', minLength: 8, threshold: 0.75 },
            10: { name: '2-2 kết hợp 1-1', type: '2-2', logic: 'hybrid', minLength: 8, threshold: 0.7 },
            11: { name: '2-2 dài', type: '2-2', logic: 'long', minLength: 10, threshold: 0.8 },
            12: { name: '2-2 bẻ', type: '2-2', logic: 'break', minLength: 7, threshold: 0.85 },
            
            // Model 13-18: Chuyên cầu bệt
            13: { name: 'bệt ngắn', type: 'bệt', logic: 'short', minLength: 3, threshold: 0.8 },
            14: { name: 'bệt trung', type: 'bệt', logic: 'medium', minLength: 5, threshold: 0.85 },
            15: { name: 'bệt dài', type: 'bệt', logic: 'long', minLength: 7, threshold: 0.9 },
            16: { name: 'bệt gãy', type: 'bệt', logic: 'break', minLength: 5, threshold: 0.8 },
            17: { name: 'bệt xen kẽ', type: 'bệt', logic: 'hybrid', minLength: 6, threshold: 0.7 },
            18: { name: 'siêu bệt', type: 'bệt', logic: 'super', minLength: 10, threshold: 0.95 },
            
            // Model 19-24: Chuyên cầu 3-3
            19: { name: '3-3 chuẩn', type: '3-3', logic: 'pure', minLength: 9, threshold: 0.9 },
            20: { name: '3-3 biến thể', type: '3-3', logic: 'variant', minLength: 10, threshold: 0.8 },
            21: { name: '3-3 ngắn', type: '3-3', logic: 'short', minLength: 6, threshold: 0.7 },
            22: { name: '3-3 kết hợp', type: '3-3', logic: 'hybrid', minLength: 9, threshold: 0.75 },
            23: { name: '3-3 bẻ', type: '3-3', logic: 'break', minLength: 8, threshold: 0.8 },
            24: { name: '3-3 dài', type: '3-3', logic: 'long', minLength: 12, threshold: 0.85 },
            
            // Model 25-30: Chuyên cầu 2-1-2 và 1-2-1
            25: { name: '2-1-2 chuẩn', type: '2-1-2', logic: 'pure', minLength: 5, threshold: 0.9 },
            26: { name: '2-1-2 biến thể', type: '2-1-2', logic: 'variant', minLength: 6, threshold: 0.8 },
            27: { name: '2-1-2 dài', type: '2-1-2', logic: 'long', minLength: 8, threshold: 0.8 },
            28: { name: '1-2-1 chuẩn', type: '1-2-1', logic: 'pure', minLength: 5, threshold: 0.9 },
            29: { name: '1-2-1 biến thể', type: '1-2-1', logic: 'variant', minLength: 6, threshold: 0.8 },
            30: { name: '1-2-1 dài', type: '1-2-1', logic: 'long', minLength: 8, threshold: 0.8 },
            
            // Model 31-36: Chuyên bẻ cầu và chuyển tiếp
            31: { name: 'bẻ cầu 1-1', type: 'break', logic: 'break11', minLength: 4, threshold: 0.85 },
            32: { name: 'bẻ cầu 2-2', type: 'break', logic: 'break22', minLength: 5, threshold: 0.85 },
            33: { name: 'bẻ cầu bệt', type: 'break', logic: 'breakStreak', minLength: 4, threshold: 0.8 },
            34: { name: 'chuyển tiếp 1-1 sang 2-2', type: 'transition', logic: '11to22', minLength: 6, threshold: 0.75 },
            35: { name: 'chuyển tiếp 2-2 sang 1-1', type: 'transition', logic: '22to11', minLength: 6, threshold: 0.75 },
            36: { name: 'chuyển tiếp bệt sang 1-1', type: 'transition', logic: 'streakTo11', minLength: 5, threshold: 0.7 },
            
            // Model 37-42: Chuyên phân tích tổng hợp
            37: { name: 'phân tích tần suất', type: 'frequency', logic: 'frequency', minLength: 10, threshold: 0.7 },
            38: { name: 'phân tích chu kỳ', type: 'cycle', logic: 'cycle', minLength: 12, threshold: 0.7 },
            39: { name: 'phân tích đối xứng', type: 'symmetry', logic: 'symmetry', minLength: 8, threshold: 0.75 },
            40: { name: 'phân tích Fibonacci', type: 'fibonacci', logic: 'fibonacci', minLength: 8, threshold: 0.7 },
            41: { name: 'phân tích xu hướng dài', type: 'trend', logic: 'longTrend', minLength: 15, threshold: 0.8 },
            42: { name: 'tổng hợp siêu cầu', type: 'super', logic: 'super', minLength: 20, threshold: 0.85 }
        };
        
        for (let i = 1; i <= 42; i++) {
            this.subModels[`sub_model_${i}`] = {
                ...subModelSpecialties[i],
                weight: this.subModelWeights[`sub_model_${i}`] || 1.0,
                accuracy: 0.5,
                predictions: []
            };
        }
    }
    
    initMiniModels() {
        const specialties = {
            1: 'phat_hien_cau_dep',
            2: 'du_doan_bien_dong',
            3: 'phan_tich_so_sanh',
            4: 'nhan_dien_xu_huong_cuc_bo',
            5: 'tinh_toan_xac_suat_cao',
            6: 'phat_hien_diem_gay',
            7: 'du_doan_nguong',
            8: 'phan_tich_chuoi',
            9: 'nhan_dien_mau_lap',
            10: 'tinh_he_so_tuong_quan',
            11: 'du_doan_doan_nhiet',
            12: 'phan_tich_pha',
            13: 'nhan_dien_song',
            14: 'tinh_toan_momentum',
            15: 'du_doan_hoi_phuc',
            16: 'phat_hien_dot_bien',
            17: 'phan_tich_can_bang',
            18: 'nhan_dien_tan_so',
            19: 'du_doan_chu_ky',
            20: 'tinh_toan_ma_tran',
            21: 'phan_tich_tong_hop'
        };
        
        for (let i = 1; i <= 21; i++) {
            this.miniModels[`mini_model_${i}`] = {
                weight: this.miniModelWeights[`mini_model_${i}`] || 1.0,
                accuracy: 0.5,
                specialty: specialties[i] || 'chung',
                predictions: []
            };
        }
    }
    
    // Helper: lấy mảng kết quả từ history
    getResultArray(history) {
        return history.map(h => h.Ket_qua || (h.score >= 11 ? 'Tài' : 'Xỉu'));
    }
    
    // ==================== SUB MODELS THÔNG MINH ====================
    
    // Model 1-6: Chuyên cầu 1-1
    runSubModel11(results, model) {
        if (results.length < model.minLength) return null;
        
        const last = results[results.length - 1];
        const last4 = results.slice(-4);
        const last6 = results.slice(-6);
        
        switch (model.logic) {
            case 'pure':
                // 1-1 thuần túy: TXTX TXTX
                if (this.isPerfectAlternating(results, 4)) {
                    return {
                        prediction: last === 'Tài' ? 'Xỉu' : 'Tài',
                        confidence: 0.9,
                        reason: 'Phát hiện cầu 1-1 thuần túy'
                    };
                }
                break;
                
            case 'variant':
                // 1-1 biến thể: chấp nhận lệch 1 nhịp
                if (this.isAlternatingWithTolerance(results, 1)) {
                    return {
                        prediction: last === 'Tài' ? 'Xỉu' : 'Tài',
                        confidence: 0.8,
                        reason: 'Phát hiện cầu 1-1 biến thể'
                    };
                }
                break;
                
            case 'long':
                // 1-1 dài hạn: xét 12 phiên
                const longResults = results.slice(-12);
                const altCount = this.countAlternating(longResults);
                if (altCount >= 8) {
                    return {
                        prediction: last === 'Tài' ? 'Xỉu' : 'Tài',
                        confidence: 0.7 + (altCount / 20),
                        reason: `Cầu 1-1 dài hạn với ${altCount}/11 cặp xen kẽ`
                    };
                }
                break;
                
            case 'hybrid':
                // Kết hợp 1-1 với yếu tố khác
                const recent = results.slice(-5);
                if (recent[0] !== recent[1] && recent[1] !== recent[2] && recent[3] !== recent[4]) {
                    return {
                        prediction: last === 'Tài' ? 'Xỉu' : 'Tài',
                        confidence: 0.7,
                        reason: 'Phát hiện cầu 1-1 kết hợp'
                    };
                }
                break;
                
            case 'break':
                // Phát hiện 1-1 sắp gãy
                if (last4[0] !== last4[1] && last4[1] !== last4[2] && last4[2] !== last4[3]) {
                    // Đang xen kẽ hoàn hảo, có thể sắp gãy
                    const streak = this.getStreak(results.slice(0, -1));
                    if (streak > 4) {
                        return {
                            prediction: last, // Giữ nguyên, không đảo
                            confidence: 0.8,
                            reason: 'Cầu 1-1 dài sắp gãy, dự đoán giữ nguyên'
                        };
                    }
                }
                break;
                
            case 'recovery':
                // 1-1 phục hồi sau gãy
                if (last4[0] === last4[1] && last4[1] !== last4[2] && last4[2] !== last4[3]) {
                    return {
                        prediction: last4[3] === 'Tài' ? 'Xỉu' : 'Tài',
                        confidence: 0.7,
                        reason: 'Cầu 1-1 đang phục hồi sau gãy'
                    };
                }
                break;
        }
        
        return null;
    }
    
    // Model 7-12: Chuyên cầu 2-2
    runSubModel22(results, model) {
        if (results.length < model.minLength) return null;
        
        const last = results[results.length - 1];
        const last4 = results.slice(-4);
        const last6 = results.slice(-6);
        const last8 = results.slice(-8);
        
        switch (model.logic) {
            case 'pure':
                // 2-2 chuẩn: TTXX TTXX
                if (last6.length === 6) {
                    if (last6[0] === last6[1] && last6[1] !== last6[2] &&
                        last6[2] === last6[3] && last6[3] !== last6[4] &&
                        last6[4] === last6[5]) {
                        return {
                            prediction: last6[4] === 'Tài' ? 'Xỉu' : 'Tài',
                            confidence: 0.9,
                            reason: 'Phát hiện cầu 2-2 chuẩn'
                        };
                    }
                }
                break;
                
            case 'offset':
                // 2-2 lệch: TTX TX X?
                if (last6.length === 6) {
                    if (last6[0] === last6[1] && last6[1] !== last6[2] &&
                        last6[2] !== last6[3] && last6[3] === last6[4] &&
                        last6[4] !== last6[5]) {
                        return {
                            prediction: last6[4] === 'Tài' ? 'Xỉu' : 'Tài',
                            confidence: 0.8,
                            reason: 'Phát hiện cầu 2-2 lệch'
                        };
                    }
                }
                break;
                
            case 'variant':
                // 2-2 biến tướng
                if (last8.length === 8) {
                    if (last8[0] === last8[1] && last8[1] !== last8[2] &&
                        last8[2] === last8[3] && last8[3] !== last8[4] &&
                        last8[4] === last8[5] && last8[5] !== last8[6] &&
                        last8[6] === last8[7]) {
                        return {
                            prediction: last8[6] === 'Tài' ? 'Xỉu' : 'Tài',
                            confidence: 0.75,
                            reason: 'Phát hiện cầu 2-2 biến tướng'
                        };
                    }
                }
                break;
                
            case 'hybrid':
                // 2-2 kết hợp 1-1
                if (last6.length === 6) {
                    if (last6[0] === last6[1] && last6[1] !== last6[2] &&
                        last6[2] !== last6[3] && last6[3] !== last6[4] &&
                        last6[4] === last6[5]) {
                        return {
                            prediction: last6[4] === 'Tài' ? 'Xỉu' : 'Tài',
                            confidence: 0.7,
                            reason: 'Cầu 2-2 kết hợp 1-1'
                        };
                    }
                }
                break;
                
            case 'long':
                // 2-2 dài
                if (last8.length === 8) {
                    let score = 0;
                    for (let i = 0; i < 7; i+=2) {
                        if (last8[i] === last8[i+1]) score++;
                    }
                    if (score >= 3) {
                        return {
                            prediction: last === 'Tài' ? 'Xỉu' : 'Tài',
                            confidence: 0.7 + (score * 0.05),
                            reason: `Cầu 2-2 dài với ${score}/4 cặp đúng`
                        };
                    }
                }
                break;
                
            case 'break':
                // Phát hiện bẻ cầu 2-2
                if (last6.length === 6) {
                    if (last6[0] === last6[1] && last6[1] !== last6[2] &&
                        last6[2] === last6[3] && last6[3] !== last6[4] &&
                        last6[4] !== last6[5]) {
                        return {
                            prediction: last6[4],
                            confidence: 0.85,
                            reason: 'Phát hiện bẻ cầu 2-2'
                        };
                    }
                }
                break;
        }
        
        return null;
    }
    
    // Model 13-18: Chuyên cầu bệt
    runSubModelStreak(results, model) {
        if (results.length < model.minLength) return null;
        
        const last = results[results.length - 1];
        const other = last === 'Tài' ? 'Xỉu' : 'Tài';
        
        // Tính độ dài bệt hiện tại
        let streak = 1;
        for (let i = results.length - 2; i >= 0; i--) {
            if (results[i] === last) streak++;
            else break;
        }
        
        switch (model.logic) {
            case 'short':
                if (streak >= 2 && streak <= 3) {
                    return {
                        prediction: last,
                        confidence: 0.7 + (streak * 0.05),
                        reason: `Bệt ngắn ${streak} phiên`
                    };
                }
                break;
                
            case 'medium':
                if (streak >= 4 && streak <= 5) {
                    return {
                        prediction: last,
                        confidence: 0.75 + ((streak - 4) * 0.05),
                        reason: `Bệt trung ${streak} phiên`
                    };
                }
                break;
                
            case 'long':
                if (streak >= 6) {
                    return {
                        prediction: last,
                        confidence: 0.8 + (Math.min(streak, 10) * 0.01),
                        reason: `Bệt dài ${streak} phiên`
                    };
                }
                break;
                
            case 'break':
                if (streak >= 4) {
                    // Có thể sắp gãy
                    return {
                        prediction: other,
                        confidence: 0.6 + (streak * 0.03),
                        reason: `Bệt ${streak} phiên, dự đoán sắp gãy`
                    };
                }
                break;
                
            case 'hybrid':
                // Bệt xen kẽ yếu tố khác
                if (streak >= 3) {
                    const prev = results[results.length - streak - 1];
                    if (prev && prev !== last) {
                        return {
                            prediction: last,
                            confidence: 0.7,
                            reason: `Bệt sau khi đảo từ ${prev}`
                        };
                    }
                }
                break;
                
            case 'super':
                if (streak >= 8) {
                    return {
                        prediction: last,
                        confidence: 0.9,
                        reason: `Siêu bệt ${streak} phiên`
                    };
                }
                break;
        }
        
        return null;
    }
    
    // Model 19-24: Chuyên cầu 3-3
    runSubModel33(results, model) {
        if (results.length < model.minLength) return null;
        
        const last = results[results.length - 1];
        const last9 = results.slice(-9);
        const last12 = results.slice(-12);
        
        switch (model.logic) {
            case 'pure':
                if (last9.length === 9) {
                    if (last9[0] === last9[1] && last9[1] === last9[2] &&
                        last9[3] === last9[4] && last9[4] === last9[5] &&
                        last9[6] === last9[7] && last9[7] === last9[8] &&
                        last9[0] !== last9[3] && last9[3] !== last9[6]) {
                        return {
                            prediction: last9[6] === 'Tài' ? 'Xỉu' : 'Tài',
                            confidence: 0.9,
                            reason: 'Phát hiện cầu 3-3 chuẩn'
                        };
                    }
                }
                break;
                
            case 'variant':
                if (last12.length === 12) {
                    let score = 0;
                    for (let i = 0; i < 12; i+=3) {
                        if (i+2 < 12 && last12[i] === last12[i+1] && last12[i+1] === last12[i+2]) {
                            score++;
                        }
                    }
                    if (score >= 3) {
                        return {
                            prediction: last === 'Tài' ? 'Xỉu' : 'Tài',
                            confidence: 0.7 + (score * 0.05),
                            reason: `Cầu 3-3 biến thể với ${score}/4 bộ ba`
                        };
                    }
                }
                break;
                
            case 'short':
                if (results.length >= 6) {
                    const last6 = results.slice(-6);
                    if (last6[0] === last6[1] && last6[1] === last6[2] &&
                        last6[3] === last6[4] && last6[4] === last6[5]) {
                        return {
                            prediction: last6[3] === 'Tài' ? 'Xỉu' : 'Tài',
                            confidence: 0.7,
                            reason: 'Cầu 3-3 ngắn (6 phiên)'
                        };
                    }
                }
                break;
                
            case 'hybrid':
                if (last9.length === 9) {
                    if (last9[0] === last9[1] && last9[1] === last9[2] &&
                        last9[3] !== last9[4] && last9[5] === last9[6] && last9[6] === last9[7]) {
                        return {
                            prediction: last9[6] === 'Tài' ? 'Xỉu' : 'Tài',
                            confidence: 0.75,
                            reason: 'Cầu 3-3 kết hợp'
                        };
                    }
                }
                break;
                
            case 'break':
                if (last9.length === 9) {
                    if (last9[0] === last9[1] && last9[1] === last9[2] &&
                        last9[3] === last9[4] && last9[4] === last9[5] &&
                        last9[6] !== last9[7]) {
                        return {
                            prediction: last9[6],
                            confidence: 0.8,
                            reason: 'Phát hiện bẻ cầu 3-3'
                        };
                    }
                }
                break;
                
            case 'long':
                if (results.length >= 15) {
                    const last15 = results.slice(-15);
                    let pattern = [];
                    for (let i = 0; i < 15; i+=3) {
                        if (i+2 < 15 && last15[i] === last15[i+1] && last15[i+1] === last15[i+2]) {
                            pattern.push(last15[i]);
                        }
                    }
                    if (pattern.length >= 4 && pattern[0] !== pattern[1] && pattern[1] !== pattern[2]) {
                        return {
                            prediction: pattern[pattern.length-1] === 'Tài' ? 'Xỉu' : 'Tài',
                            confidence: 0.8,
                            reason: 'Cầu 3-3 dài hạn'
                        };
                    }
                }
                break;
        }
        
        return null;
    }
    
    // Model 25-30: Chuyên cầu 2-1-2 và 1-2-1
    runSubModel212(results, model) {
        if (results.length < model.minLength) return null;
        
        const last = results[results.length - 1];
        const last5 = results.slice(-5);
        const last7 = results.slice(-7);
        
        switch (model.logic) {
            case 'pure':
                if (last5.length === 5) {
                    // 2-1-2: TTXTT
                    if (last5[0] === last5[1] && last5[1] !== last5[2] &&
                        last5[2] !== last5[3] && last5[3] === last5[4] &&
                        last5[0] === last5[3]) {
                        return {
                            prediction: last5[4] === 'Tài' ? 'Xỉu' : 'Tài',
                            confidence: 0.9,
                            reason: 'Phát hiện cầu 2-1-2 chuẩn'
                        };
                    }
                }
                break;
                
            case 'variant':
                if (last7.length === 7) {
                    // 2-1-2 mở rộng: TTX TTX?
                    if (last7[0] === last7[1] && last7[1] !== last7[2] &&
                        last7[3] === last7[4] && last7[4] !== last7[5] &&
                        last7[0] === last7[3]) {
                        return {
                            prediction: last7[5] === 'Tài' ? 'Xỉu' : 'Tài',
                            confidence: 0.8,
                            reason: 'Phát hiện cầu 2-1-2 biến thể'
                        };
                    }
                }
                break;
                
            case 'long':
                if (results.length >= 10) {
                    const last10 = results.slice(-10);
                    let count = 0;
                    for (let i = 0; i < 5; i+=2) {
                        if (i+4 < 10 && last10[i] === last10[i+1] && last10[i+1] !== last10[i+2] &&
                            last10[i+3] === last10[i+4]) {
                            count++;
                        }
                    }
                    if (count >= 2) {
                        return {
                            prediction: last === 'Tài' ? 'Xỉu' : 'Tài',
                            confidence: 0.75,
                            reason: 'Cầu 2-1-2 dài hạn'
                        };
                    }
                }
                break;
        }
        
        return null;
    }
    
    runSubModel121(results, model) {
        if (results.length < model.minLength) return null;
        
        const last = results[results.length - 1];
        const last5 = results.slice(-5);
        const last7 = results.slice(-7);
        
        switch (model.logic) {
            case 'pure':
                if (last5.length === 5) {
                    // 1-2-1: XTTXT
                    if (last5[0] !== last5[1] && last5[1] === last5[2] &&
                        last5[2] !== last5[3] && last5[3] === last5[4] &&
                        last5[0] === last5[3]) {
                        return {
                            prediction: last5[4] === 'Tài' ? 'Xỉu' : 'Tài',
                            confidence: 0.9,
                            reason: 'Phát hiện cầu 1-2-1 chuẩn'
                        };
                    }
                }
                break;
                
            case 'variant':
                if (last7.length === 7) {
                    if (last7[0] !== last7[1] && last7[1] === last7[2] &&
                        last7[3] !== last7[4] && last7[4] === last7[5] &&
                        last7[0] === last7[3]) {
                        return {
                            prediction: last7[5] === 'Tài' ? 'Xỉu' : 'Tài',
                            confidence: 0.8,
                            reason: 'Phát hiện cầu 1-2-1 biến thể'
                        };
                    }
                }
                break;
                
            case 'long':
                if (results.length >= 10) {
                    const last10 = results.slice(-10);
                    let count = 0;
                    for (let i = 0; i < 5; i+=2) {
                        if (i+4 < 10 && last10[i] !== last10[i+1] && last10[i+1] === last10[i+2] &&
                            last10[i+3] === last10[i+4]) {
                            count++;
                        }
                    }
                    if (count >= 2) {
                        return {
                            prediction: last === 'Tài' ? 'Xỉu' : 'Tài',
                            confidence: 0.75,
                            reason: 'Cầu 1-2-1 dài hạn'
                        };
                    }
                }
                break;
        }
        
        return null;
    }
    
    // Model 31-36: Chuyên bẻ cầu và chuyển tiếp
    runSubModelBreak(results, model) {
        if (results.length < model.minLength) return null;
        
        const last = results[results.length - 1];
        const last4 = results.slice(-4);
        const last5 = results.slice(-5);
        const last6 = results.slice(-6);
        
        switch (model.logic) {
            case 'break11':
                // Bẻ cầu 1-1: TXTX -> XX
                if (last4.length === 4) {
                    if (last4[0] !== last4[1] && last4[1] !== last4[2] && last4[2] === last4[3]) {
                        return {
                            prediction: last4[3],
                            confidence: 0.85,
                            reason: 'Phát hiện bẻ cầu 1-1'
                        };
                    }
                }
                break;
                
            case 'break22':
                // Bẻ cầu 2-2: TTXX -> TTT
                if (last5.length === 5) {
                    if (last5[0] === last5[1] && last5[1] !== last5[2] &&
                        last5[2] === last5[3] && last5[3] !== last5[4] &&
                        last5[0] === last5[4]) {
                        return {
                            prediction: last5[4],
                            confidence: 0.85,
                            reason: 'Phát hiện bẻ cầu 2-2'
                        };
                    }
                }
                break;
                
            case 'breakStreak':
                // Bẻ cầu bệt
                const streak = this.getStreak(results.slice(0, -1));
                if (streak >= 3 && last !== results[results.length - 2]) {
                    return {
                        prediction: last,
                        confidence: 0.8,
                        reason: `Phát hiện bẻ cầu bệt sau ${streak} phiên`
                    };
                }
                break;
                
            case '11to22':
                // Chuyển từ 1-1 sang 2-2
                if (last6.length === 6) {
                    if (last6[0] !== last6[1] && last6[1] !== last6[2] &&
                        last6[2] === last6[3] && last6[3] !== last6[4] &&
                        last6[4] === last6[5]) {
                        return {
                            prediction: last6[4] === 'Tài' ? 'Xỉu' : 'Tài',
                            confidence: 0.75,
                            reason: 'Chuyển từ cầu 1-1 sang 2-2'
                        };
                    }
                }
                break;
                
            case '22to11':
                // Chuyển từ 2-2 sang 1-1
                if (last6.length === 6) {
                    if (last6[0] === last6[1] && last6[1] !== last6[2] &&
                        last6[2] !== last6[3] && last6[3] !== last6[4] &&
                        last6[4] !== last6[5]) {
                        return {
                            prediction: last6[4] === 'Tài' ? 'Xỉu' : 'Tài',
                            confidence: 0.75,
                            reason: 'Chuyển từ cầu 2-2 sang 1-1'
                        };
                    }
                }
                break;
                
            case 'streakTo11':
                // Chuyển từ bệt sang 1-1
                if (last5.length === 5) {
                    if (last5[0] === last5[1] && last5[1] === last5[2] &&
                        last5[2] !== last5[3] && last5[3] !== last5[4]) {
                        return {
                            prediction: last5[4] === 'Tài' ? 'Xỉu' : 'Tài',
                            confidence: 0.7,
                            reason: 'Chuyển từ bệt sang cầu 1-1'
                        };
                    }
                }
                break;
        }
        
        return null;
    }
    
    // Model 37-42: Chuyên phân tích tổng hợp
    runSubModelAdvanced(results, model) {
        if (results.length < model.minLength) return null;
        
        const last = results[results.length - 1];
        const other = last === 'Tài' ? 'Xỉu' : 'Tài';
        
        switch (model.logic) {
            case 'frequency':
                // Phân tích tần suất
                const freq = this.analyzeFrequency(results);
                if (freq.dominant && freq.ratio > 0.6) {
                    return {
                        prediction: freq.dominant,
                        confidence: 0.6 + (freq.ratio * 0.2),
                        reason: `Tần suất ${freq.dominant} chiếm ${(freq.ratio*100).toFixed(0)}%`
                    };
                }
                break;
                
            case 'cycle':
                // Phân tích chu kỳ
                const cycle = this.detectCycle(results);
                if (cycle.found) {
                    return {
                        prediction: cycle.next,
                        confidence: 0.7,
                        reason: `Phát hiện chu kỳ ${cycle.length} phiên`
                    };
                }
                break;
                
            case 'symmetry':
                // Phân tích đối xứng
                const symmetry = this.checkSymmetry(results);
                if (symmetry.found) {
                    return {
                        prediction: symmetry.prediction,
                        confidence: 0.75,
                        reason: 'Phát hiện cầu đối xứng'
                    };
                }
                break;
                
            case 'fibonacci':
                // Phân tích Fibonacci
                const fib = this.checkFibonacci(results);
                if (fib.found) {
                    return {
                        prediction: fib.prediction,
                        confidence: 0.7,
                        reason: 'Phát hiện cầu Fibonacci'
                    };
                }
                break;
                
            case 'longTrend':
                // Xu hướng dài
                const trend = this.getLongTrend(results);
                if (trend.strength > 0.7) {
                    return {
                        prediction: trend.direction,
                        confidence: 0.7 + (trend.strength * 0.1),
                        reason: `Xu hướng dài ${trend.direction} với độ mạnh ${(trend.strength*100).toFixed(0)}%`
                    };
                }
                break;
                
            case 'super':
                // Tổng hợp siêu cầu
                const superAnalysis = this.superAnalysis(results);
                if (superAnalysis.confidence > 0.8) {
                    return superAnalysis;
                }
                break;
        }
        
        return null;
    }
    
    // Helper functions
    isPerfectAlternating(results, length) {
        const last = results.slice(-length);
        for (let i = 0; i < last.length - 1; i++) {
            if (last[i] === last[i+1]) return false;
        }
        return true;
    }
    
    isAlternatingWithTolerance(results, tolerance) {
        const last = results.slice(-6);
        let errors = 0;
        for (let i = 0; i < last.length - 1; i++) {
            if (last[i] === last[i+1]) errors++;
        }
        return errors <= tolerance;
    }
    
    countAlternating(results) {
        let count = 0;
        for (let i = 0; i < results.length - 1; i++) {
            if (results[i] !== results[i+1]) count++;
        }
        return count;
    }
    
    getStreak(results) {
        if (results.length === 0) return 0;
        const last = results[results.length - 1];
        let streak = 1;
        for (let i = results.length - 2; i >= 0; i--) {
            if (results[i] === last) streak++;
            else break;
        }
        return streak;
    }
    
    analyzeFrequency(results) {
        const recent = results.slice(-20);
        const taiCount = recent.filter(r => r === 'Tài').length;
        const xiuCount = recent.length - taiCount;
        const ratio = Math.max(taiCount, xiuCount) / recent.length;
        const dominant = taiCount > xiuCount ? 'Tài' : 'Xỉu';
        return { dominant, ratio };
    }
    
    detectCycle(results) {
        // Đơn giản: tìm chu kỳ 2,3,4
        for (let cycleLen of [2, 3, 4]) {
            if (results.length < cycleLen * 2) continue;
            const lastCycle = results.slice(-cycleLen);
            const prevCycle = results.slice(-cycleLen*2, -cycleLen);
            if (JSON.stringify(lastCycle) === JSON.stringify(prevCycle)) {
                return {
                    found: true,
                    length: cycleLen,
                    next: lastCycle[0]
                };
            }
        }
        return { found: false };
    }
    
    checkSymmetry(results) {
        if (results.length < 6) return { found: false };
        const last3 = results.slice(-3);
        const prev3 = results.slice(-6, -3);
        if (last3[0] === prev3[2] && last3[1] === prev3[1] && last3[2] === prev3[0]) {
            return {
                found: true,
                prediction: last3[1]
            };
        }
        return { found: false };
    }
    
    checkFibonacci(results) {
        // Fibonacci trong cầu: 1,1,2,3,5,8...
        if (results.length < 5) return { found: false };
        const fibs = [1, 2, 3, 5];
        for (let fib of fibs) {
            if (results.length >= fib * 2) {
                const lastFib = results.slice(-fib);
                const prevFib = results.slice(-fib*2, -fib);
                if (JSON.stringify(lastFib) === JSON.stringify(prevFib)) {
                    return {
                        found: true,
                        prediction: lastFib[0]
                    };
                }
            }
        }
        return { found: false };
    }
    
    getLongTrend(results) {
        if (results.length < 10) return { strength: 0, direction: null };
        const first = results.slice(0, 5);
        const last = results.slice(-5);
        const firstTai = first.filter(r => r === 'Tài').length;
        const lastTai = last.filter(r => r === 'Tài').length;
        
        if (lastTai > firstTai + 2) {
            return { strength: 0.8, direction: 'Tài' };
        } else if (lastTai < firstTai - 2) {
            return { strength: 0.8, direction: 'Xỉu' };
        }
        return { strength: 0.5, direction: lastTai > 2 ? 'Tài' : 'Xỉu' };
    }
    
    superAnalysis(results) {
        // Kết hợp nhiều yếu tố
        const freq = this.analyzeFrequency(results);
        const trend = this.getLongTrend(results);
        const cycle = this.detectCycle(results);
        
        let score = 0;
        let predictions = [];
        
        if (freq.ratio > 0.6) {
            predictions.push({ pred: freq.dominant, weight: freq.ratio });
            score++;
        }
        
        if (trend.strength > 0.7) {
            predictions.push({ pred: trend.direction, weight: trend.strength });
            score++;
        }
        
        if (cycle.found) {
            predictions.push({ pred: cycle.next, weight: 0.7 });
            score++;
        }
        
        if (score >= 2) {
            const taiWeight = predictions.filter(p => p.pred === 'Tài')
                .reduce((sum, p) => sum + p.weight, 0);
            const xiuWeight = predictions.filter(p => p.pred === 'Xỉu')
                .reduce((sum, p) => sum + p.weight, 0);
            
            if (taiWeight > xiuWeight * 1.5) {
                return {
                    prediction: 'Tài',
                    confidence: 0.85,
                    reason: 'Siêu phân tích đồng thuận Tài'
                };
            } else if (xiuWeight > taiWeight * 1.5) {
                return {
                    prediction: 'Xỉu',
                    confidence: 0.85,
                    reason: 'Siêu phân tích đồng thuận Xỉu'
                };
            }
        }
        
        return { confidence: 0 };
    }
    
    // Run sub model
    runSubModel(index, history) {
        if (history.length < 3) return null;
        
        const results = this.getResultArray(history);
        const model = this.subModels[`sub_model_${index}`];
        
        if (!model) return null;
        
        let result = null;
        const type = model.type;
        
        switch (type) {
            case '1-1':
                result = this.runSubModel11(results, model);
                break;
            case '2-2':
                result = this.runSubModel22(results, model);
                break;
            case 'bệt':
                result = this.runSubModelStreak(results, model);
                break;
            case '3-3':
                result = this.runSubModel33(results, model);
                break;
            case '2-1-2':
                result = this.runSubModel212(results, model);
                break;
            case '1-2-1':
                result = this.runSubModel121(results, model);
                break;
            case 'break':
            case 'transition':
                result = this.runSubModelBreak(results, model);
                break;
            default:
                result = this.runSubModelAdvanced(results, model);
        }
        
        if (result) {
            result.model_name = model.name;
            return result;
        }
        
        return null;
    }
    
    // Run mini model
    runMiniModel(index, history) {
        if (history.length < 2) return null;
        
        const results = this.getResultArray(history);
        const miniModel = this.miniModels[`mini_model_${index}`];
        
        let prediction, confidence, reason;
        
        switch (miniModel.specialty) {
            case 'phat_hien_cau_dep':
                const pattern = this.analyzeBasicPatterns(history);
                prediction = pattern.prediction;
                confidence = pattern.confidence * 0.9;
                reason = pattern.reason;
                break;
                
            case 'du_doan_bien_dong':
                const dice = this.analyzeDiceVolatility(history);
                prediction = dice.prediction;
                confidence = dice.confidence * 0.8;
                reason = dice.reason;
                break;
                
            case 'nhan_dien_xu_huong_cuc_bo':
                const short = this.analyzeShortTerm(history);
                prediction = short.prediction;
                confidence = short.confidence * 0.85;
                reason = short.reason;
                break;
                
            case 'tinh_toan_xac_suat_cao':
                const taiCount = results.filter(r => r === 'Tài').length;
                const xiuCount = results.length - taiCount;
                if (taiCount > xiuCount * 1.5) {
                    prediction = 'Xỉu';
                    confidence = 0.7;
                    reason = 'Xác suất Tài cao, dự đoán Xỉu để cân bằng';
                } else if (xiuCount > taiCount * 1.5) {
                    prediction = 'Tài';
                    confidence = 0.7;
                    reason = 'Xác suất Xỉu cao, dự đoán Tài để cân bằng';
                } else {
                    prediction = results[results.length - 1];
                    confidence = 0.5;
                    reason = 'Xác suất cân bằng';
                }
                break;
                
            case 'phan_tich_so_sanh':
                // So sánh với các mẫu trong thư viện
                const currentPattern = results.slice(-5).join('');
                let matchFound = false;
                for (let [type, patterns] of Object.entries(this.patternLibrary)) {
                    if (patterns.includes(currentPattern)) {
                        matchFound = true;
                        prediction = results[results.length - 1] === 'Tài' ? 'Xỉu' : 'Tài';
                        confidence = 0.75;
                        reason = `Khớp mẫu ${type} trong thư viện`;
                        break;
                    }
                }
                if (!matchFound) {
                    prediction = results[results.length - 1];
                    confidence = 0.4;
                    reason = 'Không tìm thấy mẫu tương tự';
                }
                break;
                
            default:
                // Các mini model khác dùng logic đơn giản
                const random = Math.random();
                if (random < 0.4) {
                    prediction = results[results.length - 1];
                    confidence = 0.5;
                } else if (random < 0.7) {
                    prediction = results[results.length - 1] === 'Tài' ? 'Xỉu' : 'Tài';
                    confidence = 0.5;
                } else {
                    const streak = this.getStreak(results);
                    if (streak >= 3) {
                        prediction = results[results.length - 1];
                        confidence = 0.6;
                    } else {
                        prediction = results[results.length - 1] === 'Tài' ? 'Xỉu' : 'Tài';
                        confidence = 0.5;
                    }
                }
                reason = `Mini model ${index} (${miniModel.specialty})`;
        }
        
        return {
            prediction,
            confidence: Math.min(confidence, 0.95),
            reason,
            model_name: `mini_${index}_${miniModel.specialty}`
        };
    }
    
    // Model 1: Nhận biết các loại cầu cơ bản
    analyzeBasicPatterns(history) {
        if (history.length < 3) {
            return { prediction: null, confidence: 0, reason: 'Không đủ dữ liệu' };
        }
        
        const results = this.getResultArray(history);
        
        const patterns = {
            '1-1': this.checkAlternatingPattern(results),
            '1-2-1': this.checkPattern121(results),
            '2-1-2': this.checkPattern212(results),
            '3-1': this.checkPattern31(results),
            '1-3': this.checkPattern13(results),
            '2-2': this.checkPattern22(results),
            'cầu_bệt': this.checkStreakPattern(results),
            'cầu_đảo': this.checkReversalPattern(results)
        };
        
        // Lọc pattern có confidence > 0
        const validPatterns = {};
        for (let [key, value] of Object.entries(patterns)) {
            if (value && value.confidence > 0) {
                validPatterns[key] = value;
            }
        }
        
        if (Object.keys(validPatterns).length === 0) {
            return {
                prediction: results[results.length - 1],
                confidence: 0.3,
                reason: 'Không phát hiện pattern rõ ràng'
            };
        }
        
        // Tìm pattern tốt nhất
        let bestPattern = null;
        let bestConfidence = 0;
        let bestKey = '';
        
        for (let [key, value] of Object.entries(validPatterns)) {
            if (value.confidence > bestConfidence) {
                bestConfidence = value.confidence;
                bestPattern = value;
                bestKey = key;
            }
        }
        
        return {
            prediction: bestPattern.prediction,
            confidence: bestPattern.confidence,
            pattern_type: bestKey,
            reason: `Phát hiện cầu ${bestKey} với độ tin cậy ${(bestPattern.confidence * 100).toFixed(0)}%`
        };
    }
    
    checkAlternatingPattern(results) {
        if (results.length < 2) {
            return { prediction: null, confidence: 0 };
        }
        
        const last = results[results.length - 1];
        const pred = last === 'Tài' ? 'Xỉu' : 'Tài';
        
        let confidence = 0.5;
        for (let i = results.length - 2; i >= Math.max(results.length - 6, 0); i -= 2) {
            if (results[i] === last) {
                confidence += 0.1;
            } else {
                break;
            }
        }
        
        return { prediction: pred, confidence: Math.min(confidence, 0.95) };
    }
    
    checkPattern121(results) {
        if (results.length < 3) {
            return { prediction: null, confidence: 0 };
        }
        
        if (results[results.length - 3] === results[results.length - 1] && 
            results[results.length - 2] !== results[results.length - 1]) {
            return { prediction: results[results.length - 1], confidence: 0.7 };
        } else {
            return { prediction: results[results.length - 1], confidence: 0.3 };
        }
    }
    
    checkPattern212(results) {
        if (results.length < 3) {
            return { prediction: null, confidence: 0 };
        }
        
        if (results[results.length - 3] !== results[results.length - 1] && 
            results[results.length - 2] === results[results.length - 1]) {
            return { prediction: results[results.length - 2], confidence: 0.7 };
        } else {
            return { prediction: results[results.length - 1], confidence: 0.3 };
        }
    }
    
    checkPattern31(results) {
        if (results.length < 4) {
            return { prediction: null, confidence: 0 };
        }
        
        if (results[results.length - 4] === results[results.length - 3] && 
            results[results.length - 3] === results[results.length - 2] && 
            results[results.length - 2] !== results[results.length - 1]) {
            return { prediction: results[results.length - 1], confidence: 0.8 };
        } else {
            return { prediction: results[results.length - 1], confidence: 0.2 };
        }
    }
    
    checkPattern13(results) {
        if (results.length < 4) {
            return { prediction: null, confidence: 0 };
        }
        
        if (results[results.length - 4] !== results[results.length - 3] && 
            results[results.length - 3] === results[results.length - 2] && 
            results[results.length - 2] === results[results.length - 1]) {
            return { prediction: results[results.length - 1], confidence: 0.8 };
        } else {
            return { prediction: results[results.length - 1], confidence: 0.2 };
        }
    }
    
    checkPattern22(results) {
        if (results.length < 4) {
            return { prediction: null, confidence: 0 };
        }
        
        if (results[results.length - 4] === results[results.length - 3] && 
            results[results.length - 2] === results[results.length - 1] && 
            results[results.length - 3] !== results[results.length - 2]) {
            return { prediction: results[results.length - 1], confidence: 0.75 };
        } else {
            return { prediction: results[results.length - 1], confidence: 0.25 };
        }
    }
    
    checkStreakPattern(results) {
        let streak = 1;
        for (let i = results.length - 2; i >= 0; i--) {
            if (results[i] === results[results.length - 1]) {
                streak++;
            } else {
                break;
            }
        }
        
        if (streak >= 3) {
            let confidence = 0.6 + (streak * 0.05);
            return { prediction: results[results.length - 1], confidence: Math.min(confidence, 0.9) };
        } else {
            const other = results[results.length - 1] === 'Tài' ? 'Xỉu' : 'Tài';
            if (streak >= 6) {
                return { prediction: other, confidence: 0.65 };
            }
            return { prediction: results[results.length - 1], confidence: 0.4 };
        }
    }
    
    checkReversalPattern(results) {
        if (results.length < 3) {
            return { prediction: null, confidence: 0 };
        }
        
        if (results[results.length - 2] !== results[results.length - 1]) {
            return { prediction: results[results.length - 1], confidence: 0.5 };
        } else {
            const other = results[results.length - 1] === 'Tài' ? 'Xỉu' : 'Tài';
            return { prediction: other, confidence: 0.4 };
        }
    }
    
    // Model 2: Bắt trend
    analyzeTrend(history) {
        if (history.length < 5) {
            return { prediction: null, confidence: 0, reason: 'Không đủ dữ liệu' };
        }
        
        const results = this.getResultArray(history);
        
        // Xu hướng ngắn (3 phiên)
        const shortTerm = results.slice(-3);
        const shortCounts = this.countResults(shortTerm);
        const shortTrend = this.getMostCommon(shortCounts);
        
        // Xu hướng dài (10 phiên)
        const longTerm = results.slice(-10);
        const longCounts = this.countResults(longTerm);
        const longTrend = this.getMostCommon(longCounts);
        
        // Momentum
        const momentum = this.calculateMomentum(results);
        
        if (shortTrend.count >= 2 && longTrend.count >= 6) {
            return {
                prediction: shortTrend.value,
                confidence: Math.min(0.7 + momentum * 0.1, 0.95),
                momentum: momentum,
                reason: `Xu hướng ngắn và dài đều nghiêng về ${shortTrend.value}`
            };
        } else if (shortTrend.count >= 2) {
            return {
                prediction: shortTrend.value,
                confidence: Math.min(0.6 + momentum * 0.1, 0.95),
                momentum: momentum,
                reason: `Xu hướng ngắn hạn nghiêng về ${shortTrend.value}`
            };
        } else if (longTrend.count >= 6) {
            return {
                prediction: longTrend.value,
                confidence: Math.min(0.6 + momentum * 0.1, 0.95),
                momentum: momentum,
                reason: `Xu hướng dài hạn nghiêng về ${longTrend.value}`
            };
        } else {
            const other = results[results.length - 1] === 'Tài' ? 'Xỉu' : 'Tài';
            return {
                prediction: other,
                confidence: 0.5,
                momentum: momentum,
                reason: "Không có trend rõ ràng, dự đoán đảo chiều"
            };
        }
    }
    
    countResults(results) {
        const counts = { 'Tài': 0, 'Xỉu': 0 };
        results.forEach(r => counts[r]++);
        return counts;
    }
    
    getMostCommon(counts) {
        if (counts['Tài'] >= counts['Xỉu']) {
            return { value: 'Tài', count: counts['Tài'] };
        } else {
            return { value: 'Xỉu', count: counts['Xỉu'] };
        }
    }
    
    calculateMomentum(results) {
        if (results.length < 5) return 0;
        
        const recent = results.slice(-5);
        const taiCount = recent.filter(r => r === 'Tài').length;
        
        if (taiCount === 5 || taiCount === 0) return 0.3;
        if (taiCount >= 3 || taiCount <= 2) return 0.15;
        return 0;
    }
    
    // Model 3: Chênh lệch 12 phiên
    analyzeImbalance(history) {
        if (history.length < 12) {
            return { prediction: null, confidence: 0, reason: 'Không đủ 12 phiên' };
        }
        
        const results = this.getResultArray(history.slice(-12));
        const countTai = results.filter(r => r === 'Tài').length;
        const countXiu = results.length - countTai;
        
        const imbalanceRatio = Math.abs(countTai - countXiu) / 12;
        
        if (imbalanceRatio > 0.4) {
            if (countTai > countXiu) {
                return {
                    prediction: 'Xỉu',
                    confidence: Math.min(0.7 + imbalanceRatio * 0.2, 0.95),
                    tai_count: countTai,
                    xiu_count: countXiu,
                    reason: `Chênh lệch lớn (${countTai}T - ${countXiu}X), dự đoán Xỉu để cân bằng`
                };
            } else {
                return {
                    prediction: 'Tài',
                    confidence: Math.min(0.7 + imbalanceRatio * 0.2, 0.95),
                    tai_count: countTai,
                    xiu_count: countXiu,
                    reason: `Chênh lệch lớn (${countTai}T - ${countXiu}X), dự đoán Tài để cân bằng`
                };
            }
        } else {
            return {
                prediction: results[results.length - 1],
                confidence: 0.5,
                tai_count: countTai,
                xiu_count: countXiu,
                reason: `Chênh lệch ${countTai}T - ${countXiu}X trong 12 phiên, tiếp tục xu hướng`
            };
        }
    }
    
    // Model 4: Ngắn hạn
    analyzeShortTerm(history) {
        if (history.length < 3) {
            return { prediction: null, confidence: 0, reason: 'Không đủ dữ liệu' };
        }
        
        const results = this.getResultArray(history);
        const last3 = results.slice(-3);
        
        const patterns = [];
        
        // Pattern 3 liên tiếp
        if (last3[0] === last3[1] && last3[1] === last3[2]) {
            patterns.push({ type: 'bệt', prediction: last3[0], confidence: 0.75 });
        }
        
        // Pattern 2-1
        if (last3[0] === last3[1] && last3[1] !== last3[2]) {
            patterns.push({ type: '2-1', prediction: last3[2], confidence: 0.7 });
        }
        
        // Pattern 1-2
        if (last3[0] !== last3[1] && last3[1] === last3[2]) {
            const other = last3[2] === 'Tài' ? 'Xỉu' : 'Tài';
            patterns.push({ type: '1-2', prediction: other, confidence: 0.65 });
        }
        
        // Pattern xen kẽ
        if (results.length >= 4) {
            const last4 = results.slice(-4);
            if (last4[0] !== last4[1] && last4[1] !== last4[2] && last4[2] !== last4[3]) {
                const other = last4[3] === 'Tài' ? 'Xỉu' : 'Tài';
                patterns.push({ type: 'xen_kẽ', prediction: other, confidence: 0.8 });
            }
        }
        
        if (patterns.length > 0) {
            const bestPattern = patterns.reduce((best, current) => 
                current.confidence > best.confidence ? current : best
            );
            
            return {
                prediction: bestPattern.prediction,
                confidence: bestPattern.confidence,
                pattern: bestPattern.type,
                reason: `Phát hiện pattern ${bestPattern.type} trong ngắn hạn`
            };
        } else {
            return {
                prediction: results[results.length - 1],
                confidence: 0.4,
                pattern: 'không_rõ',
                reason: "Không phát hiện pattern ngắn hạn rõ ràng"
            };
        }
    }
    
    // Model 11: Biến động xúc xắc
    analyzeDiceVolatility(history) {
        if (history.length < 5) {
            return { prediction: null, confidence: 0, reason: 'Không đủ dữ liệu' };
        }
        
        // Lấy mặt xúc xắc từ history
        const faceSequences = [];
        history.forEach(h => {
            if (h.Xuc_xac_1) faceSequences.push(h.Xuc_xac_1);
            if (h.Xuc_xac_2) faceSequences.push(h.Xuc_xac_2);
            if (h.Xuc_xac_3) faceSequences.push(h.Xuc_xac_3);
        });
        
        if (faceSequences.length === 0) {
            return { prediction: null, confidence: 0, reason: 'Không có dữ liệu mặt xúc xắc' };
        }
        
        // Tần suất xuất hiện
        const faceFreq = {};
        for (let i = 1; i <= 6; i++) faceFreq[i] = 0;
        faceSequences.forEach(f => faceFreq[f]++);
        
        // 5 phiên gần nhất
        const recentFaces = [];
        const recentHistory = history.slice(-5);
        recentHistory.forEach(h => {
            if (h.Xuc_xac_1) recentFaces.push(h.Xuc_xac_1);
            if (h.Xuc_xac_2) recentFaces.push(h.Xuc_xac_2);
            if (h.Xuc_xac_3) recentFaces.push(h.Xuc_xac_3);
        });
        
        const recentFreq = {};
        for (let i = 1; i <= 6; i++) recentFreq[i] = 0;
        recentFaces.forEach(f => recentFreq[f]++);
        
        // Dự đoán mặt có khả năng cao
        const predictions = [];
        for (let face = 1; face <= 6; face++) {
            if (recentFreq[face] < 2) {
                const prob = 0.3 + (2 - recentFreq[face]) * 0.1;
                predictions.push({ face, prob });
            }
        }
        
        if (predictions.length > 0) {
            predictions.sort((a, b) => b.prob - a.prob);
            const topFaces = predictions.slice(0, 3);
            
            if (topFaces.length >= 3) {
                const predictedScores = [];
                for (let i = 0; i < topFaces.length; i++) {
                    for (let j = i; j < topFaces.length; j++) {
                        for (let k = j; k < topFaces.length; k++) {
                            predictedScores.push(topFaces[i].face + topFaces[j].face + topFaces[k].face);
                        }
                    }
                }
                
                if (predictedScores.length > 0) {
                    const avgPredicted = predictedScores.reduce((a, b) => a + b, 0) / predictedScores.length;
                    const predType = avgPredicted >= 11 ? 'Tài' : 'Xỉu';
                    
                    return {
                        prediction: predType,
                        confidence: 0.65,
                        predicted_faces: topFaces.map(f => f.face),
                        reason: `Dựa trên biến động xúc xắc, các mặt ${topFaces.map(f => f.face).join(',')} có khả năng xuất hiện cao`
                    };
                }
            } else if (topFaces.length === 2) {
                const predictedScores = [];
                for (let i = 0; i < topFaces.length; i++) {
                    for (let j = i; j < topFaces.length; j++) {
                        for (let k = j; k < topFaces.length; k++) {
                            predictedScores.push(topFaces[i].face + topFaces[j].face + topFaces[k].face);
                        }
                    }
                }
                
                if (predictedScores.length > 0) {
                    const avgPredicted = predictedScores.reduce((a, b) => a + b, 0) / predictedScores.length;
                    const predType = avgPredicted >= 11 ? 'Tài' : 'Xỉu';
                    
                    return {
                        prediction: predType,
                        confidence: 0.6,
                        predicted_faces: topFaces.map(f => f.face),
                        reason: `Dựa trên biến động xúc xắc, các mặt ${topFaces.map(f => f.face).join(',')} có khả năng xuất hiện cao`
                    };
                }
            } else {
                const face = topFaces[0].face;
                const avgOther = 3.5;
                const avgPredicted = face + avgOther + avgOther;
                const predType = avgPredicted >= 11 ? 'Tài' : 'Xỉu';
                
                return {
                    prediction: predType,
                    confidence: 0.55,
                    predicted_faces: [face],
                    reason: `Dựa trên biến động xúc xắc, mặt ${face} có khả năng xuất hiện cao`
                };
            }
        }
        
        return {
            prediction: history[history.length - 1].Ket_qua || (history[history.length - 1].score >= 11 ? 'Tài' : 'Xỉu'),
            confidence: 0.4,
            reason: "Không phát hiện biến động đặc biệt"
        };
    }
    
    // Ensemble tất cả các model
    ensembleModels(history) {
        const modelResults = {};
        
        // Chạy các model chính
        modelResults.model1 = this.analyzeBasicPatterns(history);
        modelResults.model2 = this.analyzeTrend(history);
        modelResults.model3 = this.analyzeImbalance(history);
        modelResults.model4 = this.analyzeShortTerm(history);
        modelResults.model11 = this.analyzeDiceVolatility(history);
        
        // Chạy sub models (1-42)
        for (let i = 1; i <= 42; i++) {
            const subResult = this.runSubModel(i, history);
            if (subResult && subResult.prediction) {
                modelResults[`sub_model_${i}`] = subResult;
            }
        }
        
        // Chạy mini models (1-21)
        for (let i = 1; i <= 21; i++) {
            const miniResult = this.runMiniModel(i, history);
            if (miniResult && miniResult.prediction) {
                modelResults[`mini_model_${i}`] = miniResult;
            }
        }
        
        // Tính weighted vote
        let taiWeight = 0;
        let xiuWeight = 0;
        let totalWeight = 0;
        let details = [];
        
        for (let [modelName, result] of Object.entries(modelResults)) {
            if (result && result.prediction && result.confidence > 0.3) {
                // Lấy weight phù hợp
                let weight = 1.0;
                if (modelName.startsWith('sub')) {
                    weight = this.subModelWeights[modelName] || 1.0;
                } else if (modelName.startsWith('mini')) {
                    weight = this.miniModelWeights[modelName] || 1.0;
                } else {
                    weight = this.modelWeights[modelName] || 1.0;
                }
                
                const weightedConfidence = weight * result.confidence;
                
                if (result.prediction === 'Tài') {
                    taiWeight += weightedConfidence;
                } else if (result.prediction === 'Xỉu') {
                    xiuWeight += weightedConfidence;
                }
                
                totalWeight += weightedConfidence;
                details.push({
                    model: result.model_name || modelName,
                    prediction: result.prediction,
                    confidence: result.confidence,
                    weight: weight,
                    reason: result.reason
                });
            }
        }
        
        // Sắp xếp details theo confidence giảm dần
        details.sort((a, b) => b.confidence - a.confidence);
        
        // Quyết định cuối cùng
        let finalPrediction, finalConfidence, finalReason, finalPattern, finalType;
        
        if (totalWeight > 0) {
            const taiRatio = taiWeight / totalWeight;
            const xiuRatio = xiuWeight / totalWeight;
            
            if (taiRatio > 0.55) {
                finalPrediction = 'Tài';
                finalConfidence = taiRatio;
                finalReason = `${details.length} models đồng thuận Tài (${(taiRatio*100).toFixed(1)}%)`;
            } else if (xiuRatio > 0.55) {
                finalPrediction = 'Xỉu';
                finalConfidence = xiuRatio;
                finalReason = `${details.length} models đồng thuận Xỉu (${(xiuRatio*100).toFixed(1)}%)`;
            } else {
                // Tỉ lệ cân bằng, dùng model có confidence cao nhất
                const bestModel = details[0];
                if (bestModel) {
                    finalPrediction = bestModel.prediction;
                    finalConfidence = 0.5 + bestModel.confidence * 0.2;
                    finalReason = `Tỉ lệ cân bằng, dùng model ${bestModel.model}: ${bestModel.reason}`;
                } else {
                    finalPrediction = history.length > 0 ? 
                        (history[history.length - 1].Ket_qua || 
                         (history[history.length - 1].score >= 11 ? 'Tài' : 'Xỉu')) : 'Tài';
                    finalConfidence = 0.5;
                    finalReason = "Không có model nào đủ tin cậy";
                }
            }
        } else {
            finalPrediction = history.length > 0 ? 
                (history[history.length - 1].Ket_qua || 
                 (history[history.length - 1].score >= 11 ? 'Tài' : 'Xỉu')) : 'Tài';
            finalConfidence = 0.5;
            finalReason = "Không đủ dữ liệu model";
        }
        
        // Lấy pattern type từ model tốt nhất
        if (details.length > 0) {
            finalType = details[0].model;
            finalPattern = history.length > 0 ? 
                this.getResultArray(history.slice(-5)).join('') : '';
        } else {
            finalType = 'Không xác định';
            finalPattern = '';
        }
        
        return {
            prediction: finalPrediction,
            confidence: finalConfidence,
            reason: finalReason,
            pattern_type: finalType,
            pattern: finalPattern,
            details: details.slice(0, 5) // Top 5 models
        };
    }
    
    // Cập nhật trọng số model dựa trên kết quả
    updateModelWeights(actual, predicted, confidence) {
        const correct = (actual === predicted) ? 1 : 0;
        
        // Update main models
        for (let modelName in this.modelWeights) {
            if (correct) {
                this.modelWeights[modelName] = Math.min(this.modelWeights[modelName] * 1.01, 2.0);
            } else {
                this.modelWeights[modelName] = Math.max(this.modelWeights[modelName] * 0.99, 0.5);
            }
        }
        
        // Update sub models
        for (let modelName in this.subModelWeights) {
            if (correct) {
                this.subModelWeights[modelName] = Math.min(this.subModelWeights[modelName] * 1.005, 1.5);
            } else {
                this.subModelWeights[modelName] = Math.max(this.subModelWeights[modelName] * 0.995, 0.7);
            }
        }
        
        // Update mini models
        for (let modelName in this.miniModelWeights) {
            if (correct) {
                this.miniModelWeights[modelName] = Math.min(this.miniModelWeights[modelName] * 1.003, 1.3);
            } else {
                this.miniModelWeights[modelName] = Math.max(this.miniModelWeights[modelName] * 0.997, 0.8);
            }
        }
        
        saveModelWeights();
    }
}

// Initialize analyzer
const analyzer = new TaiXiuAnalyzer();

// ==================== WEBSOCKET ====================
const WEBSOCKET_URL = "wss://websocket.azhkthg1.net/websocket?token=";
const WS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Origin": "https://play.sunwin.free"
};
const RECONNECT_DELAY = 2500;
const PING_INTERVAL = 15000;

const initialMessages = [
   [
    1,
    "MiniGame",
    "SC_botuonglevi",
    "123456hh",
    {
        "info": "{\"ipAddress\":\"2402:800:61a6:84fb:b0bb:b4c8:6860:b8f0\",\"wsToken\":\"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiJsZXZpNGV2ZXIiLCJib3QiOjAsImlzTWVyY2hhbnQiOmZhbHNlLCJ2ZXJpZmllZEJhbmtBY2NvdW50IjpmYWxzZSwicGxheUV2ZW50TG9iYnkiOmZhbHNlLCJjdXN0b21lcklkIjozNTU2OTQzNzMsImFmZklkIjoiU3Vud2luIiwiYmFubmVkIjpmYWxzZSwiYnJhbmQiOiJzdW4ud2luIiwiZW1haWwiOiIiLCJ0aW1lc3RhbXAiOjE3ODMwNDU3OTI2NjIsImxvY2tHYW1lcyI6W10sImFtb3VudCI6MCwibG9ja0NoYXQiOmZhbHNlLCJwaG9uZVZlcmlmaWVkIjpmYWxzZSwiaXBBZGRyZXNzIjoiMjQwMjo4MDA6NjFhNjo4NGZiOmIwYmI6YjRjODo2ODYwOmI4ZjAiLCJtdXRlIjpmYWxzZSwiYXZhdGFyIjoiaHR0cHM6Ly9pbWFnZXMuc3dpbnNob3AubmV0L2ltYWdlcy9hdmF0YXIvYXZhdGFyXzE5LnBuZyIsInBsYXRmb3JtSWQiOjUsInVzZXJJZCI6IjFkZDM2YmIzLTMzNmEtNDI5Mi1iY2Q3LWFhYWZmOTIwMjRmNyIsImVtYWlsVmVyaWZpZWQiOm51bGwsInJlZ1RpbWUiOjE3ODI4OTAwOTMzNDgsInBob25lIjoiIiwiZGVwb3NpdCI6ZmFsc2UsInVzZXJuYW1lIjoiU0NfYm90dW9uZ2xldmkifQ.Wy2DyRueNW1rNVQKLo0D3ULegWaVcqlT87bSnNgJTWk\",\"locale\":\"vi\",\"userId\":\"1dd36bb3-336a-4292-bcd7-aaaff92024f7\",\"username\":\"SC_botuonglevi\",\"timestamp\":1783045792670,\"refreshToken\":\"347c7b8ff0f64e8f8637a964b8a7d645.b11bcc62e3e64ad6b0bcb7308ed58ba8\"}",
        "signature": "04C361BC9E27B6FF639196B61E0F0B1B9BAA627F09077EA7617C952220CCDB36497C6D267BCD59E0F2B74278D6F7A46798C2552107B3ECBA6220262F9FDE1B23A7CD6F5EEB4EE730159243C2773CC4F2A33893723AACD74A5E236CDB14602EFC0A21A58B30E108A8DB05C5CD3697A3F613454BE48CB540AC9CA08056A88446FE",
        }
    ],
    [6, "MiniGame", "taixiuPlugin", { cmd: 1005 }],
    [6, "MiniGame", "lobbyPlugin", { cmd: 10001 }]
];

let ws = null;
let pingInterval = null;
let reconnectTimeout = null;

function connectWebSocket() {
    if (ws) {
        ws.removeAllListeners();
        ws.close();
    }

    ws = new WebSocket(WEBSOCKET_URL, { headers: WS_HEADERS });

    ws.on('open', () => {
        console.log('[✅] WebSocket connected.');
        initialMessages.forEach((msg, i) => {
            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(msg));
                }
            }, i * 600);
        });

        clearInterval(pingInterval);
        pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.ping();
            }
        }, PING_INTERVAL);
    });

    ws.on('pong', () => {
        // console.log('[📶] Ping OK.');
    });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (!Array.isArray(data) || typeof data[1] !== 'object') return;
            const { cmd, sid, d1, d2, d3, gBB } = data[1];

            if (cmd === 1008 && sid) {
                currentSessionId = sid;
            }

            if (cmd === 1003 && gBB) {
                if (!d1 || !d2 || !d3) return;

                const total = d1 + d2 + d3;
                const result = (total > 10) ? "Tài" : "Xỉu";

                // Kiểm tra dự đoán cũ
                let predictionCorrect = false;
                if (lastPrediction && lastPrediction.ket_qua) {
                    predictionCorrect = (lastPrediction.ket_qua === result);
                    
                    // Update stats
                    stats.total++;
                    if (predictionCorrect) {
                        stats.correct++;
                        stats.consecutiveLosses = 0;
                    } else {
                        stats.wrong++;
                        stats.consecutiveLosses++;
                    }
                    
                    // Update model weights
                    analyzer.updateModelWeights(result, lastPrediction.ket_qua, lastPrediction.do_tin_cay);
                }

                // Lưu lịch sử phiên này
                const historyEntry = {
                    phien: currentSessionId,
                    Xuc_xac_1: d1,
                    Xuc_xac_2: d2,
                    Xuc_xac_3: d3,
                    Tong: total,
                    Ket_qua: result,
                    du_doan: lastPrediction ? lastPrediction.ket_qua : null,
                    loai_cau: lastPrediction ? lastPrediction.loai_cau : null,
                    do_tin_cay: lastPrediction ? lastPrediction.do_tin_cay : null,
                    thoi_gian: new Date().toISOString()
                };
                saveHistory(historyEntry);

                // Tạo mảng history cho analyzer
                const historyForAnalyzer = resultHistory.map(h => ({
                    score: h.Tong,
                    Ket_qua: h.Ket_qua,
                    Xuc_xac_1: h.Xuc_xac_1,
                    Xuc_xac_2: h.Xuc_xac_2,
                    Xuc_xac_3: h.Xuc_xac_3
                }));

                // Dự đoán cho phiên tiếp theo
                const ensembleResult = analyzer.ensembleModels(historyForAnalyzer);
                
                // Adjust for consecutive losses
                let finalPrediction = ensembleResult.prediction;
                let finalConfidence = ensembleResult.confidence;
                let finalType = ensembleResult.pattern_type;
                let finalPattern = ensembleResult.pattern;
                let finalReason = ensembleResult.reason;
                
                if (stats.consecutiveLosses >= 3) {
                    // Nếu thua 3 lần liên tiếp, đánh ngược lại
                    finalPrediction = finalPrediction === 'Tài' ? 'Xỉu' : 'Tài';
                    finalConfidence = 0.4;
                    finalType = 'CHỐNG ĐẢO (SAU ' + stats.consecutiveLosses + ' LẦN THUA)';
                    finalPattern = '';
                    finalReason = 'Chống đảo do thua liên tiếp';
                }

                // Lưu dự đoán cho phiên tiếp theo
                lastPrediction = {
                    phien: currentSessionId ? parseInt(currentSessionId) + 1 : null,
                    ket_qua: finalPrediction,
                    loai_cau: finalType,
                    mau_cau: finalPattern,
                    do_tin_cay: (finalConfidence * 100).toFixed(0) + '%'
                };

                // Trạng thái
                const trangThai = finalType.includes('CHỐNG') ? 'Chống đảo' :
                                 (finalType.includes('THEO') ? 'Đang theo kết quả' : 'Đang theo cầu');

                // Tỉ lệ
                const tiLe = stats.total > 0 ? ((stats.correct / stats.total) * 100).toFixed(1) + '%' : '0%';

                // Cập nhật API
                apiResponseData = {
                    "Phien": currentSessionId,
                    "Xuc_xac_1": d1,
                    "Xuc_xac_2": d2,
                    "Xuc_xac_3": d3,
                    "Tong": total,
                    "Ket_qua": result,
                    "Phien_hien_tai": currentSessionId ? parseInt(currentSessionId) + 1 : null,
                    "Du_doan": finalPrediction,
                    "Loai_cau": finalType,
                    "Mau_cau_phat_hien": finalPattern,
                    "Do_tin_cay": (finalConfidence * 100).toFixed(0) + '%',
                    "Trang_thai": trangThai,
                    "Ket_qua_du_doan": predictionCorrect ? '✅' : (stats.total > 0 ? '❌' : ''),
                    "Thong_ke": {
                        "tong": stats.total,
                        "dung": stats.correct,
                        "sai": stats.wrong,
                        "ti_le": tiLe
                    },
                    "id": "@nhan161019"
                };

                // Log
                console.log('\n' + '🟦'.repeat(20));
                console.log(`🎲 Phiên ${apiResponseData.Phien} | KQ: ${result}`);
                console.log(`📊 Lịch sử: ${historyForAnalyzer.slice(-12).map(h => h.Ket_qua).join(' ')}`);
                console.log(`🔍 Phát hiện: ${finalType} | Mẫu: ${finalPattern || '...'}`);
                console.log(`🤖 Dự đoán phiên ${apiResponseData.Phien_hien_tai}: ${finalPrediction} (${(finalConfidence * 100).toFixed(0)}%)`);
                console.log(`📊 ${ensembleResult.details.length} models tham gia | Top: ${ensembleResult.details.slice(0,3).map(d => d.model).join(', ')}`);
                console.log(`📈 Thống kê: Đúng ${stats.correct}/${stats.total} (${tiLe}) ${apiResponseData.Ket_qua_du_doan}`);
                if (stats.consecutiveLosses > 0) {
                    console.log(`⚠️ Thua liên tiếp: ${stats.consecutiveLosses}`);
                }
                console.log('🟦'.repeat(20) + '\n');

                lastResult = result;
                currentSessionId = null;
            }
        } catch (e) {
            console.error('[❌] Lỗi xử lý message:', e.message);
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`[🔌] WebSocket closed. Code: ${code}, Reason: ${reason.toString()}`);
        clearInterval(pingInterval);
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(connectWebSocket, RECONNECT_DELAY);
    });

    ws.on('error', (err) => {
        console.error('[❌] WebSocket error:', err.message);
        ws.close();
    });
}

// ==================== EXPRESS API ====================
app.get('/api/ditmemaysun', (req, res) => {
    res.json(apiResponseData);
});

app.get('/api/his', (req, res) => {
    const recent = resultHistory.slice(-20).reverse();
    
    res.json({
        success: true,
        total: resultHistory.length,
        data: recent,
        stats: {
            tong: stats.total,
            dung: stats.correct,
            sai: stats.wrong,
            ti_le: stats.total > 0 ? ((stats.correct / stats.total) * 100).toFixed(1) + '%' : '0%',
            consecutive_losses: stats.consecutiveLosses
        }
    });
});

app.get('/api/models', (req, res) => {
    // Trả về thông tin các model
    res.json({
        main_models: Object.keys(analyzer.modelWeights).length,
        sub_models: Object.keys(analyzer.subModels).length,
        mini_models: Object.keys(analyzer.miniModels).length,
        total: 21 + 42 + 21,
        weights: {
            main: analyzer.modelWeights,
            sub: analyzer.subModelWeights,
            mini: analyzer.miniModelWeights
        }
    });
});

app.get('/', (req, res) => {
    res.json(apiResponseData);
});

app.listen(PORT, () => {
    console.log(`[🌐] Server is running at http://localhost:${PORT}`);
    console.log(`[📁] History file: ${HISTORY_FILE}`);
    console.log(`[📁] Patterns file: ${PATTERNS_FILE}`);
    console.log(`[📁] Model weights file: ${MODEL_WEIGHTS_FILE}`);
    console.log(`[🤖] Total models: 21 main + 42 sub + 21 mini = 84 models`);
    console.log(`[🧠] Sub models có tư duy riêng về từng loại cầu:`);
    console.log(`     - Model 1-6: Chuyên cầu 1-1`);
    console.log(`     - Model 7-12: Chuyên cầu 2-2`);
    console.log(`     - Model 13-18: Chuyên cầu bệt`);
    console.log(`     - Model 19-24: Chuyên cầu 3-3`);
    console.log(`     - Model 25-30: Chuyên cầu 2-1-2 và 1-2-1`);
    console.log(`     - Model 31-36: Chuyên bẻ cầu và chuyển tiếp`);
    console.log(`     - Model 37-42: Chuyên phân tích tổng hợp`);
});

// ==================== START ====================
connectWebSocket();
