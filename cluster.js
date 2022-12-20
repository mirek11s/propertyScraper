import * as fs from "fs";
import vanillaPuppeteer from "puppeteer";
import Stealth from "puppeteer-extra-plugin-stealth";
import { Cluster } from "puppeteer-cluster";
import { addExtra } from "puppeteer-extra";
import { delay, urls, getDateString } from "./constants.js";

(async () => {
  const puppeteer = addExtra(vanillaPuppeteer);
  puppeteer.use(Stealth());

  const cluster = await Cluster.launch({
    puppeteer,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    maxConcurrency: 100,
    concurrency: Cluster.CONCURRENCY_PAGE,
    monitor: true,
    puppeteerOptions: {
      headless: true,
      defaultViewport: false,
      userDataDir: "./tmp",
    },
    timeout: 43200000, //12h to timeout
  });

  // handle on error in one of the pages so it does not crash the script
  cluster.on("taskerror", (err, data) => {
    console.log(`Error crawling ${data}: ${err.message}`);
  });

  let list = [];
  await cluster.task(async ({ page, data: url }) => {
    await page.goto(url);

    let isNextBtnExist = true;
    while (isNextBtnExist) {
      await page.waitForSelector(
        ".list-simple__output.js-list-simple__output > .announcement-container"
      );
      const offerContainer = await page.$$(
        ".list-simple__output.js-list-simple__output > .announcement-container"
      );

      // capture all prices and descriptions from the unpaid container
      for (const offer of offerContainer) {
        let price = "";
        let textDescription = "";
        let category = "";
        let tagObject = {};

        try {
          price = await page.evaluate(
            (el) =>
              el.querySelector(
                "div.list-announcement-block > div.announcement-block-link.announcement-block__link > div"
              ).textContent,
            offer
          );
        } catch (e) {}

        try {
          textDescription = await page.evaluate(
            (el) =>
              el.querySelector(
                "div.list-announcement-block > div.announcement-block-text.announcement-block__text > div > div.announcement-block__date"
              ).textContent,
            offer
          );
        } catch (error) {}

        // return second span of the div
        try {
          category = await page.evaluate((el) => {
            const spanElements = el.querySelectorAll(
              ".announcement-block__breadcrumbs > span"
            );
            const secondSpan = spanElements[1];
            return secondSpan.textContent;
          }, offer);
        } catch (error) {}

        const clearedPrice = price.replace(/\s+/g, " ").trim();
        // replace . with ,
        const newPrice = clearedPrice.replace(/\./g, ",");
        const clearTextDescription = textDescription
          .replace(/\s+/g, " ")
          .trim();

        // open the new tab to take the information from the whole advert
        // Scroll to the offer element on the page
        await page.evaluate((offer) => {
          offer.scrollIntoView();
        }, offer);

        // find the link in the offer advert and then open newTab using it
        const contentLink = await page.evaluate((offer) => {
          const anchor = offer.querySelector("a");
          const href = anchor.getAttribute("href");
          return href;
        }, offer);

        const page2 = await page.browser().newPage();
        await page2.goto(`https://www.bazaraki.com${contentLink}`);

        await page2.bringToFront();

        const summaryContainer = await page2.$(".chars-column");

        if (summaryContainer) {
          const lists = await summaryContainer.$$("li");
          for (const list of lists) {
            try {
              const listText = await page2.evaluate(
                (span) => span.textContent,
                list
              );
              const clearedText = listText.replace(/\s+/g, " ").trim();
              // create object out of the string ('Area: 95 m²') and push to the list:
              const [key, value] = clearedText.split(": ");
              tagObject[key] = value;
            } catch (error) {}
          }
          await delay(4000);
        }

        const newProperty = {
          price: newPrice,
          updatedOn: clearTextDescription,
          category: category,
          ...tagObject,
        };
        list.push(newProperty);
        await page2.close();
      }

      // check if button container exists and click next
      try {
        await page.waitForSelector(".number-list", { visible: true });
      } catch (error) {
        console.log(error);
      }

      const nextButton = await page.$(
        ".number-list-next.js-page-filter.number-list-line"
      );

      const isBtnExist = nextButton !== null;
      isNextBtnExist = isBtnExist;

      if (isBtnExist) {
        await nextButton.evaluate((b) => b.click());
        // wait for page to fully load
        await page.waitForNavigation({ waitUnitl: "networkidle2" });
        await delay(4000);
      }
    }

    const jsonList = JSON.stringify(list);
    fs.appendFile("data1.json", jsonList, function (err) {
      if (err) throw err;
    });
  });

  for (const url of urls) {
    await cluster.queue(url);
  }

  await cluster.idle();
  await cluster.close();
})();
