import React, { useState, useEffect, useRef } from 'react';
import {
  Home, PieChart, TrendingUp, TrendingDown, IndianRupee,
  Users, CreditCard, Target, Calendar, Plus, Trash2,
  Edit3, Eye, EyeOff, CalendarCheck, ArrowRightLeft, X, Wallet, Pin,
  Building, CheckCircle, AlertTriangle, ChevronLeft, ChevronRight,
  BarChart2, ArrowUpRight, ArrowDownRight, Menu, Loader, User, Minus, Briefcase, Clock, Shield, Info, Mail, Lock,
  Download, Upload, FileText, Database, RefreshCw, Settings, MoreVertical, MoreHorizontal, Sparkles, Globe, ExternalLink, Search, Star,
  StickyNote, PinOff, Palette, Archive, Hash, ShieldCheck, Zap, Moon, Sun,
  Compass, BookOpen, Fingerprint, LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import CountUp from 'react-countup';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { supabase } from './supabaseClient';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler);

// ─────────────────────────────────────────────
//   CONSTANTS & DEFINITIONS
// ─────────────────────────────────────────────
const DEFAULT_CASH = 0;

// Master Super Admin configuration - ONLY harsharyan@outlook.com can grant/revoke Super Admin rights!
const MASTER_SUPER_ADMIN = 'harsharyan@outlook.com';

const ADMIN_EMAILS = [
  'harsharyan@outlook.com'
];

const INCOME_CATEGORIES = ['Salary', 'Business', 'Investment', 'Gifts', 'Others'];
const EXPENSE_CATEGORIES = ['Food', 'Rent', 'Utilities', 'Entertainment', 'Shopping', 'Travel', 'Others'];



// ─────────────────────────────────────────────
//   HELPERS
// ─────────────────────────────────────────────
const fmt = (n) => '₹' + Number(n).toLocaleString('en-IN');
const fmtDate = (s) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

// ─────────────────────────────────────────────
//   AUTOMATIC CREDIT CARD BILLING ENGINE
// ─────────────────────────────────────────────
function getSmartCardBillingCycle(card, refDate = new Date()) {
  if (!card) return {};
  
  const statementDay = Math.min(31, Math.max(1, parseInt(card.statementDay || card.statementDate, 10) || 15));
  
  let defaultGrace = 20;
  if (card.dueDate && card.statementDate) {
    const parsedDue = parseInt(card.dueDate, 10);
    const parsedStmt = parseInt(card.statementDate, 10);
    if (!isNaN(parsedDue) && !isNaN(parsedStmt)) {
      defaultGrace = (parsedDue - parsedStmt + 30) % 30 || 20;
    }
  }
  const graceDays = Math.max(1, parseInt(card.graceDays || defaultGrace, 10) || 20);

  const now = new Date(refDate);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentDay = now.getDate();

  const getValidDate = (y, m, d) => {
    const lastDayOfMonth = new Date(y, m + 1, 0).getDate();
    return new Date(y, m, Math.min(d, lastDayOfMonth));
  };

  let lastStmtDate, nextStmtDate;
  if (currentDay >= statementDay) {
    lastStmtDate = getValidDate(currentYear, currentMonth, statementDay);
    nextStmtDate = getValidDate(currentYear, currentMonth + 1, statementDay);
  } else {
    lastStmtDate = getValidDate(currentYear, currentMonth - 1, statementDay);
    nextStmtDate = getValidDate(currentYear, currentMonth, statementDay);
  }

  const dueDate = new Date(lastStmtDate.getTime() + graceDays * 86400000);
  const nextDueDate = new Date(nextStmtDate.getTime() + graceDays * 86400000);

  const interestFreeDaysRemaining = Math.max(1, Math.ceil((nextDueDate.getTime() - now.getTime()) / 86400000));
  const daysUntilStatement = Math.max(0, Math.ceil((nextStmtDate.getTime() - now.getTime()) / 86400000));
  const daysUntilPayment = Math.ceil((dueDate.getTime() - now.getTime()) / 86400000);

  const formatDate = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const formatShort = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  return {
    statementDay,
    graceDays,
    lastStmtDate,
    nextStmtDate,
    dueDate,
    nextDueDate,
    interestFreeDaysRemaining,
    daysUntilStatement,
    daysUntilPayment,
    formattedLastStmt: formatDate(lastStmtDate),
    formattedNextStmt: formatDate(nextStmtDate),
    formattedNextStmtShort: formatShort(nextStmtDate),
    formattedDueDate: formatDate(dueDate),
    formattedDueDateShort: formatShort(dueDate),
    formattedNextDueDate: formatDate(nextDueDate),
  };
}

const getSortedBanks = (bankList) => {
  return [...bankList].sort((a, b) => {
    const getPinNum = (x) => {
      if (typeof x.pin_order === 'number' && x.pin_order > 0) return x.pin_order;
      if (typeof x.is_pinned === 'number' && x.is_pinned > 0) return x.is_pinned;
      if (x.is_pinned === true) return 1;
      return 9999;
    };
    const pinA = getPinNum(a);
    const pinB = getPinNum(b);
    if (pinA !== pinB) return pinA - pinB;
    return (a.bankName || '').localeCompare(b.bankName || '');
  });
};

// Auto-rolling due date calculator month by month & Smart Interest-Free Spend Optimizer
const getSmartCardDates = (statementDayStr, dueDayStr, referenceMonth = new Date(), isPaid = false) => {
  const statementDay = parseInt(statementDayStr, 10) || 1;
  const dueDay = parseInt(dueDayStr, 10) || 1;
  const now = new Date();

  let refYear, refMonthIdx;
  if (referenceMonth instanceof Date && !isNaN(referenceMonth.getTime())) {
    refYear = referenceMonth.getFullYear();
    refMonthIdx = referenceMonth.getMonth();
  } else if (referenceMonth && typeof referenceMonth.year === 'number' && typeof referenceMonth.month === 'number') {
    refYear = referenceMonth.year;
    refMonthIdx = referenceMonth.month;
  } else {
    refYear = now.getFullYear();
    refMonthIdx = now.getMonth();
  }

  if (isPaid) {
    refMonthIdx += 1;
    if (refMonthIdx > 11) {
      refMonthIdx = 0;
      refYear += 1;
    }
  }

  const daysInRefMonth = new Date(refYear, refMonthIdx + 1, 0).getDate();
  const validStmtDay = Math.min(statementDay, daysInRefMonth);
  const stmtDate = new Date(refYear, refMonthIdx, validStmtDay);

  let dueYear = refYear;
  let dueMonthIdx = refMonthIdx;
  if (dueDay < statementDay) {
    dueMonthIdx += 1;
    if (dueMonthIdx > 11) {
      dueMonthIdx = 0;
      dueYear += 1;
    }
  }

  const daysInDueMonth = new Date(dueYear, dueMonthIdx + 1, 0).getDate();
  const validDueDay = Math.min(dueDay, daysInDueMonth);
  const dueDate = new Date(dueYear, dueMonthIdx, validDueDay);

  const todayReset = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Best Spend Date: Day right after Statement Date
  let bestSpendDay = validStmtDay + 1;
  let bestSpendMonthIdx = refMonthIdx;
  let bestSpendYear = refYear;
  if (bestSpendDay > daysInRefMonth) {
    bestSpendDay = 1;
    bestSpendMonthIdx += 1;
    if (bestSpendMonthIdx > 11) {
      bestSpendMonthIdx = 0;
      bestSpendYear += 1;
    }
  }
  const bestSpendDate = new Date(bestSpendYear, bestSpendMonthIdx, bestSpendDay);

  let nextCycleDueYear = dueYear;
  let nextCycleDueMonthIdx = dueMonthIdx;
  nextCycleDueMonthIdx += 1;
  if (nextCycleDueMonthIdx > 11) {
    nextCycleDueMonthIdx = 0;
    nextCycleDueYear += 1;
  }
  const daysInNextCycleDueMonth = new Date(nextCycleDueYear, nextCycleDueMonthIdx + 1, 0).getDate();
  const validNextCycleDueDay = Math.min(dueDay, daysInNextCycleDueMonth);
  const maxDueDate = new Date(nextCycleDueYear, nextCycleDueMonthIdx, validNextCycleDueDay);

  const maxGraceDays = Math.round((maxDueDate.getTime() - bestSpendDate.getTime()) / (1000 * 60 * 60 * 24));

  let todayBillDueDate = dueDate;
  if (todayReset.getDate() > validStmtDay) {
    todayBillDueDate = maxDueDate;
  }
  const todayGraceDays = Math.max(1, Math.round((todayBillDueDate.getTime() - todayReset.getTime()) / (1000 * 60 * 60 * 24)));

  const isPostStatement = todayReset.getDate() > validStmtDay;

  // Effective due date:
  // If isPaid is true OR if today > validStmtDay (post-statement cycle), the due date for active spend is todayBillDueDate (maxDueDate)!
  let activeDueDate = (isPaid || isPostStatement) ? todayBillDueDate : dueDate;
  const activeDueReset = new Date(activeDueDate.getFullYear(), activeDueDate.getMonth(), activeDueDate.getDate());
  const diffTime = activeDueReset.getTime() - todayReset.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const getOrdinal = (n) => {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  let statusText = '';
  let statusBadgeColor = 'var(--blue)';
  let statusBg = 'rgba(59, 130, 246, 0.1)';

  if (diffDays < 0) {
    statusText = `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) > 1 ? 's' : ''}`;
    statusBadgeColor = 'var(--red)';
    statusBg = 'var(--red-bg)';
  } else if (diffDays === 0) {
    statusText = 'Due Today';
    statusBadgeColor = 'var(--red)';
    statusBg = 'var(--red-bg)';
  } else if (diffDays === 1) {
    statusText = 'Due Tomorrow';
    statusBadgeColor = 'var(--amber)';
    statusBg = 'var(--amber-bg)';
  } else {
    statusText = `Due in ${diffDays} days`;
    statusBadgeColor = diffDays <= 5 ? 'var(--amber)' : 'var(--blue)';
    statusBg = diffDays <= 5 ? 'var(--amber-bg)' : 'rgba(59, 130, 246, 0.1)';
  }

  return {
    stmtDate,
    dueDate: activeDueDate,
    rawDueDate: dueDate,
    stmtFormatted: stmtDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    dueFormatted: activeDueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    rawDueFormatted: dueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    dueShort: activeDueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    stmtDayOrdinal: getOrdinal(statementDay),
    dueDayOrdinal: getOrdinal(dueDay),
    bestSpendDayOrdinal: getOrdinal(bestSpendDay),
    bestSpendFormatted: bestSpendDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    bestSpendFull: `${getOrdinal(bestSpendDay)} ${bestSpendDate.toLocaleDateString('en-GB', { month: 'short' })}`,
    stmtFull: `${getOrdinal(statementDay)} ${stmtDate.toLocaleDateString('en-GB', { month: 'short' })}`,
    todayRepayFormatted: todayBillDueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    maxGraceDays,
    todayGraceDays,
    diffDays,
    isPostStatement,
    statusText,
    statusBadgeColor,
    statusBg
  };
};

// Returns actual total days across all tenure months starting from startDateStr
const calcActualDays = (startDateStr, tenureMonths) => {
  if (!startDateStr || !tenureMonths) return 0;
  const s = new Date(startDateStr);
  let total = 0;
  for (let i = 0; i < tenureMonths; i++) {
    total += new Date(s.getFullYear(), s.getMonth() + i + 1, 0).getDate();
  }
  return total;
};
// Returns actual days in a given YYYY-MM-01 payment_date month
const DigitalClock = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const rawTimeString = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const parts = rawTimeString.split(' ');
  const timeString = parts[0];
  const period = parts[1] || '';

  return (
    <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: '4px', marginLeft: '6px', background: 'var(--bg-hover)', padding: '2px 8px', borderRadius: '12px' }}>
      <span style={{
        fontSize: '0.75rem',
        fontWeight: 700,
        color: 'var(--text-secondary)',
        fontVariantNumeric: 'tabular-nums'
      }}>
        {timeString}
      </span>
      <span style={{
        fontSize: '0.65rem',
        fontWeight: 800,
        color: 'var(--text-muted)',
        textTransform: 'uppercase'
      }}>
        {period}
      </span>
    </div>
  );
};

const daysInPaymentMonth = (dateStr) => {
  const d = new Date(dateStr);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
};

// ─────────────────────────────────────────────
//   SAMITI MONTH GRID COMPONENT
// ─────────────────────────────────────────────
const SamitiMonthGrid = ({ samiti, payments, togglePayment }) => {
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const startDate = new Date(samiti.start_date);
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const paidDatesSet = new Set(payments.map(p => p.payment_date));
  const months = [];
  for (let i = 0; i < samiti.tenure_months; i++) {
    const d = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dateStr = `${d.getFullYear()}-${mm}-01`;
    const label = `${monthNames[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
    const isPaid = paidDatesSet.has(dateStr);
    const isFuture = d > currentMonthStart;
    const isCurrent = d.getTime() === currentMonthStart.getTime();
    months.push({ dateStr, label, isPaid, isFuture, isCurrent });
  }

  return (
    <div style={{ background: 'var(--bg-hover)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', padding: '16px', borderRadius: '14px', border: '1px solid var(--bg-surface)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Payment Schedule
        </span>
        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', background: 'var(--border)', padding: '2px 6px', borderRadius: '4px' }}>
          {months.filter(m => m.isPaid).length} / {months.length} Paid
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(65px, 1fr))', gap: '8px' }}>
        {months.map(({ dateStr, label, isPaid, isFuture, isCurrent }) => (
          <button
            key={dateStr}
            onClick={() => !isFuture && togglePayment(samiti.id, dateStr, isPaid)}
            disabled={isFuture}
            title={isFuture ? 'Future month' : (isPaid ? 'Click to unmark' : 'Click to mark paid')}
            style={{
              padding: '6px 4px',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              border: isPaid ? '1px solid var(--green)' : (isFuture ? '1px dashed var(--border)' : (isCurrent ? '1px solid var(--purple)' : '1px solid var(--border-strong)')),
              background: isPaid ? 'var(--green-bg)' : (isFuture ? 'transparent' : 'var(--bg-card)'),
              color: isPaid ? 'var(--green)' : (isFuture ? 'var(--text-muted)' : 'var(--text-primary)'),
              cursor: isFuture ? 'not-allowed' : 'pointer',
              opacity: isFuture ? 0.5 : 1,
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              transform: 'scale(1)',
              boxShadow: isPaid ? '0 2px 8px rgba(16,185,129,0.15)' : 'none'
            }}
            onMouseEnter={e => { if(!isFuture) e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={e => { if(!isFuture) e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            {isPaid ? <CheckCircle size={14} /> : <div style={{ width: 14, height: 14, borderRadius: '50%', border: `1.5px solid ${isCurrent ? 'var(--purple)' : 'var(--border-strong)'}` }}></div>}
            <span style={{ fontSize: '0.65rem', fontWeight: 700 }}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

const SamitiDayGrid = ({ samiti, payments, togglePayment, markBulk, activeMonth }) => {
  const year = activeMonth.getFullYear();
  const monthIdx = activeMonth.getMonth();
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const now = new Date();
  
  const paidDatesSet = new Set(payments.map(p => p.payment_date));
  const days = [];
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, monthIdx, i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const label = String(i);
    const isPaid = paidDatesSet.has(dateStr);
    const isFuture = d > now || d < new Date(samiti.start_date);
    const isCurrent = d.toDateString() === now.toDateString();
    days.push({ dateStr, label, isPaid, isFuture, isCurrent });
  }

  const handleMarkAll = () => {
    const unpaidPastDays = days.filter(d => !d.isFuture && !d.isPaid).map(d => d.dateStr);
    if(unpaidPastDays.length > 0) {
      markBulk(samiti.id, unpaidPastDays);
    }
  };

  return (
    <div style={{ background: 'var(--bg-hover)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', padding: '16px', borderRadius: '14px', border: '1px solid var(--bg-surface)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Daily ({activeMonth.toLocaleDateString('en-US', { month: 'short' })})
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {days.filter(d => !d.isFuture && !d.isPaid).length > 0 && (
            <button onClick={handleMarkAll} style={{ fontSize: '0.65rem', fontWeight: 700, background: 'var(--blue-bg)', color: 'var(--blue)', border: 'none', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s' }}>Mark All</button>
          )}
          <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', background: 'var(--border)', padding: '4px 8px', borderRadius: '6px' }}>
            {days.filter(d => d.isPaid).length} / {days.filter(d => !d.isFuture || d.isPaid).length || days.length}
          </span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
        {days.map(({ dateStr, label, isPaid, isFuture, isCurrent }) => (
          <button
            key={dateStr}
            onClick={() => !isFuture && togglePayment(samiti.id, dateStr, isPaid)}
            disabled={isFuture}
            title={isFuture ? 'N/A' : (isPaid ? 'Click to unmark' : 'Click to mark paid')}
            style={{
              padding: '6px 2px',
              borderRadius: '6px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              border: isPaid ? '1px solid var(--green)' : (isFuture ? '1px dashed var(--border)' : (isCurrent ? '1px solid var(--purple)' : '1px solid var(--border-strong)')),
              background: isPaid ? 'var(--green-bg)' : (isFuture ? 'transparent' : 'var(--bg-card)'),
              color: isPaid ? 'var(--green)' : (isFuture ? 'var(--text-muted)' : 'var(--text-primary)'),
              cursor: isFuture ? 'not-allowed' : 'pointer',
              opacity: isFuture ? 0.3 : 1,
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            {isPaid ? <CheckCircle size={10} /> : <div style={{ width: 10, height: 10, borderRadius: '50%', border: `1px solid ${isCurrent ? 'var(--purple)' : 'var(--border-strong)'}` }}></div>}
            <span style={{ fontSize: '0.6rem', fontWeight: 700 }}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};


// ─────────────────────────────────────────────
//   NOTE CARD COMPONENT
// ─────────────────────────────────────────────
function NoteCard({ note, noteBg, NOTE_COLORS, noteColorPicker, setNoteColorPicker, openNoteModal, toggleNotePin, deleteNote, changeNoteColor }) {
  const bg = noteBg(note.color);
  const isPickerOpen = noteColorPicker === note.id;

  return (
    <div
      style={{
        background: bg,
        border: '1.5px solid var(--border)',
        borderRadius: '16px',
        padding: '14px 16px',
        marginBottom: '1rem',
        breakInside: 'avoid',
        boxShadow: 'var(--shadow-xs)',
        transition: 'box-shadow 0.2s, transform 0.2s',
        cursor: 'pointer',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.25)'}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'var(--shadow-xs)'; }}
      onClick={() => openNoteModal(note)}
    >
      {/* Title */}
      {note.title && (
        <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
          {note.title}
        </div>
      )}

      {/* Body preview */}
      {note.body && (
        <div style={{
          fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.65,
          display: '-webkit-box', WebkitLineClamp: 8, WebkitBoxOrient: 'vertical', overflow: 'hidden'
        }}>
          {note.body}
        </div>
      )}

      {/* Tags */}
      {(note.tags || []).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
          {note.tags.map(tag => (
            <span key={tag} style={{
              background: 'rgba(255,255,255,0.1)', color: 'var(--text-muted)',
              fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '10px',
              border: '1px solid var(--border)'
            }}>
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Action buttons - show on hover */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          display: 'flex', gap: '4px', marginTop: '4px',
          borderTop: '1px solid var(--border)', paddingTop: '8px'
        }}
      >
        {/* Pin toggle */}
        <button
          title={note.is_pinned ? 'Unpin' : 'Pin'}
          onClick={e => { e.stopPropagation(); toggleNotePin(note); }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '5px 7px',
            color: note.is_pinned ? 'var(--accent)' : 'var(--text-muted)', borderRadius: '8px',
            transition: 'background 0.15s'
          }}
        >
          <Pin size={14} fill={note.is_pinned ? 'var(--accent)' : 'none'} />
        </button>

        {/* Color picker trigger */}
        <div style={{ position: 'relative' }}>
          <button
            title="Change color"
            onClick={e => { e.stopPropagation(); setNoteColorPicker(isPickerOpen ? null : note.id); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px 7px', color: 'var(--text-muted)', borderRadius: '8px', transition: 'background 0.15s' }}
          >
            <Palette size={14} />
          </button>
          {isPickerOpen && (
            <div
              style={{
                position: 'absolute', bottom: '32px', left: 0, background: 'var(--bg-surface)',
                border: '1px solid var(--border)', borderRadius: '12px', padding: '8px',
                display: 'flex', flexWrap: 'wrap', gap: '5px', width: '160px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 200
              }}
              onClick={e => e.stopPropagation()}
            >
              {NOTE_COLORS.map(c => (
                <button
                  key={c.id}
                  title={c.label}
                  onClick={e => { e.stopPropagation(); changeNoteColor(note, c.id); }}
                  style={{
                    width: '24px', height: '24px', borderRadius: '50%', cursor: 'pointer',
                    background: c.id === 'default' ? 'var(--bg-base)' : c.bg,
                    border: note.color === c.id ? '2.5px solid var(--accent)' : '1.5px solid var(--border)'
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Edit button */}
        <button
          title="Edit"
          onClick={e => { e.stopPropagation(); openNoteModal(note); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px 7px', color: 'var(--text-muted)', borderRadius: '8px', transition: 'background 0.15s' }}
        >
          <Edit3 size={14} />
        </button>

        {/* Delete */}
        <button
          title="Delete"
          onClick={e => { e.stopPropagation(); deleteNote(note.id); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px 7px', color: 'var(--text-muted)', borderRadius: '8px', transition: 'background 0.15s', marginLeft: 'auto' }}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Updated time */}
      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'right', marginTop: '-4px' }}>
        {new Date(note.updated_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────
//   APP
// ─────────────────────────────────────────────
const FloatingMotesCanvas = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const moteCount = 60;
    const motes = Array.from({ length: moteCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 3 + 1,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      opacity: Math.random() * 0.5 + 0.1,
      pulse: (Math.random() > 0.5 ? 1 : -1) * (0.005 + Math.random() * 0.01)
    }));

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      motes.forEach(mote => {
        ctx.beginPath();
        ctx.arc(mote.x, mote.y, mote.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(111, 180, 232, ${mote.opacity})`;
        ctx.shadowColor = 'rgba(111, 180, 232, 0.6)';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;

        mote.x += mote.vx;
        mote.y += mote.vy;
        mote.opacity += mote.pulse;

        if (mote.opacity >= 0.8 || mote.opacity <= 0.1) mote.pulse *= -1;

        if (mote.x < 0) mote.x = width;
        if (mote.x > width) mote.x = 0;
        if (mote.y < 0) mote.y = height;
        if (mote.y > height) mote.y = 0;
      });

      animationFrameId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <canvas ref={canvasRef} style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: -1, pointerEvents: 'none' }} />;
};

