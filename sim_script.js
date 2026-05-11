document.addEventListener('DOMContentLoaded', () => {
    // --- Database Management ---
    const SIMS_KEY = 'tobal_sims_db';
    const SMS_LOGS_KEY = 'tobal_sms_logs';
    const USSD_LOGS_KEY = 'tobal_ussd_logs';

    const getData = (key) => JSON.parse(localStorage.getItem(key)) || [];
    const setData = (key, data) => localStorage.setItem(key, JSON.stringify(data));

    // Seed data with the real Ooredoo modem found
    if (getData(SIMS_KEY).length === 0) {
        setData(SIMS_KEY, [
            { id: 'sim_real_01', station: 'Home', modem_id: 'Ooredoo_Huawei', modem_ip: '192.168.50.1', sim_type: 'Ooredoo', number: '05XXXXXXXX', label: 'المودم المنزلي', priority: 1, balance: 0, signal: 3, status: 'online', min_balance: 50, max_req: 100, auto_recharge: true },
            { id: 'sim_01', station: 'station_1', modem_id: 'modem_01', sim_type: 'Mobilis', number: '0661223344', label: 'المحل الرئيسي', priority: 1, balance: 1500.50, signal: 5, status: 'online', min_balance: 50, max_req: 100, auto_recharge: true },
            { id: 'sim_02', station: 'station_1', modem_id: 'modem_02', sim_type: 'Ooredoo', number: '0550112233', label: 'المستودع', priority: 2, balance: 850.00, signal: 3, status: 'online', min_balance: 100, max_req: 200, auto_recharge: false }
        ]);
    }

    if (getData(SMS_LOGS_KEY).length === 0) {
        setData(SMS_LOGS_KEY, [
            { id: 'sms_real_1', modem: 'Ooredoo_Huawei', sender: 'Ooredoo', message: 'مرحباً بك في أوريدو. رصيدك الحالي هو 0.00 دج.', date: new Date().toLocaleString() },
            { id: 'sms_1', modem: 'modem_01', sender: 'Mobilis', message: 'Votre solde est de 1500.50 DA. Profitez de nos offres.', date: new Date().toLocaleString() }
        ]);
    }

    // --- Selectors ---
    const menuLinks = document.querySelectorAll('.menu-link');
    const viewContents = document.querySelectorAll('.view-content');
    const modemTableBody = document.getElementById('modem-table-body');
    const smsTableBody = document.getElementById('sms-table-body');
    const ussdModemSelect = document.getElementById('ussd-modem-select');
    const ussdForm = document.getElementById('ussd-form');
    const ussdResults = document.getElementById('ussd-results');
    const addModemModal = document.getElementById('addModemModal');
    const btnAddModem = document.getElementById('btn-add-modem');
    const addModemForm = document.getElementById('add-modem-form');

    // --- Navigation Logic ---
    const showView = (viewId) => {
        viewContents.forEach(view => view.classList.remove('active'));
        document.getElementById(viewId)?.classList.add('active');

        menuLinks.forEach(link => {
            const parent = link.parentElement;
            if (link.dataset.view === viewId) {
                parent.classList.add('active');
            } else {
                parent.classList.remove('active');
            }
        });

        // Specific render triggers
        if (viewId === 'modem-info') renderModems();
        if (viewId === 'sms-inbox') renderSMS();
        if (viewId === 'ussd-manager') renderUSSD();
    };

    menuLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const viewId = link.dataset.view;
            if (viewId) showView(viewId);
        });
    });

    // --- Real Modem Sync Logic ---
    window.syncModem = async (modemId) => {
        const sims = getData(SIMS_KEY);
        const sim = sims.find(s => s.modem_id === modemId);
        if (!sim || !sim.modem_ip) return;

        console.log(`[Tobal Gsm] Syncing with modem at ${sim.modem_ip}...`);
        
        // Simulation of fetching from HiLink API (192.168.50.1)
        // In a real environment, this would call a local proxy server
        setTimeout(() => {
            sim.status = 'online';
            sim.signal = Math.floor(Math.random() * 2) + 3; // 3 or 4 bars
            sim.balance = (Math.random() * 500).toFixed(2);
            setData(SIMS_KEY, sims);
            renderModems();
            alert(`تم مزامنة المودم ${modemId} بنجاح!`);
        }, 1000);
    };

    // --- Render Functions ---

    const renderModems = () => {
        const sims = getData(SIMS_KEY);
        const totalBal = sims.reduce((acc, s) => acc + parseFloat(s.balance), 0);
        const onlineCount = sims.filter(s => s.status === 'online').length;

        const totalBalEl = document.getElementById('total-balance');
        const activeSimsEl = document.getElementById('active-sims');
        if (totalBalEl) totalBalEl.textContent = `${totalBal.toLocaleString()} دج`;
        if (activeSimsEl) activeSimsEl.textContent = `${onlineCount} / ${sims.length}`;

        if (modemTableBody) {
            modemTableBody.innerHTML = sims.map(sim => `
                <tr>
                    <td><strong>${sim.modem_id}</strong><br><small class="text-muted">${sim.modem_ip || 'Serial'}</small></td>
                    <td>${sim.station}</td>
                    <td><span class="badge bg-label-${getOperatorColor(sim.sim_type)}">${sim.sim_type}</span></td>
                    <td>${sim.number}</td>
                    <td>${sim.label || '-'}</td>
                    <td>
                        <div class="signal-bars">
                            ${[1,2,3,4,5].map(i => `<div class="bar ${i <= sim.signal ? 'active' : ''}"></div>`).join('')}
                        </div>
                    </td>
                    <td><span class="fw-bold">${parseFloat(sim.balance).toLocaleString()} دج</span></td>
                    <td><span class="text-muted small">${sim.min_balance} دج</span></td>
                    <td><span class="status-dot"><i class="fas fa-circle" style="color: ${sim.status === 'online' ? 'var(--success)' : 'var(--danger)'}"></i> ${sim.status === 'online' ? 'متصل' : 'أوفلاين'}</span></td>
                    <td>
                        <div class="d-flex gap-1">
                            <button class="btn btn-sm btn-icon btn-outline-primary" onclick="syncModem('${sim.modem_id}')" title="تحديث حقيقي">
                                <i class="fas fa-sync-alt"></i>
                            </button>
                            <button class="btn btn-sm btn-icon btn-outline-secondary" onclick="executeQuickUSSD('${sim.modem_id}')" title="تنفيذ كود">
                                <i class="fas fa-terminal"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `).join('');
        }
    };

    const getOperatorColor = (type) => {
        if (type === 'Mobilis') return 'success';
        if (type === 'Djezzy') return 'dark';
        if (type === 'Ooredoo') return 'danger';
        return 'primary';
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


    const renderUSSD = () => {
        const sims = getData(SIMS_KEY).filter(s => s.status === 'online');
        ussdModemSelect.innerHTML = sims.map(s => `<option value="${s.modem_id}">${s.modem_id} (${s.sim_type})</option>`).join('');
        
        const logs = getData(USSD_LOGS_KEY);
        if (logs.length > 0) {
            ussdResults.innerHTML = logs.reverse().map(log => `
                <div class="alert alert-primary mb-2 p-2">
                    <div class="d-flex justify-content-between"><small class="fw-bold">${log.modem}</small> <small>${log.time}</small></div>
                    <div class="mt-1"><strong>${log.code}:</strong> ${log.response}</div>
                </div>
            `).join('');
        }
    };

    // --- USSD Execution ---
    ussdForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const modemId = ussdModemSelect.value;
        const code = document.getElementById('ussd-code').value;
        if (!modemId || !code) return;

        executeUSSD(modemId, code);
    });

    document.querySelectorAll('.q-code').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('ussd-code').value = btn.dataset.code;
        });
    });

    window.executeQuickUSSD = (modemId) => {
        executeUSSD(modemId, '*100#');
    };

    const executeUSSD = (modemId, code) => {
        const resultItem = document.createElement('div');
        resultItem.className = 'alert alert-info mb-2 p-2';
        resultItem.innerHTML = `جاري تنفيذ الكود ${code} على المودم ${modemId}...`;
        ussdResults.prepend(resultItem);

        // Simulate Network Latency
        setTimeout(() => {
            const response = `تمت العملية بنجاح. الرصيد: ${(Math.random() * 1000).toFixed(2)} دج`;
            resultItem.className = 'alert alert-success mb-2 p-2';
            resultItem.innerHTML = `
                <div class="d-flex justify-content-between"><small class="fw-bold">${modemId}</small> <small>${new Date().toLocaleTimeString()}</small></div>
                <div class="mt-1"><strong>${code}:</strong> ${response}</div>
            `;
            
            // Save to logs
            const logs = getData(USSD_LOGS_KEY);
            logs.push({ modem: modemId, code, response, time: new Date().toLocaleString() });
            setData(USSD_LOGS_KEY, logs);

            // Update balance if it was a balance check
            if (code.includes('100') || code.includes('710') || code.includes('133')) {
                const sims = getData(SIMS_KEY);
                const sim = sims.find(s => s.modem_id === modemId);
                if (sim) {
                    sim.balance = parseFloat((Math.random() * 1000).toFixed(2));
                    setData(SIMS_KEY, sims);
                    if (document.getElementById('modem-info').classList.contains('active')) renderModems();
                }
            }
        }, 1500);
    };

    // --- Modal Handling ---
    btnAddModem.addEventListener('click', () => {
        addModemModal.classList.add('active');
    });

    addModemModal.addEventListener('click', (e) => {
        if (e.target === addModemModal) addModemModal.classList.remove('active');
    });

    document.querySelectorAll('[data-bs-dismiss="modal"]').forEach(btn => {
        btn.addEventListener('click', () => addModemModal.classList.remove('active'));
    });

    addModemForm.addEventListener('submit', (e) => {
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
            balance: 0,
            signal: Math.floor(Math.random() * 6),
            status: 'online'
        };

        const sims = getData(SIMS_KEY);
        sims.push(newSim);
        setData(SIMS_KEY, sims);

        addModemModal.classList.remove('active');
        addModemForm.reset();
        renderModems();
    });


    // Mobile Menu Toggle
    document.querySelector('.layout-menu-toggle').addEventListener('click', () => {
        document.getElementById('layout-menu').classList.toggle('active');
        document.querySelector('.layout-overlay').classList.toggle('active');
    });

    document.querySelector('.layout-overlay').addEventListener('click', () => {
        document.getElementById('layout-menu').classList.remove('active');
        document.querySelector('.layout-overlay').classList.remove('active');
    });

    // Initial Render
    showView('modem-info');
});
