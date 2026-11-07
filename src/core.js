(() => {
  'use strict';

  document.documentElement.lang = 'ru';

  const PRICES = {
    reg: {
      start: { name: 'Сам с проверкой', price: 990, description: 'Готовим заявление Р21001, проверяем и даём инструкцию по подаче.', features: ['Заявление Р21001', 'Проверка заполнения', 'Инструкция по подаче'] },
      turnkey: { name: 'Под ключ', price: 2900, description: 'Всё из тарифа «Сам с проверкой», подбор ОКВЭД и налогового режима, КЭП и подача в ФНС онлайн.', features: ['Всё из тарифа «Сам с проверкой»', 'Подбор ОКВЭД и налогового режима', 'КЭП и подача в ФНС онлайн'] },
      care: { name: 'Под ключ и бухгалтер', price: 7900, description: 'Всё из тарифа «Под ключ» и три месяца сопровождения бухгалтером.', features: ['Всё из тарифа «Под ключ»', 'Три месяца сопровождения бухгалтером', 'Помощь с первыми отчётами'] }
    },
    rko: {
      zero: { name: 'Ноль', price: 0, freePayments: 5, paymentPrice: 99, withdrawalLimit: 150000, withdrawalRate: 1.5, currencyControl: false },
      flow: { name: 'Поток', price: 1490, freePayments: 50, paymentPrice: 49, withdrawalLimit: 500000, withdrawalRate: 0, currencyControl: false },
      stream: { name: 'Оборот', price: 3900, freePayments: Infinity, paymentPrice: 0, withdrawalLimit: 1500000, withdrawalRate: 0, currencyControl: true }
    },
    extras: {
      acc: { name: 'Бухгалтер', price: 3900, monthly: true },
      law: { name: 'Консультация юриста', price: 1500, monthly: false },
      kep: { name: 'КЭП отдельно', price: 1200, monthly: false },
      edit: { name: 'Изменения в ЕГРИП', price: 1900, monthly: false },
      close: { name: 'Закрытие ИП', price: 1900, monthly: false }
    }
  };
  const titles = { home: 'ИП и счёт — с понятного старта', ip: 'Регистрация ИП', rko: 'Расчётный счёт', prices: 'Цены', faq: 'Вопросы и ответы', about: 'О Kyday', contacts: 'Контакты', calc: 'Собрать старт', order: 'Оформить заявку', cabinet: 'Мои заявки', notfound: 'Раздел не найден' };
  const callbacks = new Set();
  let currentView = null;
  let toastTimer;
  let previousFocus;
  const rub = n => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(n) || 0).replace(/\u00a0/g, ' ') + ' ₽';
  const state = { reg: 'turnkey', rko: 'flow', extras: [], tax: 'usn6', okved: [], order: null };

  function toast(text) {
    const target = document.getElementById('toast');
    if (!target) return;
    clearTimeout(toastTimer);
    target.textContent = text;
    target.hidden = false;
    toastTimer = setTimeout(() => { target.hidden = true; target.textContent = ''; }, 4000);
  }

  function go(view) {
    const next = String(view).replace(/^#/, '');
    if (location.hash === '#' + next) route();
    else location.hash = next;
  }

  function closeMenu() {
    const menu = document.getElementById('header-menu');
    const toggle = document.getElementById('menu-toggle');
    if (menu) menu.classList.remove('is-open');
    if (toggle) { toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Открыть меню'); }
  }

  function route() {
    const requested = location.hash.slice(1) || 'home';
    const views = [...document.querySelectorAll('.view[data-view]')];
    const active = views.find(el => el.dataset.view === requested) || views.find(el => el.dataset.view === 'notfound');
    if (!active) return;
    closeModal(false);
    currentView = active.dataset.view;
    views.forEach(el => { el.hidden = el !== active; });
    document.title = currentView === 'home' ? 'Kyday — ИП и счёт' : (titles[currentView] || currentView) + ' — Kyday';
    document.querySelectorAll('[data-nav] a[href^="#"]').forEach(link => {
      if (link.getAttribute('href') === '#' + currentView) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    closeMenu();
    callbacks.forEach(fn => fn(currentView));
    window.scrollTo({ top: 0, behavior: 'instant' });
    const heading = active.querySelector('h1');
    if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
  }

  function closeModal(restore = true) {
    const modal = document.getElementById('callback-modal');
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    const page = document.getElementById('page-shell');
    if (page) page.inert = false;
    if (restore && previousFocus?.isConnected) previousFocus.focus();
  }

  function openCallback(topic = 'Помощь со стартом') {
    const modal = document.getElementById('callback-modal');
    if (!modal) return;
    previousFocus = document.activeElement;
    const form = document.getElementById('callback-form');
    form.reset();
    form.hidden = false;
    document.getElementById('callback-success').hidden = true;
    document.getElementById('callback-topic').textContent = topic || 'Помощь со стартом';
    document.getElementById('callback-error').textContent = '';
    form.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
    modal.hidden = false;
    document.body.classList.add('modal-open');
    const page = document.getElementById('page-shell');
    if (page) page.inert = true;
    document.getElementById('callback-name').focus();
  }

  async function copy(text, btn) {
    const value = String(text);
    try {
      await navigator.clipboard.writeText(value);
      toast('Скопировано: ' + value);
      if (btn) {
        const original = btn.textContent;
        btn.textContent = 'Скопировано';
        setTimeout(() => { btn.textContent = original; }, 2000);
      }
    } catch {
      const fallback = document.getElementById('copy-fallback');
      const input = document.getElementById('copy-value');
      if (!fallback || !input) { toast('Не удалось скопировать. Выделите текст и скопируйте вручную.'); return; }
      fallback.hidden = false;
      input.value = value;
      input.focus();
      input.select();
      input.setSelectionRange(0, value.length);
      toast('Текст выделен. Скопируйте его вручную: Ctrl+C или через меню выделения.');
    }
  }

  window.Kyday = { PRICES, rub, go, toast, openCallback, copy, state, onView(fn) { callbacks.add(fn); if (currentView) fn(currentView); return () => callbacks.delete(fn); } };

  const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
  function isDark() { return document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && colorScheme.matches); }
  function themeLabel() {
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;
    toggle.setAttribute('aria-pressed', String(isDark()));
    toggle.setAttribute('aria-label', isDark() ? 'Включить светлую тему' : 'Включить тёмную тему');
    toggle.querySelector('[data-theme-label]').textContent = isDark() ? 'Светлая' : 'Тёмная';
  }
  try { const saved = localStorage.getItem('kyday-theme'); if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved; } catch { /* Тема работает и без хранилища. */ }

  document.addEventListener('click', event => {
    const target = event.target.closest('button, a, [data-modal-backdrop]');
    if (!target) return;
    if (target.matches('[data-callback]')) { event.preventDefault(); openCallback(target.dataset.callback); }
    else if (target.matches('[data-plan-reg], [data-plan-rko]')) {
      event.preventDefault();
      if (Object.hasOwn(PRICES.reg, target.dataset.planReg)) state.reg = target.dataset.planReg;
      if (Object.hasOwn(PRICES.rko, target.dataset.planRko)) state.rko = target.dataset.planRko;
      go('order');
    } else if (target.matches('[data-copy]')) { event.preventDefault(); copy(target.dataset.copy, target); }
    else if (target.matches('[data-modal-close], [data-modal-backdrop]')) closeModal();
    else if (target.id === 'theme-toggle') {
      const theme = isDark() ? 'light' : 'dark';
      document.documentElement.dataset.theme = theme;
      try { localStorage.setItem('kyday-theme', theme); } catch { /* Необязательное сохранение. */ }
      themeLabel();
    } else if (target.id === 'menu-toggle') {
      const open = target.getAttribute('aria-expanded') !== 'true';
      target.setAttribute('aria-expanded', String(open));
      target.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
      document.getElementById('header-menu').classList.toggle('is-open', open);
    } else if (target.id === 'copy-dismiss') document.getElementById('copy-fallback').hidden = true;
    else if (target.matches('[data-scroll]')) {
      const section = document.getElementById(target.dataset.scroll);
      if (section) section.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    } else if (target.matches('a[href^="#"]') && target.getAttribute('href') === location.hash) {
      event.preventDefault(); route();
    }
  });

  document.addEventListener('keydown', event => {
    const modal = document.getElementById('callback-modal');
    if (event.key === 'Escape') {
      if (modal && !modal.hidden) closeModal();
      else closeMenu();
    }
    if (!modal || modal.hidden || event.key !== 'Tab') return;
    const focusable = [...modal.querySelectorAll('button, input, a[href], [tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  function init() {
    themeLabel();
    colorScheme.addEventListener('change', themeLabel);
    document.getElementById('callback-form')?.addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget;
      const name = document.getElementById('callback-name');
      const phone = document.getElementById('callback-phone');
      const consent = document.getElementById('callback-consent');
      const fields = [[name, name.value.trim().length >= 2], [phone, /^\+?[\d\s()\-]+$/.test(phone.value.trim()) && phone.value.replace(/\D/g, '').length >= 10 && phone.value.replace(/\D/g, '').length <= 15], [consent, consent.checked]];
      fields.forEach(([field, valid]) => field.setAttribute('aria-invalid', String(!valid)));
      const invalid = fields.find(([, valid]) => !valid);
      if (invalid) {
        document.getElementById('callback-error').textContent = 'Укажите имя от двух символов, телефон от 10 до 15 цифр и подтвердите согласие.';
        invalid[0].focus(); return;
      }
      form.hidden = true;
      const success = document.getElementById('callback-success');
      success.hidden = false;
      success.focus();
      form.reset();
    });
    window.addEventListener('hashchange', route);
    route();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else queueMicrotask(init);
})();
