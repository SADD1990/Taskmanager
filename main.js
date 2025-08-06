// main.js
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron'); // <-- الإضافة الجديدة
const path = require('path');
const fs = require('fs');

// المسار إلى ملف قاعدة البيانات JSON
const dbPath = path.join(app.getPath('userData'), 'data.json');
app.disableHardwareAcceleration();

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 940,
        minHeight: 600,
        show: false, // إخفاء النافذة عند الإنشاء لمنع الوميض
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        icon: path.join(__dirname, 'assets/icon.png') // يمكنك إضافة أيقونة هنا
    });

    // تكبير النافذة إلى حجم الشاشة الكامل
    mainWindow.maximize();
    // إظهار النافذة بعد أن تصبح جاهزة ومكبرة
    mainWindow.show();

    mainWindow.loadFile('index.html');
    // mainWindow.webContents.openDevTools(); // لإظهار أدوات المطور
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

// --- IPC Handlers (للتواصل مع واجهة المستخدم) ---

// قراءة البيانات من ملف JSON
ipcMain.handle('read-data', async () => {
    try {
        if (!fs.existsSync(dbPath)) {
            // إذا لم يكن الملف موجودًا، قم بإنشائه بمحتوى افتراضي
            fs.writeFileSync(dbPath, JSON.stringify({ clients: [], tasks: [] }));
        }
        const data = fs.readFileSync(dbPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Failed to read data:', error);
        return { clients: [], tasks: [] }; // إرجاع بيانات فارغة في حالة الخطأ
    }
});

// كتابة البيانات إلى ملف JSON
ipcMain.handle('write-data', async (event, data) => {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
        return { success: true };
    } catch (error) {
        console.error('Failed to write data:', error);
        return { success: false, error: error.message };
    }
});

// فتح نافذة لاختيار ملف VCF للاستيراد
ipcMain.handle('open-vcf-dialog', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
            { name: 'vCard Files', extensions: ['vcf'] }
        ]
    });

    if (canceled || filePaths.length === 0) {
        return { canceled: true };
    }

    try {
        const content = fs.readFileSync(filePaths[0], 'utf-8');
        return { canceled: false, content };
    } catch (error) {
        console.error('Failed to read VCF file:', error);
        return { canceled: true, error: error.message };
    }
});

// فتح نافذة لحفظ ملف VCF للتصدير
ipcMain.handle('save-vcf-file', async (event, content) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'حفظ ملف جهات الاتصال',
        defaultPath: 'clients.vcf',
        filters: [
            { name: 'vCard Files', extensions: ['vcf'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (canceled || !filePath) {
        return { canceled: true };
    }

    try {
        fs.writeFileSync(filePath, content, 'utf-8');
        return { success: true, path: filePath };
    } catch (error) {
        console.error('Failed to save VCF file:', error);
        return { success: false, error: error.message };
    }
});

// <-- بداية الإضافة الجديدة -->
// فتح رابط خارجي في المتصفح الافتراضي
ipcMain.handle('open-external-link', async (event, url) => {
    // التحقق من أن الرابط يبدأ بـ 'https://wa.me/' لزيادة الأمان
    if (url && url.startsWith('https://wa.me/')) {
        await shell.openExternal(url);
        return { success: true };
    }
    return { success: false, error: 'Invalid or insecure URL' };
});
// <-- نهاية الإضافة الجديدة -->