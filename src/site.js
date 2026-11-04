(() => {
  'use strict';
  const { PRICES, rub } = window.BK;
  const BK = window.BK;
  const arrow = '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 16 16 4M4 4h12v12"/></svg>';
  const payments = plan => Number.isFinite(plan.freePayments) ? plan.freePayments + ' в пакете, затем ' + rub(plan.paymentPrice) + ' за платёж' : 'Без лимита';
  const withdrawal = plan => 'До ' + rub(plan.withdrawalLimit) + '/мес ' + (plan.withdrawalRate ? 'под ' + String(plan.withdrawalRate).replace('.', ',') + '%' : 'без комиссии');
  const each = (selector, html) => document.querySelectorAll(selector).forEach(el => { el.innerHTML = html; });

  each('[data-reg-plans]', Object.entries(PRICES.reg).map(([id, plan]) => `<article class="plan ${id === 'turnkey' ? 'is-featured' : ''}">
    <div class="plan-head">${id === 'turnkey' ? '<p class="eyebrow">С ПОДАЧЕЙ ОНЛАЙН</p>' : '<p class="eyebrow">РЕГИСТРАЦИЯ ИП</p>'}<h3 class="h3">${plan.name}</h3></div>
    <p class="plan-price">${rub(plan.price)} <small>разово</small></p><ul>${plan.features.map(feature => '<li>' + feature + '</li>').join('')}</ul>
    <button class="btn ${id === 'turnkey' ? 'btn-primary' : 'btn-ghost'}" type="button" data-plan-reg="${id}">Выбрать тариф ${arrow}</button></article>`).join(''));

  each('[data-rko-plans]', Object.entries(PRICES.rko).map(([id, plan]) => `<article class="plan ${id === 'flow' ? 'is-featured' : ''}">
    <div class="plan-head"><p class="eyebrow">РАСЧЁТНЫЙ СЧЁТ</p><h3 class="h3">${plan.name}</h3></div><p class="plan-price">${rub(plan.price)} <small>/мес</small></p>
    <ul><li>${payments(plan)}</li><li>${withdrawal(plan)}</li>${plan.currencyControl ? '<li>Валютный контроль</li>' : ''}</ul><button class="btn ${id === 'flow' ? 'btn-primary' : 'btn-ghost'}" type="button" data-plan-rko="${id}">Выбрать счёт ${arrow}</button></article>`).join(''));

  each('[data-reg-price-rows]', Object.entries(PRICES.reg).map(([id, plan]) => `<tr><th scope="row">${plan.name}</th><td>${plan.description}</td><td class="mono">${rub(plan.price)}</td><td><button class="btn btn-ghost btn-small" type="button" data-plan-reg="${id}" aria-label="Выбрать регистрацию: ${plan.name}">Выбрать</button></td></tr>`).join(''));
  each('[data-rko-price-rows]', Object.entries(PRICES.rko).map(([id, plan]) => `<tr><th scope="row">${plan.name}</th><td class="mono">${rub(plan.price)}</td><td>${payments(plan)}${plan.currencyControl ? '. Валютный контроль' : ''}</td><td>${withdrawal(plan)}</td><td><button class="btn btn-ghost btn-small" type="button" data-plan-rko="${id}" aria-label="Выбрать счёт: ${plan.name}">Выбрать</button></td></tr>`).join(''));
  each('[data-extra-price-rows]', Object.values(PRICES.extras).map(plan => `<tr><th scope="row">${plan.name}</th><td class="mono">${rub(plan.price)}</td><td>${plan.monthly ? 'В месяц' : 'Разово'}</td></tr>`).join(''));
  each('[data-home-rko]', Object.values(PRICES.rko).map(plan => `<tr><th scope="row">${plan.name}</th><td class="mono">${rub(plan.price)}</td><td>${Number.isFinite(plan.freePayments) ? plan.freePayments + ' в пакете' : 'Без лимита'}</td></tr>`).join(''));

  const rkoPlans = Object.values(PRICES.rko);
  const comparisonRows = [
    ['Обслуживание в месяц', plan => rub(plan.price)],
    ['Исходящие платежи', payments],
    ['Вывод себе в месяц', withdrawal],
    ['Валютный контроль', plan => plan.currencyControl ? 'Предусмотрен' : 'Не указан в тарифе']
  ];
  each('[data-rko-comparison]', '<thead><tr><th scope="col">Условие</th>' + rkoPlans.map(plan => '<th scope="col">' + plan.name + '</th>').join('') + '</tr></thead><tbody>' + comparisonRows.map(([title, value]) => '<tr><th scope="row">' + title + '</th>' + rkoPlans.map(plan => '<td>' + value(plan) + '</td>').join('') + '</tr>').join('') + '</tbody>');
  each('[data-rko-options]', Object.entries(PRICES.rko).map(([id, plan]) => `<option value="${id}">${plan.name} · ${rub(plan.price)}/мес</option>`).join(''));

  function updateHome() {
    const tax = document.getElementById('home-tax');
    const account = document.getElementById('home-account');
    if (tax && [...tax.options].some(option => option.value === BK.state.tax)) tax.value = BK.state.tax;
    if (account && Object.hasOwn(PRICES.rko, BK.state.rko)) account.value = BK.state.rko;
  }
  ['home-tax', 'home-account'].forEach(id => document.getElementById(id)?.addEventListener('change', event => {
    const input = event.currentTarget;
    if (id === 'home-tax') BK.state.tax = input.value;
    else BK.state.rko = input.value;
    const tax = document.getElementById('home-tax');
    const plan = PRICES.rko[BK.state.rko];
    document.getElementById('home-sheet-status').textContent = 'Лист обновлён: ' + tax.options[tax.selectedIndex].text + ', счёт «' + plan.name + '». Выбор перенесён в калькулятор. Это образец.';
  }));

  function selectTab(value, focus = false) {
    const tabs = [...document.querySelectorAll('[data-tax-tab]')];
    if (!tabs.some(tab => tab.dataset.taxTab === value)) return;
    tabs.forEach(tab => {
      const selected = tab.dataset.taxTab === value;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
      if (focus && selected) tab.focus();
    });
  }
  document.querySelectorAll('[data-tax-tab]').forEach(tab => {
    tab.addEventListener('click', () => selectTab(tab.dataset.taxTab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const tabs = [...document.querySelectorAll('[data-tax-tab]')];
      let index = tabs.indexOf(tab);
      if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = tabs.length - 1;
      else index = (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      selectTab(tabs[index].dataset.taxTab, true);
    });
  });
  document.querySelectorAll('[data-tax-choose]').forEach(button => button.addEventListener('click', () => {
    BK.state.tax = button.dataset.taxChoose;
    BK.go('calc');
  }));

  const countInput = document.getElementById('rko-payments');
  const bestButton = document.getElementById('rko-select-best');
  function calculateRko() {
    if (!countInput) return;
    const count = Number(countInput.value);
    const valid = countInput.value.trim() !== '' && Number.isInteger(count) && count >= 0 && count <= 100000;
    countInput.setAttribute('aria-invalid', String(!valid));
    document.getElementById('rko-payments-error').textContent = valid ? '' : 'Введите целое число платежей от 0 до 100 000.';
    bestButton.disabled = !valid;
    if (!valid) {
      document.getElementById('rko-costs').textContent = 'Исправьте число платежей, чтобы увидеть расчёт.';
      document.getElementById('rko-best').textContent = '';
      delete bestButton.dataset.planRko;
      return;
    }
    const totals = Object.entries(PRICES.rko).map(([id, plan]) => ({ id, name: plan.name, total: plan.price + Math.max(0, count - plan.freePayments) * plan.paymentPrice }));
    const cheapest = [...totals].sort((a, b) => a.total - b.total)[0];
    document.getElementById('rko-costs').innerHTML = totals.map(plan => `<div class="cost-line ${plan.id === cheapest.id ? 'is-best' : ''}"><span>${plan.name}${plan.id === cheapest.id ? ' · минимум' : ''}</span><strong>${rub(plan.total)}</strong></div>`).join('');
    document.getElementById('rko-best').textContent = 'При ' + count + ' платежах минимальная стоимость — у тарифа «' + cheapest.name + '». Только обслуживание и исходящие платежи.';
    bestButton.dataset.planRko = cheapest.id;
    bestButton.textContent = 'Выбрать «' + cheapest.name + '»';
  }
  countInput?.addEventListener('input', calculateRko);

  const search = document.getElementById('faq-search');
  const faqItems = [...document.querySelectorAll('#faq-questions .faq-item')];
  const normalize = value => value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim();
  function filterFaq() {
    const words = normalize(search.value).split(/\s+/).filter(Boolean);
    let found = 0;
    faqItems.forEach(item => {
      const matches = words.every(word => normalize(item.textContent).includes(word));
      item.hidden = !matches;
      if (matches) found++;
      else item.open = false;
    });
    document.getElementById('faq-count').textContent = 'Вопросов: ' + found + ' из ' + faqItems.length;
    document.getElementById('faq-empty').hidden = found !== 0;
    document.getElementById('faq-questions').hidden = found === 0;
  }
  search?.addEventListener('input', filterFaq);
  document.getElementById('faq-reset')?.addEventListener('click', () => { search.value = ''; filterFaq(); search.focus(); });

  const contactForm = document.getElementById('contact-form');
  contactForm?.addEventListener('submit', event => {
    event.preventDefault();
    const topic = document.getElementById('contact-topic');
    const name = document.getElementById('contact-name');
    const message = document.getElementById('contact-message');
    const consent = document.getElementById('contact-consent');
    const fields = [[topic, topic.value !== ''], [name, name.value.trim().length >= 2], [message, message.value.trim().length >= 10], [consent, consent.checked]];
    fields.forEach(([field, valid]) => field.setAttribute('aria-invalid', String(!valid)));
    const invalid = fields.find(([, valid]) => !valid);
    if (invalid) {
      document.getElementById('contact-error').textContent = 'Выберите тему, укажите имя от двух символов, вопрос от 10 символов и подтвердите согласие.';
      invalid[0].focus(); return;
    }
    document.getElementById('contact-error').textContent = '';
    contactForm.hidden = true;
    const success = document.getElementById('contact-success');
    success.hidden = false;
    success.focus();
    contactForm.reset();
  });
  document.getElementById('contact-again')?.addEventListener('click', () => {
    document.getElementById('contact-success').hidden = true;
    contactForm.hidden = false;
    contactForm.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
    document.getElementById('contact-topic').focus();
  });

  BK.onView(view => {
    if (view === 'home') updateHome();
    if (view === 'ip') selectTab(BK.state.tax);
    if (view === 'rko') calculateRko();
    if (view === 'faq') filterFaq();
  });
  updateHome();
  calculateRko();
  if (search) filterFaq();
})();
