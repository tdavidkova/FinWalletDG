// =====================================================
// FinWallet DG — Single Page Application
// =====================================================

// ===== STATE =====
const state = {
    currentGroupId: null,
    currentGroup: null,
    groups: [],
    currentView: 'dashboard',
    invoicesCache: [],
};

// ===== API HELPERS =====
async function api(url, opts = {}) {
    const resp = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...opts.headers },
        ...opts,
    });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${resp.status}`);
    }
    return resp.json();
}

const API = {
    // Groups
    getGroups: () => api('/api/groups'),
    createGroup: (d) => api('/api/groups', { method: 'POST', body: JSON.stringify(d) }),
    updateGroup: (id, d) => api(`/api/groups/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    deleteGroup: (id) => api(`/api/groups/${id}`, { method: 'DELETE' }),

    // Students
    getStudents: (gid, status) => api(`/api/groups/${gid}/students${status ? `?status=${status}` : ''}`),
    createStudent: (gid, d) => api(`/api/groups/${gid}/students`, { method: 'POST', body: JSON.stringify(d) }),
    updateStudent: (id, d) => api(`/api/students/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    deleteStudent: (id) => api(`/api/students/${id}`, { method: 'DELETE' }),
    unenrollStudent: (id) => api(`/api/students/${id}/unenroll`, { method: 'POST' }),
    reenrollStudent: (id) => api(`/api/students/${id}/reenroll`, { method: 'POST' }),
    linkSiblings: (gid, ids) => api(`/api/groups/${gid}/link-siblings`, { method: 'POST', body: JSON.stringify({ student_ids: ids }) }),
    unlinkSibling: (id) => api(`/api/students/${id}/unlink-sibling`, { method: 'POST' }),

    // Transactions
    getTransactions: (gid, params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return api(`/api/groups/${gid}/transactions${qs ? '?' + qs : ''}`);
    },
    createDeposit: (gid, d) => api(`/api/groups/${gid}/deposits`, { method: 'POST', body: JSON.stringify(d) }),
    createExpense: (gid, d) => api(`/api/groups/${gid}/expenses`, { method: 'POST', body: JSON.stringify(d) }),

    // Balances
    getBalances: (gid) => api(`/api/groups/${gid}/balances`),

    // Categories
    getCategories: (gid) => api(`/api/groups/${gid}/categories`),
    createCategory: (gid, d) => api(`/api/groups/${gid}/categories`, { method: 'POST', body: JSON.stringify(d) }),
    updateCategory: (id, d) => api(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    deleteCategory: (id) => api(`/api/categories/${id}`, { method: 'DELETE' }),

    // Invoices
    getInvoices: (gid) => api(`/api/groups/${gid}/invoices`),
    createInvoice: (gid, d) => api(`/api/groups/${gid}/invoices`, { method: 'POST', body: JSON.stringify(d) }),
    updateInvoice: (id, d) => api(`/api/invoices/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    deleteInvoice: (id) => api(`/api/invoices/${id}`, { method: 'DELETE' }),

    // Dashboard
    getDashboard: (gid) => api(`/api/groups/${gid}/dashboard`),
};

// ===== UTILS =====
function fmt(n) { return n != null ? Number(n).toFixed(2) : '0.00'; }
function fmtDate(d) { return d ? d.substring(0, 10) : ''; }
function today() { return new Date().toISOString().substring(0, 10); }
function amountClass(n) { return n > 0 ? 'amount-positive' : n < 0 ? 'amount-negative' : ''; }
function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
}

// ===== NAVIGATION =====
const PAGE_TITLES = {
    dashboard: 'Табло',
    students: 'Деца',
    transactions: 'Движения',
    invoices: 'Фактури',
    settings: 'Настройки',
};

function navigate(view) {
    state.currentView = view;
    document.getElementById('page-title').textContent = PAGE_TITLES[view] || view;
    document.querySelectorAll('.nav-links li').forEach(li => {
        li.classList.toggle('active', li.dataset.view === view);
    });
    renderView();
    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');
}

