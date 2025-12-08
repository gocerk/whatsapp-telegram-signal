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
    const chartUrl = 'https://tr.tradingview.com/chart/4atOlnQu?symbol=' + encodeURIComponent(currency); 
    
    console.log('Grafiğe gidiliyor...');
    await page.goto(chartUrl);

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
    const selector = 'body > div.js-rootresizer__contents > div';
    const element = await page.$(selector);
    if(element) {
        await element.screenshot({ path: 'tradingview_grafik.png' });
    } else {
        console.log(`Grafik alanı ('${selector}') bulunamadı, tam sayfa ekran görüntüsü alınıyor.`);
        await page.screenshot({ path: 'tradingview_grafik.png', fullPage: false });
    }

    console.log('Ekran görüntüsü kaydedildi: tradingview_grafik.png');

    // await browser.close();
})("FX:CADJPY");

// module.exports = { getChartImage };