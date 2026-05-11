document.addEventListener('DOMContentLoaded', () => {
    // --- Firebase Configuration ---
    const firebaseConfig = {
        apiKey: "YOUR_API_KEY",
        authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
        projectId: "YOUR_PROJECT_ID",
        storageBucket: "YOUR_PROJECT_ID.appspot.com",
        messagingSenderId: "YOUR_SENDER_ID",
        appId: "YOUR_APP_ID"
    };
    
    // Initialize Firebase
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

    // --- Local Database Logic (LocalStorage) ---
    const DB_KEY = 'tobal_vouchers_db';
    
    const getVouchers = () => JSON.parse(localStorage.getItem(DB_KEY)) || [];
    const saveVouchers = (data) => localStorage.setItem(DB_KEY, JSON.stringify(data));

    // Seed mock data if empty
    if (getVouchers().length === 0) {
        saveVouchers([
            { id: '1', type: 'Idoom', category: '1000 DA', code: '123456789012345', status: 'unused' },
            { id: '2', type: 'Mobilis', category: '2000 DA', code: '987654321098765', status: 'used' },
            { id: '3', type: 'Ooredoo', category: '500 DA', code: '555566667777888', status: 'unused' }
        ]);
    }

    // --- Navigation & View Switching ---
    const showView = (viewId) => {
        const views = document.querySelectorAll('.view');
        views.forEach(v => v.classList.remove('active'));
        
        const targetView = document.getElementById(viewId);
        if (targetView) {
            targetView.classList.add('active');
            
            // Sync nav active states
            document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(item => {
                if (item.dataset.view === viewId) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });

            // Specific view logic
            if (viewId === 'inventory-view') renderInventory();
            if (viewId === 'idoom-view') renderIdoomVouchers();
            if (viewId === 'cards-view') renderCards();
            if (viewId === 'sim-view') renderSIMs();
            if (viewId === 'all-ops-view') renderOperations();
            if (viewId === 'phonebook-view') renderPhonebook();
        }
    };

    const toggleSidebar = () => {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
        document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
    };

    if (menuToggle) menuToggle.addEventListener('click', toggleSidebar);
    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', toggleSidebar);
    if (closeSidebar) closeSidebar.addEventListener('click', toggleSidebar);
    if (overlay) overlay.addEventListener('click', toggleSidebar);

    // Nav Item Click Logic
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const viewId = item.dataset.view;
            if (viewId) {
                e.preventDefault();
                showView(viewId);
                if (window.innerWidth < 1024 && sidebar.classList.contains('active')) {
                    toggleSidebar();
                }
            }
        });
    });

    backBtns.forEach(btn => btn.addEventListener('click', () => showView('home-view')));

    // --- View Rendering Logic ---

    // SIM Management
    const renderSIMs = () => {
        const list = document.getElementById('sim-list');
        if (!list) return;

        const renderItems = (data) => {
            list.innerHTML = data.map(sim => {
                const signal = sim.signal || 0;
                return `
                    <div class="sim-card-box">
                        <div class="sim-header-row">
                            <div class="sim-info">
                                <span class="operator">${sim.operator || 'Unknown'}</span>
                                <h4>${sim.name || 'شريحة جديدة'}</h4>
                            </div>
                            <div class="sim-status">
                                <span class="balance">${sim.balance || '0.00'} دج</span>
                            </div>
                        </div>
                        
                        <div class="sim-settings-grid">
                            <div class="sim-input-group"><label>كود PIN</label><input type="text" value="${sim.pin || '0000'}"></div>
                            <div class="sim-input-group"><label>كود عادي</label><input type="text" value="${sim.code_normal || '*611*'}"></div>
                        </div>
                        <button class="submit-btn" style="padding: 8px; font-size: 0.8rem;">حفظ الإعدادات</button>
                    </div>
                `;
            }).join('') || '<p style="text-align:center; padding:20px;">لا توجد شرائح متصلة</p>';
        };

        renderItems([
            { id: 'mock1', operator: 'Mobilis', balance: '1,500.00', signal: 4, name: 'الشريحة الأساسية', pin: '0000', code_normal: '*611*' },
            { id: 'mock2', operator: 'Djezzy', balance: '850.00', signal: 3, name: 'شريحة الاحتياط', pin: '1234', code_normal: '*710*' }
        ]);
    };

    // Operations
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

    // Inventory
    const renderInventory = () => {
        const list = document.getElementById('inventory-list');
        if (!list) return;
        const vouchers = getVouchers();
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

    // Cards
    const renderCards = () => {
        const grid = document.getElementById('cards-grid');
        if (!grid) return;
        const vouchers = getVouchers().filter(v => v.status === 'unused');
        const providers = [
            { type: 'Idoom', name: 'اتصالات الجزائر' },
            { type: 'Mobilis', name: 'موبيليس' },
            { type: 'Ooredoo', name: 'أوريدو' },
            { type: 'Djezzy', name: 'جيزي' }
        ];

        grid.innerHTML = providers.map(p => {
            const count = vouchers.filter(v => v.type.toLowerCase() === p.type.toLowerCase()).length;
            return `
                <div class="card-item-box" data-view="${p.type.toLowerCase() === 'idoom' ? 'idoom-view' : 'flexy-view'}">
                    <div class="card-image-container">
                        <img src="https://via.placeholder.com/150x100/${getColorForType(p.type)}/ffffff?text=${p.type}" class="card-img" alt="${p.type}">
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

        // Re-attach listeners for cards
        grid.querySelectorAll('.card-item-box').forEach(card => {
            card.addEventListener('click', () => showView(card.dataset.view));
        });
    };

    const getColorForType = (type) => {
        switch(type.toLowerCase()) {
            case 'idoom': return '3b82f6';
            case 'mobilis': return '22c55e';
            case 'ooredoo': return 'ef4444';
            case 'djezzy': return '1e293b';
            default: return '64748b';
        }
    };

    // Idoom Vouchers Selection
    let selectedVoucherId = null;
    const renderIdoomVouchers = () => {
        const container = document.getElementById('available-idoom-vouchers');
        if (!container) return;
        const vouchers = getVouchers().filter(v => v.type === 'Idoom' && v.status === 'unused');
        
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
                selectedVoucherId = item.dataset.id;
            });
        });
    };

    // --- Actions ---

    // Flexy Action
    const submitFlexyBtn = document.getElementById('submit-flexy');
    if (submitFlexyBtn) {
        submitFlexyBtn.addEventListener('click', () => {
            const phone = document.getElementById('phone-input').value;
            const amount = document.getElementById('flexy-amount').value;
            if (!phone || !amount) {
                alert('الرجاء إدخال الرقم والمبلغ');
                return;
            }
            alert(`تم إرسال طلب فليكسي للرقم ${phone} بمبلغ ${amount} دج`);
        });
    }

    // Idoom Action
    const submitIdoomBtn = document.getElementById('submit-idoom');
    if (submitIdoomBtn) {
        submitIdoomBtn.addEventListener('click', () => {
            const number = document.getElementById('idoom-number').value;
            if (!number || !selectedVoucherId) {
                alert('الرجاء إدخال الرقم واختيار بطاقة');
                return;
            }
            alert(`تم إرسال طلب تعبئة ايدوم للرقم ${number}`);
        });
    }

    // Phonebook (Mock for now)
    const renderPhonebook = () => {
        const list = document.getElementById('phonebook-view').querySelector('.inventory-grid');
        if (!list) return;
        list.innerHTML = `
            <div class="voucher-card">
                <div class="voucher-info"><strong>أحمد محمد</strong><div>0661000000</div></div>
                <button class="submit-btn" style="padding: 5px 10px;">اختيار</button>
            </div>
        `;
    };

    // Selection Toggles
    const setupSelection = (selector) => {
        document.querySelectorAll(selector).forEach(box => {
            box.addEventListener('click', () => {
                document.querySelectorAll(selector).forEach(b => b.classList.remove('active'));
                box.classList.add('active');
            });
        });
    };
    setupSelection('.type-box');

    // Initial View
    showView('home-view');
});