async function renderView() {
    const el = document.getElementById('content');
    if (!state.currentGroupId) {
        el.innerHTML = '<div class="empty-state"><p>Изберете или създайте група, за да започнете.</p></div>';
        return;
    }
    try {
        switch (state.currentView) {
            case 'dashboard': await renderDashboard(el); break;
            case 'students': await renderStudents(el); break;
            case 'transactions': await renderTransactions(el); break;
            case 'invoices': await renderInvoices(el); break;
            case 'settings': await renderSettings(el); break;
        }
    } catch (e) {
        el.innerHTML = `<div class="alert alert-warning">Грешка: ${escHtml(e.message)}</div>`;
    }
}

// ===== MODAL =====
function openModal(title, bodyHtml) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('open');
}

// ===== DASHBOARD VIEW =====
async function renderDashboard(el) {
    const d = await API.getDashboard(state.currentGroupId);
    el.innerHTML = `
        <div class="cards">
            <div class="card card-stat">
                <div class="value">${fmt(d.total_balance_eur)} €</div>
                <div class="label">Общо наличност (EUR)</div>
            </div>
            <div class="card card-stat">
                <div class="value">${fmt(d.total_balance_bgn)} лв</div>
                <div class="label">Общо наличност (BGN)</div>
            </div>
            <div class="card card-stat green">
                <div class="value">${d.active_students}</div>
                <div class="label">Активни деца</div>
            </div>
            <div class="card card-stat orange">
                <div class="value">${d.unenrolled_students}</div>
                <div class="label">Отписани деца</div>
            </div>
            <div class="card card-stat green">
                <div class="value">${fmt(d.total_deposits_bgn)} лв</div>
                <div class="label">Общо захранвания</div>
            </div>
            <div class="card card-stat red">
                <div class="value">${fmt(d.total_expenses_bgn)} лв</div>
                <div class="label">Общо разходи</div>
            </div>
        </div>
        <div class="section-title">Последни движения</div>
        <div class="table-wrap">
            <table>
                <thead><tr>
                    <th>Дете</th><th>Сума (BGN)</th><th>Сума (EUR)</th><th>Дата</th><th>Основание</th>
                </tr></thead>
                <tbody>
                    ${d.recent_transactions.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:var(--text-light)">Няма движения</td></tr>' : ''}
                    ${d.recent_transactions.map(tx => `
                        <tr>
                            <td>${escHtml(tx.student_name)}</td>
                            <td class="${amountClass(tx.amount_bgn)}">${fmt(tx.amount_bgn)}</td>
                            <td class="${amountClass(tx.amount_eur)}">${fmt(tx.amount_eur)}</td>
                            <td>${fmtDate(tx.date)}</td>
                            <td>${escHtml(tx.reason)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// ===== STUDENTS VIEW =====
async function renderStudents(el) {
    const data = await API.getBalances(state.currentGroupId);
    const active = data.active;
    const unenrolled = data.unenrolled;

    el.innerHTML = `
        <div class="toolbar">
            <button class="btn btn-primary" onclick="showAddStudentModal()">+ Добави дете</button>
            <button class="btn btn-primary" onclick="showLinkSiblingsModal()">&#128106; Свържи братя/сестри</button>
            <span class="toolbar-spacer"></span>
            <button class="btn btn-success" onclick="showDepositModal()">+ Захранване</button>
            <button class="btn btn-danger" onclick="showExpenseModal()">− Разход</button>
        </div>
        <div class="section-title">Активни деца <span class="badge badge-green">${active.length}</span></div>
        <div class="table-wrap">
            <table>
                <thead><tr>
                    <th>#</th><th>Име</th><th>Баланс (EUR)</th><th>Баланс (BGN)</th><th>Действия</th>
                </tr></thead>
                <tbody>
                    ${active.map(s => `
                        <tr>
                            <td>${s.display_number || '-'}</td>
                            <td>${escHtml(s.full_name)}${s.sibling_group_id ? ' <span class="tag">братя/сестри</span>' : ''}</td>
                            <td class="${amountClass(s.balance_eur)}">${fmt(s.balance_eur)}</td>
                            <td class="${amountClass(s.balance_bgn)}">${fmt(s.balance_bgn)}</td>
                            <td>
                                <button class="btn-icon" title="Редактирай" onclick="showEditStudentModal('${s.id}','${escHtml(s.full_name)}')">&#9998;</button>
                                <button class="btn-icon" title="Отпиши" onclick="unenrollStudent('${s.id}')">&#10060;</button>
                                ${s.sibling_group_id ? `<button class="btn-icon" title="Премахни връзка" onclick="unlinkSibling('${s.id}')">&#128279;</button>` : ''}
                            </td>
                        </tr>
                    `).join('')}
                    <tr class="total-row">
                        <td colspan="2">Общо</td>
                        <td>${fmt(data.total_active_eur)} €</td>
                        <td>${fmt(data.total_active_bgn)} лв</td>
                        <td></td>
                    </tr>
                </tbody>
            </table>
        </div>
        ${unenrolled.length > 0 ? `
            <div class="section-title">Отписани деца <span class="badge badge-gray">${unenrolled.length}</span></div>
            <div class="table-wrap">
                <table>
                    <thead><tr>
                        <th>Име</th><th>Баланс (EUR)</th><th>Баланс (BGN)</th><th>Отписан на</th><th>Действия</th>
                    </tr></thead>
                    <tbody>
                        ${unenrolled.map(s => `
                            <tr>
                                <td>${escHtml(s.full_name)}</td>
                                <td>${fmt(s.balance_eur)}</td>
                                <td>${fmt(s.balance_bgn)}</td>
                                <td>${fmtDate(s.unenrolled_at)}</td>
                                <td>
                                    <button class="btn-icon" title="Върни в групата" onclick="reenrollStudent('${s.id}')">&#8634;</button>
                                </td>
                            </tr>
                        `).join('')}
                        <tr class="total-row">
                            <td>Общо</td>
                            <td>${fmt(data.total_unenrolled_eur)} €</td>
                            <td>${fmt(data.total_unenrolled_bgn)} лв</td>
                            <td colspan="2"></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        ` : ''}
    `;
}

function showAddStudentModal() {
    openModal('Добави дете', `
        <div class="form-group">
            <label>Пълно име на детето</label>
            <input type="text" id="new-student-name" placeholder="Име Презиме Фамилия">
        </div>
        <div class="form-actions">
            <button class="btn btn-primary" onclick="addStudent()">Добави</button>
        </div>
    `);
    setTimeout(() => document.getElementById('new-student-name')?.focus(), 100);
}

async function addStudent() {
    const name = document.getElementById('new-student-name').value.trim();
    if (!name) return;
    await API.createStudent(state.currentGroupId, { full_name: name });
    closeModal();
    renderView();
}

function showEditStudentModal(id, name) {
    openModal('Редактирай дете', `
        <div class="form-group">
            <label>Пълно име</label>
            <input type="text" id="edit-student-name" value="${escHtml(name)}">
        </div>
        <div class="form-actions">
            <button class="btn btn-danger btn-sm" onclick="deleteStudent('${id}')">Изтрий</button>
            <button class="btn btn-primary" onclick="saveStudent('${id}')">Запази</button>
        </div>
    `);
}

async function saveStudent(id) {
    const name = document.getElementById('edit-student-name').value.trim();
    if (!name) return;
    await API.updateStudent(id, { full_name: name });
    closeModal();
    renderView();
}

async function deleteStudent(id) {
    if (!confirm('Сигурни ли сте? Всички движения на това дете ще бъдат изтрити.')) return;
    await API.deleteStudent(id);
    closeModal();
    renderView();
}

async function unenrollStudent(id) {
    if (!confirm('Отписване на детето от групата?')) return;
    await API.unenrollStudent(id);
    renderView();
}

async function reenrollStudent(id) {
    await API.reenrollStudent(id);
    renderView();
}

async function unlinkSibling(id) {
    await API.unlinkSibling(id);
    renderView();
}

async function showLinkSiblingsModal() {
    const students = await API.getStudents(state.currentGroupId, 'active');
    openModal('Свържи братя/сестри', `
        <p style="font-size:13px;color:var(--text-light);margin-bottom:12px">Изберете 2 или повече деца, които са братя/сестри:</p>
        <div class="checkbox-list">
            ${students.map(s => `
                <label class="checkbox-item">
                    <input type="checkbox" name="sib" value="${s.id}">
                    ${escHtml(s.full_name)}
                </label>
            `).join('')}
        </div>
        <div class="form-actions">
            <button class="btn btn-primary" onclick="linkSelectedSiblings()">Свържи</button>
        </div>
    `);
}

async function linkSelectedSiblings() {
    const ids = [...document.querySelectorAll('input[name="sib"]:checked')].map(cb => cb.value);
    if (ids.length < 2) { alert('Изберете поне 2 деца.'); return; }
    await API.linkSiblings(state.currentGroupId, ids);
    closeModal();
    renderView();
}

// ===== DEPOSIT MODAL =====
async function showDepositModal() {
    const students = await API.getStudents(state.currentGroupId, 'active');
    openModal('Добави захранване', `
        <div class="form-group">
            <label>Деца</label>
            <div class="select-all-bar">
                <a onclick="toggleAll('dep-student', true)">Избери всички</a> |
                <a onclick="toggleAll('dep-student', false)">Махни всички</a>
            </div>
            <div class="checkbox-list">
                ${students.map(s => `
                    <label class="checkbox-item">
                        <input type="checkbox" name="dep-student" value="${s.id}">
                        ${escHtml(s.full_name)}
                    </label>
                `).join('')}
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Сума</label>
                <input type="number" id="dep-amount" step="0.01" value="150">
            </div>
            <div class="form-group">
                <label>Валута</label>
                <select id="dep-currency">
                    <option value="BGN">BGN (лв)</option>
                    <option value="EUR">EUR (€)</option>
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Дата</label>
                <input type="date" id="dep-date" value="${today()}">
            </div>
            <div class="form-group">
                <label>Основание</label>
                <input type="text" id="dep-reason" value="захранване">
            </div>
        </div>
        <div class="form-actions">
            <button class="btn btn-success" onclick="submitDeposit()">Запази</button>
        </div>
    `);
}

async function submitDeposit() {
    const ids = [...document.querySelectorAll('input[name="dep-student"]:checked')].map(cb => cb.value);
    if (ids.length === 0) { alert('Изберете поне едно дете.'); return; }
    const data = {
        student_ids: ids,
        amount: parseFloat(document.getElementById('dep-amount').value),
        currency: document.getElementById('dep-currency').value,
        date: document.getElementById('dep-date').value,
        reason: document.getElementById('dep-reason').value || 'захранване',
    };
    await API.createDeposit(state.currentGroupId, data);
    closeModal();
    renderView();
}

// ===== EXPENSE MODAL =====
async function showExpenseModal() {
    const students = await API.getStudents(state.currentGroupId, 'active');
    const cats = await API.getCategories(state.currentGroupId);
    openModal('Добави разход', `
        <div class="form-group">
            <label>Деца (участващи)</label>
            <div class="select-all-bar">
                <a onclick="toggleAll('exp-student', true)">Избери всички</a> |
                <a onclick="toggleAll('exp-student', false)">Махни всички</a>
            </div>
            <div class="checkbox-list" id="exp-student-list">
                ${students.map(s => `
                    <label class="checkbox-item">
                        <input type="checkbox" name="exp-student" value="${s.id}" checked onchange="updatePerChild()">
                        ${escHtml(s.full_name)}
                    </label>
                `).join('')}
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Обща сума</label>
                <input type="number" id="exp-amount" step="0.01" oninput="updatePerChild()">
            </div>
            <div class="form-group">
                <label>Валута</label>
                <select id="exp-currency">
                    <option value="BGN">BGN (лв)</option>
                    <option value="EUR">EUR (€)</option>
                </select>
            </div>
        </div>
        <div id="per-child-preview" style="font-size:13px;color:var(--text-light);margin-bottom:12px"></div>
        <div class="form-row">
            <div class="form-group">
                <label>Дата</label>
                <input type="date" id="exp-date" value="${today()}">
            </div>
            <div class="form-group">
                <label>Категория</label>
                <select id="exp-category">
                    <option value="">-- без категория --</option>
                    ${cats.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="form-group">
            <label>Описание / основание</label>
            <input type="text" id="exp-reason" placeholder="напр. Театър Март">
        </div>
        <div class="form-group">
            <label>Номер на фактура (незадължително)</label>
            <input type="text" id="exp-invoice" placeholder="напр. 0040054083">
        </div>
        <div class="form-actions">
            <button class="btn btn-danger" onclick="submitExpense()">Запази разход</button>
        </div>
    `);
    updatePerChild();
}

function updatePerChild() {
    const n = document.querySelectorAll('input[name="exp-student"]:checked').length;
    const total = parseFloat(document.getElementById('exp-amount')?.value || 0);
    const preview = document.getElementById('per-child-preview');
    if (preview) {
        if (n > 0 && total > 0) {
            preview.textContent = `Индивидуален разход: ${(total / n).toFixed(2)} за ${n} деца`;
        } else {
            preview.textContent = '';
        }
    }
}

function toggleAll(name, checked) {
    document.querySelectorAll(`input[name="${name}"]`).forEach(cb => cb.checked = checked);
    updatePerChild();
}

async function submitExpense() {
    const ids = [...document.querySelectorAll('input[name="exp-student"]:checked')].map(cb => cb.value);
    if (ids.length === 0) { alert('Изберете поне едно дете.'); return; }
    const amount = parseFloat(document.getElementById('exp-amount').value);
    if (!amount || amount <= 0) { alert('Въведете сума.'); return; }
    const reason = document.getElementById('exp-reason').value.trim();
    if (!reason) { alert('Въведете описание.'); return; }

    const data = {
        student_ids: ids,
        total_amount: amount,
        currency: document.getElementById('exp-currency').value,
        date: document.getElementById('exp-date').value,
        reason: reason,
        category_id: document.getElementById('exp-category').value || null,
        invoice_number: document.getElementById('exp-invoice').value.trim() || null,
    };
    await API.createExpense(state.currentGroupId, data);
    closeModal();
    renderView();
}

// ===== TRANSACTIONS VIEW =====
async function renderTransactions(el) {
    const cats = await API.getCategories(state.currentGroupId);

    el.innerHTML = `
        <div class="toolbar">
            <button class="btn btn-success" onclick="showDepositModal()">+ Захранване</button>
            <button class="btn btn-danger" onclick="showExpenseModal()">− Разход</button>
            <span class="toolbar-spacer"></span>
            <input type="text" id="tx-search" placeholder="Търсене по основание...">
            <select id="tx-type-filter">
                <option value="">Всички</option>
                <option value="deposit">Захранвания</option>
                <option value="expense">Разходи</option>
            </select>
            <input type="date" id="tx-from" placeholder="От">
            <input type="date" id="tx-to" placeholder="До">
            <button class="btn btn-primary btn-sm" onclick="loadTransactions()">Филтрирай</button>
        </div>
        <div class="table-wrap">
            <table>
                <thead><tr>
                    <th>Дете</th><th>Сума (BGN)</th><th>Сума (EUR)</th><th>Дата</th><th>Основание</th><th>Категория</th>
                </tr></thead>
                <tbody id="tx-body">
                    <tr><td colspan="6" style="text-align:center">Зареждане...</td></tr>
                </tbody>
            </table>
        </div>
    `;
    loadTransactions();
}

async function loadTransactions() {
    const params = {};
    const search = document.getElementById('tx-search')?.value;
    const txType = document.getElementById('tx-type-filter')?.value;
    const from = document.getElementById('tx-from')?.value;
    const to = document.getElementById('tx-to')?.value;
    if (search) params.search = search;
    if (txType) params.tx_type = txType;
    if (from) params.date_from = from;
    if (to) params.date_to = to;

    const txs = await API.getTransactions(state.currentGroupId, params);
    const tbody = document.getElementById('tx-body');
    if (!tbody) return;

    if (txs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-light)">Няма движения</td></tr>';
        return;
    }
    tbody.innerHTML = txs.map(tx => `
        <tr>
            <td>${escHtml(tx.student_name)}</td>
            <td class="${amountClass(tx.amount_bgn)}">${fmt(tx.amount_bgn)}</td>
            <td class="${amountClass(tx.amount_eur)}">${fmt(tx.amount_eur)}</td>
            <td>${fmtDate(tx.date)}</td>
            <td>${escHtml(tx.reason)}</td>
            <td>${tx.category_name ? `<span class="tag">${escHtml(tx.category_name)}</span>` : ''}</td>
        </tr>
    `).join('');
}

// ===== INVOICES VIEW =====
async function renderInvoices(el) {
    const invoices = await API.getInvoices(state.currentGroupId);
    state.invoicesCache = invoices;

    el.innerHTML = `
        <div class="toolbar">
            <button class="btn btn-primary" onclick="showAddInvoiceModal()">+ Добави фактура</button>
        </div>
        <div class="table-wrap">
            <table>
                <thead><tr>
                    <th>Описание</th><th>Общо</th><th>На дете</th><th>Деца</th><th>Дата</th><th>Фактура №</th><th>Валута</th><th>Действия</th>
                </tr></thead>
                <tbody>
                    ${invoices.length === 0 ? '<tr><td colspan="8" style="text-align:center;color:var(--text-light)">Няма фактури</td></tr>' : ''}
                    ${invoices.map(inv => `
                        <tr>
                            <td>${escHtml(inv.description)}</td>
                            <td class="amount-negative">${fmt(inv.total_amount)}</td>
                            <td>${fmt(inv.per_child_cost)}</td>
                            <td>${inv.num_children || '-'}</td>
                            <td>${fmtDate(inv.date)}</td>
                            <td>${escHtml(inv.invoice_number || '-')}</td>
                            <td>${inv.currency}</td>
                            <td>
                                <button class="btn-icon" title="Редактирай" onclick="showEditInvoiceModal('${inv.id}')">&#9998;</button>
                                <button class="btn-icon" title="Изтрий" onclick="deleteInvoice('${inv.id}')">&#128465;</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

async function showAddInvoiceModal() {
    const students = await API.getStudents(state.currentGroupId, 'active');
    const cats = await API.getCategories(state.currentGroupId);
    openModal('Добави фактура / разход', `
        <div class="form-group">
            <label>Описание</label>
            <input type="text" id="inv-desc">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Обща сума</label>
                <input type="number" id="inv-total" step="0.01" oninput="updateInvPerChild()">
            </div>
            <div class="form-group">
                <label>Валута</label>
                <select id="inv-currency">
                    <option value="BGN">BGN</option>
                    <option value="EUR">EUR</option>
                </select>
            </div>
        </div>
        <div class="form-group">
            <label>Деца (участващи в разхода)</label>
            <div class="select-all-bar">
                <a onclick="toggleAll('inv-student', true); updateInvPerChild()">Избери всички</a> |
                <a onclick="toggleAll('inv-student', false); updateInvPerChild()">Махни всички</a>
            </div>
            <div class="checkbox-list">
                ${students.map(s => `
                    <label class="checkbox-item">
                        <input type="checkbox" name="inv-student" value="${s.id}" checked onchange="updateInvPerChild()">
                        ${escHtml(s.full_name)}
                    </label>
                `).join('')}
            </div>
        </div>
        <div id="inv-per-child-preview" style="font-size:13px;color:var(--text-light);margin-bottom:12px"></div>
        <div class="form-row">
            <div class="form-group">
                <label>Дата</label>
                <input type="date" id="inv-date" value="${today()}">
            </div>
            <div class="form-group">
                <label>Категория</label>
                <select id="inv-category">
                    <option value="">-- без категория --</option>
                    ${cats.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="form-group">
            <label>Номер на фактура (незадължително)</label>
            <input type="text" id="inv-number">
        </div>
        <div class="form-actions">
            <button class="btn btn-primary" onclick="submitInvoice()">Запази</button>
        </div>
    `);
    updateInvPerChild();
}

function updateInvPerChild() {
    const n = document.querySelectorAll('input[name="inv-student"]:checked').length;
    const total = parseFloat(document.getElementById('inv-total')?.value || 0);
    const preview = document.getElementById('inv-per-child-preview');
    if (preview) {
        if (n > 0 && total > 0) {
            preview.textContent = `Индивидуален разход: ${(total / n).toFixed(2)} за ${n} деца`;
        } else if (n === 0) {
            preview.textContent = 'Изберете деца, за да се създадат движения.';
        } else {
            preview.textContent = '';
        }
    }
}

async function submitInvoice() {
    const ids = [...document.querySelectorAll('input[name="inv-student"]:checked')].map(cb => cb.value);
    const data = {
        description: document.getElementById('inv-desc').value.trim(),
        total_amount: parseFloat(document.getElementById('inv-total').value),
        currency: document.getElementById('inv-currency').value,
        date: document.getElementById('inv-date').value,
        invoice_number: document.getElementById('inv-number').value.trim() || null,
        student_ids: ids,
        category_id: document.getElementById('inv-category').value || null,
    };
    if (!data.description || !data.total_amount) { alert('Попълнете задължителните полета.'); return; }
    if (ids.length === 0 && !confirm('Не са избрани деца — фактурата няма да създаде движения. Продължи?')) return;
    await API.createInvoice(state.currentGroupId, data);
    closeModal();
    renderView();
}

function showEditInvoiceModal(id) {
    const inv = state.invoicesCache.find(i => i.id === id);
    if (!inv) { alert('Фактурата не е намерена.'); return; }
    openModal('Редактирай фактура', `
        <div class="form-group">
            <label>Описание</label>
            <input type="text" id="inv-desc" value="${escHtml(inv.description)}">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Обща сума</label>
                <input type="number" id="inv-total" step="0.01" value="${inv.total_amount}">
            </div>
            <div class="form-group">
                <label>На дете</label>
                <input type="number" id="inv-per-child" step="0.01" value="${inv.per_child_cost}">
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Брой деца</label>
                <input type="number" id="inv-children" step="1" value="${inv.num_children || ''}">
            </div>
            <div class="form-group">
                <label>Валута</label>
                <select id="inv-currency">
                    <option value="BGN" ${inv.currency === 'BGN' ? 'selected' : ''}>BGN</option>
                    <option value="EUR" ${inv.currency === 'EUR' ? 'selected' : ''}>EUR</option>
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Дата</label>
                <input type="date" id="inv-date" value="${fmtDate(inv.date)}">
            </div>
            <div class="form-group">
                <label>Номер на фактура</label>
                <input type="text" id="inv-number" value="${escHtml(inv.invoice_number || '')}">
            </div>
        </div>
        <div class="form-actions">
            <button class="btn btn-primary" onclick="updateInvoice('${inv.id}')">Запази</button>
        </div>
    `);
}

async function updateInvoice(id) {
    const data = {
        description: document.getElementById('inv-desc').value.trim(),
        total_amount: parseFloat(document.getElementById('inv-total').value),
        per_child_cost: parseFloat(document.getElementById('inv-per-child').value),
        num_children: parseInt(document.getElementById('inv-children').value) || null,
        currency: document.getElementById('inv-currency').value,
        date: document.getElementById('inv-date').value,
        invoice_number: document.getElementById('inv-number').value.trim() || null,
    };
    await API.updateInvoice(id, data);
    closeModal();
    renderView();
}

async function deleteInvoice(id) {
    if (!confirm('Изтриване на фактурата?')) return;
    await API.deleteInvoice(id);
    renderView();
}

// ===== SETTINGS VIEW =====
async function renderSettings(el) {
    const group = await API.getGroups().then(gs => gs.find(g => g.id === state.currentGroupId));
    const cats = await API.getCategories(state.currentGroupId);

    el.innerHTML = `
        <div class="settings-section">
            <h3>&#x2699; Настройки на групата</h3>
            <div class="form-row">
                <div class="form-group">
                    <label>Детска градина</label>
                    <input type="text" id="set-kg" value="${escHtml(group?.kindergarten_name || '')}">
                </div>
                <div class="form-group">
                    <label>Група</label>
                    <input type="text" id="set-name" value="${escHtml(group?.name || '')}">
                </div>
            </div>
            <div class="form-group" style="max-width:250px">
                <label>Курс EUR → BGN</label>
                <input type="number" id="set-rate" step="0.00001" value="${group?.exchange_rate || 1.95583}">
            </div>
            <div class="form-actions" style="justify-content:flex-start">
                <button class="btn btn-primary" onclick="saveGroupSettings()">Запази</button>
                <button class="btn btn-danger" onclick="deleteCurrentGroup()">Изтрий групата</button>
            </div>
        </div>
        <div class="settings-section">
            <h3>&#x1F3F7; Категории разходи</h3>
            <div class="category-list" id="cat-list">
                ${cats.map(c => `
                    <div class="category-item">
                        <span>${escHtml(c.name)}</span>
                        <div class="category-item-actions">
                            <button class="btn-icon" title="Редактирай" onclick="showEditCategoryModal('${c.id}','${escHtml(c.name)}')">&#9998;</button>
                            <button class="btn-icon" title="Изтрий" onclick="deleteCategory('${c.id}')">&#128465;</button>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div style="margin-top:12px;display:flex;gap:8px">
                <input type="text" id="new-cat-name" placeholder="Нова категория..." style="flex:1;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px">
                <button class="btn btn-primary btn-sm" onclick="addCategory()">Добави</button>
            </div>
        </div>
    `;
}

async function saveGroupSettings() {
    await API.updateGroup(state.currentGroupId, {
        kindergarten_name: document.getElementById('set-kg').value.trim(),
        name: document.getElementById('set-name').value.trim(),
        exchange_rate: parseFloat(document.getElementById('set-rate').value),
    });
    await loadGroups();
    renderView();
}

async function deleteCurrentGroup() {
    if (!confirm('ВНИМАНИЕ: Това ще изтрие групата и ВСИЧКИ данни в нея!')) return;
    await API.deleteGroup(state.currentGroupId);
    state.currentGroupId = null;
    state.currentGroup = null;
    await loadGroups();
    navigate('dashboard');
}

async function addCategory() {
    const name = document.getElementById('new-cat-name').value.trim();
    if (!name) return;
    await API.createCategory(state.currentGroupId, { name });
    renderView();
}

function showEditCategoryModal(id, name) {
    openModal('Редактирай категория', `
        <div class="form-group">
            <label>Име</label>
            <input type="text" id="edit-cat-name" value="${name}">
        </div>
        <div class="form-actions">
            <button class="btn btn-primary" onclick="saveCategoryEdit('${id}')">Запази</button>
        </div>
    `);
}

async function saveCategoryEdit(id) {
    const name = document.getElementById('edit-cat-name').value.trim();
    if (!name) return;
    await API.updateCategory(id, { name });
    closeModal();
    renderView();
}

async function deleteCategory(id) {
    if (!confirm('Изтриване на категорията?')) return;
    await API.deleteCategory(id);
    renderView();
}

// ===== GROUP MANAGEMENT =====
function showNewGroupModal() {
    openModal('Нова група', `
        <div class="form-group">
            <label>Детска градина</label>
            <input type="text" id="grp-kg" placeholder="напр. ДГ Мечо Пух">
        </div>
        <div class="form-group">
            <label>Група</label>
            <input type="text" id="grp-name" placeholder="напр. 2А">
        </div>
        <div class="form-group">
            <label>Курс EUR → BGN</label>
            <input type="number" id="grp-rate" step="0.00001" value="1.95583">
        </div>
        <div class="form-actions">
            <button class="btn btn-primary" onclick="createGroup()">Създай</button>
        </div>
    `);
    setTimeout(() => document.getElementById('grp-kg')?.focus(), 100);
}

async function createGroup() {
    const data = {
        kindergarten_name: document.getElementById('grp-kg').value.trim(),
        name: document.getElementById('grp-name').value.trim(),
        exchange_rate: parseFloat(document.getElementById('grp-rate').value) || 1.95583,
    };
    if (!data.kindergarten_name || !data.name) { alert('Попълнете всички полета.'); return; }
    const group = await API.createGroup(data);
    closeModal();
    await loadGroups();
    selectGroup(group.id);
}

async function loadGroups() {
    state.groups = await API.getGroups();
    const sel = document.getElementById('group-select');
    const current = state.currentGroupId;
    sel.innerHTML = '<option value="">-- Изберете група --</option>' +
        state.groups.map(g => `<option value="${g.id}" ${g.id === current ? 'selected' : ''}>${escHtml(g.kindergarten_name)} — ${escHtml(g.name)}</option>`).join('');
}

function selectGroup(id) {
    state.currentGroupId = id || null;
    state.currentGroup = state.groups.find(g => g.id === id) || null;
    document.getElementById('group-select').value = id || '';
    navigate(state.currentView);
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
    // Nav clicks
    document.querySelectorAll('.nav-links li').forEach(li => {
        li.addEventListener('click', () => navigate(li.dataset.view));
    });

    // Group selector
    document.getElementById('group-select').addEventListener('change', (e) => {
        selectGroup(e.target.value);
    });

    // New group button
    document.getElementById('btn-new-group').addEventListener('click', showNewGroupModal);

    // Modal close
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal();
    });

    // Mobile hamburger
    document.getElementById('hamburger').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });
    document.getElementById('sidebar-close').addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('open');
    });

    // Load groups
    await loadGroups();

    // Auto-select first group if exists
    if (state.groups.length > 0) {
        selectGroup(state.groups[0].id);
    }
});
