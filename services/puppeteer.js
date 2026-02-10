const puppeteer = require('puppeteer');
require('dotenv').config('../.env');

(async (currency) => {
    // 1. Tarayıcıyı Başlat
    const browser = await puppeteer.launch({
        headless: false, // Arka planda çalışması için true, görmek için false yapabilirsiniz
        defaultViewport: { width: 1340, height: 900 }, // Çıktı çözünürlüüğ
        // args: [
        //     '--no-sandbox',
        // ]
    });
    
    const page = await browser.newPage();

    // 2. Cookie'leri Tanımla (Giriş Yapmış Gibi Davranmak İçin)
    // Domain'in '.tradingview.com' olduğundan emin olun.
    const cookies = [
        {
            name: 'sessionid',
            value: process.env.TRADINGVIEW_SESSION_ID, 
            domain: '.tradingview.com',
            path: '/',
            httpOnly: true,
            secure: true
        },
        {
            name: 'sessionid_sign',
            value: process.env.TRADINGVIEW_SESSION_ID_SIGN,
            domain: '.tradingview.com',
            path: '/',
            httpOnly: true,
            secure: true
        }
    ];

    // 3. Cookie'leri Tarayıcıya Enjekte Et
    await page.setCookie(...cookies);

    // 4. Hedef Grafik URL'sine Git
    // Örnek: https://tr.tradingview.com/chart/M3C0dE/?symbol=BINANCE%3ABTCUSDT
    const chartUrl = 'https://tr.tradingview.com/chart/ASXc6cgm?symbol=' + encodeURIComponent(currency); 
    
    console.log('Grafiğe gidiliyor...');
    await page.goto(chartUrl);

    const closeWarningSelector = '#overlap-manager-root > div:nth-child(2) > div > div.wrap-VeoIyDt4 > div > div > div.modal-AIyNn2YU.radius-AIyNn2YU.dialog-VeoIyDt4.dialog-aRAWUDhF.rounded-aRAWUDhF > div > div.closeButtonWrapper-AIyNn2YU > button';

        // Uyarı penceresi varsa kapat
    try {
        await page.waitForSelector(closeWarningSelector, { timeout: 5000 });
        await page.click(closeWarningSelector);
        console.log('Uyarı penceresi kapatıldı.');
    } catch (e) {
        console.log('Uyarı penceresi bulunamadı veya zaman aşımına uğradı.');
    }

    const toastsContainer = "#overlap-manager-root > div";
    try {
        await page.waitForSelector(toastsContainer, { timeout: 5000 });
        await page.evaluate((selector) => {
            const toasts = document.querySelector(selector);
            if (toasts) {
                toasts.style.display = 'none';
                console.log('Toast mesajları gizlendi.');
            }
        }, toastsContainer);
    } catch (e) {
        console.log('Toast mesajları bulunamadı veya zaman aşımına uğradı.');
    }

    // 5. Grafiğin Tam Yüklenmesini Bekle
    // Grafik mumlarının bulunduğu ana canvas elementinin yüklenmesini bekleriz.
    try {        

        await new Promise(r => setTimeout(r, 4000));
        // // --- YENİ EKLENEN KISIM: GRAFİĞİ SÜRÜKLEME ---
        console.log('Grafik sola sürükleniyor...');
        
        // Ekranın ortasını hesapla
        const viewport = page.viewport();
        const startX = viewport.width / 3;
        const startY = viewport.height / 2;

        // Fareyi ortaya getir ve tıkla
        await page.mouse.move(startX, startY);
        await page.mouse.down();

        // Fareyi sola doğru sürükle (Örn: 400 piksel sola)
        // steps: 10 hareketi daha doğal yapar ve TradingView'in algılamasını sağlar
        await page.mouse.move(startX - 200, startY, { steps: 100 }); 
        
        // Fareyi bırak
        await page.mouse.up();
        
    } catch (e) {
        console.log(e);
        console.log('Zaman aşımı veya seçici bulunamadı.');
    }

    // 6. İstenmeyen Elementleri Gizle (Opsiyonel)
    // Örneğin sağdaki izleme listesini veya alttaki paneli gizlemek isterseniz CSS manipülasyonu yapabilirsiniz.
    /*
    await page.evaluate(() => {
        const watchlist = document.querySelector('.js-widget-watchlist');
        if(watchlist) watchlist.style.display = 'none';
    });
    */

    // 7. Ekran Görüntüsünü Al ve Kaydet
    // const selector = 'body > div.js-rootresizer__contents > div > div.layout__area--center.unselectable > div.chart-container.single-visible.top-full-width-chart.active > div.chart-container-border > div > div.chart-markup-table > div:nth-child(1) > div.chart-markup-table.pane > div > canvas:nth-child(3)';
    // const element = await page.$(selector);
    // if(element) {
    //     await element.screenshot({ path: 'tradingview_grafik.png' });
    // } else {
    //     console.log(`Grafik alanı ('${selector}') bulunamadı, tam sayfa ekran görüntüsü alınıyor.`);
    //     await page.screenshot({ path: 'tradingview_grafik.png', fullPage: false });
    // }

    // console.log('Ekran görüntüsü kaydedildi: tradingview_grafik.png');

    // await browser.close();
})("BINANCE:BTCUSDT");

// module.exports = { getChartImage };