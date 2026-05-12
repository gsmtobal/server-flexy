// --- Global Functions for Dashboard Buttons ---

const SIMS_KEY = 'tobal_sims_db';
const SMS_LOGS_KEY = 'tobal_sms_logs';
const USSD_LOGS_KEY = 'tobal_ussd_logs';

const getData = (key) => JSON.parse(localStorage.getItem(key)) || [];
const setData = (key, data) => localStorage.setItem(key, JSON.stringify(data));

// 1. Sync Modem Data from Local Server
window.syncModem = async (modemId) => {
    const sims = getData(SIMS_KEY);
    const sim = sims.find(s => s.modem_id === modemId);
    if (!sim || !sim.modem_ip) return;

    console.log(`[Tobal Gsm] Sending Sync Request for ${modemId}...`);
    
    try {
        const response = await fetch(`http://localhost:3000/api/sync-hilink/${sim.modem_ip}`);
        const result = await response.json();

        if (result.success) {
            sim.status = result.data.status;
            sim.signal = result.data.signal;
            sim.carrier = result.data.carrier;
            sim.last_sync = result.data.last_update;
            setData(SIMS_KEY, sims);
            if (typeof window.renderModems === 'function') window.renderModems();
            alert(`✅ تم تحديث بيانات المودم ${modemId} بنجاح!`);
        } else {
            alert(`❌ فشل السيرفر في جلب البيانات: ${result.message}`);
        }
    } catch (error) {
        alert(`❌ فشل الاتصال بالسيرفر (localhost:3000).\n\nالحل: تأكد من تشغيل run_server.bat ومن فتح هذا الموقع من "الملف المحلي" (File) وليس من رابط GitHub.`);
    }
};

// 2. Reset Balance
window.resetBalance = (modemId) => {
    const sims = getData(SIMS_KEY);
    const sim = sims.find(s => s.modem_id === modemId);
    if (sim) {
        sim.balance = 0;
        setData(SIMS_KEY, sims);
        window.renderModems();
    }
};

// 3. Execute Quick USSD (Firm Implementation)
window.executeQuickUSSD = async (modemId) => {
    const sims = getData(SIMS_KEY);
    const sim = sims.find(s => s.modem_id === modemId);
    if (!sim || !sim.modem_ip) return;

    let code = "*200*PIN#";
    if (sim.pin) code = code.replace('PIN', sim.pin);
    else code = code.replace('PIN', '0000');

    console.log(`[Tobal Gsm] FIRM ORDER: Sending USSD [${code}] to local server...`);

    try {
        const response = await fetch(`http://localhost:3000/api/send-ussd`, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip: sim.modem_ip, code: code })
        });
        
        const result = await response.json();
        if (result.success && result.content) {
            // Try to extract balance (e.g. 120.00 DA or 120 دج)
            const balanceMatch = result.content.match(/(\d+(\.\d+)?)\s*(DA|دج)/i);
            let balanceFound = null;
            
            if (balanceMatch) {
                balanceFound = parseFloat(balanceMatch[1]);
                sim.balance = balanceFound;
                setData(SIMS_KEY, sims);
                window.renderModems();
            }

            alert(`✅ رد الشبكة:\n\n${result.content}${balanceFound !== null ? '\n\n💰 تم تحديث الرصيد تلقائياً!' : ''}`);
        } else if (result.success) {
            alert(`✅ تم الإرسال بنجاح، لكن لم يصل رد من الشبكة في الوقت المحدد.`);
        } else {
            alert(`❌ السيرفر استلم الطلب لكن المودم رفض: ${result.message}`);
        }
    } catch (error) {
        alert(`❌ الطلب لم يصل للسيرفر!\n\nالحل: افتح ملف sim_dashboard.html من جهازك مباشرة (Local File).`);
    }
};

