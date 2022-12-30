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
    monitor: true,
    puppeteerOptions: {
      headless: true,
      defaultViewport: false,
      userDataDir: "./tmp",
    },
    timeout: 145200000,
  });

  // handle on error in one of the pages so it does not crash the script
  cluster.on("taskerror", (err, data) => {
    console.log(`Error crawling ${data}: ${err.message}`);
  });

  let list = [];
  const date = getDateString();

  await cluster.task(async ({ page, data: url }) => {
    // website sends hostile cookies that give us error 400
    page.on("response", async (response) => {
      if (response.status() === 400) {
        const cookies = await page.cookies();
        for (const cookie of cookies) {
          await page.deleteCookie(cookie);
        }
        await page.reload();
        await delay(20000);
      }
    });

    await page.goto(url, { timeout: 0 });

    let isNextBtnExist = true;
    while (isNextBtnExist) {
      // capture the website's aggressive popup
      await page.evaluate(() => {
        window.scrollBy(0, 1500);
      });

      try {
        await page.waitForSelector("#listing-swipers");
      } catch (error) {
        console.log(error);
      }
      const adsContainer = await page.$$(".bs-grid-item.bs-row-left.listing-simple");

      for (const ad of adsContainer) {
        let price_in_euro = "";
        let price_in_gbp = "";
        let category_name = "";
        let location = "";
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

        try {
          category_name = await page.evaluate(
            (el) =>
              el
                .querySelector(
                  "div.bs-content.bs-content-center.padding-top-20 > div.bs-card-title > a > span"
                )
                .textContent.trim(),
            ad
          );
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
          page2.on("response", async (response) => {
            if (response.status() === 400) {
              const cookies = await page2.cookies();
              for (const cookie of cookies) {
                await page2.deleteCookie(cookie);
              }
              await page2.reload();
              await delay(12000);
            }
          });

          await page2.goto(contentLink, {
            timeout: 94000,
          });

          try {
            await page2.bringToFront();
            await page2.waitForSelector("#listingcontent");
          } catch (error) {
            console.log(error);
          }

          try {
            location = await page2.evaluate(() =>
              document
                .querySelector(
                  "#listingcontent > div:nth-child(7) > div.bs-listing-info-header > div:nth-child(1) > div:nth-child(2)"
                )
                .textContent.trim()
            );
          } catch (e) {
            console.log(e);
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
                  const clearedListText = listText.trim();
                  others.push(clearedListText);
                  keyFeaturesObj["other_features"] = others.join(", ");
                }
              } catch (error) {}
            }
            await delay(10000);
          }

          const newProperty = {
            EURO: price_in_euro,
            GBP: price_in_gbp,
            Category: category_name,
            location,
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
          await delay(10000);
        } catch (error) {
          console.log("error comes from hereee: ", error);
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
        // await page.waitForNavigation({ waitUnitl: "networkidle2" });
        await delay(12000);
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
