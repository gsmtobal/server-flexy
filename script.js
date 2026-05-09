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
    const closeSidebar = document.getElementById('close-sidebar');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const homeView = document.getElementById('home-view');
    const downloadVouchersView = document.getElementById('download-view');
    const flexyView = document.getElementById('flexy-view');
    const inventoryView = document.getElementById('inventory-view');
    const backBtns = document.querySelectorAll('.back-btn');

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
    let showView = (viewName) => {
        const views = document.querySelectorAll('.view');
        views.forEach(v => v.classList.remove('active'));
        
        const targetView = document.getElementById(`${viewName}-view`);
        if (targetView) {
            targetView.classList.add('active');
            if (viewName === 'inventory') renderInventory();
            if (viewName === 'idoom') renderIdoomVouchers();
            if (viewName === 'cards') renderCards();
        } else {
            homeView.classList.add('active');
        }
    };

    const toggleSidebar = () => {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
        document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
    };

    if (menuToggle) menuToggle.addEventListener('click', toggleSidebar);
    if (closeSidebar) closeSidebar.addEventListener('click', toggleSidebar);
    if (overlay) overlay.addEventListener('click', toggleSidebar);

    // Sidebar Links
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const text = item.textContent;
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            if (text.includes('تحميل القسائم')) showView('download');
            else if (text.includes('مخزون القسائم')) showView('inventory');
            else if (text.includes('الصفحة الرئيسية')) showView('home');
            else if (text.includes('تعبئة ادوم')) showView('idoom');
            else if (text.includes('البطاقات')) showView('cards');
            else if (text.includes('إدارة الشرائح')) showView('sim');
            else if (text.includes('كل العمليات')) showView('all-ops');
            else if (text.includes('نسب الارباح')) showView('profits');
            else if (text.includes('دليل الهاتف')) showView('phonebook');
            else if (text.includes('البحث عن القسائم')) showView('search');

            if (window.innerWidth < 1024) toggleSidebar();
        });
    });

    // Home Action Cards
    document.querySelector('.red-card')?.addEventListener('click', () => showView('flexy'));
    document.querySelector('.green-card')?.addEventListener('click', () => showView('idoom'));
    document.querySelector('.blue-card')?.addEventListener('click', () => showView('cards'));
    backBtns.forEach(btn => btn.addEventListener('click', () => showView('home')));

    // --- View Rendering Logic ---
    const renderAllViews = (viewName) => {
        if (viewName === 'sim') renderSIMs();
        if (viewName === 'all-ops') renderOperations();
        if (viewName === 'phonebook') renderPhonebook();
    };

    // --- SIM Management Rendering ---
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
                                <input type="text" value="${sim.name || 'شريحة جديدة'}" placeholder="اسم الشريحة" class="sim-name-input" style="background:none; border:none; color:white; font-weight:bold; font-size:1.1rem;">
                            </div>
                            <div class="sim-status">
                                <div class="signal-bars">
                                    <div class="bar bar-1 ${signal >= 1 ? 'active' : ''}"></div>
                                    <div class="bar bar-2 ${signal >= 2 ? 'active' : ''}"></div>
                                    <div class="bar bar-3 ${signal >= 3 ? 'active' : ''}"></div>
                                    <div class="bar bar-4 ${signal >= 4 ? 'active' : ''}"></div>
                                </div>
                                <span style="font-size:0.7rem; color:var(--text-secondary);">${sim.balance || '0.00'} دج</span>
                            </div>
                        </div>
                        
                        <div class="sim-settings-grid">
                            <div class="sim-input-group">
                                <label>كود PIN</label>
                                <input type="text" value="${sim.pin || '0000'}" class="sim-pin">
                            </div>
                            <div class="sim-input-group">
                                <label>كود عادي</label>
                                <input type="text" value="${sim.code_normal || '*611*'}" class="sim-normal">
                            </div>
                            <div class="sim-input-group">
                                <label>كود مفعل</label>
                                <input type="text" value="${sim.code_active || ''}" class="sim-active">
                            </div>
                            <div class="sim-input-group">
                                <label>كود فاتورة</label>
                                <input type="text" value="${sim.code_invoice || ''}" class="sim-invoice">
                            </div>
                        </div>
                        
                        <button class="save-sim-btn" onclick="saveSimSettings('${sim.id || sim.port}')">حفظ الإعدادات</button>
                    </div>
                `;
            }).join('') || '<p style="text-align:center; padding:20px;">لا توجد شرائح متصلة</p>';
        };

        if (typeof db_cloud !== 'undefined' && db_cloud) {
            db_cloud.collection('sim_status').onSnapshot((snapshot) => {
                if (snapshot.empty) {
                    showMockSIMs();
                } else {
                    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    renderItems(data);
                }
            }, (error) => {
                console.error("Firebase Error:", error);
                showMockSIMs();
            });
        } else {
            showMockSIMs();
        }

        function showMockSIMs() {
            renderItems([
                { id: 'mock1', port: 'COM3 (HiLink)', operator: 'Mobilis', balance: '1,500.00', signal: 4, name: 'الشريحة الأساسية', pin: '0000', code_normal: '*611*' },
                { id: 'mock2', port: 'COM5 (HiLink)', operator: 'Djezzy', balance: '850.00', signal: 3, name: 'شريحة الاحتياط', pin: '1234', code_normal: '*710*' }
            ]);
        }
    };

    window.saveSimSettings = async (id) => {
        const card = event.target.closest('.sim-card-box');
        const settings = {
            name: card.querySelector('.sim-name-input').value,
            pin: card.querySelector('.sim-pin').value,
            code_normal: card.querySelector('.sim-normal').value,
            code_active: card.querySelector('.sim-active').value,
            code_invoice: card.querySelector('.sim-invoice').value
        };

        if (typeof db_cloud !== 'undefined' && db_cloud) {
            await db_cloud.collection('sim_status').doc(id.replace(/[^a-zA-Z0-9]/g, '_')).update(settings);
            alert('تم حفظ إعدادات الشريحة بنجاح!');
        } else {
            alert('تم حفظ الإعدادات محلياً (وضع التجربة)');
        }
    };


    // --- Operations Rendering ---
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
                    <span>المبلغ: ${op.amount} دج | ${op.time}</span>
                </div>
                <div class="voucher-status ${op.status}">${op.status === 'success' ? 'ناجحة' : 'فاشلة'}</div>
            </div>
        `).join('');
    };

    // --- Phonebook Rendering ---
    const renderPhonebook = () => {
        const list = document.getElementById('contacts-list');
        if (!list) return;
        const mockContacts = [
            { name: 'أحمد محمد', phone: '0661000000' },
            { name: 'ياسين فليكسي', phone: '0550111111' }
        ];
        list.innerHTML = mockContacts.map(c => `
            <div class="voucher-card">
                <div class="voucher-info">
                    <strong>${c.name}</strong>
                    <span>رقم الهاتف: ${c.phone}</span>
                </div>
                <div class="voucher-status unused" style="cursor:pointer;" onclick="fillPhone('${c.phone}')">فليكسي</div>
            </div>
        `).join('');
    };

    window.fillPhone = (phone) => {
        showView('flexy');
        document.getElementById('phone-input').value = phone;
    };

    // --- Navigation Override ---
    const originalShowView = showView;
    showView = (viewName) => {
        originalShowView(viewName);
        renderAllViews(viewName);
    };

    // --- Inventory Rendering ---
    const renderInventory = () => {
        const list = document.getElementById('inventory-list');
        if (!list) return;
        const vouchers = getVouchers();
        list.innerHTML = vouchers.map(v => `
            <div class="voucher-card">
                <div class="voucher-info">
                    <strong>${v.type} - ${v.category}</strong>
                    <span>كود: ${v.code}</span>
                </div>
                <div class="voucher-status ${v.status}">${v.status === 'unused' ? 'غير مستخدم' : 'مستخدم'}</div>
            </div>
        `).join('') || '<p style="text-align:center; padding:20px;">المخزن فارغ</p>';
    };

    // --- Cards Rendering ---
    const renderCards = () => {
        const grid = document.getElementById('cards-grid');
        if (!grid) return;
        
        const vouchers = getVouchers().filter(v => v.status === 'unused');
        
        // Always show these providers
        const providers = [
            { type: 'Idoom', name: 'اتصالات الجزائر' },
            { type: 'Mobilis', name: 'موبيليس' },
            { type: 'Ooredoo', name: 'أوريدو' },
            { type: 'Djezzy', name: 'جيزي' }
        ];

        grid.innerHTML = providers.map(p => {
            // Count vouchers for this provider across all categories
            const count = vouchers.filter(v => v.type.toLowerCase() === p.type.toLowerCase()).length;
            
            return `
                <div class="card-item-box" onclick="showView('${p.type.toLowerCase() === 'idoom' ? 'idoom' : 'flexy'}')">
                    <div class="card-image-container">
                        <img src="${p.type.toLowerCase()}.png" onerror="this.src='https://via.placeholder.com/150x100/${getColorForType(p.type)}/ffffff?text=${p.type}'" class="card-img" alt="${p.type}">
                    </div>
                    <div class="card-item-info">
                        <h4 style="margin-top:10px;">${p.name}</h4>
                        <span style="color: ${count > 0 ? 'var(--accent-green)' : 'var(--accent-red)'}">
                            ${count > 0 ? 'متوفر: ' + count : 'نفذت الكمية'}
                        </span>
                    </div>
                </div>
            `;
        }).join('');
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

    // --- Idoom Rendering ---
    let selectedVoucherId = null;
    const renderIdoomVouchers = () => {
        const container = document.getElementById('available-idoom-vouchers');
        if (!container) return;
        
        const vouchers = getVouchers().filter(v => v.type === 'Idoom' && v.status === 'unused');
        
        if (vouchers.length === 0) {
            container.innerHTML = '<p style="grid-column: 1/-1; text-align:center; padding:10px; color:var(--accent-red);">لا توجد بطاقات Idoom متوفرة حالياً</p>';
            return;
        }

        container.innerHTML = vouchers.map(v => `
            <div class="voucher-select-item" data-id="${v.id}">
                <strong>${v.category}</strong>
                <span>كود: ${v.code.substring(0, 5)}*****</span>
            </div>
        `).join('');

        // Selection logic
        container.querySelectorAll('.voucher-select-item').forEach(item => {
            item.addEventListener('click', () => {
                container.querySelectorAll('.voucher-select-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                selectedVoucherId = item.dataset.id;
            });
        });
    };

    // --- Actions ---
    // Idoom Submit Action
    const submitIdoomBtn = document.getElementById('submit-idoom');
    const idoomStatusMsg = document.getElementById('idoom-status-msg');
    const idoomNumberInput = document.getElementById('idoom-number');

    if (submitIdoomBtn) {
        submitIdoomBtn.addEventListener('click', async () => {
            const idoomNumber = idoomNumberInput.value.trim();
            if (!idoomNumber) {
                alert('الرجاء إدخال رقم الهاتف أو الحساب');
                return;
            }
            if (!selectedVoucherId) {
                alert('الرجاء اختيار بطاقة من القائمة');
                return;
            }

            const vouchers = getVouchers();
            const voucher = vouchers.find(v => v.id === selectedVoucherId);

            // Real Automation Call
            submitIdoomBtn.disabled = true;
            submitIdoomBtn.innerText = 'جاري التشغيل...';
            idoomStatusMsg.classList.remove('hidden');
            idoomStatusMsg.innerText = 'جاري فتح نافذة الأتمتة... يرجى حل الكابتشا عند ظهورها.';

            try {
                const response = await fetch('http://localhost:3000/recharge-idoom', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        account: idoomNumber,
                        pin: voucher.code
                    })
                });

                const result = await response.json();

                if (result.success) {
                    // Update DB status to used
                    const index = vouchers.findIndex(v => v.id === selectedVoucherId);
                    if (index !== -1) {
                        vouchers[index].status = 'used';
                        saveVouchers(vouchers);
                    }

                    idoomStatusMsg.innerText = 'تمت العملية بنجاح! تم استخدام البطاقة.';
                    idoomStatusMsg.classList.add('purple');
                    alert('تمت عملية التعبئة بنجاح!');
                } else {
                    idoomStatusMsg.innerText = 'خطأ: ' + result.message;
                    alert('حدث خطأ في عملية الأتمتة: ' + result.message);
                }
            } catch (error) {
                console.error(error);
                idoomStatusMsg.innerText = 'فشل الاتصال بالخادم المحلي. تأكد من تشغيل automation_server.js';
                alert('تأكد من تشغيل خادم الأتمتة المحلي (Node.js)');
            } finally {
                submitIdoomBtn.disabled = false;
                submitIdoomBtn.innerText = 'ارسال';
                selectedVoucherId = null;
                renderIdoomVouchers();
            }
        });
    }

    // Download (Upload) Button Action
    const processDownloadBtn = document.getElementById('process-download');
    const voucherTypeSelect = document.getElementById('voucher-type');
    const voucherCategorySelect = document.getElementById('voucher-category');
    const voucherCodesTextarea = document.getElementById('voucher-codes');
    const vouchersStatusBox = document.getElementById('vouchers-status-box');

    if (processDownloadBtn) {
        processDownloadBtn.addEventListener('click', () => {
            const type = voucherTypeSelect.value;
            const category = voucherCategorySelect.value;
            const rawCodes = voucherCodesTextarea.value.trim();

            if (!rawCodes) {
                alert('الرجاء إدخال أكواد القسائم أولاً');
                return;
            }

            const codes = rawCodes.split('\n').map(c => c.trim()).filter(c => c.length > 0);
            const vouchers = getVouchers();
            
            let count = 0;
            codes.forEach(code => {
                // Basic validation: Check if code already exists or is valid
                if (code.length >= 10) { // Assuming min 10 digits
                    vouchers.push({
                        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                        type: type,
                        category: category,
                        code: code,
                        status: 'unused'
                    });
                    count++;
                }
            });

            if (count > 0) {
                saveVouchers(vouchers);
                voucherCodesTextarea.value = '';
                vouchersStatusBox.innerText = `تم تحميل ${count} قسيمة بنجاح!`;
                vouchersStatusBox.classList.add('purple');
                setTimeout(() => {
                    vouchersStatusBox.innerText = 'جاهز للتحميل';
                    vouchersStatusBox.classList.remove('purple');
                }, 3000);
                alert(`تم بنجاح إضافة ${count} قسيمة إلى المخزون`);
            } else {
                alert('لم يتم العثور على أكواد صالحة للتحميل');
            }
        });
    }

    // File Input Logic
    const voucherFileInput = document.getElementById('voucher-file-input');
    if (voucherFileInput && voucherCodesTextarea) {
        voucherFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                voucherCodesTextarea.value = event.target.result;
                vouchersStatusBox.innerText = 'تم قراءة الملف، يمكنك التحميل الآن';
            };
            reader.readAsText(file);
        });
    }

    // Flexy Phone Input
    const phoneInput = document.getElementById('phone-input');
    const phoneOptions = document.getElementById('phone-options');
    if (phoneInput) {
        phoneInput.addEventListener('input', () => {
            phoneOptions.classList.toggle('hidden', phoneInput.value.length === 0);
        });
    }

    // --- Flexy Cloud Logic ---
    const submitFlexyBtn = document.getElementById('submit-flexy');
    const flexyAmountInput = document.querySelector('.input-card-white input'); // Need to be more specific if possible
    
    if (submitFlexyBtn && typeof db_cloud !== 'undefined') {
        submitFlexyBtn.addEventListener('click', async () => {
            const amount = document.querySelector('.amount-input-wrapper input')?.value;
            const phone = document.getElementById('phone-input')?.value;
            const provider = document.querySelector('.mini-box.active')?.innerText || 'Unknown';

            if (!amount || !phone) {
                alert('الرجاء إدخال المبلغ ورقم الهاتف');
                return;
            }

            submitFlexyBtn.disabled = true;
            submitFlexyBtn.innerText = 'جاري الإرسال للسحابة...';

            try {
                const docRef = await db_cloud.collection('flexy_requests').add({
                    amount: amount,
                    phone: phone,
                    provider: provider,
                    status: 'pending',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                // Listen for changes (Success/Fail)
                db_cloud.collection('flexy_requests').doc(docRef.id).onSnapshot((doc) => {
                    const data = doc.data();
                    if (data.status === 'success') {
                        submitFlexyBtn.innerText = 'تم الإرسال بنجاح ✅';
                        submitFlexyBtn.style.background = 'var(--accent-blue)';
                        alert('تمت عملية الفليكسي بنجاح من الحاسوب البعيد!');
                        setTimeout(() => {
                            submitFlexyBtn.disabled = false;
                            submitFlexyBtn.innerText = 'ارسال';
                            submitFlexyBtn.style.background = '';
                        }, 3000);
                    } else if (data.status === 'failed') {
                        alert('فشلت العملية: ' + data.error);
                        submitFlexyBtn.disabled = false;
                        submitFlexyBtn.innerText = 'ارسال';
                    }
                });

            } catch (error) {
                console.error(error);
                alert('خطأ في الربط السحابي: ' + error.message);
                submitFlexyBtn.disabled = false;
                submitFlexyBtn.innerText = 'ارسال';
            }
        });
    }

    // Selection Toggles (Mini boxes / Type boxes)
    const setupSelection = (selector) => {
        document.querySelectorAll(selector).forEach(box => {
            box.addEventListener('click', () => {
                document.querySelectorAll(selector).forEach(b => b.classList.remove('active'));
                box.classList.add('active');
            });
        });
    };
    setupSelection('.mini-box');
    setupSelection('.type-box');

    // Vouchers Status Toggle (Purple logic - No longer used as previous toggle was removed)
});