// 4. Delete Modem
window.deleteModem = (id) => {
    if (confirm('هل أنت متأكد من حذف هذه الشريحة؟')) {
        const sims = getData(SIMS_KEY).filter(s => s.id !== id);
        setData(SIMS_KEY, sims);
        if (typeof window.renderModems === 'function') window.renderModems();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Seed data with the real Ooredoo modem found
    if (getData(SIMS_KEY).length === 0) {
        setData(SIMS_KEY, [
            { id: 'sim_real_01', station: 'Home', modem_id: 'Ooredoo_Huawei', modem_ip: '192.168.50.1', sim_type: 'Ooredoo', number: '05XXXXXXXX', label: 'المودم المنزلي', priority: 1, balance: 0, signal: 3, status: 'online', min_balance: 50, max_req: 100, auto_recharge: true, pin: '0000' }
        ]);
    }

    // --- Selectors ---
    const menuLinks = document.querySelectorAll('.menu-link');
    const viewContents = document.querySelectorAll('.view-content');
    const modemTableBody = document.getElementById('modem-table-body');
    const smsTableBody = document.getElementById('sms-table-body');
    const ussdModemSelect = document.getElementById('ussd-modem-select');
    const addModemModal = document.getElementById('addModemModal');
    const btnAddModem = document.getElementById('btn-add-modem');
    const addModemForm = document.getElementById('add-modem-form');

    window.renderModems = () => {
        const sims = getData(SIMS_KEY);
        const totalBal = sims.reduce((acc, s) => acc + parseFloat(s.balance || 0), 0);
        const onlineCount = sims.filter(s => s.status === 'online').length;

        const tb = document.getElementById('total-balance');
        const as = document.getElementById('active-sims');
        if (tb) tb.textContent = `${totalBal.toLocaleString()} دج`;
        if (as) as.textContent = `${onlineCount} / ${sims.length}`;

        if (modemTableBody) {
            modemTableBody.innerHTML = sims.map(sim => `
                <tr>
                    <td><strong>${sim.modem_id}</strong><br><small class="text-muted">${sim.modem_ip || 'Serial'}</small></td>
                    <td>${sim.station}</td>
                    <td><span class="badge bg-label-danger">${sim.carrier || sim.sim_type}</span></td>
                    <td>${sim.number}</td>
                    <td>${sim.label || '-'}</td>
                    <td>
                        <div class="signal-bars">
                            ${[1,2,3,4,5].map(i => `<div class="bar ${i <= sim.signal ? 'active' : ''}"></div>`).join('')}
                        </div>
                    </td>
                    <td>
                        <div class="d-flex align-items-center gap-1">
                            <span class="fw-bold">${parseFloat(sim.balance || 0).toLocaleString()} دج</span>
                            <button class="btn btn-sm p-0 text-muted" onclick="resetBalance('${sim.modem_id}')" title="تصفير الرصيد">
                                <i class="fas fa-eraser" style="font-size: 0.7rem;"></i>
                            </button>
                        </div>
                    </td>
                    <td><span class="text-muted small">${sim.min_balance || 0} دج</span></td>
                    <td><span class="status-dot"><i class="fas fa-circle" style="color: ${sim.status === 'online' ? 'var(--success)' : 'var(--danger)'}"></i> ${sim.status === 'online' ? 'متصل' : 'أونلاين'}</span></td>
                    <td>
                        <div class="d-flex gap-1">
                            <button class="btn btn-sm btn-icon btn-outline-primary" onclick="syncModem('${sim.modem_id}')" title="مزامنة حقيقية">
                                <i class="fas fa-sync-alt"></i>
                            </button>
                            <button class="btn btn-sm btn-icon btn-outline-secondary" onclick="executeQuickUSSD('${sim.modem_id}')" title="طلب الرصيد USSD">
                                <i class="fas fa-terminal"></i>
                            </button>
                            <button class="btn btn-sm btn-icon btn-outline-danger" onclick="deleteModem('${sim.id}')" title="حذف">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `).join('');
        }
    };

    const renderSMS = () => {
        const sms = getData(SMS_LOGS_KEY);
        if (smsTableBody) {
            smsTableBody.innerHTML = sms.reverse().map(item => `
                <tr>
                    <td><strong>${item.modem}</strong></td>
                    <td>${item.sender}</td>
                    <td><div style="max-width: 300px; white-space: normal;">${item.message}</div></td>
                    <td><small>${item.date}</small></td>
                    <td><button class="btn btn-sm btn-label-danger"><i class="fas fa-trash"></i></button></td>
                </tr>
            `).join('') || '<tr><td colspan="5" class="text-center">لا توجد رسائل</td></tr>';
        }
    };

    const showView = (viewId) => {
        viewContents.forEach(view => view.classList.remove('active'));
        const el = document.getElementById(viewId);
        if (el) el.classList.add('active');
        
        menuLinks.forEach(link => {
            const parent = link.parentElement;
            if (link.dataset.view === viewId) parent.classList.add('active');
            else parent.classList.remove('active');
        });
        if (viewId === 'modem-info') window.renderModems();
        if (viewId === 'sms-inbox') renderSMS();
    };

    menuLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            showView(link.dataset.view);
        });
    });

    if (btnAddModem) btnAddModem.addEventListener('click', () => addModemModal.classList.add('active'));
    if (addModemModal) addModemModal.addEventListener('click', (e) => { if (e.target === addModemModal) addModemModal.classList.remove('active'); });
    document.querySelectorAll('[data-bs-dismiss="modal"]').forEach(btn => btn.addEventListener('click', () => addModemModal.classList.remove('active')));

    if (addModemForm) addModemForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(addModemForm);
        const newSim = {
            id: 'sim_' + Date.now(),
            station: formData.get('station'),
            modem_id: formData.get('modem_id'),
            sim_type: formData.get('sim_type'),
            number: formData.get('number'),
            label: formData.get('label'),
            priority: parseInt(formData.get('priority')),
            min_balance: parseInt(formData.get('min_balance')),
            max_req: parseInt(formData.get('max_req')),
            auto_recharge: formData.get('auto_recharge') === 'on',
            pin: formData.get('pin') || '0000',
            balance: 0,
            signal: 0,
            status: 'offline'
        };
        const sims = getData(SIMS_KEY);
        sims.push(newSim);
        setData(SIMS_KEY, sims);
        addModemModal.classList.remove('active');
        addModemForm.reset();
        window.renderModems();
    });

    // Mobile Menu Toggle
    const toggle = document.querySelector('.layout-menu-toggle');
    if (toggle) toggle.addEventListener('click', () => {
        document.getElementById('layout-menu').classList.toggle('active');
        document.querySelector('.layout-overlay').classList.toggle('active');
    });

    showView('modem-info');
});
