import * as fs from "fs";
import vanillaPuppeteer from "puppeteer";
import Stealth from "puppeteer-extra-plugin-stealth";
import { Cluster } from "puppeteer-cluster";
import { addExtra } from "puppeteer-extra";
import { delay, getDateString } from "./constants.js";

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
    timeout: 57600000, //16h to timeout
  });

  cluster.on("taskerror", (err, data) => {
    console.log(`Error crawling ${data}: ${err.message}`);
  });

  let list = [];
  const date = getDateString();
  await cluster.task(async ({ page, data: url }) => {
    await page.goto(url, { timeout: 0 });

    try {
      await page.waitForSelector("#langE");
    } catch (error) {}
    const englishLangBtn = await page.$("#langEn");
    await englishLangBtn.click();
    await page.waitForNavigation(); // Wait for the page to load after changing lang

    let isNextBtnExist = true;
    while (isNextBtnExist) {
      try {
        await page.waitForSelector("#AuctionsListDiv .AList-BoxContainer");
      } catch (error) {}
      const auctionsContainer = await page.$$("#AuctionsListDiv .AList-BoxContainer");
      for (const auction of auctionsContainer) {
        let date_of_conduct = "";
        let date_posted = "";
        let city = "";
        let district = "";
        let unique_code = "";
        let reserved_price = "";
        let status = "";
        let real_estate_type = "";
        let area_sq_m = "";
        let mortgage_lender_name = "";
        let notification_date = "";

        try {
          date_of_conduct = await page.evaluate(
            (el) =>
              el.querySelector("div.AList-BoxMainCnt > div.AList-BoxMainCell1 > div.DateIcon")
                .textContent,
            auction
          );
        } catch (e) {
          console.log(e);
        }

        try {
          const location = await page.evaluate(
            (el) =>
              el.querySelector(
                "div.AList-BoxMainCnt > div.AList-BoxMainCell4 > div.AList-BoxTextBlue"
              ).textContent,
            auction
          );
          const [townUnfiltered, neighbourhood] = location.split("Municipality");
          const [, town] = townUnfiltered.split(": ");
          city = town;
          district = neighbourhood;
        } catch (e) {}

        try {
          const diryPriceStr = await page.evaluate(
            (el) => el.querySelector("div.AList-Boxheader > div.AList-BoxheaderRight").textContent,
            auction
          );
          const clearedStr = diryPriceStr.replace(/\s+/g, " ").trim();
          const [, newPrice] = clearedStr.split(": ");
          reserved_price = newPrice.replace(/\./g, ",");
        } catch (e) {
          console.log(e);
        }

        //////////////////////////////////////////////////
        // find the link in the offer advert and then open newTab using it
        const contentLink = await page.evaluate((offer) => {
          const anchor = offer.querySelector(
            "div.AList-BoxFooter > div > div.AList-BoxFooterRight > a"
          );
          const href = anchor.getAttribute("href");
          return href;
        }, auction);

        const page2 = await page.browser().newPage();
        try {
          await page2.goto(`https://www.eauction-cy.com${contentLink}`, {
            timeout: 160000,
          });
          await page2.bringToFront();
          try {
            await page2.waitForSelector("#PropertyArea");
          } catch (error) {
            console.log(error);
          }
          try {
            const uniqueCodeElement = await page2.$(".AuctionDetailsDivR .ADetailsinput");
            unique_code = await page2.evaluate((el) => el.textContent, uniqueCodeElement);
          } catch (error) {
            console.log(error);
          }
          try {
            date_posted = await page2.evaluate(() => {
              const dirtyDate = document.querySelector(".ADetailsinputDateOn").textContent;
              // specifies the pattern of the date in the string
              const dateRegex = /\d{2}\/\d{2}\/\d{4}/;
              const date = dirtyDate.match(dateRegex)[0];
              return date;
            });
          } catch (error) {
            console.log(error);
          }
          try {
            status = await page2.evaluate(() => {
              const div = document.querySelector(".StateValue");
              return div.textContent;
            });
          } catch (error) {
            console.log(error);
          }
          try {
            real_estate_type = await page2.evaluate(() => {
              return document.querySelector(
                "div.AuctionDetailsSection1 > div:nth-child(8) > label.ADetailsinput"
              ).textContent;
            });
          } catch (error) {
            console.log(error);
          }
          try {
            area_sq_m = await page2.evaluate(() => {
              return document.querySelector("#PropertyArea").textContent;
            });
          } catch (error) {
            console.log(error);
          }
          try {
            mortgage_lender_name = await page2.evaluate(() => {
              const dirtyLabel = document.querySelector(".ADetailsinput2Cell");
              const label = dirtyLabel.textContent;
              return label.replace(/\s+/g, " ").trim();
            });
          } catch (error) {
            console.log(error);
          }
          try {
            notification_date = await page2.evaluate(() => {
              return document.querySelector("#publishDate").textContent;
            });
          } catch (error) {
            console.log(error);
          }
          const scrapedData = {
            date_of_conduct,
            date_posted,
            city,
            district,
            unique_code,
            reserved_price,
            status,
            real_estate_type,
            area_sq_m,
            mortgage_lender_name,
            notification_date,
          };
          // filter the list to check if current unique_code already exist and if it does, dont push it to avoid duplicates
          const existsInList = list.some((obj) => obj.unique_code === unique_code);
          if (!existsInList) {
            list.push(scrapedData);
            const jsonList = JSON.stringify(scrapedData) + ",";
            fs.appendFileSync(`eAuctionCy_${date}.json`, jsonList, function (err) {
              if (err) throw err;
            });
          }
          await delay(3000);
          await page2.close();
          await delay(3000);
        } catch {
          await page2.close();
        }
      }

      try {
        const element = await page.$("div.AList-GridPageNext");
        // Get the execution context for the element
        const executionContext = await element.executionContext();
        // Scroll the element into view
        await executionContext.evaluate(
          (element) => element.scrollIntoView({ behavior: "smooth", block: "end" }),
          element
        );
        await element.hover();

        const nextButton = await page.$("#pagerNext");
        const styleAttribute = await page.$eval("#pagerNext", (el) => el.getAttribute("style"));
        console.log(styleAttribute);

        isNextBtnExist = styleAttribute.includes("pointer");
        if (isNextBtnExist) {
          await nextButton.click();
          await delay(4000);
        }
      } catch (error) {
        console.log(error);
      }
    }
  });

  const urls = ["https://www.eauction-cy.com/Home/HlektronikoiPleistiriasmoi"];
  for (const url of urls) {
    await cluster.queue(url);
  }

  await cluster.idle();
  await cluster.close();
  // adding the array brackets at the end of the script
  const fileData = fs.readFileSync(`eAuctionCy_${date}.json`, "utf8");
  const newData = "[" + fileData + "]";
  fs.writeFileSync(`eAuctionCy_${date}.json`, newData, "utf8");
})();
