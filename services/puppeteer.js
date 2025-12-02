const puppeteer = require('puppeteer');
require('dotenv').config('../.env');

(async (currency) => {
    // 1. Tarayıcıyı Başlat
    const browser = await puppeteer.launch({
        headless: true, // Arka planda çalışması için true, görmek için false yapabilirsiniz
        defaultViewport: { width: 1440, height: 900 }, // Çıktı çözünürlüğü
        args: ['--no-sandbox', '--disable-setuid-sandbox']
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
    await page.goto(chartUrl, { waitUntil: 'networkidle2' });

    // 5. Grafiğin Tam Yüklenmesini Bekle
    // Grafik mumlarının bulunduğu ana canvas elementinin yüklenmesini bekleriz.
    try {
        await page.waitForSelector('.chart-gui-wrapper', { timeout: 20000 });
        
        // Ekstra bekleme: İndikatörlerin ve verilerin tam çizilmesi için 2-3 saniye beklemek iyidir.
        await new Promise(r => setTimeout(r, 3000));
        
    } catch (e) {
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
    const element = await page.$('.layout__area--center'); // Orta alan (genellikle grafik)
    if(element) {
        await element.screenshot({ path: 'tradingview_grafik.png' });
    } else {
        console.log('Grafik alanı bulunamadı, tam sayfa ekran görüntüsü alınıyor.');
        await page.screenshot({ path: 'tradingview_grafik.png', fullPage: false });
    }

    console.log('Ekran görüntüsü kaydedildi: tradingview_grafik.png');

    await browser.close();
})("BINANCE:BTCUSDT");

// module.exports = { getChartImage };