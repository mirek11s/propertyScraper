import * as fs from 'fs';
import vanillaPuppeteer from 'puppeteer';
import Stealth from 'puppeteer-extra-plugin-stealth';
import { Cluster } from 'puppeteer-cluster';
import { addExtra } from 'puppeteer-extra';
import { delay, PET_HOSPITALS_URLS, getDateString } from './constants.js';

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

  const date = getDateString();
  const nameStr = `pet_hospitals_germany_${date}.json`;

  await cluster.task(async ({ page, data: url }) => {
    await page.goto(url, { timeout: 0 });

    try {
      await page.waitForSelector('.content-page > .bl_counter');
    } catch (error) {
      console.log(error);
    }

    // array of strings containing all the hrefs
    const hrefs = await page.$$eval('.bl_counter a', (links) => links.map((link) => link.href));

    // loop the city by alphabet and open each one
    for (const href of hrefs) {
      await page.goto(href);
      await delay(1000);
      try {
        await page.waitForSelector('.content-page');
      } catch (error) {
        console.log(error);
      }

      // get all cities for this letter and loop them
      const cityHrefs = await page.$$eval('ul.ul-horizontal.marked li a', (links) =>
        links.map((link) => link.href)
      );

      for (const cityHref of cityHrefs) {
        await page.goto(cityHref);
        await delay(1000);
        try {
          await page.waitForSelector('.content-page');
        } catch (error) {
          console.log(error);
        }

        let list = [];
        let isNextBtnExist = true;
        let veterinaryClinics = [];
        while (isNextBtnExist) {
          // check if pagination exists
          const element = await page.$('.bl_counter.counter-stadt');
          if (element === null) {
            isNextBtnExist = false;
          }

          // fetch all clinics under this page
          const currentPageClinics = await page.$$eval('a.tov-bold', (links) =>
            links.map((link) => link.href)
          );
          veterinaryClinics.push(...currentPageClinics);
          await delay(2000);

          if (element) {
            // get the next button
            const elementHandles = await page.$$('.page-item a');
            const lastElementHandle = elementHandles[elementHandles.length - 1];

            let buttonText = '';
            try {
              buttonText = await page.evaluate((el) => el.textContent, lastElementHandle);
            } catch {}
            if (buttonText !== 'weiter') {
              isNextBtnExist = false;
              break;
            }

            // Click on the lastElementHandle if its textContent is 'weiter'
            await lastElementHandle.click();
            await delay(1000);
            try {
              await page.waitForSelector('.content-page');
            } catch (error) {
              console.log(error);
            }
          }
        }

        let header = '';
        let subHeader = '';
        let contactOptions = {};

        // loop all veterinary clinics under this city and extract the data
        for (const veterinaryClinic of veterinaryClinics) {
          await page.goto(veterinaryClinic);
          await delay(1000);
          try {
            await page.waitForSelector('.TopTierarzt');
          } catch (error) {
            console.log(error);
          }

          try {
            header = await page.evaluate(() => {
              const element = document.querySelector('.tov-top-header');
              return element ? element.textContent : ''; // check if the element exists
            });
          } catch (error) {}

          try {
            subHeader = await page.evaluate(() => {
              const element = document.querySelector('.tov-header-tier');
              return element ? element.textContent : '';
            });
          } catch (error) {}

          try {
            contactOptions = await page.evaluate(() => {
              let info = {};
              const dtElements = document.querySelectorAll('dl.dl-horizontal dt');
              const ddElements = document.querySelectorAll('dl.dl-horizontal dd');

              for (let i = 0; i < dtElements.length; i++) {
                let key = dtElements[i].textContent.trim();

                // Check if the key is 'Website:'
                if (key === 'Website:') {
                  // Get the href attribute of the a tag within the dd element
                  let value = ddElements[i].querySelector('a').getAttribute('href');
                  info[key] = value;
                } else {
                  let value = ddElements[i].textContent.replace(/\s+/g, ' ').trim();
                  info[key] = value;
                }
              }

              return info;
            });
          } catch {}

          const newUser = {
            header,
            subHeader,
            ...contactOptions,
          };

          list.push(newUser);
          const jsonList = JSON.stringify(newUser) + ',';
          fs.appendFileSync(nameStr, jsonList, function (err) {
            if (err) throw err;
          });
        }
      }
    }
  });

  for (const url of PET_HOSPITALS_URLS) {
    await cluster.queue(url);
  }

  await cluster.idle();
  await cluster.close();

  // adding the array brackets at the end of the script
  const fileData = fs.readFileSync(nameStr, 'utf8');
  const newData = '[' + fileData + ']';
  fs.writeFileSync(nameStr, newData, 'utf8');
})();
