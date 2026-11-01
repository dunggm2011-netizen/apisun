import fastify from "fastify";
import cors from "@fastify/cors";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// --- CẤU HÌNH ---
const PORT = 3000;
const API_URL = "https://wtxmd52.tele68.com/v1/txmd5/sessions";

// --- UTILITIES & ENGINE TOOLKIEMLUA (TEEngine) ---
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
        const r = it.resultTruyenThong || it.result || it.ketQua;
        if (r !== 'TAI' && r !== 'XIU') continue;
        this.history.push(r);
      }
      if (this.history.length > this.max) this.history = this.history.slice(-this.max);
    }

    pushRecord(rName) {
        if (rName === 'TAI' || rName === 'XIU') {
            this.history.push(rName);
            if (this.history.length > this.max) this.history = this.history.slice(-this.max);
        }
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

    // --- THUẬT TOÁN BÁM CẦU & BẺ ĐẢO (NORMAL ENGINE) ---
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

    entropy() {
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

    predict() {
      const algos = [
        { name: 'cauBreakStreak', w: 3.6, r: this.cauBreakStreak() },
        { name: 'cauDaoFull',     w: 3.4, r: this.cauDaoFull() },
        { name: 'cauBe',          w: 3.4, r: this.cauBe() },
        { name: 'cauDao',         w: 3.2, r: this.cauDao() },
        { name: 'cauBet',         w: 3.2, r: this.cauBet() },
        { name: 'bamBetDai',      w: 3.2, r: this.bamBetDai() },
        { name: 'cau11',          w: 3.0, r: this.cau11() },
        { name: 'cau22',          w: 3.1, r: this.cau22() },
        { name: 'cau33',          w: 3.1, r: this.cau33() },
        { name: 'cau44',          w: 2.9, r: this.cau44() },
        { name: 'cauNghieng',     w: 2.7, r: this.cauNghieng() },
        { name: 'cauGay',         w: 2.8, r: this.cauGay() },
        { name: 'cauSoLe',        w: 2.8, r: this.cauSoLe() },
        { name: 'cau321',         w: 2.6, r: this.cau321() },
        { name: 'cauDoiXung',     w: 2.7, r: this.cauDoiXung() },
        { name: 'cauDauCuoi',     w: 2.7, r: this.cauDauCuoi() },
        { name: 'nGramMatch',     w: 3.3, r: this.nGramMatch() },
        { name: 'nGram3',         w: 2.8, r: this.nGram3() },
        { name: 'nGram5',         w: 3.0, r: this.nGram5() },
        { name: 'nGram8',         w: 3.1, r: this.nGram8() },
        { name: 'markov1',        w: 2.6, r: this.markov1() },
        { name: 'markov2',        w: 2.9, r: this.markov2() },
        { name: 'markov3',        w: 2.9, r: this.markov3() },
        { name: 'knn',            w: 2.8, r: this.knn() },
        { name: 'bayesian',       w: 2.0, r: this.bayesian() },
        { name: 'trend15',        w: 1.7, r: this.trend15() },
        { name: 'trend30',        w: 1.6, r: this.trend30() },
        { name: 'fibo',           w: 1.5, r: this.fibo() },
        { name: 'entropy',        w: 1.2, r: this.entropy() },
        { name: 'adaptive',       w: 1.5, r: this.adaptive() },
        { name: 'momentum',       w: 1.9, r: this.momentum() },
        { name: 'wma12',          w: 1.7, r: this.wma12() },
        { name: 'ema12',          w: 1.8, r: this.ema12() },
        { name: 'neural',         w: 2.1, r: this.neural() },
        { name: 'recurrent',      w: 2.4, r: this.recurrent() },
        { name: 'volatility',     w: 1.6, r: this.volatility() },
        { name: 'cluster',        w: 2.0, r: this.cluster() },
        { name: 'zigzag',         w: 1.8, r: this.zigzag() }
      ];

      let sT = 0, sX = 0, tW = 0, used = 0;
      let tCount = 0, xCount = 0;

      for (const a of algos) {
        if (!a.r || !a.r.suggest) continue;
        const conf = Math.min(1, a.r.confidence || 0.5);
        const w = a.w * conf;
        if (a.r.suggest === 'TAI') { sT += w; tCount++; }
        else { sX += w; xCount++; }
        tW += w;
        used++;
      }

      if (tW < 1 || used < 3) return { g: 'TAI', conf: 50, used: used, mode: 'normal' };

      const total = sT + sX;
      let rawConf = Math.max(sT, sX) / total;
      const agreement = Math.max(tCount, xCount) / used;
      if (used < 5)       rawConf *= 0.75;
      else if (used < 10) rawConf *= 0.88;
      else if (used < 15) rawConf *= 0.95;
      else if (used < 22) rawConf *= 1.02;
      else if (used < 28) rawConf *= 1.08;
      else                rawConf *= Math.min(1.18, 1 + (used - 28) * 0.008);
      rawConf = rawConf * (0.7 + agreement * 0.3);

      let conf = Math.round(rawConf * 100);
      if (conf > 99) conf = 99;
      if (conf < 50) conf = 50;

      return { g: sT > sX ? 'TAI' : 'XIU', conf: conf, used: used, mode: 'normal' };
    }
}

// --- PARSER ---
function parseLines(data) {
    if (!data || !Array.isArray(data.list)) return [];
    const sortedList = data.list.sort((a, b) => b.id - a.id);
    const arr = sortedList.map(item => ({
        session: item.id,
        dice: item.dices,
        total: item.point,
        result: item.resultTruyenThong,
        tx: item.point >= 11 ? 'TAI' : 'XIU'
    }));
    return arr.sort((a, b) => a.session - b.session);
}

// --- QUẢN LÝ THỐNG KÊ KẾT QUẢ DỰ ĐOÁN ---
class PredictionTracker {
    constructor() {
        this.results = []; // Lưu trữ mảng kết quả: { session, predicted, actual, win }
        this.maxHistory = 1000;
        this.lastPrediction = null; // { session, prediction }
    }

    setPredictionForNextSession(targetSession, prediction) {
        this.lastPrediction = { session: targetSession, prediction };
    }

    recordOutcome(actualSession, actualResult) {
        if (!this.lastPrediction) return;

        // Nếu đúng là ván vừa được dự đoán
        if (this.lastPrediction.session === actualSession) {
            const isWin = this.lastPrediction.prediction === actualResult;
            this.results.push({
                session: actualSession,
                predicted: this.lastPrediction.prediction,
                actual: actualResult,
                win: isWin
            });

            if (this.results.length > this.maxHistory) {
                this.results.shift();
            }

            console.log(`📈 Kiểm chứng phiên ${actualSession}: Dự đoán [${this.lastPrediction.prediction}] | Thực tế [${actualResult}] → ${isWin ? '✅ THẮNG' : '❌ THUA'}`);
            this.lastPrediction = null;
        }
    }

    getStats() {
        const total = this.results.length;
        if (total === 0) {
            return {
                tong_van: 0,
                thang: 0,
                thua: 0,
                ty_le_thang: "0.00%",
                chuoi_thang_dai_nhat: 0,
                chuoi_thua_dai_nhat: 0,
                chuoi_hien_tai: "Chưa có dữ liệu"
            };
        }

        let wins = 0;
        let maxWinStreak = 0;
        let maxLossStreak = 0;
        let currentStreakType = null;
        let currentStreakCount = 0;

        for (let i = 0; i < total; i++) {
            const isWin = this.results[i].win;
            if (isWin) wins++;

            const streakType = isWin ? 'WIN' : 'LOSS';
            if (streakType === currentStreakType) {
                currentStreakCount++;
            } else {
                currentStreakType = streakType;
                currentStreakCount = 1;
            }

            if (currentStreakType === 'WIN' && currentStreakCount > maxWinStreak) {
                maxWinStreak = currentStreakCount;
            }
            if (currentStreakType === 'LOSS' && currentStreakCount > maxLossStreak) {
                maxLossStreak = currentStreakCount;
            }
        }

        const winRate = ((wins / total) * 100).toFixed(2) + "%";
        const currentStreakStr = currentStreakType === 'WIN' 
            ? `Thắng ${currentStreakCount}` 
            : `Thua ${currentStreakCount}`;

        return {
            tong_van: total,
            thang: wins,
            thua: total - wins,
            ty_le_thang: winRate,
            chuoi_thang_dai_nhat: maxWinStreak,
            chuoi_thua_dai_nhat: maxLossStreak,
            chuoi_hien_tai: currentStreakStr
        };
    }
}

const engine = new TaiXiuEngine();
const tracker = new PredictionTracker();

let txHistory = [];
let currentSessionId = null;
let fetchInterval = null;
let currentPrediction = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- API SERVER ---
const app = fastify({ logger: true });
await app.register(cors, { origin: "*" });

async function fetchAndProcessHistory() {
    try {
        const response = await fetch(API_URL);
        const data = await response.json();
        const newHistory = parseLines(data);
        
        if (newHistory.length === 0) {
            console.log("⚠️ Không có dữ liệu từ API.");
            return;
        }

        const lastSessionInHistory = newHistory.at(-1);

        if (!currentSessionId) {
            engine.load(newHistory);
            txHistory = newHistory;
            currentSessionId = lastSessionInHistory.session;
            currentPrediction = engine.predict();
            
            // Ghi nhận dự đoán cho phiên kế tiếp
            tracker.setPredictionForNextSession(currentSessionId + 1, currentPrediction.g);
            console.log(`✅ Đã tải ${newHistory.length} phiên lịch sử.`);
        } else if (lastSessionInHistory.session > currentSessionId) {
            const newRecords = newHistory.filter(r => r.session > currentSessionId);
            
            for (const record of newRecords) {
                // Kiểm chứng dự đoán của phiên vừa ra kết quả
                tracker.recordOutcome(record.session, record.tx);

                engine.pushRecord(record.result);
                txHistory.push(record);
            }
            
            if (txHistory.length > 350) {
                txHistory = txHistory.slice(-300);
            }
            
            currentSessionId = lastSessionInHistory.session;
            currentPrediction = engine.predict();

            // Cập nhật dự đoán cho phiên mới kế tiếp
            tracker.setPredictionForNextSession(currentSessionId + 1, currentPrediction.g);

            if (newRecords.length > 0) {
                console.log(`🆕 Cập nhật ${newRecords.length} phiên. Phiên cuối: ${currentSessionId}`);
            }
        }
    } catch (e) {
        console.error("❌ Lỗi fetch dữ liệu:", e.message);
    }
}

// Khởi động fetch dữ liệu mỗi 5s
fetchAndProcessHistory();
clearInterval(fetchInterval);
fetchInterval = setInterval(fetchAndProcessHistory, 4000);
console.log(`🔄 Đang chạy với chu kỳ 5 giây.`);

// --- API ENDPOINTS ---
app.get("/api/txmd5/lc79", async () => {
    const lastResult = txHistory.at(-1) || null;

    if (!lastResult || !currentPrediction) {
        return {
            id: "@duybmw Lc79",
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
        id: "@duybmw Lc79",
        phien_truoc: lastResult.session,
        xuc_xac1: lastResult.dice[0],
        xuc_xac2: lastResult.dice[1],
        xuc_xac3: lastResult.dice[2],
        tong: lastResult.total,
        ket_qua: lastResult.result.toLowerCase(),
        pattern: "kiem lua lc79 vip",
        phien_hien_tai: lastResult.session + 1,
        du_doan: currentPrediction.g === 'TAI' ? 'tài' : 'xỉu',
        do_tin_cay: `${currentPrediction.conf}%`
    };
});

// ENDPOINT THỐNG KÊ THẮNG THUA & CHUỖI
app.get("/api/txmd5/stats", async () => {
    return {
        id: "ToolKiemLua Stats",
        ...tracker.getStats()
    };
});

app.get("/api/txmd5/his", async () => { 
    if (!txHistory.length) {
        return { message: "không có dữ liệu lịch sử." };
    }
    
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
        status: "ok",
        msg: "Tài Xỉu MD5 LC79- Engine Pro",
        version: "3.1",
        endpoints: [
            "/api/txmd5/lc79",
            "/api/txmd5/stats",
            "/api/txmd5/his"
        ]
    };
});

// --- SERVER START ---
const start = async () => {
    try {
        await app.listen({ port: PORT, host: "0.0.0.0" });
    } catch (err) {
        console.error("❌ Lỗi khởi động server:", err.message);
        process.exit(1);
    }

    let publicIP = "0.0.0.0";
    try {
        const res = await fetch("https://ifconfig.me/ip");
        publicIP = (await res.text()).trim();
    } catch (e) {
        console.error("❌ Lỗi lấy public IP:", e.message);
    }

    console.log("\n🚀 Tài Xỉu MD5 LC79 - Engine Pro đã khởi động!");
    console.log(`   ➜ Local:   http://localhost:${PORT}/`);
    console.log(`   ➜ Network: http://${publicIP}:${PORT}/\n`);
    console.log("📌 Các API endpoints:");
    console.log(`   ➜ GET /api/txmd5/lc79      → http://${publicIP}:${PORT}/api/txmd5/lc79`);
    console.log(`   ➜ GET /api/txmd5/stats     → http://${publicIP}:${PORT}/api/txmd5/stats`);
    console.log(`   ➜ GET /api/txmd5/his   → http://${publicIP}:${PORT}/api/txmd5/his`);
};

start();
