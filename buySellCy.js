import * as fs from "fs";
import vanillaPuppeteer from "puppeteer";
import Stealth from "puppeteer-extra-plugin-stealth";
import { Cluster } from "puppeteer-cluster";
import { addExtra } from "puppeteer-extra";
import { delay, buySellUrls, getDateString } from "./constants.js";

(async () => {
  const puppeteer = addExtra(vanillaPuppeteer);
  puppeteer.use(Stealth());

  const cluster = await Cluster.launch({
    puppeteer,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    maxConcurrency: 1,
    concurrency: Cluster.CONCURRENCY_PAGE,
    // monitor: true,
    puppeteerOptions: {
      headless: false,
      defaultViewport: false,
      userDataDir: "./tmp",
    },
    timeout: 115200000, //32h to timeout
  });

  // handle on error in one of the pages so it does not crash the script
  cluster.on("taskerror", (err, data) => {
    console.log(`Error crawling ${data}: ${err.message}`);
  });

  let list = [];
  const date = getDateString();

  await cluster.task(async ({ page, data: url }) => {
    await page.goto(url, { timeout: 0 });

    let isNextBtnExist = true;
    while (isNextBtnExist) {
      try {
        await page.waitForSelector("#listing-swipers");
      } catch (error) {
        console.log(error);
      }
      const adsContainer = await page.$$(".bs-grid-item.bs-row-left.listing-simple");

      for (const ad of adsContainer) {
        let price_in_euro = "";
        let price_in_gbp = "";
        let keyFeaturesObj = {};

        try {
          price_in_euro = await page.evaluate(
            (el) =>
              el
                .querySelector(
                  "div.bs-card-info > div.bs-listing-price > div > span.bs-listing-info-price-base"
                )
                .textContent.trim(),
            ad
          );
        } catch (e) {
          console.log(e);
        }

        try {
          const britishPound = await page.evaluate(
            (el) =>
              el
                .querySelector(
                  "div.bs-card-info > div.bs-listing-price > div > span.bs-listing-info-price-sub"
                )
                .textContent.trim(),
            ad
          );
          // remove wrapping brackets from the price
          price_in_gbp = britishPound.replace(/[()]/g, "");
        } catch (e) {
          console.log(e);
        }

        //////////////////////////////////////////////////////////////////
        // find the link in the advert and then open newTab using it
        const contentLink = await page.evaluate((offer) => {
          const anchor = offer.querySelector(
            "div.bs-content.bs-content-center.padding-top-20 > div.bs-card-title > a"
          );
          const href = anchor.getAttribute("href");
          return href;
        }, ad);

        const page2 = await page.browser().newPage();
        try {
          await page2.goto(contentLink, {
            timeout: 160000,
          });
          await page2.bringToFront();
          try {
            await page2.waitForSelector("#listingcontent");
          } catch (error) {
            console.log(error);
          }

          const keyFeaturesContainer = await page2.$("#multi-column");
          if (keyFeaturesContainer) {
            const others = [];
            const lists = await keyFeaturesContainer.$$("li");
            for (const list of lists) {
              try {
                const listText = await page2.evaluate((span) => span.textContent, list);

                if (listText.includes(":")) {
                  const [key, value] = listText.split(": ");
                  keyFeaturesObj[key] = value;
                } else {
                  others.push(listText);
                  keyFeaturesObj["other_features"] = others.join(", ");
                }
              } catch (error) {}
            }
            await delay(4000);
          }

          const newProperty = {
            EURO: price_in_euro,
            GBP: price_in_gbp,
            ...keyFeaturesObj,
          };
          // filter the list to check if current adId already exist and if it does, dont push it to avoid duplicates
          const existsInList = list.some(
            (obj) => obj["Listing ID"] === keyFeaturesObj["Listing ID"]
          );
          if (!existsInList) {
            list.push(newProperty);
            const jsonList = JSON.stringify(newProperty) + ",";
            fs.appendFileSync(`buySellCy_${date}.json`, jsonList, function (err) {
              if (err) throw err;
            });
          }

          await page2.close();
          await delay(1000);
        } catch (error) {
          await page2.close();
          console.log(error);
        }
      }
      // check if button container exists and click next
      try {
        await page.waitForSelector("#results-paging > div.page-next > div:nth-child(1) > a", {
          visible: true,
        });
      } catch (error) {
        console.log(error);
      }
      const nextButton = await page.$("#results-paging > div.page-next > div:nth-child(1) > a");
      isNextBtnExist = nextButton !== null;
      if (isNextBtnExist) {
        await nextButton.evaluate((b) => b.click());
        // wait for page to fully load
        await page.waitForNavigation({ waitUnitl: "networkidle2" });
        await delay(2000);
      }
    }
  });

  for (const url of buySellUrls) {
    await cluster.queue(url);
  }

  await cluster.idle();
  await cluster.close();

  // adding the array brackets at the end of the script
  const fileData = fs.readFileSync(`buySellCy_${date}.json`, "utf8");
  const newData = "[" + fileData + "]";
  fs.writeFileSync(`buySellCy_${date}.json`, newData, "utf8");
})();
