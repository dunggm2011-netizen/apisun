import fastify from "fastify";
import cors from "@fastify/cors";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import fetch from "node-fetch";

// --- CẤU HÌNH ---
const PORT = 3000;
const API_URL = "https://wtxmd52.tele68.com/v1/txmd5/sessions";

// --- GLOBAL STATE ---
let txHistory = []; 
let currentSessionId = null; 
let fetchInterval = null; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- UTILITIES TỐI ƯU ---
function parseLines(data) {
    if (!data || !Array.isArray(data.list)) return [];
    
    const sortedList = data.list.sort((a, b) => b.id - a.id);
    const arr = sortedList.map(item => ({
        session: item.id,
        dice: item.dices,
        total: item.point,
        result: item.resultTruyenThong,
        tx: item.point >= 11 ? 'T' : 'X',
        ketQua: item.resultTruyenThong || (item.point >= 11 ? 'TAI' : 'XIU') === 'TAI' ? 'TAI' : 'XIU'
    }));

    return arr.sort((a, b) => a.session - b.session);
}

// ============================================================
   ENGINE.JS — NORMAL (BẺ ĐẢO FULL) + LIVE RENDER (KHÔNG BẺ)
   ============================================================ */
const TEEngine = (() => {

  const groupRuns = (arr) => {
    if (!arr.length) return [];
    const out = [];
    let last = arr[0], count = 1;
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] === last) count++;
      else { out.push({ k: last, n: count }); last = arr[i]; count = 1; }
    }
    out.push({ k: last, n: count });
    return out;
  };

  class TaiXiuEngine {
    constructor() { this.history = []; this.max = 1000; }

    load(items) {
      this.history = [];
      for (const it of items) {
        // Hỗ trợ đồng bộ cả chuẩn T/X hoặc TAI/XIU
        let raw = it.resultTruyenThong || it.result || it.ketQua || it.tx;
        if (raw === 'T') raw = 'TAI';
        if (raw === 'X') raw = 'XIU';
        if (raw !== 'TAI' && raw !== 'XIU') continue;
        this.history.push(raw);
      }
      if (this.history.length > this.max) this.history = this.history.slice(-this.max);
    }

    matchPattern(pattern) {
      const c = this.history;
      const L = pattern.length;
      if (c.length < L + 3) return null;
      let tHit = 0, xHit = 0;
      for (let i = 0; i <= c.length - L - 1; i++) {
        let ok = true;
        for (let j = 0; j < L; j++) {
          if (c[i + j] !== pattern[j]) { ok = false; break; }
        }
        if (!ok) continue;
        if (i + L >= c.length) break;
        if (c[i + L] === 'TAI') tHit++; else xHit++;
      }
      const total = tHit + xHit;
      if (total < 3) return null;
      return {
        tai: tHit, xiu: xHit, total: total,
        confidence: Math.max(tHit, xHit) / total,
        suggest: tHit > xHit ? 'TAI' : (xHit > tHit ? 'XIU' : null)
      };
    }

    countRecent(n) {
      const c = this.history.slice(-n);
      let t = 0, x = 0;
      for (const v of c) if (v === 'TAI') t++; else x++;
      return { tai: t, xiu: x, total: c.length };
    }

    /* NHÓM NORMAL — BÁM CẦU + BẺ ĐẢO FULL (16 thuật toán) */
    cauBet() {
      const c = this.history;
      if (c.length < 8) return null;
      const last = c[c.length - 1];
      let streak = 1;
      for (let i = c.length - 2; i >= 0; i--) {
        if (c[i] === last) streak++;
        else break;
      }
      if (streak < 3) return null;
      let cont = 0, total = 0;
      for (let i = streak; i < c.length; i++) {
        let s = 1;
        for (let j = i - 1; j > 0; j--) {
          if (c[j] === c[j - 1]) s++;
          else break;
        }
        if (s >= streak) {
          total++;
          if (c[i] === c[i - 1]) cont++;
        }
      }
      if (total < 3) return null;
      const pCont = cont / total;
      if (streak >= 5) {
        return { confidence: Math.min(0.85, 0.55 + (streak - 5) * 0.05 + (1 - pCont) * 0.3),
                 suggest: last === 'TAI' ? 'XIU' : 'TAI' };
      }
      if (pCont > 0.55) return { confidence: pCont, suggest: last };
      if (pCont < 0.45) return { confidence: 1 - pCont, suggest: last === 'TAI' ? 'XIU' : 'TAI' };
      return null;
    }

    cau11() {
      const c = this.history;
      if (c.length < 8) return null;
      const win = c.slice(-6);
      let flips = 0;
      for (let i = 1; i < win.length; i++) if (win[i] !== win[i - 1]) flips++;
      if (flips < 5) return null;
      let cont = 0, total = 0;
      for (let i = 6; i < c.length; i++) {
        let ok = true;
        for (let j = 1; j < 6; j++) {
          if (c[i - 6 + j] === c[i - 6 + j - 1]) { ok = false; break; }
        }
        if (ok) {
          total++;
          if (c[i] !== c[i - 1]) cont++;
        }
      }
      const pCont = total >= 3 ? cont / total : 0.6;
      return { confidence: pCont, suggest: c[c.length - 1] === 'TAI' ? 'XIU' : 'TAI' };
    }

    cau22() { return this.cauNN(2); }
    cau33() { return this.cauNN(3); }
    cau44() { return this.cauNN(4); }

    cauNN(n) {
      const c = this.history;
      const need = n * 4;
      if (c.length < need) return null;
      const groupsAll = groupRuns(c.slice(-need));
      if (groupsAll.length < 4) return null;
      const recent4 = groupsAll.slice(-4);
      let valid = true;
      for (let i = 0; i < recent4.length; i++) {
        if (recent4[i].n !== n) { valid = false; break; }
      }
      if (!valid) return null;
      for (let i = 1; i < recent4.length; i++) {
        if (recent4[i].k === recent4[i - 1].k) { valid = false; break; }
      }
      if (!valid) return null;
      const lastG = recent4[recent4.length - 1];
      if (lastG.n === n) {
        return { confidence: 0.78, suggest: lastG.k === 'TAI' ? 'XIU' : 'TAI' };
      }
      return { confidence: 0.72, suggest: lastG.k };
    }

    cauNghieng() {
      const c = this.history;
      if (c.length < 20) return null;
      const win = c.slice(-20);
      let t = 0, x = 0;
      for (const v of win) if (v === 'TAI') t++; else x++;
      const ratio = t / win.length;
      if (ratio > 0.68) return { confidence: Math.min(0.82, ratio), suggest: 'TAI' };
      if (ratio < 0.32) return { confidence: Math.min(0.82, 1 - ratio), suggest: 'XIU' };
      return null;
    }

    cauBe() {
      const c = this.history;
      if (c.length < 15) return null;
      let broke = 0, total = 0;
      for (let i = 4; i < c.length - 1; i++) {
        let s = 1;
        for (let j = i - 1; j > 0; j--) {
          if (c[j] === c[j - 1]) s++;
          else break;
        }
        if (s >= 4 && s <= 7) {
          total++;
          if (c[i] !== c[i - 1]) broke++;
        }
      }
      if (total < 4) return null;
      const pBreak = broke / total;
      let cur = 1;
      for (let i = c.length - 1; i > 0; i--) {
        if (c[i] === c[i - 1]) cur++;
        else break;
      }
      if (cur < 4) return null;
      if (cur >= 5 && pBreak > 0.5) {
        return { confidence: pBreak, suggest: c[c.length - 1] === 'TAI' ? 'XIU' : 'TAI' };
      }
      if (cur >= 4 && pBreak < 0.4) {
        return { confidence: 1 - pBreak, suggest: c[c.length - 1] };
      }
      return null;
    }

    cauGay() {
      const c = this.history;
      if (c.length < 20) return null;
      const groups = groupRuns(c.slice(-20));
      if (groups.length < 6) return null;
      const last3 = groups.slice(-3);
      if (last3[0].n >= 3 && last3[1].n <= 2 && last3[2].n >= 3 && last3[0].k !== last3[2].k) {
        return { confidence: 0.7, suggest: last3[2].k === 'TAI' ? 'XIU' : 'TAI' };
      }
      if (last3[0].n <= 2 && last3[1].n >= 3 && last3[2].n <= 2) {
        return { confidence: 0.68, suggest: last3[2].k };
      }
      return null;
    }

    cauDao() {
      const c = this.history;
      if (c.length < 10) return null;
      const win = c.slice(-10);
      let flips = 0;
      for (let i = 1; i < win.length; i++) if (win[i] !== win[i - 1]) flips++;
      if (flips < 8) return null;
      let cont = 0, total = 0;
      for (let i = 10; i < c.length; i++) {
        let ok = true;
        for (let j = 1; j < 10; j++) {
          if (c[i - 10 + j] === c[i - 10 + j - 1]) { ok = false; break; }
        }
        if (ok) {
          total++;
          if (c[i] !== c[i - 1]) cont++;
        }
      }
      const pCont = total >= 3 ? cont / total : 0.7;
      return { confidence: pCont, suggest: c[c.length - 1] === 'TAI' ? 'XIU' : 'TAI' };
    }

    cauSoLe() {
      const c = this.history;
      if (c.length < 16) return null;
      const groups = groupRuns(c.slice(-15));
      if (groups.length < 6) return null;
      const last6 = groups.slice(-6);
      const pat1 = [2, 1, 2, 1, 2, 1];
      const pat2 = [1, 2, 1, 2, 1, 2];
      const ns = last6.map(g => g.n);
      const matchPat1 = ns.every((v, i) => v === pat1[i]);
      const matchPat2 = ns.every((v, i) => v === pat2[i]);
      if (matchPat1 || matchPat2) {
        const lastG = groups[groups.length - 1];
        const nextN = matchPat1 ? 2 : 1;
        if (lastG.n < nextN) return { confidence: 0.72, suggest: lastG.k };
        return { confidence: 0.72, suggest: lastG.k === 'TAI' ? 'XIU' : 'TAI' };
      }
      return null;
    }

    bamBetDai() {
      const c = this.history;
      if (c.length < 12) return null;
      const last = c[c.length - 1];
      let streak = 1;
      for (let i = c.length - 2; i >= 0; i--) {
        if (c[i] === last) streak++;
        else break;
      }
      if (streak < 8) return null;
      let cont = 0, total = 0;
      for (let i = 8; i < c.length; i++) {
        let s = 1;
        for (let j = i - 1; j > 0; j--) {
          if (c[j] === c[j - 1]) s++;
          else break;
        }
        if (s >= 8) {
          total++;
          if (c[i] === c[i - 1]) cont++;
        }
      }
      if (total < 2) return null;
      const pCont = cont / total;
      const decay = Math.max(0.35, 1 - (streak - 8) * 0.08);
      if (pCont * decay > 0.5) return { confidence: pCont * decay, suggest: last };
      return { confidence: 1 - pCont * decay, suggest: last === 'TAI' ? 'XIU' : 'TAI' };
    }

    cau321() {
      const c = this.history;
      if (c.length < 15) return null;
      const groups = groupRuns(c.slice(-12));
      if (groups.length < 3) return null;
      const last3 = groups.slice(-3);
      const ns = last3.map(g => g.n);
      const decreasing = ns[0] > ns[1] && ns[1] > ns[2];
      const increasing = ns[0] < ns[1] && ns[1] < ns[2];
      if (decreasing) return { confidence: 0.65, suggest: last3[2].k === 'TAI' ? 'XIU' : 'TAI' };
      if (increasing) return { confidence: 0.68, suggest: last3[2].k };
      return null;
    }

    cauDoiXung() {
      const c = this.history;
      if (c.length < 12) return null;
      const a = c.slice(-12, -6);
      const b = c.slice(-6);
      let mirror = true;
      for (let i = 0; i < 6; i++) {
        const oppA = a[i] === 'TAI' ? 'XIU' : 'TAI';
        if (b[i] !== oppA) { mirror = false; break; }
      }
      if (mirror) return { confidence: 0.7, suggest: b[0] };
      return null;
    }

    cauDauCuoi() {
      const c = this.history;
      if (c.length < 16) return null;
      const last8 = c.slice(-8);
      const prev8 = c.slice(-16, -8);
      let same = 0;
      for (let i = 0; i < 8; i++) if (last8[i] === prev8[i]) same++;
      if (same >= 6) return { confidence: 0.72, suggest: last8[0] };
      return null;
    }

    cauDaoFull() {
      const c = this.history;
      if (c.length < 6) return null;
      const win = c.slice(-6);
      let flips = 0;
      for (let i = 1; i < win.length; i++) if (win[i] !== win[i - 1]) flips++;
      if (flips >= 4) {
        return { confidence: Math.min(0.85, 0.55 + flips * 0.04),
                 suggest: c[c.length - 1] === 'TAI' ? 'XIU' : 'TAI' };
      }
      return null;
    }

    cauBreakStreak() {
      const c = this.history;
      if (c.length < 6) return null;
      const last = c[c.length - 1];
      let streak = 1;
      for (let i = c.length - 2; i >= 0 && c[i] === last; i--) streak++;
      if (streak < 2) return null;
      const conf = Math.min(0.85, 0.48 + streak * 0.06);
      return { confidence: conf, suggest: last === 'TAI' ? 'XIU' : 'TAI' };
    }

    /* NHÓM 2 — PATTERN MATCHING */
    nGramMatch() {
      const c = this.history;
      if (c.length < 20) return null;
      let best = null;
      for (let L = Math.min(12, Math.floor(c.length / 2)); L >= 4; L--) {
        const stats = this.matchPattern(c.slice(-L));
        if (stats && stats.suggest && stats.total >= 4) {
          const score = stats.confidence * Math.log(stats.total + 1) + L * 0.02;
          if (!best || score > best.score) best = { ...stats, length: L, score };
        }
      }
      return best ? { confidence: best.confidence, suggest: best.suggest } : null;
    }
    nGram3() {
      const c = this.history;
      if (c.length < 12) return null;
      const stats = this.matchPattern(c.slice(-3));
      if (!stats || !stats.suggest || stats.total < 3) return null;
      return { confidence: stats.confidence, suggest: stats.suggest };
    }
    nGram5() {
      const c = this.history;
      if (c.length < 15) return null;
      const stats = this.matchPattern(c.slice(-5));
      if (!stats || !stats.suggest || stats.total < 3) return null;
      return { confidence: stats.confidence, suggest: stats.suggest };
    }
    nGram8() {
      const c = this.history;
      if (c.length < 25) return null;
      const stats = this.matchPattern(c.slice(-8));
      if (!stats || !stats.suggest || stats.total < 3) return null;
      return { confidence: stats.confidence, suggest: stats.suggest };
    }
    markov1() {
      const c = this.history;
      if (c.length < 15) return null;
      const last = c[c.length - 1];
      let tAfterT = 0, xAfterT = 0, tAfterX = 0, xAfterX = 0;
      for (let i = 1; i < c.length; i++) {
        if (c[i - 1] === 'TAI') {
          if (c[i] === 'TAI') tAfterT++; else xAfterT++;
        } else {
          if (c[i] === 'TAI') tAfterX++; else xAfterX++;
        }
      }
      let p, suggest;
      if (last === 'TAI') {
        const total = tAfterT + xAfterT;
        if (total < 5) return null;
        p = tAfterT / total;
        suggest = p > 0.5 ? 'TAI' : 'XIU';
      } else {
        const total = tAfterX + xAfterX;
        if (total < 5) return null;
        p = xAfterX / total;
        suggest = p > 0.5 ? 'XIU' : 'TAI';
      }
      const conf = Math.abs(p - 0.5) * 2;
      if (conf < 0.1) return null;
      return { confidence: conf, suggest };
    }
    markov2() {
      const c = this.history;
      if (c.length < 20) return null;
      const last2 = c.slice(-2).join('');
      let tHit = 0, xHit = 0;
      for (let i = 2; i < c.length; i++) {
        if (c.slice(i - 2, i).join('') === last2) {
          if (c[i] === 'TAI') tHit++; else xHit++;
        }
      }
      const total = tHit + xHit;
      if (total < 4) return null;
      const p = Math.max(tHit, xHit) / total;
      return { confidence: p, suggest: tHit > xHit ? 'TAI' : 'XIU' };
    }
    markov3() {
      const c = this.history;
      if (c.length < 25) return null;
      const last3 = c.slice(-3).join('');
      let tHit = 0, xHit = 0;
      for (let i = 3; i < c.length; i++) {
        if (c.slice(i - 3, i).join('') === last3) {
          if (c[i] === 'TAI') tHit++; else xHit++;
        }
      }
      const total = tHit + xHit;
      if (total < 3) return null;
      const p = Math.max(tHit, xHit) / total;
      return { confidence: p, suggest: tHit > xHit ? 'TAI' : 'XIU' };
    }
    knn() {
      const c = this.history;
      const W = 6;
      if (c.length < W + 15) return null;
      const cur = c.slice(-W);
      const matches = [];
      for (let i = 0; i <= c.length - W - 1; i++) {
        let same = 0;
        for (let j = 0; j < W; j++) if (c[i + j] === cur[j]) same++;
        if (same >= W - 1) matches.push({ sim: same, next: c[i + W] });
      }
      if (matches.length < 4) return null;
      matches.sort((a, b) => b.sim - a.sim);
      const top = matches.slice(0, 15);
      let t = 0, x = 0;
      for (const m of top) if (m.next === 'TAI') t++; else x++;
      const p = Math.max(t, x) / top.length;
      return { confidence: p, suggest: t > x ? 'TAI' : 'XIU' };
    }

    /* NHÓM 3 — THỐNG KÊ / XÁC SUẤT */
    bayesian() {
      const c = this.history;
      if (c.length < 20) return null;
      const last = c[c.length - 1];
      const opp = last === 'TAI' ? 'XIU' : 'TAI';
      let cA = 0, cAB = 0;
      for (let i = 0; i < c.length; i++) {
        if (c[i] === last) cA++;
        if (i > 0 && c[i - 1] === last && c[i] === opp) cAB++;
      }
      if (cA < 5) return null;
      const pOpp = cAB / cA;
      const conf = Math.abs(pOpp - 0.5) * 2;
      if (conf < 0.1) return null;
      return { confidence: conf, suggest: pOpp > 0.5 ? opp : last };
    }
    trend15() {
      const c = this.history;
      if (c.length < 15) return null;
      const { tai } = this.countRecent(15);
      const ratio = tai / 15;
      if (ratio > 0.6) return { confidence: 0.62, suggest: 'XIU' };
      if (ratio < 0.4) return { confidence: 0.62, suggest: 'TAI' };
      return null;
    }
    trend30() {
      const c = this.history;
      if (c.length < 30) return null;
      const { tai } = this.countRecent(30);
      const ratio = tai / 30;
      if (ratio > 0.62) return { confidence: 0.65, suggest: 'XIU' };
      if (ratio < 0.38) return { confidence: 0.65, suggest: 'TAI' };
      return null;
    }
    fibo() {
      const c = this.history;
      if (c.length < 20) return null;
      const { tai } = this.countRecent(20);
      const ratio = tai / 20;
      if (ratio > 0.618) return { confidence: 0.7, suggest: 'XIU' };
      if (ratio < 0.382) return { confidence: 0.7, suggest: 'TAI' };
      return null;
    }
    entropyAlgo() {
      const c = this.history;
      if (c.length < 20) return null;
      const { tai, xiu, total } = this.countRecent(20);
      const pT = tai / total, pX = xiu / total;
      let H = 0;
      if (pT > 0) H -= pT * Math.log2(pT);
      if (pX > 0) H -= pX * Math.log2(pX);
      if (H > 0.95) return null;
      return { confidence: 1 - H, suggest: pT > pX ? 'TAI' : 'XIU' };
    }
    adaptive() {
      const c = this.history;
      if (c.length < 20) return null;
      const win = c.slice(-20);
      const { tai } = this.countRecent(20);
      const ratio = tai / 20;
      let variance = 0;
      for (const v of win) variance += Math.pow((v === 'TAI' ? 1 : 0) - ratio, 2);
      variance /= win.length;
      if (variance < 0.15) return null;
      return { confidence: Math.min(0.85, variance * 2), suggest: ratio > 0.5 ? 'XIU' : 'TAI' };
    }

    /* NHÓM 4 — MOMENTUM */
    momentum() {
      const c = this.history;
      if (c.length < 15) return null;
      let sT = 0, sX = 0;
      for (let i = Math.max(0, c.length - 15); i < c.length; i++) {
        const w = Math.exp(-(c.length - 1 - i) / 5);
        if (c[i] === 'TAI') sT += w; else sX += w;
      }
      const total = sT + sX;
      if (total < 1) return null;
      const pT = sT / total;
      const conf = Math.abs(pT - 0.5) * 2;
      if (conf < 0.08) return null;
      return { confidence: conf, suggest: pT > 0.5 ? 'TAI' : 'XIU' };
    }
    wma12() {
      const c = this.history;
      if (c.length < 12) return null;
      let sT = 0, wSum = 0;
      for (let i = 0; i < 12; i++) {
        const w = i + 1;
        wSum += w;
        if (c[c.length - 12 + i] === 'TAI') sT += w;
      }
      const pT = sT / wSum;
      const conf = Math.abs(pT - 0.5) * 2;
      if (conf < 0.1) return null;
      return { confidence: conf, suggest: pT > 0.5 ? 'TAI' : 'XIU' };
    }
    ema12() {
      const c = this.history;
      if (c.length < 12) return null;
      const alpha = 0.3;
      let ema = c[0] === 'TAI' ? 1 : 0;
      for (let i = 1; i < c.length; i++) {
        const v = c[i] === 'TAI' ? 1 : 0;
        ema = alpha * v + (1 - alpha) * ema;
      }
      const conf = Math.abs(ema - 0.5) * 2;
      if (conf < 0.1) return null;
      return { confidence: conf, suggest: ema > 0.5 ? 'TAI' : 'XIU' };
    }
    neural() {
      const c = this.history;
      if (c.length < 15) return null;
      const W = 10;
      const weights = [0.4, 0.6, 0.9, 1.2, 1.5, 1.2, 0.9, 0.6, 0.4, 0.3];
      let s = 0;
      for (let i = 0; i < W; i++) {
        const v = c[c.length - W + i] === 'TAI' ? 1 : -1;
        s += v * weights[i];
      }
      const sig = 1 / (1 + Math.exp(-s));
      const conf = Math.abs(sig - 0.5) * 2;
      if (conf < 0.1) return null;
      return { confidence: conf, suggest: sig > 0.5 ? 'TAI' : 'XIU' };
    }
    recurrent() {
      const c = this.history;
      if (c.length < 20) return null;
      const W = 8;
      const cur = c.slice(-W);
      let sT = 0, sX = 0, total = 0;
      for (let i = 0; i <= c.length - W - 1; i++) {
        let sim = 0;
        for (let j = 0; j < W; j++) if (c[i + j] === cur[j]) sim++;
        if (sim < W - 2) continue;
        const weight = Math.pow(2, sim - (W - 2));
        if (c[i + W] === 'TAI') sT += weight; else sX += weight;
        total++;
      }
      if (total < 3 || sT + sX < 1) return null;
      const pT = sT / (sT + sX);
      const conf = Math.abs(pT - 0.5) * 2;
      if (conf < 0.1) return null;
      return { confidence: conf, suggest: pT > 0.5 ? 'TAI' : 'XIU' };
    }

    /* NHÓM 5 — VOLATILITY */
    volatility() {
      const c = this.history;
      if (c.length < 25) return null;
      const win = c.slice(-25);
      let changes = 0;
      for (let i = 1; i < win.length; i++) if (win[i] !== win[i - 1]) changes++;
      const ratio = changes / (win.length - 1);
      const last = c[c.length - 1];
      const opp = last === 'TAI' ? 'XIU' : 'TAI';
      if (ratio > 0.7) return { confidence: Math.min(0.75, ratio), suggest: last };
      if (ratio < 0.3) return { confidence: Math.min(0.75, 1 - ratio), suggest: opp };
      return null;
    }
    cluster() {
      const c = this.history;
      if (c.length < 30) return null;
      const win = c.slice(-30);
      const groups = groupRuns(win);
      if (groups.length < 5) return null;
      const avgRun = win.length / groups.length;
      const lastG = groups[groups.length - 1];
      if (lastG.n >= avgRun * 2.5) {
        return { confidence: 0.72, suggest: lastG.k === 'TAI' ? 'XIU' : 'TAI' };
      }
      return null;
    }
    zigzag() {
      const c = this.history;
      if (c.length < 12) return null;
      const win = c.slice(-12);
      let zig = 0, zag = 0;
      for (let i = 1; i < win.length; i++) {
        if (win[i] !== win[i - 1]) {
          if (win[i - 1] === 'TAI') zig++; else zag++;
        }
      }
      if (zig >= 4 || zag >= 4) {
        return { confidence: 0.68, suggest: c[c.length - 1] === 'TAI' ? 'XIU' : 'TAI' };
      }
      return null;
    }

    /* NHÓM LIVE RENDER — KHÔNG BẺ (16 thuật toán) */
    liveCauBet() {
      const c = this.history;
      if (c.length < 5) return null;
      const last = c[c.length - 1];
      let streak = 1;
      for (let i = c.length - 2; i >= 0 && c[i] === last; i--) streak++;
      if (streak < 2) return null;
      if (streak >= 9) return { confidence: 0.55, suggest: last };
      if (streak >= 6) return { confidence: 0.65, suggest: last };
      if (streak >= 4) return { confidence: 0.75, suggest: last };
      return { confidence: 0.62, suggest: last };
    }
    liveCau11() {
      const c = this.history;
      if (c.length < 4) return null;
      const win = c.slice(-4);
      let flips = 0;
      for (let i = 1; i < win.length; i++) if (win[i] !== win[i - 1]) flips++;
      if (flips < 3) return null;
      return { confidence: 0.72, suggest: c[c.length - 1] === 'TAI' ? 'XIU' : 'TAI' };
    }
    liveCauNN(n) {
      const c = this.history;
      if (c.length < n * 3) return null;
      const groups = groupRuns(c.slice(-n * 3));
      if (groups.length < 3) return null;
      const recent = groups.slice(-3);
      for (const g of recent) if (g.n !== n) return null;
      const lastG = recent[recent.length - 1];
      return { confidence: 0.7, suggest: lastG.k === 'TAI' ? 'XIU' : 'TAI' };
    }
    liveFollowDai() {
      const c = this.history;
      if (c.length < 6) return null;
      const last = c[c.length - 1];
      let streak = 1;
      for (let i = c.length - 2; i >= 0 && c[i] === last; i--) streak++;
      if (streak < 4) return null;
      const conf = Math.min(0.82, 0.6 + streak * 0.03);
      return { confidence: conf, suggest: last };
    }
    liveNGram() {
      const c = this.history;
      if (c.length < 8) return null;
      for (let L = Math.min(8, Math.floor(c.length / 2)); L >= 3; L--) {
        const stats = this.matchPattern(c.slice(-L));
        if (stats && stats.suggest && stats.total >= 2) {
          return { confidence: stats.confidence, suggest: stats.suggest };
        }
      }
      return null;
    }
    liveMomentum() {
      const c = this.history;
      if (c.length < 6) return null;
      let sT = 0, sX = 0;
      for (let i = Math.max(0, c.length - 8); i < c.length; i++) {
        const w = Math.exp(-(c.length - 1 - i) / 2.5);
        if (c[i] === 'TAI') sT += w; else sX += w;
      }
      const total = sT + sX;
      if (total < 0.3) return null;
      const pT = sT / total;
      const conf = Math.abs(pT - 0.5) * 2;
      if (conf < 0.05) return null;
      return { confidence: conf, suggest: pT > 0.5 ? 'TAI' : 'XIU' };
    }
    liveStreak() {
      const c = this.history;
      if (c.length < 8) return null;
      const groups = groupRuns(c.slice(-15));
      if (groups.length < 2) return null;
      const lastG = groups[groups.length - 1];
      const prevGroups = groups.slice(0, -1).slice(-5);
      if (!prevGroups.length) return null;
      const avgLen = prevGroups.reduce((a, g) => a + g.n, 0) / prevGroups.length;
      if (lastG.n < avgLen * 0.7) return { confidence: 0.65, suggest: lastG.k };
      if (lastG.n < avgLen * 1.5) return { confidence: 0.72, suggest: lastG.k };
      return { confidence: 0.6, suggest: lastG.k };
    }
    liveMarkov() {
      const c = this.history;
      if (c.length < 8) return null;
      const last2 = c.slice(-2).join('');
      let tHit = 0, xHit = 0;
      for (let i = 2; i < c.length; i++) {
        if (c.slice(i - 2, i).join('') === last2) {
          if (c[i] === 'TAI') tHit++; else xHit++;
        }
      }
      const total = tHit + xHit;
      if (total < 2) return null;
      const p = Math.max(tHit, xHit) / total;
      if (p < 0.55) return null;
      return { confidence: p, suggest: tHit > xHit ? 'TAI' : 'XIU' };
    }
    livePattern11() {
      const c = this.history;
      if (c.length < 6) return null;
      const win = c.slice(-5);
      let flips = 0;
      for (let i = 1; i < win.length; i++) if (win[i] !== win[i - 1]) flips++;
      if (flips < 4) return null;
      return { confidence: 0.72, suggest: c[c.length - 1] === 'TAI' ? 'XIU' : 'TAI' };
    }
    liveFollowTrend() {
      const c = this.history;
      if (c.length < 12) return null;
      const { tai } = this.countRecent(12);
      const ratio = tai / 12;
      if (ratio > 0.6) return { confidence: 0.65, suggest: 'TAI' };
      if (ratio < 0.4) return { confidence: 0.65, suggest: 'XIU' };
      return null;
    }
    liveVolatility() {
      const c = this.history;
      if (c.length < 12) return null;
      const win = c.slice(-12);
      let changes = 0;
      for (let i = 1; i < win.length; i++) if (win[i] !== win[i - 1]) changes++;
      const ratio = changes / (win.length - 1);
      const last = c[c.length - 1];
      if (ratio > 0.7) return { confidence: 0.7, suggest: last === 'TAI' ? 'XIU' : 'TAI' };
      if (ratio < 0.35) return { confidence: 0.7, suggest: last };
      return null;
    }
    livePattern() {
      const c = this.history;
      if (c.length < 8) return null;
      for (const L of [5, 4, 3]) {
        if (c.length < L + 3) continue;
        const stats = this.matchPattern(c.slice(-L));
        if (stats && stats.suggest && stats.total >= 2) {
          return { confidence: stats.confidence, suggest: stats.suggest };
        }
      }
      return null;
    }
    liveKnn() {
      const c = this.history;
      const W = 4;
      if (c.length < W + 8) return null;
      const cur = c.slice(-W);
      const matches = [];
      for (let i = 0; i <= c.length - W - 1; i++) {
        let same = 0;
        for (let j = 0; j < W; j++) if (c[i + j] === cur[j]) same++;
        if (same >= W - 1) matches.push({ sim: same, next: c[i + W] });
      }
      if (matches.length < 3) return null;
      matches.sort((a, b) => b.sim - a.sim);
      const top = matches.slice(0, 10);
      let t = 0, x = 0;
      for (const m of top) if (m.next === 'TAI') t++; else x++;
      const p = Math.max(t, x) / top.length;
      return { confidence: p, suggest: t > x ? 'TAI' : 'XIU' };
    }
    liveEntropy() {
      const c = this.history;
      if (c.length < 12) return null;
      const { tai, xiu, total } = this.countRecent(12);
      const pT = tai / total, pX = xiu / total;
      let H = 0;
      if (pT > 0) H -= pT * Math.log2(pT);
      if (pX > 0) H -= pX * Math.log2(pX);
      if (H > 0.9) return null;
      return { confidence: 1 - H, suggest: pT > pX ? 'TAI' : 'XIU' };
    }
    liveAdaptive() {
      const c = this.history;
      if (c.length < 10) return null;
      const win = c.slice(-10);
      const { tai } = this.countRecent(10);
      const ratio = tai / 10;
      let variance = 0;
      for (const v of win) variance += Math.pow((v === 'TAI' ? 1 : 0) - ratio, 2);
      variance /= win.length;
      if (variance < 0.12) return null;
      return { confidence: Math.min(0.8, variance * 2), suggest: ratio > 0.5 ? 'TAI' : 'XIU' };
    }
    livePattern6() {
      const c = this.history;
      if (c.length < 12) return null;
      const stats = this.matchPattern(c.slice(-6));
      if (!stats || !stats.suggest || stats.total < 2) return null;
      return { confidence: stats.confidence, suggest: stats.suggest };
    }

    predict(mode = 'normal') {
      const algos = mode === 'live' ? [
        () => this.liveCauBet(), () => this.liveCau11(), () => this.liveCauNN(2), () => this.liveCauNN(3),
        () => this.liveFollowDai(), () => this.liveNGram(), () => this.liveMomentum(), () => this.liveStreak(),
        () => this.liveMarkov(), () => this.livePattern11(), () => this.liveFollowTrend(), () => this.liveVolatility(),
        () => this.livePattern(), () => this.liveKnn(), () => this.liveEntropy(), () => this.liveAdaptive(), () => this.livePattern6()
      ] : [
        () => this.cauBet(), () => this.cau11(), () => this.cau22(), () => this.cau33(), () => this.cau44(),
        () => this.cauNghieng(), () => this.cauBe(), () => this.cauGay(), () => this.cauDao(), () => this.cauSoLe(),
        () => this.bamBetDai(), () => this.cau321(), () => this.cauDoiXung(), () => this.cauDauCuoi(), () => this.cauDaoFull(), () => this.cauBreakStreak(),
        () => this.nGramMatch(), () => this.nGram3(), () => this.nGram5(), () => this.nGram8(),
        () => this.markov1(), () => this.markov2(), () => this.markov3(), () => this.knn(),
        () => this.bayesian(), () => this.trend15(), () => this.trend30(), () => this.fibo(), () => this.entropyAlgo(), () => this.adaptive(),
        () => this.momentum(), () => this.wma12(), () => this.ema12(), () => this.neural(), () => this.recurrent(),
        () => this.volatility(), () => this.cluster(), () => this.zigzag()
      ];

      let scoreTai = 0, scoreXiu = 0, totalWeight = 0;
      let details = [];

      for (const fn of algos) {
        try {
          const res = fn.call(this);
          if (res && res.suggest && res.confidence > 0) {
            const w = res.confidence;
            // Chuyển đổi TAI/XIU thành chuẩn T/X tương thích hệ thống cũ nếu cần
            const shortKey = res.suggest === 'TAI' ? 'T' : 'X';
            if (res.suggest === 'TAI') scoreTai += w;
            else scoreXiu += w;
            totalWeight += w;
            details.push({ suggest: shortKey, confidence: res.confidence });
          }
        } catch (e) {}
      }

      if (totalWeight === 0) return null;

      const pTai = scoreTai / totalWeight;
      const pXiu = scoreXiu / totalWeight;
      const bestSuggest = pTai > pXiu ? 'T' : 'X';
      const confidence = Math.max(pTai, pXiu);

      return { prediction: bestSuggest, confidence, scoreTai, scoreXiu, totalWeight };
    }
  }

  return { TaiXiuEngine };

})();

