const express = require('express');
const puppeteer = require('puppeteer');
const bodyParser = require('body-parser'); // Для парсинга тела запроса
const path = require('path'); // Для работы с путями

const app = express();
// Railway устанавливает порт через переменную окружения PORT
const port = process.env.PORT || 8080;

// Middleware для парсинга тела запроса как сырого HTML
// Увеличиваем лимит до 50MB, чтобы обрабатывать большие HTML
app.use(bodyParser.raw({ type: 'text/html', limit: '50mb' }));
// Middleware для парсинга JSON (если понадобится)
app.use(bodyParser.json());

// Простой GET-маршрут для проверки доступности сервиса
app.get('/', (req, res) => {
  res.send('PDF Converter Service is running!');
});

// Основной POST-маршрут для конвертации HTML в PDF
app.post('/convert-to-pdf', async (req, res) => {
  const htmlContent = req.body.toString(); // Получаем HTML из тела запроса

  if (!htmlContent) {
    console.error('Received empty HTML content.');
    return res.status(400).send('HTML content is required in the request body.');
  }

  let browser;
  try {
    console.log('Launching browser...');
    // Puppeteer при запуске попытается найти браузер.
    // Он может использовать тот, который установлен в системе,
    // или поставляется с самим пакетом puppeteer.
    // С Nixpacks + chromium package, мы обеспечим доступность бинарного файла.
    browser = await puppeteer.launch({
      headless: 'new', // Рекомендуется для современных версий
      args: [
        '--no-sandbox', // Важно для контейнеризированных сред (как Railway)
        '--disable-setuid-sandbox', // Часто используется с --no-sandbox
        // '--disable-extensions', // Может быть причиной проблем, но обычно не нужен
        '--disable-gpu', // Часто требуется в headless режиме
        '--disable-dev-shm-usage', // Важно для сред с ограниченной памятью
        '--disable-accelerated-2d-canvas',
        '--disable-gpu-rasterization',
      ],
      // executablePath: process.env.CHROMIUM_PATH || undefined, // Если PATH переменная не используется Puppeteer, можно указать явно. Но Nixpacks должен настроить PATH.
    });
    console.log('Browser launched successfully.');

    const page = await browser.newPage();
    // Устанавливаем контент и ждем, пока ресурсы (сеть) будут готовы.
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { // Опциональные поля
        bottom: '10mm',
        left: '10mm',
        right: '10mm',
        top: '10mm',
      },
      displayHeaderFooter: false, // Установите true, чтобы отображать заголовок/нижний колонтитул
    });

    // Устанавливаем заголовки для ответа PDF
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="telegram-doc-${Date.now()}.pdf"`, // Динамическое имя файла
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer); // Отправляем PDF

  } catch (error) {
    console.error('Error converting HTML to PDF:', error);
    // Отправляем детали ошибки клиенту, если возможно
    res.status(500).send(`Failed to convert HTML to PDF. Error: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed.');
    }
  }
});

// Запускаем сервер
app.listen(port, () => {
  console.log(`PDF Converter Service listening on port ${port}`);
  // Важно: Проверяем версию Node.js, которую сервис использует
  console.log(`Service running on Node.js version: ${process.version}`);
});
