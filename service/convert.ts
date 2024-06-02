import Chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

import * as Sentry from "@sentry/nextjs";
// Or just use puppeteer directly
// import puppeteer from 'puppeteer-core'

const isDev = process.env.NODE_ENV === 'development'

// Path to chrome executable on different platforms
const chromeExecutables = {
    linux: '/usr/bin/chromium-browser',
    win32: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
}

export const getOptions = async (isDev: boolean) => {

    // During development use local chrome executable
    if (isDev) {
        return {
            args: [],
            executablePath: chromeExecutables[process.platform] || chromeExecutables.linux,
            headless: false,

        }
    }
    let path = await Chromium.executablePath();
    // Else, use the path of chrome-aws-lambda and its args
    return {
        args: Chromium.args,
        executablePath: path,
        headless: Chromium.headless,
    }
}

export const getPdf = async (url: string, payload: any) => {

    // Start headless chrome instance
    const options = await getOptions(isDev)
    const browser = await puppeteer.launch(options)


    const page = await browser.newPage()
    await page.setRequestInterception(true);

    // Request intercept handler... will be triggered with 
    // each page.goto() statement
    page.once('request', async interceptedRequest => {

        // Here, is where you change the request method and 
        // add your post data
        console.info(`Intercepted URL ${interceptedRequest.url()}`)
        let data = {
            'method': 'POST',
            'postData': JSON.stringify(payload),
            'headers': {
                'Content-Type': 'application/json'
            }
        };



        // Request modified... finish sending! 
        interceptedRequest.continue(data);
        await page.setRequestInterception(false);

    });
    // Visit URL and wait until everything is loaded (available events: load, domcontentloaded, networkidle0, networkidle2)
    const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
    console?.info("Status Code =", response?.status())
    if (response && response.status() > 300) {
        throw new Error("Cannot render the Page correctly")
    }

    // Scroll to bottom of page to force loading of lazy loaded images
    await page.evaluate(async () => {
        await new Promise<void>((resolve) => {
            let totalHeight = 0
            const distance = 100
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight
                window.scrollBy(0, distance)
                totalHeight += distance

                if (totalHeight >= scrollHeight) {
                    clearInterval(timer)
                    resolve()
                }
            }, 5)
        })
    })

    // Tell Chrome to generate the PDF
    await page.emulateMediaType('screen')
    const buffer = await page.pdf({
        format: 'A4',
        displayHeaderFooter: false,
        headerTemplate: '',
        footerTemplate: '',
        printBackground: true,
        margin: { top: '25px', right: '25px', bottom: '25px', left: '25px' },
        scale: 0.95,
    })

    // Close chrome instance
    await browser.close()

    return buffer
}