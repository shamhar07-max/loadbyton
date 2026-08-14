import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

// Hand-rolled i18n — no react-i18next/formatjs dependency, matching
// CLAUDE.md's minimal-deps rule (the app's own words: "don't reach for a
// package where ~20 lines of stdlib/React code does the job").
//
// SCOPE, STATED HONESTLY: this ships real infrastructure — locale
// persistence, dir=rtl switching, an Arabic font stack, and a translation
// dictionary — wired into the highest-traffic surfaces (nav, landing hero,
// login/register). It does NOT translate every page; most page bodies
// (Dashboard, JobDetail, Admin, etc.) are still English-only. Extending
// coverage means adding keys to the AR dictionary below and swapping a
// literal string for t('key') in the target file — the same mechanical
// step already done in Shell.jsx/Landing.jsx/Login.jsx/Register.jsx.
// Treat "RTL infrastructure shipped" and "the app is in Arabic" as two
// different, separately-tracked claims — conflating them is exactly the
// class of overstatement TODOS.md's 2026-08-13 entry called out.

const STRINGS = {
  en: {
    'nav.openLoads': 'Open Loads',
    'nav.dashboard': 'Dashboard',
    'nav.myBids': 'My Bids',
    'nav.wonJobs': 'Won Jobs',
    'nav.earnings': 'Earnings',
    'nav.templates': 'Templates',
    'nav.contracts': 'Contracts',
    'nav.admin': 'Admin',
    'nav.login': 'Log in',
    'nav.register': 'Get started',
    'nav.features': 'Features',
    'nav.pricing': 'Pricing',
    'nav.about': 'About',
    'landing.hero.title': 'The escrow-backed marketplace for UAE container drayage and road freight.',
    'landing.hero.subtitle':
      'Post a shipment — a container move, a flatbed load, or a multi-truck volume job — and receive priced bids from carriers verified on trade licence, insurance, and TRN. Funds are held in escrow from award through delivery, released automatically once proof of delivery is confirmed or within 24 hours, whichever comes first.',
    'landing.hero.ctaShipper': 'Post a load',
    'landing.hero.ctaCarrier': 'Bid as a carrier',
    'landing.hero.verified': 'Carriers verified on TRN, licence & insurance',
    'landing.hero.autoRelease': 'Escrow auto-releases in {hours}h',
    'landing.hero.coverage': 'Dubai · Abu Dhabi · Sharjah · Fujairah',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.login': 'Log in',
    'auth.register': 'Create account',
    'auth.companyName': 'Company name',
    'auth.role': 'I am a…',
    'auth.roleShipper': 'Shipper',
    'auth.roleCarrier': 'Carrier',
  },
  ar: {
    'nav.openLoads': 'الشحنات المتاحة',
    'nav.dashboard': 'لوحة التحكم',
    'nav.myBids': 'عروضي',
    'nav.wonJobs': 'المهام الفائزة',
    'nav.earnings': 'الأرباح',
    'nav.templates': 'القوالب',
    'nav.contracts': 'العقود',
    'nav.admin': 'الإدارة',
    'nav.login': 'تسجيل الدخول',
    'nav.register': 'ابدأ الآن',
    'nav.features': 'المزايا',
    'nav.pricing': 'الأسعار',
    'nav.about': 'من نحن',
    'landing.hero.title': 'السوق الإلكتروني المدعوم بحساب الضمان لنقل الحاويات والشحن البري في دولة الإمارات.',
    'landing.hero.subtitle':
      'انشر شحنة — نقل حاوية، حمولة على مسطحة، أو مهمة متعددة الشاحنات — واحصل على عروض أسعار من ناقلين تم التحقق من رخصتهم التجارية وتأمينهم ورقمهم الضريبي (TRN). تُحفظ الأموال في حساب الضمان من لحظة الترسية وحتى التسليم، وتُصرف تلقائيًا فور تأكيد إثبات التسليم أو خلال 24 ساعة، أيهما أسبق.',
    'landing.hero.ctaShipper': 'انشر حمولة',
    'landing.hero.ctaCarrier': 'قدّم عرضًا كناقل',
    'landing.hero.verified': 'ناقلون تم التحقق من رخصتهم وتأمينهم ورقمهم الضريبي',
    'landing.hero.autoRelease': 'يُصرف الضمان تلقائيًا خلال {hours} ساعة',
    'landing.hero.coverage': 'دبي · أبوظبي · الشارقة · الفجيرة',
    'auth.email': 'البريد الإلكتروني',
    'auth.password': 'كلمة المرور',
    'auth.login': 'تسجيل الدخول',
    'auth.register': 'إنشاء حساب',
    'auth.companyName': 'اسم الشركة',
    'auth.role': 'أنا…',
    'auth.roleShipper': 'شاحن',
    'auth.roleCarrier': 'ناقل',
  },
};

const RTL_LOCALES = new Set(['ar']);
const LocaleContext = createContext(null);

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(() => {
    // typeof-guarded: this module also runs under Node during build-time
    // prerendering (see scripts/prerender.mjs), where localStorage doesn't
    // exist — always prerender the English default there.
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('loadbyton-locale') : null;
    return saved === 'ar' ? 'ar' : 'en';
  });

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
    localStorage.setItem('loadbyton-locale', locale);
  }, [locale]);

  const setLocale = useCallback((next) => setLocaleState(next), []);

  const t = useCallback(
    (key, fallback, vars) => {
      let str = STRINGS[locale]?.[key] ?? STRINGS.en[key] ?? fallback ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) str = str.replaceAll(`{${k}}`, v);
      return str;
    },
    [locale]
  );

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t, isRtl: RTL_LOCALES.has(locale) }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}
