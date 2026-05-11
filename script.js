document.addEventListener('DOMContentLoaded', () => {
    // --- Firebase Configuration (Placeholder) ---
    const firebaseConfig = {
        apiKey: "YOUR_API_KEY",
        authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
        projectId: "YOUR_PROJECT_ID",
        storageBucket: "YOUR_PROJECT_ID.appspot.com",
        messagingSenderId: "YOUR_SENDER_ID",
        appId: "YOUR_APP_ID"
    };
    
    if (typeof firebase !== 'undefined') {
        firebase.initializeApp(firebaseConfig);
        var db_cloud = firebase.firestore();
    }

    // --- Selectors ---
    const menuToggle = document.getElementById('menu-toggle');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const closeSidebar = document.getElementById('close-sidebar');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const backBtns = document.querySelectorAll('.back-btn');
    const navItems = document.querySelectorAll('.nav-item, .bottom-nav-item, .action-card');

    // --- Local Database Logic ---
    const VOUCHERS_KEY = 'tobal_vouchers_db';
    const SIMS_KEY = 'tobal_sims_db';
    const USSD_LOGS_KEY = 'tobal_ussd_logs';
    
    const getData = (key) => JSON.parse(localStorage.getItem(key)) || [];
    const setData = (key, data) => localStorage.setItem(key, JSON.stringify(data));

    // Seed data if empty
    if (getData(SIMS_KEY).length === 0) {
        setData(SIMS_KEY, [
            { id: 'sim_01', modem_id: 'modem_01', phone_number: '0661223344', operator: 'Mobilis', balance: 1500.50, signal: 5, label: 'الرئيسية 1', pin: '0000', priority: 1, status: 'online' },
            { id: 'sim_02', modem_id: 'modem_02', phone_number: '0550112233', operator: 'Ooredoo', balance: 850.00, signal: 3, label: 'احتياطية', pin: '1234', priority: 2, status: 'online' },
            { id: 'sim_03', modem_id: 'modem_03', phone_number: '0770556677', operator: 'Djezzy', balance: 120.00, signal: 0, label: 'شريحة 3', pin: '0000', priority: 3, status: 'offline' }
        ]);
    }

    if (getData(USSD_LOGS_KEY).length === 0) {
        setData(USSD_LOGS_KEY, [
            { time: new Date().toLocaleString(), code: '*100#', response: 'Balance: 1500.50 DA. Valid until 2026-12-31.', modem: 'modem_01' }
        ]);
    }

    // --- Navigation & View Switching ---
    const showView = (viewId) => {
        const views = document.querySelectorAll('.view');
        views.forEach(v => v.classList.remove('active'));
        
        const targetView = document.getElementById(viewId);
        if (targetView) {
            targetView.classList.add('active');
            
            document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(item => {
                item.classList.toggle('active', item.dataset.view === viewId);
            });

            // Refresh specific views
            if (viewId === 'inventory-view') renderInventory();
            if (viewId === 'idoom-view') renderIdoomVouchers();
            if (viewId === 'cards-view') renderCards();
            if (viewId === 'sim-view') renderSIMs();
            if (viewId === 'sms-view') renderSMS();
            if (viewId === 'ussd-view') renderUSSD();
            if (viewId === 'all-ops-view') renderOperations();
            if (viewId === 'home-view') updateHomeStats();
        }
    };

    const toggleSidebar = () => {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
        document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
    };

    menuToggle?.addEventListener('click', toggleSidebar);
    mobileMenuBtn?.addEventListener('click', toggleSidebar);
    closeSidebar?.addEventListener('click', toggleSidebar);
    overlay?.addEventListener('click', toggleSidebar);

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const viewId = item.dataset.view;
            if (viewId) {
                e.preventDefault();
                showView(viewId);
                if (window.innerWidth < 1024 && sidebar.classList.contains('active')) toggleSidebar();
            }
        });
    });

    backBtns.forEach(btn => btn.addEventListener('click', () => showView('home-view')));

    // --- SIM Management Logic ---

    const renderSIMs = () => {
        const list = document.getElementById('sim-list');
        if (!list) return;

        const sims = getData(SIMS_KEY);
        const totalBalance = sims.reduce((acc, sim) => acc + (parseFloat(sim.balance) || 0), 0);
        const onlineCount = sims.filter(s => s.status === 'online').length;

        document.getElementById('total-sim-balance').textContent = `${totalBalance.toLocaleString()} دج`;
        document.getElementById('active-sim-count').textContent = `${onlineCount} / ${sims.length}`;

        list.innerHTML = sims.map(sim => `
            <div class="sim-card-v2 ${sim.status}">
                <span class="badge-operator" style="background: ${getOperatorColor(sim.operator)}">${sim.operator}</span>
                <div class="sim-header-row" style="border:none; padding:0;">
                    <div class="signal-bars">
                        ${[1, 2, 3, 4, 5].map(i => `<div class="bar ${i <= sim.signal ? 'active' : ''}"></div>`).join('')}
                    </div>
                    <span class="status-dot" style="color: ${sim.status === 'online' ? 'var(--success)' : 'var(--danger)'}">
                        <i class="fas fa-circle"></i> ${sim.status === 'online' ? 'متصل' : 'أوفلاين'}
                    </span>
                </div>
                
                <div class="sim-main-info">
                    <h4>${sim.label || 'بدون تسمية'}</h4>
                    <span class="number">${sim.phone_number}</span>
                    <div style="font-size: 0.7rem; color: var(--secondary); margin-top:4px;">ID: ${sim.modem_id}</div>
                </div>

                <div class="sim-balance-row">
                    <span class="label">الرصيد</span>
                    <span class="balance">${sim.balance.toLocaleString()} دج</span>
                </div>

                <div class="sim-footer-actions">
                    <button class="btn-icon-text btn-outline-primary" onclick="window.executeUSSD('${sim.modem_id}', '*100#')">
                        <i class="fas fa-sync"></i> تحديث
                    </button>
                    <button class="btn-icon-text btn-secondary" onclick="window.editSIM('${sim.id}')">
                        <i class="fas fa-cog"></i> إعدادات
                    </button>
                </div>
            </div>
        `).join('');
    };

    const getOperatorColor = (op) => {
        if (op === 'Mobilis') return '#22c55e';
        if (op === 'Djezzy') return '#1e293b';
        if (op === 'Ooredoo') return '#ef4444';
        return '#8592a3';
    };

    // --- SMS Management Logic ---

    const renderSMS = () => {
        const simList = document.getElementById('sms-sim-list');
        if (!simList) return;

        const sims = getData(SIMS_KEY).filter(s => s.status === 'online');
        simList.innerHTML = sims.map(sim => `
            <div class="mini-item" data-modem="${sim.modem_id}">
                <span class="name">${sim.label} (${sim.operator})</span>
                <span class="last-msg">انقر لعرض الرسائل...</span>
            </div>
        `).join('');

        simList.querySelectorAll('.mini-item').forEach(item => {
            item.addEventListener('click', () => {
                simList.querySelectorAll('.mini-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                loadMessages(item.dataset.modem);
            });
        });
    };

    const loadMessages = (modemId) => {
        const area = document.getElementById('sms-messages');
        area.innerHTML = `
            <div class="message-bubble received">مرحباً بك في نظام Tobal Gsm.</div>
            <div class="message-bubble received">رصيدك الحالي هو 1500 دج.</div>
            <div class="message-bubble sent">شكراً لكم.</div>
        `;
    };

    // --- USSD Logic ---

    const renderUSSD = () => {
        const select = document.getElementById('ussd-sim-select');
        const logs = document.getElementById('ussd-logs');
        if (!select || !logs) return;

        const sims = getData(SIMS_KEY).filter(s => s.status === 'online');
        select.innerHTML = sims.map(s => `<option value="${s.modem_id}">${s.label} (${s.phone_number})</option>`).join('');

        const history = getData(USSD_LOGS_KEY);
        logs.innerHTML = history.reverse().map(log => `
            <div class="log-item">
                <span class="time">${log.time} | Modem: ${log.modem}</span>
                <span class="code">Command: ${log.code}</span>
                <div class="response">${log.response}</div>
            </div>
        `).join('');
    };

    window.executeUSSD = (modemId, code) => {
        alert(`جاري تنفيذ الكود ${code} على المودم ${modemId}...`);
        // Simulate response
        const newLog = {
            time: new Date().toLocaleString(),
            code: code,
            response: "تم تنفيذ العملية بنجاح. الرصيد المتبقي: " + (Math.random() * 1000).toFixed(2) + " دج",
            modem: modemId
        };
        const logs = getData(USSD_LOGS_KEY);
        logs.push(newLog);
        setData(USSD_LOGS_KEY, logs);
        if (document.getElementById('ussd-view').classList.contains('active')) renderUSSD();
        renderSIMs();
    };

    // --- Modal Handling ---

    const addSimModal = document.getElementById('add-sim-modal');
    const openAddSimBtn = document.getElementById('open-add-sim-modal');
    const closeModalBtns = document.querySelectorAll('.close-modal');

    openAddSimBtn?.addEventListener('click', () => addSimModal.classList.add('active'));
    closeModalBtns.forEach(btn => btn.addEventListener('click', () => addSimModal.classList.remove('active')));

    document.getElementById('add-sim-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const newSim = {
            id: 'sim_' + Date.now(),
            modem_id: formData.get('modem_id'),
            phone_number: formData.get('phone_number'),
            operator: formData.get('operator'),
            balance: 0,
            signal: Math.floor(Math.random() * 6),
            label: formData.get('label'),
            pin: formData.get('pin'),
            priority: formData.get('priority'),
            status: 'online'
        };

        const sims = getData(SIMS_KEY);
        sims.push(newSim);
        setData(SIMS_KEY, sims);
        
        addSimModal.classList.remove('active');
        e.target.reset();
        renderSIMs();
    });

    // --- General Dashboard Logic ---

    const updateHomeStats = () => {
        const sims = getData(SIMS_KEY);
        const total = sims.reduce((acc, sim) => acc + sim.balance, 0);
        const mainBalEl = document.getElementById('main-balance');
        if (mainBalEl) mainBalEl.textContent = `${total.toLocaleString()} دج`;
    };

    const renderInventory = () => {
        const list = document.getElementById('inventory-list');
        if (!list) return;
        const vouchers = getData(VOUCHERS_KEY);
        list.innerHTML = vouchers.map(v => `
            <div class="voucher-card">
                <div class="voucher-info">
                    <strong>${v.type} - ${v.category}</strong>
                    <div style="font-size: 0.8rem; color: var(--secondary);">كود: ${v.code}</div>
                </div>
                <div class="voucher-status ${v.status}">${v.status === 'unused' ? 'غير مستخدم' : 'مستخدم'}</div>
            </div>
        `).join('') || '<p style="text-align:center; padding:20px;">المخزن فارغ</p>';
    };

    const renderCards = () => {
        const grid = document.getElementById('cards-grid');
        if (!grid) return;
        const vouchers = getData(VOUCHERS_KEY).filter(v => v.status === 'unused');
        const providers = [
            { type: 'Idoom', name: 'اتصالات الجزائر', color: '3b82f6' },
            { type: 'Mobilis', name: 'موبيليس', color: '22c55e' },
            { type: 'Ooredoo', name: 'أوريدو', color: 'ef4444' },
            { type: 'Djezzy', name: 'جيزي', color: '1e293b' }
        ];

        grid.innerHTML = providers.map(p => {
            const count = vouchers.filter(v => v.type.toLowerCase() === p.type.toLowerCase()).length;
            return `
                <div class="card-item-box" data-view="${p.type.toLowerCase() === 'idoom' ? 'idoom-view' : 'flexy-view'}">
                    <div class="card-image-container">
                        <img src="https://via.placeholder.com/150x100/${p.color}/ffffff?text=${p.type}" class="card-img" alt="${p.type}">
                    </div>
                    <div class="card-item-info">
                        <h4>${p.name}</h4>
                        <span style="color: ${count > 0 ? 'var(--success)' : 'var(--danger)'}">
                            ${count > 0 ? 'متوفر: ' + count : 'نفذت الكمية'}
                        </span>
                    </div>
                </div>
            `;
        }).join('');

        grid.querySelectorAll('.card-item-box').forEach(card => {
            card.addEventListener('click', () => showView(card.dataset.view));
        });
    };

    const renderIdoomVouchers = () => {
        const container = document.getElementById('available-idoom-vouchers');
        if (!container) return;
        const vouchers = getData(VOUCHERS_KEY).filter(v => v.type === 'Idoom' && v.status === 'unused');
        
        if (vouchers.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:10px; color:var(--danger);">لا توجد بطاقات متوفرة</p>';
            return;
        }

        container.innerHTML = vouchers.map(v => `
            <div class="voucher-select-item" data-id="${v.id}">
                <strong>${v.category}</strong>
                <span style="font-size: 0.7rem;">كود: ${v.code.substring(0, 5)}*****</span>
            </div>
        `).join('');

        container.querySelectorAll('.voucher-select-item').forEach(item => {
            item.addEventListener('click', () => {
                container.querySelectorAll('.voucher-select-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                window.selectedVoucherId = item.dataset.id;
            });
        });
    };

    const renderOperations = () => {
        const list = document.getElementById('ops-list');
        if (!list) return;
        const mockOps = [
            { type: 'Flexy', phone: '0661223344', amount: '200', status: 'success', time: '10:30 AM' },
            { type: 'Idoom', phone: '023445566', amount: '1000', status: 'success', time: '09:15 AM' },
            { type: 'Flexy', phone: '0550112233', amount: '500', status: 'failed', time: '08:00 AM' }
        ];
        list.innerHTML = mockOps.map(op => `
            <div class="voucher-card">
                <div class="voucher-info">
                    <strong>${op.type} - ${op.phone}</strong>
                    <div style="font-size: 0.8rem; color: var(--secondary);">${op.amount} دج | ${op.time}</div>
                </div>
                <div class="voucher-status ${op.status}">${op.status === 'success' ? 'ناجحة' : 'فاشلة'}</div>
            </div>
        `).join('');
    };

    // Initial View
    showView('home-view');
});

