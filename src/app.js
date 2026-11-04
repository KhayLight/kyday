(function () {
  'use strict';

  const BK = window.BK;
  if (!BK) return;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const defaults = { reg: 'turnkey', rko: 'flow', extras: [], tax: 'usn6', okved: [] };
  const catalog = {
    reg: {
      start: ['Сам с проверкой', 990, 'Заявление Р21001, проверка и инструкция.'],
      turnkey: ['Под ключ', 2900, 'Подбор ОКВЭД и режима, КЭП, подача онлайн.'],
      care: ['Под ключ и бухгалтер', 7900, 'Всё под ключ и три месяца сопровождения бухгалтером.']
    },
    rko: {
      zero: ['Ноль', 0, '5 платежей бесплатно, далее 99 ₽.'],
      flow: ['Поток', 1490, '50 платежей, далее 49 ₽.'],
      stream: ['Оборот', 3900, 'Платежи без лимита; валютный контроль.']
    },
    extras: {
      acc: ['Бухгалтер', 3900], law: ['Консультация юриста', 1500],
      kep: ['Отдельно КЭП', 1200], edit: ['Изменения в ЕГРИП', 1900], close: ['Закрытие ИП', 1900]
    }
  };
  const taxes = {
    usn6: ['УСН 6%', 'Налог с доходов. Подходит для сравнения, если расходов немного.'],
    usn15: ['УСН 15%', 'Доходы минус подтверждённые расходы. Важен учёт затрат.'],
    patent: ['Патент', 'Для отдельных видов деятельности. Условия зависят от региона.'],
    ausn: ['АУСН', 'Автоматизированный режим. Нужно проверить доступность и условия.'],
    npd: ['НПД', 'Для самостоятельной работы. Есть ограничения по деятельности и найму.']
  };
  const activities = [
    ['62.01', 'Разработка компьютерного программного обеспечения'],
    ['47.91', 'Розничная торговля по почте или через интернет'],
    ['73.11', 'Деятельность рекламных агентств'],
    ['96.02', 'Услуги парикмахерских и салонов красоты'],
    ['43.31', 'Производство штукатурных работ'],
    ['85.41', 'Дополнительное образование детей и взрослых'],
    ['49.32', 'Деятельность легкового такси и арендованных автомобилей с водителем'],
    ['56.10', 'Деятельность ресторанов и услуги по доставке продуктов питания'],
    ['74.10', 'Специализированная деятельность в области дизайна'],
    ['63.11', 'Обработка данных и размещение информации']
  ];
  const stages = ['Заявка принята', 'Документы готовы', 'КЭП выпущена', 'Подано в ФНС', 'Запись ЕГРИП', 'Счёт открыт'];
  const kepWays = { office: 'В учебном центре выдачи', visit: 'С выездом специалиста (демо)', help: 'Нужна помощь с выбором' };
  const callTimes = { morning: '09:00–12:00', day: '12:00–15:00', evening: '15:00–18:00', any: 'Любое время с 09:00 до 18:00' };
  const documents = [
    { id: 'application', name: 'Заявление Р21001', step: 1 },
    { id: 'tax', name: 'Выбранный налоговый режим', step: 1 },
    { id: 'signature', name: 'Подтверждение выпуска КЭП', step: 2 },
    { id: 'receipt', name: 'Квитанция о подаче в ФНС', step: 3 },
    { id: 'registry', name: 'Лист записи ЕГРИП — ОБРАЗЕЦ', step: 4 },
    { id: 'account', name: 'Реквизиты счёта — ОБРАЗЕЦ', step: 5 }
  ];
  let wizard = freshWizard();
  let completed = false;
  let activeTab = 'status';
  let sampleExpanded = false;
  let sampleOrder = null;
  let modalReturn = null;
  let serial = 0;

  function freshWizard() {
    return { step: 0, name: '', phone: '', city: '', email: '', kep: 'help', callTime: 'any', consent: false };
  }

  // The brief fixes the keys and amounts, but leaves the PRICES item shape open.
  function price(group, id) {
    const fallback = catalog[group][id];
    const source = BK.PRICES && BK.PRICES[group] && BK.PRICES[group][id];
    const raw = typeof source === 'number' ? source : source && (source.price ?? source.amount ?? source.monthly ?? source.cost);
    return { name: (source && (source.name || source.title)) || fallback[0], amount: Number.isFinite(Number(raw)) && raw != null ? Number(raw) : fallback[1], hint: fallback[2] || '' };
  }

  function normalize() {
    const state = BK.state;
    if (!Object.hasOwn(catalog.reg, state.reg)) state.reg = defaults.reg;
    if (!Object.hasOwn(catalog.rko, state.rko)) state.rko = defaults.rko;
    if (!Object.hasOwn(taxes, state.tax)) state.tax = defaults.tax;
    state.extras = [...new Set((Array.isArray(state.extras) ? state.extras : []).filter(id => Object.hasOwn(catalog.extras, id)))];
    state.okved = [...new Set((Array.isArray(state.okved) ? state.okved : []).filter(code => activities.some(item => item[0] === code)))];
  }

  function selection() {
    normalize();
    return { reg: BK.state.reg, rko: BK.state.rko, tax: BK.state.tax, extras: [...BK.state.extras], okved: [...BK.state.okved] };
  }

  function totals(config) {
    return config.extras.reduce((sum, id) => {
      sum[id === 'acc' ? 'monthly' : 'once'] += price('extras', id).amount;
      return sum;
    }, { once: price('reg', config.reg).amount, monthly: price('rko', config.rko).amount });
  }

  function totalHTML(config) {
    const sum = totals(config);
    return `<div><small>Разово</small><strong>${esc(BK.rub(sum.once))}</strong></div><div><small>В месяц</small><strong>${esc(BK.rub(sum.monthly))}</strong></div>`;
  }

  function sheetHTML(config, options = {}) {
    const rows = [
      ['01', 'Форма', 'Индивидуальный предприниматель'],
      ['02', 'Регистрация', price('reg', config.reg).name],
      ['03', 'Налоговый режим', taxes[config.tax][0]],
      ['04', 'ОКВЭД', config.okved.length ? config.okved.join(' · ') : 'Выберите виды деятельности'],
      ['05', 'Счёт', `${price('rko', config.rko).name} · банк-партнёр бюро (вымышленный)`],
      ['06', 'Дополнительно', config.extras.length ? config.extras.map(id => price('extras', id).name).join(', ') : 'Без дополнительных услуг']
    ];
    if (options.person) rows.unshift(['00', 'Заявитель', options.person]);
    return `<article class="sheet app-sheet"><div class="app-sheet-head"><div><p class="app-sheet-title">ЛИСТ ЗАПИСИ</p><p class="app-hint">${options.registry ? 'ЕГРИП · учебный образец' : 'Ваш будущий старт · черновик'}</p></div><span class="app-sample">ОБРАЗЕЦ</span></div>${rows.map(row => `<div class="sheet-row app-sheet-row"><span>${row[0]}</span><span>${row[1]}</span><strong>${esc(row[2])}</strong></div>`).join('')}${options.registry ? '<p class="mono app-hint">ОБРАЗЕЦ · ГРНИП: ДЕМО-0000. Номер вымышленный.</p>' : ''}${options.stamp ? `<div class="app-stamp-space"><span class="stamp app-stamp${options.animate ? ' app-stamp-drop' : ''}">${esc(options.stamp)}<small>ОБРАЗЕЦ</small></span></div>` : ''}<p class="app-sheet-note">Это визуальный образец, а не документ ФНС. Выбор налогового режима нужно проверить под вашу деятельность.</p></article>`;
  }

  function choicesHTML(prefix) {
    const state = selection();
    const plans = (group, title) => `<fieldset class="app-group"><legend>${title}</legend><div class="app-choices">${Object.keys(catalog[group]).map(id => {
      const item = price(group, id);
      return `<label class="app-choice" for="${prefix}-${group}-${id}"><input type="radio" id="${prefix}-${group}-${id}" name="${group}" value="${id}" data-app-choice="${group}"${state[group] === id ? ' checked' : ''}><span><strong>${esc(item.name)}</strong><small>${esc(item.hint)}</small></span><span class="app-price">${esc(BK.rub(item.amount))}${group === 'rko' ? '/мес' : ''}</span></label>`;
    }).join('')}</div></fieldset>`;
    return plans('reg', 'Тариф регистрации') + `<fieldset class="app-group"><legend>Налоговый режим</legend><div class="field app-field"><label for="${prefix}-tax">Как считать налог</label><select id="${prefix}-tax" name="tax" data-app-choice="tax" aria-describedby="${prefix}-tax-hint">${Object.entries(taxes).map(([id, item]) => `<option value="${id}"${state.tax === id ? ' selected' : ''}>${item[0]}</option>`).join('')}</select><p id="${prefix}-tax-hint" class="app-hint" data-app-tax-hint>${esc(taxes[state.tax][1])}</p></div><p class="app-hint">Список для знакомства. Совместимость режима и ОКВЭД в демо не проверяется.</p></fieldset><fieldset class="app-group"><legend>Чем займётесь</legend><p class="app-hint">Отметьте один или несколько кодов ОКВЭД.</p><div class="app-okved">${activities.map(([code, name]) => `<label class="check app-check" for="${prefix}-okved-${code.replace('.', '-')}"><input type="checkbox" id="${prefix}-okved-${code.replace('.', '-')}" name="okved" value="${code}" data-app-choice="okved"${state.okved.includes(code) ? ' checked' : ''}><span><code>${code}</code> ${name}</span></label>`).join('')}</div><span class="app-error" id="${prefix}-okved-error" role="status"></span></fieldset>` + plans('rko', 'Тариф РКО') + `<fieldset class="app-group"><legend>Дополнительные услуги</legend><div class="app-choices">${Object.keys(catalog.extras).map(id => {
      const item = price('extras', id);
      return `<label class="app-choice" for="${prefix}-extras-${id}"><input type="checkbox" id="${prefix}-extras-${id}" name="extras" value="${id}" data-app-choice="extras"${state.extras.includes(id) ? ' checked' : ''}><span>${esc(item.name)}</span><span class="app-price">${esc(BK.rub(item.amount))}${id === 'acc' ? '/мес' : ''}</span></label>`;
    }).join('')}</div><p class="app-hint">КЭП уже входит в тарифы «Под ключ». Отдельную КЭП выбирайте для другой задачи. В тариф «Под ключ и бухгалтер» включены три месяца сопровождения; дополнительный бухгалтер считается отдельно, ежемесячно.</p></fieldset>`;
  }

  function renderCalc() {
    $('#app-calc-form').innerHTML = choicesHTML('app-calc');
    updateCalc();
  }

  function updateCalc() {
    const config = selection();
    $('#app-calc-sheet').innerHTML = sheetHTML(config);
    $('#app-calc-total').innerHTML = totalHTML(config);
    $('#app-calc-mobile-total').innerHTML = totalHTML(config);
  }

  function updateChoice(input) {
    const key = input.dataset.appChoice;
    if (key === 'okved' || key === 'extras') {
      const values = new Set(BK.state[key]);
      if (input.checked) values.add(input.value); else values.delete(input.value);
      BK.state[key] = [...values];
    } else BK.state[key] = input.value;
    normalize();
    const form = input.closest('form');
    const hint = $('[data-app-tax-hint]', form);
    if (hint) hint.textContent = taxes[BK.state.tax][1];
    if (form.id === 'app-calc-form') updateCalc();
    else {
      const total = $('#app-order-total');
      if (total) total.innerHTML = totalHTML(selection());
      const error = $('#app-order-okved-error');
      if (error && BK.state.okved.length) error.textContent = '';
    }
  }

  function field(name, label, type = 'text', autocomplete = '') {
    return `<div class="field app-field"><label for="app-order-${name}">${label}</label><input id="app-order-${name}" name="${name}" type="${type}" value="${esc(wizard[name])}" data-app-draft="${name}"${autocomplete ? ` autocomplete="${autocomplete}"` : ''}${name === 'email' ? '' : ' required'}${name === 'phone' ? ' inputmode="tel" maxlength="30"' : ' maxlength="120"'} aria-describedby="app-order-${name}-error"><span class="app-error" id="app-order-${name}-error" role="status"></span></div>`;
  }

  function selectField(name, label, values) {
    return `<div class="field app-field"><label for="app-order-${name}">${label}</label><select id="app-order-${name}" name="${name}" data-app-draft="${name}" aria-describedby="app-order-${name}-error">${Object.entries(values).map(([id, title]) => `<option value="${id}"${wizard[name] === id ? ' selected' : ''}>${title}</option>`).join('')}</select><span class="app-error" id="app-order-${name}-error" role="status"></span></div>`;
  }

  function reviewHTML() {
    const config = selection();
    const rows = [
      ['Имя', wizard.name], ['Телефон', wizard.phone], ['Город', wizard.city], ['Почта', wizard.email || 'Не указана'],
      ['КЭП', kepWays[wizard.kep]], ['Звонок', `${callTimes[wizard.callTime]} · местное время города заявителя`]
    ];
    return `<div class="grid-2"><div>${sheetHTML(config)}</div><div><h2 class="h3">Проверьте контакты</h2><dl class="app-review">${rows.map(([key, value]) => `<dt>${key}</dt><dd>${esc(value)}</dd>`).join('')}</dl><div class="app-total">${totalHTML(config)}</div></div></div><label class="check app-check" for="app-order-consent"><input type="checkbox" id="app-order-consent" name="consent" data-app-draft="consent"${wizard.consent ? ' checked' : ''} aria-describedby="app-order-consent-error"><span>Согласен на обработку введённых контактов в рамках этой демонстрации. Понимаю, что данные остаются только в памяти страницы.</span></label><span class="app-error" id="app-order-consent-error" role="status"></span>`;
  }

  function renderOrder(focus = false) {
    const root = $('#app-order-root');
    if (completed && BK.state.order) {
      const order = BK.state.order;
      root.innerHTML = `<div class="app-success" role="status"><h2 class="h2" tabindex="-1" id="app-order-success">Заявка принята</h2><p><strong class="mono">${esc(order.number)}</strong> · ${esc(dateLabel(order.date))}</p>${sheetHTML(order.data.selection, { person: order.data.name, stamp: 'ЗАЯВКА ПРИНЯТА', animate: true })}<p class="app-note">Заявка демонстрационная. Мы никуда её не отправили. Статусы в кабинете меняются по вашей кнопке.</p><div class="app-actions"><a href="#cabinet" class="btn btn-primary">Открыть кабинет</a><button type="button" class="btn btn-ghost" data-app-action="new-order">Новая заявка</button></div></div>`;
      if (focus) $('#app-order-success').focus();
      return;
    }
    const labels = ['Выбор', 'Контакты', 'КЭП и звонок', 'Проверка'];
    let body = '';
    if (wizard.step === 0) body = `<h2 class="h2" id="app-order-step-title" tabindex="-1">Проверьте ваш выбор</h2><p class="muted">Тарифы можно изменить здесь. Для продолжения отметьте хотя бы один вид деятельности.</p>${choicesHTML('app-order')}<div id="app-order-total" class="app-total" aria-live="polite" aria-atomic="true">${totalHTML(selection())}</div>`;
    if (wizard.step === 1) body = `<h2 class="h2" id="app-order-step-title" tabindex="-1">Как с вами связаться</h2><div class="app-fields">${field('name', 'Ваше имя', 'text', 'given-name')}${field('phone', 'Телефон', 'tel', 'tel')}${field('city', 'Город', 'text', 'address-level2')}${field('email', 'Почта — необязательно', 'email', 'email')}</div><p class="app-hint">Для телефона нужно от 10 до 15 цифр. Пример учебного номера: +7 (000) 000-00-00.</p>`;
    if (wizard.step === 2) body = `<h2 class="h2" id="app-order-step-title" tabindex="-1">КЭП и удобное время</h2>${selectField('kep', 'Как получить КЭП', kepWays)}${selectField('callTime', 'Когда вам удобно поговорить', callTimes)}<p class="app-hint">Время указано для вашего города: ${esc(wizard.city)}. Это выбор для демо; реальный звонок не состоится.</p>`;
    if (wizard.step === 3) body = `<h2 class="h2" id="app-order-step-title" tabindex="-1">Всё верно?</h2>${reviewHTML()}`;
    root.innerHTML = `<ol class="app-steps" aria-label="Шаги заявки">${labels.map((label, index) => `<li${index === wizard.step ? ' aria-current="step"' : ''}${index < wizard.step ? ' class="app-step-done"' : ''}><span class="app-step-number">${index + 1} / 4</span>${label}</li>`).join('')}</ol><form id="app-order-form" class="app-order-form" novalidate>${body}<div class="app-actions">${wizard.step ? '<button type="button" class="btn btn-ghost" data-app-action="back">Назад</button>' : '<a href="#calc" class="btn btn-ghost">К конструктору</a>'}<button type="submit" class="btn btn-primary">${wizard.step === 3 ? 'Отправить демо-заявку' : 'Далее'}</button></div></form>`;
    if (focus) $('#app-order-step-title').focus();
  }

  function setError(name, text) {
    const error = $(`#app-order-${name}-error`);
    if (error) error.textContent = text;
    const input = $(`#app-order-${name}`);
    if (input) input.setAttribute('aria-invalid', text ? 'true' : 'false');
  }

  function validStep() {
    const errors = {};
    if (wizard.step === 0 && !selection().okved.length) errors.okved = 'Выберите хотя бы один код ОКВЭД, чтобы продолжить.';
    if (wizard.step === 1) {
      if ((wizard.name.match(/\p{L}/gu) || []).length < 2) errors.name = 'Введите имя: хотя бы две буквы.';
      const digits = wizard.phone.replace(/\D/g, '');
      if (!/^[+\d\s()–-]+$/.test(wizard.phone) || digits.length < 10 || digits.length > 15) errors.phone = 'Введите телефон: от 10 до 15 цифр, например +7 (000) 000-00-00.';
      if ((wizard.city.match(/\p{L}/gu) || []).length < 2) errors.city = 'Укажите город: хотя бы две буквы.';
      if (wizard.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(wizard.email.trim())) errors.email = 'Проверьте почту. Пример: demo@example.com. Или оставьте поле пустым.';
      ['name', 'phone', 'city', 'email'].forEach(name => setError(name, ''));
    }
    if (wizard.step === 2) {
      if (!Object.hasOwn(kepWays, wizard.kep)) errors.kep = 'Выберите способ получения КЭП.';
      if (!Object.hasOwn(callTimes, wizard.callTime)) errors.callTime = 'Выберите время звонка.';
    }
    if (wizard.step === 3 && !wizard.consent) errors.consent = 'Для демо-отправки нужно ваше согласие.';
    Object.entries(errors).forEach(([name, text]) => setError(name, text));
    if (Object.keys(errors).length) {
      const first = Object.keys(errors)[0];
      (first === 'okved' ? $('#app-order-okved-62-01') : $(`#app-order-${first}`)).focus();
      return false;
    }
    return true;
  }

  function submitOrder(event) {
    event.preventDefault();
    if (!validStep()) return;
    if (wizard.step < 3) {
      wizard.step += 1;
      renderOrder(true);
      return;
    }
    serial += 1;
    const now = new Date().toISOString();
    const number = `БК-2026-${String((Date.now() % 9000 + serial) % 10000).padStart(4, '0')}`;
    BK.state.order = {
      number, date: now, step: 0,
      data: { name: wizard.name.trim(), phone: wizard.phone.trim(), city: wizard.city.trim(), email: wizard.email.trim(), kep: wizard.kep, callTime: wizard.callTime, consent: true, selection: selection() },
      events: [{ date: now, text: stages[0] }], payments: [], messages: []
    };
    completed = true;
    wizard.step = 0;
    wizard.consent = false;
    activeTab = 'status';
    renderOrder(true);
  }

  function dateLabel(date) {
    return new Date(date).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function currentOrder() {
    if (BK.state.order) return BK.state.order;
    if (!sampleOrder) {
      const date = new Date().toISOString();
      sampleOrder = { number: 'БК-2026-0000', date, step: 0, data: { name: 'Пример Предпринимателя', selection: { ...defaults, extras: [], okved: ['62.01'] } }, events: [{ date, text: stages[0] }], payments: [], messages: [] };
    }
    return sampleOrder;
  }

  function prepareOrder(order) {
    order.step = Number.isInteger(order.step) ? Math.max(0, Math.min(5, order.step)) : 0;
    if (!Array.isArray(order.events)) order.events = [{ date: order.date, text: stages[0] }];
    if (!Array.isArray(order.payments)) order.payments = [];
    if (!Array.isArray(order.messages)) order.messages = [];
    if (!order.data) order.data = { name: 'Демо-заявитель', selection: selection() };
    if (!order.data.selection) order.data.selection = selection();
    return order;
  }

  function trackerHTML(order) {
    return `<ol class="app-tracker" aria-label="Путь заявки">${stages.map((name, index) => `<li${index <= order.step ? ' class="app-track-done"' : ''}${index === order.step ? ' aria-current="step"' : ''}><strong>${name}</strong><small>${index < order.step ? 'Готово · демо' : index === order.step ? 'Текущий статус · демо' : 'Впереди'}</small></li>`).join('')}</ol>`;
  }

  function accountHTML(order) {
    return `<article class="sheet app-sheet"><div class="app-sheet-head"><strong class="app-sheet-title">РЕКВИЗИТЫ СЧЁТА</strong><span class="app-sample">ОБРАЗЕЦ</span></div><dl class="app-review"><dt>Получатель</dt><dd>${esc(order.data.name)}</dd><dt>Банк</dt><dd>банк-партнёр бюро (вымышленный)</dd><dt>Номер счёта</dt><dd class="mono">ОБРАЗЕЦ · ДЕМО-СЧЁТ-0000</dd><dt>Тариф</dt><dd>${esc(price('rko', order.data.selection.rko).name)}</dd></dl><p class="app-hint">Номер явно фиктивный. Для переводов не подходит.</p></article>`;
  }

  function statusHTML(order) {
    return `<div class="app-status-grid"><div>${trackerHTML(order)}<button class="btn btn-primary" type="button" data-app-action="advance"${order.step === 5 ? ' disabled' : ''}>${order.step === 5 ? 'Все шаги пройдены' : 'Следующий шаг (демо)'}</button><p class="app-hint" role="status">${order.step === 5 ? 'Демо завершено. Можно открыть документы, попробовать платёж или написать бюро.' : 'Каждое нажатие сразу меняет статус. Реальных действий нет.'}</p></div><div><h2 class="h3">Лента событий</h2><ul class="app-events" aria-live="polite">${[...order.events].reverse().map(item => `<li><time datetime="${esc(item.date)}">${esc(dateLabel(item.date))}</time>${esc(item.text)}</li>`).join('')}</ul></div></div>${order.step >= 4 ? `<div class="app-note">${sheetHTML(order.data.selection, { person: order.data.name, registry: true, stamp: 'ЗАРЕГИСТРИРОВАНО', animate: order.step === 4 })}</div>` : ''}${order.step === 5 ? accountHTML(order) : ''}`;
  }

  function documentsHTML(order) {
    return `<h2 class="h3">Документы заявки</h2><p class="muted">Готовые образцы открываются здесь, без скачивания.</p><ul class="app-doc-list">${documents.map(doc => `<li><div><strong>${doc.name}</strong><small>${order.step >= doc.step ? 'Готов · учебный образец' : `Появится на этапе «${stages[doc.step]}»`}</small></div><button type="button" class="btn btn-ghost" data-app-document="${doc.id}"${order.step < doc.step ? ' disabled' : ''}>Открыть<span class="app-hint"> · ${doc.id === 'registry' ? 'лист' : doc.id === 'account' ? 'счёт' : 'образец'}</span></button></li>`).join('')}</ul>`;
  }

  function accountTabHTML(order) {
    return `<h2 class="h3">Учебный счёт</h2><p class="muted">Баланс образца</p><p class="app-balance">0 ₽</p>${order.step < 5 ? '<p class="app-note">Счёт пока не открыт. Пройдите шаги во вкладке «Статус». После последнего шага появятся образец реквизитов и форма демо-платежа.</p>' : `${accountHTML(order)}<h3 class="h3">Попробовать платёж</h3><p class="muted">Платёж только добавляет запись в историю. Баланс остаётся нулевым. Реальные реквизиты не нужны.</p><form id="app-payment-form" novalidate><div class="app-fields"><div class="field app-field"><label for="app-payment-amount">Сумма, ₽</label><input type="number" inputmode="decimal" min="0.01" step="0.01" max="1000000" id="app-payment-amount" name="amount" required aria-describedby="app-payment-amount-error"><span class="app-error" id="app-payment-amount-error" role="status"></span></div><div class="field app-field"><label for="app-payment-purpose">Назначение учебного платежа</label><input id="app-payment-purpose" name="purpose" maxlength="180" required placeholder="Например, тестовая покупка бумаги" aria-describedby="app-payment-purpose-error"><span class="app-error" id="app-payment-purpose-error" role="status"></span></div></div><button type="submit" class="btn btn-primary">Добавить демо-платёж</button></form>`}<h3 class="h3">История операций</h3><ul class="app-events" aria-live="polite">${order.payments.length ? [...order.payments].reverse().map(item => `<li><time datetime="${esc(item.date)}">${esc(dateLabel(item.date))}</time><strong>${esc(BK.rub(item.amount))}</strong> · ${esc(item.purpose)}<small class="app-hint"> · ДЕМО, деньги не списаны</small></li>`).join('') : '<li>Операций пока нет.</li>'}</ul>`;
  }

  function messagesHTML(order) {
    return `<h2 class="h3">Переписка с бюро</h2><p class="muted">Демонстрация переписки. Ответ приходит автоматически.</p><div class="app-messages" role="log" aria-label="Сообщения">${order.messages.length ? order.messages.map(item => `<article class="app-message" data-author="${item.author}"><strong>${item.author === 'you' ? 'Вы' : 'Бюро · автоответ'}</strong><p>${esc(item.text)}</p><time datetime="${esc(item.date)}">${esc(dateLabel(item.date))}</time></article>`).join('') : '<p>Напишите вопрос, чтобы попробовать переписку.</p>'}</div><form id="app-message-form" novalidate><div class="field app-field"><label for="app-message-text">Ваше сообщение</label><textarea id="app-message-text" name="message" maxlength="1000" required aria-describedby="app-message-error"></textarea><span class="app-error" id="app-message-error" role="status"></span></div><button class="btn btn-primary" type="submit">Отправить в демо</button></form><p id="app-message-notice" class="app-hint" role="status"></p>`;
  }

  function renderCabinet() {
    const order = prepareOrder(currentOrder());
    const example = !BK.state.order;
    const root = $('#app-cabinet-root');
    const intro = `<div class="app-section-head"><div><span class="${example ? 'app-sample' : 'pill'}">${example ? 'ПРИМЕР' : 'ДЕМО-ЗАЯВКА'}</span><p class="mono">${esc(order.number)} · ${esc(dateLabel(order.date))}</p></div>${example ? `<div class="app-actions"><a class="btn btn-primary" href="#order" data-app-action="own-order">Оформить свою</a><button type="button" class="btn btn-ghost" data-app-action="sample">${sampleExpanded ? 'Скрыть пример' : 'Показать пример'}</button></div>` : '<a href="#order" class="btn btn-ghost" data-app-action="own-order">Новая заявка</a>'}</div>`;
    if (example && !sampleExpanded) {
      root.innerHTML = `${intro}<p class="app-note">У вас пока нет заявки. Ниже — пример пути предпринимателя. Нажмите «Показать пример», чтобы двигать статусы и попробовать кабинет.</p>${trackerHTML(order)}`;
      return;
    }
    const tabs = { status: 'Статус', documents: 'Документы', account: 'Счёт', messages: 'Сообщения' };
    const renderers = { status: statusHTML, documents: documentsHTML, account: accountTabHTML, messages: messagesHTML };
    root.innerHTML = `${intro}<div class="app-tabs" role="tablist" aria-label="Разделы кабинета">${Object.entries(tabs).map(([id, name]) => `<button type="button" role="tab" class="app-tab" id="app-tab-${id}" data-app-tab="${id}" aria-controls="app-cabinet-panel" aria-selected="${activeTab === id}" tabindex="${activeTab === id ? '0' : '-1'}">${name}</button>`).join('')}</div><div class="app-panel" id="app-cabinet-panel" role="tabpanel" aria-labelledby="app-tab-${activeTab}" tabindex="0">${renderers[activeTab](order)}</div>`;
  }

  function openDocument(id, button) {
    const order = prepareOrder(currentOrder());
    const doc = documents.find(item => item.id === id);
    if (!doc || order.step < doc.step) return;
    modalReturn = button;
    $('#app-document-title').textContent = doc.name;
    const content = id === 'account' ? accountHTML(order) : sheetHTML(order.data.selection, { person: order.data.name, registry: id === 'registry', stamp: id === 'registry' ? 'ЗАРЕГИСТРИРОВАНО' : 'УЧЕБНЫЙ ОБРАЗЕЦ' });
    $('#app-document-content').innerHTML = `<p class="app-note">ОБРАЗЕЦ · ${esc(doc.name)}. Здесь показан состав выбранного пакета. Это не официальная форма.</p>${content}`;
    $('#app-document-modal').hidden = false;
    document.body.classList.add('app-modal-open');
    $('#app-document-close').focus();
  }

  function closeDocument(restore = true) {
    $('#app-document-modal').hidden = true;
    document.body.classList.remove('app-modal-open');
    if (restore && modalReturn && modalReturn.isConnected) modalReturn.focus();
    modalReturn = null;
  }

  function advance() {
    const order = prepareOrder(currentOrder());
    if (order.step >= 5) return;
    order.step += 1;
    order.events.push({ date: new Date().toISOString(), text: stages[order.step] });
    renderCabinet();
    const button = $('[data-app-action="advance"]', $('#app-cabinet-root'));
    if (!button.disabled) button.focus(); else $('#app-cabinet-panel').focus();
    BK.toast(`${stages[order.step]} · демонстрация`);
  }

  function payment(event) {
    event.preventDefault();
    const order = prepareOrder(currentOrder());
    if (order.step < 5) return;
    const amountInput = $('#app-payment-amount');
    const purposeInput = $('#app-payment-purpose');
    const raw = amountInput.value.trim().replace(',', '.');
    const amount = Number(raw);
    const amountError = !/^\d+(?:[.,]\d{1,2})?$/.test(raw) || !Number.isFinite(amount) || amount <= 0 || amount > 1000000 ? 'Введите сумму от 0,01 до 1 000 000 ₽, не больше двух знаков после запятой.' : '';
    const purpose = purposeInput.value.trim();
    const purposeError = purpose.length < 3 ? 'Напишите назначение: хотя бы три символа.' : '';
    $('#app-payment-amount-error').textContent = amountError;
    $('#app-payment-purpose-error').textContent = purposeError;
    amountInput.setAttribute('aria-invalid', String(Boolean(amountError)));
    purposeInput.setAttribute('aria-invalid', String(Boolean(purposeError)));
    if (amountError || purposeError) { (amountError ? amountInput : purposeInput).focus(); return; }
    order.payments.push({ date: new Date().toISOString(), amount, purpose });
    renderCabinet();
    $('#app-payment-amount').focus();
    BK.toast('Демо-платёж добавлен в историю. Деньги не списаны.');
  }

  function sendMessage(event) {
    event.preventDefault();
    const input = $('#app-message-text');
    const text = input.value.trim();
    if (!text || text.length > 1000) {
      $('#app-message-error').textContent = 'Напишите сообщение от 1 до 1000 символов.';
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    const order = prepareOrder(currentOrder());
    const date = new Date().toISOString();
    order.messages.push({ author: 'you', text, date }, { author: 'bureau', text: 'Бюро получило ваше сообщение в демо. Документы и статусы можно посмотреть в соседних вкладках. Это автоматический ответ; сообщение никуда не отправлялось.', date });
    renderCabinet();
    const log = $('.app-messages', $('#app-cabinet-root'));
    log.scrollTop = log.scrollHeight;
    $('#app-message-text').focus();
    $('#app-message-notice').textContent = 'Сообщение добавлено. Бюро прислало автоматический ответ.';
  }

  function resetSelection() {
    Object.assign(BK.state, { ...defaults, extras: [], okved: [] });
  }

  $('#app-calc-form').addEventListener('submit', event => event.preventDefault());
  $('#app-calc-reset').addEventListener('click', () => {
    resetSelection();
    renderCalc();
    BK.toast('Выбор возвращён к значениям по умолчанию.');
  });
  $('#app-demo-reset').addEventListener('click', () => {
    closeDocument(false);
    resetSelection();
    BK.state.order = null;
    sampleOrder = null;
    sampleExpanded = false;
    activeTab = 'status';
    wizard = freshWizard();
    completed = false;
    renderCabinet();
    BK.toast('Демо сброшено. Заявка, контакты и история удалены из памяти.');
  });
  $('#app-document-close').addEventListener('click', () => closeDocument());
  $('#app-document-modal').addEventListener('click', event => { if (event.target === event.currentTarget) closeDocument(); });

  const appViews = $$('[data-view="calc"], [data-view="order"], [data-view="cabinet"]');
  appViews.forEach(view => {
    view.addEventListener('input', event => {
      const input = event.target;
      if (!input.dataset.appDraft) return;
      wizard[input.dataset.appDraft] = input.type === 'checkbox' ? input.checked : input.value;
      setError(input.dataset.appDraft, '');
    });
    view.addEventListener('change', event => {
      const input = event.target;
      if (input.dataset.appChoice) updateChoice(input);
      if (input.dataset.appDraft) {
        wizard[input.dataset.appDraft] = input.type === 'checkbox' ? input.checked : input.value;
        setError(input.dataset.appDraft, '');
      }
    });
    view.addEventListener('submit', event => {
      if (event.target.id === 'app-order-form') submitOrder(event);
      if (event.target.id === 'app-payment-form') payment(event);
      if (event.target.id === 'app-message-form') sendMessage(event);
    });
    view.addEventListener('click', event => {
      const button = event.target.closest('[data-app-action], [data-app-tab], [data-app-document]');
      if (!button || button.disabled) return;
      if (button.dataset.appTab) {
        activeTab = button.dataset.appTab;
        renderCabinet();
        $(`#app-tab-${activeTab}`).focus();
      } else if (button.dataset.appDocument) openDocument(button.dataset.appDocument, button);
      else {
        const action = button.dataset.appAction;
        if (action === 'back') { wizard.step = Math.max(0, wizard.step - 1); renderOrder(true); }
        if (action === 'new-order' || action === 'own-order') { completed = false; wizard.step = 0; renderOrder(action === 'new-order'); }
        if (action === 'sample') { sampleExpanded = !sampleExpanded; renderCabinet(); $('[data-app-action="sample"]', $('#app-cabinet-root')).focus(); }
        if (action === 'advance') advance();
      }
    });
  });

  document.addEventListener('keydown', event => {
    const modal = $('#app-document-modal');
    if (!modal.hidden) {
      if (event.key === 'Escape') { event.preventDefault(); closeDocument(); }
      if (event.key === 'Tab') {
        const focusable = $$('button:not([disabled]), a[href], input, select, textarea, [tabindex="0"]', modal);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      return;
    }
    const tab = event.target instanceof Element ? event.target.closest('[data-app-tab]') : null;
    if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const ids = ['status', 'documents', 'account', 'messages'];
    const index = ids.indexOf(activeTab);
    activeTab = ids[event.key === 'Home' ? 0 : event.key === 'End' ? 3 : (index + (event.key === 'ArrowRight' ? 1 : 3)) % 4];
    renderCabinet();
    $(`#app-tab-${activeTab}`).focus();
  });

  normalize();
  BK.onView(view => {
    document.body.classList.toggle('app-calc-active', view === 'calc');
    if (view !== 'order') completed = false;
    if (view !== 'cabinet') closeDocument(false);
    if (view === 'calc') renderCalc();
    if (view === 'order') {
      if (!selection().okved.length) wizard.step = 0;
      renderOrder();
    }
    if (view === 'cabinet') renderCabinet();
  });
  // Also cover a router which displayed its initial hash before subscriptions.
  const initialView = location.hash.slice(1);
  if (initialView === 'calc') renderCalc();
  if (initialView === 'order') renderOrder();
  if (initialView === 'cabinet') renderCabinet();
}());