const engineInstance = new TEEngine.TaiXiuEngine();

// --- FASTIFY SERVER SETUP ---
const app = fastify({ logger: false });
app.register(cors, { origin: true });

// Hàm fetch dữ liệu và chạy ensemble dự đoán mới
async function fetchAndAnalyze() {
    try {
        const response = await fetch(API_URL);
        const json = await response.json();
        const parsed = parseLines(json);
        
        if (parsed.length > 0) {
            txHistory = parsed;
            currentSessionId = parsed[parsed.length - 1].session;
            
            // Nạp dữ liệu vào bộ máy 38 thuật toán
            engineInstance.load(parsed);
        }
    } catch (err) {
        console.error("Lỗi kết nối API:", err.message);
    }
}

// Endpoint trả kết quả dự đoán tích hợp
app.get("/api/predict", async (request, reply) => {
    if (txHistory.length === 0) {
        await fetchAndAnalyze();
    }

    const mode = request.query.mode || 'normal';
    const result = engineInstance.predict(mode);

    return {
        success: true,
        currentSession: currentSessionId,
        historyLength: txHistory.length,
        mode: mode,
        prediction: result ? result.prediction : null,
        confidence: result ? result.confidence : 0,
        stats: result ? { taiScore: result.scoreTai, xiuScore: result.scoreXiu } : null
    };
});

// Khởi động server
const start = async () => {
    try {
        await fetchAndAnalyze();
        fetchInterval = setInterval(fetchAndAnalyze, 5000); // Tự động cập nhật mỗi 5s
        
        await app.listen({ port: PORT, host: '0.0.0.0' });
        console.log(`ZTrongz Server đang chạy tại cổng ${PORT}`);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

start();