export default function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navVisibleCount, setNavVisibleCount] = useState(10);
  const navContainerRef = useRef(null);
  
  // Update nav menu visible items dynamically based on width
  React.useLayoutEffect(() => {
    if (!navContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      // Allow ~110px per nav item + 80px for the "More" button
      const fitCount = Math.max(1, Math.floor((width - 80) / 110));
      setNavVisibleCount(fitCount);
    });
    observer.observe(navContainerRef.current);
    return () => observer.disconnect();
  }, []);

  const validViews = ['web-apps', 'dashboard', 'incomes', 'expenses', 'banks', 'accounts', 'credit-cards', 'borrowers', 'samiti', 'notes', 'personal', 'settings'];
  const normalizeView = (v) => {
    if (!v) return 'dashboard';
    if (v === 'links') return 'web-apps';
    if (v === 'bank' || v === 'account') return 'banks';
    if (v === 'card' || v === 'credit-card') return 'credit-cards';
    if (v === 'khata' || v === 'udhar') return 'borrowers';
    if (validViews.includes(v)) return v;
    return 'dashboard';
  };

  const [view, setViewState] = useState(() => {
    const saved = localStorage.getItem('lastView');
    return normalizeView(saved);
  });

  const setView = (newView) => {
    const norm = normalizeView(newView);
    setViewState(norm);
    localStorage.setItem('lastView', norm);
  };

  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('fb_theme');
    if (saved) return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('fb_theme', theme);
  }, [theme]);

  const [month, setMonth]       = useState(new Date());
  const [cashCollapsed, setCashCollapsed] = useState(false);
  const [banksCollapsed, setBanksCollapsed] = useState(false);
  const [cardsCollapsed, setCardsCollapsed] = useState(false);

  // Supabase Auth and Loader state
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');

  // Settings State
  const [settingsName, setSettingsName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [settingsPassword, setSettingsPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [settingsMessage, setSettingsMessage] = useState('');
  const [settingsTab, setSettingsTab] = useState('profile');
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState(null);
  const [showNavLinks, setShowNavLinks] = useState(() => localStorage.getItem('fb_show_nav_links') === 'true');
  const [showIncomesNav, setShowIncomesNav] = useState(() => localStorage.getItem('fb_show_incomes_nav') === 'true');
  const [showExpensesNav, setShowExpensesNav] = useState(() => localStorage.getItem('fb_show_expenses_nav') === 'true');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('fb_sidebar_collapsed') === 'true');

  // Admin Control Center & Impersonation State
  const [extraAdminEmails, setExtraAdminEmails] = useState(() => {
    try {
      const saved = localStorage.getItem('finbuddy_extra_admins');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [adminSearchQuery, setAdminSearchQuery] = useState('');
  const [logoClickCount, setLogoClickCount] = useState(0);
  const [lastLogoClickTime, setLastLogoClickTime] = useState(0);

  const handleLogoSecretClick = () => {
    const now = Date.now();
    if (now - lastLogoClickTime < 3000) {
      const nextCount = logoClickCount + 1;
      setLogoClickCount(nextCount);
      if (nextCount >= 5) {
        setLogoClickCount(0);
        setSettingsTab('admin');
        setView('settings');
        fetchAdminOverviewData();
        setSettingsMessage('👑 Secret Master Admin Access Unlocked!');
      }
    } else {
      setLogoClickCount(1);
    }
    setLastLogoClickTime(now);
  };

  const isAdmin = Boolean(
    session?.user?.email && (
      ADMIN_EMAILS.includes(session.user.email.toLowerCase()) ||
      extraAdminEmails.includes(session.user.email.toLowerCase())
    )
  );

  const toggleSuperAdminRole = (email) => {
    if (!email) return;
    const cleanEmail = email.toLowerCase();
    if (cleanEmail === MASTER_SUPER_ADMIN) return;

    let updated;
    if (extraAdminEmails.includes(cleanEmail)) {
      updated = extraAdminEmails.filter(e => e !== cleanEmail);
    } else {
      updated = [...extraAdminEmails, cleanEmail];
    }
    setExtraAdminEmails(updated);
    localStorage.setItem('finbuddy_extra_admins', JSON.stringify(updated));
  };
  const [adminData, setAdminData] = useState({ profiles: [], incomes: [], expenses: [], creditCards: [], banks: [], borrowers: [] });
  const [adminLoading, setAdminLoading] = useState(false);
  const [inspectUserModal, setInspectUserModal] = useState({ open: false, user: null });
  const [impersonatedUser, setImpersonatedUser] = useState(null);

  // ─── NOTES state (must be at top-level, Rules of Hooks) ───
  const [notes, setNotes] = useState([]);
  const [noteSearch, setNoteSearch] = useState('');
  const [activeNoteFilter, setActiveNoteFilter] = useState('all');
  const [noteModal, setNoteModal] = useState({ open: false, note: null });
  const [noteForm, setNoteForm] = useState({ title: '', body: '', color: 'default', tags: '', is_pinned: false });
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteColorPicker, setNoteColorPicker] = useState(null);

  const fetchAdminOverviewData = async () => {
    if (!isAdmin) return;
    setAdminLoading(true);
    try {
      const [
        { data: profs },
        { data: incs },
        { data: exps },
        { data: ccs },
        { data: bnks },
        { data: bws },
        { data: sams },
        { data: vlogs }
      ] = await Promise.all([
        supabase.from('profiles').select('*'),
        supabase.from('incomes').select('*'),
        supabase.from('expenses').select('*'),
        supabase.from('credit_cards').select('*'),
        supabase.from('banks').select('*'),
        supabase.from('borrowers').select('*'),
        supabase.from('samitis').select('*'),
        supabase.from('vault_logs').select('*')
      ]);

      const allIncs = incs || [];
      const allExps = exps || [];
      const allCcs  = ccs  || [];
      const allBnks = bnks || [];
      const allBws  = bws  || [];
      const allSams = sams || [];
      const allVlogs = vlogs || [];

      // Collect all unique user_ids from profiles + incomes + expenses + cards + banks + borrowers + samitis + vault_logs
      const userMap = new Map();
      (profs || []).forEach(p => {
        if (p.id) userMap.set(p.id, p);
      });

      [...allIncs, ...allExps, ...allCcs, ...allBnks, ...allBws, ...allSams, ...allVlogs].forEach(item => {
        if (item.user_id && !userMap.has(item.user_id)) {
          userMap.set(item.user_id, {
            id: item.user_id,
            full_name: 'Registered User (' + item.user_id.slice(0, 6) + ')',
            email: 'User ID: ' + item.user_id.slice(0, 8)
          });
        }
      });

      const mergedProfiles = Array.from(userMap.values());

      setAdminData({
        profiles: mergedProfiles,
        incomes: allIncs,
        expenses: allExps,
        creditCards: allCcs,
        banks: allBnks,
        borrowers: allBws,
        samitis: allSams,
        vaultLogs: allVlogs
      });
    } catch (err) {
      console.log('Admin data fetch note:', err);
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin && view === 'settings' && settingsTab === 'admin') {
      fetchAdminOverviewData();
    }
  }, [isAdmin, view, settingsTab]);

  const getLocalBackup = (key, fallback = []) => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : fallback;
    } catch {
      return fallback;
    }
  };

  const [incomes,     setIncomes]     = useState(() => getLocalBackup('fb_backup_incomes', []));
  const [expenses,    setExpenses]    = useState(() => getLocalBackup('fb_backup_expenses', []));
  const [banks,       setBanks]       = useState(() => getLocalBackup('fb_backup_banks', []));
  const [cash,        setCash]        = useState(() => {
    const saved = localStorage.getItem('fb_backup_cash');
    return saved !== null ? Number(saved) : DEFAULT_CASH;
  });
  const [creditCards, setCreditCards] = useState(() => getLocalBackup('fb_backup_credit_cards', []));
  const [ccDetailsModal, setCcDetailsModal] = useState({ open: false, card: null });
  const [ccPayModal, setCcPayModal] = useState({ open: false, card: null });
  const [activeCcMenuId, setActiveCcMenuId] = useState(null);
  const [ccHistoryFilterType, setCcHistoryFilterType] = useState('all');
  const [borrowers,   setBorrowers]   = useState(() => getLocalBackup('fb_backup_borrowers', []));
  const [samitis,     setSamitis]     = useState(() => getLocalBackup('fb_backup_samitis', []));
  const [samitiPayments, setSamitiPayments] = useState(() => getLocalBackup('fb_backup_samiti_payments', []));

  // Web Apps & Shortcuts State
  const [webApps, setWebApps] = useState(() => {
    const saved = localStorage.getItem('fb_web_apps');
    return saved ? JSON.parse(saved) : [];
  });
  const [webAppCategoryFilter, setWebAppCategoryFilter] = useState('all');
  const [webAppSearch, setWebAppSearch] = useState('');
  const [appModal, setAppModal] = useState({ open: false, item: null });

  useEffect(() => {
    localStorage.setItem('fb_web_apps', JSON.stringify(webApps));
  }, [webApps]);

  // Personal Reserve Vault State
  const [vaultTarget, setVaultTarget] = useState(() => {
    const saved = localStorage.getItem('personal_vault_target');
    return saved ? Number(saved) : 0;
  });

  const [vaultLogs, setVaultLogs] = useState(() => {
    const saved = localStorage.getItem('personal_vault_logs');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('personal_vault_target', vaultTarget);
    localStorage.setItem('personal_vault_logs', JSON.stringify(vaultLogs));
  }, [vaultTarget, vaultLogs]);

  const totalVaultWithdrawn = vaultLogs.filter(l => l.type === 'withdrawal').reduce((s, l) => s + Number(l.amount), 0);
  const totalVaultDeposited = vaultLogs.filter(l => l.type === 'deposit').reduce((s, l) => s + Number(l.amount), 0);
  const netVaultUsed = Math.max(0, totalVaultWithdrawn - totalVaultDeposited);
  const availableVaultBalance = Math.max(0, vaultTarget - netVaultUsed);
  const vaultRestorationPct = vaultTarget > 0 ? Math.min(100, Math.round(((vaultTarget - netVaultUsed) / vaultTarget) * 100)) : 100;

  const updateVaultTarget = async (target) => {
    const numTarget = Number(target) || 0;
    setVaultTarget(numTarget);
    localStorage.setItem('personal_vault_target', numTarget);
    if (session?.user?.id) {
      try {
        await supabase.from('profiles').upsert({
          id: session.user.id,
          vault_target: numTarget,
          updated_at: new Date().toISOString()
        });
      } catch (err) {
        console.log('Vault target Supabase note:', err);
      }
    }
  };

  const addVaultLog = async (type, amount, reason, date) => {
    const newLog = {
      type,
      amount: Number(amount),
      reason: reason || (type === 'withdrawal' ? 'Personal Use' : 'Replenishment'),
      date: date || new Date().toISOString().slice(0, 10),
      user_id: session?.user?.id
    };
    const tempId = Date.now().toString();
    setVaultLogs(prev => [{ ...newLog, id: tempId }, ...prev]);

    if (session?.user?.id) {
      try {
        const { data, error } = await supabase.from('vault_logs').insert([newLog]).select();
        if (!error && data && data[0]) {
          setVaultLogs(prev => prev.map(l => l.id === tempId ? data[0] : l));
        }
      } catch (err) {
        console.log('Supabase vault_log insert note:', err);
      }
    }
  };

  const deleteVaultLog = async (id) => {
    if (confirm('Delete this vault transaction record?')) {
      setVaultLogs(prev => prev.filter(l => l.id !== id));
      if (session?.user?.id) {
        try {
          await supabase.from('vault_logs').delete().eq('id', id);
        } catch (err) {
          console.log('Supabase vault_log delete note:', err);
        }
      }
    }
  };

  // Auth Lifecycle Hook
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (_event === 'SIGNED_OUT' || !session) {
        setIncomes([]);
        setExpenses([]);
        setBanks([]);
        setCash(0);
        setCreditCards([]);
        setBorrowers([]);
        setSamitis([]);
        setSamitiPayments([]);
        setCcLogs([]);
        setVaultLogs([]);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch data hook
  useEffect(() => {
    if (!supabase || !session) {
      setIncomes(getLocalBackup('fb_backup_incomes_guest', []));
      setExpenses(getLocalBackup('fb_backup_expenses_guest', []));
      setBanks(getLocalBackup('fb_backup_banks_guest', []));
      const savedCash = localStorage.getItem('fb_backup_cash_guest');
      if (savedCash !== null) setCash(Number(savedCash));
      setCreditCards(getLocalBackup('fb_backup_credit_cards_guest', []));
      setBorrowers(getLocalBackup('fb_backup_borrowers_guest', []));
      setSamitis(getLocalBackup('fb_backup_samitis_guest', []));
      setSamitiPayments(getLocalBackup('fb_backup_samiti_payments_guest', []));
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      const targetUserId = impersonatedUser ? impersonatedUser.id : session.user.id;
      try {
        const results = await Promise.allSettled([
          supabase.from('profiles').select('*').eq('id', targetUserId).maybeSingle(),
          supabase.from('incomes').select('*').eq('user_id', targetUserId).order('date', { ascending: false }),
          supabase.from('expenses').select('*').eq('user_id', targetUserId).order('date', { ascending: false }),
          supabase.from('banks').select('*').eq('user_id', targetUserId),
          supabase.from('credit_cards').select('*').eq('user_id', targetUserId),
          supabase.from('borrowers').select('*').eq('user_id', targetUserId),
          supabase.from('samitis').select('*').eq('user_id', targetUserId),
          supabase.from('samiti_payments').select('*').eq('user_id', targetUserId),
          supabase.from('cc_logs').select('*').eq('user_id', targetUserId).order('date', { ascending: false }),
          supabase.from('vault_logs').select('*').eq('user_id', targetUserId).order('date', { ascending: false }),
          supabase.from('web_apps').select('*').eq('user_id', targetUserId)
        ]);

        const profileData       = results[0].status === 'fulfilled' ? results[0].value?.data : null;
        const incData           = results[1].status === 'fulfilled' ? results[1].value?.data : null;
        const expData           = results[2].status === 'fulfilled' ? results[2].value?.data : null;
        const bankData          = results[3].status === 'fulfilled' ? results[3].value?.data : null;
        const cardData          = results[4].status === 'fulfilled' ? results[4].value?.data : null;
        const borrowerData      = results[5].status === 'fulfilled' ? results[5].value?.data : null;
        const samitiData        = results[6].status === 'fulfilled' ? results[6].value?.data : null;
        const samitiPaymentsData= results[7].status === 'fulfilled' ? results[7].value?.data : null;
        const logData           = results[8].status === 'fulfilled' ? results[8].value?.data : null;
        const vLogs             = results[9].status === 'fulfilled' ? results[9].value?.data : null;
        const webAppData        = results[10].status === 'fulfilled' ? results[10].value?.data : null;

        // Profiles
        if (profileData) {
          const currentCashLS = localStorage.getItem(`fb_backup_cash_${targetUserId}`);
          const localCashVal = currentCashLS !== null ? Number(currentCashLS) : null;

          if (profileData.cash !== undefined && profileData.cash !== null) {
            const cloudCash = Number(profileData.cash);
            if (cloudCash === 0 && localCashVal !== null && localCashVal > 0) {
              setCash(localCashVal);
              if (session?.user?.id && supabase) {
                supabase.from('profiles').upsert({ id: session.user.id, cash: localCashVal }).catch(() => {});
              }
            } else {
              setCash(cloudCash);
              localStorage.setItem(`fb_backup_cash_${targetUserId}`, cloudCash.toString());
            }
          } else if (localCashVal !== null) {
            setCash(localCashVal);
          }

          if (profileData.vault_target !== undefined && profileData.vault_target !== null) {
            setVaultTarget(Number(profileData.vault_target));
            localStorage.setItem(`personal_vault_target_${targetUserId}`, Number(profileData.vault_target));
          }
          if (profileData.full_name) {
            setSettingsName(profileData.full_name);
          }
        } else if (!impersonatedUser && session?.user?.id) {
          const currentCash = localStorage.getItem(`fb_backup_cash_${targetUserId}`);
          const cashVal = currentCash !== null ? Number(currentCash) : DEFAULT_CASH;
          try {
            await supabase.from('profiles').upsert([{ 
              id: session.user.id, 
              cash: cashVal,
              full_name: session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || '',
              email: session?.user?.email || ''
            }]);
          } catch (e) {
            console.log('Profile upsert note:', e);
          }
          setCash(cashVal);
        }

        // Incomes (Strict User Isolation)
        if (incData !== null) {
          setIncomes(incData);
          localStorage.setItem(`fb_backup_incomes_${targetUserId}`, JSON.stringify(incData));
        } else if (impersonatedUser && adminData.incomes.length > 0) {
          setIncomes(adminData.incomes.filter(i => i.user_id === targetUserId));
        } else {
          setIncomes(getLocalBackup(`fb_backup_incomes_${targetUserId}`, []));
        }

        // Expenses (Strict User Isolation)
        if (expData !== null) {
          setExpenses(expData);
          localStorage.setItem(`fb_backup_expenses_${targetUserId}`, JSON.stringify(expData));
        } else if (impersonatedUser && adminData.expenses.length > 0) {
          setExpenses(adminData.expenses.filter(e => e.user_id === targetUserId));
        } else {
          setExpenses(getLocalBackup(`fb_backup_expenses_${targetUserId}`, []));
        }

        // Banks (Strict User Isolation)
        const rawBanks = (bankData !== null) ? bankData : (impersonatedUser ? adminData.banks.filter(b => b.user_id === targetUserId) : getLocalBackup(`fb_backup_banks_${targetUserId}`, []));
        if (bankData !== null) {
          localStorage.setItem(`fb_backup_banks_${targetUserId}`, JSON.stringify(bankData));
        }
        const savedPins = JSON.parse(localStorage.getItem('fb_bank_pins') || '{}');
        const hydratedBanks = rawBanks.map(b => {
          const savedPin = savedPins[b.id];
          const pinVal = savedPin !== undefined ? savedPin : (b.pin_order || (b.is_pinned ? 1 : 0));
          return {
            ...b,
            pin_order: Number(pinVal) || 0,
            is_pinned: (Number(pinVal) || 0) > 0 ? Number(pinVal) : false
          };
        });
        setBanks(hydratedBanks);

        // Credit Cards (Strict User Isolation)
        if (cardData !== null) {
          setCreditCards(cardData);
          localStorage.setItem(`fb_backup_credit_cards_${targetUserId}`, JSON.stringify(cardData));
        } else if (impersonatedUser && adminData.creditCards.length > 0) {
          setCreditCards(adminData.creditCards.filter(c => c.user_id === targetUserId));
        } else {
          setCreditCards(getLocalBackup(`fb_backup_credit_cards_${targetUserId}`, []));
        }

        // Borrowers (Strict User Isolation)
        if (borrowerData !== null) {
          setBorrowers(borrowerData);
          localStorage.setItem(`fb_backup_borrowers_${targetUserId}`, JSON.stringify(borrowerData));
        } else if (impersonatedUser && adminData.borrowers.length > 0) {
          setBorrowers(adminData.borrowers.filter(b => b.user_id === targetUserId));
        } else {
          setBorrowers(getLocalBackup(`fb_backup_borrowers_${targetUserId}`, []));
        }

        // Samitis (Strict User Isolation)
        if (samitiData !== null) {
          setSamitis(samitiData);
          localStorage.setItem(`fb_backup_samitis_${targetUserId}`, JSON.stringify(samitiData));
        } else if (impersonatedUser && adminData.samitis.length > 0) {
          setSamitis(adminData.samitis.filter(s => s.user_id === targetUserId));
        } else {
          setSamitis(getLocalBackup(`fb_backup_samitis_${targetUserId}`, []));
        }

        if (samitiPaymentsData !== null) {
          setSamitiPayments(samitiPaymentsData);
          localStorage.setItem(`fb_backup_samiti_payments_${targetUserId}`, JSON.stringify(samitiPaymentsData));
        } else {
          setSamitiPayments(getLocalBackup(`fb_backup_samiti_payments_${targetUserId}`, []));
        }

        // CC Logs
        if (logData && logData.length > 0) {
          setCcLogs(logData);
        } else {
          const saved = JSON.parse(localStorage.getItem('fb_cc_logs') || '[]');
          setCcLogs(saved.filter(l => !l.user_id || l.user_id === targetUserId));
        }

        // Vault logs
        if (vLogs && vLogs.length > 0) {
          setVaultLogs(vLogs);
        }

        // Web Apps / My Links Sync
        if (webAppData && webAppData.length > 0) {
          setWebApps(webAppData);
          localStorage.setItem('fb_web_apps', JSON.stringify(webAppData));
        } else {
          setWebApps([]);
          localStorage.removeItem('fb_web_apps');
        }

      } catch (err) {
        console.error('Error fetching Supabase data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [session, impersonatedUser, adminData]);

  // ─── Notes fetch (top-level useEffect, must stay here) ───
  useEffect(() => {
    if (!session?.user?.id) return;
    const fetchNotes = async () => {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', session.user.id)
        .order('is_pinned', { ascending: false })
        .order('updated_at', { ascending: false });
      if (data && !error) setNotes(data);
    };
    fetchNotes();
  }, [session]);

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });
      if (error) throw error;
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateName = async (e) => {
    e.preventDefault();
    if (!settingsName.trim()) return;
    setLoading(true);
    setSettingsMessage('');
    try {
      const { data, error } = await supabase.auth.updateUser({
        data: { full_name: settingsName.trim() }
      });
      if (error) throw error;
      if (data?.user) {
        setSession(prev => ({ ...prev, user: data.user }));
      }

      // Upsert profile full_name in Supabase table
      if (session?.user?.id) {
        await supabase.from('profiles').upsert({
          id: session.user.id,
          full_name: settingsName.trim(),
          email: session.user.email,
          updated_at: new Date().toISOString()
        });
      }

      setSettingsMessage('Display Name updated successfully!');
      setSettingsName('');
    } catch (err) {
      setSettingsMessage('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (!currentPassword || !settingsPassword || !confirmPassword) {
      setSettingsMessage('Error: Please fill in all password fields.');
      return;
    }
    if (settingsPassword !== confirmPassword) {
      setSettingsMessage('Error: New password and Confirm password do not match!');
      return;
    }
    if (settingsPassword.length < 6) {
      setSettingsMessage('Error: New password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    setSettingsMessage('');
    try {
      // 1. Re-authenticate current user with current password
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: session?.user?.email,
        password: currentPassword
      });
      if (verifyError) {
        throw new Error('Current password is incorrect!');
      }

      // 2. Update to new password
      const { error: updateError } = await supabase.auth.updateUser({
        password: settingsPassword
      });
      if (updateError) throw updateError;

      setSettingsMessage('Password updated successfully!');
      setCurrentPassword('');
      setSettingsPassword('');
      setConfirmPassword('');
    } catch (err) {
      setSettingsMessage('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Modal state
  const [modal,   setModal]   = useState({ open: false, title: '', type: '', item: null });
  const [quickType, setQuickType] = useState('expense');
  const [detail,  setDetail]  = useState({ open: false, item: null, type: '' });
  const [spendAdvisorModal, setSpendAdvisorModal] = useState({ open: false, card: null, smartDates: null });
  const [advisorLang, setAdvisorLang] = useState('hinglish');
  const [ccLogs, setCcLogs] = useState([]);
  const [ccSpendModal, setCcSpendModal] = useState({ open: false, card: null });
  const [ccFilterCardId, setCcFilterCardId] = useState('all');
  const [spendSimulatorModal, setSpendSimulatorModal] = useState({ open: false, card: null });
  const [selectedCardCycle, setSelectedCardCycle] = useState({});
  const [cardMonthOffset, setCardMonthOffset] = useState({});
  const [simTestDate, setSimTestDate] = useState(new Date().toISOString().slice(0, 10));
  const [simTestAmount, setSimTestAmount] = useState('5000');
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [payoffAmount, setPayoffAmount] = useState('');

  const openModal  = (title, type, item = null) => {
    if (type === 'quick-log') setQuickType('expense');
    setModal({ open: true, title, type, item });
  };
  const closeModal = () => setModal({ open: false, title: '', type: '', item: null });
  const openDetail = (item, type) => setDetail({ open: true, item, type });
  const closeDetail = () => setDetail({ open: false, item: null, type: '' });

  // Database helper wrappers
  const saveQuickLog = async (date, amount, type, category) => {
    setLoading(true);
    const table = type === 'income' ? 'incomes' : 'expenses';
    const { data, error } = await supabase
      .from(table)
      .insert([{ date, amount, category, user_id: session.user.id }])
      .select();
    if (error) {
      alert('Error saving transaction: ' + error.message);
    } else if (data) {
      const setter = type === 'income' ? setIncomes : setExpenses;
      setter(p => [data[0], ...p]);
    }
    setLoading(false);
  };

  const saveIncomeExpense = async (id, date, amount, category, type) => {
    setLoading(true);
    const table = type === 'income' ? 'incomes' : 'expenses';
    const setter = type === 'income' ? setIncomes : setExpenses;

    if (id) {
      const { data, error } = await supabase
        .from(table)
        .update({ date, amount, category })
        .eq('id', id)
        .select();
      if (error) {
        alert('Error updating record: ' + error.message);
      } else if (data) {
        setter(p => p.map(x => x.id === id ? data[0] : x));
      }
    } else {
      const { data, error } = await supabase
        .from(table)
        .insert([{ date, amount, category, user_id: session.user.id }])
        .select();
      if (error) {
        alert('Error inserting record: ' + error.message);
      } else if (data) {
        setter(p => [data[0], ...p]);
      }
    }
    setLoading(false);
  };

  const deleteIncomeExpense = async (id, type) => {
    setLoading(true);
    const table = type === 'income' ? 'incomes' : 'expenses';
    const setter = type === 'income' ? setIncomes : setExpenses;

    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) {
      alert('Error deleting: ' + error.message);
    } else {
      setter(p => p.filter(x => x.id !== id));
    }
    setLoading(false);
  };

  const saveBank = async (id, bankName, type, accountNumber, balance) => {
    setLoading(true);
    if (id) {
      const { data, error } = await supabase
        .from('banks')
        .update({ bankName, type, accountNumber, balance })
        .eq('id', id)
        .select();
      if (error) {
        alert('Error updating bank: ' + error.message);
      } else if (data) {
        setBanks(p => p.map(x => x.id === id ? { ...data[0], pin_order: x.pin_order, is_pinned: x.is_pinned } : x));
      }
    } else {
      const { data, error } = await supabase
        .from('banks')
        .insert([{ bankName, type, accountNumber, balance, user_id: session.user.id }])
        .select();
      if (error) {
        alert('Error adding bank: ' + error.message);
      } else if (data) {
        setBanks(p => [...p, data[0]]);
      }
    }
    setLoading(false);
  };

  const deleteBank = async (id) => {
    setLoading(true);
    const { error } = await supabase.from('banks').delete().eq('id', id);
    if (error) {
      alert('Error deleting bank: ' + error.message);
    } else {
      setBanks(p => p.filter(x => x.id !== id));
    }
    setLoading(false);
  };

  const setBankPinOrder = async (id, pinVal) => {
    setLoading(true);
    const num = parseInt(pinVal, 10);
    const newPinOrder = !isNaN(num) && num > 0 ? num : 0;

    // Save to localStorage immediately so pins persist permanently across refreshes
    try {
      const existingPins = JSON.parse(localStorage.getItem('fb_bank_pins') || '{}');
      if (newPinOrder > 0) {
        existingPins[id] = newPinOrder;
      } else {
        delete existingPins[id];
      }
      localStorage.setItem('fb_bank_pins', JSON.stringify(existingPins));
    } catch (err) {
      console.log('LS pin save note:', err);
    }

    setBanks(prev => prev.map(x => x.id === id ? { ...x, pin_order: newPinOrder, is_pinned: newPinOrder > 0 ? newPinOrder : false } : x));

    try {
      const { data, error } = await supabase
        .from('banks')
        .update({ is_pinned: newPinOrder > 0 ? newPinOrder : false })
        .eq('id', id)
        .select();
      if (error) {
        console.log('Pin update note:', error.message);
      } else if (data && data[0]) {
        setBanks(prev => prev.map(x => x.id === id ? { ...data[0], pin_order: newPinOrder, is_pinned: newPinOrder > 0 ? newPinOrder : false } : x));
      }
    } catch (err) {
      console.log('Pin update exception:', err);
    }
    setLoading(false);
  };

  const updateCash = async (amount) => {
    setLoading(true);
    const numAmt = isNaN(Number(amount)) ? 0 : Number(amount);
    setCash(numAmt);
    const cacheKey = session?.user?.id ? `fb_backup_cash_${session.user.id}` : 'fb_backup_cash_guest';
    localStorage.setItem(cacheKey, numAmt.toString());

    if (session?.user?.id && supabase) {
      try {
        const { error } = await supabase
          .from('profiles')
          .upsert({ id: session.user.id, cash: numAmt, updated_at: new Date().toISOString() });
        if (error) {
          console.log('Error updating cash on Supabase:', error.message);
        }
      } catch (err) {
        console.log('Cash update exception:', err);
      }
    }
    setLoading(false);
  };

  const saveCreditCard = async (id, bankName, cardName, cardNumber, limit, outstanding, statementDate, dueDate) => {
    setLoading(true);
    if (id) {
      const { data, error } = await supabase
        .from('credit_cards')
        .update({ bankName, cardName, cardNumber, limit, outstanding, statementDate, dueDate })
        .eq('id', id)
        .select();
      if (error) {
        alert('Error updating card: ' + error.message);
      } else if (data) {
        setCreditCards(p => p.map(x => x.id === id ? data[0] : x));
      }
    } else {
      const { data, error } = await supabase
        .from('credit_cards')
        .insert([{ bankName, cardName, cardNumber, limit, outstanding, statementDate, dueDate, user_id: session.user.id }])
        .select();
      if (error) {
        alert('Error adding card: ' + error.message);
      } else if (data) {
        setCreditCards(p => [...p, data[0]]);
      }
    }
    setLoading(false);
  };

  const deleteCreditCard = async (id) => {
    setLoading(true);
    const { error } = await supabase.from('credit_cards').delete().eq('id', id);
    if (error) {
      alert('Error deleting card: ' + error.message);
    } else {
      setCreditCards(p => p.filter(x => x.id !== id));
    }
    setLoading(false);
  };

  // ─── Web Apps Helpers ───────────────
  const getFaviconUrl = (rawUrl) => {
    try {
      let validUrl = rawUrl || '';
      if (!validUrl.startsWith('http://') && !validUrl.startsWith('https://')) {
        validUrl = 'https://' + validUrl;
      }
      const domain = new URL(validUrl).hostname.replace(/^www\./, '');
      
      // Known Brand Overrides
      if (domain.includes('surbhi-telcom') || domain.includes('surbhi')) {
        return '/logo-surbhi.svg';
      }
      
      return `https://icon.horse/icon/${domain}`;
    } catch {
      return null;
    }
  };

  const AppFavicon = ({ title, url, customIcon, size = 26 }) => {
    const [imgError, setImgError] = useState(false);
    
    let domain = '';
    try {
      let validUrl = url || '';
      if (!validUrl.startsWith('http://') && !validUrl.startsWith('https://')) validUrl = 'https://' + validUrl;
      domain = new URL(validUrl).hostname.replace(/^www\./, '');
    } catch {}

    const titleLower = (title || '').toLowerCase();
    const domainLower = domain.toLowerCase();

    // Direct brand overrides
    if (titleLower.includes('surbhi') || domainLower.includes('surbhi')) {
      return (
        <img
          src="/logo-surbhi.svg"
          alt={title}
          style={{ width: size + 6, height: size + 6, objectFit: 'contain' }}
        />
      );
    }

    // Custom Icon or Emoji if specified
    if (customIcon) {
      if (customIcon.startsWith('http') || customIcon.startsWith('/')) {
        return <img src={customIcon} alt={title} style={{ width: size + 4, height: size + 4, borderRadius: '8px', objectFit: 'contain' }} />;
      }
      return <span style={{ fontSize: `${size + 4}px` }}>{customIcon}</span>;
    }

    const faviconUrl = getFaviconUrl(url);

    // Color gradient mapping based on title
    const colors = [
      'linear-gradient(135deg, #10B981, #047857)', // Emerald Green
      'linear-gradient(135deg, #3B82F6, #1D4ED8)', // Royal Blue
      'linear-gradient(135deg, #8B5CF6, #6D28D9)', // Purple
      'linear-gradient(135deg, #F59E0B, #B45309)', // Amber
      'linear-gradient(135deg, #EC4899, #BE185D)', // Rose
      'linear-gradient(135deg, #06B6D4, #0E7490)', // Cyan
      'linear-gradient(135deg, #EF4444, #B91C1C)'  // Coral Red
    ];

    const charCode = (title || 'A').charCodeAt(0);
    const bgGradient = colors[charCode % colors.length];

    // Smart Initials (e.g., "B 2 B" -> "B2B", "CSC" -> "CSC", "VOTER CARD" -> "VC")
    const words = (title || 'A').trim().split(/\s+/);
    let initial = '';
    if (words.length >= 2) {
      initial = (words[0][0] + words[1][0]).toUpperCase();
    } else {
      initial = title ? title.slice(0, 3).toUpperCase() : 'APP';
    }

    if (faviconUrl && !imgError) {
      return (
        <img
          src={faviconUrl}
          alt={title}
          style={{
            width: size + 6,
            height: size + 6,
            borderRadius: '8px',
            objectFit: 'contain',
            boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
          }}
          onError={() => setImgError(true)}
        />
      );
    }

    return (
      <div
        style={{
          width: size + 16,
          height: size + 16,
          borderRadius: '12px',
          background: bgGradient,
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: `${Math.max(10, Math.round(size * 0.44))}px`,
          fontWeight: 900,
          letterSpacing: '0.5px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          textTransform: 'uppercase',
          padding: '0 3px',
          flexShrink: 0
        }}
      >
        {initial}
      </div>
    );
  };

  const saveWebApp = async (id, title, url, category, description) => {
    setLoading(true);
    let formattedUrl = (url || '').trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = 'https://' + formattedUrl;
    }

    const payload = {
      title: title.trim(),
      url: formattedUrl,
      category: (category || '').trim() || 'General',
      description: description || '',
      user_id: session?.user?.id
    };

    if (id) {
      setWebApps(prev => prev.map(a => a.id === id ? { ...a, ...payload } : a));
      if (session?.user?.id) {
        try {
          await supabase.from('web_apps').update(payload).eq('id', id);
        } catch (e) {
          console.log('Supabase web_apps update note:', e);
        }
      }
    } else {
      const tempId = Date.now().toString();
      const newApp = { ...payload, id: tempId, is_pinned: false };
      setWebApps(prev => [newApp, ...prev]);

      if (session?.user?.id) {
        try {
          const { data, error } = await supabase.from('web_apps').insert([payload]).select();
          if (!error && data && data[0]) {
            setWebApps(prev => prev.map(a => a.id === tempId ? data[0] : a));
          }
        } catch (e) {
          console.log('Supabase web_apps insert note:', e);
        }
      }
    }
    setLoading(false);
  };

  const togglePinWebApp = async (id) => {
    const target = webApps.find(a => a.id === id);
    if (!target) return;
    const newPinned = !target.is_pinned;

    setWebApps(prev => prev.map(a => a.id === id ? { ...a, is_pinned: newPinned } : a));

    if (session?.user?.id) {
      try {
        await supabase.from('web_apps').update({ is_pinned: newPinned }).eq('id', id);
      } catch (e) {
        console.log('Supabase web_apps pin note:', e);
      }
    }
  };

  const deleteWebApp = async (id) => {
    if (confirm('Remove this web app shortcut?')) {
      setWebApps(prev => prev.filter(a => a.id !== id));
      if (session?.user?.id) {
        try {
          await supabase.from('web_apps').delete().eq('id', id);
        } catch (e) {
          console.log('Supabase web_apps delete note:', e);
        }
      }
    }
  };

  const addCcLog = async (cardId, type, amount, note, date, bankId = null) => {
    setLoading(true);
    const card = creditCards.find(c => c.id === cardId);
    if (!card) {
      setLoading(false);
      return;
    }
    const cardName = `${card.bankName} (${card.cardName || 'CC'})`;

    const currentOutstanding = parseFloat(card.outstanding) || 0;
    const newOutstanding = type === 'spend' 
      ? currentOutstanding + amount 
      : Math.max(0, currentOutstanding - amount);

    // If repay and bankId is specified, deduct amount from cash/bank
    if (type === 'repay' && bankId) {
      if (bankId === 'cash') {
        updateCash(Math.max(0, cash - amount));
      } else {
        const targetBank = banks.find(b => b.id === bankId);
        if (targetBank) {
          const newBal = Math.max(0, (targetBank.balance || 0) - amount);
          saveBank(targetBank.id, targetBank.bankName, targetBank.accountNumber, newBal, targetBank.type);
        }
      }
    }

    // Update state
    const updatedCards = creditCards.map(c => c.id === cardId ? { ...c, outstanding: newOutstanding } : c);
    setCreditCards(updatedCards);
    localStorage.setItem('fb_backup_credit_cards', JSON.stringify(updatedCards));
    
    // Save to Supabase credit_cards
    if (session?.user?.id && supabase) {
      try {
        await supabase.from('credit_cards').update({ outstanding: newOutstanding }).eq('id', cardId);
      } catch (err) {
        console.log('Supabase card update note:', err);
      }
    }

    const newLog = {
      id: Date.now().toString(),
      card_id: cardId,
      card_name: cardName,
      bank_id: bankId,
      type, // 'spend' or 'repay'
      amount,
      note: note || (type === 'spend' ? 'Card Purchase / Withdrawal' : 'Bill Repayment'),
      date: date || new Date().toISOString().slice(0, 10),
      created_at: new Date().toISOString()
    };

    setCcLogs(prev => [newLog, ...prev]);

    // Save to localStorage
    try {
      const existing = JSON.parse(localStorage.getItem('fb_cc_logs') || '[]');
      localStorage.setItem('fb_cc_logs', JSON.stringify([newLog, ...existing]));
    } catch (err) {
      console.log('LS save error:', err);
    }

    // Try Supabase cc_logs insert
    if (session?.user?.id && supabase) {
      try {
        await supabase.from('cc_logs').insert([{
          card_id: cardId,
          card_name: cardName,
          type,
          amount,
          note: newLog.note,
          date: newLog.date,
          user_id: session.user.id
        }]);
      } catch (err) {
        console.log('Supabase cc_logs note:', err);
      }
    }

    setLoading(false);
  };

  const deleteCcLog = async (logId, restoreBalance = true) => {
    setLoading(true);
    const targetLog = ccLogs.find(l => l.id === logId);
    
    if (targetLog && restoreBalance) {
      const card = creditCards.find(c => c.id === targetLog.card_id);
      if (card) {
        let restoredOutstanding = card.outstanding || 0;
        if (targetLog.type === 'repay') {
          // If deleting an accidental repayment, restore the debt back to the card!
          restoredOutstanding = restoredOutstanding + targetLog.amount;

          // If the payment was made via Cash, restore cash back to Cash on Hand!
          if (targetLog.note && targetLog.note.toLowerCase().includes('cash')) {
            updateCash(cash + targetLog.amount);
          } else if (targetLog.bank_id) {
            const b = banks.find(x => x.id === targetLog.bank_id);
            if (b) {
              saveBank(b.id, b.bankName, b.type, b.accountNumber, b.balance + targetLog.amount);
            }
          }
        } else if (targetLog.type === 'spend') {
          // If deleting a spend, reduce the debt back from the card!
          restoredOutstanding = Math.max(0, restoredOutstanding - targetLog.amount);
        }

        const updatedCards = creditCards.map(c => c.id === card.id ? { ...c, outstanding: restoredOutstanding } : c);
        setCreditCards(updatedCards);
        localStorage.setItem('fb_backup_credit_cards', JSON.stringify(updatedCards));
        if (session?.user?.id && supabase) {
          await supabase.from('credit_cards').update({ outstanding: restoredOutstanding }).eq('id', card.id);
        }
      }
    }

    setCcLogs(prev => prev.filter(l => l.id !== logId));
    try {
      const existing = JSON.parse(localStorage.getItem('fb_cc_logs') || '[]');
      localStorage.setItem('fb_cc_logs', JSON.stringify(existing.filter(l => l.id !== logId)));
    } catch (err) {
      console.log('LS delete error:', err);
    }
    if (session?.user?.id && supabase) {
      try {
        await supabase.from('cc_logs').delete().eq('id', logId);
      } catch (err) {
        console.log('Supabase cc_logs delete note:', err);
      }
    }
    setLoading(false);
  };

  const payCreditCard = async (id, amount) => {
    await addCcLog(id, 'repay', amount, 'Bill Repayment', new Date().toISOString().slice(0, 10));
  };

  const saveBorrower = async (id, name, principal, date) => {
    setLoading(true);
    if (id) {
      const { data, error } = await supabase
        .from('borrowers')
        .update({ name, principal, date })
        .eq('id', id)
        .select();
      if (error) {
        alert('Error updating borrower: ' + error.message);
      } else if (data) {
        setBorrowers(p => p.map(x => x.id === id ? data[0] : x));
      }
    } else {
      const { data, error } = await supabase
        .from('borrowers')
        .insert([{ name, principal, repaid: 0, date, user_id: session.user.id }])
        .select();
      if (error) {
        alert('Error adding borrower: ' + error.message);
      } else if (data) {
        setBorrowers(p => [...p, data[0]]);
      }
    }
    setLoading(false);
  };

  const deleteBorrower = async (id) => {
    setLoading(true);
    const { error } = await supabase.from('borrowers').delete().eq('id', id);
    if (error) {
      alert('Error deleting borrower: ' + error.message);
    } else {
      setBorrowers(p => p.filter(x => x.id !== id));
    }
    setLoading(false);
  };

  const receiveRepayment = async (id, amount) => {
    setLoading(true);
    const b = borrowers.find(x => x.id === id);
    if (!b) return;
    const newRepaid = b.repaid + amount;
    const { data, error } = await supabase
      .from('borrowers')
      .update({ repaid: newRepaid })
      .eq('id', id)
      .select();
    if (error) {
      alert('Error recording repayment: ' + error.message);
    } else if (data) {
      setBorrowers(p => p.map(x => x.id === id ? data[0] : x));
    }
    setLoading(false);
  };

  const settleBorrower = async (id) => {
    setLoading(true);
    const b = borrowers.find(x => x.id === id);
    if (!b) return;
    const { data, error } = await supabase
      .from('borrowers')
      .update({ repaid: b.principal })
      .eq('id', id)
      .select();
    if (error) {
      alert('Error settling record: ' + error.message);
    } else if (data) {
      setBorrowers(p => p.map(x => x.id === id ? data[0] : x));
    }
    setLoading(false);
  };

  const saveSamiti = async (id, name, daily_amount, start_date, tenure_months, maturity_amount, frequency = 'monthly') => {
    setLoading(true);
    if (id) {
      const { data, error } = await supabase
        .from('samitis')
        .update({ name, daily_amount, start_date, tenure_months, maturity_amount, frequency })
        .eq('id', id)
        .select();
      if (error) {
        alert('Error updating samiti: ' + error.message);
      } else if (data) {
        setSamitis(p => p.map(x => x.id === id ? data[0] : x));
      }
    } else {
      const { data, error } = await supabase
        .from('samitis')
        .insert([{ name, daily_amount, start_date, tenure_months, maturity_amount, frequency, user_id: session.user.id }])
        .select();
      if (error) {
        alert('Error adding samiti: ' + error.message);
      } else if (data) {
        setSamitis(p => [...p, data[0]]);
      }
    }
    setLoading(false);
  };

  const deleteSamiti = async (id) => {
    setLoading(true);
    const { error } = await supabase.from('samitis').delete().eq('id', id);
    if (error) {
      alert('Error deleting samiti: ' + error.message);
    } else {
      setSamitis(p => p.filter(x => x.id !== id));
      setSamitiPayments(p => p.filter(x => x.samiti_id !== id));
    }
    setLoading(false);
  };

  const toggleSamitiPayment = async (samiti_id, payment_date, isPaid) => {
    setLoading(true);
    if (isPaid) {
      const { error } = await supabase
        .from('samiti_payments')
        .delete()
        .eq('samiti_id', samiti_id)
        .eq('payment_date', payment_date);
      if (error) {
        alert('Error unmarking payment: ' + error.message);
      } else {
        setSamitiPayments(p => p.filter(x => !(x.samiti_id === samiti_id && x.payment_date === payment_date)));
      }
    } else {
      const { data, error } = await supabase
        .from('samiti_payments')
        .insert([{ samiti_id, payment_date, user_id: session.user.id }])
        .select();
      if (error) {
        if (!error.message.includes('duplicate key value')) {
            alert('Error marking payment: ' + error.message);
        }
      } else if (data) {
        setSamitiPayments(p => [...p, data[0]]);
      }
    }
    setLoading(false);
  };

  const markBulkSamitiDays = async (samiti_id, dateStrs) => {
    if (dateStrs.length === 0) return;
    setLoading(true);
    const inserts = dateStrs.map(d => ({ samiti_id, payment_date: d, user_id: session.user.id }));
    const { data, error } = await supabase
      .from('samiti_payments')
      .insert(inserts)
      .select();
    if (error) {
      if (!error.message.includes('duplicate key')) {
        alert('Error marking days: ' + error.message);
      }
    } else if (data) {
      setSamitiPayments(p => [...p, ...data]);
    }
    setLoading(false);
  };

  // Month helpers
  const changeMonth = (d) => { const n = new Date(month); n.setMonth(n.getMonth() + d); setMonth(n); };
  const monthStr = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const byMonth = (arr) => arr.filter(it => {
    const d = new Date(it.date);
    return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
  });

  // Calculations
  const curInc  = byMonth(incomes);
  const curExp  = byMonth(expenses);
  const totInc  = curInc.reduce((s, i) => s + i.amount, 0);
  const totExp  = curExp.reduce((s, i) => s + i.amount, 0);
  const net     = totInc - totExp;

  const today = new Date();
  const fifteenDaysAgo = new Date();
  fifteenDaysAgo.setDate(today.getDate() - 14); // inclusive of today = 15 days
  fifteenDaysAgo.setHours(0,0,0,0);
  const last15Inc = incomes.filter(i => new Date(i.date) >= fifteenDaysAgo && new Date(i.date) <= today);
  const last15Exp = expenses.filter(e => new Date(e.date) >= fifteenDaysAgo && new Date(e.date) <= today);
  const tot15Inc = last15Inc.reduce((s, i) => s + i.amount, 0);
  const tot15Exp = last15Exp.reduce((s, i) => s + i.amount, 0);

  const yearInc = incomes.filter(i => new Date(i.date).getFullYear() === month.getFullYear());
  const yearExp = expenses.filter(e => new Date(e.date).getFullYear() === month.getFullYear());

  const totalWealth        = cash + banks.reduce((s, b) => s + b.balance, 0);
  const lentOut            = borrowers.reduce((s, b) => s + (b.principal - b.repaid), 0);
  const ccDebt             = creditCards.reduce((s, c) => s + c.outstanding, 0);
  const ccLimit            = creditCards.reduce((s, c) => s + c.limit, 0);
  const ccUtil             = ccLimit > 0 ? ((ccDebt / ccLimit) * 100).toFixed(1) : 0;
  
  const totalSamitiInvested = samitiPayments.reduce((sum, p) => {
    const s = samitis.find(x => x.id === p.samiti_id);
    if (!s) return sum;
    return sum + (s.frequency === 'daily'
      ? Number(s.daily_amount)
      : Number(s.daily_amount) * daysInPaymentMonth(p.payment_date));
  }, 0);


  // ─────────────────────────────────────────────
  //   DATA IMPORT & EXPORT HELPERS
  // ─────────────────────────────────────────────
  const exportAllDataJSON = () => {
    try {
      const exportObject = {
        app: 'Surbhi Telecom',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        userEmail: session?.user?.email || 'user',
        data: {
          cash,
          incomes,
          expenses,
          banks,
          creditCards,
          borrowers,
          samitis,
          samitiPayments,
          ccLogs,
          vaultTarget,
          vaultLogs
        }
      };

      const jsonStr = JSON.stringify(exportObject, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const dateStr = new Date().toISOString().slice(0, 10);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Finance_Buddy_Backup_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Error exporting data: ' + err.message);
    }
  };

  const exportToCSV = (tableName) => {
    try {
      let dataArr = [];
      let headers = [];
      let filename = `Finance_Buddy_${tableName}_${new Date().toISOString().slice(0, 10)}.csv`;

      if (tableName === 'incomes') {
        dataArr = incomes;
        headers = ['ID', 'Date', 'Category', 'Amount (INR)', 'Created At'];
      } else if (tableName === 'expenses') {
        dataArr = expenses;
        headers = ['ID', 'Date', 'Category', 'Amount (INR)', 'Created At'];
      } else if (tableName === 'borrowers') {
        dataArr = borrowers;
        headers = ['ID', 'Name', 'Principal (INR)', 'Repaid (INR)', 'Pending (INR)', 'Date'];
      } else if (tableName === 'credit_cards') {
        dataArr = creditCards;
        headers = ['ID', 'Bank', 'Card Name', 'Card Number', 'Limit', 'Outstanding', 'Statement Day', 'Due Day'];
      }

      if (dataArr.length === 0) {
        alert(`No data available to export for ${tableName}`);
        return;
      }

      let csvRows = [headers.join(',')];

      dataArr.forEach(item => {
        if (tableName === 'incomes' || tableName === 'expenses') {
          csvRows.push(`"${item.id || ''}","${item.date || ''}","${item.category || ''}",${item.amount || 0},"${item.created_at || ''}"`);
        } else if (tableName === 'borrowers') {
          csvRows.push(`"${item.id || ''}","${item.name || ''}",${item.principal || 0},${item.repaid || 0},${(item.principal || 0) - (item.repaid || 0)},"${item.date || ''}"`);
        } else if (tableName === 'credit_cards') {
          csvRows.push(`"${item.id || ''}","${item.bankName || ''}","${item.cardName || ''}","${item.cardNumber || ''}",${item.limit || 0},${item.outstanding || 0},"${item.statementDate || ''}","${item.dueDate || ''}"`);
        }
      });

      const csvString = csvRows.join('\n');
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Error exporting CSV: ' + err.message);
    }
  };

  const isUUID = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);

  const downloadSampleTemplateJSON = () => {
    const sampleData = {
      app: 'Finance Buddy',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      data: {
        cash: 5000,
        vaultTarget: 50000,
        incomes: [
          {
            date: new Date().toISOString().slice(0, 10),
            amount: 55000,
            category: 'Salary'
          }
        ],
        expenses: [
          {
            date: new Date().toISOString().slice(0, 10),
            amount: 1200,
            category: 'Food'
          }
        ],
        banks: [
          {
            bankName: 'HDFC Bank',
            type: 'Savings',
            accountNumber: 'XXXX1234',
            balance: 25000
          }
        ],
        creditCards: [
          {
            bankName: 'ICICI Bank',
            cardName: 'Amazon Pay',
            cardNumber: '4321',
            limit: 100000,
            outstanding: 4500,
            statementDate: '15',
            dueDate: '05'
          }
        ],
        borrowers: [
          {
            name: 'Ramesh Sharma',
            principal: 5000,
            repaid: 2000,
            date: new Date().toISOString().slice(0, 10)
          }
        ]
      }
    };
    const jsonStr = JSON.stringify(sampleData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Finance_Buddy_Sample_Template.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const parseCSVToPayload = (text) => {
    if (!text || typeof text !== 'string') return null;
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) return null;

    const headers = lines[0].split(',').map(h => h.replace(/^["']|["']$/g, '').trim().toLowerCase());
    const incomes = [];
    const expenses = [];
    const borrowers = [];
    const creditCards = [];

    const getCol = (rowValues, ...candidates) => {
      for (const cand of candidates) {
        const idx = headers.findIndex(h => h.includes(cand.toLowerCase()));
        if (idx !== -1 && rowValues[idx] !== undefined) {
          return rowValues[idx].replace(/^["']|["']$/g, '').trim();
        }
      }
      return '';
    };

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || lines[i].split(',');
      if (!values || values.length === 0) continue;

      const dateStr = getCol(values, 'date', 'created_at', 'day') || new Date().toISOString().slice(0, 10);
      const amountVal = parseFloat(getCol(values, 'amount', 'principal', 'price', 'inr') || '0') || 0;
      const categoryVal = getCol(values, 'category', 'type', 'head') || 'Others';
      const nameVal = getCol(values, 'name', 'borrower', 'card name', 'bank') || '';

      if (headers.some(h => h.includes('borrower') || h.includes('repaid') || h.includes('principal'))) {
        const repaidVal = parseFloat(getCol(values, 'repaid') || '0') || 0;
        borrowers.push({
          name: nameVal || `Borrower #${i}`,
          principal: amountVal,
          repaid: repaidVal,
          date: dateStr
        });
      } else if (headers.some(h => h.includes('limit') || h.includes('outstanding') || h.includes('card'))) {
        const limitVal = parseFloat(getCol(values, 'limit') || '0') || 0;
        const outstandingVal = parseFloat(getCol(values, 'outstanding') || '0') || 0;
        creditCards.push({
          bankName: getCol(values, 'bank') || 'Bank',
          cardName: nameVal || 'Credit Card',
          cardNumber: getCol(values, 'number', 'cardnumber') || 'XXXX',
          limit: limitVal,
          outstanding: outstandingVal,
          statementDate: getCol(values, 'statement') || '15',
          dueDate: getCol(values, 'due') || '05'
        });
      } else {
        const isIncomeCat = INCOME_CATEGORIES.some(c => c.toLowerCase() === categoryVal.toLowerCase());
        const typeCol = getCol(values, 'type', 'transaction_type');
        const isIncomeType = typeCol.toLowerCase().includes('inc') || typeCol.toLowerCase().includes('credit');

        if (isIncomeCat || isIncomeType) {
          incomes.push({ date: dateStr, amount: Math.abs(amountVal), category: categoryVal || 'Others' });
        } else {
          expenses.push({ date: dateStr, amount: Math.abs(amountVal), category: categoryVal || 'Others' });
        }
      }
    }

    return { incomes, expenses, borrowers, creditCards };
  };

  const clearAllUserData = async (showNotification = true) => {
    try {
      const userId = session?.user?.id;

      if (userId) {
        await Promise.allSettled([
          supabase.from('incomes').delete().eq('user_id', userId),
          supabase.from('expenses').delete().eq('user_id', userId),
          supabase.from('banks').delete().eq('user_id', userId),
          supabase.from('credit_cards').delete().eq('user_id', userId),
          supabase.from('borrowers').delete().eq('user_id', userId),
          supabase.from('samitis').delete().eq('user_id', userId),
          supabase.from('samiti_payments').delete().eq('user_id', userId),
          supabase.from('cc_logs').delete().eq('user_id', userId),
          supabase.from('vault_logs').delete().eq('user_id', userId),
          supabase.from('web_apps').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
          supabase.from('profiles').update({ cash: 0, vault_target: 0 }).eq('id', userId)
        ]);
      } else {
        await supabase.from('web_apps').delete().neq('id', '00000000-0000-0000-0000-000000000000').catch(() => {});
      }

      const storageKeys = [
        'fb_backup_incomes',
        'fb_backup_expenses',
        'fb_backup_banks',
        'fb_backup_cash',
        'fb_backup_credit_cards',
        'fb_backup_borrowers',
        'fb_backup_samitis',
        'fb_backup_samiti_payments',
        'fb_cc_logs',
        'personal_vault_logs',
        'personal_vault_target',
        'fb_bank_pins',
        'fb_web_apps'
      ];
      storageKeys.forEach(k => localStorage.removeItem(k));

      setIncomes([]);
      setExpenses([]);
      setBanks([]);
      setCreditCards([]);
      setBorrowers([]);
      setSamitis([]);
      setSamitiPayments([]);
      setCcLogs([]);
      setVaultLogs([]);
      setWebApps([]);
      setCash(0);
      setVaultTarget(0);

      if (showNotification) {
        setImportStatus({
          type: 'success',
          message: 'All old data, web app shortcuts, Supabase cloud records & local backups cleared successfully!'
        });
      }
      return true;
    } catch (err) {
      if (showNotification) {
        setImportStatus({
          type: 'error',
          message: 'Error clearing data: ' + err.message
        });
      }
      return false;
    }
  };

  const importDataJSON = async (fileObj, mode = 'merge') => {
    if (!fileObj) return;
    setImporting(true);
    setImportStatus(null);
    try {
      if (mode === 'replace') {
        await clearAllUserData(false);
      }
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const fileContent = e.target.result;
          let payload = null;

          if (fileObj.name.toLowerCase().endsWith('.json') || fileContent.trim().startsWith('{') || fileContent.trim().startsWith('[')) {
            try {
              const parsed = JSON.parse(fileContent);
              if (Array.isArray(parsed)) {
                const incs = [];
                const exps = [];
                const ccs = [];
                const bnks = [];
                const bws = [];
                parsed.forEach(item => {
                  if (item.cardName || item.cardNumber || item.limit !== undefined) ccs.push(item);
                  else if (item.accountNumber || item.bankName) bnks.push(item);
                  else if (item.name && (item.principal !== undefined || item.repaid !== undefined)) bws.push(item);
                  else if (item.amount) {
                    if (item.type === 'income' || INCOME_CATEGORIES.includes(item.category)) incs.push(item);
                    else exps.push(item);
                  }
                });
                payload = { incomes: incs, expenses: exps, creditCards: ccs, banks: bnks, borrowers: bws };
              } else {
                payload = parsed.data || parsed.payload || parsed.backup || parsed;
              }
            } catch (jsonErr) {
              payload = parseCSVToPayload(fileContent);
            }
          } else {
            payload = parseCSVToPayload(fileContent);
          }

          if (!payload || typeof payload !== 'object') {
            throw new Error('Could not recognize file format. Please upload a valid JSON or CSV backup file.');
          }

          const userId = session?.user?.id;

          const prepItems = (arr) => {
            if (!Array.isArray(arr)) return [];
            return arr.map(item => {
              const copy = { ...item };
              if (userId) copy.user_id = userId;
              if (!copy.id || !isUUID(copy.id)) {
                copy.id = crypto.randomUUID();
              }
              return copy;
            });
          };

          let summaryCounts = [];
          let errorLog = [];

          const cashVal = payload.cash ?? payload.cashBalance ?? payload.profile?.cash;
          if (typeof cashVal === 'number' && !isNaN(cashVal)) {
            setCash(cashVal);
            if (userId) {
              await supabase.from('profiles').upsert({ id: userId, cash: cashVal }).catch(err => errorLog.push(err.message));
            }
          }

          const processTableUpsert = async (tableName, items, setFunc, summaryLabel, storageKey, options = {}) => {
            const sanitized = prepItems(items);
            if (sanitized.length === 0) return;

            let successfulCount = 0;
            let finalItems = sanitized;

            if (userId) {
              const chunkSize = 50;
              const allInserted = [];

              for (let i = 0; i < sanitized.length; i += chunkSize) {
                const chunk = sanitized.slice(i, i + chunkSize);
                const { data, error } = await supabase.from(tableName).upsert(chunk, options).select();
                if (!error && data) {
                  allInserted.push(...data);
                } else {
                  if (error) errorLog.push(`${summaryLabel}: ${error.message}`);
                  // Fallback to item-by-item upsert for this chunk
                  for (const singleItem of chunk) {
                    const { data: sData, error: sErr } = await supabase.from(tableName).upsert(singleItem, options).select();
                    if (!sErr && sData?.[0]) {
                      allInserted.push(sData[0]);
                    }
                  }
                }
              }

              if (allInserted.length > 0) {
                finalItems = allInserted;
                successfulCount = allInserted.length;
              } else {
                finalItems = sanitized;
                successfulCount = sanitized.length;
              }
            } else {
              successfulCount = sanitized.length;
              finalItems = sanitized;
            }

            if (successfulCount > 0) {
              setFunc(prev => {
                const updated = mode === 'replace' ? finalItems : [...finalItems, ...prev.filter(x => !finalItems.some(d => d.id === x.id))];
                if (storageKey) {
                  localStorage.setItem(storageKey, JSON.stringify(updated));
                }
                return updated;
              });
              summaryCounts.push(`${successfulCount} ${summaryLabel}`);
            }
          };

          const rawIncomes = payload.incomes || payload.income || payload.incomesList || payload.transactions?.incomes || [];
          await processTableUpsert('incomes', rawIncomes, setIncomes, 'Incomes', 'fb_backup_incomes');

          const rawExpenses = payload.expenses || payload.expense || payload.expensesList || payload.transactions?.expenses || [];
          await processTableUpsert('expenses', rawExpenses, setExpenses, 'Expenses', 'fb_backup_expenses');

          const rawBanks = payload.banks || payload.bank || payload.bankAccounts || [];
          await processTableUpsert('banks', rawBanks, setBanks, 'Banks', 'fb_backup_banks');

          const rawCards = payload.creditCards || payload.credit_cards || payload.cards || payload.creditCard || [];
          await processTableUpsert('credit_cards', rawCards, setCreditCards, 'Credit Cards', 'fb_backup_credit_cards');

          const rawBorrowers = payload.borrowers || payload.borrower || payload.khata || [];
          await processTableUpsert('borrowers', rawBorrowers, setBorrowers, 'Khata Borrowers', 'fb_backup_borrowers');

          const rawSamitis = payload.samitis || payload.samiti || [];
          await processTableUpsert('samitis', rawSamitis, setSamitis, 'Samitis', 'fb_backup_samitis');

          const rawSamitiPay = payload.samitiPayments || payload.samiti_payments || [];
          await processTableUpsert('samiti_payments', rawSamitiPay, setSamitiPayments, 'Samiti Payments', 'fb_backup_samiti_payments', { onConflict: 'samiti_id, payment_date' });

          const rawCcLogs = payload.ccLogs || payload.cc_logs || payload.cardLogs || [];
          if (Array.isArray(rawCcLogs) && rawCcLogs.length > 0) {
            const sanitizedLogs = rawCcLogs.map(item => {
              const copy = { ...item };
              if (copy.card_id && !isUUID(copy.card_id)) {
                delete copy.card_id;
              }
              return copy;
            });
            await processTableUpsert('cc_logs', sanitizedLogs, setCcLogs, 'CC Logs');
          }

          const vaultTargetVal = payload.vaultTarget ?? payload.vault_target;
          if (typeof vaultTargetVal === 'number' && !isNaN(vaultTargetVal)) {
            setVaultTarget(vaultTargetVal);
            localStorage.setItem('personal_vault_target', vaultTargetVal);
            if (userId) {
              await supabase.from('profiles').upsert({ id: userId, vault_target: vaultTargetVal, updated_at: new Date().toISOString() }).catch(() => {});
            }
          }

          const rawVaultLogs = payload.vaultLogs || payload.vault_logs || [];
          if (Array.isArray(rawVaultLogs) && rawVaultLogs.length > 0) {
            await processTableUpsert('vault_logs', rawVaultLogs, setVaultLogs, 'Vault Logs');
            localStorage.setItem('personal_vault_logs', JSON.stringify(rawVaultLogs));
          }

          if (summaryCounts.length === 0 && errorLog.length > 0) {
            setImportStatus({
              type: 'error',
              message: `Import Failed: ${errorLog[0]}`
            });
          } else if (summaryCounts.length === 0) {
            setImportStatus({
              type: 'error',
              message: 'No valid data records found in uploaded file. Please check file format or download the sample template.'
            });
          } else {
            setImportStatus({
              type: 'success',
              message: `Data Restored Successfully! (${summaryCounts.join(', ')})`
            });
          }
        } catch (err) {
          setImportStatus({ type: 'error', message: 'Import Failed: ' + err.message });
        } finally {
          setImporting(false);
        }
      };
      reader.readAsText(fileObj);
    } catch (err) {
      setImportStatus({ type: 'error', message: 'Read File Error: ' + err.message });
      setImporting(false);
    }
  };

  // Chart Data Configurations
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const monthDaysLabels = Array.from({length: daysInMonth}, (_, i) => {
    const d = new Date(month.getFullYear(), month.getMonth(), i + 1);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const lineData = {
    labels: monthDaysLabels,
    datasets: [
      {
        label: 'Income',
        data: Array.from({length: daysInMonth}, (_, i) => {
          const d = new Date(month.getFullYear(), month.getMonth(), i + 1);
          return curInc.filter(x => new Date(x.date).toDateString() === d.toDateString()).reduce((s, x) => s + x.amount, 0);
        }),
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        fill: true,
      },
      {
        label: 'Expense',
        data: Array.from({length: daysInMonth}, (_, i) => {
          const d = new Date(month.getFullYear(), month.getMonth(), i + 1);
          return curExp.filter(x => new Date(x.date).toDateString() === d.toDateString()).reduce((s, x) => s + x.amount, 0);
        }),
        borderColor: '#EF4444',
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        fill: true,
      }
    ]
  };

  const monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const yearlyBarData = {
    labels: monthLabels,
    datasets: [
      {
        label: 'Income',
        data: monthLabels.map((_, i) => yearInc.filter(x => new Date(x.date).getMonth() === i).reduce((s, x) => s + x.amount, 0)),
        backgroundColor: '#10B981', borderRadius: 4
      },
      {
        label: 'Expense',
        data: monthLabels.map((_, i) => yearExp.filter(x => new Date(x.date).getMonth() === i).reduce((s, x) => s + x.amount, 0)),
        backgroundColor: '#EF4444', borderRadius: 4
      }
    ]
  };

  const doughnutData = {
    labels: ['Banks & Cash', 'Khata'],
    datasets: [{
      data: [totalWealth, lentOut],
      backgroundColor: ['#3b82f6', '#10b981'],
      borderWidth: 0,
      hoverOffset: 4
    }]
  };

  const expenseCatBreakdown = EXPENSE_CATEGORIES.map(cat => 
    curExp.filter(x => (x.category || 'Others') === cat).reduce((s, x) => s + x.amount, 0)
  );

  const expenseCatDoughnutData = {
    labels: EXPENSE_CATEGORIES,
    datasets: [{
      data: expenseCatBreakdown,
      backgroundColor: ['#D4A373', '#C05C5C', '#5F859A', '#8E7298', '#A89F91', '#6B8E23', '#7A6E62'],
      borderWidth: 0,
      hoverOffset: 4
    }]
  };

  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    elements: {
      line: { tension: 0.4, borderWidth: 3 },
      point: { radius: 0, hitRadius: 10, hoverRadius: 6 }
    },
    plugins: {
      legend: { labels: { color: '#7A6E62', font: { family: 'Inter', size: 11, weight: '600' } } },
      tooltip: { backgroundColor: 'rgba(255, 255, 255, 0.95)', borderColor: 'rgba(62, 54, 46, 0.08)', borderWidth: 1, titleColor: '#3E362E', bodyColor: '#7A6E62', padding: 12, mode: 'index', intersect: false }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#A89F91', font: { size: 10, family: 'Inter' } } },
      y: { grid: { color: 'rgba(62, 54, 46, 0.05)' }, ticks: { color: '#A89F91', font: { size: 10, family: 'Inter' } }, border: { display: false } },
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false
    }
  };
  const doughnutOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right', labels: { color: '#7A6E62', font: { family: 'Inter', size: 11, weight: '600' } } },
      tooltip: { backgroundColor: 'rgba(255, 255, 255, 0.95)', borderColor: 'rgba(62, 54, 46, 0.08)', borderWidth: 1, titleColor: '#3E362E', bodyColor: '#7A6E62' }
    }
  };


  // ─── Income/Expense delete helpers ───────────────
  const deleteIncome  = (id) => { if (confirm('Delete this income record?'))  deleteIncomeExpense(id, 'income'); };
  const deleteExpense = (id) => { if (confirm('Delete this expense record?')) deleteIncomeExpense(id, 'expenses'); };

  // ─── MonthSelector sub-component ─────────────────
  const MonthSel = () => (
    <div className="month-selector">
      <button className="month-icon-btn" onClick={() => changeMonth(-1)}><ChevronLeft size={14}/></button>
      <span className="month-text"><Calendar size={13}/>{monthStr}</span>
      <button className="month-icon-btn" onClick={() => changeMonth(1)}><ChevronRight size={14}/></button>
    </div>
  );



  // ─────────────────────────────────────────────────
  //   RENDER
  // ─────────────────────────────────────────────────
  if (!supabase) {
    return (
      <div className="loader-container" style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>⚠️</div>
        <h2 style={{ color: 'var(--red)', fontWeight: 800, fontSize: '1.5rem' }}>Configuration Required</h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '480px', margin: '0.75rem auto 1.5rem', fontSize: '0.9rem', lineHeight: 1.5 }}>
          Supabase credentials are missing. If you have deployed to Vercel, please go to your <strong>Vercel Project Settings &rarr; Environment Variables</strong> and add:
        </p>
        <div style={{ background: 'var(--bg-hover)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border)', display: 'inline-block', textAlign: 'left', fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-primary)', marginBottom: '1.5rem' }}>
          <div>VITE_SUPABASE_URL</div>
          <div style={{ marginBottom: '8px', color: 'var(--text-muted)' }}>https://otnxfohecczaberldjuy.supabase.co</div>
          <div>VITE_SUPABASE_ANON_KEY</div>
          <div style={{ color: 'var(--text-muted)' }}>your-supabase-anon-key</div>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>After adding the variables, redeploy your project on Vercel.</p>
      </div>
    );
  }

  if (loading && incomes.length === 0 && banks.length === 0) {
    return (
      <div className="loader-container">
        <div className="pulsing-orb" style={{ background: 'transparent', boxShadow: 'none' }}>
          <img src="/logo-surbhi.svg" style={{ width: 72, height: 72, filter: 'drop-shadow(0 0 14px rgba(16, 185, 129, 0.3))', objectFit: 'contain' }} alt="Loading" />
        </div>
        <span className="loader-text">Syncing with Supabase...</span>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{
        position: 'relative',
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background: 'var(--bg-base)',
        fontFamily: 'var(--font)',
        padding: '2rem 1.5rem'
      }}>
        {/* 💧 Slow Realistic Water Droplets Canvas Effect */}
        {/* Fluid Motes Background Effect */}
        <FloatingMotesCanvas />

        {/* Ambient Soft Light Glow Orbs */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 1 }}>
          <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '650px', height: '650px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(46, 123, 214, 0.18) 0%, rgba(46, 123, 214, 0) 70%)', filter: 'blur(90px)' }} />
          <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '700px', height: '700px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(111, 180, 232, 0.15) 0%, rgba(111, 180, 232, 0) 70%)', filter: 'blur(100px)' }} />
        </div>

        {/* 🪞 UNIFIED GLASSMORPHIC MIRROR CONTAINER */}
        <div style={{
          position: 'relative',
          zIndex: 2,
          width: '100%',
          maxWidth: '1100px',
          borderRadius: '36px',
          background: 'var(--bg-card)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          border: '1px solid var(--border)',
          boxShadow: '0 30px 80px rgba(62, 54, 46, 0.1), inset 0 1px 2px rgba(255, 255, 255, 0.95)',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'stretch',
          justifyContent: 'space-between',
          overflow: 'hidden',
          flexWrap: 'wrap'
        }}>
          {/* Glossy Top Mirror Reflection Highlight */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '2px',
            background: 'linear-gradient(90deg, transparent 0%, var(--accent-mid) 30%, rgba(255, 255, 255, 0.95) 50%, var(--accent-mid) 70%, transparent 100%)'
          }} />

          {/* 👈 LEFT SIDE: Hero Branding & Stat Cards */}
          <div style={{
            flex: '1.2 1 450px',
            padding: '3.5rem 3.5rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            gap: '3rem',
            borderRight: '1px solid var(--border)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Subtle Wave / Gradient Background Decoration */}
            <div style={{
              position: 'absolute',
              top: '40%',
              left: '50%',
              width: '180%',
              height: '180%',
              background: 'radial-gradient(circle at center, rgba(16, 185, 129, 0.06) 0%, transparent 60%)',
              transform: 'translate(-50%, -50%)',
              zIndex: 0,
              pointerEvents: 'none'
            }} />
            <svg style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', opacity: 0.1, pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 1440 320" xmlns="http://www.w3.org/2000/svg">
              <path fill="var(--accent)" fillOpacity="1" d="M0,160L48,170.7C96,181,192,203,288,197.3C384,192,480,160,576,149.3C672,139,768,149,864,165.3C960,181,1056,203,1152,202.7C1248,203,1344,181,1392,170.7L1440,160L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
            </svg>
            <svg style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', opacity: 0.15, pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 1440 320" xmlns="http://www.w3.org/2000/svg">
              <path fill="#3B82F6" fillOpacity="1" d="M0,224L60,202.7C120,181,240,139,360,133.3C480,128,600,160,720,181.3C840,203,960,213,1080,202.7C1200,192,1320,160,1380,144L1440,128L1440,320L1380,320C1320,320,1200,320,1080,320C960,320,840,320,720,320C600,320,480,320,360,320C240,320,120,320,60,320L0,320Z"></path>
            </svg>

            {/* Top Logo & Pill Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', position: 'relative', zIndex: 1 }}>
              <img
                src="/logo-surbhi.svg"
                style={{
                  height: '160px',
                  width: 'auto',
                  maxWidth: '320px',
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 8px 24px var(--shadow-glow))'
                }}
                alt="Surbhi Telecom Logo"
              />

            </div>

            {/* Main Hero Section */}
            <div style={{ margin: '1rem 0', position: 'relative', zIndex: 1 }}>
              <h1 style={{
                fontFamily: "'Outfit', 'Plus Jakarta Sans', sans-serif",
                fontSize: '3.6rem',
                fontWeight: 900,
                lineHeight: 1.05,
                letterSpacing: '-2px',
                background: 'linear-gradient(135deg, var(--text-primary) 0%, var(--accent) 60%, var(--secondary) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                margin: '0 0 12px 0'
              }}>
                SURBHI TELECOM
              </h1>

              <h2 style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontSize: '1.38rem',
                fontWeight: 800,
                color: 'var(--text-primary)',
                margin: 0,
                letterSpacing: '-0.4px'
              }}>
                Personal Wealth & Financial Intelligence
              </h2>

              <p style={{ fontSize: '0.94rem', fontWeight: 600, color: 'var(--text-secondary)', margin: '10px 0 0 0', lineHeight: 1.6, maxWidth: '460px' }}>
                Real-time daily cashflow liquidity, multi-bank balance management, digital khata ledger, and borrower debt logs strictly isolated for the owner.
              </p>

              {/* 🌐 External Registration of Accounts & Details Portal Link */}
              <a
                href="https://surbhi-telecome.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                title="Registration of accounts & details Portal"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '14px',
                  marginTop: '1.8rem',
                  padding: '12px 20px',
                  borderRadius: '16px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  textDecoration: 'none',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)',
                  transition: 'all 0.25s ease',
                  cursor: 'pointer',
                  maxWidth: 'fit-content'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--accent)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 24px var(--shadow-glow)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.04)';
                }}
              >
                <img
                  src="/logo-surbhi.svg"
                  alt="Surbhi Telecom Icon"
                  style={{
                    height: '26px',
                    width: 'auto',
                    objectFit: 'contain'
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Registration of accounts & details Portal <ExternalLink size={14} />
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    Open portal in new tab
                  </span>
                </div>
              </a>
            </div>
          </div>

          {/* 👉 RIGHT SIDE: Embedded Clean Glass Login Box */}
          <div className="ios-glass-box" style={{
            flex: '1 1 380px',
            maxWidth: '430px',
            padding: '3.5rem 2.5rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center'
          }}>
            {/* Bento Header */}
            <div style={{ marginBottom: '1.75rem' }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--accent-soft)',
                border: '1px solid var(--border)',
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '0.7rem',
                fontWeight: 800,
                color: 'var(--accent)',
                marginBottom: '10px'
              }}>
                <Lock size={12}/> Owner Sign In
              </div>

              <h2 style={{ fontSize: '2.4rem', fontFamily: "'Caveat', cursive", fontWeight: 700, color: 'var(--accent)', margin: 0, letterSpacing: '0.5px' }}>
                Log in malik jii !!
              </h2>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginTop: '4px' }}>
                Enter your credentials to access your dashboard
              </span>
            </div>

            {/* Login Form */}
            <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', width: '100%' }}>
              {/* Email Field */}
              <div style={{ position: 'relative', width: '100%' }}>
                <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent)', display: 'flex' }}>
                  <Mail size={18} />
                </div>
                <input
                  type="email"
                  placeholder="Owner Email Address"
                  value={authEmail}
                  onChange={e => setAuthEmail(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    height: '50px',
                    paddingLeft: '44px',
                    paddingRight: '16px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    borderRadius: '14px',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    boxSizing: 'border-box',
                    outline: 'none',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)'
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = 'var(--accent)';
                    e.target.style.boxShadow = '0 0 0 3px var(--accent-soft)';
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = 'var(--border)';
                    e.target.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.02)';
                  }}
                />
              </div>

              {/* Password Field with Eye Toggle */}
              <div style={{ position: 'relative', width: '100%' }}>
                <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent)', display: 'flex' }}>
                  <Lock size={18} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Master Password"
                  value={authPassword}
                  onChange={e => setAuthPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    height: '50px',
                    paddingLeft: '44px',
                    paddingRight: '44px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    borderRadius: '14px',
                    fontSize: (!showPassword && authPassword.length > 0) ? '1.4rem' : '0.9rem',
                    letterSpacing: (!showPassword && authPassword.length > 0) ? '6px' : 'normal',
                    fontWeight: 700,
                    boxSizing: 'border-box',
                    outline: 'none',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)'
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = 'var(--accent)';
                    e.target.style.boxShadow = '0 0 0 3px var(--accent-soft)';
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = 'var(--border)';
                    e.target.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.02)';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
                style={{
                  width: '100%',
                  height: '50px',
                  fontSize: '0.95rem',
                  fontWeight: 800,
                  marginTop: '0.4rem',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, var(--accent) 0%, #3B82F6 100%)',
                  color: '#ffffff',
                  border: 'none',
                  boxShadow: '0 8px 24px var(--accent-mid)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {loading ? (
                  <>
                    <Loader size={18} className="spin" /> Authenticating...
                  </>
                ) : (
                  <>
                    Sign In to Dashboard <ChevronRight size={18} />
                  </>
                )}
              </button>
            </form>

            {authError && (
              <div style={{ width: '100%', color: 'var(--red)', marginTop: '1.25rem', padding: '11px 14px', background: 'var(--red-bg)', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.3)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.82rem', textAlign: 'center' }}>
                <AlertTriangle size={16} /> {authError}
              </div>
            )}

            {/* Security Footer Stamp */}
            <div style={{ marginTop: '1.75rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', width: '100%', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>
              <Shield size={13} color="var(--accent)" /> Private Single-User Portal • Supabase Secured
            </div>
          </div>
        </div>

      </div>
    );
  }

  // ─────────────────────────────────────────────
  // NOTES — Google Keep style
  // ─────────────────────────────────────────────
  const NOTE_COLORS = [
    { id: 'default', bg: 'var(--bg-surface)', label: 'Default' },
    { id: 'red',     bg: '#4a1f1f',           label: 'Red' },
    { id: 'orange',  bg: '#3d2810',           label: 'Orange' },
    { id: 'yellow',  bg: '#3d3510',           label: 'Yellow' },
    { id: 'green',   bg: '#1a3325',           label: 'Green' },
    { id: 'teal',    bg: '#0f2e2e',           label: 'Teal' },
    { id: 'blue',    bg: '#0f1f3d',           label: 'Blue' },
    { id: 'purple',  bg: '#2a1040',           label: 'Purple' },
    { id: 'pink',    bg: '#3d1030',           label: 'Pink' },
    { id: 'brown',   bg: '#2a1a0a',           label: 'Brown' },
    { id: 'gray',    bg: '#252525',           label: 'Gray' },
  ];

  const openNoteModal = (note = null) => {
    if (note) {
      setNoteForm({
        title: note.title || '',
        body: note.body || '',
        color: note.color || 'default',
        tags: (note.tags || []).join(', '),
        is_pinned: note.is_pinned || false
      });
    } else {
      setNoteForm({ title: '', body: '', color: 'default', tags: '', is_pinned: false });
    }
    setNoteModal({ open: true, note });
  };

  const saveNote = async () => {
    if (!noteForm.title.trim() && !noteForm.body.trim()) return;
    setNoteSaving(true);
    const userId = session?.user?.id;
    const tagsList = noteForm.tags.split(',').map(t => t.trim()).filter(Boolean);
    const now = new Date().toISOString();
    try {
      if (noteModal.note) {
        // UPDATE
        const updates = {
          title: noteForm.title,
          body: noteForm.body,
          color: noteForm.color,
          tags: tagsList,
          is_pinned: noteForm.is_pinned,
          updated_at: now
        };
        setNotes(prev => prev.map(n => n.id === noteModal.note.id ? { ...n, ...updates } : n)
          .sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0)));
        if (userId) {
          await supabase.from('notes').update(updates).eq('id', noteModal.note.id);
        }
      } else {
        // INSERT
        const newNote = {
          id: crypto.randomUUID(),
          user_id: userId,
          title: noteForm.title,
          body: noteForm.body,
          color: noteForm.color,
          tags: tagsList,
          is_pinned: noteForm.is_pinned,
          is_archived: false,
          created_at: now,
          updated_at: now
        };
        setNotes(prev => [newNote, ...prev].sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0)));
        if (userId) {
          const { data } = await supabase.from('notes').insert([newNote]).select();
          if (data?.[0]) setNotes(prev => prev.map(n => n.id === newNote.id ? data[0] : n));
        }
      }
      setNoteModal({ open: false, note: null });
    } finally {
      setNoteSaving(false);
    }
  };

  const deleteNote = async (id) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    if (session?.user?.id) {
      await supabase.from('notes').delete().eq('id', id);
    }
  };

  const toggleNotePin = async (note) => {
    const updated = { is_pinned: !note.is_pinned, updated_at: new Date().toISOString() };
    setNotes(prev => prev.map(n => n.id === note.id ? { ...n, ...updated } : n)
      .sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0)));
    if (session?.user?.id) {
      await supabase.from('notes').update(updated).eq('id', note.id);
    }
  };

  const changeNoteColor = async (note, colorId) => {
    const updated = { color: colorId, updated_at: new Date().toISOString() };
    setNotes(prev => prev.map(n => n.id === note.id ? { ...n, ...updated } : n));
    setNoteColorPicker(null);
    if (session?.user?.id) {
      await supabase.from('notes').update(updated).eq('id', note.id);
    }
  };

  const navItems = [
    { id: 'web-apps', label: 'Links', icon: <Compass size={16} strokeWidth={2} /> },
    { id: 'dashboard', label: 'Dashboard', icon: <Home size={16} strokeWidth={2} /> },
    ...(showIncomesNav ? [{ id: 'incomes', label: 'Incomes', icon: <TrendingUp size={16} strokeWidth={2} /> }] : []),
    ...(showExpensesNav ? [{ id: 'expenses', label: 'Expenses', icon: <TrendingDown size={16} strokeWidth={2} /> }] : []),
    { id: 'banks', label: 'Banks & Cash', icon: <Building size={16} strokeWidth={2} /> },
    { id: 'credit-cards', label: 'Credit Cards', icon: <CreditCard size={16} strokeWidth={2} /> },
    { id: 'borrowers', label: 'Khata / Udhar', icon: <Users size={16} strokeWidth={2} /> },
    { id: 'samiti', label: 'Samiti', icon: <Target size={16} strokeWidth={2} /> },
    { id: 'notes', label: 'Notes', icon: <BookOpen size={16} strokeWidth={2} /> },
    { id: 'personal', label: 'Personal', icon: <Fingerprint size={16} strokeWidth={2} /> }
  ];

  return (
    <>
      <div className="bg-orbs">
        <div className="orb orb-1"></div>
        <div className="orb orb-2"></div>
        <div className="orb orb-3"></div>
        <div className="orb orb-4"></div>
      </div>
      <div className="app-layout">
      <nav className="top-navbar">
        {/* Logo Section */}
        <div className="navbar-logo-container">
          <img
            src="/logo-surbhi.svg"
            onClick={handleLogoSecretClick}
            className="navbar-logo-img"
            alt="Surbhi Telecom Logo"
          />
          <div className="brand" onClick={handleLogoSecretClick} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <span style={{ 
              fontSize: '1.15rem', 
              fontWeight: 800, 
              fontFamily: "'Syne', 'Outfit', sans-serif",
              background: 'linear-gradient(135deg, var(--nav-active-text) 0%, var(--nav-accent) 60%, var(--secondary) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.3px',
              lineHeight: 1.1
            }}>Surbhi Telecom</span>
          </div>
        </div>

        {/* Navigation Items (Centered horizontally) */}
        <div className="nav-menu-container" ref={navContainerRef}>
          <div className="nav-menu">
            {navItems.slice(0, navVisibleCount).map(it => (
              <button
                key={it.id}
                className={`nav-item ${view === it.id ? 'active' : ''}`}
                onClick={() => { setView(it.id); setMobileMenuOpen(false); }}
                title={it.label}
              >
                <div className="nav-item-icon" style={{ fontSize: '1rem', display: 'flex', alignItems: 'center' }}>{it.icon}</div>
                <span className="nav-item-label">{it.label}</span>
              </button>
            ))}
            
            {navVisibleCount < navItems.length && (
              <div style={{ position: 'relative', display: 'flex', height: '100%' }}>
                <button
                  className="nav-item"
                  onClick={() => {
                    const el = document.getElementById('nav-more-dropdown');
                    if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none';
                  }}
                  title="More"
                >
                  <MoreHorizontal size={16} strokeWidth={2} />
                  <span className="nav-item-label">More</span>
                </button>
                <div id="nav-more-dropdown" style={{
                  display: 'none', position: 'absolute', top: '100%', right: '0', marginTop: '0',
                  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px',
                  padding: '8px', flexDirection: 'column', gap: '4px', minWidth: '180px',
                  boxShadow: 'var(--shadow-lg)', zIndex: 1000
                }}>
                  {navItems.slice(navVisibleCount).map(it => (
                    <button
                      key={it.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                        borderRadius: '6px', color: view === it.id ? 'var(--nav-active-text)' : 'var(--nav-inactive-text)',
                        background: view === it.id ? 'var(--bg-hover)' : 'transparent',
                        border: 'none', cursor: 'pointer', textAlign: 'left', fontWeight: 500, fontSize: '13px',
                        textTransform: 'uppercase', letterSpacing: '0.05em'
                      }}
                      onClick={() => { setView(it.id); document.getElementById('nav-more-dropdown').style.display = 'none'; }}
                    >
                      <div className="nav-item-icon">{it.icon}</div>
                      <span style={{ flex: 1 }}>{it.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Actions Section (Quick Links, Theme Toggle, Profile, Mobile Menu) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', height: '100%', paddingLeft: '1rem' }}>
          
          {/* Quick Links Dropdown (Replacing old list) */}
          {showNavLinks && webApps.filter(a => a.is_pinned).length > 0 && (
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <button 
                title="Quick Links"
                onClick={() => {
                  const el = document.getElementById('quick-links-dropdown');
                  if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none';
                }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '36px', height: '36px', borderRadius: '8px',
                  background: 'transparent', border: '1px solid transparent',
                  color: 'var(--nav-inactive-text)', cursor: 'pointer', transition: 'all 0.2s ease'
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--nav-accent)'; e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--nav-inactive-text)'; e.currentTarget.style.background = 'transparent'; }}
              >
                <ExternalLink size={18} />
              </button>
              
              <div id="quick-links-dropdown" style={{
                display: 'none', position: 'absolute', top: '100%', right: '0', marginTop: '12px',
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px',
                padding: '8px', flexDirection: 'column', gap: '4px', minWidth: '180px',
                boxShadow: 'var(--shadow-lg)', zIndex: 1000
              }}>
                {webApps.filter(a => a.is_pinned).slice(0, 5).map(app => (
                  <a
                    key={app.id} href={app.url} target="_blank" rel="noopener noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px',
                      borderRadius: '8px', color: 'var(--text-secondary)', textDecoration: 'none',
                      fontSize: '0.85rem', fontWeight: 600
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                  >
                    <AppFavicon title={app.title} url={app.url} size={16} />
                    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{app.title}</span>
                  </a>
                ))}
              </div>
            </div>
          )}


          
          {/* Vertical Divider Hairline */}
          <div style={{ width: '1px', height: '24px', background: 'var(--nav-border)', margin: '0 4px' }} />

          {/* Profile Details */}
          <div
            className="nav-profile"
            onClick={() => setView('settings')}
            title="Account Settings"
          >
            <div className="profile-avatar">
              {(session?.user?.user_metadata?.full_name || session?.user?.email || 'U')[0].toUpperCase()}
            </div>
            <div className="profile-details" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--nav-body-text)', whiteSpace: 'nowrap' }}>
                {session?.user?.user_metadata?.full_name || 'Account'}
              </div>
            </div>
          </div>

          {/* Mobile Menu Button */}
          <button 
            className="mobile-menu-btn" 
            onClick={() => setMobileMenuOpen(true)}
            style={{
              background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)', cursor: 'pointer', padding: '6px 10px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
            title="Open Menu"
          >
            <Menu size={22} />
          </button>

        </div>
      </nav>

      {/* ═══ MOBILE MENU OVERLAY ═══ */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="mobile-menu-overlay"
            onClick={() => setMobileMenuOpen(false)}
          >
            <motion.div 
              initial={{ x: '-100%' }} 
              animate={{ x: 0 }} 
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="mobile-menu-content"
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <img src="/logo-surbhi.svg" alt="Surbhi Telecom Logo" style={{ height: '32px', width: 'auto', borderRadius: '6px' }} />
                  <span style={{ 
                    fontSize: '1.15rem', 
                    fontWeight: 800, 
                    fontFamily: "'Syne', 'Outfit', sans-serif", 
                    background: 'linear-gradient(135deg, var(--nav-active-text) 0%, var(--nav-accent) 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    letterSpacing: '-0.3px',
                    lineHeight: 1.1
                  }}>Surbhi Telecom</span>
                </div>
                <button onClick={() => setMobileMenuOpen(false)} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)', cursor: 'pointer', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Close Menu">
                  <X size={20} />
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                {navItems.map(it => {
                  const isActive = view === it.id;
                  return (
                    <button
                      key={it.id}
                      className={`nav-item ${isActive ? 'active' : ''}`}
                      style={{ 
                        width: '100%', 
                        padding: '12px 16px', 
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        fontWeight: isActive ? 800 : 600,
                        fontSize: '0.95rem',
                        transition: 'all 0.2s ease',
                        background: isActive ? 'var(--accent-soft)' : 'transparent',
                        color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                        border: isActive ? '1px solid rgba(79, 70, 229, 0.2)' : '1px solid transparent'
                      }}
                      onClick={() => { setView(it.id); setMobileMenuOpen(false); }}
                    >
                      <div style={{ flexShrink: 0, fontSize: '1.2rem', lineHeight: 1, color: isActive ? 'var(--primary)' : 'var(--text-muted)' }}>{it.icon}</div>
                      <span className="nav-item-label" style={{ fontSize: '0.95rem', fontWeight: isActive ? 800 : 600 }}>{it.label}</span>
                    </button>
                  );
                })}
                
                {/* Settings Link for Mobile */}
                <button
                  className={`nav-item ${view === 'settings' ? 'active' : ''}`}
                  style={{ 
                    width: '100%', 
                    padding: '12px 16px', 
                    borderRadius: '12px', 
                    marginTop: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    fontWeight: view === 'settings' ? 800 : 600,
                    fontSize: '0.95rem',
                    transition: 'all 0.2s ease',
                    background: view === 'settings' ? 'var(--accent-soft)' : 'transparent',
                    color: view === 'settings' ? 'var(--primary)' : 'var(--text-secondary)',
                    border: view === 'settings' ? '1px solid rgba(79, 70, 229, 0.2)' : '1px solid transparent'
                  }}
                  onClick={() => { setView('settings'); setMobileMenuOpen(false); }}
                >
                  <div style={{ flexShrink: 0, fontSize: '1.2rem', lineHeight: 1, color: view === 'settings' ? 'var(--primary)' : 'var(--text-muted)' }}><Settings size={20} /></div>
                  <span className="nav-item-label" style={{ fontSize: '0.95rem', fontWeight: view === 'settings' ? 800 : 600 }}>Settings</span>
                </button>
              </div>
              
              <div style={{ marginTop: 'auto', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
                {/* Theme Toggle for Mobile */}
                <button 
                  className="btn"
                  onClick={() => {
                    const newTheme = theme === 'dark' ? 'light' : 'dark';
                    setTheme(newTheme);
                    localStorage.setItem('fb_theme', newTheme);
                    document.documentElement.setAttribute('data-theme', newTheme);
                  }}
                  style={{
                    background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)',
                    width: '100%', padding: '12px', borderRadius: '12px', fontWeight: 700, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: '1rem'
                  }}
                >
                  {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                  {theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--grad-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontWeight: 'bold' }}>
                    {session?.user?.user_metadata?.full_name?.charAt(0) || 'U'}
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      {session?.user?.user_metadata?.full_name || 'My Account'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{session?.user?.email}</div>
                  </div>
                </div>
                <button 
                  className="btn" 
                  style={{ background: 'var(--red-bg)', color: 'var(--red)', width: '100%', padding: '12px', fontWeight: 800, justifyContent: 'center', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                  onClick={() => supabase.auth.signOut()}
                >
                  <LogOut size={16} style={{ marginRight: 6 }}/> Logout
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ MAIN ═══ */}

      <main className="main-content">
        {/* ═══ SUPER-ADMIN LIVE IMPERSONATION BANNER ═══ */}
        {isAdmin && impersonatedUser && (
          <div style={{
            position: 'sticky',
            top: 0,
            zIndex: 9999,
            background: 'linear-gradient(135deg, #D4A373 0%, #6B8E23 100%)',
            color: '#ffffff',
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontWeight: 800,
            fontSize: '0.88rem',
            boxShadow: '0 4px 16px rgba(62, 54, 46, 0.25)',
            flexWrap: 'wrap',
            gap: '10px',
            width: '100%'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Eye size={20}/>
              <span>
                👑 SUPER-ADMIN IMPERSONATION: Viewing Live Dashboard of <strong>{impersonatedUser.full_name || impersonatedUser.email}</strong> ({impersonatedUser.email})
              </span>
            </div>
            <button
              onClick={() => {
                setImpersonatedUser(null);
                setView('settings');
                setSettingsTab('admin');
              }}
              style={{
                background: '#FFFFFF',
                color: '#3E362E',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '8px',
                fontWeight: 900,
                fontSize: '0.8rem',
                cursor: 'pointer',
                boxShadow: 'var(--shadow-xs)'
              }}
            >
              ✖ Exit User View & Return to Admin Panel
            </button>
          </div>
        )}

        <div className="scroll-area">

          {/* ══ DASHBOARD ══ */}
          {(view === 'home' || view === 'dashboard') && (
            <div className="fade-in-view">
              {/* Header Section */}
              <div className="page-header" style={{ marginBottom: '2rem' }}>
                <div className="page-header-left">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="eyebrow">{new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <DigitalClock />
                  </div>
                  <h1>
                    <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>
                      {(() => {
                        const h = new Date().getHours();
                        if (h < 12) return 'Good morning';
                        if (h < 17) return 'Good afternoon';
                        return 'Good evening';
                      })()},
                    </span> {session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0]}
                  </h1>
                </div>
                <div className="page-header-right" style={{ display: 'flex', gap: '8px' }}>
                  <MonthSel />
                </div>
              </div>

              {/* Premium Bento Dashboard Layout */}
              <div className="dashboard-bento">

                {/* ROW 1: Key Metrics */}
                <div className="panel db-metric-nw" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderTop: '4px solid var(--accent)', background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(245, 158, 11, 0.05) 100%)' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sparkles size={14} style={{ color: 'var(--accent)' }}/> Net Worth
                  </span>
                  <span style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-1px', marginBottom: 2 }}>{fmt(totalWealth)}</span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>(Cash + Bank Balances)</span>
                </div>
                
                <div className="panel db-metric-assets" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderTop: '4px solid var(--purple)', background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(168, 85, 247, 0.05) 100%)' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Briefcase size={14} style={{ color: 'var(--purple)' }}/> Net Assets
                  </span>
                  <span style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--purple)', letterSpacing: '-1px', marginBottom: 2 }}>{fmt(totalWealth + lentOut)}</span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>(Net Worth + Khata Lent)</span>
                </div>

                <div className="panel db-metric-dues" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderTop: ccDebt > 0 ? '4px solid var(--red)' : '4px solid var(--green)', background: ccDebt > 0 ? 'linear-gradient(135deg, var(--bg-card) 0%, rgba(239, 68, 68, 0.08) 100%)' : 'linear-gradient(135deg, var(--bg-card) 0%, rgba(16, 185, 129, 0.05) 100%)' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CreditCard size={14} style={{ color: ccDebt > 0 ? 'var(--red)' : 'var(--green)' }}/> Credit Card Dues
                  </span>
                  <span style={{ fontSize: '2rem', fontWeight: 900, color: ccDebt > 0 ? 'var(--red)' : 'var(--green)', letterSpacing: '-1px', marginBottom: 2 }}>{fmt(ccDebt)}</span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>(Isolated Total Pending Bills)</span>
                </div>

                <div className="panel db-metric-savings" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderTop: '4px solid var(--blue)', background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(59, 130, 246, 0.05) 100%)' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <PieChart size={14} style={{ color: 'var(--blue)' }}/> Net Savings
                  </span>
                  <span style={{ fontSize: '2rem', fontWeight: 900, color: net >= 0 ? 'var(--blue)' : 'var(--red)', letterSpacing: '-1px', marginBottom: 2 }}>{(net >= 0 ? '+' : '') + fmt(net)}</span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>({monthStr} Income - Expense)</span>
                </div>

                <div className="panel db-metric-inc" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderTop: '4px solid var(--green)' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <TrendingUp size={14} style={{ color: 'var(--green)' }}/> Total Income ({monthStr})
                  </span>
                  <span style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--green)', letterSpacing: '-1px', marginBottom: 2 }}>{fmt(totInc)}</span>
                </div>

                <div className="panel db-metric-exp" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderTop: '4px solid var(--red)' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <TrendingDown size={14} style={{ color: 'var(--red)' }}/> Total Expense ({monthStr})
                  </span>
                  <span style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--red)', letterSpacing: '-1px', marginBottom: 2 }}>{fmt(totExp)}</span>
                </div>

                {/* ROW 2: Analytics & Quick Actions */}
                <div className="panel db-chart-main" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                  <div className="panel-header" style={{ background: 'transparent', borderBottom: '1px solid var(--border)', padding: '0 0 1rem 0', marginBottom: '1.5rem' }}>
                    <TrendingUp size={18} style={{ color: 'var(--accent)' }}/>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Cashflow Trend</h3>
                  </div>
                  <div style={{ flex: 1, position: 'relative', minHeight: '260px' }}>
                    <Line data={lineData} options={{ ...chartOpts, maintainAspectRatio: false }} />
                  </div>
                </div>

                <div className="panel db-quick-add" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.25rem' }}>
                    <Plus size={18} style={{ color: 'var(--green)' }}/>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: 0.5, textTransform: 'uppercase' }}>Quick Entry</h3>
                  </div>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const f = e.target;
                    const date = f.date.value;
                    const inc = parseFloat(f.income.value) || 0;
                    const exp = parseFloat(f.expense.value) || 0;
                    if (!date || (inc === 0 && exp === 0)) { alert('Enter a date and at least one amount.'); return; }
                    
                    if (inc > 0) saveIncomeExpense(null, date, inc, 'Others', 'income');
                    if (exp > 0) saveIncomeExpense(null, date, exp, 'Others', 'expenses');
                    f.reset();
                    f.date.value = new Date().toISOString().split('T')[0];
                  }} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', flex: 1 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date</label>
                      <input type="date" name="date" required defaultValue={new Date().toISOString().split('T')[0]} style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-primary)', height: '44px', outline: 'none' }}/>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Income (₹)</label>
                        <input type="number" name="income" placeholder="0" min="0" step="0.01" style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--green)', fontWeight: 800, height: '44px', outline: 'none', width: '100%' }}/>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Expense (₹)</label>
                        <input type="number" name="expense" placeholder="0" min="0" step="0.01" style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--red)', fontWeight: 800, height: '44px', outline: 'none', width: '100%' }}/>
                      </div>
                    </div>
                    <div style={{ marginTop: 'auto' }}>
                      <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0 24px', fontWeight: 800, fontSize: '0.9rem', borderRadius: '8px', textTransform: 'uppercase', letterSpacing: '0.5px', height: '44px' }}>Save Entry</button>
                    </div>
                  </form>
                </div>

                {/* ROW 3: Distributions & Accounts */}
                <div className="panel db-accounts" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexShrink: 0, paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Building size={16} style={{ color: 'var(--blue)' }}/>
                      <h3 style={{ fontSize: '0.95rem', fontWeight: 800 }}>Linked Accounts</h3>
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, background: 'rgba(59, 130, 246, 0.15)', color: 'var(--blue)', padding: '4px 10px', borderRadius: '12px' }}>{banks.length} Total</span>
                  </div>
                  
                  {/* Cash on Hand Highlight */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0.05) 100%)', borderRadius: '12px', marginBottom: '1rem', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <IndianRupee size={14} style={{ color: 'var(--green)' }}/> Cash on Hand
                    </span>
                    <span style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--green)' }}>{fmt(cash)}</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingRight: '4px' }}>
                    {getSortedBanks(banks).map(b => {
                      const currentPin = typeof b.pin_order === 'number' && b.pin_order > 0 ? b.pin_order : (typeof b.is_pinned === 'number' && b.is_pinned > 0 ? b.is_pinned : (b.is_pinned ? 1 : 0));
                      return (
                        <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-hover)', borderRadius: '8px' }}>
                          <div>
                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                              {b.bankName}
                              {currentPin > 0 && <span style={{ fontSize: '0.65rem', background: 'var(--accent-mid)', color: 'var(--accent)', padding: '1px 5px', borderRadius: '4px', fontWeight: 800 }}>#{currentPin}</span>}
                            </span>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>•••• {b.accountNumber.slice(-4)}</span>
                          </div>
                          <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--blue)' }}>{fmt(b.balance)}</span>
                        </div>
                      );
                    })}
                    {banks.length === 0 && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '1rem' }}>No accounts added</div>}
                  </div>
                </div>

                <div className="panel db-chart-bar" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                  <div className="panel-header" style={{ background: 'transparent', borderBottom: '1px solid var(--border)', padding: '0 0 1rem 0', marginBottom: '1.5rem' }}>
                    <BarChart2 size={18} style={{ color: 'var(--blue)' }}/>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Income vs Expense</h3>
                  </div>
                  <div style={{ flex: 1, position: 'relative', minHeight: '220px' }}>
                    <Bar data={yearlyBarData} options={{ ...chartOpts, maintainAspectRatio: false, plugins: { ...chartOpts.plugins, legend: { position: 'top', labels: { boxWidth: 12 } } } }} />
                  </div>
                </div>

                <div className="panel db-khata" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexShrink: 0, paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Users size={16} style={{ color: 'var(--amber)' }}/>
                      <h3 style={{ fontSize: '0.95rem', fontWeight: 800 }}>Khata Overview</h3>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'var(--bg-hover)', borderRadius: '12px', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>You Lent (To Receive)</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 900, color: 'var(--green)' }}>{fmt(lentOut)}</span>
                  </div>
                  
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                      Track people who owe you money in the Khata section.
                    </p>
                  </div>
                  
                  <button className="btn" onClick={() => setView('borrowers')} style={{ width: '100%', marginTop: 'auto', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--amber)', fontWeight: 800, border: 'none', padding: '10px' }}>
                    Manage Khata
                  </button>
                </div>

                {/* ROW 4: Daily Cashflow Summary */}
                <div className="panel db-transactions data-table-wrap" style={{ padding: '0', overflow: 'hidden' }}>
                  <div className="panel-header" style={{ background: 'transparent', borderBottom: '1px solid var(--border)', padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>Daily Cashflow Summary</h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{monthStr} Overview</span>
                  </div>
                  <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    <table className="data-table">
                      <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
                        <tr>
                          <th>Date</th>
                          <th style={{ textAlign: 'right', color: 'var(--green)' }}>Income (+)</th>
                          <th style={{ textAlign: 'right', color: 'var(--red)' }}>Expense (-)</th>
                          <th style={{ textAlign: 'right' }}>Net Profit/Loss</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const dailyData = [];
                          for (let i = 1; i <= daysInMonth; i++) {
                            const d = new Date(month.getFullYear(), month.getMonth(), i);
                            const dStr = d.toDateString();
                            const inc = curInc.filter(x => new Date(x.date).toDateString() === dStr).reduce((s, x) => s + x.amount, 0);
                            const exp = curExp.filter(x => new Date(x.date).toDateString() === dStr).reduce((s, x) => s + x.amount, 0);
                            if (inc > 0 || exp > 0) {
                              dailyData.push({ date: d, inc, exp, net: inc - exp });
                            }
                          }
                          dailyData.sort((a,b) => b.date - a.date);
                          
                          if (dailyData.length === 0) return <tr><td colSpan="4" className="empty-state">No transactions in {monthStr}.</td></tr>;

                          return dailyData.map(d => (
                            <tr key={d.date.getTime()}>
                              <td style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{d.date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                              <td style={{ textAlign: 'right', fontWeight: 700, color: d.inc > 0 ? 'var(--green)' : 'var(--text-muted)' }}>
                                {d.inc > 0 ? `+${fmt(d.inc)}` : '-'}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 700, color: d.exp > 0 ? 'var(--red)' : 'var(--text-muted)' }}>
                                {d.exp > 0 ? `-${fmt(d.exp)}` : '-'}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 800, color: d.net >= 0 ? 'var(--blue)' : 'var(--red)', fontSize: '0.95rem' }}>
                                {d.net >= 0 ? '+' : ''}{fmt(d.net)}
                              </td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            </div>
          )}


          {/* ══ INCOMES PAGE ══ */}
          {view === 'incomes' && (
            <div className="fade-in-view">
              <div className="page-header" style={{ marginBottom: '1.5rem' }}>
                <div className="page-header-left">
                  <span className="eyebrow">Cash Inflow & Revenue</span>
                  <h1>Incomes</h1>
                </div>
                <div className="page-header-right" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <MonthSel />
                  <button className="btn btn-primary" onClick={() => openModal('Add Income', 'income')}>
                    <Plus size={15}/> Add Income
                  </button>
                </div>
              </div>

              {/* Summary Metric Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
                <div className="panel" style={{ padding: '1.5rem', borderTop: '4px solid var(--green)', background: 'var(--bg-secondary)', boxShadow: 'var(--shadow-sm)' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>🟢 Monthly Income ({monthStr})</span>
                  <span style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--green)' }}>{fmt(totInc)}</span>
                </div>
                <div className="panel" style={{ padding: '1.5rem', borderTop: '4px solid var(--accent)', background: 'var(--bg-secondary)', boxShadow: 'var(--shadow-sm)' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>📊 Total Income Entries</span>
                  <span style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text-primary)' }}>{curInc.length} Transactions</span>
                </div>
              </div>

              {/* Incomes Data Table */}
              <div className="panel data-table-wrap" style={{ padding: '0', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-sm)' }}>
                <div className="panel-header" style={{ background: 'transparent', borderBottom: '1px solid var(--border)', padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ color: 'var(--green)', fontSize: '1.05rem', fontWeight: 800 }}>Income Records</h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{curInc.length} records in {monthStr}</span>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Category</th>
                      <th>Amount (₹)</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {curInc.sort((a,b) => new Date(b.date) - new Date(a.date)).map(item => (
                      <tr key={item.id}>
                        <td style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{fmtDate(item.date)}</td>
                        <td><span className="badge" style={{ background: 'var(--green-bg)', color: 'var(--green)', padding: '4px 10px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700 }}>{item.category || 'Salary / Others'}</span></td>
                        <td style={{ fontWeight: 800, color: 'var(--green)', fontSize: '0.98rem' }}>+{fmt(item.amount)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="action-btns" style={{ justifyContent: 'flex-end', gap: '6px' }}>
                            <button className="btn-icon" title="Edit" onClick={() => openModal('Edit Income', 'income', item)}>
                              <Edit3 size={14}/>
                            </button>
                            <button className="btn-icon danger" title="Delete" onClick={() => deleteIncomeExpense(item.id, 'income')}>
                              <Trash2 size={14}/>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {curInc.length === 0 && <tr><td colSpan="4" className="empty-state">No income records for {monthStr}. Click "+ Add Income" to record one!</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══ EXPENSES PAGE ══ */}
          {view === 'expenses' && (
            <div className="fade-in-view">
              <div className="page-header" style={{ marginBottom: '1.5rem' }}>
                <div className="page-header-left">
                  <span className="eyebrow">Outflow & Expenditures</span>
                  <h1>Expenses</h1>
                </div>
                <div className="page-header-right" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <MonthSel />
                  <button className="btn btn-primary" style={{ background: 'var(--red)', borderColor: 'var(--red)' }} onClick={() => openModal('Add Expense', 'expenses')}>
                    <Plus size={15}/> Add Expense
                  </button>
                </div>
              </div>

              {/* Summary Metric Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
                <div className="panel" style={{ padding: '1.5rem', borderTop: '4px solid var(--red)', background: 'var(--bg-secondary)', boxShadow: 'var(--shadow-sm)' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>🔴 Monthly Expenses ({monthStr})</span>
                  <span style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--red)' }}>{fmt(totExp)}</span>
                </div>
                <div className="panel" style={{ padding: '1.5rem', borderTop: '4px solid var(--amber)', background: 'var(--bg-secondary)', boxShadow: 'var(--shadow-sm)' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>📊 Total Expense Entries</span>
                  <span style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text-primary)' }}>{curExp.length} Transactions</span>
                </div>
              </div>

              {/* Expenses Data Table */}
              <div className="panel data-table-wrap" style={{ padding: '0', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-sm)' }}>
                <div className="panel-header" style={{ background: 'transparent', borderBottom: '1px solid var(--border)', padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ color: 'var(--red)', fontSize: '1.05rem', fontWeight: 800 }}>Expense Records</h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{curExp.length} records in {monthStr}</span>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Category</th>
                      <th>Amount (₹)</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {curExp.sort((a,b) => new Date(b.date) - new Date(a.date)).map(item => (
                      <tr key={item.id}>
                        <td style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{fmtDate(item.date)}</td>
                        <td><span className="badge" style={{ background: 'var(--red-bg)', color: 'var(--red)', padding: '4px 10px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700 }}>{item.category || 'Others'}</span></td>
                        <td style={{ fontWeight: 800, color: 'var(--red)', fontSize: '0.98rem' }}>-{fmt(item.amount)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="action-btns" style={{ justifyContent: 'flex-end', gap: '6px' }}>
                            <button className="btn-icon" title="Edit" onClick={() => openModal('Edit Expense', 'expenses', item)}>
                              <Edit3 size={14}/>
                            </button>
                            <button className="btn-icon danger" title="Delete" onClick={() => deleteIncomeExpense(item.id, 'expenses')}>
                              <Trash2 size={14}/>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {curExp.length === 0 && <tr><td colSpan="4" className="empty-state">No expense records for {monthStr}. Click "+ Add Expense" to record one!</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══ MY WEALTH ══ */}
          {(view === 'accounts' || view === 'banks') && (() => {
            const bankTotal = banks.reduce((s, b) => s + b.balance, 0);
            const totalAssets = totalWealth + lentOut;
            const cashPct = totalAssets > 0 ? ((cash / totalAssets) * 100).toFixed(0) : 0;
            const bankPct = totalAssets > 0 ? ((bankTotal / totalAssets) * 100).toFixed(0) : 0;
            const lentPct = totalAssets > 0 ? ((lentOut / totalAssets) * 100).toFixed(0) : 0;

            return (
              <div className="fade-in-view">
                <div className="page-header" style={{ marginBottom: '2rem' }}>
                  <div className="page-header-left">
                    <span className="eyebrow">Assets & Liquidity</span>
                    <h1>All Amount & Assets</h1>
                  </div>
                  <div className="page-header-right">
                    <button className="btn btn-primary" onClick={() => openModal('Add Bank Account', 'bank')}>
                      <Plus size={15}/> Add Account
                    </button>
                  </div>
                </div>

                {/* Elegant Total Assets, Wealth, Khata & Dues Header Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
                  {/* Total Assets Card */}
                  <div className="panel" style={{ padding: '1.75rem', background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(168, 85, 247, 0.08) 100%)', borderTop: '4px solid var(--purple)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ color: 'var(--purple)', fontSize: '0.8rem', fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                        💼 Total Assets
                      </span>
                      <div style={{ background: 'rgba(168, 85, 247, 0.15)', padding: '10px', borderRadius: '50%', color: 'var(--purple)' }}>
                        <Briefcase size={20} />
                      </div>
                    </div>
                    <span style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-1.2px', lineHeight: 1.1 }}>
                      {fmt(totalAssets)}
                    </span>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 10, fontWeight: 500 }}>
                      Includes Cash ({fmt(cash)}), Banks ({fmt(bankTotal)}), & Khata ({fmt(lentOut)}).
                    </p>
                  </div>

                  {/* Total Liquid Wealth Card */}
                  <div className="panel" style={{ padding: '1.75rem', background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(59, 130, 246, 0.08) 100%)', borderTop: '4px solid var(--blue)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ color: 'var(--blue)', fontSize: '0.8rem', fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                        💎 Total Liquid Amount
                      </span>
                      <div style={{ background: 'rgba(59, 130, 246, 0.15)', padding: '10px', borderRadius: '50%', color: 'var(--blue)' }}>
                        <Wallet size={20} />
                      </div>
                    </div>
                    <span style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--blue)', letterSpacing: '-1.2px', lineHeight: 1.1 }}>
                      {fmt(totalWealth)}
                    </span>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 10, fontWeight: 500 }}>
                      Immediately accessible liquidity (Cash + Banks).
                    </p>
                  </div>

                  {/* Total Khata (Lent Out) Card */}
                  <div className="panel" style={{ padding: '1.75rem', background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(245, 158, 11, 0.08) 100%)', borderTop: '4px solid var(--amber)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ color: 'var(--amber)', fontSize: '0.8rem', fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                        🤝 Khata (Lent Out)
                      </span>
                      <div style={{ background: 'rgba(245, 158, 11, 0.15)', padding: '10px', borderRadius: '50%', color: 'var(--amber)' }}>
                        <Users size={20} />
                      </div>
                    </div>
                    <span style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-1.2px', lineHeight: 1.1 }}>
                      {fmt(lentOut)}
                    </span>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 10, fontWeight: 500 }}>
                      Total money lent to borrowers pending recovery.
                    </p>
                  </div>
                </div>

                {/* Visual Asset Distribution Ratio Bar */}
                <div className="panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Complete Asset Breakdown
                    </span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--purple)' }}>
                      Total Assets: {fmt(totalAssets)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', height: 10, borderRadius: 99, overflow: 'hidden', background: 'var(--border)', marginBottom: '0.75rem' }}>
                    <div style={{ width: `${cashPct}%`, background: 'var(--green)' }} title={`Cash: ${cashPct}%`}/>
                    <div style={{ width: `${bankPct}%`, background: 'var(--blue)' }} title={`Banks: ${bankPct}%`}/>
                    <div style={{ width: `${lentPct}%`, background: 'var(--purple)' }} title={`Khata: ${lentPct}%`}/>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700 }}>
                    <span style={{ color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }}/> Cash: {fmt(cash)} ({cashPct}%)
                    </span>
                    <span style={{ color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--blue)' }}/> Banks: {fmt(bankTotal)} ({bankPct}%)
                    </span>
                    <span style={{ color: 'var(--purple)', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--purple)' }}/> Khata (Lent): {fmt(lentOut)} ({lentPct}%)
                    </span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '1.5rem' }}>
                  {/* Cash Card */}
                  <div className="panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1.5rem', borderTop: '4px solid var(--green)' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <Wallet size={16} color="var(--green)"/>
                        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Cash on Hand</span>
                      </div>
                      <div style={{ fontSize: '2.4rem', fontWeight: 900, color: 'var(--green)', letterSpacing: -1 }}>{fmt(cash)}</div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Physical liquidity (in hand)</span>
                    </div>
                    
                    <form 
                      onSubmit={e => { e.preventDefault(); const v = e.target.c.value; if (v) { updateCash(parseFloat(v)); e.target.reset(); }}} 
                      style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--border)', paddingTop: '1rem' }}
                    >
                      <div style={{ position: 'relative', flex: 1 }}>
                        <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.85rem' }}>₹</span>
                        <input 
                          name="c" 
                          type="number" 
                          placeholder="New amount" 
                          min="0" 
                          required
                          style={{
                            width: '100%',
                            padding: '8px 10px 8px 20px',
                            background: 'var(--bg-base)',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            fontSize: '0.85rem',
                            fontWeight: 700
                          }}
                        />
                      </div>
                      <button type="submit" className="btn btn-primary" style={{ padding: '0 16px', borderRadius: '6px', fontSize: '0.8rem', height: '34px' }}>Update</button>
                    </form>
                  </div>

                  {/* Bank Cards */}
                  {getSortedBanks(banks).map((acc) => {
                    const currentPin = typeof acc.pin_order === 'number' && acc.pin_order > 0 
                      ? acc.pin_order 
                      : (typeof acc.is_pinned === 'number' && acc.is_pinned > 0 ? acc.is_pinned : (acc.is_pinned ? 1 : 0));

                    return (
                      <div 
                        key={acc.id} 
                        className="panel" 
                        style={{ 
                          padding: '1.5rem', 
                          display: 'flex', 
                          flexDirection: 'column', 
                          justifyContent: 'space-between', 
                          gap: '1.25rem', 
                          borderTop: currentPin > 0 ? '4px solid var(--accent)' : '4px solid var(--blue)',
                          position: 'relative'
                        }}
                      >
                        <div style={{ position: 'absolute', top: '1rem', right: '1rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <button 
                            onClick={() => {
                              const input = prompt(`Set Pin Position Number for ${acc.bankName} (e.g. 1 for top priority, 2 for second, or 0 to unpin):`, currentPin > 0 ? currentPin : '');
                              if (input !== null) {
                                setBankPinOrder(acc.id, input);
                              }
                            }}
                            style={{ 
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: currentPin > 0 ? 'var(--accent-mid)' : 'var(--bg-hover)', 
                              border: currentPin > 0 ? '1px solid var(--accent)' : '1px solid var(--border)', 
                              padding: '4px 10px',
                              borderRadius: '12px',
                              cursor: 'pointer', 
                              color: currentPin > 0 ? 'var(--accent)' : 'var(--text-muted)',
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              transition: 'all 0.2s ease'
                            }}
                            title={currentPin > 0 ? `Pinned at #${currentPin}. Click to change position number or unpin.` : "Click to pin by position number (#1, #2, #3...)"}
                          >
                            <Pin size={13} fill={currentPin > 0 ? 'var(--accent)' : 'transparent'} />
                            <span>{currentPin > 0 ? `#${currentPin}` : 'Pin #'}</span>
                          </button>
                        </div>
                        <div style={{ paddingRight: '4.5rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                            <div>
                              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{acc.bankName}</h3>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{acc.type} Account</span>
                            </div>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', background: 'var(--border)', padding: '3px 8px', borderRadius: '4px', fontWeight: 750, fontFamily: 'monospace' }}>
                              {acc.accountNumber.slice(-4)}
                            </span>
                          </div>
                        </div>

                        <div style={{ background: 'var(--bg-base)', borderRadius: '8px', padding: '10px 14px', border: '1px solid var(--border)' }}>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>Balance</span>
                          <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--blue)' }}>{fmt(acc.balance)}</div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                          <button 
                            onClick={() => openModal('Edit Bank Account', 'bank', acc)}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-secondary)', cursor: 'pointer' }}
                          >
                            <Edit3 size={13}/> Edit Account
                          </button>
                          <button 
                            onClick={() => { if (confirm(`Remove ${acc.bankName} account?`)) deleteBank(acc.id); }}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', fontWeight: 800, color: 'var(--red)', cursor: 'pointer' }}
                          >
                            <Trash2 size={13}/> Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}


          {/* ══ CREDIT CARDS DASHBOARD & SMART SUITE ══ */}
          {view === 'credit-cards' && (() => {
            const totalLimit = creditCards.reduce((sum, c) => sum + (parseFloat(c.limit) || 0), 0);
            const totalDebt = creditCards.reduce((sum, c) => sum + (parseFloat(c.outstanding) || 0), 0);
            const availableCredit = Math.max(0, totalLimit - totalDebt);
            const utilizationPct = totalLimit > 0 ? Math.min(100, (totalDebt / totalLimit) * 100) : 0;

            return (
              <div className="fade-in-view" style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
                {/* Page Header */}
                <div className="page-header" style={{ marginBottom: '0.5rem' }}>
                  <div className="page-header-left">
                    <span className="eyebrow">FINANCIAL INTELLIGENCE & CREDIT SUITE</span>
                    <h1>Credit Cards</h1>
                  </div>
                  <div className="page-header-right" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Multilingual Advice Language Selector Switch */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-secondary)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                      <button
                        onClick={() => setAdvisorLang('hinglish')}
                        style={{
                          padding: '6px 12px',
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          borderRadius: '8px',
                          border: 'none',
                          cursor: 'pointer',
                          background: advisorLang === 'hinglish' ? 'var(--accent)' : 'transparent',
                          color: advisorLang === 'hinglish' ? '#fff' : 'var(--text-muted)',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        🇮🇳 Hinglish
                      </button>
                      <button
                        onClick={() => setAdvisorLang('english')}
                        style={{
                          padding: '6px 12px',
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          borderRadius: '8px',
                          border: 'none',
                          cursor: 'pointer',
                          background: advisorLang === 'english' ? 'var(--accent)' : 'transparent',
                          color: advisorLang === 'english' ? '#fff' : 'var(--text-muted)',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        🇬🇧 English
                      </button>
                      <button
                        onClick={() => setAdvisorLang('hindi')}
                        style={{
                          padding: '6px 12px',
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          borderRadius: '8px',
                          border: 'none',
                          cursor: 'pointer',
                          background: advisorLang === 'hindi' ? 'var(--accent)' : 'transparent',
                          color: advisorLang === 'hindi' ? '#fff' : 'var(--text-muted)',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        🕉️ हिंदी
                      </button>
                    </div>

                    <button
                      className="btn btn-primary"
                      onClick={() => setModal({ open: true, type: 'card' })}
                    >
                      <Plus size={15}/> Add Credit Card
                    </button>
                  </div>
                </div>

                {/* Top Metrics Bento Grid */}
                <div className="cc-metrics-bento" style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '1.25rem'
                }}>
                  {/* Card 1: Total Limit */}
                  <div className="panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderTop: '3px solid var(--accent)' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CreditCard size={14} style={{ color: 'var(--accent)' }} /> Total Limit
                    </div>
                    <div style={{ marginTop: '1rem' }}>
                      <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
                        {fmt(totalLimit)}
                      </div>
                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginTop: '2px' }}>
                        {creditCards.length} Active {creditCards.length === 1 ? 'Card' : 'Cards'}
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Total Outstanding Debt */}
                  <div className="panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderTop: totalDebt > 0 ? '3px solid var(--red)' : '3px solid var(--green)' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: totalDebt > 0 ? 'var(--red)' : 'var(--green)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <TrendingUp size={14} /> Total Outstanding
                    </div>
                    <div style={{ marginTop: '1rem' }}>
                      <div style={{ fontSize: '1.75rem', fontWeight: 900, color: totalDebt > 0 ? 'var(--red)' : 'var(--green)', letterSpacing: '-0.5px' }}>
                        {fmt(totalDebt)}
                      </div>
                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginTop: '2px' }}>
                        {creditCards.filter(c => parseFloat(c.outstanding) > 0).length} Cards With Due Balance
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Available Credit */}
                  <div className="panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderTop: '3px solid var(--green)' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--green)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ShieldCheck size={14} /> Available Credit
                    </div>
                    <div style={{ marginTop: '1rem' }}>
                      <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--green)', letterSpacing: '-0.5px' }}>
                        {fmt(availableCredit)}
                      </div>
                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginTop: '2px' }}>
                        Ready Liquidity Buffer
                      </div>
                    </div>
                  </div>

                  {/* Card 4: Utilization Gauge */}
                  <div className="panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderTop: utilizationPct > 30 ? '3px solid var(--amber)' : '3px solid var(--green)' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: utilizationPct > 30 ? 'var(--amber)' : 'var(--green)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Zap size={14} /> Credit Utilization
                    </div>
                    <div style={{ marginTop: '1rem' }}>
                      <div style={{ fontSize: '1.75rem', fontWeight: 900, color: utilizationPct > 50 ? 'var(--red)' : utilizationPct > 30 ? 'var(--amber)' : 'var(--text-primary)', letterSpacing: '-0.5px' }}>
                        {utilizationPct.toFixed(1)}%
                      </div>
                      <div style={{ width: '100%', height: '4px', borderRadius: '2px', background: 'var(--border)', marginTop: '6px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${utilizationPct}%`, background: utilizationPct > 50 ? 'var(--red)' : utilizationPct > 30 ? 'var(--amber)' : 'var(--green)', borderRadius: '2px', transition: 'width 0.3s ease' }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Credit Cards Grid */}
                {creditCards.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.5rem' }}>
                    {creditCards.map(card => {
                      const limit = parseFloat(card.limit) || 0;
                      const debt = parseFloat(card.outstanding) || 0;
                      const avail = Math.max(0, limit - debt);
                      const cardUtil = limit > 0 ? Math.min(100, (debt / limit) * 100) : 0;

                      // Calculate 0% Interest Spend Advice & Statement dates
                      const stmtVal = card.statementDate || card.statement_date || card.statementDay || 1;
                      const dueVal = card.dueDate || card.due_date || card.dueDay || 20;
                      const smart = getSmartCardDates(stmtVal, dueVal, month);

                      // Determine Spend Advice Badge Color & Multilingual Text
                      let adviceBadgeBg = 'rgba(16, 185, 129, 0.12)';
                      let adviceBorder = 'rgba(16, 185, 129, 0.3)';
                      let adviceColor = 'var(--green)';
                      let adviceIcon = <Sparkles size={14} color="var(--green)" />;

                      let adviceTitle = '';
                      let adviceSub = '';

                      if (smart.todayGraceDays < 28) {
                        adviceBadgeBg = 'rgba(239, 68, 68, 0.12)';
                        adviceBorder = 'rgba(239, 68, 68, 0.3)';
                        adviceColor = 'var(--red)';
                        adviceIcon = <AlertTriangle size={14} color="var(--red)" />;

                        if (advisorLang === 'hindi') {
                          adviceTitle = `⚠️ आज बड़ा खर्चा न करें (केवल ${smart.todayGraceDays} दिन का फ्री क्रेडिट)`;
                          adviceSub = `अगला स्टेटमेंट ${smart.stmtFull} को बनेगा। तब तक रुकें ताकि पूरे 50 दिन का 0% ब्याज लाभ मिले!`;
                        } else if (advisorLang === 'hinglish') {
                          adviceTitle = `⚠️ AAJ BADA KHARCHA MAT KAREIN (Sirf ${smart.todayGraceDays} Din Ka Free Credit)`;
                          adviceSub = `Naya statement ${smart.stmtFull} ko banega. Uske baad spend karein taaki pure 50 din ka 0% interest mile!`;
                        } else {
                          adviceTitle = `AVOID BIG SPENDS TODAY (Only ${smart.todayGraceDays} Days Free Credit)`;
                          adviceSub = `Next statement generates on ${smart.stmtFull}. Wait until then to get full 50 days free credit!`;
                        }
                      } else if (smart.todayGraceDays < 40) {
                        adviceBadgeBg = 'rgba(245, 158, 11, 0.12)';
                        adviceBorder = 'rgba(245, 158, 11, 0.3)';
                        adviceColor = 'var(--amber)';
                        adviceIcon = <Zap size={14} color="var(--amber)" />;

                        if (advisorLang === 'hindi') {
                          adviceTitle = `⚡ सामान्य क्रेडिट विंडो (${smart.todayGraceDays} दिन बचे हैं)`;
                          adviceSub = `स्टेटमेंट ${smart.stmtFull} को बना था। बिल भुगतान तिथि ${smart.todayRepayFormatted} है।`;
                        } else if (advisorLang === 'hinglish') {
                          adviceTitle = `⚡ NORMAL CREDIT WINDOW (${smart.todayGraceDays} Din Baaki Hain)`;
                          adviceSub = `Statement ${smart.stmtFull} ko bana tha. Bill payment date ${smart.todayRepayFormatted} hai.`;
                        } else {
                          adviceTitle = `MODERATE CREDIT CYCLE (${smart.todayGraceDays} Days Free Credit Remaining)`;
                          adviceSub = `Billed on ${smart.stmtFull} & due on ${smart.todayRepayFormatted}.`;
                        }
                      } else {
                        if (advisorLang === 'hindi') {
                          adviceTitle = `🟢 आज खर्च करने का सही समय (${smart.todayGraceDays} दिन 0% ब्याज!)`;
                          adviceSub = `आज खर्च करें और ${smart.todayRepayFormatted} को चुकाएं — बिना किसी ब्याज या पेनल्टी के!`;
                        } else if (advisorLang === 'hinglish') {
                          adviceTitle = `🟢 AAJ SPEND KARNE KA BEST TIME (${smart.todayGraceDays} Din 0% Interest!)`;
                          adviceSub = `Aaj spend karein aur ${smart.todayRepayFormatted} ko repay karein — Bina kisi interest ya fine ke!`;
                        } else {
                          adviceTitle = `BEST TIME TO SPEND TODAY (${smart.todayGraceDays} Days 0% Interest)`;
                          adviceSub = `Spend today and repay on ${smart.todayRepayFormatted} with 0% interest & 0 fine!`;
                        }
                      }

                      return (
                        <div
                          key={card.id}
                          className="panel"
                          style={{
                            padding: '1.25rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '1rem',
                            position: 'relative',
                            overflow: 'hidden',
                            borderTop: debt > 0 ? '3px solid var(--amber)' : '3px solid var(--green)'
                          }}
                        >
                          {/* Card Header Info */}
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <CreditCard size={20} color="var(--accent)" />
                              </div>
                              <div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1 }}>
                                  {card.cardName || 'Credit Card'}
                                </div>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginTop: '4px', display: 'flex', gap: '6px' }}>
                                  <span style={{ textTransform: 'uppercase', color: 'var(--accent)' }}>{card.bankName}</span>
                                  <span>•</span>
                                  <span style={{ fontFamily: 'monospace' }}>**{card.cardNumber || 'XXXX'}</span>
                                </div>
                              </div>
                            </div>
                            
                            {/* Action Icons */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <button onClick={() => setModal({ open: true, type: 'card', item: card })} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}>
                                <Edit3 size={15} />
                              </button>
                              <button onClick={() => { if (confirm(`Delete ${card.cardName}?`)) deleteCreditCard(card.id); }} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: '4px' }}>
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>

                          {/* 🧠 SMART SPEND ADVISOR BADGE */}
                          <div style={{
                            background: adviceBadgeBg,
                            border: `1px solid ${adviceBorder}`,
                            borderRadius: '10px',
                            padding: '8px 12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px'
                          }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 900, color: adviceColor, display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase' }}>
                              {adviceIcon} {adviceTitle}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                              {adviceSub}
                            </div>
                          </div>

                          {/* Slim Debt vs Limit Info */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                              <div>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Outstanding Due</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: debt > 0 ? 'var(--red)' : 'var(--green)', lineHeight: 1, marginTop: '2px' }}>
                                  {fmt(debt)}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Limit: {fmt(limit)}</div>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--green)' }}>Avail: {fmt(avail)}</div>
                              </div>
                            </div>
                            {/* Progress bar */}
                            <div style={{ width: '100%', height: '4px', borderRadius: '2px', background: 'var(--border)', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${cardUtil}%`, background: cardUtil > 50 ? 'var(--red)' : 'var(--green)', borderRadius: '2px' }} />
                            </div>
                          </div>

                          {/* Action Buttons & Dates */}
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                                <Calendar size={10} style={{ marginRight: 2 }}/> Stmt: {card.statementDate || '--'}th
                              </div>
                              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: debt > 0 ? 'var(--red)' : 'var(--text-muted)' }}>
                                <Clock size={10} style={{ marginRight: 2 }}/> Due: {card.dueDate || '--'}th
                              </div>
                            </div>
                            <button className="btn btn-secondary" onClick={() => setCcSpendModal({ open: true, card })} style={{ padding: '6px 10px', fontSize: '0.75rem', fontWeight: 800 }}>
                              Log Spend
                            </button>
                            <button className="btn btn-primary" onClick={() => setCcSpendModal({ open: true, card, isRepay: true })} style={{ padding: '6px 10px', fontSize: '0.75rem', fontWeight: 800 }}>
                              Pay Bill
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Empty State */
                  <div className="panel" style={{
                    padding: '4rem 2rem',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '24px',
                    border: '1px solid var(--border)'
                  }}>
                    <div style={{
                      width: '72px',
                      height: '72px',
                      borderRadius: '22px',
                      background: 'var(--green-bg)',
                      color: 'var(--green)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: '1.25rem'
                    }}>
                      <CreditCard size={36} />
                    </div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 8px 0' }}>
                      No Credit Cards Added Yet
                    </h2>
                    <p style={{ maxWidth: '420px', fontSize: '0.9rem', color: 'var(--text-muted)', margin: '0 0 1.5rem 0', lineHeight: 1.5 }}>
                      Track your HDFC, ICICI, SBI, Axis, or Amex credit card limits, bill due dates, and 0% interest spend recommendations in real-time.
                    </p>
                    <button
                      className="btn btn-primary"
                      onClick={() => setModal({ open: true, type: 'card' })}
                      style={{ padding: '12px 24px', fontSize: '0.9rem', fontWeight: 800 }}
                    >
                      <Plus size={16} /> Add Your First Credit Card
                    </button>
                  </div>
                )}
              </div>
            );
          })()}




          {/* ══ BORROWERS ══ */}
          {view === 'borrowers' && (
            <div className="fade-in-view">
              <div className="page-header">
                <div className="page-header-left">
                  <span className="eyebrow">Digital Khata Book</span>
                  <h1>Khata</h1>
                </div>
                <div className="page-header-right">
                  <button className="btn btn-primary" onClick={() => openModal('Add Khata Entry', 'borrower')}>
                    <Plus size={15}/> New Entry
                  </button>
                </div>
              </div>

              <div className="stat-grid" style={{ marginBottom: '1.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                <div className="panel" style={{ padding: '1.25rem', borderTop: '3px solid var(--accent)' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}><TrendingUp size={14} color="var(--accent)"/> Total Dues</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--text-primary)', marginTop: '1rem', letterSpacing: '-0.5px' }}>{fmt(borrowers.reduce((s, b) => s + b.principal, 0))}</div>
                </div>
                <div className="panel" style={{ padding: '1.25rem', borderTop: '3px solid var(--green)' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--green)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}><CheckCircle size={14}/> Total Recovered</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--green)', marginTop: '1rem', letterSpacing: '-0.5px' }}>{fmt(borrowers.reduce((s, b) => s + b.repaid, 0))}</div>
                </div>
                <div className="panel" style={{ padding: '1.25rem', borderTop: '3px solid var(--red)' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--red)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}><AlertTriangle size={14}/> Outstanding Debt</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--red)', marginTop: '1rem', letterSpacing: '-0.5px' }}>{fmt(lentOut)}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
                {borrowers.map(bw => {
                  const rem = bw.principal - bw.repaid;
                  const settled = rem <= 0;
                  return (
                    <div key={bw.id} className="panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', borderLeft: settled ? '4px solid var(--green)' : '4px solid var(--red)', position: 'relative' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                            {bw.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1 }}>{bw.name}</div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginTop: '6px' }}>Given: {fmtDate(bw.date)}</div>
                          </div>
                        </div>
                        {settled ? <span style={{ padding: '4px 8px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--green)', fontSize: '0.7rem', fontWeight: 800 }}>Settled</span> : <span style={{ padding: '4px 8px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)', fontSize: '0.7rem', fontWeight: 800 }}>Owes You</span>}
                      </div>

                      <div style={{ background: 'var(--bg-base)', borderRadius: '12px', padding: '1rem', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Original Amount</div>
                          <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{fmt(bw.principal)}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: settled ? 'var(--green)' : 'var(--red)', textTransform: 'uppercase' }}>{settled ? 'Balance' : 'Remaining Due'}</div>
                          <div style={{ fontSize: '1.25rem', fontWeight: 900, color: settled ? 'var(--green)' : 'var(--red)', lineHeight: 1, marginTop: '2px' }}>{fmt(rem)}</div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: settled ? '1fr 1fr' : '1fr 1fr 1fr', gap: '8px' }}>
                        <button className="btn btn-secondary" style={{ padding: '8px', fontSize: '0.8rem', fontWeight: 700, display: 'flex', justifyContent: 'center' }} onClick={() => openModal('Edit Khata Entry', 'borrower', bw)}>
                          <Edit3 size={15} />
                        </button>
                        {!settled ? (
                          <>
                            <button className="btn btn-primary" style={{ padding: '8px', fontSize: '0.8rem', fontWeight: 800 }}
                              onClick={() => {
                                const a = prompt(`Enter repayment amount (Remaining: ${fmt(rem)}):`);
                                if (a && parseFloat(a) > 0) receiveRepayment(bw.id, parseFloat(a));
                              }}>
                              Receive
                            </button>
                            <button className="btn btn-secondary" style={{ padding: '8px', fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-primary)', border: '1px solid var(--border-strong)' }}
                              onClick={() => { if (confirm(`Settle full ₹${rem} for ${bw.name}?`)) settleBorrower(bw.id); }}>
                              Settle
                            </button>
                          </>
                        ) : (
                          <button className="btn btn-danger" style={{ padding: '8px', fontSize: '0.8rem', display: 'flex', justifyContent: 'center' }}
                            onClick={() => { if (confirm(`Delete borrower record for ${bw.name}?`)) deleteBorrower(bw.id); }}>
                            <Trash2 size={15}/> Delete
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {borrowers.length === 0 && (
                <div className="panel" style={{ padding: '4rem 2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'var(--bg-hover)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}><Users size={32}/></div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 900, margin: '0 0 8px 0' }}>No Khata Entries</h2>
                  <p style={{ color: 'var(--text-muted)', margin: '0 0 1.5rem 0', maxWidth: '400px' }}>Keep track of money you've lent to friends or family here.</p>
                  <button className="btn btn-primary" onClick={() => openModal('Add Khata Entry', 'borrower')}><Plus size={16}/> Add New Entry</button>
                </div>
              )}
            </div>
          )}

          {/* ══ SAMITI ══ */}
          {view === 'samiti' && (
            <div className="fade-in-view">
              <div className="page-header">
                <div className="page-header-left">
                  <span className="eyebrow">Recurring Deposits</span>
                  <h1>Samiti Tracker</h1>
                </div>
                <div className="page-header-right">
                  <MonthSel />
                  <button className="btn btn-primary" onClick={() => openModal('Create Samiti', 'samiti')}>
                    <Plus size={15}/> New Samiti
                  </button>
                </div>
              </div>
              <div className="stat-grid" style={{ marginBottom: '1.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                <div className="panel" style={{ padding: '1.25rem', borderTop: '3px solid var(--purple)' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}><Target size={14} color="var(--purple)"/> Active Samitis</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--text-primary)', marginTop: '1rem', letterSpacing: '-0.5px' }}>{samitis.length}</div>
                </div>
                <div className="panel" style={{ padding: '1.25rem', borderTop: '3px solid var(--green)' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--green)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}><CheckCircle size={14}/> Total Paid Amount</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--green)', marginTop: '1rem', letterSpacing: '-0.5px' }}>{fmt(totalSamitiInvested)}</div>
                </div>
                <div className="panel" style={{ padding: '1.25rem', borderTop: '3px solid var(--blue)' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--blue)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}><TrendingUp size={14}/> Expected Returns</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--blue)', marginTop: '1rem', letterSpacing: '-0.5px' }}>{fmt(samitis.reduce((s, x) => s + Number(x.maturity_amount), 0))}</div>
                </div>
              </div>

              <div className="item-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                {samitis.map(samiti => {
                  const sDate = new Date(samiti.start_date);
                  const mDate = new Date(sDate);
                  mDate.setMonth(mDate.getMonth() + samiti.tenure_months);
                  
                  const sPayments = samitiPayments.filter(p => p.samiti_id === samiti.id);
                  const currentMonthYearStr = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
                  const daysThisMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
                  
                  const currentMonthPayments = sPayments.filter(p => p.payment_date.startsWith(currentMonthYearStr));
                  
                  const paidThisMonth = currentMonthPayments.reduce((sum, p) => {
                    return sum + (samiti.frequency === 'daily'
                      ? Number(samiti.daily_amount)
                      : Number(samiti.daily_amount) * daysInPaymentMonth(p.payment_date));
                  }, 0);
                  
                  const totalPaid = sPayments.reduce((sum, p) => {
                    return sum + (samiti.frequency === 'daily'
                      ? Number(samiti.daily_amount)
                      : Number(samiti.daily_amount) * daysInPaymentMonth(p.payment_date));
                  }, 0);
                  const progressPct = samiti.maturity_amount > 0 ? Math.min(100, (totalPaid / samiti.maturity_amount) * 100) : 0;

                  return (
                    <div key={samiti.id} className="glass-panel" style={{ 
                        display: 'flex', flexDirection: 'column', gap: '1rem', 
                        padding: '1.25rem',
                        position: 'relative', overflow: 'hidden'
                    }}>
                      {/* Top Accent Line */}
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(90deg, var(--purple), var(--blue))' }}></div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '4px' }}>
                        <div>
                          <h3 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '4px', letterSpacing: '-0.5px' }}>{samiti.name}</h3>
                          <span className="badge" style={{ fontSize: '0.7rem', background: 'var(--purple-bg)', color: 'var(--purple)', border: '1px solid rgba(139, 92, 246, 0.2)' }}>{samiti.tenure_months} Months Plan</span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, background: 'var(--bg-hover)', padding: '4px', borderRadius: '20px' }}>
                          <button className="btn-icon" style={{ width: 28, height: 28, borderRadius: '50%' }} onClick={() => openModal('Edit Samiti', 'samiti', samiti)}><Edit3 size={13}/></button>
                          <button className="btn-icon danger" style={{ width: 28, height: 28, borderRadius: '50%' }} onClick={() => { if(confirm('Delete Samiti?')) deleteSamiti(samiti.id); }}><Trash2 size={13}/></button>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div style={{ background: 'var(--bg-card)', padding: '12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Monthly Amt</span>
                          <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{fmt(samiti.daily_amount * daysThisMonth)}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>({fmt(samiti.daily_amount)}/day)</span>
                        </div>

                        <div style={{ background: 'var(--green-bg)', padding: '12px', borderRadius: 'var(--r-sm)', border: '1px solid rgba(16,185,129,0.1)', display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase' }}>This Month</span>
                          <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--green)' }}>{fmt(paidThisMonth)}</span>
                          <span style={{ fontSize: '0.7rem', color: 'rgba(16,185,129,0.8)' }}>Paid</span>
                        </div>

                        <div style={{ background: 'var(--bg-card)', padding: '12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total Paid</span>
                          <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{fmt(totalPaid)}</span>
                        </div>

                        <div style={{ background: 'linear-gradient(135deg, var(--purple-bg) 0%, rgba(139,92,246,0) 100%)', padding: '12px', borderRadius: 'var(--r-sm)', border: '1px solid rgba(139,92,246,0.1)', display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase' }}>Maturity</span>
                          <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--purple)' }}>{fmt(samiti.maturity_amount)}</span>
                        </div>
                      </div>

                      <div style={{ padding: '4px 0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Calendar size={12}/> {fmtDate(samiti.start_date)}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Target size={12}/> {fmtDate(mDate)}</span>
                        </div>
                        <div style={{ height: '8px', background: 'var(--border)', borderRadius: '99px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${progressPct}%`, background: 'linear-gradient(90deg, var(--purple), var(--blue))', borderRadius: '99px', transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)' }}></div>
                        </div>
                      </div>

                      {samiti.frequency === 'daily' ? (
                        <SamitiDayGrid samiti={samiti} payments={sPayments} togglePayment={toggleSamitiPayment} markBulk={markBulkSamitiDays} activeMonth={month} />
                      ) : (
                        <SamitiMonthGrid samiti={samiti} payments={sPayments} togglePayment={toggleSamitiPayment} />
                      )}
                    </div>
                  );
                })}
                {samitis.length === 0 && <div className="empty-state bento-col-12" style={{ gridColumn: '1 / -1' }}>No Samitis created yet. Start investing!</div>}
              </div>
            </div>
          )}

          {/* ══ EMI ══ */}
          {view === 'emi' && (
            <div className="fade-in-view" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center' }}>
              <div style={{ fontSize: '4rem', animation: 'float 3s ease-in-out infinite' }}>🚀</div>
              <h1 style={{ fontSize: '2.5rem', fontWeight: 900, marginTop: '1rem', background: 'linear-gradient(135deg, var(--text-primary) 0%, var(--text-muted) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>EMI Management</h1>
              <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', marginTop: '0.5rem', maxWidth: '400px' }}>This feature is currently under development. Coming Soon!</p>
            </div>
          )}
          {/* ══ PERSONAL RESERVE & VAULT ══ */}
          {view === 'personal' && (
            <div className="fade-in-view" style={{ maxWidth: '1100px', margin: '0 auto' }}>
              {/* Glass Header */}
              <div className="page-header" style={{ marginBottom: '1.75rem' }}>
                <div className="page-header-left">
                  <span className="eyebrow" style={{ color: 'var(--nav-accent)', fontWeight: 800 }}>Personal Emergency & Reserve Savings</span>
                  <h1 style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text-primary)' }}>Personal Vault</h1>
                </div>
                <div className="page-header-right" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    className="btn"
                    style={{ background: 'rgba(142, 114, 152, 0.15)', color: 'var(--purple)', border: '1px solid rgba(142, 114, 152, 0.3)', borderRadius: '14px', padding: '10px 18px', fontWeight: 800 }}
                    onClick={() => openModal('Set Reserve Target', 'vault-target')}
                  >
                    <Edit3 size={16}/> Edit Target (₹)
                  </button>
                  <button
                    className="btn"
                    style={{ background: 'rgba(192, 92, 92, 0.15)', color: 'var(--red)', border: '1px solid rgba(192, 92, 92, 0.3)', borderRadius: '14px', padding: '10px 18px', fontWeight: 800 }}
                    onClick={() => openModal('Use Reserve Money', 'vault-use')}
                  >
                    <Minus size={16}/> Use Money
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ background: 'linear-gradient(135deg, var(--green) 0%, #4E6B18 100%)', color: '#fff', border: 'none', borderRadius: '14px', padding: '10px 20px', fontWeight: 800, boxShadow: '0 8px 20px rgba(107, 142, 35, 0.3)' }}
                    onClick={() => openModal('Replenish Reserve', 'vault-deposit')}
                  >
                    <Plus size={16}/> Deposit Back
                  </button>
                </div>
              </div>

              {/* Glass Stat Grid */}
              <div className="stat-grid" style={{ marginBottom: '1.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                <div className="panel" style={{ padding: '1.25rem', borderTop: '3px solid var(--purple)' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}><Shield size={14} color="var(--purple)"/> Total Reserve Target</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--text-primary)', marginTop: '1rem', letterSpacing: '-0.5px' }}>{fmt(vaultTarget)}</div>
                </div>
                <div className="panel" style={{ padding: '1.25rem', borderTop: '3px solid var(--green)' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--green)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}><Wallet size={14}/> Available Balance</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--green)', marginTop: '1rem', letterSpacing: '-0.5px' }}>{fmt(availableVaultBalance)}</div>
                </div>
                <div className="panel" style={{ padding: '1.25rem', borderTop: netVaultUsed > 0 ? '3px solid var(--red)' : '3px solid var(--green)' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, color: netVaultUsed > 0 ? 'var(--red)' : 'var(--text-secondary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}><TrendingDown size={14}/> Used / Outstanding</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 900, color: netVaultUsed > 0 ? 'var(--red)' : 'var(--text-primary)', marginTop: '1rem', letterSpacing: '-0.5px' }}>{fmt(netVaultUsed)}</div>
                </div>
              </div>

              {/* Replenishment Progress Panel */}
              <div className="panel" style={{
                padding: '1.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                marginBottom: '1.75rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '1.75rem' }}>{vaultRestorationPct === 100 ? '🛡️' : '⚠️'}</span>
                    <div>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
                        {vaultRestorationPct === 100 ? 'Vault Fully Intact (100%)' : `Vault Replenishment Progress: ${vaultRestorationPct}%`}
                      </h4>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '3px 0 0 0', fontWeight: 600 }}>
                        {vaultRestorationPct === 100 ? 'Your reserve savings are complete and available for emergency use.' : `₹${netVaultUsed.toLocaleString('en-IN')} is currently used and needs replenishment.`}
                      </p>
                    </div>
                  </div>
                  <span style={{
                    background: vaultRestorationPct === 100 ? 'rgba(107, 142, 35, 0.15)' : 'rgba(192, 92, 92, 0.15)',
                    color: vaultRestorationPct === 100 ? 'var(--green)' : 'var(--red)',
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    padding: '8px 16px',
                    borderRadius: '99px',
                    border: vaultRestorationPct === 100 ? '1px solid rgba(107, 142, 35, 0.3)' : '1px solid rgba(192, 92, 92, 0.3)'
                  }}>
                    {vaultRestorationPct === 100 ? 'Fully Restored' : 'Used Money Pending'}
                  </span>
                </div>

                <div style={{ height: '12px', background: 'var(--bg-hover)', borderRadius: '99px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <div style={{
                    height: '100%',
                    width: `${vaultRestorationPct}%`,
                    background: vaultRestorationPct === 100 ? 'linear-gradient(90deg, #6B8E23, #4E6B18)' : 'linear-gradient(90deg, var(--red), var(--amber))',
                    borderRadius: '99px',
                    transition: 'width 0.8s cubic-bezier(0.25, 0.8, 0.25, 1)',
                    boxShadow: '0 0 12px rgba(107, 142, 35, 0.3)'
                  }} />
                </div>
              </div>

              {/* Vault Activity Logs Card */}
              <div className="panel" style={{
                padding: '1.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={20} style={{ color: 'var(--purple)' }}/> Vault Activity Log
                  </h3>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)', background: 'var(--bg-surface)', padding: '4px 10px', borderRadius: '99px', border: '1px solid var(--border)' }}>
                    {vaultLogs.length} Records
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '340px', overflowY: 'auto' }}>
                  {vaultLogs.map(log => (
                    <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: log.type === 'withdrawal' ? 'rgba(192, 92, 92, 0.15)' : 'rgba(107, 142, 35, 0.15)', color: log.type === 'withdrawal' ? 'var(--red)' : 'var(--green)', padding: '8px', borderRadius: '50%', display: 'flex' }}>
                          {log.type === 'withdrawal' ? <TrendingDown size={15}/> : <TrendingUp size={15}/>}
                        </div>
                        <div>
                          <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)' }}>{log.reason}</div>
                          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginTop: '2px' }}>{log.date}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '0.95rem', fontWeight: 800, color: log.type === 'withdrawal' ? 'var(--red)' : 'var(--green)' }}>
                          {log.type === 'withdrawal' ? '-' : '+'}{fmt(log.amount)}
                        </span>
                        <button className="btn-icon danger" style={{ width: 24, height: 24, borderRadius: '50%' }} onClick={() => deleteVaultLog(log.id)}><Trash2 size={12}/></button>
                      </div>
                    </div>
                  ))}
                  {vaultLogs.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '2rem' }}>
                      No vault activity recorded yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ══ MY LINKS LAUNCHPAD ══ */}
          {view === 'web-apps' && (() => {
            const userCategories = Array.from(new Set(webApps.map(a => a.category).filter(Boolean)));
            const categories = ['all', ...userCategories];

            const filteredApps = webApps.filter(app => {
              const matchesCat = webAppCategoryFilter === 'all' || app.category === webAppCategoryFilter;
              const matchesQuery = (app.title || '').toLowerCase().includes(webAppSearch.toLowerCase()) ||
                                   (app.url || '').toLowerCase().includes(webAppSearch.toLowerCase()) ||
                                   (app.category || '').toLowerCase().includes(webAppSearch.toLowerCase());
              return matchesCat && matchesQuery;
            });

            const pinnedApps = filteredApps.filter(a => a.is_pinned);
            const otherApps = filteredApps.filter(a => !a.is_pinned);

            return (
              <div className="fade-in-view">
                {/* Page Header */}
                <div className="page-header" style={{ marginBottom: '1.5rem' }}>
                  <div className="page-header-left">
                    <span className="eyebrow">BOOKMARKS & SHORTCUTS</span>
                    <h1>My Links</h1>
                  </div>
                  <div className="page-header-right">
                    <button 
                      className="btn btn-primary" 
                      onClick={() => setAppModal({ open: true, item: null })}
                    >
                      <Plus size={15}/> Add Link
                    </button>
                  </div>
                </div>

                {/* Warm Sepia Search & Category Controls */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem', background: 'var(--bg-secondary)', padding: '1.25rem', borderRadius: 'var(--r-xl)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}/>
                      <input 
                        type="text"
                        placeholder="Search links or titles..."
                        value={webAppSearch}
                        onChange={e => setWebAppSearch(e.target.value)}
                        style={{ width: '100%', padding: '12px 14px 12px 42px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '12px', color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 600, outline: 'none' }}
                      />
                    </div>
                  </div>

                  {/* Category Pills */}
                  <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '2px' }}>
                    {categories.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setWebAppCategoryFilter(cat)}
                        style={{
                          padding: '7px 16px',
                          borderRadius: '99px',
                          border: webAppCategoryFilter === cat ? 'none' : '1px solid var(--border)',
                          fontSize: '0.78rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          background: webAppCategoryFilter === cat ? 'var(--text-primary)' : 'var(--bg-base)',
                          color: webAppCategoryFilter === cat ? 'var(--text-inverse)' : 'var(--text-secondary)',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {cat === 'all' ? 'All Links' : cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pinned Links Section */}
                {pinnedApps.length > 0 && (
                  <div style={{ marginBottom: '2.5rem' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--amber)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Star size={14} fill="var(--amber)"/> Pinned Quick Links
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
                      {pinnedApps.map(app => {
                        let domainName = '';
                        try { domainName = new URL(app.url).hostname.replace('www.', ''); } catch { }

                        return (
                          <div 
                            key={app.id}
                            style={{
                              padding: '1.25rem',
                              borderRadius: 'var(--r-xl)',
                              background: 'var(--bg-secondary)',
                              border: '1px solid rgba(212, 163, 115, 0.4)',
                              borderLeft: '4px solid var(--amber)',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              gap: '14px',
                              boxShadow: 'var(--shadow-sm)'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                              <a
                                href={app.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none', flex: 1, minWidth: 0 }}
                              >
                                <AppFavicon title={app.title} url={app.url} size={24} />
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {app.title}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '2px' }}>
                                    {domainName || app.url}
                                  </div>
                                </div>
                              </a>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <button onClick={() => togglePinWebApp(app.id)} style={{ background: 'none', border: 'none', color: 'var(--amber)', cursor: 'pointer', padding: '4px' }} title="Unpin Link">
                                  <Star size={16} fill="var(--amber)"/>
                                </button>
                                <button onClick={() => setAppModal({ open: true, item: app })} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }} title="Edit Link">
                                  <Edit3 size={14}/>
                                </button>
                                <button onClick={() => deleteWebApp(app.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: '4px' }} title="Delete Link">
                                  <Trash2 size={14}/>
                                </button>
                              </div>
                            </div>

                            <a
                              href={app.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                textDecoration: 'none',
                                background: 'var(--bg-base)',
                                padding: '10px 14px',
                                borderRadius: '12px',
                                fontSize: '0.82rem',
                                fontWeight: 800,
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border)'
                              }}
                            >
                              <span>Open Link</span>
                              <ExternalLink size={14} style={{ color: 'var(--accent)' }}/>
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* All Links Section */}
                <div>
                  {pinnedApps.length > 0 && (
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-muted)', marginBottom: '1rem' }}>
                      All Links ({otherApps.length})
                    </div>
                  )}

                  {otherApps.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
                      {otherApps.map(app => {
                        let domainName = '';
                        try { domainName = new URL(app.url).hostname.replace('www.', ''); } catch { }

                        return (
                          <div 
                            key={app.id}
                            style={{
                              padding: '1.25rem',
                              borderRadius: 'var(--r-xl)',
                              background: 'var(--bg-secondary)',
                              border: '1px solid var(--border)',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              gap: '14px',
                              boxShadow: 'var(--shadow-sm)'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                              <a 
                                href={app.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none', flex: 1, minWidth: 0 }}
                              >
                                <AppFavicon title={app.title} url={app.url} size={24} />
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {app.title}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '2px' }}>
                                    {domainName || app.url}
                                  </div>
                                </div>
                              </a>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <button onClick={() => togglePinWebApp(app.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }} title="Pin Link">
                                  <Star size={16}/>
                                </button>
                                <button onClick={() => setAppModal({ open: true, item: app })} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }} title="Edit Link">
                                  <Edit3 size={14}/>
                                </button>
                                <button onClick={() => deleteWebApp(app.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: '4px' }} title="Delete Link">
                                  <Trash2 size={14}/>
                                </button>
                              </div>
                            </div>

                            <a
                              href={app.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                textDecoration: 'none',
                                background: 'var(--bg-base)',
                                padding: '10px 14px',
                                borderRadius: '12px',
                                fontSize: '0.82rem',
                                fontWeight: 800,
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border)'
                              }}
                            >
                              <span>Open Link</span>
                              <ExternalLink size={14} style={{ color: 'var(--accent)' }}/>
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    pinnedApps.length === 0 && (
                      <div className="empty-state">No links found. Click "+ Add Link" to save your first bookmark!</div>
                    )
                  )}
                </div>
              </div>
            );
          })()}

          {/* ══ NOTES PAGE (Google Keep Style) ══ */}
          {view === 'notes' && (() => {
            const allTags = [...new Set(notes.flatMap(n => n.tags || []))].filter(Boolean);
            const filtered = notes.filter(n => {
              if (n.is_archived) return false;
              const q = noteSearch.toLowerCase();
              const matchSearch = !q || (n.title || '').toLowerCase().includes(q) || (n.body || '').toLowerCase().includes(q) || (n.tags || []).some(t => t.toLowerCase().includes(q));
              const matchFilter = activeNoteFilter === 'all' ? true : activeNoteFilter === 'pinned' ? n.is_pinned : (n.tags || []).includes(activeNoteFilter);
              return matchSearch && matchFilter;
            });
            const pinned = filtered.filter(n => n.is_pinned);
            const others = filtered.filter(n => !n.is_pinned);
            const noteBg = (colorId) => NOTE_COLORS.find(c => c.id === colorId)?.bg || 'var(--bg-surface)';

            return (
              <div className="fade-in-view">
                {/* Header */}
                <div className="page-header" style={{ marginBottom: '1.5rem' }}>
                  <div className="page-header-left">
                    <span className="eyebrow" style={{ color: 'var(--accent)', fontWeight: 800 }}>CLOUD SYNCED</span>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <StickyNote size={28} style={{ color: 'var(--yellow, #f0c040)' }}/> Notes
                    </h1>
                  </div>
                  <div className="page-header-right" style={{ gap: '10px' }}>
                    {/* Search bar */}
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <Search size={14} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)' }} />
                      <input
                        value={noteSearch}
                        onChange={e => setNoteSearch(e.target.value)}
                        placeholder="Search notes…"
                        style={{
                          background: 'var(--bg-surface)', border: '1.5px solid var(--border)', borderRadius: '12px',
                          padding: '8px 12px 8px 30px', fontSize: '0.82rem', color: 'var(--text-primary)',
                          outline: 'none', width: '200px'
                        }}
                      />
                    </div>
                    <button className="btn btn-primary" onClick={() => openNoteModal(null)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Plus size={15}/> New Note
                    </button>
                  </div>
                </div>

                {/* Tag Filter Pills */}
                {allTags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '1.25rem' }}>
                    {['all', 'pinned', ...allTags].map(tag => (
                      <button
                        key={tag}
                        onClick={() => setActiveNoteFilter(tag)}
                        style={{
                          padding: '4px 14px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                          border: activeNoteFilter === tag ? 'none' : '1.5px solid var(--border)',
                          background: activeNoteFilter === tag ? 'var(--accent)' : 'var(--bg-surface)',
                          color: activeNoteFilter === tag ? '#fff' : 'var(--text-secondary)',
                          transition: 'all 0.2s'
                        }}
                      >
                        {tag === 'pinned' ? '📌 Pinned' : tag === 'all' ? '🗂 All' : `# ${tag}`}
                      </button>
                    ))}
                  </div>
                )}

                {/* Quick Add Strip (inline) */}
                <div
                  onClick={() => openNoteModal(null)}
                  style={{
                    background: 'var(--bg-surface)', border: '1.5px solid var(--border)', borderRadius: '16px',
                    padding: '14px 20px', marginBottom: '1.75rem', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '12px',
                    boxShadow: 'var(--shadow-xs)', transition: 'box-shadow 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-sm)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = 'var(--shadow-xs)'}
                >
                  <Edit3 size={16} style={{ color: 'var(--text-muted)' }} />
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Take a note…</span>
                </div>

                {notes.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-muted)' }}>
                    <StickyNote size={56} style={{ opacity: 0.25, marginBottom: '1rem' }} />
                    <div style={{ fontSize: '1rem', fontWeight: 700 }}>No notes yet</div>
                    <div style={{ fontSize: '0.82rem', marginTop: '4px' }}>Click "+ New Note" to get started</div>
                  </div>
                )}

                {/* Pinned Notes Section */}
                {pinned.length > 0 && (
                  <div style={{ marginBottom: '1.75rem' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Pin size={11}/> Pinned
                    </div>
                    <div style={{ columns: 'auto 280px', columnGap: '1rem' }}>
                      {pinned.map(note => (
                        <NoteCard
                          key={note.id}
                          note={note}
                          noteBg={noteBg}
                          NOTE_COLORS={NOTE_COLORS}
                          noteColorPicker={noteColorPicker}
                          setNoteColorPicker={setNoteColorPicker}
                          openNoteModal={openNoteModal}
                          toggleNotePin={toggleNotePin}
                          deleteNote={deleteNote}
                          changeNoteColor={changeNoteColor}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Other Notes Section */}
                {others.length > 0 && (
                  <div>
                    {pinned.length > 0 && (
                      <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
                        Other Notes
                      </div>
                    )}
                    <div style={{ columns: 'auto 280px', columnGap: '1rem' }}>
                      {others.map(note => (
                        <NoteCard
                          key={note.id}
                          note={note}
                          noteBg={noteBg}
                          NOTE_COLORS={NOTE_COLORS}
                          noteColorPicker={noteColorPicker}
                          setNoteColorPicker={setNoteColorPicker}
                          openNoteModal={openNoteModal}
                          toggleNotePin={toggleNotePin}
                          deleteNote={deleteNote}
                          changeNoteColor={changeNoteColor}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Note Edit/Create Modal */}
                {noteModal.open && (
                  <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
                    zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
                  }} onClick={e => { if (e.target === e.currentTarget) setNoteModal({ open: false, note: null }); }}>
                    <div style={{
                      background: NOTE_COLORS.find(c => c.id === noteForm.color)?.bg || 'var(--bg-surface)',
                      borderRadius: '20px', width: '100%', maxWidth: '560px',
                      border: '1.5px solid var(--border)', boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
                      overflow: 'hidden', display: 'flex', flexDirection: 'column'
                    }}>
                      {/* Modal Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 0', gap: '10px' }}>
                        <input
                          autoFocus
                          placeholder="Title"
                          value={noteForm.title}
                          onChange={e => setNoteForm(f => ({ ...f, title: e.target.value }))}
                          style={{
                            flex: 1, background: 'transparent', border: 'none', outline: 'none',
                            fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)',
                            fontFamily: 'inherit'
                          }}
                        />
                        <button
                          onClick={() => setNoteForm(f => ({ ...f, is_pinned: !f.is_pinned }))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: noteForm.is_pinned ? 'var(--accent)' : 'var(--text-muted)', transition: 'color 0.2s' }}
                          title={noteForm.is_pinned ? 'Unpin' : 'Pin'}
                        >
                          <Pin size={18} fill={noteForm.is_pinned ? 'var(--accent)' : 'none'} />
                        </button>
                      </div>

                      {/* Body */}
                      <textarea
                        placeholder="Take a note…"
                        value={noteForm.body}
                        onChange={e => setNoteForm(f => ({ ...f, body: e.target.value }))}
                        rows={8}
                        style={{
                          background: 'transparent', border: 'none', outline: 'none',
                          padding: '12px 20px', fontSize: '0.9rem', color: 'var(--text-primary)',
                          resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.65
                        }}
                      />

                      {/* Tags */}
                      <div style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Hash size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        <input
                          placeholder="Tags (comma separated: work, personal, ideas)"
                          value={noteForm.tags}
                          onChange={e => setNoteForm(f => ({ ...f, tags: e.target.value }))}
                          style={{
                            flex: 1, background: 'transparent', border: 'none', outline: 'none',
                            fontSize: '0.78rem', color: 'var(--text-secondary)', fontFamily: 'inherit'
                          }}
                        />
                      </div>

                      {/* Color Picker Row */}
                      <div style={{ padding: '8px 20px', display: 'flex', flexWrap: 'wrap', gap: '6px', borderTop: '1px solid var(--border)' }}>
                        {NOTE_COLORS.map(c => (
                          <button
                            key={c.id}
                            title={c.label}
                            onClick={() => setNoteForm(f => ({ ...f, color: c.id }))}
                            style={{
                              width: '26px', height: '26px', borderRadius: '50%', cursor: 'pointer',
                              background: c.id === 'default' ? 'var(--bg-base)' : c.bg,
                              border: noteForm.color === c.id ? '2.5px solid var(--accent)' : '2px solid var(--border)',
                              transition: 'border 0.15s'
                            }}
                          />
                        ))}
                      </div>

                      {/* Footer Buttons */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
                        <button className="btn" onClick={() => setNoteModal({ open: false, note: null })} style={{ padding: '8px 18px', background: 'var(--bg-base)' }}>
                          Cancel
                        </button>
                        <button className="btn btn-primary" onClick={saveNote} disabled={noteSaving} style={{ padding: '8px 22px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {noteSaving ? <Loader size={14} className="spin" /> : <CheckCircle size={14} />}
                          {noteModal.note ? 'Update Note' : 'Save Note'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ══ SETTINGS PAGE ══ */}
          {view === 'settings' && (
            <div className="fade-in-view" style={{ maxWidth: '980px', margin: '0 auto' }}>
              
              {/* Header */}
              <div className="page-header" style={{ marginBottom: '1.75rem' }}>
                <div className="page-header-left">
                  <span className="eyebrow" style={{ color: 'var(--nav-accent)', fontWeight: 800 }}>PREFERENCES & ACCOUNT MANAGEMENT</span>
                  <h1 style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text-primary)' }}>Settings</h1>
                </div>
              </div>

              {/* Glass Profile Banner Card */}
              <div 
                style={{ 
                  background: 'var(--bg-card)', 
                  backdropFilter: 'blur(32px)',
                  WebkitBackdropFilter: 'blur(32px)',
                  border: '1px solid var(--border)', 
                  borderRadius: '24px', 
                  padding: '1.75rem 2rem', 
                  marginBottom: '1.75rem', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '1.25rem',
                  boxShadow: '0 16px 40px rgba(62, 54, 46, 0.06)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                  {/* Warm Sepia Theme Gradient Ring Avatar */}
                  <div 
                    style={{ 
                      width: '72px', 
                      height: '72px', 
                      borderRadius: '50%', 
                      padding: '3px', 
                      background: 'linear-gradient(135deg, #0A2A5E 0%, #2E7BD6 50%, #6FB4E8 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 6px 18px rgba(46, 123, 214, 0.25)'
                    }}
                  >
                    <div 
                      style={{ 
                        width: '100%', 
                        height: '100%', 
                        borderRadius: '50%', 
                        background: 'var(--bg-surface)', 
                        border: '1px solid var(--border)',
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        color: 'var(--text-primary)',
                        fontSize: '1.8rem',
                        fontWeight: 900
                      }}
                    >
                      {(session?.user?.user_metadata?.full_name || session?.user?.email || 'U').charAt(0).toUpperCase()}
                    </div>
                  </div>

                  <div>
                    <h2 style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.3px' }}>
                      {session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0]}
                    </h2>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: '2px' }}>
                      {session?.user?.email}
                    </div>
                  </div>
                </div>

                <button 
                  className="btn"
                  onClick={() => supabase.auth.signOut()}
                  style={{ background: 'rgba(192, 92, 92, 0.15)', color: 'var(--red)', border: '1px solid rgba(192, 92, 92, 0.3)', borderRadius: '14px', padding: '10px 20px', fontWeight: 800, cursor: 'pointer' }}
                >
                  Logout Session
                </button>
              </div>

              {/* System Notification Feedback Banner */}
              {settingsMessage && (
                <div 
                  style={{ 
                    padding: '12px 16px', 
                    background: settingsMessage.includes('Error') ? 'rgba(192, 92, 92, 0.15)' : 'rgba(107, 142, 35, 0.15)', 
                    color: settingsMessage.includes('Error') ? 'var(--red)' : 'var(--green)', 
                    borderRadius: '16px', 
                    fontSize: '0.88rem', 
                    fontWeight: 800,
                    marginBottom: '1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    border: settingsMessage.includes('Error') ? '1px solid rgba(192, 92, 92, 0.3)' : '1px solid rgba(107, 142, 35, 0.3)'
                  }}
                >
                  <CheckCircle size={16}/> {settingsMessage}
                </div>
              )}

              {/* Glass 2-Column Split Card */}
              <div className="settings-container">
                {/* Left Sidebar Menu */}
                <div className="settings-pill-nav">
                  <button
                    onClick={() => setSettingsTab('profile')}
                    className={`settings-tab-btn ${settingsTab === 'profile' ? 'active' : ''}`}
                  >
                    <User size={18} />
                    <span>Profile</span>
                  </button>

                  <button
                    onClick={() => setSettingsTab('security')}
                    className={`settings-tab-btn ${settingsTab === 'security' ? 'active' : ''}`}
                  >
                    <Shield size={18} />
                    <span>Security</span>
                  </button>

                  <button
                    onClick={() => setSettingsTab('data')}
                    className={`settings-tab-btn ${settingsTab === 'data' ? 'active' : ''}`}
                  >
                    <Database size={18} />
                    <span>Data & Backup</span>
                  </button>

                  <button
                    onClick={() => setSettingsTab('about')}
                    className={`settings-tab-btn ${settingsTab === 'about' ? 'active' : ''}`}
                  >
                    <Info size={18} />
                    <span>About</span>
                  </button>

                  {isAdmin && (
                    <button
                      onClick={() => setSettingsTab('admin')}
                      className={`settings-tab-btn ${settingsTab === 'admin' ? 'active' : ''}`}
                      style={settingsTab === 'admin' ? { background: 'linear-gradient(135deg, #D4A373 0%, #B8860B 100%)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' } : { color: 'var(--amber)' }}
                    >
                      <ShieldCheck size={18} />
                      <span>Admin</span>
                    </button>
                  )}
                  
                  {/* Theme Toggle (Right aligned in nav on desktop) */}
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '1rem', borderLeft: '1px solid var(--border)' }}>
                    <button 
                      className="desktop-toggle-btn"
                      onClick={() => {
                        const newTheme = theme === 'dark' ? 'light' : 'dark';
                        setTheme(newTheme);
                        localStorage.setItem('fb_theme', newTheme);
                        document.documentElement.setAttribute('data-theme', newTheme);
                      }}
                      style={{
                        background: 'var(--bg-base)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-primary)',
                        padding: '6px 12px',
                        borderRadius: '99px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        boxShadow: 'var(--shadow-xs)'
                      }}
                    >
                      {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                      {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                    </button>
                  </div>
                </div>

                {/* Right Active Content Area */}
                <div className="settings-content">
                  
                  {/* TAB 1: EDIT PROFILE (2-Column Compact Grid) */}
                  {settingsTab === 'profile' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', width: '100%' }}>
                      
                      {/* Left Column: Personal Info Form */}
                      <div className="settings-bento-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <div>
                          <h3 style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>Edit Profile</h3>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>Update your personal profile information</p>
                        </div>

                        <form onSubmit={handleUpdateName} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>
                              Full Display Name
                            </label>
                            <input
                              type="text"
                              value={settingsName}
                              onChange={e => setSettingsName(e.target.value)}
                              placeholder={session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0]}
                              style={{ width: '100%', padding: '12px 14px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '12px', color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 700, outline: 'none' }}
                            />
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>
                              Email Address (Primary Account)
                            </label>
                            <input
                              type="email"
                              disabled
                              value={session?.user?.email || ''}
                              style={{ width: '100%', padding: '12px 14px', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: '12px', color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 700, cursor: 'not-allowed' }}
                            />
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>Email address is linked to your Supabase Auth account.</span>
                          </div>

                          <button
                            type="submit"
                            className="btn btn-primary"
                            style={{ padding: '12px 20px', borderRadius: '12px', fontWeight: 800, marginTop: '0.5rem', alignSelf: 'flex-start' }}
                          >
                            Save Profile Changes
                          </button>
                        </form>
                      </div>

                      {/* Right Column: Navbar Visibility Preferences */}
                      <div className="settings-bento-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                          <h3 style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>Navbar Items Visibility</h3>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>Customize elements shown in top navbar</p>
                        </div>

                        {/* Appearance: Navbar Quick Links Toggle */}
                        <div style={{ background: 'var(--bg-base)', padding: '1rem 1.25rem', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Quick Links in Navbar</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>Pinned links item in navbar</div>
                          </div>
                          <button
                            onClick={() => {
                              const next = !showNavLinks;
                              setShowNavLinks(next);
                              localStorage.setItem('fb_show_nav_links', next);
                            }}
                            style={{
                              width: '44px',
                              height: '24px',
                              borderRadius: '99px',
                              border: 'none',
                              background: showNavLinks ? 'var(--nav-accent)' : 'var(--border-strong)',
                              position: 'relative',
                              cursor: 'pointer',
                              transition: 'background 0.2s ease',
                              flexShrink: 0
                            }}
                          >
                            <div style={{
                              position: 'absolute',
                              top: '2px',
                              left: showNavLinks ? '22px' : '2px',
                              width: '20px',
                              height: '20px',
                              borderRadius: '50%',
                              background: '#ffffff',
                              boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                              transition: 'left 0.2s ease'
                            }}/>
                          </button>
                        </div>

                        {/* Incomes in Navbar Toggle */}
                        <div style={{ background: 'var(--bg-base)', padding: '1rem 1.25rem', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Incomes Tab in Navbar</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>Incomes navigation tab</div>
                          </div>
                          <button
                            onClick={() => { const n = !showIncomesNav; setShowIncomesNav(n); localStorage.setItem('fb_show_incomes_nav', n); }}
                            style={{ width: '44px', height: '24px', borderRadius: '99px', border: 'none', background: showIncomesNav ? 'var(--nav-accent)' : 'var(--border-strong)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s ease', flexShrink: 0 }}
                          >
                            <div style={{ position: 'absolute', top: '2px', left: showIncomesNav ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left 0.2s ease' }}/>
                          </button>
                        </div>

                        {/* Expenses in Navbar Toggle */}
                        <div style={{ background: 'var(--bg-base)', padding: '1rem 1.25rem', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Expenses Tab in Navbar</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>Expenses navigation tab</div>
                          </div>
                          <button
                            onClick={() => { const n = !showExpensesNav; setShowExpensesNav(n); localStorage.setItem('fb_show_expenses_nav', n); }}
                            style={{ width: '44px', height: '24px', borderRadius: '99px', border: 'none', background: showExpensesNav ? 'var(--nav-accent)' : 'var(--border-strong)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s ease', flexShrink: 0 }}
                          >
                            <div style={{ position: 'absolute', top: '2px', left: showExpensesNav ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left 0.2s ease' }}/>
                          </button>
                        </div>
                      </div>

                    </div>
                  )}

                  {/* TAB 2: SECURITY & PASSWORD */}

                  {settingsTab === 'security' && (
                    <div className="settings-bento-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      <div>
                        <h3 style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>Security & Password</h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>Update your account password</p>
                      </div>

                      <form onSubmit={handleUpdatePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '420px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>
                            Current Password
                          </label>
                          <input 
                            type="password" 
                            required
                            value={currentPassword} 
                            onChange={e => setCurrentPassword(e.target.value)} 
                            placeholder="Enter current password" 
                            style={{ width: '100%', padding: '12px 14px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '12px', color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 700, outline: 'none' }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>
                            New Password
                          </label>
                          <input 
                            type="password" 
                            required
                            minLength={6}
                            value={settingsPassword} 
                            onChange={e => setSettingsPassword(e.target.value)} 
                            placeholder="Enter new password (min 6 characters)" 
                            style={{ width: '100%', padding: '12px 14px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '12px', color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 700, outline: 'none' }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>
                            Confirm New Password
                          </label>
                          <input 
                            type="password" 
                            required
                            minLength={6}
                            value={confirmPassword} 
                            onChange={e => setConfirmPassword(e.target.value)} 
                            placeholder="Re-enter new password to confirm" 
                            style={{ width: '100%', padding: '12px 14px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '12px', color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 700, outline: 'none' }}
                          />
                        </div>

                        <button 
                          type="submit" 
                          className="btn btn-primary"
                          style={{ padding: '12px 20px', borderRadius: '12px', fontWeight: 800, marginTop: '0.5rem', alignSelf: 'flex-start' }}
                        >
                          Update Password
                        </button>
                      </form>
                    </div>
                  )}

                  {/* TAB 3: DATA & BACKUP */}
                  {settingsTab === 'data' && (
                    <div className="settings-bento-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      <div>
                        <h3 style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>Data & Cloud Storage</h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>Manage Supabase cloud sync, backup JSON exports, and file imports</p>
                      </div>

                      {/* Import Status Alert */}
                      {importStatus && (
                        <div 
                          style={{ 
                            padding: '12px 16px', 
                            background: importStatus.type === 'success' ? 'var(--green-bg)' : 'var(--red-bg)', 
                            color: importStatus.type === 'success' ? 'var(--green)' : 'var(--red)', 
                            borderRadius: '14px', 
                            fontSize: '0.88rem', 
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            border: importStatus.type === 'success' ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)'
                          }}
                        >
                          {importStatus.type === 'success' ? <CheckCircle size={16}/> : <AlertTriangle size={16}/>}
                          {importStatus.message}
                        </div>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '520px' }}>
                        {/* 1. Cloud Database Sync */}
                        <div style={{ background: 'var(--bg-base)', padding: '1.25rem', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)' }}>Cloud Database Sync</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>Realtime sync via Supabase Cloud</div>
                          </div>
                          <span className="badge" style={{ background: 'var(--green-bg)', color: 'var(--green)', padding: '4px 12px', borderRadius: '99px', fontWeight: 800, fontSize: '0.75rem' }}>Active</span>
                        </div>

                        {/* 2. Export Full JSON Backup */}
                        <div style={{ background: 'var(--bg-base)', padding: '1.25rem', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)' }}>Export Full Backup (.json)</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>Download complete JSON backup of all financial data</div>
                          </div>
                          <button 
                            className="btn btn-primary" 
                            style={{ padding: '8px 14px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 800 }}
                            onClick={exportAllDataJSON}
                          >
                            <Download size={14}/> Export
                          </button>
                        </div>

                        {/* 3. Import & Restore Backup */}
                        <div style={{ background: 'var(--bg-base)', padding: '1.25rem', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)' }}>Import Backup File (.json / .csv)</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>Restore old transactions, accounts & records from JSON or CSV file</div>
                          </div>

                          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {/* Option A: Wipe & Fresh Restore */}
                            <label 
                              className="btn" 
                              style={{ background: 'var(--purple-bg, rgba(147, 51, 234, 0.1))', color: 'var(--purple, #9333ea)', border: '1px solid rgba(147, 51, 234, 0.3)', padding: '8px 14px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', flex: 1, justifyContent: 'center' }}
                            >
                              {importing ? <Loader className="animate-spin" size={14}/> : <Trash2 size={14}/>}
                              {importing ? 'Wiping & Restoring...' : 'Wipe & Fresh Restore'}
                              <input 
                                type="file" 
                                accept=".json,.csv" 
                                style={{ display: 'none' }} 
                                onChange={(e) => {
                                  const file = e.target.files[0];
                                  if (file) {
                                    importDataJSON(file, 'replace');
                                    e.target.value = '';
                                  }
                                }}
                                disabled={importing}
                              />
                            </label>

                            {/* Option B: Merge Upload */}
                            <label 
                              className="btn" 
                              style={{ background: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '8px 14px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', flex: 1, justifyContent: 'center' }}
                            >
                              {importing ? <Loader className="animate-spin" size={14}/> : <Upload size={14}/>}
                              {importing ? 'Importing...' : 'Merge Upload'}
                              <input 
                                type="file" 
                                accept=".json,.csv" 
                                style={{ display: 'none' }} 
                                onChange={(e) => {
                                  const file = e.target.files[0];
                                  if (file) {
                                    importDataJSON(file, 'merge');
                                    e.target.value = '';
                                  }
                                }}
                                disabled={importing}
                              />
                            </label>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', pt: '4px', borderTop: '1px borderless var(--border)' }}>
                            <button 
                              onClick={downloadSampleTemplateJSON}
                              style={{ background: 'transparent', border: 'none', color: 'var(--blue)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                            >
                              📥 Download Sample Format (.json)
                            </button>

                            <button 
                              onClick={() => {
                                if (confirm('Are you sure you want to PERMANENTLY DELETE ALL transactions, banks, cards, samitis & Supabase records?')) {
                                  clearAllUserData(true);
                                }
                              }}
                              style={{ background: 'transparent', border: 'none', color: 'var(--red)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                            >
                              🗑️ Clear All Old Data & Supabase
                            </button>
                          </div>
                        </div>

                        {/* 4. CSV Exports Grid */}
                        <div style={{ background: 'var(--bg-base)', padding: '1.25rem', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)' }}>Spreadsheet CSV Exports</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <button className="btn" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', justifyContent: 'center', fontSize: '0.78rem', fontWeight: 700, padding: '8px' }} onClick={() => exportToCSV('incomes')}>
                              📈 Incomes CSV
                            </button>
                            <button className="btn" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', justifyContent: 'center', fontSize: '0.78rem', fontWeight: 700, padding: '8px' }} onClick={() => exportToCSV('expenses')}>
                              📉 Expenses CSV
                            </button>
                            <button className="btn" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', justifyContent: 'center', fontSize: '0.78rem', fontWeight: 700, padding: '8px' }} onClick={() => exportToCSV('credit_cards')}>
                              💳 Cards CSV
                            </button>
                            <button className="btn" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', justifyContent: 'center', fontSize: '0.78rem', fontWeight: 700, padding: '8px' }} onClick={() => exportToCSV('borrowers')}>
                              🤝 Khata CSV
                            </button>
                          </div>
                        </div>

                      </div>
                    </div>
                  )}

                  {/* TAB 4: ABOUT */}
                  {settingsTab === 'about' && (
                    <div className="settings-bento-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      <div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>Surbhi Telecom</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>Smart Business & Wealth Management Dashboard</p>
                      </div>

                      <div style={{ background: 'var(--bg-base)', padding: '1.25rem', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '480px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.95rem' }}>
                          <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>Developer:</span>
                          <strong style={{ 
                            fontFamily: "'Caveat', 'Pacifico', cursive",
                            fontSize: '1.5rem', 
                            fontWeight: 700, 
                            background: 'linear-gradient(135deg, var(--nav-active-text) 0%, var(--nav-accent) 100%)', 
                            WebkitBackgroundClip: 'text', 
                            WebkitTextFillColor: 'transparent',
                            letterSpacing: '0.5px'
                          }}>Harsh Aryan</strong>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 5: ADMIN CONTROL CENTER */}
                  {/* TAB: ADMIN CONTROL CENTER */}
                  {settingsTab === 'admin' && isAdmin && (
                    <div className="settings-bento-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      
                      {/* Admin Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                        <div>
                          <h3 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            👑 Master Command Center
                          </h3>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0 0 0', fontWeight: 600 }}>Real-time Super-Admin system metrics & user account manager</p>
                        </div>
                        <button 
                          className="btn"
                          style={{
                            background: 'linear-gradient(135deg, #6B8E23 0%, #4E6B18 100%)',
                            color: '#ffffff',
                            border: 'none',
                            padding: '10px 18px',
                            borderRadius: '14px',
                            fontSize: '0.85rem',
                            fontWeight: 800,
                            boxShadow: '0 6px 18px rgba(107, 142, 35, 0.25)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                          onClick={fetchAdminOverviewData}
                        >
                          {adminLoading ? <Loader className="animate-spin" size={15}/> : <RefreshCw size={15}/>} Sync Real-Time Data
                        </button>
                      </div>

                      {/* System Global Metric Cards Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem' }}>
                        <div style={{ background: 'rgba(255, 255, 255, 0.9)', padding: '1.15rem 1.25rem', borderRadius: '18px', border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(62, 54, 46, 0.04)' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>👥 Total Users</span>
                          <div style={{ fontSize: '1.85rem', fontWeight: 900, color: 'var(--text-primary)', marginTop: 4 }}>{adminData.profiles.length}</div>
                        </div>

                        <div style={{ background: 'rgba(107, 142, 35, 0.08)', padding: '1.15rem 1.25rem', borderRadius: '18px', border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(107, 142, 35, 0.04)' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🟢 System Incomes</span>
                          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--green)', marginTop: 4 }}>{fmt(adminData.incomes.reduce((s, i) => s + Number(i.amount || 0), 0))}</div>
                        </div>

                        <div style={{ background: 'rgba(192, 92, 92, 0.08)', padding: '1.15rem 1.25rem', borderRadius: '18px', border: '1px solid rgba(192, 92, 92, 0.2)', boxShadow: '0 8px 24px rgba(192, 92, 92, 0.04)' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🔴 System Expenses</span>
                          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--red)', marginTop: 4 }}>{fmt(adminData.expenses.reduce((s, e) => s + Number(e.amount || 0), 0))}</div>
                        </div>

                        <div style={{ background: 'rgba(212, 163, 115, 0.08)', padding: '1.15rem 1.25rem', borderRadius: '18px', border: '1px solid rgba(212, 163, 115, 0.2)', boxShadow: '0 8px 24px rgba(212, 163, 115, 0.04)' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>💳 Total Cards</span>
                          <div style={{ fontSize: '1.85rem', fontWeight: 900, color: 'var(--amber)', marginTop: 4 }}>{adminData.creditCards.length}</div>
                        </div>
                      </div>

                      {/* Live User Search Bar */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-surface)', padding: '10px 16px', borderRadius: '16px', border: '1px solid var(--border-strong)' }}>
                        <Search size={18} style={{ color: 'var(--text-muted)' }} />
                        <input
                          type="text"
                          value={adminSearchQuery}
                          onChange={e => setAdminSearchQuery(e.target.value)}
                          placeholder="Search users by name, email, or account ID..."
                          style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}
                        />
                        {adminSearchQuery && (
                          <button onClick={() => setAdminSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                            <X size={16} />
                          </button>
                        )}
                      </div>

                      {/* Registered User Accounts Cards List */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div style={{ fontWeight: 900, fontSize: '1rem', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>Registered Accounts ({adminData.profiles.length})</span>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Click "View Live Dashboard" to inspect user's view</span>
                        </div>

                        {adminData.profiles
                          .filter(prof => {
                            if (!adminSearchQuery) return true;
                            const q = adminSearchQuery.toLowerCase();
                            return (prof.full_name || '').toLowerCase().includes(q) || (prof.email || '').toLowerCase().includes(q) || (prof.id || '').toLowerCase().includes(q);
                          })
                          .map(prof => {
                            const userIncs = adminData.incomes.filter(i => i.user_id === prof.id);
                            const userExps = adminData.expenses.filter(e => e.user_id === prof.id);
                            const userCards = adminData.creditCards.filter(c => c.user_id === prof.id);
                            const userBnks = adminData.banks.filter(b => b.user_id === prof.id);
                            const incTotal = userIncs.reduce((s, i) => s + Number(i.amount || 0), 0);
                            const expTotal = userExps.reduce((s, e) => s + Number(e.amount || 0), 0);
                            const netBal = incTotal - expTotal;

                            return (
                              <div 
                                key={prof.id} 
                                style={{ 
                                  background: 'rgba(255, 255, 255, 0.9)', 
                                  border: '1px solid var(--border)', 
                                  borderRadius: '20px', 
                                  padding: '1.25rem 1.5rem', 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'space-between',
                                  flexWrap: 'wrap',
                                  gap: '1.25rem',
                                  boxShadow: '0 10px 30px rgba(62, 54, 46, 0.05)'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: '220px' }}>
                                  <div style={{ 
                                    width: '48px', 
                                    height: '48px', 
                                    borderRadius: '50%', 
                                    background: 'linear-gradient(135deg, #6B8E23 0%, #D4A373 100%)', 
                                    color: '#ffffff', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    fontWeight: 900, 
                                    fontSize: '1.2rem',
                                    flexShrink: 0,
                                    boxShadow: '0 6px 16px rgba(107, 142, 35, 0.25)'
                                  }}>
                                    {(prof.full_name || prof.email || 'U').charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <div style={{ fontWeight: 900, fontSize: '1.02rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      {prof.full_name || 'Registered User'}
                                      {prof.email && prof.email.toLowerCase() === MASTER_SUPER_ADMIN && (
                                        <span style={{ fontSize: '0.7rem', background: 'rgba(212, 163, 115, 0.2)', color: 'var(--amber)', padding: '2px 8px', borderRadius: '99px', fontWeight: 800 }}>Master Admin</span>
                                      )}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: '2px' }}>
                                      {prof.email}
                                    </div>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                                  <div style={{ fontSize: '0.82rem', textAlign: 'right' }}>
                                    <span style={{ color: 'var(--green)', fontWeight: 900, display: 'block' }}>+{fmt(incTotal)} ({userIncs.length})</span>
                                    <span style={{ color: 'var(--red)', fontWeight: 900, display: 'block', marginTop: '2px' }}>-{fmt(expTotal)} ({userExps.length})</span>
                                  </div>

                                  <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Net Balance</div>
                                    <div style={{ fontSize: '1.05rem', fontWeight: 900, color: netBal >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                      {fmt(netBal)}
                                    </div>
                                  </div>

                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <span style={{ background: 'rgba(212, 163, 115, 0.15)', color: 'var(--amber)', padding: '4px 10px', borderRadius: '10px', fontWeight: 800, fontSize: '0.75rem' }}>
                                      💳 {userCards.length} Cards
                                    </span>
                                    <span style={{ background: 'rgba(95, 133, 154, 0.15)', color: 'var(--cyan)', padding: '4px 10px', borderRadius: '10px', fontWeight: 800, fontSize: '0.75rem' }}>
                                      🏦 {userBnks.length} Banks
                                    </span>
                                  </div>

                                  <button 
                                    className="btn btn-primary" 
                                    style={{
                                      padding: '10px 18px',
                                      borderRadius: '14px',
                                      fontSize: '0.85rem',
                                      fontWeight: 900,
                                      background: 'linear-gradient(135deg, #6B8E23 0%, #4E6B18 100%)',
                                      border: 'none',
                                      color: '#ffffff',
                                      cursor: 'pointer',
                                      boxShadow: '0 6px 18px rgba(107, 142, 35, 0.25)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px'
                                    }}
                                    onClick={() => {
                                      setImpersonatedUser(prof);
                                      setView('dashboard');
                                    }}
                                  >
                                    👁️ View Live Dashboard
                                  </button>

                                  {session?.user?.email?.toLowerCase() === MASTER_SUPER_ADMIN && prof.email && prof.email.toLowerCase() !== MASTER_SUPER_ADMIN && (
                                    <button 
                                      className="btn" 
                                      style={{ 
                                        padding: '10px 16px', 
                                        borderRadius: '14px', 
                                        fontSize: '0.82rem', 
                                        fontWeight: 800, 
                                        background: extraAdminEmails.includes(prof.email.toLowerCase()) ? 'rgba(192, 92, 92, 0.15)' : 'rgba(142, 114, 152, 0.15)', 
                                        color: extraAdminEmails.includes(prof.email.toLowerCase()) ? 'var(--red)' : 'var(--purple)', 
                                        border: extraAdminEmails.includes(prof.email.toLowerCase()) ? '1px solid rgba(192, 92, 92, 0.3)' : '1px solid rgba(142, 114, 152, 0.3)', 
                                        cursor: 'pointer' 
                                      }}
                                      onClick={() => toggleSuperAdminRole(prof.email)}
                                    >
                                      {extraAdminEmails.includes(prof.email.toLowerCase()) ? '❌ Revoke Admin' : '👑 Make Admin'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                        {adminData.profiles.length === 0 && (
                          <div style={{ background: 'rgba(255, 255, 255, 0.8)', padding: '2.5rem', textAlign: 'center', borderRadius: '20px', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600 }}>
                            No user accounts found. Click "Sync Real-Time Data" above!
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            </div>
          )}



        </div>
      </main>

      {/* ═══ ADD / EDIT MODAL ═══ */}
      {modal.open && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal-box">
            <div className="modal-header">
              <h3>{modal.title}</h3>
              <button className="modal-close" onClick={closeModal}><X size={14}/></button>
            </div>
            <div className="modal-body">

              {/* Quick Log */}
              {modal.type === 'quick-log' && (
                <form className="form-grid" onSubmit={e => {
                  e.preventDefault();
                  const f = e.target;
                  const date = f.date.value, amount = parseFloat(f.amount.value) || 0, type = f.type.value, category = f.category.value;
                  if (!date || amount <= 0) { alert('Enter a date and amount.'); return; }
                  saveQuickLog(date, amount, type, category);
                  closeModal();
                }}>
                  <div className="form-group full">
                    <label>Date</label>
                    <input name="date" type="date" required defaultValue={new Date().toISOString().split('T')[0]}/>
                  </div>
                  <div className="form-group">
                    <label>Type</label>
                    <select name="type" onChange={e => {
                      setQuickType(e.target.value);
                      const input = e.target.form.amount;
                      input.style.color = e.target.value === 'income' ? 'var(--green)' : 'var(--red)';
                    }}>
                      <option value="expense">Expense OUT</option>
                      <option value="income">Income IN</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Category</label>
                    <select name="category">
                      {(quickType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(cat => (
                        <option key={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group full">
                    <label>Amount (₹)</label>
                    <input name="amount" type="number" placeholder="0" min="1" required style={{ color: 'var(--red)', fontWeight: 'bold' }}/>
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ gridColumn: '1 / -1' }}>Save Log</button>
                </form>
              )}

              {/* Income / Expense */}
              {(modal.type === 'income' || modal.type === 'expenses') && (
                <form className="form-grid" onSubmit={e => {
                  e.preventDefault();
                  const f = e.target;
                  const date = f.date.value, amount = parseFloat(f.amount.value) || 0, category = f.category.value;
                  if (!date || amount <= 0) return;
                  const type = modal.type === 'income' ? 'income' : 'expenses';
                  saveIncomeExpense(modal.item?.id, date, amount, category, type);
                  closeModal();
                  closeDetail();
                }}>
                  <div className="form-group">
                    <label>Date</label>
                    <input name="date" type="date" required defaultValue={modal.item?.date ?? new Date().toISOString().split('T')[0]}/>
                  </div>
                  <div className="form-group">
                    <label>Category</label>
                    <select name="category" defaultValue={modal.item?.category || 'Others'}>
                      {(modal.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(cat => (
                        <option key={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group full">
                    <label>Amount (₹)</label>
                    <input name="amount" type="number" required placeholder="0" min="1" defaultValue={modal.item?.amount ?? ''} style={{ color: modal.type === 'income' ? 'var(--green)' : 'var(--red)', fontWeight: 'bold' }}/>
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ gridColumn: '1 / -1' }}>{modal.item ? 'Update Record' : 'Save Record'}</button>
                </form>
              )}

              {/* Bank Account */}
              {modal.type === 'bank' && (
                <form className="form-grid" onSubmit={e => {
                  e.preventDefault();
                  const f = e.target;
                  const bankName = f.bankName.value, type = f.type.value, accountNumber = f.accountNumber.value, balance = parseFloat(f.balance.value) || 0;
                  if (bankName && accountNumber && balance >= 0) {
                    saveBank(modal.item?.id, bankName, type, accountNumber, balance);
                    closeModal();
                  }
                }}>
                  <div className="form-group">
                    <label>Bank Name</label>
                    <input name="bankName" type="text" required placeholder="e.g. HDFC Bank" defaultValue={modal.item?.bankName || ''}/>
                  </div>
                  <div className="form-group">
                    <label>Account Type</label>
                    <select name="type" defaultValue={modal.item?.type || 'Savings'}>
                      <option>Savings</option>
                      <option>Salary</option>
                      <option>Current</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Last 4 Digits</label>
                    <input name="accountNumber" type="text" maxLength="4" required placeholder="e.g. 5678" defaultValue={modal.item?.accountNumber || ''}/>
                  </div>
                  <div className="form-group">
                    <label>Current Balance (₹)</label>
                    <input name="balance" type="number" required placeholder="0" min="0" defaultValue={modal.item?.balance || ''}/>
                  </div>
                  <button type="submit" className="btn btn-primary">Add Account</button>
                </form>
              )}

              {/* Credit Card */}
              {modal.type === 'card' && (
                <form className="form-grid" onSubmit={e => {
                  e.preventDefault();
                  const f = e.target;
                  const bankName = f.bank.value, cardName = f.cardName.value, cardNumber = f.num.value, 
                        limit = parseFloat(f.limit.value) || 0, outstanding = parseFloat(f.outstanding.value) || 0,
                        statementDate = f.statementDate.value, dueDate = f.dueDate.value;
                  if (bankName && cardName && cardNumber && limit > 0) {
                    saveCreditCard(modal.item?.id, bankName, cardName, cardNumber, limit, outstanding, statementDate, dueDate);
                    closeModal();
                  }
                }}>
                  <div className="form-group">
                    <label>Bank / Issuer</label>
                    <input name="bank" type="text" required placeholder="e.g. HDFC, ICICI, Amex, SBI" defaultValue={modal.item?.bankName || ''}/>
                  </div>
                  <div className="form-group">
                    <label>Card Name / Variant</label>
                    <input name="cardName" type="text" required placeholder="e.g. Millennia, Regalia, BPCL" defaultValue={modal.item?.cardName || ''}/>
                  </div>
                  <div className="form-group">
                    <label>Last 4 Digits</label>
                    <input name="num" type="text" maxLength="4" required placeholder="e.g. 1234" defaultValue={modal.item?.cardNumber || ''}/>
                  </div>
                  <div className="form-group">
                    <label>Credit Limit (₹)</label>
                    <input name="limit" type="number" required placeholder="0" min="1" defaultValue={modal.item?.limit || ''}/>
                  </div>
                  <div className="form-group">
                    <label>Statement Date (Day: 1 - 31)</label>
                    <input name="statementDate" type="number" min="1" max="31" required placeholder="e.g. 15 (15th of every month)" defaultValue={modal.item?.statementDate || ''}/>
                  </div>
                  <div className="form-group">
                    <label>Payment Due Date (Day: 1 - 31)</label>
                    <input name="dueDate" type="number" min="1" max="31" required placeholder="e.g. 5 (5th of every month)" defaultValue={modal.item?.dueDate || ''}/>
                  </div>
                  <div className="form-group full">
                    <label>Current Outstanding Debt (₹)</label>
                    <input name="outstanding" type="number" placeholder="0" min="0" defaultValue={modal.item?.outstanding || ''}/>
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ gridColumn: '1 / -1', height: '44px', fontWeight: 800 }}>Save Credit Card</button>
                </form>
              )}

              {/* Borrower */}
              {modal.type === 'borrower' && (
                <form className="form-grid" onSubmit={e => {
                  e.preventDefault();
                  const f = e.target;
                  const name = f.name.value, amount = parseFloat(f.amount.value) || 0, date = f.date.value;
                  if (name && amount > 0 && date) {
                    saveBorrower(modal.item?.id, name, amount, date);
                    closeModal();
                  }
                }}>
                  <div className="form-group">
                    <label>Borrower / Party Name</label>
                    <input name="name" type="text" required placeholder="e.g. Rahul Kumar" defaultValue={modal.item?.name || ''}/>
                  </div>
                  <div className="form-group">
                    <label>Amount (₹)</label>
                    <input name="amount" type="number" required placeholder="0" min="1" defaultValue={modal.item?.principal || ''}/>
                  </div>
                  <div className="form-group full">
                    <label>Date</label>
                    <input name="date" type="date" required defaultValue={modal.item?.date || new Date().toISOString().split('T')[0]}/>
                  </div>
                  <button type="submit" className="btn btn-primary">Save Khata Entry</button>
                </form>
              )}

              {/* Samiti */}
              {modal.type === 'samiti' && (
                <form className="form-grid" onSubmit={e => {
                  e.preventDefault();
                  const f = e.target;
                  const name = f.name.value, 
                        daily_amount = parseFloat(f.daily_amount.value) || 0, 
                        start_date = f.start_date.value,
                        tenure_months = parseInt(f.tenure_months.value) || 0,
                        maturity_amount = parseFloat(f.maturity_amount.value) || 0,
                        frequency = f.frequency.value;
                  if (name && daily_amount > 0 && start_date && tenure_months > 0 && maturity_amount > 0) {
                    saveSamiti(modal.item?.id, name, daily_amount, start_date, tenure_months, maturity_amount, frequency);
                    closeModal();
                  }
                }}>
                  <div className="form-group full">
                    <label>Samiti Name</label>
                    <input name="name" type="text" required placeholder="e.g. Diwali Samiti" defaultValue={modal.item?.name || ''}/>
                  </div>
                  <div className="form-group full">
                    <label>Frequency</label>
                    <select name="frequency" required defaultValue={modal.item?.frequency || 'monthly'} style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-primary)', outline: 'none', height: '44px' }}>
                      <option value="monthly">Monthly</option>
                      <option value="daily">Daily</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Daily Amount (₹)</label>
                    <input name="daily_amount" type="number" required placeholder="e.g. 100" min="1" defaultValue={modal.item?.daily_amount || ''} onChange={e => {
                      const form = e.target.form;
                      const d = parseFloat(form.daily_amount.value) || 0;
                      const t = parseInt(form.tenure_months.value) || 0;
                      const s = form.start_date.value;
                      const now = new Date();
                      const daysNow = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
                      if (d) form.monthly_amount.value = Math.round(d * daysNow);
                      if (d && t && s) form.maturity_amount.value = Math.round(d * calcActualDays(s, t));
                    }}/>
                  </div>
                  <div className="form-group">
                    <label>Monthly Amount (₹) <span style={{fontSize:'0.7rem',color:'var(--text-muted)',fontWeight:500}}>(auto)</span></label>
                    <input name="monthly_amount" type="number" readOnly placeholder="auto" style={{opacity:0.7, cursor:'not-allowed'}} defaultValue={modal.item ? (() => { const now = new Date(); return Math.round(modal.item.daily_amount * new Date(now.getFullYear(), now.getMonth()+1, 0).getDate()); })() : ''}/>
                  </div>
                  <div className="form-group">
                    <label>Start Date</label>
                    <input name="start_date" type="date" required defaultValue={modal.item?.start_date || new Date().toISOString().split('T')[0]} />
                  </div>
                  <div className="form-group">
                    <label>Tenure (Months)</label>
                    <input name="tenure_months" type="number" required placeholder="12" min="1" defaultValue={modal.item?.tenure_months || ''} onChange={e => {
                      const form = e.target.form;
                      const d = parseFloat(form.daily_amount.value) || 0;
                      const t = parseInt(form.tenure_months.value) || 0;
                      const s = form.start_date.value;
                      if (d && t && s) form.maturity_amount.value = Math.round(d * calcActualDays(s, t));
                    }}/>
                  </div>
                  <div className="form-group">
                    <label>Expected Maturity (₹) <span style={{fontSize:'0.7rem',color:'var(--text-muted)',fontWeight:500}}>(auto)</span></label>
                    <input name="maturity_amount" type="number" required placeholder="0" min="1" defaultValue={modal.item?.maturity_amount || ''}/>
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ gridColumn: '1 / -1' }}>{modal.item ? 'Update Samiti' : 'Create Samiti'}</button>
                </form>
              )}

              {/* Vault Target Modal */}
              {modal.type === 'vault-target' && (
                <form className="form-grid" onSubmit={e => {
                  e.preventDefault();
                  const target = parseFloat(e.target.target.value) || 0;
                  if (target > 0) {
                    updateVaultTarget(target);
                    closeModal();
                  }
                }}>
                  <div className="form-group full">
                    <label>Total Reserve Savings Target (₹)</label>
                    <input name="target" type="number" required placeholder="e.g. 50000" min="1" defaultValue={vaultTarget}/>
                  </div>
                  <div className="form-actions full">
                    <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                    <button type="submit" className="btn btn-primary">Save Target</button>
                  </div>
                </form>
              )}

              {/* Vault Use / Withdrawal Modal */}
              {modal.type === 'vault-use' && (
                <form className="form-grid" onSubmit={e => {
                  e.preventDefault();
                  const amount = parseFloat(e.target.amount.value) || 0;
                  const reason = e.target.reason.value;
                  const date = e.target.date.value;
                  if (amount > 0 && date) {
                    addVaultLog('withdrawal', amount, reason, date);
                    closeModal();
                  }
                }}>
                  <div className="form-group full">
                    <label>Amount Used (₹)</label>
                    <input name="amount" type="number" required placeholder="e.g. 2000" min="1"/>
                  </div>
                  <div className="form-group full">
                    <label>Reason / Where used?</label>
                    <input name="reason" type="text" required placeholder="e.g. Medical emergency, Bike repair"/>
                  </div>
                  <div className="form-group full">
                    <label>Date</label>
                    <input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)}/>
                  </div>
                  <div className="form-actions full">
                    <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                    <button type="submit" className="btn" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>Log Withdrawal</button>
                  </div>
                </form>
              )}

              {/* Vault Deposit Modal */}
              {modal.type === 'vault-deposit' && (
                <form className="form-grid" onSubmit={e => {
                  e.preventDefault();
                  const amount = parseFloat(e.target.amount.value) || 0;
                  const reason = e.target.reason.value;
                  const date = e.target.date.value;
                  if (amount > 0 && date) {
                    addVaultLog('deposit', amount, reason, date);
                    closeModal();
                  }
                }}>
                  <div className="form-group full">
                    <label>Amount Deposited Back (₹)</label>
                    <input name="amount" type="number" required placeholder="e.g. 2000" min="1"/>
                  </div>
                  <div className="form-group full">
                    <label>Note / Source</label>
                    <input name="reason" type="text" placeholder="e.g. Replenished from Salary" defaultValue="Replenishment"/>
                  </div>
                  <div className="form-group full">
                    <label>Date</label>
                    <input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)}/>
                  </div>
                  <div className="form-actions full">
                    <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                    <button type="submit" className="btn btn-primary">Log Deposit</button>
                  </div>
                </form>
              )}



            </div>
          </div>
        </div>
      )}

      {/* ═══ SMART SPEND ADVISOR HINGLISH MODAL ═══ */}
      {spendAdvisorModal.open && spendAdvisorModal.card && spendAdvisorModal.smartDates && (
        <div className="modal-backdrop" onClick={() => setSpendAdvisorModal({ open: false, card: null, smartDates: null })}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '460px', padding: '1.75rem' }}>
            {/* Ultra-Premium Glass Header */}
            <div style={{ 
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(59, 130, 246, 0.05) 100%)', 
              border: '1px solid rgba(16, 185, 129, 0.25)', 
              padding: '1.1rem 1.25rem', 
              borderRadius: '14px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              marginBottom: '1.25rem' 
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ 
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
                  color: '#ffffff', 
                  padding: '8px', 
                  borderRadius: '10px', 
                  display: 'flex', 
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)' 
                }}>
                  <Info size={18} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.2px' }}>
                    Smart CC Spend Advisor
                  </h2>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--green)', display: 'block', marginTop: '1px' }}>
                    💳 {spendAdvisorModal.card.bankName} ({spendAdvisorModal.card.cardName || 'Credit Card'})
                  </span>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setSpendAdvisorModal({ open: false, card: null, smartDates: null })}
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={16}/>
              </button>
            </div>

            {/* Language Selector Bar */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem', background: 'var(--bg-base)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <button 
                type="button"
                style={{ flex: 1, padding: '6px', fontSize: '0.78rem', fontWeight: 800, borderRadius: '6px', border: 'none', background: advisorLang === 'hinglish' ? 'var(--bg-card)' : 'transparent', color: advisorLang === 'hinglish' ? 'var(--green)' : 'var(--text-secondary)', boxShadow: advisorLang === 'hinglish' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none', cursor: 'pointer' }}
                onClick={() => setAdvisorLang('hinglish')}
              >
                💬 Hinglish
              </button>
              <button 
                type="button"
                style={{ flex: 1, padding: '6px', fontSize: '0.78rem', fontWeight: 800, borderRadius: '6px', border: 'none', background: advisorLang === 'hindi' ? 'var(--bg-card)' : 'transparent', color: advisorLang === 'hindi' ? 'var(--green)' : 'var(--text-secondary)', boxShadow: advisorLang === 'hindi' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none', cursor: 'pointer' }}
                onClick={() => setAdvisorLang('hindi')}
              >
                📜 हिंदी (Devanagari)
              </button>
            </div>

            {advisorLang === 'hinglish' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Hinglish 1 */}
                <div style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(59, 130, 246, 0.04) 100%)', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 900, color: 'var(--green)', marginBottom: '4px' }}>
                    📅 Sabse Best Spending Date: {spendAdvisorModal.smartDates.bestSpendFull}
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                    Aapka Statement Date <strong>{spendAdvisorModal.smartDates.stmtFull}</strong> ko banta hai. Iske theek 1 din baad yaani <strong>{spendAdvisorModal.smartDates.bestSpendFull}</strong> ko spend karne par bill next month banega!
                  </p>
                </div>

                {/* Hinglish 2 */}
                <div style={{ background: 'var(--bg-base)', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 900, color: 'var(--blue)', marginBottom: '4px' }}>
                    ⏳ Max Liquidity: Pura {spendAdvisorModal.smartDates.maxGraceDays} Days Interest-Free!
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                    Is date ko paisa use/withdraw karne par aapko bill pay karne ke liye pura <strong>{spendAdvisorModal.smartDates.maxGraceDays} Days</strong> milenge. Tab tak aapka cash bank account me rehkar interest kamata rahega.
                  </p>
                </div>

                {/* Hinglish 3 */}
                <div style={{ background: 'var(--bg-hover)', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '4px' }}>
                    🟢 Aaj ({new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}) Spend Karein To?
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                    Agar aap <strong>AAJ</strong> spend karte hain, to iska bill repayment aapko <strong>{spendAdvisorModal.smartDates.todayRepayFormatted}</strong> tak karna hoga. Aapko bina kisi interest ke pura <strong>{spendAdvisorModal.smartDates.todayGraceDays} Days</strong> ka waqt milega!
                  </p>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Hindi 1 */}
                <div style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(59, 130, 246, 0.04) 100%)', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 900, color: 'var(--green)', marginBottom: '4px' }}>
                    📅 सबसे बेहतरीन खर्च करने की तारीख: {spendAdvisorModal.smartDates.bestSpendFull}
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                    आपका स्टेटमेंट <strong>{spendAdvisorModal.smartDates.stmtFull}</strong> को बनता है। इसके ठीक 1 दिन बाद यानी <strong>{spendAdvisorModal.smartDates.bestSpendFull}</strong> को खर्च करने पर बिल अगले महीने बनेगा!
                  </p>
                </div>

                {/* Hindi 2 */}
                <div style={{ background: 'var(--bg-base)', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 900, color: 'var(--blue)', marginBottom: '4px' }}>
                    ⏳ अधिकतम समय: पूरे {spendAdvisorModal.smartDates.maxGraceDays} दिन बिना ब्याज के!
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                    इस तारीख को कार्ड का इस्तेमाल करने पर आपको बिल चुकाने के लिए पूरे <strong>{spendAdvisorModal.smartDates.maxGraceDays} दिन</strong> का समय मिलेगा। तब तक आपका पैसा बैंक खाते में रहकर ब्याज कमाता रहेगा।
                  </p>
                </div>

                {/* Hindi 3 */}
                <div style={{ background: 'var(--bg-hover)', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '4px' }}>
                    🟢 आज ({new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}) खर्च करें तो?
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                    अगर आप <strong>आज</strong> खर्च करते हैं, तो इसका भुगतान आपको <strong>{spendAdvisorModal.smartDates.todayRepayFormatted}</strong> तक करना होगा। आपको बिना किसी ब्याज के पूरे <strong>{spendAdvisorModal.smartDates.todayGraceDays} दिन</strong> का समय मिलेगा!
                  </p>
                </div>
              </div>
            )}

            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={() => setSpendAdvisorModal({ open: false, card: null, smartDates: null })}>
                {advisorLang === 'hindi' ? 'समझ गया!' : 'Samajh Gaya!'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ CC SPEND / REPAYMENT MODAL ═══ */}
      {ccSpendModal.open && ccSpendModal.card && (() => {
        const isRepay = !!ccSpendModal.isRepay;
        const card = ccSpendModal.card;

        return (
          <div className="modal-backdrop" onClick={() => setCcSpendModal({ open: false, card: null })}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px', padding: '1.75rem' }}>
              {/* Ultra-Premium Glass Header */}
              <div style={{ 
                background: isRepay ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(5, 150, 105, 0.04) 100%)' : 'linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(225, 29, 72, 0.04) 100%)', 
                border: isRepay ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)', 
                padding: '1.1rem 1.25rem', 
                borderRadius: '14px', 
                display: 'flex', 
                alignItems: 'center', 
                justify: 'space-between',
                marginBottom: '1.25rem' 
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ 
                    background: isRepay ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', 
                    color: '#ffffff', 
                    padding: '8px', 
                    borderRadius: '10px', 
                    display: 'flex', 
                    boxShadow: isRepay ? '0 4px 12px rgba(16, 185, 129, 0.3)' : '0 4px 12px rgba(239, 68, 68, 0.3)' 
                  }}>
                    {isRepay ? <CheckCircle size={18} /> : <TrendingDown size={18} />}
                  </div>
                  <div>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.2px' }}>
                      {isRepay ? '💳 Pay Credit Card Bill' : '💸 Record Spend / Purchase'}
                    </h2>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isRepay ? 'var(--green)' : 'var(--red)', display: 'block', marginTop: '1px' }}>
                      {card.bankName} ({card.cardName || 'CC'}) • Due: ₹{(parseFloat(card.outstanding) || 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setCcSpendModal({ open: false, card: null })}
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}
                >
                  <X size={16}/>
                </button>
              </div>

              <form onSubmit={e => {
                e.preventDefault();
                const amount = parseFloat(e.target.amount.value) || 0;
                const note = e.target.note.value;
                const date = e.target.date.value;
                const bankId = isRepay && e.target.bankId ? e.target.bankId.value : null;

                if (amount > 0 && date) {
                  addCcLog(card.id, isRepay ? 'repay' : 'spend', amount, note, date, bankId);
                  setCcSpendModal({ open: false, card: null });
                }
              }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {isRepay ? 'Bill Payment Amount (₹)' : 'Amount Spent / Withdrawn (₹)'}
                  </label>
                  <input 
                    name="amount" 
                    type="number" 
                    required 
                    defaultValue={isRepay && card.outstanding > 0 ? card.outstanding : ''}
                    placeholder="e.g. 5000" 
                    min="1" 
                    autoFocus
                    style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 700, boxSizing: 'border-box' }}
                  />
                </div>

                {isRepay && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Payment Source (Deduct From)
                    </label>
                    <select
                      name="bankId"
                      style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}
                    >
                      <option value="cash">💵 Cash on Hand (₹{cash.toLocaleString('en-IN')})</option>
                      {banks.map(b => (
                        <option key={b.id} value={b.id}>
                          🏦 {b.bankName} (•••• {b.accountNumber.slice(-4)}) — ₹{b.balance.toLocaleString('en-IN')}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Note / Remarks
                  </label>
                  <input 
                    name="note" 
                    type="text" 
                    placeholder={isRepay ? "e.g. Full Statement Bill Payment" : "e.g. Fuel, Electronics, Shopping"}
                    style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 700, boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Transaction Date
                  </label>
                  <input 
                    name="date" 
                    type="date" 
                    required 
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 700, boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setCcSpendModal({ open: false, card: null })}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" style={{ background: isRepay ? 'var(--green)' : 'var(--red)', color: '#fff', border: 'none', padding: '10px 18px', fontWeight: 800, borderRadius: '8px' }}>
                    {isRepay ? 'Confirm Bill Payment' : 'Add Spend'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* ═══ SPEND DATE SIMULATOR MODAL ═══ */}
      {spendSimulatorModal.open && spendSimulatorModal.card && (
        <div className="modal-backdrop" onClick={() => setSpendSimulatorModal({ open: false, card: null })}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '460px', padding: '1.75rem' }}>
            {/* Glass Header */}
            <div style={{ 
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(99, 102, 241, 0.05) 100%)', 
              border: '1px solid rgba(59, 130, 246, 0.25)', 
              padding: '1.1rem 1.25rem', 
              borderRadius: '14px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              marginBottom: '1.25rem' 
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ 
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', 
                  color: '#ffffff', 
                  padding: '8px', 
                  borderRadius: '10px', 
                  display: 'flex', 
                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)' 
                }}>
                  <Calendar size={18} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
                    🎮 Spend Date Simulator
                  </h2>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--blue)', display: 'block', marginTop: '1px' }}>
                    💳 {spendSimulatorModal.card.bankName} ({spendSimulatorModal.card.cardName || 'CC'})
                  </span>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setSpendSimulatorModal({ open: false, card: null })}
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={16}/>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>
                  Choose Planned Purchase Date
                </label>
                <input 
                  type="date" 
                  value={simTestDate}
                  onChange={e => setSimTestDate(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 700, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>
                  Amount to Spend (₹)
                </label>
                <input 
                  type="number" 
                  value={simTestAmount}
                  onChange={e => setSimTestAmount(e.target.value)}
                  placeholder="5000"
                  style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 700, boxSizing: 'border-box' }}
                />
              </div>

              {/* Prediction Results Card */}
              {(() => {
                const testD = new Date(simTestDate);
                const stmtDay = parseInt(spendSimulatorModal.card.statementDate, 10) || 5;
                const dueDay = parseInt(spendSimulatorModal.card.dueDate, 10) || 25;

                let targetStmtMonth = testD.getMonth();
                let targetStmtYear = testD.getFullYear();
                if (testD.getDate() > stmtDay) {
                  targetStmtMonth += 1;
                  if (targetStmtMonth > 11) { targetStmtMonth = 0; targetStmtYear += 1; }
                }
                const targetStmtDate = new Date(targetStmtYear, targetStmtMonth, Math.min(stmtDay, new Date(targetStmtYear, targetStmtMonth + 1, 0).getDate()));

                let targetDueMonth = targetStmtMonth;
                let targetDueYear = targetStmtYear;
                if (dueDay <= stmtDay) {
                  targetDueMonth += 1;
                  if (targetDueMonth > 11) { targetDueMonth = 0; targetDueYear += 1; }
                }
                const targetDueDate = new Date(targetDueYear, targetDueMonth, Math.min(dueDay, new Date(targetDueYear, targetDueMonth + 1, 0).getDate()));

                const graceDays = Math.max(1, Math.round((targetDueDate.getTime() - testD.getTime()) / (1000 * 60 * 60 * 24)));

                return (
                  <div style={{ background: 'var(--bg-base)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 900, color: 'var(--blue)', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                      🔮 Simulation Predictions Result:
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Statement Date:</span>
                      <strong style={{ color: 'var(--text-primary)' }}>{targetStmtDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Payment Due Date:</span>
                      <strong style={{ color: 'var(--green)', fontWeight: 900 }}>{targetDueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
                    </div>
                    <div style={{ background: 'var(--green-bg)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.78rem', color: 'var(--green)', fontWeight: 800 }}>
                      🎉 AAPKO PURA {graceDays} DAYS BINA INTEREST KE MILEGA!
                    </div>
                  </div>
                );
              })()}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-primary" onClick={() => setSpendSimulatorModal({ open: false, card: null })}>
                  Samajh Gaya!
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ VIEW DETAIL MODAL ═══ */}
      {detail.open && detail.item && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeDetail()}>
          <div className="modal-box">
            <div className="modal-header">
              <h3>{detail.type === 'income' ? 'Income Details' : 'Expense Details'}</h3>
              <button className="modal-close" onClick={closeDetail}><X size={14}/></button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                <span className={`badge ${detail.type === 'income' ? 'green' : 'red'}`} style={{ fontSize: '0.82rem', padding: '5px 14px' }}>
                  {detail.type === 'income' ? <ArrowUpRight size={13}/> : <ArrowDownRight size={13}/>}
                  {detail.type === 'income' ? 'Income' : 'Expenditure'}
                </span>
              </div>
              <span className={`detail-amount ${detail.type === 'income' ? 'text-green' : 'text-red'}`}>
                {fmt(detail.item.amount)}
              </span>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                {detail.type === 'income' ? 'Income' : 'Expense'} recorded on {fmtDate(detail.item.date)}
              </div>

              <div className="detail-grid">
                <div className="detail-cell">
                  <span className="lbl">Date</span>
                  <span className="val">{fmtDate(detail.item.date)}</span>
                </div>
                <div className="detail-cell">
                  <span className="lbl">Record ID</span>
                  <span className="val font-mono">#{detail.item.id}</span>
                </div>
              </div>

              <div className="detail-action-row">
                <button className="btn btn-primary" onClick={() => openModal(detail.type === 'income' ? 'Edit Income' : 'Edit Expense', detail.type, detail.item)}>
                  <Edit3 size={14}/> Edit
                </button>
                <button className="btn" style={{ flex: 1, justifyContent: 'center', height: 42, borderRadius: 'var(--r-md)', background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid transparent' }}
                  onClick={() => {
                    if (confirm('Delete this record?')) {
                      deleteIncomeExpense(detail.item.id, detail.type === 'income' ? 'income' : 'expenses');
                      closeDetail();
                    }
                  }}>
                  <Trash2 size={14}/> Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ CREDIT CARD DETAILS MODAL (CRED STYLE) ═══ */}
      {ccDetailsModal.open && ccDetailsModal.card && (() => {
        const card = ccDetailsModal.card;
        const cycle = getSmartCardBillingCycle(card);
        const util = card.limit > 0 ? ((card.outstanding / card.limit) * 100).toFixed(0) : 0;

        return (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setCcDetailsModal({ open: false, card: null })}>
            <div className="modal-box" style={{ maxWidth: '600px', borderRadius: '24px', padding: '1.75rem' }}>
              <div className="modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="cred-bank-avatar">
                    {card.bankName ? card.bankName.charAt(0).toUpperCase() : '💳'}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{card.bankName}</h3>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{card.cardName} •••• {card.cardNumber ? String(card.cardNumber).slice(-4) : 'XXXX'}</span>
                  </div>
                </div>
                <button className="modal-close" onClick={() => setCcDetailsModal({ open: false, card: null })}><X size={16}/></button>
              </div>

              <div className="modal-body" style={{ marginTop: '1.25rem' }}>
                {/* Section 1: Overview */}
                <div className="cred-details-section">
                  <div className="cred-details-section-title">📊 OVERVIEW & BALANCES</div>
                  <div className="cred-details-grid">
                    <div className="detail-cell">
                      <span className="lbl">Outstanding Debt</span>
                      <span className="val" style={{ color: card.outstanding > 0 ? 'var(--red)' : 'var(--text-primary)', fontWeight: 900 }}>{fmt(card.outstanding)}</span>
                    </div>
                    <div className="detail-cell">
                      <span className="lbl">Available Credit</span>
                      <span className="val" style={{ color: 'var(--green)', fontWeight: 900 }}>{fmt(card.limit - card.outstanding)}</span>
                    </div>
                    <div className="detail-cell">
                      <span className="lbl">Total Credit Limit</span>
                      <span className="val">{fmt(card.limit)}</span>
                    </div>
                    <div className="detail-cell">
                      <span className="lbl">Credit Utilization</span>
                      <span className="val" style={{ fontWeight: 800 }}>{util}%</span>
                    </div>
                  </div>
                </div>

                {/* Section 2: Billing & Cycle */}
                <div className="cred-details-section">
                  <div className="cred-details-section-title">📅 AUTOMATIC BILLING & CYCLE</div>
                  <div className="cred-details-grid">
                    <div className="detail-cell">
                      <span className="lbl">Statement Day</span>
                      <span className="val">{cycle.statementDay}th of every month</span>
                    </div>
                    <div className="detail-cell">
                      <span className="lbl">Grace Period</span>
                      <span className="val">{cycle.graceDays} Days</span>
                    </div>
                    <div className="detail-cell">
                      <span className="lbl">Next Statement Date</span>
                      <span className="val">{cycle.formattedNextStmt}</span>
                    </div>
                    <div className="detail-cell">
                      <span className="lbl">Payment Due Date</span>
                      <span className="val" style={{ color: card.outstanding > 0 ? 'var(--red)' : 'var(--text-primary)', fontWeight: 800 }}>{cycle.formattedDueDate}</span>
                    </div>
                  </div>
                  <div style={{ marginTop: '10px', background: 'rgba(16, 185, 129, 0.1)', padding: '10px 14px', borderRadius: '12px', fontSize: '0.78rem', color: '#059669', fontWeight: 800 }}>
                    💡 Purchases made today get <strong style={{ textDecoration: 'underline' }}>{cycle.interestFreeDaysRemaining} Days</strong> of 0% interest-free credit until {cycle.formattedNextDueDate}!
                  </div>
                </div>

                {/* Section 3: Card Information */}
                <div className="cred-details-section">
                  <div className="cred-details-section-title">💳 CARD INFORMATION</div>
                  <div className="cred-details-grid">
                    <div className="detail-cell">
                      <span className="lbl">Issuer Bank</span>
                      <span className="val">{card.bankName}</span>
                    </div>
                    <div className="detail-cell">
                      <span className="lbl">Card Variant</span>
                      <span className="val">{card.cardName}</span>
                    </div>
                    <div className="detail-cell">
                      <span className="lbl">Card Number</span>
                      <span className="val">•••• •••• •••• {card.cardNumber ? String(card.cardNumber).slice(-4) : 'XXXX'}</span>
                    </div>
                    <div className="detail-cell">
                      <span className="lbl">Reward Benefit</span>
                      <span className="val" style={{ color: 'var(--purple)', fontWeight: 800 }}>1-2% Cashbacks & Rewards</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}



      {/* ═══ ADD / EDIT WEB APP MODAL ═══ */}
      {appModal.open && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setAppModal({ open: false, item: null })}>
          <div className="modal-box" style={{ borderRadius: '20px' }}>
            <div className="modal-header">
              <h3>{appModal.item ? 'Edit Web App Shortcut' : 'Add Web App / Link'}</h3>
              <button className="modal-close" onClick={() => setAppModal({ open: false, item: null })}><X size={14}/></button>
            </div>
            <div className="modal-body">
              <form className="form-grid" onSubmit={e => {
                e.preventDefault();
                const f = e.target;
                const title = f.title.value;
                const url = f.url.value;
                const category = f.category.value;

                if (title && url) {
                  saveWebApp(appModal.item?.id, title, url, category, '');
                  setWebAppCategoryFilter('all');
                  setWebAppSearch('');
                  setAppModal({ open: false, item: null });
                }
              }}>
                <div className="form-group full">
                  <label>Application / Website Name</label>
                  <input name="title" type="text" required placeholder="e.g. ChatGPT, Supabase, Notion" defaultValue={appModal.item?.title || ''}/>
                </div>
                <div className="form-group full">
                  <label>Website URL (Link)</label>
                  <input name="url" type="text" required placeholder="e.g. https://supabase.com/dashboard" defaultValue={appModal.item?.url || ''}/>
                </div>
                <div className="form-group full">
                  <label>Category (Optional)</label>
                  <input name="category" type="text" placeholder="e.g. Finance, AI Tools, Personal (Optional)" defaultValue={appModal.item?.category || ''}/>
                </div>
                <button type="submit" className="btn btn-primary" style={{ gridColumn: '1 / -1', height: '44px', fontWeight: 800 }}>
                  Save Link
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ADMIN USER INSPECTOR MODAL ═══ */}
      {inspectUserModal.open && inspectUserModal.user && (() => {
        const u = inspectUserModal.user;
        const uIncs = adminData.incomes.filter(i => i.user_id === u.id);
        const uExps = adminData.expenses.filter(e => e.user_id === u.id);
        const uCards = adminData.creditCards.filter(c => c.user_id === u.id);
        const uBanks = adminData.banks.filter(b => b.user_id === u.id);

        const incTot = uIncs.reduce((s, i) => s + Number(i.amount || 0), 0);
        const expTot = uExps.reduce((s, e) => s + Number(e.amount || 0), 0);
        const bankTot = uBanks.reduce((s, b) => s + Number(b.balance || 0), 0);
        const cardDebt = uCards.reduce((s, c) => s + Number(c.outstanding || 0), 0);

        return (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setInspectUserModal({ open: false, user: null })}>
            <div className="modal-box" style={{ maxWidth: '680px' }}>
              <div className="modal-header">
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Inspect User: {u.full_name || u.email}</h3>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>ID: {u.id}</span>
                </div>
                <button className="modal-close" onClick={() => setInspectUserModal({ open: false, user: null })}><X size={16}/></button>
              </div>

              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                  <div style={{ background: 'var(--bg-base)', padding: '10px 12px', borderRadius: '10px' }}>
                    <span style={{ fontSize: '0.68rem', color: 'var(--green)', fontWeight: 800 }}>INCOME</span>
                    <div style={{ fontWeight: 900, color: 'var(--green)', fontSize: '1.1rem' }}>+{fmt(incTot)}</div>
                  </div>
                  <div style={{ background: 'var(--bg-base)', padding: '10px 12px', borderRadius: '10px' }}>
                    <span style={{ fontSize: '0.68rem', color: 'var(--red)', fontWeight: 800 }}>EXPENSES</span>
                    <div style={{ fontWeight: 900, color: 'var(--red)', fontSize: '1.1rem' }}>-{fmt(expTot)}</div>
                  </div>
                  <div style={{ background: 'var(--bg-base)', padding: '10px 12px', borderRadius: '10px' }}>
                    <span style={{ fontSize: '0.68rem', color: 'var(--blue)', fontWeight: 800 }}>BANKS</span>
                    <div style={{ fontWeight: 900, color: 'var(--blue)', fontSize: '1.1rem' }}>{fmt(bankTot)}</div>
                  </div>
                  <div style={{ background: 'var(--bg-base)', padding: '10px 12px', borderRadius: '10px' }}>
                    <span style={{ fontSize: '0.68rem', color: 'var(--amber)', fontWeight: 800 }}>CARD DEBT</span>
                    <div style={{ fontWeight: 900, color: 'var(--amber)', fontSize: '1.1rem' }}>{fmt(cardDebt)}</div>
                  </div>
                </div>

                {/* User Incomes List */}
                <div>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--green)', marginBottom: '6px' }}>Income Records ({uIncs.length})</h4>
                  <div style={{ maxHeight: '140px', overflowY: 'auto', background: 'var(--bg-base)', padding: '8px', borderRadius: '10px' }}>
                    {uIncs.map(i => (
                      <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                        <span>{i.date} • {i.category}</span>
                        <strong style={{ color: 'var(--green)' }}>+{fmt(i.amount)}</strong>
                      </div>
                    ))}
                    {uIncs.length === 0 && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No income records.</span>}
                  </div>
                </div>

                {/* User Expenses List */}
                <div>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--red)', marginBottom: '6px' }}>Expense Records ({uExps.length})</h4>
                  <div style={{ maxHeight: '140px', overflowY: 'auto', background: 'var(--bg-base)', padding: '8px', borderRadius: '10px' }}>
                    {uExps.map(e => (
                      <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                        <span>{e.date} • {e.category}</span>
                        <strong style={{ color: 'var(--red)' }}>-{fmt(e.amount)}</strong>
                      </div>
                    ))}
                    {uExps.length === 0 && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No expense records.</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
    </>
  );
}
