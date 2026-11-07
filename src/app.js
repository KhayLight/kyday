(function () {
  'use strict';

  const Kyday = window.Kyday;
  if (!Kyday) return;
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
  const kepWays = { office: 'В центре выдачи', visit: 'С выездом специалиста', help: 'Нужна помощь с выбором' };
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
  let lookupOrder = null;
  let lookupMode = false;
  let nextStatusAt = Date.now() + 15000;
  let modalReturn = null;
  let serial = 0;

  try {
    const saved = JSON.parse(sessionStorage.getItem('kyday-order'));
    if (saved && /^KD-2026-\d{4}$/.test(saved.number) && saved.data?.selection && !Number.isNaN(Date.parse(saved.date))) Kyday.state.order = saved;
  } catch { /* Отслеживание доступно и без хранилища. */ }

  function saveOrder() {
    try { if (Kyday.state.order) sessionStorage.setItem('kyday-order', JSON.stringify(Kyday.state.order)); } catch { /* Необязательное сохранение в текущей вкладке. */ }
  }

  function freshWizard() {
    return { step: 0, name: '', phone: '', city: '', kep: 'help', callTime: 'any', consent: false };
  }

  // The brief fixes the keys and amounts, but leaves the PRICES item shape open.
  function price(group, id) {
    const fallback = catalog[group][id];
    const source = Kyday.PRICES && Kyday.PRICES[group] && Kyday.PRICES[group][id];
    const raw = typeof source === 'number' ? source : source && (source.price ?? source.amount ?? source.monthly ?? source.cost);
    return { name: (source && (source.name || source.title)) || fallback[0], amount: Number.isFinite(Number(raw)) && raw != null ? Number(raw) : fallback[1], hint: fallback[2] || '' };
  }

  function normalize() {
    const state = Kyday.state;
    if (!Object.hasOwn(catalog.reg, state.reg)) state.reg = defaults.reg;
    if (!Object.hasOwn(catalog.rko, state.rko)) state.rko = defaults.rko;
    if (!Object.hasOwn(taxes, state.tax)) state.tax = defaults.tax;
    state.extras = [...new Set((Array.isArray(state.extras) ? state.extras : []).filter(id => Object.hasOwn(catalog.extras, id)))];
    state.okved = [...new Set((Array.isArray(state.okved) ? state.okved : []).filter(code => activities.some(item => item[0] === code)))];
  }

  function selection() {
    normalize();
    return { reg: Kyday.state.reg, rko: Kyday.state.rko, tax: Kyday.state.tax, extras: [...Kyday.state.extras], okved: [...Kyday.state.okved] };
  }

  function totals(config) {
    return config.extras.reduce((sum, id) => {
      sum[id === 'acc' ? 'monthly' : 'once'] += price('extras', id).amount;
      return sum;
    }, { once: price('reg', config.reg).amount, monthly: price('rko', config.rko).amount });
  }

  function totalHTML(config) {
    const sum = totals(config);
    return `<div><small>Разово</small><strong>${esc(Kyday.rub(sum.once))}</strong></div><div><small>В месяц</small><strong>${esc(Kyday.rub(sum.monthly))}</strong></div>`;
  }

  function sheetHTML(config, options = {}) {
    const rows = [
      ['01', 'Форма', 'Индивидуальный предприниматель'],
      ['02', 'Регистрация', price('reg', config.reg).name],
      ['03', 'Налоговый режим', taxes[config.tax][0]],
      ['04', 'ОКВЭД', config.okved.length ? config.okved.join(' · ') : 'Выберите виды деятельности'],
      ['05', 'Счёт', `${price('rko', config.rko).name} · Банк Ардена Вектор`],
      ['06', 'Дополнительно', config.extras.length ? config.extras.map(id => price('extras', id).name).join(', ') : 'Без дополнительных услуг']
    ];
    if (options.person) rows.unshift(['00', 'Заявитель', options.person]);
    return `<article class="sheet app-sheet"><div class="app-sheet-head"><div><p class="app-sheet-title">${options.registry ? 'ЛИСТ ЗАПИСИ ЕГРИП' : 'ВАШ ПЛАН СТАРТА'}</p><p class="app-hint">${options.registry ? 'ЕГРИП · образец документа' : 'Ваш будущий старт · черновик'}</p></div>${options.registry || options.document ? '<span class="app-sample">ОБРАЗЕЦ</span>' : ''}</div>${rows.map(row => `<div class="sheet-row app-sheet-row"><span>${row[0]}</span><span>${row[1]}</span><strong>${esc(row[2])}</strong></div>`).join('')}${options.registry ? '<p class="app-hint">Реквизиты записи заполняются после регистрации.</p>' : ''}${options.stamp ? `<div class="app-stamp-space"><span class="stamp app-stamp${options.animate ? ' app-stamp-drop' : ''}">${esc(options.stamp)}${options.registry || options.document ? '<small>ОБРАЗЕЦ</small>' : ''}</span></div>` : ''}<p class="app-sheet-note">Выбор налогового режима и состав документов уточняем под вашу деятельность.</p></article>`;
  }

  function choicesHTML(prefix) {
    const state = selection();
    const plans = (group, title) => `<fieldset class="app-group"><legend>${title}</legend><div class="app-choices">${Object.keys(catalog[group]).map(id => {
      const item = price(group, id);
      return `<label class="app-choice" for="${prefix}-${group}-${id}"><input type="radio" id="${prefix}-${group}-${id}" name="${group}" value="${id}" data-app-choice="${group}"${state[group] === id ? ' checked' : ''}><span><strong>${esc(item.name)}</strong><small>${esc(item.hint)}</small></span><span class="app-price">${esc(Kyday.rub(item.amount))}${group === 'rko' ? '/мес' : ''}</span></label>`;
    }).join('')}</div></fieldset>`;
    return plans('reg', 'Тариф регистрации') + `<fieldset class="app-group"><legend>Налоговый режим</legend><div class="field app-field"><label for="${prefix}-tax">Как считать налог</label><select id="${prefix}-tax" name="tax" data-app-choice="tax" aria-describedby="${prefix}-tax-hint">${Object.entries(taxes).map(([id, item]) => `<option value="${id}"${state.tax === id ? ' selected' : ''}>${item[0]}</option>`).join('')}</select><p id="${prefix}-tax-hint" class="app-hint" data-app-tax-hint>${esc(taxes[state.tax][1])}</p></div><p class="app-hint">Менеджер уточнит совместимость режима и ОКВЭД перед подготовкой документов.</p></fieldset><fieldset class="app-group"><legend>Чем займётесь</legend><p class="app-hint">Отметьте один или несколько кодов ОКВЭД.</p><div class="app-okved">${activities.map(([code, name]) => `<label class="check app-check" for="${prefix}-okved-${code.replace('.', '-')}"><input type="checkbox" id="${prefix}-okved-${code.replace('.', '-')}" name="okved" value="${code}" data-app-choice="okved"${state.okved.includes(code) ? ' checked' : ''}><span><code>${code}</code> ${name}</span></label>`).join('')}</div><span class="app-error" id="${prefix}-okved-error" role="status"></span></fieldset>` + plans('rko', 'Тариф РКО') + `<fieldset class="app-group"><legend>Дополнительные услуги</legend><div class="app-choices">${Object.keys(catalog.extras).map(id => {
      const item = price('extras', id);
      return `<label class="app-choice" for="${prefix}-extras-${id}"><input type="checkbox" id="${prefix}-extras-${id}" name="extras" value="${id}" data-app-choice="extras"${state.extras.includes(id) ? ' checked' : ''}><span>${esc(item.name)}</span><span class="app-price">${esc(Kyday.rub(item.amount))}${id === 'acc' ? '/мес' : ''}</span></label>`;
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
      const values = new Set(Kyday.state[key]);
      if (input.checked) values.add(input.value); else values.delete(input.value);
      Kyday.state[key] = [...values];
    } else Kyday.state[key] = input.value;
    normalize();
    const form = input.closest('form');
    const hint = $('[data-app-tax-hint]', form);
    if (hint) hint.textContent = taxes[Kyday.state.tax][1];
    if (form.id === 'app-calc-form') updateCalc();
    else {
      const total = $('#app-order-total');
      if (total) total.innerHTML = totalHTML(selection());
      const error = $('#app-order-okved-error');
      if (error && Kyday.state.okved.length) error.textContent = '';
    }
  }

  function field(name, label, type = 'text', autocomplete = '') {
    return `<div class="field app-field"><label for="app-order-${name}">${label}</label><input id="app-order-${name}" name="${name}" type="${type}" value="${esc(wizard[name])}" data-app-draft="${name}"${autocomplete ? ` autocomplete="${autocomplete}"` : ''} required${name === 'phone' ? ' inputmode="tel" maxlength="30"' : ' maxlength="120"'} aria-describedby="app-order-${name}-error"><span class="app-error" id="app-order-${name}-error" role="status"></span></div>`;
  }

  function selectField(name, label, values) {
    return `<div class="field app-field"><label for="app-order-${name}">${label}</label><select id="app-order-${name}" name="${name}" data-app-draft="${name}" aria-describedby="app-order-${name}-error">${Object.entries(values).map(([id, title]) => `<option value="${id}"${wizard[name] === id ? ' selected' : ''}>${title}</option>`).join('')}</select><span class="app-error" id="app-order-${name}-error" role="status"></span></div>`;
  }

  function reviewHTML() {
    const config = selection();
    const rows = [
      ['Имя', wizard.name], ['Телефон', wizard.phone], ['Город', wizard.city],
      ['КЭП', kepWays[wizard.kep]], ['Звонок', `${callTimes[wizard.callTime]} · местное время города заявителя`]
    ];
    return `<div class="grid-2"><div>${sheetHTML(config)}</div><div><h2 class="h3">Проверьте контакты</h2><dl class="app-review">${rows.map(([key, value]) => `<dt>${key}</dt><dd>${esc(value)}</dd>`).join('')}</dl><div class="app-total">${totalHTML(config)}</div></div></div><label class="check app-check" for="app-order-consent"><input type="checkbox" id="app-order-consent" name="consent" data-app-draft="consent"${wizard.consent ? ' checked' : ''} aria-describedby="app-order-consent-error"><span>Согласен на обработку контактных данных для связи по заявке.</span></label><span class="app-error" id="app-order-consent-error" role="status"></span>`;
  }

  function renderOrder(focus = false) {
    const root = $('#app-order-root');
    if (completed && Kyday.state.order) {
      const order = Kyday.state.order;
      root.innerHTML = `<div class="app-success" role="status"><h2 class="h2" tabindex="-1" id="app-order-success">Заявка принята</h2><p><strong class="mono">${esc(order.number)}</strong> · ${esc(dateLabel(order.date))}</p>${sheetHTML(order.data.selection, { person: order.data.name, stamp: 'ЗАЯВКА ПРИНЯТА', animate: true })}<p class="app-note">Заявка отправлена. Менеджер позвонит в течение 15 минут в рабочее время. Отслеживайте этапы в разделе «Мои заявки».</p><div class="app-actions"><a href="#cabinet" class="btn btn-primary">Мои заявки</a><button type="button" class="btn btn-ghost" data-app-action="new-order">Новая заявка</button></div></div>`;
      if (focus) $('#app-order-success').focus();
      return;
    }
    const labels = ['Выбор', 'Контакты', 'КЭП и звонок', 'Проверка'];
    let body = '';
    if (wizard.step === 0) body = `<h2 class="h2" id="app-order-step-title" tabindex="-1">Проверьте ваш выбор</h2><p class="muted">Тарифы можно изменить здесь. Для продолжения отметьте хотя бы один вид деятельности.</p>${choicesHTML('app-order')}<div id="app-order-total" class="app-total" aria-live="polite" aria-atomic="true">${totalHTML(selection())}</div>`;
    if (wizard.step === 1) body = `<h2 class="h2" id="app-order-step-title" tabindex="-1">Как с вами связаться</h2><div class="app-fields">${field('name', 'Ваше имя', 'text', 'given-name')}${field('phone', 'Телефон', 'tel', 'tel')}${field('city', 'Город', 'text', 'address-level2')}</div><p class="app-hint">Укажите телефон от 10 до 15 цифр, по которому менеджер сможет с вами связаться.</p>`;
    if (wizard.step === 2) body = `<h2 class="h2" id="app-order-step-title" tabindex="-1">КЭП и удобное время</h2>${selectField('kep', 'Как получить КЭП', kepWays)}${selectField('callTime', 'Когда вам удобно поговорить', callTimes)}<p class="app-hint">Время указано для вашего города: ${esc(wizard.city)}. Учтём выбранный интервал при звонке менеджера.</p>`;
    if (wizard.step === 3) body = `<h2 class="h2" id="app-order-step-title" tabindex="-1">Всё верно?</h2>${reviewHTML()}`;
    root.innerHTML = `<ol class="app-steps" aria-label="Шаги заявки">${labels.map((label, index) => `<li${index === wizard.step ? ' aria-current="step"' : ''}${index < wizard.step ? ' class="app-step-done"' : ''}><span class="app-step-number">${index + 1} / 4</span>${label}</li>`).join('')}</ol><form id="app-order-form" class="app-order-form" novalidate>${body}<div class="app-actions">${wizard.step ? '<button type="button" class="btn btn-ghost" data-app-action="back">Назад</button>' : '<a href="#calc" class="btn btn-ghost">К конструктору</a>'}<button type="submit" class="btn btn-primary">${wizard.step === 3 ? 'Отправить заявку' : 'Далее'}</button></div></form>`;
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
      if (!/^[+\d\s()–-]+$/.test(wizard.phone) || digits.length < 10 || digits.length > 15) errors.phone = 'Введите телефон: от 10 до 15 цифр, например +7 995 845-52-18.';
      if ((wizard.city.match(/\p{L}/gu) || []).length < 2) errors.city = 'Укажите город: хотя бы две буквы.';
      ['name', 'phone', 'city'].forEach(name => setError(name, ''));
    }
    if (wizard.step === 2) {
      if (!Object.hasOwn(kepWays, wizard.kep)) errors.kep = 'Выберите способ получения КЭП.';
      if (!Object.hasOwn(callTimes, wizard.callTime)) errors.callTime = 'Выберите время звонка.';
    }
    if (wizard.step === 3 && !wizard.consent) errors.consent = 'Подтвердите согласие на обработку контактных данных.';
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
    const number = `KD-2026-${String((Date.now() % 9000 + serial) % 10000).padStart(4, '0')}`;
    Kyday.state.order = {
      number, date: now, step: 0,
      data: { name: wizard.name.trim(), phone: wizard.phone.trim(), city: wizard.city.trim(), kep: wizard.kep, callTime: wizard.callTime, consent: true, selection: selection() },
      events: [{ date: now, text: stages[0] }], payments: [], messages: []
    };
    lookupOrder = null;
    lookupMode = false;
    nextStatusAt = Date.now() + 15000;
    saveOrder();
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
    return lookupMode ? null : lookupOrder || Kyday.state.order;
  }

  function prepareOrder(order) {
    order.step = Number.isInteger(order.step) ? Math.max(0, Math.min(5, order.step)) : 0;
    if (!Array.isArray(order.events)) order.events = [{ date: order.date, text: stages[0] }];
    if (!Array.isArray(order.payments)) order.payments = [];
    if (!Array.isArray(order.messages)) order.messages = [];
    if (!order.data) order.data = { name: 'Заявитель', selection: selection() };
    if (!order.data.selection) order.data.selection = selection();
    return order;
  }

  function trackerHTML(order) {
    return `<ol class="app-tracker" aria-label="Путь заявки">${stages.map((name, index) => `<li${index <= order.step ? ' class="app-track-done"' : ''}${index === order.step ? ' aria-current="step"' : ''}><strong>${name}</strong><small>${index < order.step ? 'Готово' : index === order.step ? 'Текущий статус' : 'Впереди'}</small></li>`).join('')}</ol>`;
  }

  function accountHTML(order) {
    return `<article class="sheet app-sheet"><div class="app-sheet-head"><strong class="app-sheet-title">РЕКВИЗИТЫ СЧЁТА</strong><span class="app-sample">ОБРАЗЕЦ</span></div><dl class="app-review"><dt>Получатель</dt><dd>${esc(order.data.name)}</dd><dt>Банк</dt><dd>Банк Ардена Вектор</dd><dt>Номер счёта</dt><dd class="mono">40802 ••••• ••••• •••••</dd><dt>Тариф</dt><dd>${esc(price('rko', order.data.selection.rko).name)}</dd></dl><p class="app-hint">Образец структуры реквизитов. Полные реквизиты и доступ к операциям предоставляются банком после оформления договора.</p></article>`;
  }

  function statusHTML(order) {
    return `<div class="app-status-grid"><div>${trackerHTML(order)}<p class="app-hint" role="status">${order.step === 5 ? 'Все этапы пройдены. Документы доступны в соседней вкладке. По вопросам работы со счётом напишите менеджеру.' : 'Статус обновляется автоматически. Оставьте страницу открытой, чтобы видеть изменения.'}</p></div><div><h2 class="h3">Лента событий</h2><ul class="app-events" aria-live="polite">${[...order.events].reverse().map(item => `<li><time datetime="${esc(item.date)}">${esc(dateLabel(item.date))}</time>${esc(item.text)}</li>`).join('')}</ul></div></div>`;
  }

  function documentsHTML(order) {
    return `<h2 class="h3">Документы заявки</h2><p class="muted">Готовые образцы открываются здесь, без скачивания.</p><ul class="app-doc-list">${documents.map(doc => `<li><div><strong>${doc.name}</strong><small>${order.step >= doc.step ? 'Готов к просмотру' : `Появится на этапе «${stages[doc.step]}»`}</small></div><button type="button" class="btn btn-ghost" data-app-document="${doc.id}"${order.step < doc.step ? ' disabled' : ''}>Открыть<span class="app-hint"> · ${doc.id === 'registry' ? 'лист' : doc.id === 'account' ? 'счёт' : 'образец'}</span></button></li>`).join('')}</ul>`;
  }

  function accountTabHTML(order) {
    return `<h2 class="h3">Ваш расчётный счёт</h2><dl class="app-review"><dt>Банк</dt><dd>Банк Ардена Вектор</dd><dt>Тариф</dt><dd>${esc(price('rko', order.data.selection.rko).name)}</dd><dt>Обслуживание</dt><dd>${esc(Kyday.rub(price('rko', order.data.selection.rko).amount))}/мес</dd><dt>Статус</dt><dd>${order.step < 5 ? 'Подготовка к открытию' : 'Счёт открыт'}</dd></dl><p class="app-note">${order.step < 5 ? 'После регистрации ИП банк проверит сведения и подготовит договор. Менеджер сообщит о следующем шаге.' : 'Менеджер поможет получить реквизиты и доступ к обслуживанию в банке. Платежи и выписки доступны в системе банка.'}</p><button class="btn btn-ghost" type="button" data-callback="Вопрос о расчётном счёте">Связаться с менеджером</button>`;
  }

  function messagesHTML(order) {
    return `<h2 class="h3">Переписка с Kyday</h2><p class="muted">Задайте вопрос по заявке. Менеджеры на связи по будням с 09:00 до 18:00 по Москве.</p><div class="app-messages" role="log" aria-label="Сообщения">${order.messages.length ? order.messages.map(item => `<article class="app-message" data-author="${item.author}"><strong>${item.author === 'you' ? 'Вы' : 'Команда Kyday'}</strong><p>${esc(item.text)}</p><time datetime="${esc(item.date)}">${esc(dateLabel(item.date))}</time></article>`).join('') : '<p>Здесь будут сообщения по вашей заявке. Напишите, если нужна помощь.</p>'}</div><form id="app-message-form" novalidate><div class="field app-field"><label for="app-message-text">Ваше сообщение</label><textarea id="app-message-text" name="message" maxlength="1000" required aria-describedby="app-message-error"></textarea><span class="app-error" id="app-message-error" role="status"></span></div><button class="btn btn-primary" type="submit">Отправить сообщение</button></form><p id="app-message-notice" class="app-hint" role="status"></p>`;
  }

  function renderCabinet() {
    const root = $('#app-cabinet-root');
    if (!currentOrder()) {
      root.innerHTML = `<form id="app-lookup-form" class="app-lookup" novalidate><div class="field"><label for="app-lookup-number">Номер заявки</label><input id="app-lookup-number" name="number" class="mono" placeholder="KD-2026-XXXX" autocomplete="off" spellcheck="false" maxlength="24" required aria-describedby="app-lookup-hint app-lookup-error"><p class="app-hint" id="app-lookup-hint">Введите номер в формате KD-2026-XXXX: четыре цифры в конце.</p><span class="app-error" id="app-lookup-error" role="alert"></span></div><div class="app-actions"><button type="submit" class="btn btn-primary">Найти</button><a href="#order" class="btn btn-ghost" data-app-action="own-order">Оформить заявку</a></div></form>`;
      return;
    }
    const order = prepareOrder(currentOrder());
    const intro = `<div class="app-section-head"><div><span class="pill" data-order-status>${esc(stages[order.step])}</span><p class="mono">${esc(order.number)} · ${esc(dateLabel(order.date))}</p></div><div class="app-actions"><button type="button" class="btn btn-ghost" data-app-action="lookup">Найти другую заявку</button><a href="#order" class="btn btn-ghost" data-app-action="own-order">Новая заявка</a></div></div>`;
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
    const details = {
      application: [['Форма', 'Р21001 · заявление о регистрации ИП'], ['Заявитель', order.data.name], ['Виды деятельности', order.data.selection.okved.join(' · ')]],
      tax: [['Режим', taxes[order.data.selection.tax][0]], ['Деятельность', order.data.selection.okved.join(' · ')], ['Подготовка', 'Условия применения уточняются для региона и вида деятельности']],
      signature: [['Электронная подпись', 'Квалифицированная'], ['Получение', kepWays[order.data.kep] || 'Способ согласуется с менеджером'], ['Назначение', 'Подписание и электронная подача документов']],
      receipt: [['Заявка', order.number], ['Комплект', 'Документы для регистрации ИП'], ['Способ подачи', 'Электронный'], ['Следующий этап', 'Решение о регистрации и лист записи ЕГРИП']]
    };
    const content = id === 'account' ? accountHTML(order) : id === 'registry' ? sheetHTML(order.data.selection, { person: order.data.name, registry: true, stamp: 'ЗАРЕГИСТРИРОВАНО' }) : `<article class="sheet app-sheet"><div class="app-sheet-head"><strong class="app-sheet-title">${esc(doc.name)}</strong><span class="app-sample">ОБРАЗЕЦ</span></div><dl class="app-review">${details[id].map(([key, value]) => `<dt>${esc(key)}</dt><dd>${esc(value)}</dd>`).join('')}</dl><p class="app-hint">Состав документа для ознакомления. Итоговую версию подготовит менеджер по вашей заявке.</p></article>`;
    $('#app-document-content').innerHTML = content;
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

  function findOrder(event) {
    event.preventDefault();
    const input = $('#app-lookup-number');
    const number = input.value.trim().toUpperCase();
    if (!/^KD-2026-\d{4}$/.test(number)) {
      input.setAttribute('aria-invalid', 'true');
      $('#app-lookup-error').textContent = 'Проверьте номер: KD-2026- и ровно четыре цифры, без пробелов внутри.';
      input.focus();
      return;
    }
    lookupMode = false;
    if (Kyday.state.order?.number === number) lookupOrder = Kyday.state.order;
    else {
      const date = new Date().toISOString();
      const step = Number(number.slice(-4)) % stages.length;
      lookupOrder = { number, date, step, data: { name: 'Заявитель', selection: { ...defaults, extras: [], okved: ['62.01'] } }, events: [{ date, text: stages[step] }], messages: [] };
    }
    nextStatusAt = Date.now() + 15000;
    activeTab = 'status';
    renderCabinet();
    $('#app-cabinet-panel').focus();
  }

  setInterval(() => {
    if (document.hidden || Date.now() < nextStatusAt) return;
    nextStatusAt = Date.now() + 15000;
    let changed = false;
    for (const order of new Set([Kyday.state.order, lookupOrder].filter(Boolean))) {
      prepareOrder(order);
      if (order.step >= stages.length - 1) continue;
      order.step += 1;
      order.events.push({ date: new Date().toISOString(), text: stages[order.step] });
      if (order === currentOrder()) changed = true;
    }
    saveOrder();
    if (!changed || $('[data-view="cabinet"]').hidden || !$('#app-document-modal').hidden) return;
    if (activeTab === 'messages') {
      const label = $('[data-order-status]');
      if (label) label.textContent = stages[currentOrder().step];
    } else {
      const tabFocused = document.activeElement?.dataset.appTab;
      renderCabinet();
      if (tabFocused) $(`#app-tab-${tabFocused}`).focus({ preventScroll: true });
    }
  }, 1000);

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
    order.messages.push({ author: 'you', text, date }, { author: 'team', text: 'Сообщение принято. Менеджер ответит в течение 15 минут в рабочее время. Документы и текущий статус доступны в соседних вкладках.', date });
    saveOrder();
    renderCabinet();
    const log = $('.app-messages', $('#app-cabinet-root'));
    log.scrollTop = log.scrollHeight;
    $('#app-message-text').focus();
    $('#app-message-notice').textContent = 'Сообщение отправлено. Ответ появится в этой переписке.';
  }

  function resetSelection() {
    Object.assign(Kyday.state, { ...defaults, extras: [], okved: [] });
  }

  $('#app-calc-form').addEventListener('submit', event => event.preventDefault());
  $('#app-calc-reset').addEventListener('click', () => {
    resetSelection();
    renderCalc();
    Kyday.toast('Выбор возвращён к значениям по умолчанию.');
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
      if (event.target.id === 'app-lookup-form') findOrder(event);
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
        if (action === 'lookup') {
          lookupMode = true;
          lookupOrder = null;
          renderCabinet();
          $('#app-lookup-number').focus();
        }
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
  Kyday.onView(view => {
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
