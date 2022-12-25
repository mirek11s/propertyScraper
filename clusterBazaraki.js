import * as fs from "fs";
import vanillaPuppeteer from "puppeteer";
import Stealth from "puppeteer-extra-plugin-stealth";
import { Cluster } from "puppeteer-cluster";
import { addExtra } from "puppeteer-extra";
import { delay, urlsBazaraki, getDateString } from "./constants.js";

(async () => {
  const puppeteer = addExtra(vanillaPuppeteer);
  puppeteer.use(Stealth());

  const cluster = await Cluster.launch({
    puppeteer,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    maxConcurrency: 2,
    concurrency: Cluster.CONCURRENCY_PAGE,
    monitor: true,
    puppeteerOptions: {
      headless: true,
      defaultViewport: false,
      userDataDir: "./tmp",
    },
    timeout: 86400000, //24h to timeout
  });

  // handle on error in one of the pages so it does not crash the script
  cluster.on("taskerror", (err, data) => {
    console.log(`Error crawling ${data}: ${err.message}`);
  });

  let list = [];
  const date = getDateString();
  await cluster.task(async ({ page, data: url }) => {
    await page.goto(url, { timeout: 0 });

    const isDailyScrape = process.argv.find((arg) => arg.startsWith("--today"))?.split("=")[1];
    let isAdFromToday = false;
    let isNextBtnExist = true;
    while (isNextBtnExist) {
      try {
        await page.waitForSelector(
          ".list-simple__output.js-list-simple__output > .announcement-container"
        );
      } catch (error) {}
      const offerContainer = await page.$$(
        ".list-simple__output.js-list-simple__output > .announcement-container"
      );

      // capture all prices and descriptions from the unpaid container
      for (const offer of offerContainer) {
        let price = "";
        let textDescription = "";
        let category = "";
        let adId = "";
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
            const spanElements = el.querySelectorAll(".announcement-block__breadcrumbs > span");
            const secondSpan = spanElements[1];
            return secondSpan.textContent;
          }, offer);
        } catch (error) {}

        const clearedPrice = price.replace(/\s+/g, " ").trim();
        // replace . with ,
        const newPrice = clearedPrice.replace(/\./g, ",");
        const clearTextDescription = textDescription.replace(/\s+/g, " ").trim();

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
        try {
          await page2.goto(`https://www.bazaraki.com${contentLink}`, {
            timeout: 160000,
          });

          await page2.bringToFront();

          try {
            adId = await page2.evaluate(() => {
              return document.querySelector(".number-announcement > span").textContent;
            });
          } catch (error) {}

          const summaryContainer = await page2.$(".chars-column");

          if (summaryContainer) {
            const lists = await summaryContainer.$$("li");
            for (const list of lists) {
              try {
                const listText = await page2.evaluate((span) => span.textContent, list);
                const clearedText = listText.replace(/\s+/g, " ").trim();
                // create object out of the string ('Area: 95 m²') and push to the list:
                const [key, value] = clearedText.split(": ");
                tagObject[key] = value;
              } catch (error) {}
            }
            await delay(4000);
          }

          const newProperty = {
            adId,
            price: newPrice,
            updatedOn: clearTextDescription,
            category: category,
            ...tagObject,
          };

          // filter the list to check if current adId already exist and if it does, dont push it to avoid duplicates
          const existsInList = list.some((obj) => obj.adId === adId);
          isAdFromToday = clearTextDescription.includes("Today");

          if (!existsInList && !isDailyScrape) {
            list.push(newProperty);
            const jsonList = JSON.stringify(newProperty) + ",";
            fs.appendFileSync(`bazaraki_${date}.json`, jsonList, function (err) {
              if (err) throw err;
            });
          } else if (!existsInList && isDailyScrape && isAdFromToday) {
            // if the script is run with --today=true, write to file only today's posts
            list.push(newProperty);
            const jsonList = JSON.stringify(newProperty) + ",";
            fs.appendFileSync(`bazaraki_${date}.json`, jsonList, function (err) {
              if (err) throw err;
            });
          }

          await page2.close();
          await delay(1000);
        } catch {
          await page2.close();
        }
      }

      // check if button container exists and click next
      try {
        await page.waitForSelector(".number-list", { visible: true });
      } catch (error) {
        console.log(error);
      }

      const nextButton = await page.$(".number-list-next.js-page-filter.number-list-line");
      isNextBtnExist = nextButton !== null;

      // detect if the next ad is not from today and stop the search
      if (isDailyScrape && !isAdFromToday) {
        isNextBtnExist = false;
      }

      if (isNextBtnExist) {
        await nextButton.evaluate((b) => b.click());
        // wait for page to fully load
        await page.waitForNavigation({ waitUnitl: "networkidle2" });
        await delay(2000);
      }
    }
  });

  for (const url of urlsBazaraki) {
    await cluster.queue(url);
  }

  await cluster.idle();
  await cluster.close();

  // adding the array brackets at the end of the script
  const fileData = fs.readFileSync(`bazaraki_${date}.json`, "utf8");
  const newData = "[" + fileData + "]";
  fs.writeFileSync(`bazaraki_${date}.json`, newData, "utf8");
})();
