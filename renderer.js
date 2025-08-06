// renderer.js

document.addEventListener('DOMContentLoaded', () => {
    // --- Constants ---
    const TASK_STATUS = {
        NEW: 'جديد',
        IN_PROGRESS: 'قيد التنفيذ',
        COMPLETED: 'مكتمل',
        PAID: 'مدفوع',
    };
    const TASK_TYPES = ['بحث', 'عرض تقديمي', 'واجب منزلي', 'اختبار', 'مشروع', 'أخرى'];

    // --- State Management ---
    let appData = {
        clients: [],
        tasks: [],
        lastClientId: 0,
        lastTaskId: 0,
    };

    let uiState = {
        taskSearchTerm: '',
        taskStatusFilter: 'all',
        taskSort: { field: 'deadline', direction: 'asc' },
        debtorSearchTerm: '',
        debtorSort: { field: 'completionDate', direction: 'desc' },
    };

    // --- DOM Elements ---
    const pages = document.querySelectorAll('.page');
    const navLinks = document.querySelectorAll('.nav-item');
    
    // Task Modal
    const addTaskBtn = document.getElementById('add-task-btn');
    const taskModal = document.getElementById('add-task-modal');
    const closeTaskModalBtn = taskModal.querySelector('.close-modal');
    const addTaskForm = document.getElementById('add-task-form');
    let addTaskClientChoices = null; // Choices.js instance for the add task modal

    // Client Modal
    const manageClientsBtn = document.getElementById('manage-clients-btn');
    const clientModal = document.getElementById('manage-clients-modal');
    const closeClientModalBtn = clientModal.querySelector('.close-modal');
    const addClientForm = document.getElementById('add-client-form');
    const clientsManagementTableBody = document.getElementById('clients-management-table-body');
    const importClientsBtn = document.getElementById('import-clients-btn');
    const exportClientsBtn = document.getElementById('export-clients-btn');

    // Tables
    const tasksTableBody = document.getElementById('tasks-table-body');
    const recentTasksTableBody = document.getElementById('recent-tasks-table-body');
    const debtorsTableBody = document.getElementById('debtors-table-body');
    let taskTableRowChoicesInstances = new Map(); // Use Map for easier lookup: taskId -> choicesInstance

    // Filtering & Sorting Elements
    const taskSearchInput = document.getElementById('task-search-input');
    const filterButtonContainer = document.querySelector('#tasks .filter-buttons');
    const debtorSearchInput = document.getElementById('debtor-search-input');
    const taskTableHeaders = document.querySelectorAll('#tasks thead th[data-sort]');
    const debtorTableHeaders = document.querySelectorAll('#debtors thead th[data-sort]');


    // --- Navigation ---
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const pageId = link.getAttribute('data-page');
            const targetPage = document.getElementById(pageId);
            if (targetPage) {
                pages.forEach(page => page.classList.remove('active'));
                targetPage.classList.add('active');
            }
            navLinks.forEach(nav => nav.classList.remove('active'));
            link.classList.add('active');
        });
    });

    // --- Modal Logic ---
    function openModal(modal) {
        modal.style.display = 'block';
    }
    
    function closeModal(modal) {
        modal.style.display = 'none';
        if (modal === taskModal && addTaskClientChoices) {
            addTaskClientChoices.destroy();
            addTaskClientChoices = null;
        }
    }

    if (addTaskBtn) addTaskBtn.addEventListener('click', () => {
        addTaskForm.reset();
        document.getElementById('task-prepaid').value = 0;
        populateClientsDropdown();
        openModal(taskModal);
    });

    if (manageClientsBtn) manageClientsBtn.addEventListener('click', () => {
        populateCountryCodes();
        renderClientsManagementTable();
        openModal(clientModal);
    });

    if (closeTaskModalBtn) closeTaskModalBtn.addEventListener('click', () => closeModal(taskModal));
    if (closeClientModalBtn) closeClientModalBtn.addEventListener('click', () => closeModal(clientModal));
    
    window.addEventListener('click', (e) => {
        if (e.target === taskModal) closeModal(taskModal);
        if (e.target === clientModal) closeModal(clientModal);
    });

    // --- Data Persistence ---
    async function loadData() {
        try {
            appData = await window.api.readData();
        } catch (error) {
            console.error('Error reading data:', error);
            alert('حدث خطأ أثناء تحميل البيانات. يرجى التحقق من وحدة التحكم للمزيد من التفاصيل.');
            return;
        }
        // Initialize state for robustness
        appData.clients = appData.clients || [];
        appData.tasks = appData.tasks || [];
        appData.lastClientId = appData.lastClientId || (appData.clients.length > 0 ? Math.max(...appData.clients.map(c => c.id)) : 0);
        appData.lastTaskId = appData.lastTaskId || (appData.tasks.length > 0 ? Math.max(...appData.tasks.map(t => t.id)) : 0);
        let updated = false;
        appData.tasks.forEach(task => {
            const client = appData.clients.find(c => c.id === task.clientId);
            const clientName = client ? client.name : (task.clientName || '');
            if (task.clientName !== clientName) {
                task.clientName = clientName;
                updated = true;
            }
        });
        if (updated) await saveData();
        renderAll();
    }

    async function saveData() {
        try {
            await window.api.writeData(appData);
        } catch (error) {
            console.error('Error writing data:', error);
            alert('حدث خطأ أثناء حفظ البيانات. يرجى التحقق من وحدة التحكم للمزيد من التفاصيل.');
        }
    }

    // --- Global Rendering ---
    function renderAll() {
        renderDashboard();
        renderTasksTable();
        renderClientsList();
        renderDebtorsTable();
    }
    
    // --- Rendering Functions ---

    function renderDashboard() {
        const isToday = (someDateStr) => {
            if (!someDateStr) return false;
            const today = new Date();
            const date = new Date(someDateStr);
            return date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
        };

        const paidTasks = appData.tasks.filter(t => t.status === TASK_STATUS.PAID);
        const completedOrPaidTasks = appData.tasks.filter(t => t.status === TASK_STATUS.COMPLETED || t.status === TASK_STATUS.PAID);
        const debtTasks = appData.tasks.filter(t => t.status === TASK_STATUS.COMPLETED);

        const totalRevenue = paidTasks.reduce((sum, t) => sum + (t.price || 0), 0);
        const tasksInProgress = appData.tasks.filter(t => t.status === TASK_STATUS.IN_PROGRESS).length;
        const totalDebt = debtTasks.reduce((sum, t) => sum + Math.max(0, (t.price || 0) - (t.prepaid || 0)), 0);
        const dailyIncome = paidTasks.filter(t => isToday(t.lastStatusUpdate)).reduce((sum, t) => sum + (t.price || 0), 0);
        
        document.getElementById('total-revenue').textContent = `${totalRevenue.toFixed(2)} ر.س`;
        document.getElementById('tasks-in-progress').textContent = tasksInProgress;
        document.getElementById('tasks-completed').textContent = completedOrPaidTasks.length;
        document.getElementById('pending-payments').textContent = debtTasks.length;
        document.getElementById('total-debt').textContent = `${totalDebt.toFixed(2)} ر.س`;
        document.getElementById('daily-income').textContent = `${dailyIncome.toFixed(2)} ر.س`;

        renderRecentTasks();
    }

    function renderRecentTasks() {
        if(!recentTasksTableBody) return;
        recentTasksTableBody.innerHTML = '';
        const recentTasks = [...appData.tasks].sort((a, b) => b.id - a.id).slice(0, 5);
        if (recentTasks.length === 0) {
            recentTasksTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px;">لا توجد مهام حديثة.</td></tr>`;
            return;
        }
        recentTasks.forEach(task => {
            const client = appData.clients.find(c => c.id === task.clientId);
            const deadline = new Date(task.deadline);
            const formattedDeadline = `${deadline.toLocaleDateString('ar-EG')} - ${deadline.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`;
            const tr = document.createElement('tr');

            const titleTd = document.createElement('td');
            titleTd.textContent = task.title;
            tr.appendChild(titleTd);

            const clientTd = document.createElement('td');
            clientTd.textContent = client ? client.name : (task.clientName || 'عميل محذوف');
            tr.appendChild(clientTd);

            const priceTd = document.createElement('td');
            priceTd.textContent = `${(task.price || 0).toFixed(2)} ر.س`;
            tr.appendChild(priceTd);

            const deadlineTd = document.createElement('td');
            deadlineTd.textContent = formattedDeadline;
            tr.appendChild(deadlineTd);

            const statusTd = document.createElement('td');
            const statusSpan = document.createElement('span');
            statusSpan.className = 'status-badge';
            statusSpan.textContent = task.status;
            statusTd.appendChild(statusSpan);
            tr.appendChild(statusTd);

            recentTasksTableBody.appendChild(tr);
        });
    }

    function renderTasksTable() {
        if(!tasksTableBody) return;
        taskTableRowChoicesInstances.forEach(instance => instance.destroy());
        taskTableRowChoicesInstances.clear();
        tasksTableBody.innerHTML = '';

        let displayTasks = [...appData.tasks];
        // Filter by status
        if (uiState.taskStatusFilter !== 'all') {
            displayTasks = displayTasks.filter(task => task.status === uiState.taskStatusFilter);
        }
        // Filter by search term
        if (uiState.taskSearchTerm) {
            const searchTerm = uiState.taskSearchTerm.toLowerCase().trim();
            displayTasks = displayTasks.filter(task => {
                const client = appData.clients.find(c => c.id === task.clientId);
                const name = client ? client.name : task.clientName;
                return task.title.toLowerCase().includes(searchTerm) || (name && name.toLowerCase().includes(searchTerm));
            });
        }
        // Sort
        displayTasks.sort((a, b) => {
            const valA = getTaskSortValue(a, uiState.taskSort.field);
            const valB = getTaskSortValue(b, uiState.taskSort.field);
            if (valA < valB) return uiState.taskSort.direction === 'asc' ? -1 : 1;
            if (valA > valB) return uiState.taskSort.direction === 'asc' ? 1 : -1;
            return 0;
        });

        if (displayTasks.length === 0) {
            tasksTableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 20px;">لا توجد مهام تطابق البحث أو الفلترة.</td></tr>`;
            return;
        }

        displayTasks.forEach(task => {
            const tr = createTaskRow(task);
            tasksTableBody.appendChild(tr);
        });
        updateSortIcons('tasks', uiState.taskSort);
    }
    
    function createTaskRow(task) {
        const tr = document.createElement('tr');
        tr.dataset.taskId = task.id;

        const remaining = (task.price || 0) - (task.prepaid || 0);
        const deadlineDate = new Date(task.deadline);
        const localDeadline = new Date(deadlineDate.getTime() - (deadlineDate.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);

        // Title
        const titleTd = document.createElement('td');
        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.className = 'editable-input';
        titleInput.value = task.title;
        titleInput.dataset.field = 'title';
        titleTd.appendChild(titleInput);
        tr.appendChild(titleTd);

        // Client select
        const clientTd = document.createElement('td');
        const clientSelect = document.createElement('select');
        clientSelect.className = 'editable-select client-select';
        clientSelect.dataset.field = 'clientId';
        appData.clients.forEach(c => {
            const option = document.createElement('option');
            option.value = c.id;
            option.textContent = `${c.name} (${c.phone})`;
            if (c.id === task.clientId) option.selected = true;
            clientSelect.appendChild(option);
        });
        if (!appData.clients.some(c => c.id === task.clientId) && task.clientName) {
            const option = document.createElement('option');
            option.value = task.clientId;
            option.textContent = `${task.clientName} (محذوف)`;
            option.selected = true;
            clientSelect.appendChild(option);
        }
        clientTd.appendChild(clientSelect);
        tr.appendChild(clientTd);

        // Type select
        const typeTd = document.createElement('td');
        const typeSelect = document.createElement('select');
        typeSelect.className = 'editable-select';
        typeSelect.dataset.field = 'type';
        TASK_TYPES.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            if (task.type === type) option.selected = true;
            typeSelect.appendChild(option);
        });
        typeTd.appendChild(typeSelect);
        tr.appendChild(typeTd);

        // Price input
        const priceTd = document.createElement('td');
        const priceInput = document.createElement('input');
        priceInput.type = 'number';
        priceInput.step = '0.01';
        priceInput.className = 'editable-input price-input';
        priceInput.value = task.price || 0;
        priceInput.dataset.field = 'price';
        priceTd.appendChild(priceInput);
        tr.appendChild(priceTd);

        // Prepaid input
        const prepaidTd = document.createElement('td');
        const prepaidInput = document.createElement('input');
        prepaidInput.type = 'number';
        prepaidInput.step = '0.01';
        prepaidInput.className = 'editable-input prepaid-input';
        prepaidInput.value = task.prepaid || 0;
        prepaidInput.dataset.field = 'prepaid';
        prepaidTd.appendChild(prepaidInput);
        tr.appendChild(prepaidTd);

        // Remaining
        const remainingTd = document.createElement('td');
        remainingTd.className = 'remaining-cell';
        remainingTd.textContent = `${remaining.toFixed(2)} ر.س`;
        tr.appendChild(remainingTd);

        // Deadline input
        const deadlineTd = document.createElement('td');
        const deadlineInput = document.createElement('input');
        deadlineInput.type = 'datetime-local';
        deadlineInput.className = 'editable-input';
        deadlineInput.value = localDeadline;
        deadlineInput.dataset.field = 'deadline';
        deadlineTd.appendChild(deadlineInput);
        tr.appendChild(deadlineTd);

        // Status select
        const statusTd = document.createElement('td');
        const statusSelect = document.createElement('select');
        statusSelect.className = 'editable-select';
        statusSelect.dataset.field = 'status';
        Object.values(TASK_STATUS).forEach(status => {
            const option = document.createElement('option');
            option.value = status;
            option.textContent = status;
            if (task.status === status) option.selected = true;
            statusSelect.appendChild(option);
        });
        statusTd.appendChild(statusSelect);
        tr.appendChild(statusTd);

        // Delete button
        const actionTd = document.createElement('td');
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-delete';
        deleteBtn.dataset.type = 'task';
        deleteBtn.title = 'حذف المهمة';
        const deleteIcon = document.createElement('i');
        deleteIcon.className = 'fas fa-trash-alt';
        deleteBtn.appendChild(deleteIcon);
        actionTd.appendChild(deleteBtn);
        tr.appendChild(actionTd);

        if (clientSelect) {
            const choicesInstance = new Choices(clientSelect, { searchEnabled: true, itemSelectText: '', noResultsText: 'لا توجد نتائج' });
            taskTableRowChoicesInstances.set(task.id, choicesInstance);
        }
        return tr;
    }

    function updateTaskRow(task) {
        const tr = tasksTableBody.querySelector(`tr[data-task-id="${task.id}"]`);
        if (!tr) return;
        const remaining = (task.price || 0) - (task.prepaid || 0);
        const remainingCell = tr.querySelector('.remaining-cell');
        if (remainingCell) remainingCell.textContent = `${remaining.toFixed(2)} ر.س`;
    }

    function removeTaskRow(taskId) {
        const tr = tasksTableBody.querySelector(`tr[data-task-id="${taskId}"]`);
        if (tr) tr.remove();
        if (taskTableRowChoicesInstances.has(taskId)) {
            taskTableRowChoicesInstances.get(taskId).destroy();
            taskTableRowChoicesInstances.delete(taskId);
        }
    }

    function renderClientsList() {
        const clientsList = document.getElementById('clients-list');
        if(!clientsList) return;
        clientsList.innerHTML = '';
        if (appData.clients.length === 0) {
            clientsList.innerHTML = '<p>لا يوجد عملاء. قم بإضافتهم من قسم إدارة العملاء.</p>';
            return;
        }
        [...appData.clients].sort((a,b) => b.id - a.id).forEach(client => {
            const card = document.createElement('div');
            card.className = 'client-card';
            card.innerHTML = `<h4><i class="fas fa-user"></i> ${escapeHtml(client.name)}</h4><div class="client-detail"><i class="fab fa-whatsapp"></i> رقم الهاتف: <span>${escapeHtml(client.phone)}</span></div>`;
            clientsList.appendChild(card);
        });
    }

    function renderDebtorsTable() {
        if(!debtorsTableBody) return;
        let displayDebtors = appData.tasks
            .filter(task => task.status === TASK_STATUS.COMPLETED)
            .map(task => {
                const client = appData.clients.find(c => c.id === task.clientId);
                if (!client) return null;
                const remaining = (task.price || 0) - (task.prepaid || 0);
                if (remaining <= 0) return null;
                return { clientName: client.name, clientPhone: client.phone, remaining, taskTitle: task.title, completionDate: task.lastStatusUpdate };
            }).filter(Boolean);

        if (uiState.debtorSearchTerm) {
            const searchTerm = uiState.debtorSearchTerm.toLowerCase().trim();
            displayDebtors = displayDebtors.filter(d =>
                d.clientName.toLowerCase().includes(searchTerm) ||
                d.clientPhone.includes(searchTerm) ||
                d.taskTitle.toLowerCase().includes(searchTerm)
            );
        }

        const { field, direction } = uiState.debtorSort;
        displayDebtors.sort((a, b) => {
            const valA = a[field]; const valB = b[field];
            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        });

        debtorsTableBody.innerHTML = '';
        if (displayDebtors.length === 0) {
            debtorsTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px;">لا يوجد مدينين يطابقون البحث.</td></tr>`;
            return;
        }

        displayDebtors.forEach(debtor => {
            const completionDateFormatted = debtor.completionDate ? new Date(debtor.completionDate).toLocaleDateString('ar-EG') : 'غير محدد';
            const plainTextMessage = `السلام عليكم،\nبخصوص مهمة: "${debtor.taskTitle}"\nالمبلغ المتبقي: ${debtor.remaining.toFixed(2)} ر.س\n\nيرجى تأكيد عملية الدفع.\nشكراً لك.`;
            const message = encodeURIComponent(plainTextMessage);
            const whatsappNumber = debtor.clientPhone.replace(/[^0-9]/g, '');
            const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${message}`;

            const tr = document.createElement('tr');

            const nameTd = document.createElement('td');
            nameTd.textContent = debtor.clientName;
            tr.appendChild(nameTd);

            const phoneTd = document.createElement('td');
            phoneTd.textContent = debtor.clientPhone;
            tr.appendChild(phoneTd);

            const remainingTd = document.createElement('td');
            remainingTd.textContent = `${debtor.remaining.toFixed(2)} ر.س`;
            tr.appendChild(remainingTd);

            const taskTd = document.createElement('td');
            taskTd.textContent = debtor.taskTitle;
            tr.appendChild(taskTd);

            const completionTd = document.createElement('td');
            completionTd.textContent = completionDateFormatted;
            tr.appendChild(completionTd);

            const actionTd = document.createElement('td');
            const link = document.createElement('a');
            link.href = '#';
            link.className = 'btn-whatsapp';
            link.dataset.url = whatsappUrl;
            link.title = 'إرسال مطالبة';
            const icon = document.createElement('i');
            icon.className = 'fab fa-whatsapp';
            link.appendChild(icon);
            actionTd.appendChild(link);
            tr.appendChild(actionTd);

            debtorsTableBody.appendChild(tr);
        });
        updateSortIcons('debtors', uiState.debtorSort);
    }

    // --- Event Handlers ---
    if(addTaskForm) addTaskForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const selectedClientId = addTaskClientChoices ? addTaskClientChoices.getValue(true) : null;
        if (!selectedClientId) {
            alert('يرجى اختيار عميل.');
            return;
        }
        
        const client = appData.clients.find(c => c.id === parseInt(selectedClientId));
        const newTask = {
            id: ++appData.lastTaskId,
            title: document.getElementById('task-title').value.trim(),
            clientId: parseInt(selectedClientId),
            clientName: client ? client.name : '',
            type: document.getElementById('task-type').value,
            price: parseFloat(document.getElementById('task-price').value) || 0,
            prepaid: parseFloat(document.getElementById('task-prepaid').value) || 0,
            deadline: document.getElementById('task-deadline').value,
            status: TASK_STATUS.NEW,
            lastStatusUpdate: null
        };

        appData.tasks.push(newTask);
        await saveData();
        
        const tr = createTaskRow(newTask);
        tasksTableBody.insertBefore(tr, tasksTableBody.firstChild);
        renderDashboard();
        renderDebtorsTable();
        closeModal(taskModal);
    });

    if(tasksTableBody) tasksTableBody.addEventListener('change', async (e) => {
        if (e.target.matches('.editable-input, .editable-select')) {
            const input = e.target;
            const tr = input.closest('tr');
            if (!tr) return;

            const taskId = parseInt(tr.dataset.taskId);
            const task = appData.tasks.find(t => t.id === taskId);
            if (!task) return;

            const field = input.dataset.field;
            let value;

            if (field === 'clientId') {
                const choicesInstance = taskTableRowChoicesInstances.get(taskId);
                value = choicesInstance ? parseInt(choicesInstance.getValue(true)) : task.clientId;
            } else {
                value = (input.type === 'number') ? parseFloat(input.value) : input.value;
            }

            if (task[field] === value) return; // No change

            if (field === 'status' && task.status !== value) {
                task.lastStatusUpdate = new Date().toISOString();
            }
            if (field === 'clientId') {
                const selectedClient = appData.clients.find(c => c.id === value);
                task.clientName = selectedClient ? selectedClient.name : '';
            }

            task[field] = value;
            await saveData();

            updateTaskRow(task);
            if (['status', 'price', 'prepaid', 'clientId'].includes(field)) {
                renderDashboard();
                renderDebtorsTable();
            }
        }
    });

    if(tasksTableBody) tasksTableBody.addEventListener('click', async (e) => {
        const deleteButton = e.target.closest('.btn-delete[data-type="task"]');
        if (deleteButton) {
            const taskId = parseInt(deleteButton.closest('tr').dataset.taskId);
            if (confirm('هل أنت متأكد من رغبتك في حذف هذه المهمة؟')) {
                appData.tasks = appData.tasks.filter(t => t.id !== taskId);
                await saveData();
                removeTaskRow(taskId);
                renderDashboard();
                renderDebtorsTable();
            }
        }
    });

    if(debtorsTableBody) debtorsTableBody.addEventListener('click', (e) => {
        const whatsappBtn = e.target.closest('.btn-whatsapp');
        if (whatsappBtn) {
            e.preventDefault();
            const url = whatsappBtn.dataset.url;
            if (url) window.api.openExternalLink(url);
        }
    });

    if(importClientsBtn) importClientsBtn.addEventListener('click', async () => {
        const result = await window.api.openVcfDialog();
        if (!result.canceled && result.content) {
            parseVcf(result.content);
        }
    });
    
    if(exportClientsBtn) exportClientsBtn.addEventListener('click', async () => {
        if (appData.clients.length === 0) return alert('لا يوجد عملاء لتصديرهم.');
        let vcfContent = '';
        appData.clients.forEach(client => {
            vcfContent += `BEGIN:VCARD\nVERSION:3.0\nFN:${client.name}\nTEL;TYPE=CELL:${client.phone}\nEND:VCARD\n\n`
        });
        const result = await window.api.saveVcfFile(vcfContent);
        if (result.success) {
            alert('تم تصدير العملاء بنجاح!');
        } else if (!result.canceled) {
            alert(`فشل تصدير الملف: ${result.error}`);
        }
    });

    // --- Client Management Logic ---
    if(addClientForm) addClientForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('new-client-name').value.trim();
        const phoneNum = document.getElementById('new-client-phone').value.trim();
        const countryCode = document.getElementById('new-client-country-code').value;

        if (!name || !phoneNum) return alert('يرجى ملء اسم العميل ورقم الهاتف.');
        
        const fullPhone = `${countryCode}${phoneNum.replace(/^0+/, '')}`; // Remove leading zeros from phone number

        if (appData.clients.some(c => c.phone === fullPhone)) {
            return alert('هذا الرقم موجود بالفعل لعميل آخر.');
        }

        const newClient = { id: ++appData.lastClientId, name, phone: fullPhone };
        appData.clients.push(newClient);
        await saveData();
        
        addClientForm.reset();
        renderClientsManagementTable();
        renderClientsList();
    });
    
    if(clientsManagementTableBody) clientsManagementTableBody.addEventListener('change', async (e) => {
        if (e.target.matches('.client-editable-input')) {
            const input = e.target;
            const clientId = parseInt(input.closest('tr').dataset.clientId);
            const client = appData.clients.find(c => c.id === clientId);
            if (client) {
                const field = input.dataset.field;
                const value = input.value.trim();
                
                if (field === 'phone' && appData.clients.some(c => c.id !== clientId && c.phone === value)) {
                    alert('هذا الرقم موجود بالفعل لعميل آخر.');
                    input.value = client.phone; // Revert change
                    return;
                }

                client[field] = value;
                if (field === 'name') {
                    appData.tasks.forEach(t => {
                        if (t.clientId === clientId) t.clientName = value;
                    });
                }
                await saveData();
                renderAll(); // Full re-render is acceptable here as client data impacts many places
            }
        }
    });

    if(clientsManagementTableBody) clientsManagementTableBody.addEventListener('click', (e) => {
        if (e.target.closest('.btn-delete[data-type="client"]')) {
            const clientId = parseInt(e.target.closest('tr').dataset.clientId);
            if (appData.tasks.some(t => t.clientId === clientId)) {
                return alert('لا يمكن حذف هذا العميل لأنه مرتبط بمهام موجودة.');
            }
            if (confirm('هل أنت متأكد من رغبتك في حذف هذا العميل؟')) {
                appData.clients = appData.clients.filter(c => c.id !== clientId);
                saveData().then(renderAll);
            }
        }
    });

    // --- Filtering and Sorting Event Listeners ---
    if(taskSearchInput) taskSearchInput.addEventListener('input', (e) => { uiState.taskSearchTerm = e.target.value; renderTasksTable(); });
    if(filterButtonContainer) filterButtonContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-btn')) {
            filterButtonContainer.querySelector('.active')?.classList.remove('active');
            e.target.classList.add('active');
            uiState.taskStatusFilter = e.target.dataset.filter;
            renderTasksTable();
        }
    });
    if(taskTableHeaders) taskTableHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const field = header.dataset.field;
            if (uiState.taskSort.field === field) {
                uiState.taskSort.direction = uiState.taskSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                uiState.taskSort.field = field;
                uiState.taskSort.direction = 'asc';
            }
            renderTasksTable();
        });
    });
    if(debtorSearchInput) debtorSearchInput.addEventListener('input', (e) => { uiState.debtorSearchTerm = e.target.value; renderDebtorsTable(); });
    if(debtorTableHeaders) debtorTableHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const field = header.dataset.field;
            if (uiState.debtorSort.field === field) {
                uiState.debtorSort.direction = uiState.debtorSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                uiState.debtorSort.field = field;
                uiState.debtorSort.direction = 'asc';
            }
            renderDebtorsTable();
        });
    });

    // --- Helper Functions ---
    function escapeHtml(str) {
        if (str === undefined) return '';
        if (typeof str !== 'string') str = String(str);
        return str.replace(/[&<>"']/g, (match) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[match]));
    }
    
    function parseVcf(content) {
        // Handle folded lines according to the vCard spec ("\n " or "\r " indicate continuation)
        content = content.replace(/\r?\n[ \t]/g, '');

        const lines = content.split(/\r?\n/);
        let currentCard = null;
        let newClientsCount = 0;
        const errors = [];

        lines.forEach((rawLine, index) => {
            const line = rawLine.trim();
            if (!line) return; // Skip empty lines

            if (/^BEGIN:VCARD$/i.test(line)) {
                if (currentCard) {
                    errors.push(`بداية غير متوقعة لـ vCard عند السطر ${index + 1}`);
                }
                currentCard = { names: [], phones: [] };
                return;
            }

            if (/^END:VCARD$/i.test(line)) {
                if (!currentCard) {
                    errors.push(`نهاية vCard بدون بداية عند السطر ${index + 1}`);
                    return;
                }

                const name = currentCard.names[0];
                if (name && currentCard.phones.length > 0) {
                    currentCard.phones.forEach(phone => {
                        if (!appData.clients.some(c => c.phone === phone)) {
                            appData.clients.push({ id: ++appData.lastClientId, name, phone });
                            newClientsCount++;
                        }
                    });
                } else {
                    errors.push(`بيانات ناقصة في vCard انتهت عند السطر ${index + 1}`);
                }
                currentCard = null;
                return;
            }

            if (!currentCard) {
                errors.push(`بيانات خارج vCard عند السطر ${index + 1}: ${line}`);
                return;
            }

            // Handle name fields (FN or N)
            if (/^FN[:;]/i.test(line)) {
                const value = line.split(/:(.+)/)[1];
                if (value) {
                    currentCard.names.push(value.replace(/;+$/, '').trim());
                } else {
                    errors.push(`حقل FN فارغ عند السطر ${index + 1}`);
                }
                return;
            }

            if (/^N[:;]/i.test(line)) {
                const value = line.split(/:(.+)/)[1];
                if (value) {
                    const parts = value.split(';').filter(Boolean);
                    if (parts.length) {
                        currentCard.names.push(parts.join(' ').trim());
                    } else {
                        errors.push(`حقل N فارغ عند السطر ${index + 1}`);
                    }
                } else {
                    errors.push(`حقل N فارغ عند السطر ${index + 1}`);
                }
                return;
            }

            // Handle multiple telephone numbers
            if (/^TEL[:;]/i.test(line)) {
                const value = line.split(/:(.+)/)[1];
                if (value) {
                    const phone = value.replace(/[^+\d]/g, '');
                    if (phone) {
                        currentCard.phones.push(phone);
                    } else {
                        errors.push(`رقم هاتف غير صالح عند السطر ${index + 1}`);
                    }
                } else {
                    errors.push(`حقل TEL فارغ عند السطر ${index + 1}`);
                }
                return;
            }

            // Unknown or unsupported line; not necessarily an error but helpful for debugging
            errors.push(`سطر غير معروف تم تجاهله عند ${index + 1}: ${line}`);
        });

        if (currentCard) {
            errors.push('انتهى الملف بدون END:VCARD');
        }

        if (newClientsCount > 0) {
            saveData().then(renderAll);
            alert(`تم استيراد ${newClientsCount} عميل جديد بنجاح!`);
        } else {
            alert('لم يتم العثور على عملاء جدد للاستيراد (قد يكونون موجودين بالفعل).');
        }

        if (errors.length > 0) {
            console.warn('أخطاء أثناء تحليل ملف vCard:', errors.join('\n'));
        }
    }

    function populateClientsDropdown() {
        const selectElement = document.getElementById('task-client');
        const clientOptions = appData.clients.map(client => ({
            value: client.id,
            label: `${client.name} (${client.phone})`,
            selected: false,
        }));
        
        if (addTaskClientChoices) addTaskClientChoices.destroy();
        addTaskClientChoices = new Choices(selectElement, {
            removeItemButton: true, searchPlaceholderValue: "ابحث عن عميل...",
            noResultsText: 'لم يتم العثور على نتائج', itemSelectText: 'اضغط للاختيار',
        });
        addTaskClientChoices.setChoices(clientOptions, 'value', 'label', false);
    }
    
    function renderClientsManagementTable() {
        if(!clientsManagementTableBody) return;
        clientsManagementTableBody.innerHTML = '';
        if (appData.clients.length === 0) {
            clientsManagementTableBody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 20px;">لا يوجد عملاء.</td></tr>`;
            return;
        }
        const sortedClients = [...appData.clients].sort((a, b) => b.id - a.id);
        sortedClients.forEach(client => {
            const tr = document.createElement('tr');
            tr.dataset.clientId = client.id;

            const nameTd = document.createElement('td');
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.className = 'editable-input client-editable-input';
            nameInput.value = client.name;
            nameInput.dataset.field = 'name';
            nameTd.appendChild(nameInput);
            tr.appendChild(nameTd);

            const phoneTd = document.createElement('td');
            const phoneInput = document.createElement('input');
            phoneInput.type = 'text';
            phoneInput.className = 'editable-input client-editable-input';
            phoneInput.value = client.phone;
            phoneInput.dataset.field = 'phone';
            phoneTd.appendChild(phoneInput);
            tr.appendChild(phoneTd);

            const actionTd = document.createElement('td');
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-delete';
            deleteBtn.dataset.type = 'client';
            deleteBtn.title = 'حذف العميل';
            const icon = document.createElement('i');
            icon.className = 'fas fa-trash-alt';
            deleteBtn.appendChild(icon);
            actionTd.appendChild(deleteBtn);
            tr.appendChild(actionTd);

            clientsManagementTableBody.appendChild(tr);
        });
    }

    function populateCountryCodes() {
        const select = document.getElementById('new-client-country-code');
        if (!select || select.options.length > 1) return;
        const codes = { "السعودية": "+966", "مصر": "+20", "الإمارات": "+971", "الكويت": "+965", "الأردن": "+962" };
        for (const country in codes) {
            const option = document.createElement('option');
            option.value = codes[country];
            option.textContent = `${country} (${codes[country]})`;
            if (country === "السعودية") option.selected = true;
            select.appendChild(option);
        }
    }

    function getTaskSortValue(task, field) {
        switch (field) {
            case 'clientId':
                const client = appData.clients.find(c => c.id === task.clientId);
                return client ? client.name.toLowerCase() : '';
            case 'remaining':
                return (task.price || 0) - (task.prepaid || 0);
            case 'deadline':
                return new Date(task.deadline).getTime();
            default:
                const value = task[field];
                return (typeof value === 'string') ? value.toLowerCase() : value;
        }
    }

    function updateSortIcons(tableId, sortState) {
        const headers = document.querySelectorAll(`#${tableId} thead th[data-sort]`);
        headers.forEach(header => {
            const icon = header.querySelector('.sort-icon');
            if(!icon) return;
            header.classList.remove('sorted-asc', 'sorted-desc');
            icon.classList.remove('fa-sort-up', 'fa-sort-down');
            if (header.dataset.field === sortState.field) {
                icon.classList.add(sortState.direction === 'asc' ? 'fa-sort-up' : 'fa-sort-down');
                header.classList.add(sortState.direction === 'asc' ? 'sorted-asc' : 'sorted-desc');
            }
        });
    }

    // --- Initial Load ---
    loadData();
});