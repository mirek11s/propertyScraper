import * as fs from "fs";
import vanillaPuppeteer from "puppeteer";
import Stealth from "puppeteer-extra-plugin-stealth";
import { Cluster } from "puppeteer-cluster";
import { addExtra } from "puppeteer-extra";
import { delay, klimaToMesitesUrls, klimaToMesitesRents, getDateString } from "./constants.js";

const scrapeInfiniteScrollItems = async (page, itemTargetCount) => {
  let items = [];
  while (itemTargetCount > items.length) {
    items = await page.$$("#myhome-listing > div");

    const previousHeight = await page.evaluate("document.body.scrollHeight");
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await delay(4000);

    const nextButton = await page.$(
      "#myhome-listing-grid > div > div.mh-layout__content-right > div.mh-search__more > button"
    );
    const isBtnExist = nextButton !== null;

    if (isBtnExist) {
      await nextButton.evaluate((b) => b.click());
      await delay(2000);
    }

    try {
      await page.waitForFunction(`document.body.scrollHeight > ${previousHeight}`);
    } catch (error) {}
  }

  return items;
};

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
      headless: false,
      defaultViewport: false,
      userDataDir: "./tmp",
    },
    timeout: 86400000, //24h to timeout
  });

  cluster.on("taskerror", (err, data) => {
    console.log(`Error crawling ${data}: ${err.message}`);
  });

  // --scrape=fullSales --scrape=rents
  let listAds = [];
  let urlsToScrape = klimaToMesitesUrls;
  const date = getDateString();
  const scrapeArgument = process.argv.find((arg) => arg.startsWith("--scrape"))?.split("=")[1];
  let nameStr = "";
  switch (scrapeArgument) {
    case "rents":
      nameStr = `klimaToMesites_rents_${date}.json`;
      urlsToScrape = klimaToMesitesRents;
      break;
    case "fullSales":
    default:
      nameStr = `klimaToMesites_full_${date}.json`;
      break;
  }

  await cluster.task(async ({ page, data: url }) => {
    await page.goto(url, { timeout: 0 });
    try {
      await page.waitForSelector("#myhome-listing-grid > div > div.mh-layout__content-right");
    } catch (error) {}

    // get the number of ads for the category
    let numberOfAds = 0;
    try {
      const adsFound = await page.evaluate(() => {
        const element = document.querySelector("div > ul > li.mh-search__results");
        return element.textContent.trim();
      });
      numberOfAds = parseInt(adsFound.match(/^\d+/)[0]);
    } catch (e) {
      console.log(e);
    }

    const itemsContainer = await scrapeInfiniteScrollItems(page, numberOfAds);

    for (const item of itemsContainer) {
      let title = "";
      let price = "";
      let keysObj = {};

      const contentLink = await page.evaluate((offer) => {
        const anchor = offer.querySelector("a.mh-thumbnail");
        const href = anchor.getAttribute("href");
        return href;
      }, item);

      const page2 = await page.browser().newPage();
      await page2.goto(contentLink, {
        timeout: 94000,
      });

      try {
        await page2.bringToFront();
        await page2.waitForSelector("#footer");
      } catch (error) {
        console.log(error);
      }

      try {
        title = await page2.evaluate(() =>
          document.querySelector("div.custom-header > h2").textContent.trim()
        );
      } catch (e) {
        console.log(e);
      }
      try {
        const extractedPrice = await page2.evaluate(() =>
          document.querySelector("div.custom-header > div.custom-price").textContent.trim()
        );
        price = extractedPrice.replace(/\./g, ",");
      } catch (e) {
        console.log(e);
      }

      const summaryContainer = await page2.$(".mh-estate__list__inner");
      if (summaryContainer) {
        const lists = await summaryContainer.$$("li");
        for (const list of lists) {
          try {
            const listText = await page2.evaluate((span) => span.textContent, list);
            const clearedText = listText.replace(/\s+/g, " ").trim();
            // create object out of the string ('Area: 95 m²') and push to the list:
            const [key, value] = clearedText.split(": ");
            keysObj[key] = value;
          } catch (error) {
            console.log(error);
          }
        }
        await delay(6000);
      }

      const newProperty = {
        title,
        price,
        ...keysObj,
      };

      const existsInList = listAds.some((obj) => obj["Ref. ID"] === keysObj["Ref. ID"]);

      if (!existsInList) {
        listAds.push(newProperty);
        const jsonList = JSON.stringify(newProperty) + ",";
        fs.appendFileSync(nameStr, jsonList, function (err) {
          if (err) throw err;
        });
      }

      await page2.close();
      await delay(6000);
    }
  });

  for (const url of urlsToScrape) {
    await cluster.queue(url);
  }

  await cluster.idle();
  await cluster.close();

  // adding the array brackets at the end of the script
  const fileData = fs.readFileSync(nameStr, "utf8");
  const newData = "[" + fileData + "]";
  fs.writeFileSync(nameStr, newData, "utf8");
})();
