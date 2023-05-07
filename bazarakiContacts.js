import * as fs from 'fs';
import vanillaPuppeteer from 'puppeteer';
import Stealth from 'puppeteer-extra-plugin-stealth';
import { Cluster } from 'puppeteer-cluster';
import { addExtra } from 'puppeteer-extra';
import { delay, bazarakiUrlsAll, getDateString } from './constants.js';

(async () => {
  const puppeteer = addExtra(vanillaPuppeteer);
  puppeteer.use(Stealth());

  const cluster = await Cluster.launch({
    puppeteer,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    maxConcurrency: 2,
    concurrency: Cluster.CONCURRENCY_PAGE,
    monitor: true,
    puppeteerOptions: {
      headless: true,
      defaultViewport: false,
      userDataDir: './tmp',
    },
    timeout: 86400000, //24h to timeout
  });

  // handle on error in one of the pages so it does not crash the script
  cluster.on('taskerror', (err, data) => {
    console.log(`Error crawling ${data}: ${err.message}`);
  });

  let list = [];
  const date = getDateString();
  const nameStr = `bazaraki_contacts_${date}.json`;

  await cluster.task(async ({ page, data: url }) => {
    await page.goto(url, { timeout: 0 });

    let isNextBtnExist = true;
    while (isNextBtnExist) {
      try {
        await page.waitForSelector(
          '.list-simple__output.js-list-simple__output > .announcement-container'
        );
      } catch (error) {}

      const offerContainer = await page.$$(
        '.list-simple__output.js-list-simple__output > .announcement-container'
      );

      for (const offer of offerContainer) {
        let phoneNumber = '';
        let adAuthor = '';

        await page.evaluate((offer) => {
          offer.scrollIntoView();
        }, offer);

        // find the link in the offer advert and then open newTab using it
        const contentLink = await page.evaluate((offer) => {
          const anchor = offer.querySelector('a');
          const href = anchor.getAttribute('href');
          return href;
        }, offer);
        const page2 = await page.browser().newPage();

        try {
          await page2.goto(`https://www.bazaraki.com${contentLink}`, {
            timeout: 160000,
          });

          await page2.bringToFront();

          // solve the popup afer showing the phone number
          try {
            const showPhoneNumberBtn = await page2.$('.phone-author__subtext');
            await showPhoneNumberBtn.evaluate((b) => b.click());
            await delay(1000);

            let isModalHidden = null;
            try {
              isModalHidden = await page2.evaluate(() => {
                return document.querySelector('#ui-id-1') !== null;
              }, offer);
            } catch (e) {}

            if (!isModalHidden) {
              await delay(1000);
              const agreeBtn = await page2.$(
                '#ui-id-1 > div > button.terms-dialog__button.js-agree-terms-dialog'
              );
              agreeBtn && (await agreeBtn.evaluate((b) => b.click()));

              // Move the mouse to a location outside of the modal and click to close it
              await page2.mouse.click(0, 0);
            }

            try {
              phoneNumber = await page2.evaluate(() => {
                return document.querySelector('.phone-author__subtext > span').textContent.trim();
              });
            } catch (error) {}

            try {
              adAuthor = await page2.evaluate(() => {
                return document
                  .querySelector(
                    'div.list-announcement-right > div > div.author-info > div.author-name.js-online-user'
                  )
                  .textContent.trim();
              });
            } catch (error) {}
          } catch (error) {
            console.log(error);
          }

          const newUser = {
            phoneNumber,
            adAuthor,
          };

          // filter the list to check if current adId already exist and if it does, dont push it to avoid duplicates
          const existsInList = list.some((obj) => obj.phoneNumber === phoneNumber);

          if (!existsInList) {
            list.push(newUser);
            const jsonList = JSON.stringify(newUser) + ',';
            fs.appendFileSync(nameStr, jsonList, function (err) {
              if (err) throw err;
            });
          }

          await page2.close();
          await delay(1600);
        } catch {
          await page2.close();
        }
      }

      // check if button container exists and click next
      try {
        await page.waitForSelector('.number-list', { visible: true });
      } catch (error) {
        console.log(error);
      }

      const nextButton = await page.$('.number-list-next.js-page-filter.number-list-line');
      isNextBtnExist = nextButton !== null;

      if (isNextBtnExist) {
        await nextButton.evaluate((b) => b.click());
        // wait for page to fully load
        await page.waitForNavigation({ waitUnitl: 'networkidle2' });
        await delay(2000);
      }
    }
  });

  for (const url of bazarakiUrlsAll) {
    await cluster.queue(url);
  }

  await cluster.idle();
  await cluster.close();

  // adding the array brackets at the end of the script
  const fileData = fs.readFileSync(nameStr, 'utf8');
  const newData = '[' + fileData + ']';
  fs.writeFileSync(nameStr, newData, 'utf8');
})();
